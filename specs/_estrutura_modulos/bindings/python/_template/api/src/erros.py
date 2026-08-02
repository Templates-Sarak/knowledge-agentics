"""Taxonomia FECHADA de erro do modulo <modulo>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §3.1.

Fechada quer dizer: acrescentar codigo aqui e mudanca de contrato, nao improviso de rota.
A mensagem ao cliente e generica e estavel; o detalhe vai so para o log, ligado pelo requestId.
"""
from __future__ import annotations

from typing import Any

CODIGOS: dict[str, int] = {
    "VALIDACAO": 400,
    "NAO_AUTENTICADO": 401,
    "NAO_AUTORIZADO": 403,
    "NAO_ENCONTRADO": 404,
    "CONFLITO": 409,
    "LIMITE_EXCEDIDO": 429,
    "DEPENDENCIA_EXTERNA": 502,
    "INTERNO": 500,
}


class ErroApi(Exception):
    """O unico erro que a borda sabe traduzir em resposta."""

    def __init__(self, codigo: str, mensagem: str, detalhe: str | None = None) -> None:
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem
        self.detalhe = detalhe

    @property
    def status(self) -> int:
        return CODIGOS[self.codigo]


def envelope_de_erro(erro: ErroApi, request_id: str) -> dict[str, Any]:
    """Envelope UNICO de erro. Toda falha sai exatamente nesta forma."""
    return {"erro": {"codigo": erro.codigo, "mensagem": erro.mensagem, "requestId": request_id}}
