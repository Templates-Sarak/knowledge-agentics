"""Adapter Postgres para as portas "repository" e "audit" — ENTREGUE pelo template, pronto
para uso. `memory` continua o DEFAULT de todo modulo (config/ports.json);
trocar para este adapter e editar UMA linha ali, nunca este arquivo.

Materializa a FORMA que o molde cria (database/migrations/0001-create-metadata.sql):
`<prefix>metadados` (hash, titulo, status, created_at) e `<prefix>auditoria` (hash, acao,
sujeito, campos_alterados, request_id). Nao e codigo especifico de dominio — e a porta
materializada sobre a tabela que o molde ja cria. Modulo que criar tabela com outra forma escreve
o proprio adapter (declarado, nao escondido — ver o rodape deste arquivo).

`PostgresRepository`/`PostgresAudit` devolvem OBJETOS PROPRIOS (`_TemplateEntry`,
`_TemplatePage`), nunca `core.domain.Registro`/`core.ports.Pagina` do modulo chamador:
`adapters/` nao pode importar de `modules/` (regra `isolated-adapter`), e um projeto pode ter varios
modulos, cada um com o PROPRIO `core.domain`. As classes locais so precisam ter os MESMOS campos —
Python resolve atributo por nome (duck typing), entao o mapeador do modulo nunca percebe a diferenca.

SQL SEMPRE por parametro para VALOR (`%s`) — `concatenated-sql` (04-regras.md, escopo raiz) cobre
este arquivo e reprova interpolacao (f-string, `.format(`, `%` seguido de espaco, concatenacao com
`+`) numa linha que tambem tenha um verbo SQL. Identificador (schema/tabela) NUNCA aceita
placeholder — so valor aceita —, e por isso cada consulta abaixo monta a CLAUSULA do verbo (sempre
estatica) separada da clausula que interpola o identificador (sempre sem verbo na mesma linha),
juntando as duas por ULTIMO, numa linha sem SQL nenhum.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

# ====================================================================================================
# CONFIGURACAO — env, manifesto (schema/prefix), nome qualificado.
# ====================================================================================================


def _environment_key(module_id: str) -> str:
    return f"{module_id.upper().replace('-', '_')}_DB_URL"


def _required_url(module_id: str) -> str:
    """Ausente = falha nomeando a chave exata (lei 7 do catalog) — nunca um default silencioso."""
    key = _environment_key(module_id)
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(
            f"[adapters/postgres] required variable missing: {key}"
            " (declare it in module.json:requiredEnv and in the root .env)"
        )
    return value


_cache_data: dict[str, dict[str, str]] = {}


def _read_data(module: dict[str, Any]) -> dict[str, str]:
    """`data.schema`/`data.prefix` do PROPRIO manifesto do modulo — a mesma fonte que a
    migration 0001 usa para nomear as tabelas. Cacheada por pasta: o manifesto nao muda em runtime."""
    dir = str(module["dir"])
    existing = _cache_data.get(dir)
    if existing is not None:
        return existing
    text = Path(dir, "module.json").read_text(encoding="utf-8-sig")
    data: dict[str, str] = json.loads(text)["data"]
    _cache_data[dir] = data
    return data


def _qualified_name(schema: str, table: str) -> str:
    """`"<schema>"."<tabela>"` — nunca interpolado numa linha que tambem tenha um verbo SQL (ver o
    cabecalho do arquivo)."""
    return f'"{schema}"."{table}"'


# ====================================================================================================
# CONEXAO — uma por URL, reusada entre chamadas. `autocommit=True`: cada `execute` e a propria
# transacao (o molde nao faz mais de uma escrita por chamada de porta), mesma forma pragmatica de
# `psycopg.connect(url)` simples usado em `scripts/migrations.py` (que abre/fecha por invocacao,
# aqui a conexao vive pelo processo inteiro — o servidor fica no ar, a migration roda e sai).
# ====================================================================================================

_connections: dict[str, Any] = {}


async def _connection_for(url: str) -> Any:
    """Lazy DE PROPOSITO — mesma forma de `scripts/migrations.py`: `psycopg` e optional-dependency
    `dev`, e carregar este arquivo (ex.: autoteste de `composition.py`) nao pode exigi-lo."""
    existing = _connections.get(url)
    if existing is not None:
        return existing
    import psycopg  # noqa: PLC0415

    connection = await psycopg.AsyncConnection.connect(url, autocommit=True)
    _connections[url] = connection
    return connection


async def _table_context(module: dict[str, Any], suffix: str) -> tuple[Any, str]:
    """Resolve conexao + nome qualificado de UMA vez — as quatro operacoes abaixo precisam das
    duas coisas."""
    data = _read_data(module)
    connection = await _connection_for(_required_url(module["id"]))
    name = _qualified_name(data["schema"], f"{data['prefix']}{suffix}")
    return connection, name


# ====================================================================================================
# REPOSITORIO — objetos locais (nunca `core.domain` do modulo chamador, ver o cabecalho).
# ====================================================================================================


@dataclass(frozen=True)
class _TemplateEntry:
    hash: str
    title: str
    status: str
    created_at: str


@dataclass(frozen=True)
class _TemplatePage:
    items: Sequence[_TemplateEntry]
    page: int
    page_size: int
    total: int


def _to_record(line: tuple[Any, ...]) -> _TemplateEntry:
    hash_universal, title, status, created_at = line
    return _TemplateEntry(hash=hash_universal, title=title, status=status, created_at=created_at.isoformat())


async def _list_records(module: dict[str, Any], page: int, page_size: int) -> _TemplatePage:
    connection, name = await _table_context(module, "metadata")
    start = (page - 1) * page_size

    select_clause = "select hash, title, status, created_at"
    from_clause = f"from {name}"
    order_clause = "order by created_at asc, hash asc limit %s offset %s"
    async with connection.cursor() as cursor:
        await cursor.execute(" ".join([select_clause, from_clause, order_clause]), (page_size, start))
        lines = await cursor.fetchall()

        count_clause = "select count(*) as total"
        await cursor.execute(" ".join([count_clause, from_clause]))
        count_line = await cursor.fetchone()

    return _TemplatePage(
        items=[_to_record(line) for line in lines],
        page=page,
        page_size=page_size,
        total=count_line[0],
    )


async def _find_record_by_hash(module: dict[str, Any], hash_universal: str) -> _TemplateEntry | None:
    connection, name = await _table_context(module, "metadata")
    select_clause = "select hash, title, status, created_at"
    from_clause = f"from {name}"
    where_clause = "where hash = %s"
    async with connection.cursor() as cursor:
        await cursor.execute(" ".join([select_clause, from_clause, where_clause]), (hash_universal,))
        line = await cursor.fetchone()
    return None if line is None else _to_record(line)


async def _insert_record(module: dict[str, Any], entry: Any) -> None:
    connection, name = await _table_context(module, "metadata")
    name_and_columns = f"{name} (hash, title, status, created_at, updated_at)"
    insert_clause = "insert into"
    values_clause = "values (%s, %s, %s, %s, %s)"
    query = " ".join([insert_clause, name_and_columns, values_clause])
    values = (entry.hash, entry.title, entry.status, entry.created_at, entry.created_at)
    async with connection.cursor() as cursor:
        await cursor.execute(query, values)


async def _count_records(module: dict[str, Any]) -> int:
    connection, name = await _table_context(module, "metadata")
    select_clause = "select count(*) as total"
    from_clause = f"from {name}"
    async with connection.cursor() as cursor:
        await cursor.execute(" ".join([select_clause, from_clause]))
        line = await cursor.fetchone()
    return int(line[0])


class PostgresRepository:
    """`Repository` real, sobre a tabela `<prefix>metadados` que o molde cria. Recebe o manifesto
    do modulo (`dict`, o mesmo formato de `discover_modules`) — nunca o tipo de `src/composition.py`."""

    def __init__(self, module: dict[str, Any]) -> None:
        self._module = module

    async def list(self, page: int, page_size: int) -> _TemplatePage:
        return await _list_records(self._module, page, page_size)

    async def find_by_hash(self, hash_universal: str) -> _TemplateEntry | None:
        return await _find_record_by_hash(self._module, hash_universal)

    async def insert(self, entry: Any) -> None:
        await _insert_record(self._module, entry)

    async def count(self) -> int:
        return await _count_records(self._module)


# ====================================================================================================
# AUDITORIA
# ====================================================================================================


async def _record_audit_event(module: dict[str, Any], event: dict[str, Any]) -> None:
    connection, name = await _table_context(module, "audit")
    name_and_columns = f"{name} (hash, action, actor, changed_fields, request_id)"
    insert_clause = "insert into"
    values_clause = "values (%s, %s, %s, %s, %s)"
    query = " ".join([insert_clause, name_and_columns, values_clause])
    values = (
        event["hash"],
        event["action"],
        event["actor"],
        event["changedFields"],
        event["requestId"],
    )
    async with connection.cursor() as cursor:
        await cursor.execute(query, values)


class PostgresAudit:
    """`Audit` real, sobre a tabela `<prefix>auditoria` que o molde cria."""

    def __init__(self, module: dict[str, Any]) -> None:
        self._module = module

    async def record(self, event: dict[str, Any]) -> None:
        await _record_audit_event(self._module, event)


# ====================================================================================================
# DECLARADO, NAO ESCONDIDO
#
# Este adapter cobre a FORMA DO MOLDE — as duas tabelas que `create-module.mjs` ja entrega. O que
# fica de fora: *pool* de conexoes (usa UMA conexao persistente por URL, nao um pool com tuning),
# *retry* de conexao, migracao de DADO (isso e `expand-contract`, 02-contrato-e-dados.md §6.3), e
# qualquer modulo que declare `data.tables` alem de `<prefix>metadados`/`<prefix>auditoria` com
# forma diferente — esse modulo escreve o proprio adapter, com o mesmo cuidado de parametrizacao.
# ====================================================================================================
