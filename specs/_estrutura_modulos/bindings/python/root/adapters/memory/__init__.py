"""Adapter de MEMORIA — obrigatorio em todo projeto. Lei dona: specs/arquitetura/01-modulo.md §5.2.

Nao e um adapter "de brinquedo": e o que permite os testes de todo modulo rodarem sem rede e sem
banco. Sem variante de memoria para cada porta, o desacoplamento nao e verificavel — e o que nao
e verificavel e folclore (ADR-003, specs/adr/000-decisoes-do-template.md).

Adapter NAO conhece dominio: nao existe `if modulo == "catalogo"` aqui dentro.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any, Sequence

from packages.ports import Pagina

_FAIXA_HASH = (10000, 99999)


class RepositorioEmMemoria:
    def __init__(self, iniciais: Sequence[Any] = ()) -> None:
        self._registros = list(iniciais)

    async def listar(self, pagina: int, tamanho: int) -> Pagina:
        inicio = (pagina - 1) * tamanho
        return Pagina(
            itens=self._registros[inicio : inicio + tamanho],
            pagina=pagina,
            tamanho=tamanho,
            total=len(self._registros),
        )

    async def buscar_por_hash(self, hash_universal: str) -> Any | None:
        return next((r for r in self._registros if r.hash == hash_universal), None)

    async def inserir(self, registro: Any) -> None:
        self._registros.append(registro)

    async def contar(self) -> int:
        return len(self._registros)


class AuditoriaEmMemoria:
    def __init__(self) -> None:
        self.eventos: list[dict[str, object]] = []

    async def registrar(self, evento: dict[str, object]) -> None:
        self.eventos.append(evento)


class RelogioDoSistema:
    """Existe AQUI, fora do dominio, exatamente para que o dominio nao chame `datetime.now()`."""

    def agora(self) -> str:
        return datetime.now(timezone.utc).isoformat()


class RelogioFixo:
    """Relogio congelado, para teste de motor deterministico."""

    def __init__(self, instante: str) -> None:
        self._instante = instante

    def agora(self) -> str:
        return self._instante


class GeradorPadrao:
    def hash(self) -> str:
        return str(random.randint(*_FAIXA_HASH))


class GeradorSequencial:
    def __init__(self, inicio: int = 10000) -> None:
        self._atual = inicio

    def hash(self) -> str:
        self._atual += 1
        return str(self._atual)


class AuthQueNega:
    """NEGA tudo. E o default seguro enquanto o projeto nao tem login (deny by default)."""

    async def verificar(self, token: str) -> dict[str, object] | None:
        return None


class StorageEmMemoria:
    """`arquivos` exposto para o teste inspecionar o que foi salvo — mesmo padrao de
    `AuditoriaEmMemoria`."""

    def __init__(self) -> None:
        self.arquivos: dict[str, bytes] = {}

    async def salvar(self, caminho: str, conteudo: bytes) -> None:
        self.arquivos[caminho] = conteudo

    async def buscar(self, caminho: str) -> bytes | None:
        return self.arquivos.get(caminho)

    async def remover(self, caminho: str) -> None:
        self.arquivos.pop(caminho, None)


class NotificadorEmMemoria:
    """`enviados` exposto pelo mesmo motivo de `StorageEmMemoria`: o teste afirma o que saiu."""

    def __init__(self) -> None:
        self.enviados: list[dict[str, str]] = []

    async def enviar(self, destinatario: str, assunto: str, corpo: str) -> None:
        self.enviados.append({"destinatario": destinatario, "assunto": assunto, "corpo": corpo})
