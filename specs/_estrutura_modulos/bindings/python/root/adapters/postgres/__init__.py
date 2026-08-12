"""Adapter Postgres para as portas "repositorio" e "auditoria" — ENTREGUE pelo template, pronto
para uso (plan-2.2.md Bloco Z). `memory` continua o DEFAULT de todo modulo (config/ports.json);
trocar para este adapter e editar UMA linha ali, nunca este arquivo.

Materializa a FORMA que o molde cria (database/migrations/0001-cria-metadados.sql):
`<prefixo>metadados` (hash, titulo, status, created_at) e `<prefixo>auditoria` (hash, acao,
sujeito, campos_alterados, request_id). Nao e codigo especifico de dominio — e a porta
materializada sobre a tabela que o molde ja cria. Modulo que criar tabela com outra forma escreve
o proprio adapter (declarado, nao escondido — ver o rodape deste arquivo).

`RepositorioPostgres`/`AuditoriaPostgres` devolvem OBJETOS PROPRIOS (`_RegistroDoMolde`,
`_PaginaDoMolde`), nunca `core.domain.Registro`/`core.ports.Pagina` do modulo chamador:
`adapters/` nao pode importar de `modules/` (regra `adapter-isolado`), e um projeto pode ter varios
modulos, cada um com o PROPRIO `core.domain`. As classes locais so precisam ter os MESMOS campos —
Python resolve atributo por nome (duck typing), entao o mapeador do modulo nunca percebe a diferenca.

SQL SEMPRE por parametro para VALOR (`%s`) — `sql-concatenado` (04-regras.md, escopo raiz) cobre
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
# CONFIGURACAO — env, manifesto (schema/prefixo), nome qualificado.
# ====================================================================================================


def _environment_key(id_do_modulo: str) -> str:
    return f"{id_do_modulo.upper().replace('-', '_')}_DB_URL"


def _required_url(id_do_modulo: str) -> str:
    """Ausente = falha nomeando a chave exata (lei 7 do catalogo) — nunca um default silencioso."""
    chave = _environment_key(id_do_modulo)
    valor = os.environ.get(chave)
    if not valor:
        raise RuntimeError(
            f"[adapters/postgres] variavel obrigatoria ausente: {chave}"
            " (declare em modulo.json:envRequerido e no .env da raiz)"
        )
    return valor


_dados_cache: dict[str, dict[str, str]] = {}


def _read_data(modulo: dict[str, Any]) -> dict[str, str]:
    """`dados.schema`/`dados.prefixo` do PROPRIO manifesto do modulo — a mesma fonte que a
    migration 0001 usa para nomear as tabelas. Cacheada por pasta: o manifesto nao muda em runtime."""
    pasta = str(modulo["pasta"])
    existente = _dados_cache.get(pasta)
    if existente is not None:
        return existente
    texto = Path(pasta, "modulo.json").read_text(encoding="utf-8-sig")
    dados: dict[str, str] = json.loads(texto)["dados"]
    _dados_cache[pasta] = dados
    return dados


def _qualified_name(schema: str, tabela: str) -> str:
    """`"<schema>"."<tabela>"` — nunca interpolado numa linha que tambem tenha um verbo SQL (ver o
    cabecalho do arquivo)."""
    return f'"{schema}"."{tabela}"'


# ====================================================================================================
# CONEXAO — uma por URL, reusada entre chamadas. `autocommit=True`: cada `execute` e a propria
# transacao (o molde nao faz mais de uma escrita por chamada de porta), mesma forma pragmatica de
# `psycopg.connect(url)` simples usado em `scripts/migrations.py` (que abre/fecha por invocacao,
# aqui a conexao vive pelo processo inteiro — o servidor fica no ar, a migration roda e sai).
# ====================================================================================================

_conexoes: dict[str, Any] = {}


async def _connection_for(url: str) -> Any:
    """Lazy DE PROPOSITO — mesma forma de `scripts/migrations.py`: `psycopg` e optional-dependency
    `dev`, e carregar este arquivo (ex.: autoteste de `composicao.py`) nao pode exigi-lo."""
    existente = _conexoes.get(url)
    if existente is not None:
        return existente
    import psycopg  # noqa: PLC0415

    conexao = await psycopg.AsyncConnection.connect(url, autocommit=True)
    _conexoes[url] = conexao
    return conexao


async def _table_context(modulo: dict[str, Any], sufixo: str) -> tuple[Any, str]:
    """Resolve conexao + nome qualificado de UMA vez — as quatro operacoes abaixo precisam das
    duas coisas."""
    dados = _read_data(modulo)
    conexao = await _connection_for(_required_url(modulo["id"]))
    nome = _qualified_name(dados["schema"], f"{dados['prefixo']}{sufixo}")
    return conexao, nome


# ====================================================================================================
# REPOSITORIO — objetos locais (nunca `core.domain` do modulo chamador, ver o cabecalho).
# ====================================================================================================


@dataclass(frozen=True)
class _RegistroDoMolde:
    hash: str
    titulo: str
    status: str
    criado_em: str


@dataclass(frozen=True)
class _PaginaDoMolde:
    itens: Sequence[_RegistroDoMolde]
    pagina: int
    tamanho: int
    total: int


def _to_record(linha: tuple[Any, ...]) -> _RegistroDoMolde:
    hash_universal, titulo, status, criado_em = linha
    return _RegistroDoMolde(
        hash=hash_universal, titulo=titulo, status=status, criado_em=criado_em.isoformat()
    )


async def _list_records(modulo: dict[str, Any], pagina: int, tamanho: int) -> _PaginaDoMolde:
    conexao, nome = await _table_context(modulo, "metadados")
    inicio = (pagina - 1) * tamanho

    clausula_select = "select hash, titulo, status, created_at"
    clausula_from = f"from {nome}"
    clausula_ordem = "order by created_at asc, hash asc limit %s offset %s"
    async with conexao.cursor() as cursor:
        await cursor.execute(" ".join([clausula_select, clausula_from, clausula_ordem]), (tamanho, inicio))
        linhas = await cursor.fetchall()

        clausula_conta = "select count(*) as total"
        await cursor.execute(" ".join([clausula_conta, clausula_from]))
        linha_conta = await cursor.fetchone()

    return _PaginaDoMolde(
        itens=[_to_record(linha) for linha in linhas],
        pagina=pagina,
        tamanho=tamanho,
        total=linha_conta[0],
    )


async def _find_record_by_hash(modulo: dict[str, Any], hash_universal: str) -> _RegistroDoMolde | None:
    conexao, nome = await _table_context(modulo, "metadados")
    clausula_select = "select hash, titulo, status, created_at"
    clausula_from = f"from {nome}"
    clausula_onde = "where hash = %s"
    async with conexao.cursor() as cursor:
        await cursor.execute(" ".join([clausula_select, clausula_from, clausula_onde]), (hash_universal,))
        linha = await cursor.fetchone()
    return None if linha is None else _to_record(linha)


async def _insert_record(modulo: dict[str, Any], registro: Any) -> None:
    conexao, nome = await _table_context(modulo, "metadados")
    nome_e_colunas = f"{nome} (hash, titulo, status, created_at, updated_at)"
    clausula_insert = "insert into"
    clausula_values = "values (%s, %s, %s, %s, %s)"
    consulta = " ".join([clausula_insert, nome_e_colunas, clausula_values])
    valores = (registro.hash, registro.titulo, registro.status, registro.criado_em, registro.criado_em)
    async with conexao.cursor() as cursor:
        await cursor.execute(consulta, valores)


async def _count_records(modulo: dict[str, Any]) -> int:
    conexao, nome = await _table_context(modulo, "metadados")
    clausula_select = "select count(*) as total"
    clausula_from = f"from {nome}"
    async with conexao.cursor() as cursor:
        await cursor.execute(" ".join([clausula_select, clausula_from]))
        linha = await cursor.fetchone()
    return int(linha[0])


class RepositorioPostgres:
    """`Repositorio` real, sobre a tabela `<prefixo>metadados` que o molde cria. Recebe o manifesto
    do modulo (`dict`, o mesmo formato de `discover_modules`) — nunca o tipo de `src/composicao.py`."""

    def __init__(self, modulo: dict[str, Any]) -> None:
        self._modulo = modulo

    async def list(self, pagina: int, tamanho: int) -> _PaginaDoMolde:
        return await _list_records(self._modulo, pagina, tamanho)

    async def find_by_hash(self, hash_universal: str) -> _RegistroDoMolde | None:
        return await _find_record_by_hash(self._modulo, hash_universal)

    async def insert(self, registro: Any) -> None:
        await _insert_record(self._modulo, registro)

    async def count(self) -> int:
        return await _count_records(self._modulo)


# ====================================================================================================
# AUDITORIA
# ====================================================================================================


async def _record_audit_event(modulo: dict[str, Any], evento: dict[str, Any]) -> None:
    conexao, nome = await _table_context(modulo, "auditoria")
    nome_e_colunas = f"{nome} (hash, acao, sujeito, campos_alterados, request_id)"
    clausula_insert = "insert into"
    clausula_values = "values (%s, %s, %s, %s, %s)"
    consulta = " ".join([clausula_insert, nome_e_colunas, clausula_values])
    valores = (
        evento["hash"],
        evento["acao"],
        evento["sujeito"],
        evento["camposAlterados"],
        evento["requestId"],
    )
    async with conexao.cursor() as cursor:
        await cursor.execute(consulta, valores)


class AuditoriaPostgres:
    """`Auditoria` real, sobre a tabela `<prefixo>auditoria` que o molde cria."""

    def __init__(self, modulo: dict[str, Any]) -> None:
        self._modulo = modulo

    async def record(self, evento: dict[str, Any]) -> None:
        await _record_audit_event(self._modulo, evento)


# ====================================================================================================
# DECLARADO, NAO ESCONDIDO (plan-2.2.md Bloco Z)
#
# Este adapter cobre a FORMA DO MOLDE — as duas tabelas que `create-module.mjs` ja entrega. O que
# fica de fora: *pool* de conexoes (usa UMA conexao persistente por URL, nao um pool com tuning),
# *retry* de conexao, migracao de DADO (isso e `expand-contract`, 02-contrato-e-dados.md §6.3), e
# qualquer modulo que declare `dados.tabelas` alem de `<prefixo>metadados`/`<prefixo>auditoria` com
# forma diferente — esse modulo escreve o proprio adapter, com o mesmo cuidado de parametrizacao.
# ====================================================================================================
