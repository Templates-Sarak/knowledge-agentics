"""
scan_historico.py — Varre TODO o histórico Git (todos os commits e branches/tags) por vazamentos.

Detecta: (1) segredos por padrão em linhas adicionadas; (2) ARQUIVOS sensíveis já adicionados ao
histórico (.env, *.pem, id_rsa...); (3) opcional: tokens de ALTA ENTROPIA (segredos sem formato conhecido).
Para cada achado de segredo, anexa a(s) branch(es) que contêm o commit (best-effort).

Uso:
    python scan_historico.py --raiz . [--config config.json]

Retorno:
    JSON {total, achados_conteudo, arquivos_sensiveis_historico, achados_entropia}. Segredos mascarados.

Regras (CLAUDE.md): zero hardcoded (padrões/limites no config.json), segredos mascarados,
responsabilidade única (apenas detecta no histórico — a reescrita/rotação é decisão com HITL).
"""
import argparse
import json
import math
import re
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

TOKEN = re.compile(r"[A-Za-z0-9+/=_\-]{16,}")


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def git(raiz: Path, *args) -> str:
    try:
        r = subprocess.run(["git", "-C", str(raiz), *args],
                           capture_output=True, text=True, encoding="utf-8", errors="ignore")
    except FileNotFoundError:
        sys.exit("Erro: git nao encontrado no ambiente.")
    if r.returncode != 0:
        sys.exit(f"Erro git ({' '.join(args)}): {r.stderr.strip()} (a raiz e um repo Git?)")
    return r.stdout


def mascarar(trecho: str) -> str:
    trecho = trecho.strip()
    return "****" if len(trecho) <= 8 else f"{trecho[:4]}...{trecho[-2:]}"


def entropia_shannon(s: str) -> float:
    if not s:
        return 0.0
    freq = {c: s.count(c) for c in set(s)}
    return -sum((n / len(s)) * math.log2(n / len(s)) for n in freq.values())


def varrer_conteudo(log: str, padroes, cfg) -> tuple:
    achados, entropia = [], []
    commit, arquivo = None, None
    usar_entropia = cfg.get("entropia_ativa", False)
    ent_min = cfg.get("entropia_min", 4.2)
    tok_min = cfg.get("token_min_len", 24)
    for linha in log.splitlines():
        if linha.startswith("commit "):
            commit = linha.split()[1][:10]
        elif linha.startswith("+++ b/"):
            arquivo = linha[6:]
        elif linha.startswith("+") and not linha.startswith("+++"):
            conteudo = linha[1:]
            casou = False
            for tipo, regex in padroes:
                m = regex.search(conteudo)
                if m:
                    achados.append({"commit": commit, "arquivo": arquivo, "tipo": tipo,
                                    "trecho_mascarado": mascarar(m.group(0))})
                    casou = True
                    break
            if usar_entropia and not casou:
                for tok in TOKEN.findall(conteudo):
                    if len(tok) >= tok_min and entropia_shannon(tok) >= ent_min:
                        entropia.append({"commit": commit, "arquivo": arquivo,
                                         "trecho_mascarado": mascarar(tok), "confianca": "baixa"})
                        break
    return achados, entropia


def arquivos_sensiveis_no_historico(raiz: Path, sensiveis, permitidos) -> list:
    saida = git(raiz, "log", "--all", "--diff-filter=A", "--name-only", "--pretty=format:@@@%h")
    achados, commit = [], None
    for linha in saida.splitlines():
        linha = linha.strip()
        if linha.startswith("@@@"):
            commit = linha[3:]
        elif linha:
            nome = Path(linha).name
            if any(fnmatch(nome, p) for p in permitidos):
                continue
            if any(fnmatch(nome, p) for p in sensiveis):
                achados.append({"commit": commit, "arquivo": linha})
    return achados


def branches_por_commit(raiz: Path, commits) -> dict:
    mapa = {}
    for c in commits:
        if not c:
            continue
        saida = git(raiz, "branch", "-a", "--contains", c)
        mapa[c] = [b.strip(" *") for b in saida.splitlines() if b.strip()]
    return mapa


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Scanner de vazamentos no historico Git completo.")
    parser.add_argument("--raiz", default=".", help="Raiz do repositorio Git")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    args = parser.parse_args()

    try:
        config = carregar_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Erro: config nao encontrado em '{args.config}'.")
    except json.JSONDecodeError as erro:
        sys.exit(f"Erro: config invalido ({erro}).")

    raiz = Path(args.raiz)
    padroes = [(tipo, re.compile(rx)) for tipo, rx in config["padroes"].items()]

    log = git(raiz, "log", "--all", "-p", "--no-color")
    achados, entropia = varrer_conteudo(log, padroes, config)

    # branch best-effort só para os commits com achado de segredo
    commits = {a["commit"] for a in achados}
    mapa = branches_por_commit(raiz, commits)
    for a in achados:
        a["branches"] = mapa.get(a["commit"], [])

    sensiveis = arquivos_sensiveis_no_historico(
        raiz, config.get("arquivos_sensiveis", []), config.get("arquivos_permitidos", []))

    resultado = {
        "total": len(achados) + len(sensiveis) + len(entropia),
        "achados_conteudo": achados,
        "arquivos_sensiveis_historico": sensiveis,
        "achados_entropia": entropia,
    }
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
