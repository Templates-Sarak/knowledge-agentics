"""Motor do modulo <modulo>: geracao DETERMINISTICA do artefato publicavel.
Lei dona: specs/arquitetura/01-modulo.md §2 (so existe se geraArtefato = true).

Deterministico significa: mesma entrada, saida byte a byte identica. Por isso o instante e o
identificador chegam prontos, de fora — `datetime.now()` e `random` sao proibidos aqui e o gate
reprova (regra `determinismo`). E o que torna o motor testavel sem congelar relogio.
"""

from __future__ import annotations

import html
import re

from ..domain import Registro

_MARCADOR = re.compile(r"\{\{(\w+)\}\}")


def _fill(template: str, valores: dict[str, str]) -> str:
    """Substitui `{{chave}}` pelos valores. Marcador sem valor e PRESERVADO, nunca apagado."""

    def replace(achado: re.Match[str]) -> str:
        return valores.get(achado.group(1), achado.group(0))

    return _MARCADOR.sub(replace, template)


def generate_artifact(registro: Registro, template: str) -> str:
    """Gera o artefato de um registro.

    O `template` vem de core/templates/, lido pela borda — o motor nao le arquivo, para
    continuar puro e testavel. Todo valor e escapado: artefato publicado nao vira vetor de injecao.
    """
    return _fill(
        template,
        {
            "hash": html.escape(registro.hash),
            "titulo": html.escape(registro.titulo),
            "status": html.escape(registro.status),
            "criadoEm": html.escape(registro.criado_em),
        },
    )
