"""Interfaces CANONICAS das portas. Lei dona: specs/arquitetura/00-arquitetura.md §3.3 e §4.2.

`packages/` e a excecao minima ao isolamento: so entra o que e interface, contrato ou design,
SEM logica de negocio. Regra de negocio nunca mora aqui — se dois modulos precisam da mesma
regra, duplica-se (ADR-001, specs/adr/000-decisoes-do-template.md).

Por que a interface canonica existe: um adapter generico precisa de uma forma comum. Se cada
modulo inventasse a propria, nenhum adapter serviria a dois. O `core/ports/` do modulo ESPELHA
o que esta aqui, e viaja com o modulo na extracao.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence, TypeVar

T = TypeVar("T")

ERROR_CODES: dict[str, int] = {
    "VALIDACAO": 400,
    "NAO_AUTENTICADO": 401,
    "NAO_AUTORIZADO": 403,
    "NAO_ENCONTRADO": 404,
    "CONFLITO": 409,
    "LIMITE_EXCEDIDO": 429,
    "DEPENDENCIA_EXTERNA": 502,
    "INTERNO": 500,
}

# Fonte NORMATIVA: `tools/gate/ports-vocabulary.mjs`, na base — os dois schemas do gate
# (`config-ports.schema.json`, `module.schema.json:ports.items.enum`) sao GERADOS dela. Esta
# lista, aqui, e a metade que nao da para gerar (interface de linguagem, nao config mecanica) —
# mantenha as duas iguais a mao (o SIMBOLO diverge de proposito: `PORTAS_CONHECIDAS` na fonte,
# `KNOWN_PORTS` aqui — Onda 3 do ADR-013/ADR-016, esqueleto e ferramental traduzem por regras
# diferentes; o CONTEUDO das duas listas e que precisa ser identico). `fila` NAO ESTA no
# vocabulario: arrasta retry, dead-letter, idempotencia e ordem de entrega — desenho de topologia
# que 00-arquitetura.md §5 diz que o template nao escolhe. `tokenVerifier` era `verificadorDeToken`
# (traducao de idioma, ADR-013/ADR-016) e, antes disso, `auth` ate o ADR-010.
KNOWN_PORTS = (
    "repository",
    "audit",
    "clock",
    "idGenerator",
    "storage",
    "tokenVerifier",
    "notifier",
)


class PortError(Exception):
    """Falha de porta. O adapter TRADUZ o erro do fornecedor para ca — o dominio nunca ve o SDK."""

    def __init__(self, codigo: str, mensagem: str, detalhe: str | None = None) -> None:
        super().__init__(mensagem)
        self.codigo = codigo
        self.detalhe = detalhe


@dataclass(frozen=True)
class Pagina:
    itens: Sequence[object]
    pagina: int
    tamanho: int
    total: int


@dataclass(frozen=True)
class AuditEvent:
    hash: str
    acao: str
    sujeito: str
    campos_alterados: list[str]
    request_id: str


class Repository(Protocol):
    async def list(self, pagina: int, tamanho: int) -> Pagina: ...

    async def find_by_hash(self, hash_universal: str) -> object | None: ...

    async def insert(self, registro: object) -> None: ...

    async def count(self) -> int: ...


class Audit(Protocol):
    async def record(self, evento: dict[str, object]) -> None: ...


class Clock(Protocol):
    def now(self) -> str: ...


class IdGenerator(Protocol):
    def hash(self) -> str: ...


class TokenVerifier(Protocol):
    async def verify(self, token: str) -> dict[str, object] | None: ...


class Storage(Protocol):
    """Guarda e recupera CONTEUDO por caminho — upload, o caso mais comum de quase todo projeto
    real. Superficie MINIMA e tipada por operacao, no precedente de
    `Repository`: nada de `executar(comando: str)` — o desenho que sustenta `sql-no-modulo` do
    lado do banco."""

    async def save(self, caminho: str, conteudo: bytes) -> None: ...

    async def find(self, caminho: str) -> bytes | None: ...

    async def remove(self, caminho: str) -> None: ...


class Notifier(Protocol):
    """Envia mensagem a um destinatario — e-mail, o outro caso mais comum."""

    async def send(self, destinatario: str, assunto: str, corpo: str) -> None: ...
