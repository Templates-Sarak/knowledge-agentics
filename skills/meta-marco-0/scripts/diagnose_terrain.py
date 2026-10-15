"""diagnose_terrain.py — diagnóstico mecânico (read-only) do terreno antes do marco-0.

Uso:
    python diagnose_terrain.py --root <alvo> [--config config.json] [--json]
    python diagnose_terrain.py --selftest

Responde, sem julgamento, o que a skill `meta-marco-0` precisa antes de perguntar ao usuário: em que
FASE a campanha está (A planejar / B executar / C conferir / DONE), em que branch o alvo está, qual
ferramenta de migration e qual arquivo de schema existem, se há testes, se algum workflow dispara em
tag/release, se o manifesto de proteção existe e se a tag de release já foi criada.

Regras (padrao-escrita): zero hardcoded (nomes e padrões vêm do config.json), responsabilidade única
(só observa — nunca altera o alvo). Tri-estado de propósito: `None` significa "não consegui verificar",
NUNCA "está limpo" (fail-open é o defeito que esta skill cobra dos outros).
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from typing import Optional
from fnmatch import fnmatch
from pathlib import Path

DEFAULT_CONFIG = Path(__file__).with_name("config.json")
GIT_TIMEOUT_SECONDS = 30


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def detect_phase(plan_statuses: list, closed_statuses: list, tag_exists: Optional[bool]) -> str:
    """Fase pela fila de plans `m0-*`: nenhuma -> A; alguma ativa -> B; todas encerradas -> C.
    A tag de release já criada encerra a campanha (DONE), e `None` (não sei) nunca vira DONE."""
    if tag_exists is True:
        return "DONE"
    if not plan_statuses:
        return "A"
    if all(status in closed_statuses for status in plan_statuses):
        return "C"
    return "B"


def evaluate_branch(current: str, dirty_tree: Optional[bool], default_branches: list) -> dict:
    """`current` vazio ou "(detached)" = não foi possível determinar; `dirty_tree` None = não sei."""
    determined = bool(current) and current != "(detached)"
    return {
        "current": current,
        "determined": determined,
        "is_default": determined and current in default_branches,
        "dirty_tree": dirty_tree,
    }


def detect_migration_tool(root: Path, tools: list) -> dict:
    """Primeira ferramenta (ordem do config, a mais específica antes) com algum marcador presente."""
    for tool in tools:
        if any((root / marker).exists() for marker in tool["markers"]):
            directory = root / tool["dir"]
            files = (
                sorted(p.name for p in directory.rglob("*") if p.is_file())
                if directory.is_dir()
                else []
            )
            return {
                "name": tool["name"],
                "dir": tool["dir"],
                "files": files,
                "count": len(files),
            }
    return {"name": None, "dir": None, "files": [], "count": 0}


def find_schema_file(root: Path, candidates: list) -> str:
    for candidate in candidates:
        if (root / candidate).is_file():
            return candidate
    return ""


def is_ignored(path: Path, ignore_dirs: list) -> bool:
    return any(part in ignore_dirs for part in path.parts)


def has_tests(
    root: Path, dir_names: list, file_patterns: list, ignore_dirs: list
) -> bool:
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if is_ignored(relative, ignore_dirs):
            continue
        if path.is_dir() and path.name in dir_names:
            return True
        if path.is_file() and any(
            fnmatch(path.name, pattern) for pattern in file_patterns
        ):
            return True
    return False


def scan_workflow_text(text: str, patterns: list) -> list:
    """Linhas de um workflow que disparam em tag/release — criar a tag pode acionar deploy."""
    compiled = [re.compile(pattern) for pattern in patterns]
    return [
        line.strip()
        for line in text.splitlines()
        if any(rx.search(line) for rx in compiled)
    ]


def read_workflow_risks(root: Path, workflow_dir: str, patterns: list) -> list:
    directory = root / workflow_dir
    if not directory.is_dir():
        return []
    findings = []
    for file in sorted(list(directory.glob("*.yml")) + list(directory.glob("*.yaml"))):
        text = file.read_text(encoding="utf-8", errors="replace")
        hits = scan_workflow_text(text, patterns)
        if hits:
            findings.append({"file": f"{workflow_dir}/{file.name}", "triggers": hits})
    return findings


def read_plan_statuses(root: Path, plans_dir: str, prefix: str) -> list:
    directory = root / plans_dir
    if not directory.is_dir():
        return []
    statuses = []
    for file in sorted(directory.glob(f"{prefix}*.md")):
        text = file.read_text(encoding="utf-8", errors="replace")
        match = re.search(r'^status:\s*"?([^"\n]+)"?', text, re.MULTILINE)
        statuses.append(match.group(1).strip() if match else "")
    return statuses


def read_current_branch(root: Path) -> str:
    """Branch pela leitura de `.git/HEAD` (não chama git). Vazio = não é repo git ou HEAD ilegível."""
    head = root / ".git" / "HEAD"
    if not head.is_file():
        return ""
    content = head.read_text(encoding="utf-8", errors="replace").strip()
    if content.startswith("ref: refs/heads/"):
        return content[len("ref: refs/heads/") :].strip()
    return "(detached)" if content else ""


def run_git(root: Path, args: list) -> Optional[str]:
    """Saída do git, ou None quando não deu para saber (git ausente, não é repo, falha)."""
    if not (root / ".git").exists():
        return None
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return proc.stdout if proc.returncode == 0 else None


def read_dirty_tree(root: Path) -> Optional[bool]:
    output = run_git(root, ["status", "--porcelain"])
    return None if output is None else bool(output.strip())


def read_tag_exists(root: Path, tag: str) -> Optional[bool]:
    output = run_git(root, ["tag", "--list", tag])
    return None if output is None else bool(output.strip())


def read_package_version(root: Path) -> str:
    package = root / "package.json"
    if not package.is_file():
        return ""
    try:
        return str(json.loads(package.read_text(encoding="utf-8")).get("version", ""))
    except (OSError, ValueError):
        return ""


def read_protect_manifest(root: Path, name: str) -> list:
    manifest = root / name
    if not manifest.is_file():
        return []
    lines = manifest.read_text(encoding="utf-8", errors="replace").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def read_adrs(root: Path, adr_dir: str, anchor: str) -> dict:
    directory = root / adr_dir
    names = sorted(p.name for p in directory.glob("*.md")) if directory.is_dir() else []
    return {
        "dir_exists": directory.is_dir(),
        "files": names,
        "anchor_present": anchor in names,
    }


def diagnose(root: Path, config: dict) -> dict:
    ignore = config["ignore_dirs"]
    statuses = read_plan_statuses(root, config["plans_dir"], config["plan_prefix"])
    tag_exists = read_tag_exists(root, config["release_tag"])
    branch = evaluate_branch(
        read_current_branch(root), read_dirty_tree(root), config["default_branches"]
    )
    return {
        "root": str(root),
        "phase": detect_phase(statuses, config["closed_plan_statuses"], tag_exists),
        "plans": {"count": len(statuses), "statuses": statuses},
        "branch": branch,
        "release": {
            "tag": config["release_tag"],
            "tag_exists": tag_exists,
            "package_version": read_package_version(root),
        },
        "migrations": detect_migration_tool(root, config["migration_tools"]),
        "schema_file": find_schema_file(root, config["schema_file_candidates"]),
        "tests_present": has_tests(
            root, config["test_dir_names"], config["test_file_patterns"], ignore
        ),
        "workflow_risks": read_workflow_risks(
            root, config["workflow_dir"], config["risky_workflow_patterns"]
        ),
        "protected_paths": read_protect_manifest(root, config["protect_manifest"]),
        "adrs": read_adrs(root, config["adr_dir"], config["adr_anchor"]),
    }


def blockers(report: dict) -> list:
    """Condições que impedem seguir sem o usuário — derivadas do relatório, sem julgamento novo."""
    found = []
    branch = report["branch"]
    if not branch["determined"]:
        found.append("branch-undetermined")
    if branch["is_default"]:
        found.append("on-default-branch")
    if branch["dirty_tree"] is not False:
        found.append("worktree-not-clean-or-unknown")
    if not report["tests_present"]:
        found.append("no-tests-found")
    if report["workflow_risks"]:
        found.append("workflow-triggers-on-tag-or-release")
    return found


def print_readable(report: dict) -> None:
    print(
        f"phase: {report['phase']}  branch: {report['branch']['current'] or '(unknown)'}"
    )
    print(
        f"migrations: {report['migrations']['name']} ({report['migrations']['count']} files)"
    )
    print(f"schema file: {report['schema_file'] or '(not found)'}")
    print(
        f"tests present: {report['tests_present']}  release tag exists: {report['release']['tag_exists']}"
    )
    print(f"blockers: {', '.join(report['blockers']) or 'none'}")


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only terrain diagnosis for marco-0."
    )
    parser.add_argument("--root", default=".")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    return parser.parse_args()


def _check_tool_detection() -> bool:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "alembic" / "versions").mkdir(parents=True)
        (root / "alembic" / "versions" / "001.py").write_text("")
        (root / "alembic.ini").write_text("")
        found = detect_migration_tool(root, load_config(DEFAULT_CONFIG)["migration_tools"])
        return found["name"] == "alembic" and found["count"] == 1


def _phase_cases() -> list:
    closed = ["🟢 Aprovada", "⚪ Sintetizada"]
    return [
        ("no plans -> phase A", lambda: detect_phase([], closed, False) == "A"),
        ("active plan -> phase B", lambda: detect_phase(["🟡 Em execução"], closed, False) == "B"),
        ("all closed -> phase C", lambda: detect_phase(["🟢 Aprovada"], closed, False) == "C"),
        ("tag exists -> DONE", lambda: detect_phase(["🟢"], closed, True) == "DONE"),
        ("unknown tag never DONE", lambda: detect_phase(["🟢 Aprovada"], closed, None) == "C"),
    ]


def _terrain_cases() -> list:
    tags = [r"^\s*tags\s*:"]
    risky = "on:" + chr(10) + "  push:" + chr(10) + "    tags:" + chr(10) + "      - 'v*'"
    plain = "on:" + chr(10) + "  push:" + chr(10) + "    branches: [main]"
    return [
        ("default branch flagged", lambda: evaluate_branch("main", False, ["main"])["is_default"]),
        ("detached is undetermined", lambda: not evaluate_branch("(detached)", False, ["main"])["determined"]),
        ("tag trigger detected", lambda: bool(scan_workflow_text(risky, tags))),
        ("plain push not flagged", lambda: not scan_workflow_text(plain, tags)),
        ("migration tool by marker", _check_tool_detection),
    ]


def _selftest_cases() -> list:
    return _phase_cases() + _terrain_cases()


def run_selftest() -> int:
    failures = 0
    for name, check in _selftest_cases():
        ok = bool(check())
        failures += 0 if ok else 1
        print(f"  {'ok  ' if ok else 'FAIL'} {name}")
    total = len(_selftest_cases())
    print(f"\nselftest (diagnose_terrain): {total - failures}/{total} ok")
    return 1 if failures else 0


def main() -> int:
    args = get_args()
    if args.selftest:
        return run_selftest()
    report = diagnose(Path(args.root).resolve(), load_config(Path(args.config)))
    report["blockers"] = blockers(report)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_readable(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
