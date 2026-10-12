"""Adapter <provider> para a porta "<port>". Lei dona: specs/arquitetura/01-modulo.md §5.2.

Gerado por `create-adapter.mjs` a partir deste molde. Implemente aqui os metodos da interface
da porta "<port>" (packages/ports/__init__.py) — o TODO abaixo e o unico lugar que falta.

Adapter NAO conhece dominio: nao existe `if module == "catalog"` aqui dentro.
"""

from __future__ import annotations

from typing import Any


class PendingAdapter:
    """TODO: implement the methods of port "<port>" aqui (packages/ports/__init__.py)."""

    def __init__(self, module: dict[str, Any]) -> None:
        # `create-adapter.mjs` registra a CLASSE direto em FACTORIES (nunca um lambda), como
        # `PostgresRepository` (adapters/postgres/__init__.py) — o construtor precisa aceitar o
        # manifesto para casar com `Callable[[dict[str, Any]], Any]`. Nao usa `module` ainda: quem
        # implementar a porta decide se precisa dele (ex.: `module.pasta` para ler `data.schema`).
        self._module = module

    def __getattr__(self, name: str) -> Any:
        raise NotImplementedError(
            f'TODO: implement the methods of port "<port>" in adapters/<provider-folder>/__init__.py '
            f'(tried to call "{name}")'
        )
