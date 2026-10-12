"""
audit_docs.py — Auditoria determinística da documentação de um projeto.

Uso:
    python audit_docs.py --root . [--config audit_docs.config.json]
    python audit_docs.py --selftest

Retorno:
    JSON com {readme_present, missing_sections, docs_dir_present, license_present, modules_without_readme}.

Regras (padrao-escrita): zero hardcoded (seções/raízes/globs no config.json),
responsabilidade única (apenas audita e reporta — não escreve documentação).
"""

import argparse
import json
import sys
import tempfile
from fnmatch import fnmatch
from pathlib import Path

# Chaves antigas (config de projetos que já carregam cópia local) -> chaves atuais.
LEGACY_CONFIG_KEYS = {
    "readme_nome": "readme_name",
    "secoes_obrigatorias": "required_sections",
}


def normalize_config(config: dict) -> dict:
    """Aceita as chaves antigas do config, convertendo-as pelo mapa centralizado."""
    return {LEGACY_CONFIG_KEYS.get(key, key): value for key, value in config.items()}


def load_config(path: Path) -> dict:
    return normalize_config(json.loads(path.read_text(encoding="utf-8")))


def read_headings(path: Path) -> list:
    """Retorna os títulos markdown (linhas iniciadas por #), sem o # e em minúsculas."""
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    return [
        line.strip().lstrip("#").strip().lower()
        for line in lines
        if line.lstrip().startswith("#")
    ]


def missing_sections(readme: Path, required) -> list:
    if not readme.exists():
        return list(required)
    headings = read_headings(readme)
    return [
        section
        for section in required
        if not any(section.lower() in h for h in headings)
    ]


def has_license(root: Path, globs) -> bool:
    for path in root.iterdir():
        if path.is_file() and any(fnmatch(path.name, g) for g in globs):
            return True
    return False


def modules_without_readme(root: Path, roots, readme_name) -> list:
    missing = []
    for module_root in roots:
        base = root / module_root
        if not base.is_dir():
            continue
        for module in base.iterdir():
            if module.is_dir() and not (module / readme_name).exists():
                missing.append(str(module))
    return missing


def run_selftest() -> int:
    """Prova o mapa de chaves antigas e as quatro checagens com um projeto temporário."""
    failures = []
    legacy = normalize_config(
        {"readme_nome": "R.md", "secoes_obrigatorias": ["A"], "docs_dir": "d"}
    )
    if legacy != {"readme_name": "R.md", "required_sections": ["A"], "docs_dir": "d"}:
        failures.append(f"legacy keys not normalized: {legacy}")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "README.md").write_text("# Setup\n## Tests\n", encoding="utf-8")
        (root / "LICENSE").write_text("x", encoding="utf-8")
        (root / "modules" / "a").mkdir(parents=True)
        if missing_sections(root / "README.md", ["Setup", "Stack"]) != ["Stack"]:
            failures.append("missing_sections wrong")
        if missing_sections(root / "absent.md", ["Setup"]) != ["Setup"]:
            failures.append("missing_sections without README wrong")
        if not has_license(root, ["LICENSE*"]) or has_license(root, ["COPYING"]):
            failures.append("has_license wrong")
        if modules_without_readme(root, ["modules"], "README.md") != [
            str(root / "modules" / "a")
        ]:
            failures.append("modules_without_readme wrong")
    for failure in failures:
        print(f"[FAIL] {failure}")
    print(
        f"[{'OK' if not failures else 'ERROR'}] selftest of audit_docs: {5 - len(failures)}/5"
    )
    return 1 if failures else 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Project documentation audit.")
    parser.add_argument("--root", default=".")
    parser.add_argument(
        "--config", default=str(Path(__file__).parent / "audit_docs.config.json")
    )
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        sys.exit(run_selftest())

    try:
        config = load_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Error: config not found at '{args.config}'.")
    except json.JSONDecodeError as error:
        sys.exit(f"Error: invalid config ({error}).")

    root = Path(args.root)
    if not root.exists():
        sys.exit(f"Error: root '{root}' does not exist.")

    readme_name = config.get("readme_name", "README.md")
    readme = root / readme_name

    result = {
        "readme_present": readme.exists(),
        "missing_sections": missing_sections(
            readme, config.get("required_sections", [])
        ),
        "docs_dir_present": (root / config.get("docs_dir", "docs")).is_dir(),
        "license_present": has_license(root, config.get("license_globs", ["LICENSE*"])),
        "modules_without_readme": modules_without_readme(
            root, config.get("module_roots", []), readme_name
        ),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
