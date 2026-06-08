"""
revisar_diff.py — Revisão determinística do que está STAGED (gate de QUALIDADE pré-commit).

Complementa a `git-verificacao-commit` (que é o gate de SEGREDOS). Aqui são marcadores de qualidade no
que está sendo commitado: conflito de merge não resolvido, breakpoint de debug, log de debug, marcador
pendente (TODO/FIXME). Rápido — só o diff staged, sem histórico.

Uso (manual ou via pre-commit hook):
    python revisar_diff.py [--raiz .] [--config config.json]

Saída:
    JSON {bloqueado, achados:[{arquivo, linha, tipo, severidade, trecho}]}.
    **Exit 1** se houver achado de severidade em `bloquear_em` (faz o pre-commit BLOQUEAR); 0 caso contrário.

Regras (CLAUDE.md): zero hardcoded (padrões/severidades no config.json),
responsabilidade única (só marcadores baratos do diff — a revisão de conformidade profunda é do agente).
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def staged_diff(raiz: Path) -> str:
    try:
        r = subprocess.run(["git", "-C", str(raiz), "diff", "--cached", "--unified=0", "--no-color"],
                           capture_output=True, text=True, encoding="utf-8", errors="ignore")
    except FileNotFoundError:
        sys.exit("Erro: git nao encontrado no ambiente.")
    if r.returncode != 0:
        sys.exit(f"Erro git diff: {r.stderr.strip()} (a raiz e um repo Git?)")
    return r.stdout


def compilar(padroes: dict) -> list:
    return [(tipo, re.compile(cfg["regex"]), cfg.get("severidade", "aviso")) for tipo, cfg in padroes.items()]


def analisar(diff: str, padroes) -> list:
    achados, arquivo = [], None
    for linha in diff.splitlines():
        if linha.startswith("+++ b/"):
            arquivo = linha[6:]
        elif linha.startswith("+") and not linha.startswith("+++"):
            conteudo = linha[1:]
            for tipo, regex, sev in padroes:
                if regex.search(conteudo):
                    achados.append({"arquivo": arquivo, "tipo": tipo, "severidade": sev,
                                    "trecho": conteudo.strip()[:120]})
                    break
    return achados


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Gate de qualidade do diff staged.")
    parser.add_argument("--raiz", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    args = parser.parse_args()

    try:
        config = carregar_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Erro: config nao encontrado em '{args.config}'.")
    except json.JSONDecodeError as erro:
        sys.exit(f"Erro: config invalido ({erro}).")

    padroes = compilar(config["padroes"])
    bloquear_em = set(config.get("bloquear_em", ["bloqueio"]))
    achados = analisar(staged_diff(Path(args.raiz)), padroes)
    bloqueado = any(a["severidade"] in bloquear_em for a in achados)

    print(json.dumps({"bloqueado": bloqueado, "achados": achados}, ensure_ascii=False, indent=2))
    sys.exit(1 if bloqueado else 0)


if __name__ == "__main__":
    main()
