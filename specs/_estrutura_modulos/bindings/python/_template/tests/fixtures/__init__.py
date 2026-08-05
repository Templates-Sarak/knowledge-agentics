"""Dubles das portas do modulo <modulo>. Lei dona: specs/arquitetura/03-operacao.md §5.

TODO teste do modulo roda com estes — sem rede e sem banco. Isso nao e preferencia de teste: e a
PROVA EXECUTAVEL de que o desacoplamento existe. Se um teste precisar de infraestrutura, a porta
esta mal desenhada ou falta o adapter de memoria.

Relogio e geradorId sao FIXOS aqui de proposito: e o que torna o motor testavel sem congelar o
relogio do sistema, e o que prova que o dominio nao chama `datetime.now()` escondido.
"""

from __future__ import annotations

from typing import Any, Sequence

from core.dominio import Registro
from core.portas import DependenciasModulo, Pagina

INSTANTE_FIXO = "2024-01-01T00:00:00.000Z"


class RepositorioEmMemoria:
    def __init__(self, iniciais: Sequence[Registro] = ()) -> None:
        self._registros = list(iniciais)

    async def listar(self, pagina: int, tamanho: int) -> Pagina:
        inicio = (pagina - 1) * tamanho
        return Pagina(
            itens=self._registros[inicio : inicio + tamanho],
            pagina=pagina,
            tamanho=tamanho,
            total=len(self._registros),
        )

    async def buscar_por_hash(self, hash_universal: str) -> Registro | None:
        return next((r for r in self._registros if r.hash == hash_universal), None)

    async def inserir(self, registro: Registro) -> None:
        self._registros.append(registro)

    async def contar(self) -> int:
        return len(self._registros)


class AuditoriaEmMemoria:
    def __init__(self) -> None:
        self.eventos: list[dict[str, object]] = []

    async def registrar(self, evento: dict[str, object]) -> None:
        self.eventos.append(evento)


class RelogioFixo:
    def __init__(self, instante: str = INSTANTE_FIXO) -> None:
        self._instante = instante

    def agora(self) -> str:
        return self._instante


class GeradorSequencial:
    """Sequencial e previsivel: teste que depende de sorteio nao e teste."""

    def __init__(self, inicio: int = 10000) -> None:
        self._atual = inicio

    def hash(self) -> str:
        self._atual += 1
        return str(self._atual)


class AuthDeTeste:
    """Aceita um token conhecido. Qualquer outro e negado — deny by default."""

    def __init__(self, permissoes: Sequence[str], token_valido: str = "token-de-teste") -> None:
        self._permissoes = list(permissoes)
        self._token = token_valido

    async def verificar(self, token: str) -> dict[str, Any] | None:
        return {"permissoes": self._permissoes} if token == self._token else None


def criar_dependencias(iniciais: Sequence[Registro] = ()) -> DependenciasModulo:
    return DependenciasModulo(
        repositorio=RepositorioEmMemoria(iniciais),
        auditoria=AuditoriaEmMemoria(),
        relogio=RelogioFixo(),
        geradorId=GeradorSequencial(),
    )


def registro_de_exemplo(**sobrescrever: Any) -> Registro:
    padrao = {"hash": "10001", "titulo": "Exemplo", "status": "rascunho", "criado_em": INSTANTE_FIXO}
    padrao.update(sobrescrever)
    return Registro(**padrao)
