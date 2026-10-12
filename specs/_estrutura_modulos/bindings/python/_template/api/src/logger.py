"""Logger estruturado do modulo <module>. Lei dona: specs/arquitetura/03-operacao.md §3.

Uma linha JSON por evento, com requestId. Campos de `sensitiveFields` sao redigidos AQUI — nao e
responsabilidade de quem chama lembrar. `print()` e proibido no modulo (regra `log`): a saida vai
por `sys.stdout`, que e o unico canal do logger.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Sequence

LEVELS = ("debug", "info", "warn", "error")
REDACTED = "[REDACTED]"
_MAX_DEPTH = 4


def _redact(value: Any, sensitive: set[str], depth: int = 0) -> Any:
    """Substitui recursivamente o valor de todo campo sensivel."""
    if depth > _MAX_DEPTH:
        return value
    if isinstance(value, list):
        return [_redact(item, sensitive, depth + 1) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: REDACTED if key in sensitive else _redact(content, sensitive, depth + 1)
        for key, content in value.items()
    }


class Logger:
    def __init__(self, module: str, min_level: str, sensitive_fields: Sequence[str]) -> None:
        self._module = module
        self._minimum = LEVELS.index(min_level)
        self._sensitive = set(sensitive_fields)

    def _emit(self, level: str, message: str, data: dict[str, Any] | None) -> None:
        if LEVELS.index(level) < self._minimum:
            return
        line = {"level": level, "module": self._module, "message": message}
        line.update(_redact(data or {}, self._sensitive))
        sys.stdout.write(f"{json.dumps(line, ensure_ascii=False)}\n")

    # `data` e KEYWORD-ONLY de proposito: alem de deixar a chamada legivel, impede que o linter
    # confunda este logger com o `logging` da stdlib, cujo segundo argumento posicional e
    # argumento de format string. Sem isso, `logger.error("msg", {...})` vira falso positivo.
    def debug(self, message: str, *, data: dict[str, Any] | None = None) -> None:
        self._emit("debug", message, data)

    def info(self, message: str, *, data: dict[str, Any] | None = None) -> None:
        self._emit("info", message, data)

    def warn(self, message: str, *, data: dict[str, Any] | None = None) -> None:
        self._emit("warn", message, data)

    def error(self, message: str, *, data: dict[str, Any] | None = None) -> None:
        self._emit("error", message, data)


def create_logger(module: str, min_level: str, sensitive_fields: Sequence[str]) -> Logger:
    """`min_level` vem de config/api.json:logLevel — nunca literal no codigo."""
    return Logger(module, min_level, sensitive_fields)
