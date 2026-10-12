"""Motor do modulo <module>: geracao DETERMINISTICA do artefato publicavel.
Lei dona: specs/arquitetura/01-modulo.md §2 (so existe se generatesArtifact = true).

Deterministico significa: mesma entrada, saida byte a byte identica. Por isso o instante e o
identificador chegam prontos, de fora — `datetime.now()` e `random` sao proibidos aqui e o gate
reprova (regra `determinism`). E o que torna o motor testavel sem congelar relogio.
"""

from __future__ import annotations

import html
import re

from ..domain import Entry

_MARKER = re.compile(r"\{\{(\w+)\}\}")


def _fill(template: str, values: dict[str, str]) -> str:
    """Substitui `{{key}}` pelos valores. Marcador sem valor e PRESERVADO, nunca apagado."""

    def replace(finding: re.Match[str]) -> str:
        return values.get(finding.group(1), finding.group(0))

    return _MARKER.sub(replace, template)


def generate_artifact(entry: Entry, template: str) -> str:
    """Gera o artefato de um registro.

    O `template` vem de core/templates/, lido pela borda — o motor nao le arquivo, para
    continuar puro e testavel. Todo valor e escapado: artefato publicado nao vira vetor de injecao.
    """
    return _fill(
        template,
        {
            "hash": html.escape(entry.hash),
            "title": html.escape(entry.title),
            "status": html.escape(entry.status),
            "createdAt": html.escape(entry.created_at),
        },
    )
