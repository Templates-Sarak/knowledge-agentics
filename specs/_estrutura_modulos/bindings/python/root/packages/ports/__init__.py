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

CODIGOS_DE_ERRO: dict[str, int] = {
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
# (`config-ports.schema.json`, `modulo.schema.json:ports.items.enum`) sao GERADOS dela. Esta
# lista, aqui, e a metade que nao da para gerar (interface de linguagem, nao config mecanica) —
# mantenha as duas iguais a mao (plan-2.md Bloco S). `fila` SAIU do vocabulario: arrasta retry,
# dead-letter, idempotencia e ordem de entrega — desenho de topologia que 00-arquitetura.md §5 diz
# que o template nao escolhe.
PORTAS_CONHECIDAS = (
    "repositorio",
    "auditoria",
    "relogio",
    "geradorId",
    "storage",
    "auth",
    "notificador",
)


class ErroPorta(Exception):
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
class EventoDeAuditoria:
    hash: str
    acao: str
    sujeito: str
    campos_alterados: list[str]
    request_id: str


class Repositorio(Protocol):
    async def list(self, pagina: int, tamanho: int) -> Pagina: ...

    async def find_by_hash(self, hash_universal: str) -> object | None: ...

    async def insert(self, registro: object) -> None: ...

    async def count(self) -> int: ...


class Auditoria(Protocol):
    async def record(self, evento: dict[str, object]) -> None: ...


class Relogio(Protocol):
    def now(self) -> str: ...


class GeradorId(Protocol):
    def hash(self) -> str: ...


class Auth(Protocol):
    async def verify(self, token: str) -> dict[str, object] | None: ...


class Storage(Protocol):
    """Guarda e recupera CONTEUDO por caminho — upload, o caso mais comum de quase todo projeto
    real (plan-2.md Bloco S). Superficie MINIMA e tipada por operacao, no precedente de
    `Repositorio`: nada de `executar(comando: str)` — o desenho que sustenta `sql-no-modulo` do
    lado do banco."""

    async def save(self, caminho: str, conteudo: bytes) -> None: ...

    async def find(self, caminho: str) -> bytes | None: ...

    async def remove(self, caminho: str) -> None: ...


class Notificador(Protocol):
    """Envia mensagem a um destinatario — e-mail, o outro caso mais comum (plan-2.md Bloco S)."""

    async def send(self, destinatario: str, assunto: str, corpo: str) -> None: ...
