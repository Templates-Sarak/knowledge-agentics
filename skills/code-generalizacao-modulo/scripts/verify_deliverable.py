"""verify_deliverable.py — roda os SEIS degraus de verificacao do modulo generico e da o veredito.

    python verify_deliverable.py --repo <repo> --module <id> --denylist <arquivo-fora-do-repo> [--json]
    python verify_deliverable.py --selftest

Os seis degraus, cada um afirmando uma coisa DIFERENTE (a tabela vive no SKILL.md):

    1 compliant           node tools/gate/validate.mjs modules/<id>
    2 extractable         node tools/gate/validate.mjs --extraction modules/<id>
    3 works without infra o comando `verify` do binding (tipos + testes com adapters/memory)
    4 schema works        migration up + rollback em banco efemero (Docker)
    5 meets the contract  boot no compose efemero + /health, /meta e /resumo contra o openapi.yaml
    6 is generic          verify_neutrality.py com a denylist da origem

**A regra que este script existe para impedir:** degrau NOT EXECUTED nunca vira verde. Gate verde
prova conformidade ESTATICA — o gate le arquivo e nunca roda o modulo, por contrato. Confundir as duas
coisas ja fez, num sistema real, um comando de extracao "passar" sem nunca ter rodado um teste sequer.
Aqui, ausencia de comando declarado, Docker fora do ar ou compose faltando REPROVAM, com a razao dita.

**Por que a denylist mora FORA do repositorio verificado.** Ela lista os termos da origem — e um
arquivo com os termos da origem, versionado dentro do entregavel, E o vazamento que o degrau 6 existe
para pegar. O script recusa uma denylist que esteja sob `--repo`, antes de varrer qualquer coisa.

**Os comandos dos degraus 4 e 5 sao declarados, nao adivinhados** — em `config/verification.json` do
repositorio verificado (molde em `references/templates.md`). Zero hardcoded de infraestrutura: o
script nao inventa nome de compose nem de script npm; sem a declaracao, o degrau reprova por falta.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

OK, FAILED, NOT_EXECUTED = "ok", "failed", "not_executed"
VERIFICATION_CONFIG = "config/verification.json"
# Nome e chaves antigos (repositorios que ja declararam a config): aceitos por mapa centralizado.
LEGACY_VERIFICATION_CONFIG = "config/verificacao.json"
LEGACY_CONFIG_KEYS = {"contrato": "contract"}

# ==================================================================================================
# NUCLEO — puro. Nada daqui ate a marca "CASCA" toca disco, rede ou processo.
# ==================================================================================================


def decide_verdict(steps: list[dict]) -> tuple[int, str]:
    """Exit code + frase. `nao_executado` REPROVA junto com `falhou` — nunca e reportado como verde."""
    reds = [d for d in steps if d["state"] == FAILED]
    absent = [d for d in steps if d["state"] == NOT_EXECUTED]
    if reds or absent:
        parts = []
        if reds:
            parts.append(
                f"{len(reds)} red step(s): {', '.join(str(d['n']) for d in reds)}"
            )
        if absent:
            parts.append(
                f"{len(absent)} not executed: {', '.join(str(d['n']) for d in absent)}"
            )
        return 1, "REJECTED — " + "; ".join(parts)
    return 0, f"APPROVED — all {len(steps)} steps green"


def build_report(steps: list[dict]) -> str:
    """Tabela legivel dos degraus, na ordem, com o motivo de cada um que nao ficou verde."""
    symbol = {OK: "green", FAILED: "RED", NOT_EXECUTED: "NOT EXECUTED"}
    lines = [
        f"  {d['n']}. {d['name']:<28} {symbol[d['state']]}"
        + (f"  <- {d['reason']}" if d.get("reason") else "")
        for d in steps
    ]
    return "\n".join(lines)


def binding_command(has_package_json: bool, has_verify_py: bool) -> list[str] | None:
    """Comando `verificar` do binding do repositorio, ou None se nenhum dos dois manifestos existir."""
    if has_package_json:
        return ["npm", "run", "verify"]
    if has_verify_py:
        return [sys.executable, "verify.py"]
    return None


def denylist_inside_repo(denylist_path: Path, repo: Path) -> bool:
    """True quando a denylist esta sob o repositorio verificado — a origem vazando para o entregavel."""
    try:
        denylist_path.resolve().relative_to(repo.resolve())
        return True
    except ValueError:
        return False


# ==================================================================================================
# CASCA — daqui para baixo roda processo e le disco.
# ==================================================================================================


def _run(command: list[str], cwd: Path) -> tuple[bool, str]:
    """Executa e devolve (sucesso, ultima linha util da saida). Binario ausente nao explode: reprova."""
    executable = shutil.which(command[0]) or command[0]
    try:
        proc = subprocess.run(
            [executable, *command[1:]],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=1800,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return False, f"could not run {command[0]}: {error}"
    output = (proc.stdout + proc.stderr).strip().splitlines()
    return proc.returncode == 0, (output[-1][:160] if output else "")


def _step(n: int, name: str, state: str, reason: str = "") -> dict:
    return {"n": n, "name": name, "state": state, "reason": reason}


def _command_step(n: int, name: str, command: list[str], repo: Path) -> dict:
    success, output = _run(command, repo)
    return _step(n, name, OK if success else FAILED, "" if success else output)


def gate_steps(repo: Path, module: str) -> list[dict]:
    """Degraus 1 e 2 — conformidade e extraibilidade, os dois estaticos."""
    validate = "tools/gate/validate.mjs"
    target = f"modules/{module}"
    return [
        _command_step(1, "compliant", ["node", validate, target], repo),
        _command_step(
            2, "extractable", ["node", validate, "--extraction", target], repo
        ),
    ]


def no_infra_step(repo: Path) -> dict:
    """Degrau 3 — tipos e testes com adapters de memoria, sem rede e sem banco."""
    command = binding_command(
        (repo / "package.json").is_file(), (repo / "verify.py").is_file()
    )
    if command is None:
        return _step(
            3,
            "works without infra",
            NOT_EXECUTED,
            "no package.json nor verify.py at the root",
        )
    return _command_step(3, "works without infra", command, repo)


def ephemeral_steps(repo: Path, config: dict | None) -> list[dict]:
    """Degraus 4 e 5 — schema e contrato, compartilhando UM ambiente efemero (sobe, roda, derruba)."""
    if config is None:
        reason = f"{VERIFICATION_CONFIG} missing — declare compose, schema and contract"
        return [
            _step(4, "schema works", NOT_EXECUTED, reason),
            _step(5, "meets the contract", NOT_EXECUTED, reason),
        ]
    if not shutil.which("docker"):
        return [
            _step(4, "schema works", NOT_EXECUTED, "docker missing"),
            _step(5, "meets the contract", NOT_EXECUTED, "docker missing"),
        ]

    compose = ["docker", "compose", "-f", config["compose"]]
    came_up, output = _run([*compose, "up", "-d", "--wait"], repo)
    if not came_up:
        reason = f"ephemeral environment did not come up: {output}"
        return [
            _step(4, "schema works", FAILED, reason),
            _step(5, "meets the contract", FAILED, reason),
        ]
    try:
        return [
            _command_step(4, "schema works", config["schema"], repo),
            _command_step(5, "meets the contract", config["contract"], repo),
        ]
    finally:
        _run([*compose, "down", "-v"], repo)


def neutrality_step(repo: Path, denylist: Path) -> dict:
    """Degrau 6 — delega ao verify_neutrality.py, que e quem sabe casar variante de escrita."""
    script = Path(__file__).with_name("verify_neutrality.py")
    command = [
        sys.executable,
        str(script),
        "--root",
        str(repo),
        "--denylist",
        str(denylist),
    ]
    success, output = _run(command, repo)
    return _step(6, "is generic", OK if success else FAILED, "" if success else output)


def normalize_config(config: dict) -> dict:
    """Aceita as chaves antigas da config declarada, convertendo-as pelo mapa centralizado."""
    return {LEGACY_CONFIG_KEYS.get(key, key): value for key, value in config.items()}


def load_config(repo: Path) -> dict | None:
    """`config/verification.json` (ou o nome antigo) do repo verificado. None se ausente ou incompleto."""
    path = repo / VERIFICATION_CONFIG
    if not path.is_file():
        path = repo / LEGACY_VERIFICATION_CONFIG
    if not path.is_file():
        return None
    data = normalize_config(json.loads(path.read_text(encoding="utf-8")))
    if not all(key in data for key in ("compose", "schema", "contract")):
        return None
    return data


def _verdict_cases() -> list[str]:
    """Casos do veredito — e aqui que mora a regra central: NOT EXECUTED nunca e verde."""
    failures = []
    greens = [_step(n, f"d{n}", OK) for n in range(1, 7)]

    if decide_verdict(greens)[0] != 0:
        failures.append("six greens should approve")
    if decide_verdict(greens[:5] + [_step(6, "d6", FAILED)])[0] != 1:
        failures.append("red step did not reject")

    code, phrase = decide_verdict(
        greens[:5] + [_step(6, "d6", NOT_EXECUTED, "docker missing")]
    )
    if code != 1 or "not executed" not in phrase:
        failures.append(
            f"NOT EXECUTED turned green — the fail-open this script prevents: {phrase}"
        )

    if "NOT EXECUTED" not in build_report(
        [_step(4, "x", NOT_EXECUTED, "no docker")]
    ):
        failures.append("build_report hid a step that was not executed")
    return failures


def _environment_cases() -> list[str]:
    """Casos de ambiente — deteccao do binding e a denylist que nao pode morar dentro do repo."""
    failures = []

    if (
        binding_command(True, False) != ["npm", "run", "verify"]
        or binding_command(False, False) is not None
    ):
        failures.append("binding_command got the detection wrong")

    repo = Path("/tmp/repo") if sys.platform != "win32" else Path("C:/repo")
    if not denylist_inside_repo(repo / "config" / "deny.txt", repo):
        failures.append(
            "denylist inside the repo was not detected — the source would leak into the deliverable"
        )
    if denylist_inside_repo(repo.parent / "deny.txt", repo):
        failures.append("false positive: denylist outside the repo flagged as inside")
    legacy = normalize_config({"compose": "c.yml", "contrato": ["x"]})
    if legacy != {"compose": "c.yml", "contract": ["x"]}:
        failures.append(f"legacy config keys not normalized: {legacy}")
    return failures


def run_selftest() -> int:
    """Prova o NUCLEO com fixtures em memoria, sem tocar disco nem subir container."""
    failures = _verdict_cases() + _environment_cases()
    for failure in failures:
        print(f"[FAIL] {failure}")
    print(
        f"[{'OK' if not failures else 'ERROR'}] selftest of verify_deliverable: {len(failures)} failure(s)"
    )
    return 1 if failures else 0


def _parser() -> argparse.ArgumentParser:
    """CLI do script. Separada do `main` para manter as duas dentro do limiar de tamanho."""
    parser = argparse.ArgumentParser(
        description="Runs the six verification steps of the generic module."
    )
    parser.add_argument("--repo", help="Root of the generic module repository.")
    parser.add_argument("--module", help="Module id (the folder under modules/).")
    parser.add_argument(
        "--denylist",
        help="File with the source terms — OUTSIDE the verified repository.",
    )
    parser.add_argument(
        "--json", action="store_true", help="Print the result as JSON."
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="Prove the core with in-memory fixtures.",
    )
    return parser


def _refuse_target(repo: Path, module: str, denylist: Path) -> str:
    """Motivo para recusar o alvo antes de rodar qualquer degrau, ou string vazia se ele serve."""
    if not (repo / "modules" / module).is_dir():
        return f"modules/{module} does not exist in {repo}."
    if denylist_inside_repo(denylist, repo):
        return (
            "the denylist is INSIDE the verified repository — it lists the source terms, "
            "and versioning it there is exactly the leak that step 6 looks for."
        )
    return ""


def main() -> int:
    parser = _parser()
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()
    if not (args.repo and args.module and args.denylist):
        parser.error(
            "--repo, --module and --denylist are required (or use --selftest)"
        )

    repo, denylist = Path(args.repo).resolve(), Path(args.denylist)
    refusal = _refuse_target(repo, args.module, denylist)
    if refusal:
        print(f"[ERROR] {refusal}", file=sys.stderr)
        return 2

    steps = [
        *gate_steps(repo, args.module),
        no_infra_step(repo),
        *ephemeral_steps(repo, load_config(repo)),
        neutrality_step(repo, denylist),
    ]
    code, verdict = decide_verdict(steps)

    if args.json:
        print(
            json.dumps(
                {"verdict": verdict, "code": code, "steps": steps},
                indent=2,
                ensure_ascii=False,
            )
        )
        return code

    print(f"\n--- Deliverable verification: {args.module} ---")
    print(build_report(steps))
    print(f"\n[{'OK' if code == 0 else 'ERROR'}] {verdict}")
    return code


if __name__ == "__main__":
    sys.exit(main())
