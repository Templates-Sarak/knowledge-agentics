"""
validate.py — valida código Python contra os limiares objetivos do padrao-escrita.

Uso:
    python validate.py <arquivo-ou-pasta> [--config config.json]

Retorno (stdout):
    JSON { "alvo": <path>, "violacoes": [ {caminho, linha, dimensao, severidade, risco,
    descricao, regra, confianca} ] } — formato consumível pelo code-diagnostico.

Detecta (mecânico, via stdlib `ast`): limiares (tamanho de função, aninhamento, nº de parâmetros),
logging (print / exceção engolida), tipagem (assinatura pública sem anotação), segredos (literal em
nome sensível) e hardcoded heurístico (número mágico / URL) — este marcado com confianca "baixa".

Regras (CLAUDE.md): zero hardcoded (limiares/allowlists/padrões vêm do config.json), zero segredos,
responsabilidade única (só valida e emite JSON — não corrige).
"""
import argparse
import ast
import json
import sys
from pathlib import Path


def carregar_config(caminho_config: str) -> dict:
    """Lê os parâmetros externos. Nada hardcoded no código."""
    return json.loads(Path(caminho_config).read_text(encoding="utf-8"))


def _violacao(caminho, linha, dimensao, severidade, risco, descricao, regra, confianca="alta") -> dict:
    return {
        "caminho": caminho, "linha": linha, "dimensao": dimensao, "severidade": severidade,
        "risco": risco, "descricao": descricao, "regra": regra, "confianca": confianca,
    }


def _eh_publica(nome: str) -> bool:
    return not nome.startswith("_")


def _conta_params(args: ast.arguments, ignorar: list) -> int:
    todos = args.posonlyargs + args.args + args.kwonlyargs
    nomes = [a.arg for a in todos if a.arg not in ignorar]
    return len(nomes)


def _profundidade(no: ast.AST, atual: int = 0) -> int:
    """Maior profundidade de aninhamento de blocos de controle dentro de `no`."""
    blocos = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith, ast.Try)
    maxd = atual
    for filho in ast.iter_child_nodes(no):
        prox = atual + 1 if isinstance(filho, blocos) else atual
        maxd = max(maxd, _profundidade(filho, prox))
    return maxd


class Visitante(ast.NodeVisitor):
    def __init__(self, caminho: str, config: dict):
        self.caminho = caminho
        self.cfg = config
        self.violacoes: list = []

    # --- funções: limiares + tipagem ---
    def _checar_funcao(self, no):
        nome = no.name
        # tamanho
        if no.end_lineno and (no.end_lineno - no.lineno + 1) > self.cfg["maxFunctionLines"]:
            self.violacoes.append(_violacao(
                self.caminho, no.lineno, "limiares", "media", "medio",
                f"função '{nome}' com {no.end_lineno - no.lineno + 1} linhas",
                f"função <= {self.cfg['maxFunctionLines']} linhas"))
        # parâmetros
        nparams = _conta_params(no.args, self.cfg["ignoreParamNames"])
        if nparams > self.cfg["maxParams"]:
            self.violacoes.append(_violacao(
                self.caminho, no.lineno, "limiares", "media", "baixo",
                f"função '{nome}' com {nparams} parâmetros",
                f"<= {self.cfg['maxParams']} parâmetros"))
        # aninhamento
        prof = _profundidade(no)
        if prof > self.cfg["maxNesting"]:
            self.violacoes.append(_violacao(
                self.caminho, no.lineno, "limiares", "media", "medio",
                f"função '{nome}' com aninhamento de {prof} níveis",
                f"aninhamento <= {self.cfg['maxNesting']} (use guard clauses)"))
        # tipagem (só pública)
        if _eh_publica(nome):
            sem_ret = no.returns is None
            params = no.args.posonlyargs + no.args.args + no.args.kwonlyargs
            sem_param = any(a.annotation is None for a in params if a.arg not in self.cfg["ignoreParamNames"])
            if sem_ret or sem_param:
                self.violacoes.append(_violacao(
                    self.caminho, no.lineno, "tipagem", "baixa", "baixo",
                    f"função pública '{nome}' sem anotação de tipo completa",
                    "tipar assinaturas públicas (api/contrato)"))

    def visit_FunctionDef(self, no):
        self._checar_funcao(no)
        self.generic_visit(no)

    def visit_AsyncFunctionDef(self, no):
        self._checar_funcao(no)
        self.generic_visit(no)

    # --- logging: print / exceção engolida ---
    def visit_Call(self, no):
        if isinstance(no.func, ast.Name) and no.func.id == "print":
            self.violacoes.append(_violacao(
                self.caminho, no.lineno, "logging", "media", "baixo",
                "uso de print()", "usar logger estruturado, sem print"))
        self.generic_visit(no)

    def visit_ExceptHandler(self, no):
        corpo_vazio = len(no.body) == 1 and isinstance(no.body[0], ast.Pass)
        if no.type is None or corpo_vazio:
            self.violacoes.append(_violacao(
                self.caminho, no.lineno, "logging", "media", "baixo",
                "exceção engolida (except amplo ou corpo vazio)",
                "não engolir exceção; tratar/registrar explicitamente"))
        self.generic_visit(no)

    # --- segredos + hardcoded heurístico ---
    def visit_Assign(self, no):
        alvo_nomes = [t.id for t in no.targets if isinstance(t, ast.Name)]
        valor = no.value
        if isinstance(valor, ast.Constant):
            self._checar_literal(no.lineno, alvo_nomes, valor.value)
        self.generic_visit(no)

    def _checar_literal(self, linha, nomes, valor):
        # segredo: nome sensível com literal não-vazio
        for nome in nomes:
            baixo = nome.lower()
            if any(p in baixo for p in self.cfg["secretNamePatterns"]) and isinstance(valor, str) and valor:
                self.violacoes.append(_violacao(
                    self.caminho, linha, "segredos", "alta", "baixo",
                    f"possível segredo embutido em '{nome}'",
                    "segredos em .env (prefixado por módulo), nunca no código"))
                return
        if not self.cfg.get("hardcodedHeuristic"):
            return
        # hardcoded heurístico (baixa confiança)
        eh_constante = all(n.isupper() for n in nomes) and nomes  # UPPER_CASE = constante aceitável
        if isinstance(valor, (int, float)) and not isinstance(valor, bool):
            if valor not in self.cfg["allowedMagicNumbers"] and not eh_constante:
                self.violacoes.append(_violacao(
                    self.caminho, linha, "hardcoded", "baixa", "baixo",
                    f"número mágico {valor!r}", "valores de config em config.json", confianca="baixa"))
        elif isinstance(valor, str):
            if any(valor.startswith(p) for p in self.cfg["urlLikePrefixes"]):
                self.violacoes.append(_violacao(
                    self.caminho, linha, "hardcoded", "media", "baixo",
                    f"URL/host embutido {valor!r}", "URLs/hosts em config.json/.env", confianca="baixa"))


def validar_arquivo(caminho: Path, config: dict) -> list:
    try:
        arvore = ast.parse(caminho.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError) as erro:
        return [_violacao(str(caminho), 0, "parse", "alta", "baixo",
                          f"não foi possível parsear: {erro}", "arquivo Python válido")]
    v = Visitante(str(caminho), config)
    v.visit(arvore)
    return v.violacoes


def coletar_arquivos(alvo: Path, skip_dirs: list) -> list:
    if alvo.is_file():
        return [alvo] if alvo.suffix == ".py" else []
    skip = set(skip_dirs)
    return [p for p in alvo.rglob("*.py") if not skip.intersection(p.parts)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida código Python contra os limiares do padrão.")
    parser.add_argument("alvo", help="Arquivo .py ou pasta a validar")
    parser.add_argument("--config", default=str(Path(__file__).with_name("config.json")),
                        help="Caminho do config.json (padrão: ao lado do script)")
    args = parser.parse_args()

    # Saída sempre em UTF-8, independe da codepage do console (ex.: cp1252 no Windows).
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    config = carregar_config(args.config)
    alvo = Path(args.alvo)
    violacoes = []
    for arquivo in coletar_arquivos(alvo, config["skipDirs"]):
        violacoes.extend(validar_arquivo(arquivo, config))

    print(json.dumps({"alvo": str(alvo), "violacoes": violacoes}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
