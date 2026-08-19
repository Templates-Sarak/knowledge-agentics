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


def _violacao(
    caminho, linha, dimensao, severidade, risco, descricao, regra, confianca="alta"
) -> dict:
    return {
        "caminho": caminho,
        "linha": linha,
        "dimensao": dimensao,
        "severidade": severidade,
        "risco": risco,
        "descricao": descricao,
        "regra": regra,
        "confianca": confianca,
    }


def _eh_publica(nome: str) -> bool:
    return not nome.startswith("_")


def _conta_params(args: ast.arguments, ignorar: list) -> int:
    todos = args.posonlyargs + args.args + args.kwonlyargs
    nomes = [a.arg for a in todos if a.arg not in ignorar]
    return len(nomes)


def _profundidade(no: ast.AST, atual: int = 0) -> int:
    """Maior profundidade de aninhamento de blocos de controle dentro de `no`."""
    blocos = (
        ast.If,
        ast.For,
        ast.AsyncFor,
        ast.While,
        ast.With,
        ast.AsyncWith,
        ast.Try,
    )
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
        if (
            no.end_lineno
            and (no.end_lineno - no.lineno + 1) > self.cfg["maxFunctionLines"]
        ):
            self.violacoes.append(
                _violacao(
                    self.caminho,
                    no.lineno,
                    "limiares",
                    "media",
                    "medio",
                    f"função '{nome}' com {no.end_lineno - no.lineno + 1} linhas",
                    f"função <= {self.cfg['maxFunctionLines']} linhas",
                )
            )
        # parâmetros
        nparams = _conta_params(no.args, self.cfg["ignoreParamNames"])
        if nparams > self.cfg["maxParams"]:
            self.violacoes.append(
                _violacao(
                    self.caminho,
                    no.lineno,
                    "limiares",
                    "media",
                    "baixo",
                    f"função '{nome}' com {nparams} parâmetros",
                    f"<= {self.cfg['maxParams']} parâmetros",
                )
            )
        # aninhamento
        prof = _profundidade(no)
        if prof > self.cfg["maxNesting"]:
            self.violacoes.append(
                _violacao(
                    self.caminho,
                    no.lineno,
                    "limiares",
                    "media",
                    "medio",
                    f"função '{nome}' com aninhamento de {prof} níveis",
                    f"aninhamento <= {self.cfg['maxNesting']} (use guard clauses)",
                )
            )
        # tipagem (só pública)
        if _eh_publica(nome):
            sem_ret = no.returns is None
            params = no.args.posonlyargs + no.args.args + no.args.kwonlyargs
            sem_param = any(
                a.annotation is None
                for a in params
                if a.arg not in self.cfg["ignoreParamNames"]
            )
            if sem_ret or sem_param:
                self.violacoes.append(
                    _violacao(
                        self.caminho,
                        no.lineno,
                        "tipagem",
                        "baixa",
                        "baixo",
                        f"função pública '{nome}' sem anotação de tipo completa",
                        "tipar assinaturas públicas (api/contrato)",
                    )
                )

    def visit_FunctionDef(self, no):
        self._checar_funcao(no)
        self.generic_visit(no)

    def visit_AsyncFunctionDef(self, no):
        self._checar_funcao(no)
        self.generic_visit(no)

    # --- logging: print / exceção engolida ---
    def visit_Call(self, no):
        if isinstance(no.func, ast.Name) and no.func.id == "print":
            self.violacoes.append(
                _violacao(
                    self.caminho,
                    no.lineno,
                    "logging",
                    "media",
                    "baixo",
                    "uso de print()",
                    "usar logger estruturado, sem print",
                )
            )
        self.generic_visit(no)

    def visit_ExceptHandler(self, no):
        corpo_vazio = len(no.body) == 1 and isinstance(no.body[0], ast.Pass)
        if no.type is None or corpo_vazio:
            self.violacoes.append(
                _violacao(
                    self.caminho,
                    no.lineno,
                    "logging",
                    "media",
                    "baixo",
                    "exceção engolida (except amplo ou corpo vazio)",
                    "não engolir exceção; tratar/registrar explicitamente",
                )
            )
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
            if (
                any(p in baixo for p in self.cfg["secretNamePatterns"])
                and isinstance(valor, str)
                and valor
            ):
                self.violacoes.append(
                    _violacao(
                        self.caminho,
                        linha,
                        "segredos",
                        "alta",
                        "baixo",
                        f"possível segredo embutido em '{nome}'",
                        "segredos em .env (prefixado por módulo), nunca no código",
                    )
                )
                return
        if not self.cfg.get("hardcodedHeuristic"):
            return
        # hardcoded heurístico (baixa confiança)
        eh_constante = (
            all(n.isupper() for n in nomes) and nomes
        )  # UPPER_CASE = constante aceitável
        if isinstance(valor, (int, float)) and not isinstance(valor, bool):
            if valor not in self.cfg["allowedMagicNumbers"] and not eh_constante:
                self.violacoes.append(
                    _violacao(
                        self.caminho,
                        linha,
                        "hardcoded",
                        "baixa",
                        "baixo",
                        f"número mágico {valor!r}",
                        "valores de config em config.json",
                        confianca="baixa",
                    )
                )
        elif isinstance(valor, str):
            if any(valor.startswith(p) for p in self.cfg["urlLikePrefixes"]):
                self.violacoes.append(
                    _violacao(
                        self.caminho,
                        linha,
                        "hardcoded",
                        "media",
                        "baixo",
                        f"URL/host embutido {valor!r}",
                        "URLs/hosts em config.json/.env",
                        confianca="baixa",
                    )
                )


def validar_texto(caminho_str: str, texto: str, config: dict) -> list:
    """Núcleo: valida um TEXTO Python já lido contra `config`. Puro — não toca `fs`. É o que o
    `--autoteste` prova com fixtures em memória."""
    try:
        arvore = ast.parse(texto)
    except SyntaxError as erro:
        return [
            _violacao(
                caminho_str,
                0,
                "parse",
                "alta",
                "baixo",
                f"não foi possível parsear: {erro}",
                "arquivo Python válido",
            )
        ]
    v = Visitante(caminho_str, config)
    v.visit(arvore)
    return v.violacoes


def validar_arquivo(caminho: Path, config: dict) -> list:
    """Casca: lê o arquivo do disco e delega ao núcleo."""
    try:
        texto = caminho.read_text(encoding="utf-8")
    except UnicodeDecodeError as erro:
        return [
            _violacao(
                str(caminho),
                0,
                "parse",
                "alta",
                "baixo",
                f"não foi possível parsear: {erro}",
                "arquivo Python válido",
            )
        ]
    return validar_texto(str(caminho), texto, config)


def coletar_arquivos(alvo: Path, skip_dirs: list) -> list:
    if alvo.is_file():
        return [alvo] if alvo.suffix == ".py" else []
    skip = set(skip_dirs)
    return [p for p in alvo.rglob("*.py") if not skip.intersection(p.parts)]


def _config_fixture() -> dict:
    return {
        "maxFunctionLines": 3,
        "maxNesting": 2,
        "maxParams": 2,
        "ignoreParamNames": ["self", "cls"],
        "allowedMagicNumbers": [0, 1, -1, 2],
        "secretNamePatterns": ["password", "token"],
        "urlLikePrefixes": ["http://", "https://"],
        "hardcodedHeuristic": True,
    }


def autoteste() -> int:
    """Núcleo puro contra fixtures em memória — nenhuma linha toca `fs`."""
    falhas = []
    cfg = _config_fixture()

    def _tem(violacoes, dimensao):
        return any(v["dimensao"] == dimensao for v in violacoes)

    funcao_grande = (
        "def f(a, b, c):\n    x = 1\n    y = 2\n    z = 3\n    return x + y + z\n"
    )
    if not _tem(validar_texto("f.py", funcao_grande, cfg), "limiares"):
        falhas.append(
            "validar_texto deveria achar violacao de limiares (funcao/parametros grandes)"
        )

    # funcao curta (nao estoura maxFunctionLines/maxParams) so pra isolar a checagem de aninhamento
    cfg_aninhamento = dict(cfg, maxFunctionLines=10, maxParams=10)
    aninhado = "def f():\n if 1:\n  if 1:\n   if 1: pass\n"
    viol_aninhado = validar_texto("f.py", aninhado, cfg_aninhamento)
    if not any("aninhamento" in v["descricao"] for v in viol_aninhado):
        falhas.append(
            "validar_texto deveria achar violacao de aninhamento (3 niveis > limite 2)"
        )

    sem_tipo = "def publica(a):\n    return a\n"
    if not _tem(validar_texto("f.py", sem_tipo, cfg), "tipagem"):
        falhas.append(
            "validar_texto deveria achar violacao de tipagem em funcao publica sem anotacao"
        )

    com_print = "def publica(a: int) -> int:\n    print(a)\n    return a\n"
    if not _tem(validar_texto("f.py", com_print, cfg), "logging"):
        falhas.append("validar_texto deveria achar violacao de logging (print)")

    # Concatenado, nao literal: o texto de ORIGEM deste arquivo nao pode conter um segredo-
    # formato contiguo, senao o proprio scan de vazamentos do audit_base.py acha "vazamento"
    # que e so dado de teste (o mesmo cuidado do fixture em scan_segredos.py --autoteste).
    valor_secreto = "valor-bem" + "-secreto"
    segredo = f"token = '{valor_secreto}'\n"
    if not _tem(validar_texto("f.py", segredo, cfg), "segredos"):
        falhas.append(
            "validar_texto deveria achar violacao de segredos em nome sensivel"
        )

    magico = "limite = 777\n"
    if not _tem(validar_texto("f.py", magico, cfg), "hardcoded"):
        falhas.append(
            "validar_texto deveria achar violacao de hardcoded (numero magico)"
        )

    invalido = "def f(:\n"
    viol_parse = validar_texto("f.py", invalido, cfg)
    if len(viol_parse) != 1 or viol_parse[0]["dimensao"] != "parse":
        falhas.append(
            "validar_texto deveria reprovar com dimensao 'parse' em texto com SyntaxError"
        )

    limpo = "def publica(a: int) -> int:\n    return a\n"
    if validar_texto("f.py", limpo, cfg) != []:
        falhas.append(
            "validar_texto nao deveria achar nada em codigo dentro dos limiares"
        )

    for falha in falhas:
        print(f"  falha  {falha}")
    if falhas:
        print(f"autoteste (validate.py): {len(falhas)} falha(s)")
        return 1
    print("autoteste (validate.py): 7/7 ok")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Valida código Python contra os limiares do padrão."
    )
    parser.add_argument("alvo", nargs="?", help="Arquivo .py ou pasta a validar")
    parser.add_argument(
        "--config",
        default=str(Path(__file__).with_name("config.json")),
        help="Caminho do config.json (padrão: ao lado do script)",
    )
    parser.add_argument(
        "--autoteste", action="store_true", help="Roda a suite interna, nao toca disco"
    )
    args = parser.parse_args()

    if args.autoteste:
        sys.exit(autoteste())
    if not args.alvo:
        parser.error("o argumento 'alvo' e obrigatorio fora do --autoteste")

    # Saída sempre em UTF-8, independe da codepage do console (ex.: cp1252 no Windows).
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    config = carregar_config(args.config)
    alvo = Path(args.alvo)
    violacoes = []
    for arquivo in coletar_arquivos(alvo, config["skipDirs"]):
        violacoes.extend(validar_arquivo(arquivo, config))

    print(
        json.dumps(
            {"alvo": str(alvo), "violacoes": violacoes}, ensure_ascii=False, indent=2
        )
    )


if __name__ == "__main__":
    main()
