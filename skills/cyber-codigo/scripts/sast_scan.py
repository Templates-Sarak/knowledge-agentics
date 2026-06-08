"""
sast_scan.py — Análise estática (SAST) leve: detecta padrões de código inseguro.

Uso:
    python sast_scan.py --raiz . [--config config.json]

Retorno:
    JSON {total, achados:[{arquivo, linha, tipo, confianca, trecho}]}.
    Heurístico → cada achado é CANDIDATO; o agente triagem (especialmente `confianca: baixa`).

Regras (CLAUDE.md): zero hardcoded (padrões/confiança no config.json),
responsabilidade única (apenas detecta — a refatoração é decisão com HITL na skill).
"""
import argparse
import json
import re
import sys
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def compilar(padroes: dict) -> list:
    saida = []
    for tipo, cfg in padroes.items():
        saida.append((tipo, re.compile(cfg["regex"]), cfg.get("confianca", "media")))
    return saida


def listar_arquivos(raiz: Path, extensoes, ignorar_dirs):
    for caminho in raiz.rglob("*"):
        if not caminho.is_file() or any(p in ignorar_dirs for p in caminho.parts):
            continue
        if extensoes and caminho.suffix.lower() not in extensoes:
            continue
        yield caminho


def escanear(caminho: Path, padroes) -> list:
    try:
        linhas = caminho.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return []
    achados = []
    for num, linha in enumerate(linhas, start=1):
        for tipo, regex, conf in padroes:
            if regex.search(linha):
                achados.append({"arquivo": str(caminho), "linha": num, "tipo": tipo,
                                "confianca": conf, "trecho": linha.strip()[:140]})
    return achados


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="SAST leve por padroes.")
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
    if not raiz.exists():
        sys.exit(f"Erro: raiz '{raiz}' nao existe.")

    padroes = compilar(config["padroes"])
    ext = {e.lower() for e in config.get("extensoes", [])}
    achados = []
    for caminho in listar_arquivos(raiz, ext, set(config.get("ignorar_dirs", []))):
        achados.extend(escanear(caminho, padroes))

    print(json.dumps({"total": len(achados), "achados": achados}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
