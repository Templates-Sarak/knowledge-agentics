"""Adapter <provedor> para a porta "<porta>". Lei dona: specs/arquitetura/01-modulo.md §5.2.

Gerado por `create-adapter.mjs` a partir deste molde. Implemente aqui os metodos da interface
da porta "<porta>" (packages/ports/__init__.py) — o TODO abaixo e o unico lugar que falta.

Adapter NAO conhece dominio: nao existe `if module == "catalogo"` aqui dentro.
"""

from __future__ import annotations

from typing import Any


class AdapterPendente:
    """TODO: implemente os metodos da porta "<porta>" aqui (packages/ports/__init__.py)."""

    def __getattr__(self, nome: str) -> Any:
        raise NotImplementedError(
            f'TODO: implemente os metodos da porta "<porta>" em adapters/<provedor>/__init__.py '
            f'(tentou chamar "{nome}")'
        )
