"""
sast_scan.py — Análise estática (SAST) leve: detecta padrões de código inseguro.

Uso:
    python sast_scan.py --root . [--config config.json]

Retorno:
    JSON {total, findings:[{file, line, kind, confidence, snippet}]}.
    Heurístico → cada achado é CANDIDATO; o agente triagem (especialmente `confidence: low`).

Regras (padrao-escrita): zero hardcoded (padrões/confiança no config.json),
responsabilidade única (apenas detecta — a refatoração é decisão com HITL na skill).
"""
import argparse
import json
import re
import sys
from pathlib import Path


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def compile_patterns(patterns: dict) -> list:
    compiled = []
    for kind, cfg in patterns.items():
        compiled.append((kind, re.compile(cfg["regex"]), cfg.get("confidence", "medium")))
    return compiled


def list_files(root: Path, extensions, ignore_dirs):
    for path in root.rglob("*"):
        if not path.is_file() or any(p in ignore_dirs for p in path.parts):
            continue
        if extensions and path.suffix.lower() not in extensions:
            continue
        yield path


def scan_file(path: Path, patterns) -> list:
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return []
    findings = []
    for number, line in enumerate(lines, start=1):
        for kind, regex, confidence in patterns:
            if regex.search(line):
                findings.append({"file": str(path), "line": number, "kind": kind,
                                 "confidence": confidence, "snippet": line.strip()[:140]})
    return findings


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Lightweight pattern-based SAST.")
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

    patterns = compile_patterns(config["patterns"])
    extensions = {e.lower() for e in config.get("extensions", [])}
    findings = []
    for path in list_files(root, extensions, set(config.get("ignore_dirs", []))):
        findings.extend(scan_file(path, patterns))

    print(json.dumps({"total": len(findings), "findings": findings}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
