"""Portas do modulo <modulo>: o que ele precisa de INFRAESTRUTURA.
Lei dona: specs/arquitetura/01-modulo.md §5.

Aqui mora o CONTRATO ("preciso de um repositorio"), nunca a implementacao ("falo com Postgres").
Quem atende cada porta e decidido em config/ports.json, e o adapter e INJETADO no bootstrap.
O modulo nunca importa adapter nem SDK de fornecedor — trocar de provedor e editar um JSON.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

from ..domain import Registro


@dataclass(frozen=True)
class Pagina:
    itens: Sequence[Registro]
    pagina: int
    tamanho: int
    total: int


class Repositorio(Protocol):
    """Persistencia dos registros do PROPRIO modulo. Nunca toca tabela de outro modulo."""

    async def list(self, pagina: int, tamanho: int) -> Pagina: ...

    async def find_by_hash(self, hash_universal: str) -> Registro | None: ...

    async def insert(self, registro: Registro) -> None: ...

    async def count(self) -> int: ...


class Auditoria(Protocol):
    """Trilha append-only. Guarda o NOME dos campos alterados, nunca o valor."""

    async def record(self, evento: dict[str, object]) -> None: ...


class Relogio(Protocol):
    """O instante. Existe para que o dominio nunca chame `datetime.now()`."""

    def now(self) -> str: ...


class GeradorId(Protocol):
    """Identificadores. Existe para que o dominio nunca chame `random`."""

    def hash(self) -> str: ...


class Auth(Protocol):
    async def verify(self, token: str) -> dict[str, object] | None: ...


class Notificador(Protocol):
    """Envia mensagem a um destinatario — e-mail. Existe aqui so como amostra: nenhuma rota deste
    modulo a consome ainda (specs/arquitetura/01-modulo.md §5.1, plan-2.md Bloco S)."""

    async def send(self, destinatario: str, assunto: str, corpo: str) -> None: ...


@dataclass(frozen=True)
class DependenciasModulo:
    """O conjunto que o bootstrap RECEBE.

    Cada nome aqui corresponde a uma chave de config/ports.json e a uma entrada de
    module.json:portas — o gate cobra que os tres concordem.

    `notificador` e OPCIONAL de proposito: e a porta que este molde declara so para provar que a
    fabrica (`FABRICAS["notificador"]`, src/composicao.py) e alcancada de verdade no boot, nao so
    declarada — nenhuma rota do modulo a exige, e um modulo real e livre para nao a declarar.
    """

    repositorio: Repositorio
    auditoria: Auditoria
    relogio: Relogio
    geradorId: GeradorId
    notificador: Notificador | None = None
