"""
detectar_lixo.py — Detecta detritos de projeto: arquivos de lixo, marcadores de debug e arquivos grandes.

Uso:
    python detectar_lixo.py --raiz . [--config config.json]

Retorno:
    JSON com {arquivos_lixo, marcadores, arquivos_grandes}.

Regras (CLAUDE.md): zero hardcoded (limites/padrões no config.json),
responsabilidade única (apenas detecta — a remoção é decisão com HITL).
"""
import argparse
import json
import sys
from fnmatch import fnmatch
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def eh_ignorado(caminho: Path, ignorar_dirs) -> bool:
    return any(parte in ignorar_dirs for parte in caminho.parts)


def detectar_arquivos_lixo(raiz, padroes_nome, dirs_lixo, ignorar_dirs) -> list:
    achados = []
    for caminho in raiz.rglob("*"):
        if eh_ignorado(caminho, ignorar_dirs):
            continue
        if caminho.is_dir() and caminho.name in dirs_lixo:
            achados.append(str(caminho))
        elif caminho.is_file() and any(fnmatch(caminho.name, p) for p in padroes_nome):
            achados.append(str(caminho))
    return achados


def detectar_marcadores(raiz, marcadores, extensoes, ignorar_dirs) -> list:
    achados = []
    for caminho in raiz.rglob("*"):
        if not caminho.is_file() or eh_ignorado(caminho, ignorar_dirs):
            continue
        if extensoes and caminho.suffix not in extensoes:
            continue
        try:
            linhas = caminho.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        for num, linha in enumerate(linhas, start=1):
            for marcador in marcadores:
                if marcador in linha:
                    achados.append({"arquivo": str(caminho), "linha": num, "marcador": marcador})
    return achados


def detectar_grandes(raiz, limite, ignorar_dirs) -> list:
    achados = []
    for caminho in raiz.rglob("*"):
        if not caminho.is_file() or eh_ignorado(caminho, ignorar_dirs):
            continue
        try:
            tamanho = caminho.stat().st_size
        except OSError:
            continue
        if tamanho > limite:
            achados.append({"arquivo": str(caminho), "bytes": tamanho})
    return achados


def main() -> None:
    parser = argparse.ArgumentParser(description="Detector de detritos de projeto.")
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
    ignorar = set(config.get("ignorar_dirs", []))

    resultado = {
        "arquivos_lixo": detectar_arquivos_lixo(
            raiz, config.get("padroes_nome_lixo", []), set(config.get("dirs_lixo", [])), ignorar
        ),
        "marcadores": detectar_marcadores(
            raiz, config.get("marcadores", []), config.get("extensoes_codigo", []), ignorar
        ),
        "arquivos_grandes": detectar_grandes(
            raiz, config.get("tamanho_grande_bytes", 5000000), ignorar
        ),
    }
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
