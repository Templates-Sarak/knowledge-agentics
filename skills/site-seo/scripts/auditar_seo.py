"""
auditar_seo.py — Auditoria determinística de SEO técnico on-page.

Uso:
    python auditar_seo.py --raiz . [--config auditar_seo.config.json]

Retorno:
    JSON {robots_txt, sitemap_xml, paginas:[{arquivo, title, meta_description, og, twitter,
    jsonld, canonical, html_lang, imgs_sem_alt}]}.

Regras (CLAUDE.md): zero hardcoded (extensões/pastas no config.json),
responsabilidade única (apenas audita — a implementação/correção é com HITL na skill).
Nota: detecta tags em markup/HTML estático; metadados via API de framework (Next metadata) não
aparecem no fonte e exigem conferência manual ou auditoria no HTML buildado.
"""
import argparse
import json
import re
import sys
from pathlib import Path

PADROES = {
    "title": re.compile(r"<title[\s>]", re.IGNORECASE),
    "meta_description": re.compile(r'<meta[^>]+name=["\']description', re.IGNORECASE),
    "og": re.compile(r'property=["\']og:', re.IGNORECASE),
    "twitter": re.compile(r'name=["\']twitter:', re.IGNORECASE),
    "jsonld": re.compile(r'application/ld\+json', re.IGNORECASE),
    "canonical": re.compile(r'rel=["\']canonical', re.IGNORECASE),
    "html_lang": re.compile(r"<html[^>]+\blang=", re.IGNORECASE),
}
IMG_TAG = re.compile(r"<img\b[^>]*>", re.IGNORECASE | re.DOTALL)


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def ignorar(caminho: Path, ignorar_dirs) -> bool:
    return any(parte in ignorar_dirs for parte in caminho.parts)


def achar_arquivo(raiz: Path, pastas, nome) -> bool:
    for pasta in pastas:
        if (raiz / pasta / nome).is_file():
            return True
    return False


def auditar_pagina(texto: str) -> dict:
    pagina = {chave: bool(rx.search(texto)) for chave, rx in PADROES.items()}
    sem_alt = sum(1 for tag in IMG_TAG.findall(texto) if "alt" not in tag.lower())
    pagina["imgs_sem_alt"] = sem_alt
    return pagina


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Auditoria de SEO tecnico on-page.")
    parser.add_argument("--raiz", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "auditar_seo.config.json"))
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
    ext_markup = {e.lower() for e in config.get("extensoes_markup", [])}
    pastas = config.get("pastas_busca", ["."])

    paginas = []
    for caminho in raiz.rglob("*"):
        if not caminho.is_file() or ignorar(caminho, ignorar_dirs):
            continue
        if caminho.suffix.lower() not in ext_markup:
            continue
        try:
            texto = caminho.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        paginas.append({"arquivo": str(caminho), **auditar_pagina(texto)})

    resultado = {
        "robots_txt": achar_arquivo(raiz, pastas, config.get("arquivo_robots", "robots.txt")),
        "sitemap_xml": achar_arquivo(raiz, pastas, config.get("arquivo_sitemap", "sitemap.xml")),
        "paginas": paginas,
    }
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
