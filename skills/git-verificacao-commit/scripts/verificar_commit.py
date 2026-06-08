"""
verificar_commit.py — Gate rápido: varre o que está STAGED por segredos e arquivos sensíveis.

Uso (manual ou via pre-commit hook):
    python verificar_commit.py [--raiz .] [--config config.json]

Saída:
    JSON {bloqueado, achados_segredo, arquivos_sensiveis}. Segredos mascarados.
    **Exit code 1** se houver qualquer achado (faz o pre-commit hook BLOQUEAR o commit); 0 se limpo.

Regras (CLAUDE.md): zero hardcoded (padrões/listas no config.json), segredos mascarados,
responsabilidade única (só o commit atual/staged — histórico é da git-especialista-repositorio).
"""
import argparse
import json
import re
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path


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


def varrer_segredos(diff: str, padroes) -> list:
    achados, arquivo = [], None
    for linha in diff.splitlines():
        if linha.startswith("+++ b/"):
            arquivo = linha[6:]
        elif linha.startswith("+") and not linha.startswith("+++"):
            for tipo, regex in padroes:
                m = regex.search(linha[1:])
                if m:
                    achados.append({"arquivo": arquivo, "tipo": tipo, "trecho_mascarado": mascarar(m.group(0))})
                    break
    return achados


def varrer_arquivos(arquivos, sensiveis, permitidos) -> list:
    achados = []
    for caminho in arquivos:
        nome = Path(caminho).name
        if any(fnmatch(nome, p) for p in permitidos):
            continue
        if any(fnmatch(nome, p) for p in sensiveis):
            achados.append(caminho)
    return achados


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Gate de segredos do commit staged.")
    parser.add_argument("--raiz", default=".")
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

    diff = git(raiz, "diff", "--cached", "--unified=0", "--no-color")
    arquivos = [a for a in git(raiz, "diff", "--cached", "--name-only", "--diff-filter=ACM").splitlines() if a]

    achados_segredo = varrer_segredos(diff, padroes)
    arquivos_sensiveis = varrer_arquivos(arquivos, config.get("arquivos_sensiveis", []), config.get("arquivos_permitidos", []))

    bloqueado = bool(achados_segredo or arquivos_sensiveis)
    print(json.dumps({
        "bloqueado": bloqueado,
        "achados_segredo": achados_segredo,
        "arquivos_sensiveis": arquivos_sensiveis,
    }, ensure_ascii=False, indent=2))
    sys.exit(1 if bloqueado else 0)


if __name__ == "__main__":
    main()
