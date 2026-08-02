"""Portas do modulo <modulo>: o que ele precisa de INFRAESTRUTURA.
Lei dona: doutrina/01-modulo.md §5.

Aqui mora o CONTRATO ("preciso de um repositorio"), nunca a implementacao ("falo com Postgres").
Quem atende cada porta e decidido em config/portas.json, e o adapter e INJETADO no bootstrap.
O modulo nunca importa adapter nem SDK de fornecedor — trocar de provedor e editar um JSON.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

from ..dominio import Registro


@dataclass(frozen=True)
class Pagina:
    itens: Sequence[Registro]
    pagina: int
    tamanho: int
    total: int


class Repositorio(Protocol):
    """Persistencia dos registros do PROPRIO modulo. Nunca toca tabela de outro modulo."""

    async def listar(self, pagina: int, tamanho: int) -> Pagina: ...

    async def buscar_por_hash(self, hash_universal: str) -> Registro | None: ...

    async def inserir(self, registro: Registro) -> None: ...

    async def contar(self) -> int: ...


class Auditoria(Protocol):
    """Trilha append-only. Guarda o NOME dos campos alterados, nunca o valor."""

    async def registrar(self, evento: dict[str, object]) -> None: ...


class Relogio(Protocol):
    """O instante. Existe para que o dominio nunca chame `datetime.now()`."""

    def agora(self) -> str: ...


class GeradorId(Protocol):
    """Identificadores. Existe para que o dominio nunca chame `random`."""

    def hash(self) -> str: ...


class Auth(Protocol):
    async def verificar(self, token: str) -> dict[str, object] | None: ...


@dataclass(frozen=True)
class DependenciasModulo:
    """O conjunto que o bootstrap RECEBE.

    Cada nome aqui corresponde a uma chave de config/portas.json e a uma entrada de
    modulo.json:portas — o gate cobra que os tres concordem.
    """

    repositorio: Repositorio
    auditoria: Auditoria
    relogio: Relogio
    geradorId: GeradorId
