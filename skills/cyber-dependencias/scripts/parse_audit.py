"""
parse_audit.py — Normaliza a saída de `npm audit --json` num resumo de severidades.

Uso:
    npm audit --json > audit.json
    python parse_audit.py --arquivo audit.json

Retorno:
    JSON {total, por_severidade:{critical,high,moderate,low}, pacotes:[{nome, severidade, fix}]}.
    Suporta npm v7+ (`vulnerabilities`) e npm v6 (`advisories`). Para pip-audit/osv-scanner, leia a saída direto.

Regras (CLAUDE.md): responsabilidade única (só normaliza — a correção é decisão com HITL na skill);
sem hardcoded relevante (apenas a ordem fixa de severidades).
"""
import argparse
import json
import sys

SEVERIDADES = ["critical", "high", "moderate", "low"]


def normalizar(data: dict) -> dict:
    pacotes = []
    if isinstance(data.get("vulnerabilities"), dict):  # npm v7+
        for nome, v in data["vulnerabilities"].items():
            if not isinstance(v, dict):
                continue
            pacotes.append({
                "nome": nome,
                "severidade": v.get("severity", "unknown"),
                "fix": bool(v.get("fixAvailable")),
            })
    elif isinstance(data.get("advisories"), dict):  # npm v6
        for adv in data["advisories"].values():
            pacotes.append({
                "nome": adv.get("module_name", "?"),
                "severidade": adv.get("severity", "unknown"),
                "fix": bool(adv.get("patched_versions")),
            })

    por_sev = {s: sum(1 for p in pacotes if p["severidade"] == s) for s in SEVERIDADES}
    return {"total": len(pacotes), "por_severidade": por_sev, "pacotes": pacotes}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Normaliza npm audit --json.")
    parser.add_argument("--arquivo", required=True, help="Caminho do JSON gerado por `npm audit --json`")
    args = parser.parse_args()

    try:
        with open(args.arquivo, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        sys.exit(f"Erro: arquivo nao encontrado '{args.arquivo}'.")
    except json.JSONDecodeError as erro:
        sys.exit(f"Erro: JSON invalido ({erro}).")

    print(json.dumps(normalizar(data), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
