#!/usr/bin/env python
"""Runner de migrations — aplica e reverte database/migrations/*.sql de um modulo contra Postgres.

Lei dona: specs/arquitetura/02-contrato-e-dados.md §6.3.

    python scripts/migrations.py up <module>       aplica as PENDENTES, em ordem — pula o que ja foi
    python scripts/migrations.py down <module>     reverte so o ULTIMO aplicado (bloco "-- rollback")
    python scripts/migrations.py ciclo <module>    up -> down -> up — prova que o rollback fecha, de
                                                    qualquer estado inicial (vazio ou ja migrado)
    python scripts/migrations.py --selftest       prova interna (parser, ordem, pending/ultimo)

NAO MORA em tools/ (zero dependencia externa, lei 3 da base) — precisa de driver de Postgres,
e tools/ so usa node:*/stdlib. `psycopg` e optional-dependency do PROJETO (mesmo grupo `dev`
de `pip-audit`, `mypy`): o runner VIAJA COM O PROJETO, nao com a base, e por isso mora aqui
(scripts/) — nao em `adapters/` (adapter e para o processo composto trocar de provedor em RUNTIME;
isto e ferramenta de operacao, nunca importada por `src/composition.py`).

DECISAO (a) [psql via subprocess] x (b) [driver `psycopg`] — medido antes de escolher: nesta base de
desenvolvimento `psql` nao esta disponivel (fora do PATH, e o winget so oferece SERVIDOR completo,
nao um cliente isolado). Instalar um Postgres inteiro no sistema so para ter o CLI e action pesada e
dificil de reverter — desproporcional para um cliente. `psycopg` como optional-dependency e comum,
escopada ao projeto, instalada pelo MESMO `pip install -e ".[dev]"` que ja instala tudo mais.

ESTADO POR MODULO — sem controle de versao de migration, um projeto com tres migrations e dois
ambientes nao consegue rodar `up` a segunda vez. A tabela `<schema>.<prefix>migrations`
(`file_name text primary key`, `applied_at timestamptz`) e criada pela PRIMEIRA migration do
molde — nao por este runner: o runner so LE e ESCREVE nela, nunca decide a forma dela por fora do
SQL versionado. `up` aplica so o que falta; `down` reverte so o ULTIMO aplicado (nunca "tudo de
uma vez" — e o comportamento padrao de runner de migration, e o que faz `ciclo` funcionar de
QUALQUER estado inicial).

ORDEM DENTRO DE CADA MIGRATION, POR TRANSACAO: `up` roda o SQL da migration e SO DEPOIS insere a
linha de controle (a tabela pode ter acabado de nascer NAQUELE up); `down` faz o INVERSO — apaga a
linha de controle ANTES de rodar o SQL de reversao, porque reverter a migration 0001 apaga a propria
tabela de controle, e nao da para `DELETE` de uma tabela que acabou de sumir.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
MINIMUM_ARGUMENTS = 2

# ====================================================================================================
# NUCLEO PURO — nunca toca disco nem rede. E a metade que --selftest prova.
# ====================================================================================================

# `<module>` valido — kebab-case minusculo, a MESMA forma que `create-module.mjs` exige ao nascer.
# Serve DUAS funcoes: e o formato certo, E recusa de saida qualquer metacaractere de shell (`;`,
# `$()`, `&`, espaco) — nenhuma entrada adversarial passa daqui para caminho de arquivo nem para
# chave de ambiente.
VALID_MODULE_ID = re.compile(r"^[a-z][a-z0-9-]*$")

ROLLBACK_VERBS = re.compile(
    r"^(drop|alter|delete|truncate|revoke|grant|create|insert|update)\b", re.IGNORECASE
)

ROLLBACK_MARKER = re.compile(r"^\s*--\s*rollback\s*$", re.IGNORECASE)

COMMENTED_LINE = re.compile(r"^(\s*)--\s?(.*)$")


def split_up_down(content: str) -> tuple[str, str]:
    """Separa o UP do DOWN de uma migration. O marcador e uma LINHA so com "-- rollback" — nao uma
    ocorrencia em qualquer lugar do texto (diferente do regex de deteccao do gate, `data.mjs`, que
    so precisa saber SE existe bloco, nunca onde ele comeca)."""
    lines = content.splitlines()
    marker_index = next((i for i, line in enumerate(lines) if ROLLBACK_MARKER.match(line)), None)
    if marker_index is None:
        return content.strip(), ""

    up = "\n".join(lines[:marker_index]).strip()
    down = _uncomment_rollback(lines[marker_index + 1 :])
    return up, down


def _uncomment_rollback(lines: list[str]) -> str:
    """Descomenta o bloco de rollback, linha a linha — NUNCA lanca. Linha em branco: descartada.
    Linha comentada cujo conteudo comeca por um verbo de DDL/DML conhecido: descomentada (o "-- "
    sai, preservando a indentacao). Qualquer outra coisa — comentario de verdade, linha ja sem "--"
    — passa INALTERADA: e SQL valido de um jeito ou de outro. E o que faz o parser nunca quebrar,
    provado por --selftest com linha em branco, comentario que NAO e rollback, e indentacao."""
    result = []
    for line in lines:
        if line.strip() == "":
            continue
        matched = COMMENTED_LINE.match(line)
        if matched is None:
            result.append(line)
            continue
        indentation, rest = matched.group(1), matched.group(2)
        result.append(f"{indentation}{rest}" if ROLLBACK_VERBS.match(rest) else line)
    return "\n".join(result).strip()


def _prefix(file_name: str) -> str | None:
    """Nome do arquivo -> prefixo NNNN. `None` quando foge do padrao — a regra `migrations` do gate
    ja reprova isso; aqui so nao quebra a ordenacao."""
    matched = re.match(r"^(\d{4})-", file_name)
    return matched.group(1) if matched else None


def order_migrations(names: list[str], direction: str) -> list[str]:
    """UP em ordem crescente (prefixo NNNN); DOWN e o INVERSO — reverte o que aplicou por ultimo
    primeiro."""
    ordered = sorted(names, key=lambda name: _prefix(name) or name)
    return list(reversed(ordered)) if direction == "down" else ordered


def environment_key(module_id: str) -> str:
    """`<module>` -> `<MODULE>_DB_URL` — a MESMA convencao de `module.json:requiredEnv`."""
    return f"{module_id.upper().replace('-', '_')}_DB_URL"


def pending(ordered_up_names: list[str], applied: set[str]) -> list[str]:
    """Os nomes (ja ordenados por 'up') que NAO estao em `applied` — em ordem, o que falta aplicar."""
    return [name for name in ordered_up_names if name not in applied]


def last_applied(ordered_up_names: list[str], applied: set[str]) -> str | None:
    """O ULTIMO nome (na ordem 'up') que esta em `applied` — `None` se nenhum esta. E o alvo do
    `down`: reverter um passo, nunca a lista inteira, e por isso `ciclo` funciona de qualquer estado."""
    done = [name for name in ordered_up_names if name in applied]
    return done[-1] if done else None


# ====================================================================================================
# CASCA — todo I/O nomeado e isolado aqui.
# ====================================================================================================


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def _read_pairs_env(path: Path) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for line in _read_text(path).splitlines():
        cleaned = line.strip()
        if cleaned == "" or cleaned.startswith("#") or "=" not in cleaned:
            continue
        key, _, value = cleaned.partition("=")
        pairs.append((key.strip(), value.strip()))
    return pairs


def _load_env_root() -> None:
    """Carrega o `.env` UNICO da raiz no processo, sem sobrescrever o que ja veio de fora — mesma
    precedencia de `src/composition.py:_load_env_root` (ADR-004)."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for key, value in _read_pairs_env(path):
        os.environ.setdefault(key, value)


def _module_folder(module_id: str) -> Path:
    """`<module>` valido E dentro de `modules/` — nunca escapa por `..` nem separador. Falha
    nomeando a entrada recusada, nunca silenciosa."""
    if not VALID_MODULE_ID.match(module_id):
        raise RuntimeError(f'[migrations] "{module_id}" is not valid lowercase kebab-case')
    base = (ROOT / "modules").resolve()
    dir = (base / module_id).resolve()
    if base not in dir.parents:
        raise RuntimeError(f'[migrations] "{module_id}" resolves outside modules/ — refused')
    if not (dir / "module.json").exists():
        raise RuntimeError(f'[migrations] module "{module_id}" not found in modules/')
    return dir


def _list_migrations(module_dir: Path) -> list[str]:
    base = module_dir / "database" / "migrations"
    if not base.exists():
        return []
    return [p.name for p in base.iterdir() if p.suffix == ".sql"]


def _control_table(module_dir: Path) -> tuple[str, str, str]:
    """`data.schema`/`data.prefix` do manifesto — a MESMA fonte que declara as tabelas do
    modulo, nunca um terceiro lugar para o nome da tabela de controle. Devolve `(schema, tabela,
    qualificada)` — `qualificada` (`"schema"."tabela"`) permite as funcoes abaixo passarem UM
    parametro em vez de dois (limiar de 4 parametros)."""
    manifest = json.loads(_read_text(module_dir / "module.json"))
    data = manifest["data"]
    schema = data["schema"]
    table = f"{data['prefix']}migrations"
    return schema, table, f'"{schema}"."{table}"'


def _required_url(module_id: str) -> str:
    """Le uma variavel obrigatoria. Ausente = falha nomeando a chave (lei 7 do catalog, mesmo
    padrao de `api/src/config.py:env_required`)."""
    key = environment_key(module_id)
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(
            f"[migrations] required variable missing: {key}"
            " (declare it in module.json:requiredEnv and in the root .env)"
        )
    return value


def _connect(url: str) -> Any:
    # Lazy DE PROPOSITO (nao top-level): `psycopg` e optional-dependency `dev` (docstring do
    # modulo, DECISAO). `--selftest` prova so o nucleo puro e precisa rodar mesmo sem `[dev]`
    # instalado — import no topo quebraria isso so por causa de uma funcao que autoteste nunca chama.
    import psycopg  # noqa: PLC0415

    return psycopg.connect(url)


def _applied_migrations(connection: Any, schema: str, table: str) -> set[str]:
    """`set` dos `file_name` ja registrados — vazio (nunca erro) quando a tabela de controle ainda
    nao existe, o estado normal do PRIMEIRO `up` de um banco novo."""
    with connection.cursor() as cursor:
        cursor.execute(
            "select 1 from information_schema.tables where table_schema = %s and table_name = %s",
            (schema, table),
        )
        if cursor.fetchone() is None:
            return set()
        cursor.execute(f'select file_name from "{schema}"."{table}"')
        return {line[0] for line in cursor.fetchall()}


def _apply_one(connection: Any, module_dir: Path, name: str, control_table: str) -> None:
    """UMA migration, dentro de UMA transacao: roda o SQL, depois grava a linha de controle —
    nessa ordem, porque a migration 0001 CRIA a tabela de controle no proprio SQL que acabou de
    rodar. `control_table` ja vem qualificada (`_control_table`) — um parametro, nao dois."""
    content = _read_text(module_dir / "database" / "migrations" / name)
    up, _ = split_up_down(content)
    sys.stdout.write(f"  up {name}...\n")
    try:
        with connection.cursor() as cursor:
            if up:
                cursor.execute(up)
            cursor.execute(f"insert into {control_table} (file_name) values (%s)", (name,))
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def _revert_one(connection: Any, module_dir: Path, name: str, control_table: str) -> None:
    """UMA migration revertida, dentro de UMA transacao: apaga a linha de controle ANTES do SQL de
    reversao — a ordem inversa de `_apply_one`, pelo motivo simetrico: reverter 0001 apaga a
    propria tabela de controle."""
    content = _read_text(module_dir / "database" / "migrations" / name)
    _, down = split_up_down(content)
    sys.stdout.write(f"  down {name}...\n")
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"delete from {control_table} where file_name = %s", (name,))
            if down:
                cursor.execute(down)
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def _apply_pending(connection: Any, module_dir: Path) -> None:
    schema, table, control_table = _control_table(module_dir)
    up_names = order_migrations(_list_migrations(module_dir), "up")
    applied = _applied_migrations(connection, schema, table)
    missing = pending(up_names, applied)
    if not missing:
        sys.stdout.write("  nothing pending — every migration is already applied\n")
        return
    for name in missing:
        _apply_one(connection, module_dir, name, control_table)


def _revert_last(connection: Any, module_dir: Path) -> None:
    schema, table, control_table = _control_table(module_dir)
    up_names = order_migrations(_list_migrations(module_dir), "up")
    applied = _applied_migrations(connection, schema, table)
    target = last_applied(up_names, applied)
    if target is None:
        sys.stdout.write("  nothing applied — nothing to revert\n")
        return
    _revert_one(connection, module_dir, target, control_table)


def run_up(module_id: str) -> None:
    module_dir = _module_folder(module_id)
    url = _required_url(module_id)
    with _connect(url) as connection:
        _apply_pending(connection, module_dir)


def run_down(module_id: str) -> None:
    module_dir = _module_folder(module_id)
    url = _required_url(module_id)
    with _connect(url) as connection:
        _revert_last(connection, module_dir)


def run_cycle(module_id: str) -> None:
    sys.stdout.write(f"[migrations] {module_id}: up (applies pending)\n")
    run_up(module_id)
    sys.stdout.write(f"[migrations] {module_id}: down (reverts the last applied)\n")
    run_down(module_id)
    sys.stdout.write(f"[migrations] {module_id}: up (reapplies what down reverted)\n")
    run_up(module_id)
    sys.stdout.write(f"[migrations] {module_id}: cycle up -> down -> up OK\n")


# ====================================================================================================
# AUTOTESTE — so o nucleo puro. up/down/ciclo sao I/O de verdade, provados pelo ciclo real contra
# Postgres (relatorio do bloco), nao por fixture em memoria.
# ====================================================================================================


def _split_up_down_cases() -> list[dict[str, Any]]:
    return [
        {
            "name": "simple block (the real template)",
            "input_value": "\n".join(
                [
                    'create table "acme"."x_metadata" (id uuid);',
                    "",
                    "-- rollback",
                    '-- drop table if exists "acme"."x_audit";',
                    '-- drop table if exists "acme"."x_metadata";',
                ]
            ),
            "expected": (
                'create table "acme"."x_metadata" (id uuid);',
                'drop table if exists "acme"."x_audit";\ndrop table if exists "acme"."x_metadata";',
            ),
        },
        {
            "name": "ADVERSARIAL: blank line, a comment that is NOT rollback, indentation in the block",
            "input_value": "\n".join(
                [
                    'create table "acme"."x" (id uuid);',
                    "-- rollback",
                    '  -- drop table if exists "acme"."x";',
                    "",
                    "-- atencao: isto e destrutivo, confirme antes de rodar em producao",
                    "",
                    '     -- alter table "acme"."x" disable trigger all;',
                ]
            ),
            "expected": (
                'create table "acme"."x" (id uuid);',
                "\n".join(
                    [
                        'drop table if exists "acme"."x";',
                        "-- atencao: isto e destrutivo, confirme antes de rodar em producao",
                        '     alter table "acme"."x" disable trigger all;',
                    ]
                ),
            ),
        },
        {
            "name": "no rollback block: empty down, up is the whole file",
            "input_value": 'create table "acme"."x" (id uuid);',
            "expected": ('create table "acme"."x" (id uuid);', ""),
        },
        {
            "name": "empty rollback block (only the marker, nothing after)",
            "input_value": 'create table "acme"."x" (id uuid);\n-- rollback\n',
            "expected": ('create table "acme"."x" (id uuid);', ""),
        },
    ]


def _ordering_cases() -> list[dict[str, Any]]:
    return [
        {
            "name": "up: ascending order",
            "names": ["0002-add-status.sql", "0001-create-metadata.sql"],
            "direction": "up",
            "expected": ["0001-create-metadata.sql", "0002-add-status.sql"],
        },
        {
            "name": "down: REVERSE order",
            "names": ["0001-create-metadata.sql", "0002-add-status.sql"],
            "direction": "down",
            "expected": ["0002-add-status.sql", "0001-create-metadata.sql"],
        },
    ]


def _environment_key_cases() -> list[dict[str, Any]]:
    return [
        {"name": "simple", "id": "catalog", "expected": "CATALOG_DB_URL"},
        {"name": "with hyphen", "id": "production-line", "expected": "PRODUCTION_LINE_DB_URL"},
    ]


def _state_cases() -> list[dict[str, Any]]:
    """`pending`/`last_applied` contra os TRES estados que `ciclo` atravessa: banco vazio,
    parcialmente migrado, e totalmente migrado (o caso que trava `up` sem este controle de
    estado — medido no teste real)."""
    names = ["0001-create-metadata.sql", "0002-add-status.sql", "0003-create-index.sql"]
    return [
        {
            "name": "pending: empty database -> all three, in order",
            "fn": lambda: pending(names, set()) == names,
        },
        {
            "name": "pending: fully migrated database -> none (this is what used to hang)",
            "fn": lambda: pending(names, set(names)) == [],
        },
        {
            "name": "pending: only the first applied -> the second and third remain, in order",
            "fn": lambda: pending(names, {names[0]}) == [names[1], names[2]],
        },
        {
            "name": "last_applied: none applied -> None (down has nothing to revert)",
            "fn": lambda: last_applied(names, set()) is None,
        },
        {
            "name": "last_applied: all applied -> the THIRD (highest prefix), never the first",
            "fn": lambda: last_applied(names, set(names)) == names[2],
        },
        {
            "name": "last_applied: applied out of order in the set -> still the one with the HIGHEST prefix",
            "fn": lambda: last_applied(names, {names[2], names[0]}) == names[2],
        },
    ]


def _run_selftest() -> int:
    failures = 0
    total = 0

    for test_case in _split_up_down_cases():
        total += 1
        up_down_obtained = split_up_down(test_case["input_value"])
        ok = up_down_obtained == test_case["expected"]
        sys.stdout.write(f"  {'ok   ' if ok else 'FAIL'} split_up_down: {test_case['name']}\n")
        if not ok:
            failures += 1
            sys.stdout.write(f"       expected: {test_case['expected']!r}\n")
            sys.stdout.write(f"       obtained: {up_down_obtained!r}\n")

    for test_case in _ordering_cases():
        total += 1
        obtained_order = order_migrations(test_case["names"], test_case["direction"])
        ok = obtained_order == test_case["expected"]
        sys.stdout.write(f"  {'ok   ' if ok else 'FAIL'} order_migrations: {test_case['name']}\n")
        if not ok:
            failures += 1

    for test_case in _environment_key_cases():
        total += 1
        obtained_key = environment_key(test_case["id"])
        ok = obtained_key == test_case["expected"]
        sys.stdout.write(f"  {'ok   ' if ok else 'FAIL'} environment_key: {test_case['name']}\n")
        if not ok:
            failures += 1

    for test_case in _state_cases():
        total += 1
        try:
            ok = test_case["fn"]() is True
        except Exception:
            ok = False
        sys.stdout.write(f"  {'ok   ' if ok else 'FAIL'} {test_case['name']}\n")
        if not ok:
            failures += 1

    sys.stdout.write(f"\nselftest: {total - failures}/{total} ok\n")
    return 0 if failures == 0 else 1


# ====================================================================================================
# CLI
# ====================================================================================================


def main() -> int:
    argv = sys.argv[1:]
    if "--selftest" in argv:
        return _run_selftest()

    if len(argv) < MINIMUM_ARGUMENTS or argv[0] not in ("up", "down", "cycle"):
        sys.stderr.write(
            "usage: python scripts/migrations.py up|down|cycle <module>\n"
            "     python scripts/migrations.py --selftest\n"
        )
        return 1

    command, target = argv[0], argv[1]
    _load_env_root()
    try:
        if command == "up":
            run_up(target)
        elif command == "down":
            run_down(target)
        else:
            run_cycle(target)
        return 0
    except Exception as cause:  # noqa: BLE001 — traduzido para saida, nunca engolido
        sys.stderr.write(f"{cause}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
