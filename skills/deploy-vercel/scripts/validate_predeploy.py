"""
validate_predeploy.py — Validacao pre-deploy: config de build, env vars exigidas e segredos versionados.

Uso:
    python validate_predeploy.py --root . [--config config.json]

Retorno:
    JSON com {build_config, required_env, warnings}.

Regras (padrao-escrita): zero hardcoded (listas no config.json),
responsabilidade única (apenas valida e reporta — não publica nada).
"""

import argparse
import json
import re
import sys
from fnmatch import fnmatch
from pathlib import Path


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def check_build_config(root: Path, files) -> dict:
    return {name: (root / name).exists() for name in files}


def read_required_env(root: Path, env_example: str) -> list:
    path = root / env_example
    if not path.exists():
        return []
    variables = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            variables.append(line.split("=", 1)[0].strip())
    return variables


def detect_versioned_secrets(root: Path, forbidden, patterns, ignore_dirs) -> list:
    warnings = []
    for path in root.rglob("*"):
        if any(part in ignore_dirs for part in path.parts):
            continue
        if path.is_file() and any(fnmatch(path.name, p) for p in forbidden):
            warnings.append({"kind": "forbidden_file", "file": str(path)})

    regexes = [re.compile(rx) for rx in patterns]
    target = root / "vercel.json"
    if target.exists():
        for number, line in enumerate(
            target.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1
        ):
            if any(r.search(line) for r in regexes):
                warnings.append(
                    {"kind": "secret_in_config", "file": str(target), "line": number}
                )
    return warnings


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Vercel pre-deploy validation.")
    parser.add_argument("--root", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
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

    result = {
        "build_config": check_build_config(root, config.get("build_config_files", [])),
        "required_env": read_required_env(
            root, config.get("env_example", ".env.example")
        ),
        "warnings": detect_versioned_secrets(
            root,
            config.get("forbidden_secret_files", []),
            config.get("secret_patterns", []),
            set(config.get("ignore_dirs", [])),
        ),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
