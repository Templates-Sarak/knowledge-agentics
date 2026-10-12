#!/usr/bin/env python
"""verify.py — o comando composto de verificacao do projeto (binding Python).

    python verify.py [--fast]
    python verify.py --coverage           so cobertura (dezenas de segundos por modulo) — CI,
                                           nunca o `verify` de cima: ver 03-operacao.md §7
    python verify.py --lint-report     ruff em SARIF, reports/lint.sarif — CI
    python verify.py --security           .env versionado + segredo no delta — CI, fail-closed
    python verify.py --dependencies       pip-audit contra o piso de severidade — CI
    python verify.py --migrations up|down|ciclo <module>   delega a scripts/migrations.py
    python verify.py --docker up|stop|logs   container local (profile `app`) — delega a tools/docker-up.mjs

Argumento fora dessa lista REPROVA (exit 1) — nunca cai no caminho padrao em silencio.

Equivalente ao `npm run verify` do binding TypeScript. Roda, nesta ordem:

    1. gate de conformidade em todos os modulos      (tools/gate/validate.mjs --all)
    2. .env.example em dia com os manifestos         (tools/sync-env.mjs --check)
    3. deploy em dia com os manifestos               (tools/sync-deploy.mjs --check)
    4. forma                                         (ruff format --check)
    5. limiares e idiomas                            (ruff check)
    6. tipos                                         (mypy)
    7. testes de CADA modulo, a partir da pasta dele (pytest)

Os limiares que o ruff cobra vem de `.ruff.toml`, GERADO de `tools/gate/thresholds.mjs` — a
mesma fonte que o gate usa. Nenhum numero de limiar e escrito a mao neste projeto.

O passo 7 roda modulo a modulo de proposito: testar a partir da pasta do modulo e o que prova que
ele roda ISOLADO — a condicao pratica de "pronto para extracao" (specs/arquitetura/03-operacao.md §6).

DEPENDENCIA DECLARADA: o gate e uma ferramenta Node — a mesma em todos os bindings, de proposito.
Um verificador por linguagem divergiria do outro, e a doutrina deixaria de ter uma unica leitura.

O projeto Python NAO declara Node: nada de package.json, nada de devDependency. O gate e ferramenta
de AUDITORIA, e roda pelo ferramental de quem desenvolve — nao pelo manifesto do projeto. Quem usa a
base Sarak ja tem Node (a propria base o exige), do mesmo modo que ja tem Python.

Busca: `$SARAK_NODE` (caminho do binario, se definido) > `$PATH`.

Se nenhuma achar o Node, o passo REPROVA. Deixa-lo passar com aviso tornaria "verde" indistinguivel
de "nao verificou" — o defeito que este template inteiro existe para impedir.

Sai com 0 se tudo passar; 1 no primeiro passo que falhar (`--fast`) ou ao fim (padrao).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _write(text: str) -> None:
    sys.stdout.write(text)
    sys.stdout.flush()


def _find_node() -> str | None:
    """`SARAK_NODE` (caminho do binario) sobrepoe; senao, PATH.

    Nao ha um terceiro lugar: `SARAK_NODE_BIN` aponta para `node_modules/.bin`, que guarda os
    binarios dos PACOTES — nunca o proprio Node.
    """
    override = os.environ.get("SARAK_NODE")
    if override and Path(override).is_file():
        return override
    return shutil.which("node")


def _resolve(command: list[str]) -> list[str] | None:
    """Ferramenta Python roda pelo interpretador ATUAL (`-m`), nunca pelo PATH.

    `shutil.which` nao enxerga ferramenta instalada num venv que nao esta ativado — e o caso
    normal em CI.
    """
    if command[0] == "node":
        finding = _find_node()
        return None if finding is None else [finding, *command[1:]]
    return [sys.executable, "-m", *command]


def _run(label: str, command: list[str], dir: Path | None = None) -> bool:
    """Executa um passo e reporta. Ferramenta ausente REPROVA — nao verificado nunca vira 'ok'."""
    resolved = _resolve(command)
    if resolved is None:
        _write(
            f"  FAIL {label}: 'node' not found — step NOT verified.\n"
            "        Install Node, or point SARAK_NODE at the binary path.\n"
        )
        return False

    result = subprocess.run(resolved, cwd=dir or ROOT, check=False)
    # Ferramenta Python ausente devolve 1 com "No module named X" — reportar como nao verificado
    # seria mentira confortavel; aqui isso REPROVA, e a mensagem do proprio Python explica.
    ok = result.returncode == 0
    _write(f"  {'ok   ' if ok else 'FAIL'} {label}\n")
    return ok


def _modules() -> list[Path]:
    base = ROOT / "modules"
    if not base.exists():
        return []
    return [p for p in sorted(base.iterdir()) if not p.name.startswith("_") and (p / "module.json").exists()]


def _minimum_coverage() -> int | None:
    """`coverage.minimum` de `config/verification.json` — a MESMA politica que `hooks/test-cobertura.js`
    le para o push, uma fonte so. Ausente ou ilegivel: sem piso (o gate, nao este comando, cobra a
    ausencia da politica via `verification-declared`)."""
    path = ROOT / "config" / "verification.json"
    if not path.exists():
        return None
    try:
        minimum = json.loads(path.read_text(encoding="utf-8")).get("coverage", {}).get("minimum")
    except (OSError, json.JSONDecodeError):
        return None
    return minimum if isinstance(minimum, int) else None


def _degenerate_report(module_dir: Path) -> str | None:
    """Motivo se o relatorio de cobertura for degenerado (ausente, vazio, ou com zero teste
    registrado); `None` quando esta tudo certo. Lei 7 aplicada ao RELATORIO, nao so ao exit code do
    pytest: uma ferramenta que 'passa' sem escrever nada de verdade nao pode contar como sucesso."""
    lcov = module_dir / "reports" / "coverage" / "lcov.info"
    junit = module_dir / "reports" / "junit.xml"
    if not lcov.exists():
        return f"report missing: {lcov}"
    if "SF:" not in lcov.read_text(encoding="utf-8"):
        return f"degenerate report (no SF:): {lcov}"
    if not junit.exists():
        return f"report missing: {junit}"
    junit_text = junit.read_text(encoding="utf-8")
    if "<testsuite" not in junit_text:
        return f"degenerate report (no <testsuite): {junit}"
    matched = re.search(r'tests="(\d+)"', junit_text)
    if matched is None or int(matched.group(1)) == 0:
        return "junit has no test recorded — the suite did not run"
    return None


def _coverage_command(minimum: int | None) -> list[str]:
    command = [
        "pytest",
        "-q",
        "--cov=core",
        "--cov=api",
        "--cov-report=term",
        "--cov-report=lcov:reports/coverage/lcov.info",
        "--junitxml=reports/junit.xml",
    ]
    if minimum is not None:
        command.append(f"--cov-fail-under={minimum}")
    return command


def _run_coverage() -> int:
    """`--coverage`: SO cobertura, por modulo — nao roda o resto do `verify`. E o analogo do
    `ci:coverage` do package.json: comando proprio, custa dezenas de segundos por modulo
    (03-operacao.md §7), por isso nao entra no `verify` de cima nem no pre-commit/pre-push."""
    minimum = _minimum_coverage()
    modules = _modules()
    if not modules:
        _write("  !    no module in modules/ — nothing to measure\n")
        return 0

    failures = 0
    for m in modules:
        ok = _run(f"coverage: {m.name}", _coverage_command(minimum), m)
        if ok:
            reason = _degenerate_report(m)
            if reason is not None:
                ok = False
                _write(f"  FAIL coverage: {m.name} (degenerate report — {reason})\n")
        failures += 0 if ok else 1

    _write(f"\ncoverage: {'OK' if failures == 0 else f'FAILED — {failures} module(s)'}\n")
    return 1 if failures > 0 else 0


def _run_lint_report() -> int:
    """`--lint-report`: o MESMO `ruff check .` do `verify` — reprova nos MESMOS achados —, só
    que também grava SARIF (formato nativo do ruff, zero dependência nova — medido antes de escrever
    isto). Sem `--exit-zero` de propósito: medido que o ruff grava o arquivo mesmo saindo != 0 (achado
    real), então o relatório continua disponível para o CI mesmo quando este passo reprova — nenhum
    motivo para esconder achado atrás de um exit code artificialmente verde."""
    Path("reports").mkdir(exist_ok=True)
    command = ["ruff", "check", ".", "--output-format=sarif", "--output-file=reports/lint.sarif"]
    ok = _run("lint (ruff --output-format=sarif)", command, None)
    if not Path("reports/lint.sarif").exists():
        _write("  FAIL lint (ruff --output-format=sarif): report was not written\n")
        ok = False
    _write(f"\nlint-report: {'OK' if ok else 'FAILED'}\n")
    return 0 if ok else 1


def _run_delegated(label: str, script: str) -> int:
    """Passos que já vivem em `tools/` (Node, zero dependência) — este comando só delega, no
    mesmo padrão do passo 1 ("conformidade (gate)"). Evita reimplementar o parser de `npm audit`/
    `pip-audit` em Python: uma fonte só, chamada dos dois bindings."""
    ok = _run(label, ["node", f"tools/{script}"], None)
    return 0 if ok else 1


def _run_migrations(rest: list[str]) -> int:
    """`--migrations up|down|ciclo <module>` delega para `scripts/migrations.py` — script de
    PROJETO, não ferramenta (03-operação.md §9.3): precisa de driver de Postgres, fora do
    zero-dependência de `tools/` (lei 3). Roda pelo interpretador ATUAL, não por `-m`
    (`scripts/migrations.py` é arquivo solto, não módulo instalado) — mesmo motivo de `_resolve`
    para os outros passos Python: um venv não ativado não aparece pelo PATH."""
    if not rest:
        _write("usage: python verify.py --migrations up|down|cycle <module>\n")
        return 1
    result = subprocess.run([sys.executable, "scripts/migrations.py", *rest], cwd=ROOT, check=False)
    return result.returncode


def _run_docker(rest: list[str]) -> int:
    """`--docker up|stop|logs` delega a `tools/docker-up.mjs` (Node, zero dependencia) — a MESMA
    ferramenta do binding Node, uma leitura so do compose. Sem Docker ou sem os dois `.env`, a
    propria ferramenta reprova nomeando o que falta."""
    if not rest:
        _write("usage: python verify.py --docker up|stop|logs\n")
        return 1
    command = _resolve(["node", "tools/docker-up.mjs", *rest])
    if command is None:
        _write("FAIL docker: 'node' not found. Install Node, or point SARAK_NODE at it.\n")
        return 1
    return subprocess.run(command, cwd=ROOT, check=False).returncode


# As UNICAS flags que este comando reconhece. Argumento fora desta lista REPROVA (`_recusar_
# desconhecidas`) em vez de cair no caminho padrao: sem isso, `--coveragee` (typo) rodava a cadeia
# INTEIRA, imprimia "verify: OK" e saia 0 — quem lesse o exit code concluiria que a cobertura
# rodou. Falso positivo silencioso e a direcao proibida (03-operacao.md §7); "nao verificado" nunca
# pode se parecer com "ok".
FLAGS = frozenset(
    {
        "--fast",
        "--coverage",
        "--lint-report",
        "--security",
        "--dependencies",
        "--migrations",
        "--docker",
    }
)


def _reject_unknown(argv: list[str]) -> str | None:
    """Motivo, se houver argumento nao reconhecido. `--migrations` e `--docker` consomem o resto
    (up|down|ciclo <module>; up|stop|logs), entao nada depois delas e julgado aqui — o dono daqueles
    argumentos e o runner."""
    for consumer in ("--migrations", "--docker"):
        if consumer in argv:
            argv = argv[: argv.index(consumer)]
    for arg in argv:
        if arg not in FLAGS:
            return f'unrecognized argument: "{arg}" — use one of {" ".join(sorted(FLAGS))}'
    return None


def _dispatch_mode(argv: list[str]) -> int | None:
    """Exit code do modo dedicado que `argv` pede, ou `None` quando o pedido e a cadeia inteira.

    Separado de `main` para que o guard de argumento desconhecido coubesse sem estourar os
    limiares que este proprio script cobra (C901/PLR0911, do `.ruff.toml` GERADO de
    tools/gate/thresholds.mjs): despachar modo e uma responsabilidade, rodar a cadeia e outra.
    Suprimir o limiar aqui seria o verificador isentando a si mesmo da regra que ele cobra.
    """
    simple: dict[str, Callable[[], int]] = {
        "--coverage": _run_coverage,
        "--lint-report": _run_lint_report,
        "--security": partial(_run_delegated, "security", "ci-security.mjs"),
        "--dependencies": partial(_run_delegated, "dependencies", "ci-dependencies.mjs"),
    }
    for flag, execute in simple.items():
        if flag in argv:
            return execute()
    if "--migrations" in argv:
        return _run_migrations(argv[argv.index("--migrations") + 1 :])
    if "--docker" in argv:
        return _run_docker(argv[argv.index("--docker") + 1 :])
    return None


def main() -> int:
    reason = _reject_unknown(sys.argv[1:])
    if reason is not None:
        _write(f"{reason}\n")
        return 1

    mode = _dispatch_mode(sys.argv)
    if mode is not None:
        return mode

    stop_at_first = "--fast" in sys.argv
    # Anotado: sem isto o tipo e inferido dos quatro primeiros (pasta=None) e os passos de
    # teste, que carregam um Path, nao entram.
    steps: list[tuple[str, list[str], Path | None]] = [
        ("conformance (gate)", ["node", "tools/gate/validate.mjs", "--all"], None),
        ("environment (.env.example)", ["node", "tools/sync-env.mjs", "--check"], None),
        ("deploy (container)", ["node", "tools/sync-deploy.mjs", "--check"], None),
        ("port schemas", ["node", "tools/generate-port-schemas.mjs", "--check"], None),
        # `--check` NAO escreve: no verificar o formatador ACUSA, e so o hook escreve.
        ("format (ruff format)", ["ruff", "format", "--check", "."], None),
        ("thresholds (ruff)", ["ruff", "check", "."], None),
        ("types (mypy)", ["mypy", "."], None),
    ]
    steps += [(f"tests: {m.name}", ["pytest", "-q"], m) for m in _modules()]

    if not _modules():
        _write("  !    no module in modules/ — nothing to test\n")

    failures = 0
    for label, command, dir in steps:
        if not _run(label, command, dir):
            failures += 1
            if stop_at_first:
                break

    _write(f"\nverify: {'OK' if failures == 0 else f'FAILED — {failures} step(s)'}\n")
    return 1 if failures > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
