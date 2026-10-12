"""Mapeadores do modulo <module>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §3.

Duas responsabilidades, e so estas:
  1. FRONTEIRA DE CAIXA — o banco fala snake_case, o contrato fala camelCase. Explicita, nas
     duas direcoes. Nunca implicita, nunca no ORM.
  2. PROJECAO DE SAIDA POR ALLOWLIST — a resposta e montada CAMPO A CAMPO. Devolver o registro
     cru e proibido (regra `raw-output`): e o que impede vazar coluna nova ou PII acrescentada
     depois por quem nao pensou na borda.

A consequencia aceita de proposito: campo novo exige tocar aqui TAMBEM. Esquecer faz o campo nao
aparecer — falha silenciosa que o teste de contrato pega. O inverso, publicar por omissao, e pior.
"""

from __future__ import annotations

from typing import Any, Sequence

from core.domain import Entry


def row_to_domain(line: dict[str, Any]) -> Entry:
    """banco -> dominio"""
    return Entry(
        hash=line["hash"],
        title=line["title"],
        status=line["status"],
        created_at=line["created_at"],
    )


def domain_to_row(entry: Entry) -> dict[str, Any]:
    """dominio -> banco"""
    return {
        "hash": entry.hash,
        "title": entry.title,
        "status": entry.status,
        "created_at": entry.created_at,
    }


def to_contract(entry: Entry) -> dict[str, Any]:
    """dominio -> CONTRATO (camelCase).

    A allowlist E esta funcao: o que nao esta escrito aqui nao e publicado. Campo declarado em
    module.json:sensitiveFields nunca entra — ou entra mascarado.
    """
    return {
        "hash": entry.hash,
        "title": entry.title,
        "status": entry.status,
        "createdAt": entry.created_at,
    }


def to_meta(manifest: dict[str, Any]) -> dict[str, Any]:
    """manifesto -> META publica (allowlist). `GET /meta` e rota SEM TOKEN (`publicRoutes`): o que
    nao esta aqui e reconhecimento — schema do banco, nomes de chave de segredo, vocabulario de
    `permissions`, `publicRoutes` e `sensitiveFields` nunca saem por esta rota.
    """
    return {
        "id": manifest["id"],
        "name": manifest["name"],
        "version": manifest["version"],
        "role": manifest["role"],
        "basePath": manifest["basePath"],
        "webPath": manifest["webPath"],
        "navigation": manifest["navigation"],
        "exportsSummary": manifest["exportsSummary"],
    }


def to_collection(entries: Sequence[Entry], page: int, page_size: int, total: int) -> dict[str, Any]:
    """Envelope unico de colecao (specs/arquitetura/02-contrato-e-dados.md §3.1)."""
    return {
        "items": [to_contract(r) for r in entries],
        "page": page,
        "pageSize": page_size,
        "total": total,
    }
