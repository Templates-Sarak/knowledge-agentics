"""check_publish.py — pré-voo (read-only) da Fase D do marco-0: o que pode dar errado ao publicar.

Uso:
    python check_publish.py --root <alvo> [--config config.json] [--json]
    python check_publish.py --selftest

Confere, SEM alterar nada, o que a publicação (PR com squash, tag, develop, proteção, Release) exige:
versão do package.json alinhada à tag, tag ainda livre, seção do CHANGELOG, workflows que disparam em
tag/release (criar a tag pode fazer deploy), `develop` nos triggers de CI, `gh` autenticado e se a
proteção de branch é possível no plano do repositório.

Cada checagem devolve `pass | warn | fail | unknown`. `unknown` NUNCA é tratado como `pass`.

Regras (padrao-escrita): zero hardcoded (nomes no config.json), responsabilidade única (só observa;
quem publica é o usuário, no HITL da Fase D).
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from typing import Optional
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from diagnose_terrain import (  # noqa: E402
    load_config,
    read_package_version,
    read_tag_exists,
    read_workflow_risks,
)

DEFAULT_CONFIG = Path(__file__).with_name("config.json")
GH_TIMEOUT_SECONDS = 30
PLAN_BLOCK_MARKERS = ("upgrade to github pro", "upgrade your plan", "not available for")


def check(check_id: str, status: str, detail: str) -> dict:
    return {"id": check_id, "status": status, "detail": detail}


def check_version(package_version: str, tag: str) -> dict:
    expected = tag.lstrip("v")
    if not package_version:
        return check(
            "version-aligned",
            "unknown",
            "no package.json version found — align the project's own manifest",
        )
    status = "pass" if package_version == expected else "fail"
    return check(
        "version-aligned",
        status,
        f"package.json={package_version}, tag expects {expected}",
    )


def check_tag_free(tag_exists: Optional[bool], tag: str) -> dict:
    if tag_exists is None:
        return check("tag-free", "unknown", "could not read tags")
    return check(
        "tag-free",
        "fail" if tag_exists else "pass",
        f"tag {tag} {'already exists' if tag_exists else 'is free'}",
    )


def check_changelog(root: Path, tag: str) -> dict:
    changelog = root / "CHANGELOG.md"
    if not changelog.is_file():
        return check("changelog-section", "fail", "CHANGELOG.md not found")
    found = tag.lstrip("v") in changelog.read_text(encoding="utf-8", errors="replace")
    return check(
        "changelog-section",
        "pass" if found else "fail",
        f"section for {tag.lstrip('v')} {'present' if found else 'missing'}",
    )


def check_workflow_triggers(risks: list) -> dict:
    if not risks:
        return check(
            "tag-triggers-deploy", "pass", "no workflow triggers on tag/release"
        )
    files = ", ".join(risk["file"] for risk in risks)
    return check(
        "tag-triggers-deploy",
        "warn",
        f"creating the tag may run: {files} — review before tagging",
    )


def check_integration_in_ci(root: Path, workflow_dir: str, branch: str) -> dict:
    directory = root / workflow_dir
    files = list(directory.glob("*.y*ml")) if directory.is_dir() else []
    if not files:
        return check("develop-in-ci", "unknown", "no workflows found")
    covered = any(
        branch in f.read_text(encoding="utf-8", errors="replace") for f in files
    )
    return check(
        "develop-in-ci",
        "pass" if covered else "warn",
        f"'{branch}' {'referenced' if covered else 'absent'} in workflows",
    )


def run_gh(args: list, root: Path) -> Optional[tuple]:
    """(returncode, saída) do gh, ou None quando o gh não existe / não respondeu."""
    if shutil.which("gh") is None:
        return None
    try:
        proc = subprocess.run(
            ["gh", *args],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=GH_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return proc.returncode, (proc.stdout + proc.stderr)


def classify_protection(result: Optional[tuple]) -> dict:
    """Leitura de GET .../branches/<b>/protection: 200 protegida, 404 apta (ainda sem proteção),
    403 com aviso de plano = indisponível neste plano. Qualquer outra coisa = não sei."""
    if result is None:
        return check("branch-protection", "unknown", "gh unavailable or did not answer")
    code, output = result
    text = output.lower()
    if code == 0:
        return check("branch-protection", "pass", "default branch is already protected")
    if "not protected" in text or "404" in text:
        return check(
            "branch-protection",
            "pass",
            "protection can be enabled (branch not protected yet)",
        )
    if any(marker in text for marker in PLAN_BLOCK_MARKERS):
        return check(
            "branch-protection",
            "warn",
            "plan does not allow branch protection — declare the gap, do not fake it",
        )
    return check("branch-protection", "unknown", output.strip()[:200])


def check_gh_auth(root: Path) -> dict:
    result = run_gh(["auth", "status"], root)
    if result is None:
        return check("gh-auth", "unknown", "gh CLI not found")
    return check(
        "gh-auth",
        "pass" if result[0] == 0 else "fail",
        "gh authenticated" if result[0] == 0 else "gh not authenticated",
    )


def read_default_branch(root: Path) -> str:
    result = run_gh(
        ["repo", "view", "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"],
        root,
    )
    return result[1].strip() if result and result[0] == 0 else ""


def collect(root: Path, config: dict) -> list:
    tag = config["release_tag"]
    risks = read_workflow_risks(
        root, config["workflow_dir"], config["risky_workflow_patterns"]
    )
    default_branch = read_default_branch(root)
    protection = (
        classify_protection(
            run_gh(
                [
                    "api",
                    f"repos/{{owner}}/{{repo}}/branches/{default_branch}/protection",
                ],
                root,
            )
        )
        if default_branch
        else check("branch-protection", "unknown", "default branch not resolved via gh")
    )
    return [
        check_version(read_package_version(root), tag),
        check_tag_free(read_tag_exists(root, tag), tag),
        check_changelog(root, tag),
        check_workflow_triggers(risks),
        check_integration_in_ci(
            root, config["workflow_dir"], config["integration_branch"]
        ),
        check_gh_auth(root),
        protection,
    ]


def overall(checks: list) -> str:
    statuses = {item["status"] for item in checks}
    if "fail" in statuses:
        return "blocked"
    return "review" if statuses & {"warn", "unknown"} else "ready"


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only pre-flight for the marco-0 publication phase."
    )
    parser.add_argument("--root", default=".")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    return parser.parse_args()


def _status(result: dict) -> str:
    return result["status"]


def _local_cases() -> list:
    risk = [{"file": "a.yml", "triggers": ["tags:"]}]
    return [
        ("version aligned", lambda: _status(check_version("1.0.0", "v1.0.0")) == "pass"),
        ("version mismatch fails", lambda: _status(check_version("0.9.0", "v1.0.0")) == "fail"),
        ("missing version unknown", lambda: _status(check_version("", "v1.0.0")) == "unknown"),
        ("existing tag fails", lambda: _status(check_tag_free(True, "v1.0.0")) == "fail"),
        ("unreadable tags unknown", lambda: _status(check_tag_free(None, "v1.0.0")) == "unknown"),
        ("tag trigger warns", lambda: _status(check_workflow_triggers(risk)) == "warn"),
    ]


def _remote_cases() -> list:
    not_protected = (1, "HTTP 404: Branch not protected")
    plan_block = (1, "HTTP 403: Upgrade to GitHub Pro")
    fail_and_pass = [check("a", "fail", ""), check("b", "pass", "")]
    return [
        ("protection 404 apt", lambda: _status(classify_protection(not_protected)) == "pass"),
        ("protection plan block warns", lambda: _status(classify_protection(plan_block)) == "warn"),
        ("no gh is unknown", lambda: _status(classify_protection(None)) == "unknown"),
        ("fail blocks overall", lambda: overall(fail_and_pass) == "blocked"),
        ("unknown never ready", lambda: overall([check("a", "unknown", "")]) == "review"),
    ]


def _selftest_cases() -> list:
    return _local_cases() + _remote_cases()


def run_selftest() -> int:
    failures = 0
    for name, test in _selftest_cases():
        ok = bool(test())
        failures += 0 if ok else 1
        print(f"  {'ok  ' if ok else 'FAIL'} {name}")
    total = len(_selftest_cases())
    print(f"\nselftest (check_publish): {total - failures}/{total} ok")
    return 1 if failures else 0


def main() -> int:
    args = get_args()
    if args.selftest:
        return run_selftest()
    checks = collect(Path(args.root).resolve(), load_config(Path(args.config)))
    report = {"overall": overall(checks), "checks": checks}
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for item in checks:
            print(f"[{item['status']:<7}] {item['id']}: {item['detail']}")
        print(f"overall: {report['overall']}")
    return 0 if report["overall"] != "blocked" else 1


if __name__ == "__main__":
    sys.exit(main())
