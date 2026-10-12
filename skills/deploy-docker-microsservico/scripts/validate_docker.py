"""
validate_docker.py — Valida a imagem de um modulo: nao-root, .dockerignore, sem tag :latest,
sem segredo/.env na imagem. Apenas reporta (nao builda nada).

Uso:
    python validate_docker.py --root . [--config config.json]

Retorno:
    JSON {dockerignore_present, dockerfiles:[...], warnings:[{kind, file, line, snippet}]}.

Regras (padrao-escrita): zero hardcoded (listas/padroes no config.json), responsabilidade unica
(apenas valida e reporta — build/push e decisao com HITL na skill).
"""

import argparse
import json
import re
import sys
from fnmatch import fnmatch
from pathlib import Path


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def find_dockerfiles(root: Path, globs, ignore) -> list:
    found = []
    for path in root.rglob("*"):
        if any(part in ignore for part in path.parts):
            continue
        if path.is_file() and any(fnmatch(path.name, g) for g in globs):
            found.append(path)
    return found


def _ref_from(line: str) -> str:
    parts = line.split()
    return parts[1] if len(parts) > 1 else ""


def _is_latest(ref: str) -> bool:
    tag = ref.split("@")[0]
    name = tag.split("/")[-1]
    return tag.endswith(":latest") or ":" not in name


def analyze_dockerfile(path: Path, secret_names) -> dict:
    warnings = []
    has_nonroot = False
    for number, raw in enumerate(
        path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1
    ):
        line = raw.strip()
        keyword = line.split()[0].upper() if line else ""
        if keyword == "FROM" and _is_latest(_ref_from(line)):
            warnings.append(
                {
                    "kind": "latest_tag",
                    "file": str(path),
                    "line": number,
                    "snippet": _ref_from(line),
                }
            )
        if keyword == "USER":
            user = line.split()[1].lower() if len(line.split()) > 1 else "root"
            has_nonroot = has_nonroot or user not in ("root", "0", "0:0")
        if (
            keyword in ("COPY", "ADD")
            and re.search(r"(^|\s)\.env(\s|$)", line)
            and ".env.example" not in line
        ):
            warnings.append(
                {"kind": "env_copy", "file": str(path), "line": number, "snippet": line}
            )
        if keyword in ("ARG", "ENV") and any(s in line.lower() for s in secret_names):
            warnings.append(
                {
                    "kind": "secret_in_build",
                    "file": str(path),
                    "line": number,
                    "snippet": line,
                }
            )
    if not has_nonroot:
        warnings.append(
            {"kind": "no_nonroot_user", "file": str(path), "line": 0, "snippet": ""}
        )
    return {"file": str(path), "warnings": warnings}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(
        description="Docker image validation (non-root, latest, secret)."
    )
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

    ignore = set(config.get("ignore_dirs", []))
    dockerfiles = find_dockerfiles(root, config.get("dockerfile_globs", []), ignore)
    secret_names = [s.lower() for s in config.get("build_secret_names", [])]
    analyses = [analyze_dockerfile(d, secret_names) for d in dockerfiles]

    result = {
        "dockerignore_present": (root / ".dockerignore").exists(),
        "dockerfiles": [a["file"] for a in analyses],
        "warnings": [w for a in analyses for w in a["warnings"]],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
