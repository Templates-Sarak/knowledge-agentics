"""schema_parity.py — prova que o arquivo de schema e a cadeia de migrations produzem o MESMO banco.

Uso:
    python schema_parity.py --schema-file <schema.sql> --migrations-dir <dir> [--profile postgres-docker]
                            [--config config.json] [--json]
    python schema_parity.py --selftest

Sobe um banco efêmero, aplica o schema, dumpa; reinicia, aplica a cadeia de migrations, dumpa; compara os
dois dumps normalizados. NUNCA toca em banco vivo — só em container/banco descartável criado aqui.

Veredito e código de saída:
    proven        (0)  os dumps são idênticos
    divergent     (1)  os dumps diferem — o schema NÃO reproduz a cadeia (ou vice-versa)
    not-proven    (2)  não deu para provar (ferramenta ausente, passo falhou) — NÃO é verde: o usuário
                       é avisado e a correção é exigida antes de prosseguir

Regras (padrao-escrita): zero hardcoded (comandos e padrões no perfil do config.json; a senha do banco
efêmero é gerada em runtime), responsabilidade única (só compara — a decisão de remover é do HITL).
"""

import argparse
import difflib
import glob
import json
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DEFAULT_CONFIG = Path(__file__).with_name("config.json")
STEP_TIMEOUT_SECONDS = 300
DIFF_PREVIEW_LINES = 40
ACTION_REQUIRED = (
    "Paridade NÃO provada: corrija a causa (ferramenta ausente, passo falhou ou schema divergente) e "
    "rode de novo antes de prosseguir com o marco-0."
)


def load_profile(config_path: Path, name: str) -> dict:
    profiles = json.loads(config_path.read_text(encoding="utf-8"))["parity_profiles"]
    if name not in profiles:
        raise KeyError(
            f"unknown parity profile: {name} (available: {', '.join(sorted(profiles))})"
        )
    return profiles[name]


def expand(value: str, context: dict) -> str:
    """Substitui `{chave}` pelos valores do contexto; chave desconhecida fica intacta (e falha adiante)."""
    return re.sub(
        r"\{(\w+)\}", lambda m: str(context.get(m.group(1), m.group(0))), value
    )


def missing_tools(profile: dict) -> list:
    return [tool for tool in profile.get("requires", []) if shutil.which(tool) is None]


def normalize_dump(text: str, drop_patterns: list) -> list:
    """Linhas do dump sem ruído (comentários, SET, linhas vazias) — o que sobra é o schema de fato."""
    compiled = [re.compile(pattern) for pattern in drop_patterns]
    lines = [line.rstrip() for line in text.splitlines()]
    return [line for line in lines if not any(rx.search(line) for rx in compiled)]


def build_verdict(schema_lines: list, chain_lines: list) -> dict:
    if schema_lines == chain_lines:
        return {
            "verdict": "proven",
            "reason": "dumps are identical",
            "diff_preview": [],
        }
    diff = list(
        difflib.unified_diff(
            schema_lines, chain_lines, "schema", "migrations", lineterm=""
        )
    )
    return {
        "verdict": "divergent",
        "reason": "schema file and migration chain produce different databases",
        "diff_preview": diff[:DIFF_PREVIEW_LINES],
        "action_required": ACTION_REQUIRED,
    }


def not_proven(reason: str) -> dict:
    return {
        "verdict": "not-proven",
        "reason": reason,
        "diff_preview": [],
        "action_required": ACTION_REQUIRED,
    }


def run_command(
    argv: list, stdin_path: str, env_context: dict
) -> subprocess.CompletedProcess:
    stdin_handle = open(stdin_path, "rb") if stdin_path else None
    try:
        return subprocess.run(
            [expand(arg, env_context) for arg in argv],
            stdin=stdin_handle,
            capture_output=True,
            text=True,
            timeout=STEP_TIMEOUT_SECONDS,
            check=False,
        )
    finally:
        if stdin_handle:
            stdin_handle.close()


def run_step(step: dict, context: dict) -> list:
    """Executa um passo (ou um por arquivo, em ordem lexicográfica). Levanta RuntimeError se falhar."""
    stdin = expand(step["stdin"], context) if step.get("stdin") else ""
    inputs = [stdin]
    if step.get("each_file"):
        inputs = sorted(glob.glob(expand(step["each_file"], context)))
        if not inputs:
            raise RuntimeError(
                f"no files matched: {expand(step['each_file'], context)}"
            )
    outputs = []
    for stdin_path in inputs:
        proc = run_command(step["argv"], stdin_path, context)
        if proc.returncode != 0:
            raise RuntimeError(
                f"step failed ({proc.returncode}): {' '.join(step['argv'])}: {proc.stderr.strip()[:300]}"
            )
        outputs.append(proc.stdout)
    return outputs


def run_steps(steps: list, context: dict) -> None:
    for step in steps:
        run_step(step, context)


def wait_ready(ready: dict, context: dict) -> None:
    for _ in range(int(ready.get("retries", 1))):
        proc = run_command(ready["argv"], "", context)
        if proc.returncode == 0:
            return
        time.sleep(float(ready.get("interval_seconds", 1)))
    raise RuntimeError("database did not become ready in time")


def dump_side(profile: dict, context: dict, apply_key: str) -> list:
    """Reinicia o banco, aplica (`apply_schema` ou `apply_migrations`) e devolve o dump normalizado."""
    run_steps(profile.get("reset", []), context)
    run_steps(profile[apply_key], context)
    dump = run_step(profile["dump"], context)[0]
    return normalize_dump(dump, profile.get("normalize_drop_patterns", []))


def prove(profile: dict, context: dict) -> dict:
    """Sobe, aplica as duas fontes e compara. Falha de passo vira `not-proven` — nunca verde por omissão."""
    try:
        run_steps(profile.get("start", []), context)
        if profile.get("ready"):
            wait_ready(profile["ready"], context)
        schema_lines = dump_side(profile, {**context, "db": "parity_schema"}, "apply_schema")
        chain_lines = dump_side(profile, {**context, "db": "parity_chain"}, "apply_migrations")
        return build_verdict(schema_lines, chain_lines)
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        return not_proven(str(error))


def cleanup(profile: dict, context: dict) -> list:
    """Derruba o banco efêmero (melhor-esforço). Devolve os avisos — o veredito já foi decidido."""
    try:
        run_steps(profile.get("stop", []), context)
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        return [f"cleanup failed: {error}"]
    return []


def run_parity(profile: dict, context: dict) -> dict:
    result = prove(profile, context)
    warnings = cleanup(profile, context)
    if warnings:
        result["cleanup_warnings"] = warnings
    return result


def build_context(schema_file: str, migrations_dir: str) -> dict:
    return {
        "container": f"marco0-parity-{secrets.token_hex(4)}",
        "password": secrets.token_hex(16),
        "schema_file": schema_file,
        "migrations_dir": migrations_dir,
    }


def verify_inputs(schema_file: str, migrations_dir: str) -> str:
    if not Path(schema_file).is_file():
        return f"schema file not found: {schema_file}"
    if not Path(migrations_dir).is_dir():
        return f"migrations dir not found: {migrations_dir}"
    return ""


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prove schema file x migration chain parity."
    )
    parser.add_argument("--schema-file")
    parser.add_argument("--migrations-dir")
    parser.add_argument("--profile", default="postgres-docker")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    return parser.parse_args()


def _fake_profile(workdir: str) -> dict:
    py = sys.executable
    write = "import sys,pathlib;pathlib.Path(sys.argv[1]).write_text(sys.stdin.read())"
    side = f"{workdir}/{{db}}.out"
    return {
        "apply_schema": [{"argv": [py, "-c", write, side], "stdin": "{schema_file}"}],
        "apply_migrations": [
            {"argv": [py, "-c", write, side], "each_file": "{migrations_dir}/*.sql"}
        ],
        "dump": {
            "argv": [py, "-c", "import sys;print(open(sys.argv[1]).read())", side]
        },
        "normalize_drop_patterns": ["^--", "^$"],
    }


def _run_with_files(schema_text: str, migration_text: str) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "schema.sql").write_text(schema_text, encoding="utf-8")
        (root / "mig").mkdir()
        (root / "mig" / "001.sql").write_text(migration_text, encoding="utf-8")
        context = {"schema_file": str(root / "schema.sql"), "migrations_dir": str(root / "mig")}
        return run_parity(_fake_profile(tmp), context)


def _verdict_of(schema_text: str, migration_text: str) -> str:
    return _run_with_files(schema_text, migration_text)["verdict"]


def _parity_cases() -> list:
    return [
        ("identical dumps are proven", lambda: _verdict_of("create t;", "create t;") == "proven"),
        ("comments/blank ignored", lambda: _verdict_of("-- c" + chr(10) + "create t;", "create t;") == "proven"),
        ("different dumps diverge", lambda: _verdict_of("create t;", "create u;") == "divergent"),
        ("divergence demands action", lambda: "action_required" in _run_with_files("a", "b")),
    ]


def _failure_cases() -> list:
    broken = {"start": [{"argv": ["__no_such_bin__"]}]}
    return [
        ("failing step is not-proven", lambda: run_parity(broken, {})["verdict"] == "not-proven"),
        ("missing tool detected", lambda: missing_tools({"requires": ["__no_such_bin__"]}) == ["__no_such_bin__"]),
        ("unknown placeholder stays", lambda: expand("{nope}-{a}", {"a": "1"}) == "{nope}-1"),
    ]


def _selftest_cases() -> list:
    return _parity_cases() + _failure_cases()


def run_selftest() -> int:
    failures = 0
    for name, check in _selftest_cases():
        ok = bool(check())
        failures += 0 if ok else 1
        print(f"  {'ok  ' if ok else 'FAIL'} {name}")
    total = len(_selftest_cases())
    print(f"\nselftest (schema_parity): {total - failures}/{total} ok")
    return 1 if failures else 0


EXIT_CODES = {"proven": 0, "divergent": 1, "not-proven": 2}


def main() -> int:
    args = get_args()
    if args.selftest:
        return run_selftest()
    problem = verify_inputs(args.schema_file or "", args.migrations_dir or "")
    profile = load_profile(Path(args.config), args.profile)
    absent = missing_tools(profile)
    if problem or absent:
        result = not_proven(
            problem or f"required tool(s) not found: {', '.join(absent)}"
        )
    else:
        result = run_parity(
            profile, build_context(args.schema_file, args.migrations_dir)
        )
    print(
        json.dumps(result, ensure_ascii=False, indent=2)
        if args.json
        else f"{result['verdict']}: {result['reason']}"
        + (f"\n{ACTION_REQUIRED}" if "action_required" in result else "")
    )
    return EXIT_CODES[result["verdict"]]


if __name__ == "__main__":
    sys.exit(main())
