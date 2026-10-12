"""
review_diff.py — Revisão determinística do que está STAGED (gate de QUALIDADE pré-commit).

Complementa a `git-verificacao-commit` (que é o gate de SEGREDOS). Aqui são marcadores de qualidade no
que está sendo commitado: conflito de merge não resolvido, breakpoint de debug, log de debug, marcador
pendente (TODO/FIXME). Rápido — só o diff staged, sem histórico.

Uso (manual ou via pre-commit hook):
    python review_diff.py [--root .] [--config config.json]
    python review_diff.py --selftest

Saída:
    JSON {blocked, findings:[{file, kind, severity, snippet}]}.
    **Exit 1** se houver achado de severidade em `block_on` (faz o pre-commit BLOQUEAR); 0 caso contrário.

Compatibilidade de leitura: um `config.json` antigo (chaves e severidades em português) continua aceito —
`LEGACY_CONFIG_KEYS`, `LEGACY_SEVERITIES` e `LEGACY_PATTERN_LABELS` traduzem na carga.

Regras (padrao-escrita): zero hardcoded (padrões/severidades no config.json),
responsabilidade única (só marcadores baratos do diff — a revisão de conformidade profunda é do agente).
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# Mapas antigo -> novo (um só lugar) para ler o config.json de quem já tem a versão em português.
LEGACY_CONFIG_KEYS = {
    "padroes": "patterns",
    "bloquear_em": "block_on",
    "severidade": "severity",
}
LEGACY_SEVERITIES = {"bloqueio": "block", "aviso": "warning"}
LEGACY_PATTERN_LABELS = {
    "Conflito de merge nao resolvido": "Unresolved merge conflict",
    "Breakpoint de debug": "Debug breakpoint",
    "Log de debug": "Debug log",
    "Marcador pendente": "Pending marker",
    "skip de teste": "Test skip",
}


def normalize_config(raw: dict) -> dict:
    config = {LEGACY_CONFIG_KEYS.get(key, key): value for key, value in raw.items()}
    patterns = {}
    for label, cfg in config.get("patterns", {}).items():
        cfg = {LEGACY_CONFIG_KEYS.get(key, key): value for key, value in cfg.items()}
        if "severity" in cfg:
            cfg["severity"] = LEGACY_SEVERITIES.get(cfg["severity"], cfg["severity"])
        patterns[LEGACY_PATTERN_LABELS.get(label, label)] = cfg
    config["patterns"] = patterns
    if "block_on" in config:
        config["block_on"] = [LEGACY_SEVERITIES.get(s, s) for s in config["block_on"]]
    return config


def load_config(path: Path) -> dict:
    return normalize_config(json.loads(path.read_text(encoding="utf-8")))


def staged_diff(root: Path) -> str:
    try:
        r = subprocess.run(
            ["git", "-C", str(root), "diff", "--cached", "--unified=0", "--no-color"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except FileNotFoundError:
        sys.exit("Error: git not found in the environment.")
    if r.returncode != 0:
        sys.exit(f"Error in git diff: {r.stderr.strip()} (is the root a Git repo?)")
    return r.stdout


def compile_patterns(patterns: dict) -> list:
    return [
        (kind, re.compile(cfg["regex"]), cfg.get("severity", "warning"))
        for kind, cfg in patterns.items()
    ]


def analyze(diff: str, patterns) -> list:
    findings, file = [], None
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            file = line[6:]
        elif line.startswith("+") and not line.startswith("+++"):
            content = line[1:]
            for kind, regex, severity in patterns:
                if regex.search(content):
                    findings.append(
                        {
                            "file": file,
                            "kind": kind,
                            "severity": severity,
                            "snippet": content.strip()[:120],
                        }
                    )
                    break
    return findings


def run_selftest() -> int:
    """Núcleo puro (sem git): leitura de config antigo/novo e análise de um diff em memória."""
    legacy = {
        "padroes": {
            "Log de debug": {"regex": "print\\(", "severidade": "aviso"},
            "Breakpoint de debug": {"regex": "pdb", "severidade": "bloqueio"},
        },
        "bloquear_em": ["bloqueio"],
    }
    current = {
        "patterns": {"Debug log": {"regex": "print\\(", "severity": "warning"}},
        "block_on": ["block"],
    }
    diff = "+++ b/a.py\n+import pdb\n+print(1)\n"
    findings = analyze(diff, compile_patterns(normalize_config(legacy)["patterns"]))
    legacy_config = normalize_config(legacy)
    cases = [
        (
            "legacy config keys and severities are translated",
            legacy_config["block_on"] == ["block"]
            and legacy_config["patterns"]["Debug log"]["severity"] == "warning",
        ),
        (
            "legacy pattern label is translated",
            "Debug breakpoint" in legacy_config["patterns"],
        ),
        ("new config passes through unchanged", normalize_config(current) == current),
        (
            "analyze: first matching pattern wins per line, file is tracked",
            [(f["file"], f["kind"], f["severity"]) for f in findings]
            == [
                ("a.py", "Debug breakpoint", "block"),
                ("a.py", "Debug log", "warning"),
            ],
        ),
    ]
    failures = 0
    for name, ok in cases:
        print(f"  {'ok   ' if ok else 'FAIL '} {name}")
        failures += 0 if ok else 1
    print(f"\nselftest (review_diff): {len(cases) - failures}/{len(cases)} ok")
    return 0 if failures == 0 else 1


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Quality gate for the staged diff.")
    parser.add_argument("--root", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
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

    patterns = compile_patterns(config["patterns"])
    block_on = set(config.get("block_on", ["block"]))
    findings = analyze(staged_diff(Path(args.root)), patterns)
    blocked = any(f["severity"] in block_on for f in findings)

    print(
        json.dumps(
            {"blocked": blocked, "findings": findings}, ensure_ascii=False, indent=2
        )
    )
    sys.exit(1 if blocked else 0)


if __name__ == "__main__":
    main()
