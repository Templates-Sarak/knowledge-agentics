"""Dominio do modulo <modulo>: tipos e validacao. Lei dona: doutrina/01-modulo.md §2.

Regras desta camada:
  - ZERO I/O. Nada de rede, banco, arquivo ou ambiente.
  - ZERO nao-determinismo: `datetime.now()` e `random` sao PROIBIDOS aqui — o instante e o
    identificador chegam pelas portas `relogio` e `geradorId` (doutrina/01-modulo.md §5.1).
  - ZERO literal de vocabulario: os status validos vem de config/dominio.json.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Sequence


@dataclass(frozen=True)
class Registro:
    """Registro do dominio, na caixa do contrato (camelCase na borda, snake_case aqui)."""

    hash: str
    titulo: str
    status: str
    criado_em: str

    def como_dicionario(self) -> dict[str, Any]:
        return asdict(self)


class ErroDeValidacao(Exception):
    """Falha de validacao do dominio. A borda a traduz para VALIDACAO (400)."""

    def __init__(self, campo: str, mensagem: str) -> None:
        super().__init__(mensagem)
        self.campo = campo


def _exigir_titulo(titulo: Any) -> str:
    if not isinstance(titulo, str) or titulo.strip() == "":
        raise ErroDeValidacao("titulo", "titulo e obrigatorio")
    return titulo.strip()


def _exigir_status(status: Any, status_validos: Sequence[str]) -> str:
    if not status_validos:
        raise ErroDeValidacao("status", "config/dominio.json:statusValidos esta vazio")
    if status is None:
        return status_validos[0]
    if not isinstance(status, str) or status not in status_validos:
        raise ErroDeValidacao("status", f"status deve ser um de: {', '.join(status_validos)}")
    return status


def montar_registro(
    entrada: dict[str, Any],
    status_validos: Sequence[str],
    hash_universal: str,
    criado_em: str,
) -> Registro:
    """Valida a entrada externa e devolve o registro do dominio.

    O `hash` e o `criado_em` vem de FORA (portas), nunca daqui — e o que mantem o dominio
    deterministico e testavel sem congelar o relogio do sistema.
    """
    return Registro(
        hash=hash_universal,
        titulo=_exigir_titulo(entrada.get("titulo")),
        status=_exigir_status(entrada.get("status"), status_validos),
        criado_em=criado_em,
    )
