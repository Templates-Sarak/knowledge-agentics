"""
scan_secrets.py — Varre arquivos do projeto (working tree) em busca de segredos hardcoded.

Lê o CATÁLOGO CANÔNICO de padrões (config.json desta skill) — a mesma fonte que os scanners do git
(git-verificacao-commit, git-especialista-repositorio) referenciam.

Uso:
    python scan_secrets.py --root . [--config config.json]
    # para o bundle do front, aponte para a pasta de build: --root dist  (ou build/.next)

Retorno:
    JSON {total, findings:[{file, line, kind, masked_snippet}]}. Segredos sempre mascarados.

Regras (padrao-escrita): zero hardcoded (padrões no config.json), nenhum segredo exposto no output,
responsabilidade única (apenas detecta — a correção/rotação é decisão com HITL na skill).
"""

import argparse
import json
import re
import sys
from pathlib import Path


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def list_files(root: Path, extensions, ignore_dirs, max_size):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in ignore_dirs for part in path.parts):
            continue
        if (
            extensions
            and path.suffix not in extensions
            and path.name not in extensions
        ):
            continue
        try:
            if max_size and path.stat().st_size > max_size:
                continue
        except OSError:
            continue
        yield path


def mask(snippet: str) -> str:
    snippet = snippet.strip()
    return "****" if len(snippet) <= 8 else f"{snippet[:4]}...{snippet[-2:]}"


def findings_from_text(file_name: str, text: str, patterns) -> list:
    """Núcleo: acha os `patterns` (lista de `(kind, compiled_regex)`) no TEXTO já lido, linha
    a linha. Puro — não toca `fs`. É o que o `--selftest` prova com fixtures em memória."""
    findings = []
    for number, line in enumerate(text.splitlines(), start=1):
        for kind, regex in patterns:
            m = regex.search(line)
            if m:
                findings.append(
                    {
                        "file": file_name,
                        "line": number,
                        "kind": kind,
                        "masked_snippet": mask(m.group(0)),
                    }
                )
                break
    return findings


def scan_file(path: Path, patterns) -> list:
    """Casca: lê o arquivo do disco e delega ao núcleo."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []
    return findings_from_text(str(path), text, patterns)


def selftest() -> int:
    """Núcleo puro contra fixtures em memória — nenhuma linha toca `fs`."""
    failures = []
    patterns = [
        ("AWS Access Key", re.compile(r"AKIA[0-9A-Z]{16}")),
        (
            "Assigned secret",
            re.compile(r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
        ),
    ]

    # Fixture montada por concatenacao, nao literal: o texto de ORIGEM deste arquivo nao pode
    # conter um segredo-formato contiguo, senao o proprio scan de vazamentos do audit_base.py
    # (que le este arquivo como QUALQUER OUTRO) acha um "vazamento" que e so dado de teste.
    aws_key = "AKIA" + "ABCDEFGHIJ12KLMN"
    findings = findings_from_text("app.py", f"aws_key = '{aws_key}'\n", patterns)
    if len(findings) != 1 or findings[0]["kind"] != "AWS Access Key":
        failures.append("findings_from_text should find the AWS Access Key on line 1")

    clean_findings = findings_from_text(
        "app.py", "def add(a, b):\n    return a + b\n", patterns
    )
    if clean_findings != []:
        failures.append("findings_from_text should find nothing in text without a secret")

    secret_value = "very-much" + "-secret-123"
    multiline = f"line without secret\napi_key = '{secret_value}'\n"
    line_findings = findings_from_text("cfg.py", multiline, patterns)
    if len(line_findings) != 1 or line_findings[0]["line"] != 2:
        failures.append("findings_from_text should report the correct line number (2)")

    if mask("abc") != "****":
        failures.append("mask should collapse a short snippet into '****'")
    if mask(aws_key) != "AKIA...MN":
        failures.append("mask should keep only prefix/suffix of a long snippet")

    catalog = load_config(Path(__file__).with_name("config.json"))
    connection_pattern = re.compile(catalog["patterns"]["Connection string"])
    def database_url(user, password):
        return f'DATABASE_URL="postgres://{user}:{password}@db:5432/app"'
    interpolated_connection = database_url(
        "${DEPLOY_DB_USER:?required}", "${DEPLOY_DB_PASSWORD:?required}"
    )
    variable_connection = database_url("$DB_USER", "$DB_PASSWORD")
    literal_password = "-".join(("literal", "password"))
    literal_connection = database_url("app", literal_password)
    variable_password_connection = database_url("app", "$DB_PASSWORD")
    variable_user_connection = database_url("$DB_USER", literal_password)
    if connection_pattern.search(interpolated_connection) or connection_pattern.search(variable_connection):
        failures.append("connection-string rule should ignore environment-variable interpolation")
    if any(connection_pattern.search(value) is None for value in (
        literal_connection, variable_password_connection, variable_user_connection
    )):
        failures.append("connection-string rule should detect a literal password")

    for failure in failures:
        print(f"  failure  {failure}")
    if failures:
        print(f"self-test (scan_secrets): {len(failures)} failure(s)")
        return 1
    print("self-test (scan_secrets): 8/8 passed")
    return 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(
        description="Hardcoded secret scanner (working tree)."
    )
    parser.add_argument(
        "--root", default=".", help="Root to scan (e.g. . or dist/ for the bundle)"
    )
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    parser.add_argument(
        "--selftest", action="store_true", help="Runs the internal suite, does not touch disk"
    )
    args = parser.parse_args()

    if args.selftest:
        sys.exit(selftest())

    try:
        config = load_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Error: config not found at '{args.config}'.")
    except json.JSONDecodeError as error:
        sys.exit(f"Error: invalid config ({error}).")

    root = Path(args.root)
    if not root.exists():
        sys.exit(f"Error: root '{root}' does not exist.")

    patterns = [(kind, re.compile(rx)) for kind, rx in config["patterns"].items()]
    findings = []
    for path in list_files(
        root,
        config.get("text_extensions", []),
        set(config.get("ignore_dirs", [])),
        config.get("max_file_size_bytes"),
    ):
        findings.extend(scan_file(path, patterns))

    print(
        json.dumps(
            {"total": len(findings), "findings": findings}, ensure_ascii=False, indent=2
        )
    )


if __name__ == "__main__":
    main()
