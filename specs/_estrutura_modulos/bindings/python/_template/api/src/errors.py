"""Taxonomia FECHADA de erro do modulo <module>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §3.1.

Fechada quer dizer: acrescentar codigo aqui e mudanca de contrato, nao improviso de rota.
A mensagem ao cliente e generica e estavel; o detalhe vai so para o log, ligado pelo requestId.
"""

from __future__ import annotations

from typing import Any

CODES: dict[str, int] = {
    "VALIDATION": 400,
    "UNAUTHENTICATED": 401,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "CONFLICT": 409,
    "LIMIT_EXCEEDED": 429,
    "EXTERNAL_DEPENDENCY": 502,
    "INTERNAL": 500,
}


class ApiError(Exception):
    """O unico erro que a borda sabe traduzir em resposta."""

    def __init__(self, code: str, message: str, detail: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail

    @property
    def status(self) -> int:
        return CODES[self.code]


def error_envelope(error: ApiError, request_id: str) -> dict[str, Any]:
    """Envelope UNICO de erro. Toda falha sai exatamente nesta forma."""
    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "requestId": request_id,
        }
    }
