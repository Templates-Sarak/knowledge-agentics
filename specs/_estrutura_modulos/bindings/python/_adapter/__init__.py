"""Adapter <provedor> para a porta "<porta>". Lei dona: specs/arquitetura/01-modulo.md §5.2.

Gerado por `create-adapter.mjs` a partir deste molde. Implemente aqui os metodos da interface
da porta "<porta>" (packages/ports/__init__.py) — o TODO abaixo e o unico lugar que falta.

Adapter NAO conhece dominio: nao existe `if module == "catalogo"` aqui dentro.
"""

from __future__ import annotations

from typing import Any


class AdapterPendente:
    """TODO: implemente os metodos da porta "<porta>" aqui (packages/ports/__init__.py)."""

    def __init__(self, modulo: dict[str, Any]) -> None:
        # `create-adapter.mjs` registra a CLASSE direto em FABRICAS (nunca um lambda), como
        # `RepositorioPostgres` (adapters/postgres/__init__.py) — o construtor precisa aceitar o
        # manifesto para casar com `Callable[[dict[str, Any]], Any]`. Nao usa `modulo` ainda: quem
        # implementar a porta decide se precisa dele (ex.: `module.pasta` para ler `data.schema`).
        self._modulo = modulo

    def __getattr__(self, nome: str) -> Any:
        raise NotImplementedError(
            f'TODO: implemente os metodos da porta "<porta>" em adapters/<provedor-pasta>/__init__.py '
            f'(tentou chamar "{nome}")'
        )
