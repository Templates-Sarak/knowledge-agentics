"""
audit_assets.py — Auditoria determinística de performance frontend (entrada do diagnóstico).

Uso:
    python audit_assets.py --root . [--config audit_assets.config.json]

Retorno:
    JSON com {legacy_images, large_images, imgs_without_dimensions, heavy_libs}.

Regras (padrao-escrita): zero hardcoded (extensões/limites/libs no config.json),
responsabilidade única (apenas detecta — a otimização é decisão com HITL nas skills de nível).
"""

import argparse
import json
import re
import sys
from pathlib import Path


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def is_ignored(path: Path, ignore_dirs) -> bool:
    return any(part in ignore_dirs for part in path.parts)


def audit_images(root: Path, legacy_ext, image_ext, large_limit, ignore_dirs) -> tuple:
    legacy, large = [], []
    for path in root.rglob("*"):
        if not path.is_file() or is_ignored(path, ignore_dirs):
            continue
        suffix = path.suffix.lower()
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if suffix in legacy_ext:
            legacy.append({"file": str(path), "bytes": size})
        if suffix in image_ext and size > large_limit:
            large.append({"file": str(path), "bytes": size})
    return legacy, large


def audit_markup(root: Path, markup_ext, heavy_libs, ignore_dirs) -> tuple:
    without_dims, libs = [], []
    img_tags = re.compile(r"<img\b[^>]*>", re.IGNORECASE | re.DOTALL)
    for path in root.rglob("*"):
        if not path.is_file() or is_ignored(path, ignore_dirs):
            continue
        if path.suffix.lower() not in markup_ext:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for tag in img_tags.findall(text):
            if "width" not in tag.lower() or "height" not in tag.lower():
                without_dims.append(
                    {"file": str(path), "snippet": " ".join(tag.split())[:120]}
                )
        for number, line in enumerate(text.splitlines(), start=1):
            if "import" in line or "require" in line:
                for lib in heavy_libs:
                    if lib in line:
                        libs.append({"file": str(path), "line": number, "lib": lib})
                        break
    return without_dims, libs


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Frontend assets/performance audit.")
    parser.add_argument("--root", default=".")
    parser.add_argument(
        "--config", default=str(Path(__file__).parent / "audit_assets.config.json")
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
    legacy_ext = {e.lower() for e in config.get("legacy_image_extensions", [])}
    image_ext = {e.lower() for e in config.get("image_extensions", [])}
    markup_ext = {e.lower() for e in config.get("markup_extensions", [])}

    legacy, large = audit_images(
        root,
        legacy_ext,
        image_ext,
        config.get("large_image_bytes", 200000),
        ignore_dirs,
    )
    without_dims, libs = audit_markup(
        root, markup_ext, config.get("heavy_libs", []), ignore_dirs
    )

    result = {
        "legacy_images": legacy,
        "large_images": large,
        "imgs_without_dimensions": without_dims,
        "heavy_libs": libs,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
