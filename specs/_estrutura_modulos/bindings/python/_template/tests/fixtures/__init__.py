"""Dubles das portas do modulo <module>. Lei dona: specs/arquitetura/03-operacao.md §5.

TODO teste do modulo roda com estes — sem rede e sem banco. Isso nao e preferencia de teste: e a
PROVA EXECUTAVEL de que o desacoplamento existe. Se um teste precisar de infraestrutura, a porta
esta mal desenhada ou falta o adapter de memoria.

Clock e idGenerator sao FIXOS aqui de proposito: e o que torna o motor testavel sem congelar o
relogio do sistema, e o que prova que o dominio nao chama `datetime.now()` escondido.
"""

from __future__ import annotations

from typing import Any, Sequence

from core.domain import Entry
from core.ports import ModuleDependencies, Page

FIXED_INSTANT = "2024-01-01T00:00:00.000Z"


class InMemoryRepository:
    def __init__(self, initial: Sequence[Entry] = ()) -> None:
        self._entries = list(initial)

    async def list(self, page: int, page_size: int) -> Page:
        start = (page - 1) * page_size
        return Page(
            items=self._entries[start : start + page_size],
            page=page,
            page_size=page_size,
            total=len(self._entries),
        )

    async def find_by_hash(self, hash_universal: str) -> Entry | None:
        return next((r for r in self._entries if r.hash == hash_universal), None)

    async def insert(self, entry: Entry) -> None:
        self._entries.append(entry)

    async def count(self) -> int:
        return len(self._entries)


class InMemoryAudit:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    async def record(self, event: dict[str, object]) -> None:
        self.events.append(event)


class FixedClock:
    def __init__(self, instant: str = FIXED_INSTANT) -> None:
        self._instant = instant

    def now(self) -> str:
        return self._instant


class SequentialIdGenerator:
    """Sequencial e previsivel: teste que depende de sorteio nao e teste."""

    def __init__(self, start: int = 10000) -> None:
        self._current = start

    def hash(self) -> str:
        self._current += 1
        return str(self._current)


class FakeAuth:
    """Aceita um token conhecido. Qualquer outro e negado — deny by default."""

    def __init__(self, permissions: Sequence[str], credential: str = "test-token") -> None:
        self._permissions = list(permissions)
        self._token = credential

    async def verify(self, token: str) -> dict[str, Any] | None:
        return {"permissions": self._permissions} if token == self._token else None


def create_dependencies(initial: Sequence[Entry] = ()) -> ModuleDependencies:
    return ModuleDependencies(
        repository=InMemoryRepository(initial),
        audit=InMemoryAudit(),
        clock=FixedClock(),
        idGenerator=SequentialIdGenerator(),
    )


def record_example(**overrides: Any) -> Entry:
    default_status = {
        "hash": "10001",
        "title": "Example",
        "status": "draft",
        "created_at": FIXED_INSTANT,
    }
    default_status.update(overrides)
    return Entry(**default_status)
