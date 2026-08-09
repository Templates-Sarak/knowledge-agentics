#!/usr/bin/env python
"""verificar.py — o comando composto de verificacao do projeto (binding Python).

    python verificar.py [--rapido]
    python verificar.py --cobertura          so cobertura (dezenas de segundos por modulo) — CI,
                                              nunca o `verificar` de cima: ver 03-operacao.md §7
    python verificar.py --lint-relatorio     ruff em SARIF, relatorios/lint.sarif — CI
    python verificar.py --seguranca          .env versionado + segredo no delta — CI, fail-closed
    python verificar.py --dependencias       pip-audit contra o piso de severidade — CI

Equivalente ao `npm run verificar` do binding TypeScript. Roda, nesta ordem:

    1. gate de conformidade em todos os modulos      (ferramentas/gate/validar.mjs --todos)
    2. .env.example em dia com os manifestos         (ferramentas/sincronizar-env.mjs --conferir)
    3. forma                                         (ruff format --check)
    4. limiares e idiomas                            (ruff check)
    5. tipos                                         (mypy)
    6. testes de CADA modulo, a partir da pasta dele (pytest)

Os limiares que o ruff cobra vem de `.ruff.toml`, GERADO de `ferramentas/gate/limiares.mjs` — a
mesma fonte que o gate usa. Nenhum numero de limiar e escrito a mao neste projeto.

O passo 5 roda modulo a modulo de proposito: testar a partir da pasta do modulo e o que prova que
ele roda ISOLADO — a condicao pratica de "pronto para extracao" (specs/arquitetura/03-operacao.md §6).

DEPENDENCIA DECLARADA: o gate e uma ferramenta Node — a mesma em todos os bindings, de proposito.
Um verificador por linguagem divergiria do outro, e a doutrina deixaria de ter uma unica leitura.

O projeto Python NAO declara Node: nada de package.json, nada de devDependency. O gate e ferramenta
de AUDITORIA, e roda pelo ferramental de quem desenvolve — nao pelo manifesto do projeto. Quem usa a
base Sarak ja tem Node (a propria base o exige), do mesmo modo que ja tem Python.

Busca: `$SARAK_NODE` (caminho do binario, se definido) > `$PATH`.

Se nenhuma achar o Node, o passo REPROVA. Deixa-lo passar com aviso tornaria "verde" indistinguivel
de "nao verificou" — o defeito que este template inteiro existe para impedir.

Sai com 0 se tudo passar; 1 no primeiro passo que falhar (`--rapido`) ou ao fim (padrao).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent


def _escrever(texto: str) -> None:
    sys.stdout.write(texto)
    sys.stdout.flush()


def _achar_node() -> str | None:
    """`SARAK_NODE` (caminho do binario) sobrepoe; senao, PATH.

    Nao ha um terceiro lugar: `SARAK_NODE_BIN` aponta para `node_modules/.bin`, que guarda os
    binarios dos PACOTES — nunca o proprio Node.
    """
    override = os.environ.get("SARAK_NODE")
    if override and Path(override).is_file():
        return override
    return shutil.which("node")


def _resolver(comando: list[str]) -> list[str] | None:
    """Ferramenta Python roda pelo interpretador ATUAL (`-m`), nunca pelo PATH.

    `shutil.which` nao enxerga ferramenta instalada num venv que nao esta ativado — e o caso
    normal em CI.
    """
    if comando[0] == "node":
        achado = _achar_node()
        return None if achado is None else [achado, *comando[1:]]
    return [sys.executable, "-m", *comando]


def _rodar(rotulo: str, comando: list[str], pasta: Path | None = None) -> bool:
    """Executa um passo e reporta. Ferramenta ausente REPROVA — nao verificado nunca vira 'ok'."""
    resolvido = _resolver(comando)
    if resolvido is None:
        _escrever(
            f"  FALHA {rotulo}: 'node' nao encontrado — passo NAO verificado.\n"
            "        Instale Node, ou aponte SARAK_NODE para o caminho do binario.\n"
        )
        return False

    resultado = subprocess.run(resolvido, cwd=pasta or RAIZ, check=False)
    # Ferramenta Python ausente devolve 1 com "No module named X" — reportar como nao verificado
    # seria mentira confortavel; aqui isso REPROVA, e a mensagem do proprio Python explica.
    ok = resultado.returncode == 0
    _escrever(f"  {'ok   ' if ok else 'FALHA'} {rotulo}\n")
    return ok


def _modulos() -> list[Path]:
    base = RAIZ / "modulos"
    if not base.exists():
        return []
    return [p for p in sorted(base.iterdir()) if not p.name.startswith("_") and (p / "modulo.json").exists()]


def _minima_de_cobertura() -> int | None:
    """`cobertura.minima` de `config/verificacao.json` — a MESMA politica que `hooks/test-cobertura.js`
    le para o push, uma fonte so. Ausente ou ilegivel: sem piso (o gate, nao este comando, cobra a
    ausencia da politica via `verificacao-declarada`)."""
    caminho = RAIZ / "config" / "verificacao.json"
    if not caminho.exists():
        return None
    try:
        minima = json.loads(caminho.read_text(encoding="utf-8")).get("cobertura", {}).get("minima")
    except (OSError, json.JSONDecodeError):
        return None
    return minima if isinstance(minima, int) else None


def _relatorio_degenerado(pasta_modulo: Path) -> str | None:
    """Motivo se o relatorio de cobertura for degenerado (ausente, vazio, ou com zero teste
    registrado); `None` quando esta tudo certo. Lei 7 aplicada ao RELATORIO, nao so ao exit code do
    pytest: uma ferramenta que 'passa' sem escrever nada de verdade nao pode contar como sucesso."""
    lcov = pasta_modulo / "relatorios" / "cobertura" / "lcov.info"
    junit = pasta_modulo / "relatorios" / "junit.xml"
    if not lcov.exists():
        return f"relatorio ausente: {lcov}"
    if "SF:" not in lcov.read_text(encoding="utf-8"):
        return f"relatorio degenerado (sem SF:): {lcov}"
    if not junit.exists():
        return f"relatorio ausente: {junit}"
    texto_junit = junit.read_text(encoding="utf-8")
    if "<testsuite" not in texto_junit:
        return f"relatorio degenerado (sem <testsuite): {junit}"
    casado = re.search(r'tests="(\d+)"', texto_junit)
    if casado is None or int(casado.group(1)) == 0:
        return "junit sem nenhum teste registrado — a suite nao rodou"
    return None


def _comando_de_cobertura(minima: int | None) -> list[str]:
    comando = [
        "pytest", "-q", "--cov=core", "--cov=api",
        "--cov-report=term", "--cov-report=lcov:relatorios/cobertura/lcov.info",
        "--junitxml=relatorios/junit.xml",
    ]
    if minima is not None:
        comando.append(f"--cov-fail-under={minima}")
    return comando


def _rodar_cobertura() -> int:
    """`--cobertura`: SO cobertura, por modulo — nao roda o resto do `verificar`. E o analogo do
    `ci:cobertura` do package.json: comando proprio, custa dezenas de segundos por modulo
    (03-operacao.md §7), por isso nao entra no `verificar` de cima nem no pre-commit/pre-push."""
    minima = _minima_de_cobertura()
    modulos = _modulos()
    if not modulos:
        _escrever("  !    nenhum modulo em modulos/ — nada para medir\n")
        return 0

    falhas = 0
    for m in modulos:
        ok = _rodar(f"cobertura: {m.name}", _comando_de_cobertura(minima), m)
        if ok:
            motivo = _relatorio_degenerado(m)
            if motivo is not None:
                ok = False
                _escrever(f"  FALHA cobertura: {m.name} (relatorio degenerado — {motivo})\n")
        falhas += 0 if ok else 1

    _escrever(f"\ncobertura: {'OK' if falhas == 0 else f'REPROVADO — {falhas} modulo(s)'}\n")
    return 1 if falhas > 0 else 0


def _rodar_lint_relatorio() -> int:
    """`--lint-relatorio`: o MESMO `ruff check .` do `verificar` — reprova nos MESMOS achados —, só
    que também grava SARIF (formato nativo do ruff, zero dependência nova — medido antes de escrever
    isto). Sem `--exit-zero` de propósito: medido que o ruff grava o arquivo mesmo saindo != 0 (achado
    real), então o relatório continua disponível para o CI mesmo quando este passo reprova — nenhum
    motivo para esconder achado atrás de um exit code artificialmente verde."""
    Path("relatorios").mkdir(exist_ok=True)
    comando = ["ruff", "check", ".", "--output-format=sarif", "--output-file=relatorios/lint.sarif"]
    ok = _rodar("lint (ruff --output-format=sarif)", comando, None)
    if not Path("relatorios/lint.sarif").exists():
        _escrever("  FALHA lint (ruff --output-format=sarif): relatorio nao foi escrito\n")
        ok = False
    _escrever(f"\nlint-relatorio: {'OK' if ok else 'REPROVADO'}\n")
    return 0 if ok else 1


def _rodar_delegado(rotulo: str, script: str) -> int:
    """Passos que já vivem em `ferramentas/` (Node, zero dependência) — este comando só delega, no
    mesmo padrão do passo 1 ("conformidade (gate)"). Evita reimplementar o parser de `npm audit`/
    `pip-audit` em Python: uma fonte só, chamada dos dois bindings."""
    ok = _rodar(rotulo, ["node", f"ferramentas/{script}"], None)
    return 0 if ok else 1


def _rodar_migrations(resto: list[str]) -> int:
    """`--migrations up|down|ciclo <modulo>` delega para `scripts/migrations.py` — script de
    PROJETO, não ferramenta (03-operação.md §9.3): precisa de driver de Postgres, fora do
    zero-dependência de `ferramentas/` (lei 3). Roda pelo interpretador ATUAL, não por `-m`
    (`scripts/migrations.py` é arquivo solto, não módulo instalado) — mesmo motivo de `_resolver`
    para os outros passos Python: um venv não ativado não aparece pelo PATH."""
    if not resto:
        _escrever("uso: python verificar.py --migrations up|down|ciclo <modulo>\n")
        return 1
    resultado = subprocess.run([sys.executable, "scripts/migrations.py", *resto], cwd=RAIZ, check=False)
    return resultado.returncode


def main() -> int:
    if "--cobertura" in sys.argv:
        return _rodar_cobertura()
    if "--lint-relatorio" in sys.argv:
        return _rodar_lint_relatorio()
    if "--seguranca" in sys.argv:
        return _rodar_delegado("seguranca", "ci-seguranca.mjs")
    if "--dependencias" in sys.argv:
        return _rodar_delegado("dependencias", "ci-dependencias.mjs")
    if "--migrations" in sys.argv:
        return _rodar_migrations(sys.argv[sys.argv.index("--migrations") + 1 :])

    parar_no_primeiro = "--rapido" in sys.argv
    # Anotado: sem isto o tipo e inferido dos quatro primeiros (pasta=None) e os passos de
    # teste, que carregam um Path, nao entram.
    passos: list[tuple[str, list[str], Path | None]] = [
        ("conformidade (gate)", ["node", "ferramentas/gate/validar.mjs", "--todos"], None),
        ("ambiente (.env.example)", ["node", "ferramentas/sincronizar-env.mjs", "--conferir"], None),
        # `--check` NAO escreve: no verificar o formatador ACUSA, e so o hook escreve.
        ("formato (ruff format)", ["ruff", "format", "--check", "."], None),
        ("limiares (ruff)", ["ruff", "check", "."], None),
        ("tipos (mypy)", ["mypy", "."], None),
    ]
    passos += [(f"testes: {m.name}", ["pytest", "-q"], m) for m in _modulos()]

    if not _modulos():
        _escrever("  !    nenhum modulo em modulos/ — nada para testar\n")

    falhas = 0
    for rotulo, comando, pasta in passos:
        if not _rodar(rotulo, comando, pasta):
            falhas += 1
            if parar_no_primeiro:
                break

    _escrever(f"\nverificar: {'OK' if falhas == 0 else f'REPROVADO — {falhas} passo(s)'}\n")
    return 1 if falhas > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
