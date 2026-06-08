"""
scan_assinaturas.py — Detecta assinaturas/créditos de autoria não autorizados.

Uso:
    python scan_assinaturas.py --raiz . [--config config.json]

Retorno:
    JSON com {total, achados:[{arquivo, linha, trecho}]}.

Regras (CLAUDE.md): zero hardcoded (padrões e autorizados no config.json),
responsabilidade única (apenas detecta — a remoção/padronização é com HITL).
"""
import argparse
import json
import re
import sys
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def listar_arquivos(raiz: Path, extensoes, ignorar_dirs):
    for caminho in raiz.rglob("*"):
        if not caminho.is_file():
            continue
        if any(parte in ignorar_dirs for parte in caminho.parts):
            continue
        if extensoes and caminho.suffix not in extensoes:
            continue
        yield caminho


def tem_autorizado(linha: str, autorizados) -> bool:
    return any(nome.lower() in linha.lower() for nome in autorizados)


def escanear(caminho: Path, padroes, autorizados) -> list:
    try:
        linhas = caminho.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return []
    achados = []
    for num, linha in enumerate(linhas, start=1):
        for regex in padroes:
            if regex.search(linha) and not tem_autorizado(linha, autorizados):
                achados.append({"arquivo": str(caminho), "linha": num, "trecho": linha.strip()[:160]})
                break
    return achados


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Scanner de assinaturas nao autorizadas.")
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

    padroes = [re.compile(rx) for rx in config["padroes_assinatura"]]
    autorizados = config.get("autorizados", [])
    achados = []
    for caminho in listar_arquivos(raiz, config.get("extensoes", []), set(config.get("ignorar_dirs", []))):
        achados.extend(escanear(caminho, padroes, autorizados))

    print(json.dumps({"total": len(achados), "achados": achados}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
