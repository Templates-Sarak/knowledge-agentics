"""
audit_seo.py — Auditoria determinística de SEO técnico on-page.

Uso:
    python audit_seo.py --root . [--config audit_seo.config.json]

Retorno:
    JSON {robots_txt, sitemap_xml, pages:[{file, title, meta_description, og, twitter,
    jsonld, canonical, html_lang, imgs_without_alt}]}.

Regras (padrao-escrita): zero hardcoded (extensões/pastas no config.json),
responsabilidade única (apenas audita — a implementação/correção é com HITL na skill).
Nota: detecta tags em markup/HTML estático; metadados via API de framework (Next metadata) não
aparecem no fonte e exigem conferência manual ou auditoria no HTML buildado.
"""

import argparse
import json
import re
import sys
from pathlib import Path

PATTERNS = {
    "title": re.compile(r"<title[\s>]", re.IGNORECASE),
    "meta_description": re.compile(r'<meta[^>]+name=["\']description', re.IGNORECASE),
    "og": re.compile(r'property=["\']og:', re.IGNORECASE),
    "twitter": re.compile(r'name=["\']twitter:', re.IGNORECASE),
    "jsonld": re.compile(r"application/ld\+json", re.IGNORECASE),
    "canonical": re.compile(r'rel=["\']canonical', re.IGNORECASE),
    "html_lang": re.compile(r"<html[^>]+\blang=", re.IGNORECASE),
}
IMG_TAG = re.compile(r"<img\b[^>]*>", re.IGNORECASE | re.DOTALL)


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def is_ignored(path: Path, ignore_dirs) -> bool:
    return any(part in ignore_dirs for part in path.parts)


def find_file(root: Path, dirs, name) -> bool:
    for directory in dirs:
        if (root / directory / name).is_file():
            return True
    return False


def audit_page(text: str) -> dict:
    page = {key: bool(rx.search(text)) for key, rx in PATTERNS.items()}
    without_alt = sum(1 for tag in IMG_TAG.findall(text) if "alt" not in tag.lower())
    page["imgs_without_alt"] = without_alt
    return page


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Technical on-page SEO audit.")
    parser.add_argument("--root", default=".")
    parser.add_argument(
        "--config", default=str(Path(__file__).parent / "audit_seo.config.json")
    )
    args = parser.parse_args()

    try:
        config = load_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Error: config not found at '{args.config}'.")
    except json.JSONDecodeError as error:
        sys.exit(f"Error: invalid config ({error}).")

    root = Path(args.root)
    if not root.exists():
        sys.exit(f"Error: root '{root}' does not exist.")

    ignore_dirs = set(config.get("ignore_dirs", []))
    markup_ext = {e.lower() for e in config.get("markup_extensions", [])}
    dirs = config.get("search_dirs", ["."])

    pages = []
    for path in root.rglob("*"):
        if not path.is_file() or is_ignored(path, ignore_dirs):
            continue
        if path.suffix.lower() not in markup_ext:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        pages.append({"file": str(path), **audit_page(text)})

    result = {
        "robots_txt": find_file(root, dirs, config.get("robots_file", "robots.txt")),
        "sitemap_xml": find_file(root, dirs, config.get("sitemap_file", "sitemap.xml")),
        "pages": pages,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
