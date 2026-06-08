"""
auditar_assets.py — Auditoria determinística de performance frontend (entrada do diagnóstico).

Uso:
    python auditar_assets.py --raiz . [--config auditar_assets.config.json]

Retorno:
    JSON com {imagens_legadas, imagens_grandes, img_sem_dimensao, libs_pesadas}.

Regras (CLAUDE.md): zero hardcoded (extensões/limites/libs no config.json),
responsabilidade única (apenas detecta — a otimização é decisão com HITL nas skills de nível).
"""
import argparse
import json
import re
import sys
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def ignorar(caminho: Path, ignorar_dirs) -> bool:
    return any(parte in ignorar_dirs for parte in caminho.parts)


def auditar_imagens(raiz: Path, ext_legadas, ext_imagem, limite_grande, ignorar_dirs) -> tuple:
    legadas, grandes = [], []
    for caminho in raiz.rglob("*"):
        if not caminho.is_file() or ignorar(caminho, ignorar_dirs):
            continue
        suf = caminho.suffix.lower()
        try:
            tamanho = caminho.stat().st_size
        except OSError:
            continue
        if suf in ext_legadas:
            legadas.append({"arquivo": str(caminho), "bytes": tamanho})
        if suf in ext_imagem and tamanho > limite_grande:
            grandes.append({"arquivo": str(caminho), "bytes": tamanho})
    return legadas, grandes


def auditar_markup(raiz: Path, ext_markup, libs_pesadas, ignorar_dirs) -> tuple:
    sem_dim, libs = [], []
    tags_img = re.compile(r"<img\b[^>]*>", re.IGNORECASE | re.DOTALL)
    for caminho in raiz.rglob("*"):
        if not caminho.is_file() or ignorar(caminho, ignorar_dirs):
            continue
        if caminho.suffix.lower() not in ext_markup:
            continue
        try:
            texto = caminho.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for tag in tags_img.findall(texto):
            if "width" not in tag.lower() or "height" not in tag.lower():
                sem_dim.append({"arquivo": str(caminho), "trecho": " ".join(tag.split())[:120]})
        for num, linha in enumerate(texto.splitlines(), start=1):
            if "import" in linha or "require" in linha:
                for lib in libs_pesadas:
                    if lib in linha:
                        libs.append({"arquivo": str(caminho), "linha": num, "lib": lib})
                        break
    return sem_dim, libs


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Auditoria de assets/performance frontend.")
    parser.add_argument("--raiz", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "auditar_assets.config.json"))
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

    ignorar_dirs = set(config.get("ignorar_dirs", []))
    ext_legadas = {e.lower() for e in config.get("extensoes_imagem_legada", [])}
    ext_imagem = {e.lower() for e in config.get("extensoes_imagem", [])}
    ext_markup = {e.lower() for e in config.get("extensoes_markup", [])}

    legadas, grandes = auditar_imagens(raiz, ext_legadas, ext_imagem, config.get("tamanho_imagem_grande_bytes", 200000), ignorar_dirs)
    sem_dim, libs = auditar_markup(raiz, ext_markup, config.get("libs_pesadas", []), ignorar_dirs)

    resultado = {
        "imagens_legadas": legadas,
        "imagens_grandes": grandes,
        "img_sem_dimensao": sem_dim,
        "libs_pesadas": libs,
    }
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
