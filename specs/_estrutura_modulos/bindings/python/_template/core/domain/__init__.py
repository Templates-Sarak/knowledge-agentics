"""Dominio do modulo <module>: tipos e validacao. Lei dona: specs/arquitetura/01-modulo.md §2.

Regras desta camada:
  - ZERO I/O. Nada de rede, banco, arquivo ou ambiente.
  - ZERO nao-determinismo: `datetime.now()` e `random` sao PROIBIDOS aqui — o instante e o
    identificador chegam pelas portas `clock` e `idGenerator` (specs/arquitetura/01-modulo.md §5.1).
  - ZERO literal de vocabulario: os status validos vem de config/domain.json.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Sequence


@dataclass(frozen=True)
class Entry:
    """Registro do dominio, na caixa do contrato (camelCase na borda, snake_case aqui)."""

    hash: str
    title: str
    status: str
    created_at: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class ValidationError(Exception):
    """Falha de validacao do dominio. A borda a traduz para VALIDACAO (400)."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field


def _require_title(title: Any) -> str:
    if not isinstance(title, str) or title.strip() == "":
        raise ValidationError("title", "title is required")
    return title.strip()


def _require_status(status: Any, valid_statuses: Sequence[str]) -> str:
    if not valid_statuses:
        raise ValidationError("status", "config/domain.json:validStatuses is empty")
    if status is None:
        return valid_statuses[0]
    if not isinstance(status, str) or status not in valid_statuses:
        raise ValidationError("status", f"status must be one of: {', '.join(valid_statuses)}")
    return status


def build_record(
    input_value: dict[str, Any],
    valid_statuses: Sequence[str],
    hash_universal: str,
    created_at: str,
) -> Entry:
    """Valida a entrada externa e devolve o registro do dominio.

    O `hash` e o `created_at` vem de FORA (portas), nunca daqui — e o que mantem o dominio
    deterministico e testavel sem congelar o relogio do sistema.
    """
    return Entry(
        hash=hash_universal,
        title=_require_title(input_value.get("title")),
        status=_require_status(input_value.get("status"), valid_statuses),
        created_at=created_at,
    )
