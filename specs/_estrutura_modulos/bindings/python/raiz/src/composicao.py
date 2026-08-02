"""Raiz de composicao — o WIRING, e nada alem. Lei dona: specs/arquitetura/00-arquitetura.md §3.4.

O que este modulo faz:
  1. DESCOBRE os modulos lendo modulos/*/modulo.json — nao existe lista fixa de modulos no codigo;
  2. resolve as portas de cada um a partir do config/portas.json DELE;
  3. INJETA os adapters e monta cada api/ sob a rotaBase do manifesto.

O que ele NAO faz: regra de negocio. Nenhum modulo importa daqui, e nada aqui conhece o dominio
de modulo nenhum. Acrescentar um modulo nao pode exigir editar este arquivo.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from adapters.memoria import (
    AuditoriaEmMemoria,
    AuthQueNega,
    GeradorPadrao,
    RelogioDoSistema,
    RepositorioEmMemoria,
)

# Fabrica de adapter por (porta, provedor). Acrescentar provedor e acrescentar linha AQUI, so.
FABRICAS: dict[str, dict[str, Callable[[], Any]]] = {
    "repositorio": {"memoria": RepositorioEmMemoria},
    "auditoria": {"memoria": AuditoriaEmMemoria},
    "relogio": {"sistema": RelogioDoSistema},
    "geradorId": {"padrao": GeradorPadrao},
}


def _ler_json(caminho: Path) -> Any:
    return json.loads(caminho.read_text(encoding="utf-8-sig"))


def descobrir_modulos(raiz: Path) -> list[dict[str, Any]]:
    """Le todos os manifestos. E a DESCOBERTA: o sistema conhece os modulos por declaracao, nao
    por import. Molde (`_*`) fica de fora — e material do scaffold, nao um modulo do sistema."""
    base = raiz / "modulos"
    if not base.exists():
        return []

    achados = []
    for pasta in sorted(base.iterdir()):
        if pasta.name.startswith("_") or not (pasta / "modulo.json").exists():
            continue
        manifesto = _ler_json(pasta / "modulo.json")
        manifesto["pasta"] = pasta
        achados.append(manifesto)
    return achados


def resolver_dependencias(modulo: dict[str, Any]) -> dict[str, Any]:
    """Resolve as portas declaradas, lendo a ESCOLHA em config/portas.json do modulo.

    Porta declarada sem provedor conhecido derruba o boot — melhor falhar aqui que servir errado.
    """
    escolhas = _ler_json(modulo["pasta"] / "config" / "portas.json")
    dependencias: dict[str, Any] = {}

    for porta in modulo["portas"]:
        provedor = escolhas.get(porta)
        fabrica = FABRICAS.get(porta, {}).get(provedor or "")
        if fabrica is None:
            identificador = modulo["id"]
            raise RuntimeError(
                f'[composicao] {identificador}: porta "{porta}" com provedor '
                f'"{provedor}" sem fabrica registrada'
            )
        dependencias[porta] = fabrica()
    return dependencias


def resolver_auth() -> AuthQueNega:
    """Enquanto nao houver login, NEGA tudo — as rotas que precisam funcionar sem token estao
    declaradas em `rotasPublicas` de cada modulo, e so elas passam."""
    return AuthQueNega()
