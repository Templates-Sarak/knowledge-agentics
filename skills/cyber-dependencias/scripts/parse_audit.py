"""
parse_audit.py — Normaliza a saída de `npm audit --json` num resumo de severidades.

Uso:
    npm audit --json > audit.json
    python parse_audit.py --file audit.json

Retorno:
    JSON {total, by_severity:{critical,high,moderate,low}, packages:[{name, severity, fix}]}.
    Suporta npm v7+ (`vulnerabilities`) e npm v6 (`advisories`). Para pip-audit/osv-scanner, leia a saída direto.

Regras (padrao-escrita): responsabilidade única (só normaliza — a correção é decisão com HITL na skill);
sem hardcoded relevante (apenas a ordem fixa de severidades).
"""
import argparse
import json
import sys

SEVERITIES = ["critical", "high", "moderate", "low"]


def normalize(data: dict) -> dict:
    packages = []
    if isinstance(data.get("vulnerabilities"), dict):  # npm v7+
        for name, v in data["vulnerabilities"].items():
            if not isinstance(v, dict):
                continue
            packages.append({
                "name": name,
                "severity": v.get("severity", "unknown"),
                "fix": bool(v.get("fixAvailable")),
            })
    elif isinstance(data.get("advisories"), dict):  # npm v6
        for adv in data["advisories"].values():
            packages.append({
                "name": adv.get("module_name", "?"),
                "severity": adv.get("severity", "unknown"),
                "fix": bool(adv.get("patched_versions")),
            })

    by_severity = {s: sum(1 for p in packages if p["severity"] == s) for s in SEVERITIES}
    return {"total": len(packages), "by_severity": by_severity, "packages": packages}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Normalizes npm audit --json.")
    parser.add_argument("--file", required=True, help="Path of the JSON produced by `npm audit --json`")
    args = parser.parse_args()

    try:
        with open(args.file, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        sys.exit(f"Error: file not found '{args.file}'.")
    except json.JSONDecodeError as error:
        sys.exit(f"Error: invalid JSON ({error}).")

    print(json.dumps(normalize(data), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
