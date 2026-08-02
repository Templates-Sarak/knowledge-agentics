#!/usr/bin/env python
"""verificar.py — o comando composto de verificacao do projeto (binding Python).

    python verificar.py [--rapido]

Equivalente ao `npm run verificar` do binding TypeScript. Roda, nesta ordem:

    1. gate de conformidade em todos os modulos      (ferramentas/gate/validar.mjs --todos)
    2. .env.example em dia com os manifestos         (ferramentas/sincronizar-env.mjs --conferir)
    3. limiares e idiomas                            (ruff)
    4. tipos                                         (mypy)
    5. testes de CADA modulo, a partir da pasta dele (pytest)

O passo 5 roda modulo a modulo de proposito: testar a partir da pasta do modulo e o que prova que
ele roda ISOLADO — a condicao pratica de "pronto para extracao" (doutrina/03-operacao.md §6).

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

import os
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


def main() -> int:
    parar_no_primeiro = "--rapido" in sys.argv
    # Anotado: sem isto o tipo e inferido dos quatro primeiros (pasta=None) e os passos de
    # teste, que carregam um Path, nao entram.
    passos: list[tuple[str, list[str], Path | None]] = [
        ("conformidade (gate)", ["node", "ferramentas/gate/validar.mjs", "--todos"], None),
        ("ambiente (.env.example)", ["node", "ferramentas/sincronizar-env.mjs", "--conferir"], None),
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
