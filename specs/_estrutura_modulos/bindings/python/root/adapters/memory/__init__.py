"""Adapter de MEMORIA — obrigatorio em todo projeto. Lei dona: specs/arquitetura/01-modulo.md §5.2.

Nao e um adapter "de brinquedo": e o que permite os testes de todo modulo rodarem sem rede e sem
banco. Sem variante de memoria para cada porta, o desacoplamento nao e verificavel — e o que nao
e verificavel e folclore (ADR-003, specs/adr/000-decisoes-do-template.md).

Adapter NAO conhece dominio: nao existe `if module == "catalog"` aqui dentro.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any, Sequence

from packages.ports import Page

_HASH_RANGE = (10000, 99999)


class InMemoryRepository:
    def __init__(self, initial: Sequence[Any] = ()) -> None:
        self._entries = list(initial)

    async def list(self, page: int, page_size: int) -> Page:
        start = (page - 1) * page_size
        return Page(
            items=self._entries[start : start + page_size],
            page=page,
            page_size=page_size,
            total=len(self._entries),
        )

    async def find_by_hash(self, hash_universal: str) -> Any | None:
        return next((r for r in self._entries if r.hash == hash_universal), None)

    async def insert(self, entry: Any) -> None:
        self._entries.append(entry)

    async def count(self) -> int:
        return len(self._entries)


class InMemoryAudit:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    async def record(self, event: dict[str, object]) -> None:
        self.events.append(event)


class SystemClock:
    """Existe AQUI, fora do dominio, exatamente para que o dominio nao chame `datetime.now()`."""

    def now(self) -> str:
        return datetime.now(timezone.utc).isoformat()


class FixedClock:
    """Relogio congelado, para teste de motor deterministico."""

    def __init__(self, instant: str) -> None:
        self._instant = instant

    def now(self) -> str:
        return self._instant


class DefaultIdGenerator:
    def hash(self) -> str:
        return str(random.randint(*_HASH_RANGE))


class SequentialIdGenerator:
    def __init__(self, start: int = 10000) -> None:
        self._current = start

    def hash(self) -> str:
        self._current += 1
        return str(self._current)


class DenyingTokenVerifier:
    """NEGA tudo. E o default seguro enquanto o projeto nao tem login (deny by default)."""

    async def verify(self, token: str) -> dict[str, object] | None:
        return None


class InMemoryStorage:
    """`files` exposto para o teste inspecionar o que foi salvo — mesmo padrao de
    `InMemoryAudit`."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    async def save(self, path: str, content: bytes) -> None:
        self.files[path] = content

    async def find(self, path: str) -> bytes | None:
        return self.files.get(path)

    async def remove(self, path: str) -> None:
        self.files.pop(path, None)


class InMemoryNotifier:
    """`sent` exposto pelo mesmo motivo de `InMemoryStorage`: o teste afirma o que saiu."""

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    async def send(self, recipient: str, subject: str, body: str) -> None:
        self.sent.append({"recipient": recipient, "subject": subject, "body": body})
