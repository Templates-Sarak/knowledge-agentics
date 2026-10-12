"""
scan_history.py — Varre TODO o histórico Git (todos os commits e branches/tags) por vazamentos.

Detecta: (1) segredos por padrão em linhas adicionadas; (2) ARQUIVOS sensíveis já adicionados ao
histórico (.env, *.pem, id_rsa...); (3) opcional: tokens de ALTA ENTROPIA (segredos sem formato conhecido).
Para cada achado de segredo, anexa a(s) branch(es) que contêm o commit (best-effort).

Uso:
    python scan_history.py --root . [--config config.json]
    python scan_history.py --selftest

Retorno:
    JSON {total, content_findings, sensitive_files_in_history, entropy_findings}. Segredos mascarados.

Compatibilidade de leitura: um `config.json` antigo (chaves em português) continua aceito — o mapa
`LEGACY_CONFIG_KEYS` traduz as chaves antigas para as novas na carga.

Regras (padrao-escrita): zero hardcoded (padrões/limites no config.json), segredos mascarados,
responsabilidade única (apenas detecta no histórico — a reescrita/rotação é decisão com HITL).
"""

import argparse
import json
import math
import re
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

TOKEN = re.compile(r"[A-Za-z0-9+/=_\-]{16,}")

# Mapa antigo -> novo (um só lugar) para ler o config.json de quem já tem a versão em português.
LEGACY_CONFIG_KEYS = {
    "_fonte": "_source",
    "padroes": "patterns",
    "arquivos_sensiveis": "sensitive_files",
    "arquivos_permitidos": "allowed_files",
    "entropia_ativa": "entropy_enabled",
    "entropia_min": "entropy_min",
}
LEGACY_PATTERN_LABELS = {
    "Segredo atribuido": "Assigned secret",
    "String de conexao": "Connection string",
}


def normalize_config(raw: dict) -> dict:
    config = {LEGACY_CONFIG_KEYS.get(key, key): value for key, value in raw.items()}
    patterns = config.get("patterns", {})
    config["patterns"] = {
        LEGACY_PATTERN_LABELS.get(label, label): rx for label, rx in patterns.items()
    }
    return config


def load_config(path: Path) -> dict:
    return normalize_config(json.loads(path.read_text(encoding="utf-8")))


def git(root: Path, *args) -> str:
    try:
        r = subprocess.run(
            ["git", "-C", str(root), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except FileNotFoundError:
        sys.exit("Error: git not found in the environment.")
    if r.returncode != 0:
        sys.exit(
            f"Git error ({' '.join(args)}): {r.stderr.strip()} (is the root a Git repo?)"
        )
    return r.stdout


def mask(snippet: str) -> str:
    snippet = snippet.strip()
    return "****" if len(snippet) <= 8 else f"{snippet[:4]}...{snippet[-2:]}"


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    freq = {c: s.count(c) for c in set(s)}
    return -sum((n / len(s)) * math.log2(n / len(s)) for n in freq.values())


def scan_content(log: str, patterns, cfg) -> tuple:
    findings, entropy = [], []
    commit, file = None, None
    use_entropy = cfg.get("entropy_enabled", False)
    entropy_min = cfg.get("entropy_min", 4.2)
    token_min = cfg.get("token_min_len", 24)
    for line in log.splitlines():
        if line.startswith("commit "):
            commit = line.split()[1][:10]
        elif line.startswith("+++ b/"):
            file = line[6:]
        elif line.startswith("+") and not line.startswith("+++"):
            content = line[1:]
            matched = False
            for kind, regex in patterns:
                m = regex.search(content)
                if m:
                    findings.append(
                        {
                            "commit": commit,
                            "file": file,
                            "kind": kind,
                            "masked_snippet": mask(m.group(0)),
                        }
                    )
                    matched = True
                    break
            if use_entropy and not matched:
                for tok in TOKEN.findall(content):
                    if len(tok) >= token_min and shannon_entropy(tok) >= entropy_min:
                        entropy.append(
                            {
                                "commit": commit,
                                "file": file,
                                "masked_snippet": mask(tok),
                                "confidence": "low",
                            }
                        )
                        break
    return findings, entropy


def sensitive_files_in_history(root: Path, sensitive, allowed) -> list:
    output = git(
        root, "log", "--all", "--diff-filter=A", "--name-only", "--pretty=format:@@@%h"
    )
    findings, commit = [], None
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("@@@"):
            commit = line[3:]
        elif line:
            name = Path(line).name
            if any(fnmatch(name, p) for p in allowed):
                continue
            if any(fnmatch(name, p) for p in sensitive):
                findings.append({"commit": commit, "file": line})
    return findings


def branches_by_commit(root: Path, commits) -> dict:
    result = {}
    for c in commits:
        if not c:
            continue
        output = git(root, "branch", "-a", "--contains", c)
        result[c] = [b.strip(" *") for b in output.splitlines() if b.strip()]
    return result


def run_selftest() -> int:
    """Núcleo puro com fixtures em memória (sem git): leitura de config antigo/novo e varredura."""
    aws_example = (
        "AKIA" + "IOSFODNN7EXAMPLE"
    )  # chave de EXEMPLO da doc da AWS, partida de propósito
    legacy = {
        "_fonte": "x",
        "padroes": {"Segredo atribuido": "token"},
        "arquivos_sensiveis": [".env"],
        "arquivos_permitidos": [".env.example"],
        "entropia_ativa": True,
        "entropia_min": 3.0,
    }
    current = {"patterns": {"AWS": "AKIA[0-9A-Z]{16}"}, "sensitive_files": [".env"]}
    log = f'commit abcdef1234567890\n+++ b/src/a.ts\n+const k = "{aws_example}";\n'
    patterns = [
        (k, re.compile(v)) for k, v in normalize_config(current)["patterns"].items()
    ]
    findings, _ = scan_content(log, patterns, {})
    cases = [
        (
            "legacy config keys are translated to the new keys",
            set(normalize_config(legacy))
            == {
                "_source",
                "patterns",
                "sensitive_files",
                "allowed_files",
                "entropy_enabled",
                "entropy_min",
            },
        ),
        (
            "legacy pattern label is translated",
            "Assigned secret" in normalize_config(legacy)["patterns"],
        ),
        ("new config passes through unchanged", normalize_config(current) == current),
        (
            "scan_content: planted AWS example -> one masked finding",
            len(findings) == 1
            and findings[0]["kind"] == "AWS"
            and aws_example not in findings[0]["masked_snippet"]
            and findings[0]["file"] == "src/a.ts",
        ),
        ("mask: short snippet fully masked", mask("abc") == "****"),
    ]
    failures = 0
    for name, ok in cases:
        print(f"  {'ok   ' if ok else 'FAIL '} {name}")
        failures += 0 if ok else 1
    print(f"\nselftest (scan_history): {len(cases) - failures}/{len(cases)} ok")
    return 0 if failures == 0 else 1


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(
        description="Leak scanner for the full Git history."
    )
    parser.add_argument("--root", default=".", help="Git repository root")
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

    root = Path(args.root)
    patterns = [(kind, re.compile(rx)) for kind, rx in config["patterns"].items()]

    log = git(root, "log", "--all", "-p", "--no-color")
    findings, entropy = scan_content(log, patterns, config)

    # branch best-effort só para os commits com achado de segredo
    commits = {f["commit"] for f in findings}
    branch_map = branches_by_commit(root, commits)
    for f in findings:
        f["branches"] = branch_map.get(f["commit"], [])

    sensitive = sensitive_files_in_history(
        root, config.get("sensitive_files", []), config.get("allowed_files", [])
    )

    result = {
        "total": len(findings) + len(sensitive) + len(entropy),
        "content_findings": findings,
        "sensitive_files_in_history": sensitive,
        "entropy_findings": entropy,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
