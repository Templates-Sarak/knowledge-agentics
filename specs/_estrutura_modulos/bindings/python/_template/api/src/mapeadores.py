"""Mapeadores do modulo <modulo>. Lei dona: doutrina/02-contrato-e-dados.md §3.

Duas responsabilidades, e so estas:
  1. FRONTEIRA DE CAIXA — o banco fala snake_case, o contrato fala camelCase. Explicita, nas
     duas direcoes. Nunca implicita, nunca no ORM.
  2. PROJECAO DE SAIDA POR ALLOWLIST — a resposta e montada CAMPO A CAMPO. Devolver o registro
     cru e proibido (regra `saida-crua`): e o que impede vazar coluna nova ou PII acrescentada
     depois por quem nao pensou na borda.

A consequencia aceita de proposito: campo novo exige tocar aqui TAMBEM. Esquecer faz o campo nao
aparecer — falha silenciosa que o teste de contrato pega. O inverso, publicar por omissao, e pior.
"""
from __future__ import annotations

from typing import Any, Sequence

from core.dominio import Registro


def linha_para_dominio(linha: dict[str, Any]) -> Registro:
    """banco -> dominio"""
    return Registro(
        hash=linha["hash"],
        titulo=linha["titulo"],
        status=linha["status"],
        criado_em=linha["created_at"],
    )


def dominio_para_linha(registro: Registro) -> dict[str, Any]:
    """dominio -> banco"""
    return {
        "hash": registro.hash,
        "titulo": registro.titulo,
        "status": registro.status,
        "created_at": registro.criado_em,
    }


def para_contrato(registro: Registro) -> dict[str, Any]:
    """dominio -> CONTRATO (camelCase).

    A allowlist E esta funcao: o que nao esta escrito aqui nao e publicado. Campo declarado em
    modulo.json:camposSensiveis nunca entra — ou entra mascarado.
    """
    return {
        "hash": registro.hash,
        "titulo": registro.titulo,
        "status": registro.status,
        "criadoEm": registro.criado_em,
    }


def para_colecao(registros: Sequence[Registro], pagina: int, tamanho: int, total: int) -> dict[str, Any]:
    """Envelope unico de colecao (doutrina/02 §3.1)."""
    return {
        "itens": [para_contrato(r) for r in registros],
        "pagina": pagina,
        "tamanho": tamanho,
        "total": total,
    }
