"""Logger estruturado do modulo <modulo>. Lei dona: specs/arquitetura/03-operacao.md §3.

Uma linha JSON por evento, com requestId. Campos de `camposSensiveis` sao redigidos AQUI — nao e
responsabilidade de quem chama lembrar. `print()` e proibido no modulo (regra `log`): a saida vai
por `sys.stdout`, que e o unico canal do logger.
"""
from __future__ import annotations

import json
import sys
from typing import Any, Sequence

NIVEIS = ("debug", "info", "warn", "error")
REDIGIDO = "[REDIGIDO]"
_PROFUNDIDADE_MAXIMA = 4


def _redigir(valor: Any, sensiveis: set[str], profundidade: int = 0) -> Any:
    """Substitui recursivamente o valor de todo campo sensivel."""
    if profundidade > _PROFUNDIDADE_MAXIMA:
        return valor
    if isinstance(valor, list):
        return [_redigir(item, sensiveis, profundidade + 1) for item in valor]
    if not isinstance(valor, dict):
        return valor
    return {
        chave: REDIGIDO if chave in sensiveis else _redigir(conteudo, sensiveis, profundidade + 1)
        for chave, conteudo in valor.items()
    }


class Logger:
    def __init__(self, modulo: str, nivel_minimo: str, campos_sensiveis: Sequence[str]) -> None:
        self._modulo = modulo
        self._minimo = NIVEIS.index(nivel_minimo)
        self._sensiveis = set(campos_sensiveis)

    def _emitir(self, nivel: str, mensagem: str, dados: dict[str, Any] | None) -> None:
        if NIVEIS.index(nivel) < self._minimo:
            return
        linha = {"nivel": nivel, "modulo": self._modulo, "mensagem": mensagem}
        linha.update(_redigir(dados or {}, self._sensiveis))
        sys.stdout.write(f"{json.dumps(linha, ensure_ascii=False)}\n")

    # `dados` e KEYWORD-ONLY de proposito: alem de deixar a chamada legivel, impede que o linter
    # confunda este logger com o `logging` da stdlib, cujo segundo argumento posicional e
    # argumento de format string. Sem isso, `logger.error("msg", {...})` vira falso positivo.
    def debug(self, mensagem: str, *, dados: dict[str, Any] | None = None) -> None:
        self._emitir("debug", mensagem, dados)

    def info(self, mensagem: str, *, dados: dict[str, Any] | None = None) -> None:
        self._emitir("info", mensagem, dados)

    def warn(self, mensagem: str, *, dados: dict[str, Any] | None = None) -> None:
        self._emitir("warn", mensagem, dados)

    def error(self, mensagem: str, *, dados: dict[str, Any] | None = None) -> None:
        self._emitir("error", mensagem, dados)


def criar_logger(modulo: str, nivel_minimo: str, campos_sensiveis: Sequence[str]) -> Logger:
    """`nivel_minimo` vem de config/api.json:nivelLog — nunca literal no codigo."""
    return Logger(modulo, nivel_minimo, campos_sensiveis)
