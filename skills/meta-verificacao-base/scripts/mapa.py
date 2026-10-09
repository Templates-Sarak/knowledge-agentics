"""Checagem do SCHEMA do `mapa.json` da raiz da base — a lista dos sistemas que adotam a base.

O mapa e o que a propagacao de atualizacoes le para saber onde a base chegou; um campo com tipo
errado, um `id` repetido ou um caminho absoluto quebram a propagacao em silencio, numa maquina que
nao e a de quem escreveu. Por isso o schema e cobrado aqui, por maquina.

O que NAO se cobra, de proposito: que o `caminho` exista. O `audit_base` roda em CI e em outras
maquinas, onde os sistemas nao estao clonados ao lado da base — exigir o caminho reprovaria o mapa
inteiro em todo lugar menos aqui. Os caminhos sao relativos a raiz desta base, com `/`.

Nucleo x casca, o padrao das irmas (`manifestos.py` e o molde de forma): `divergencias` e pura —
recebe o mapa ja lido, nunca toca `fs` — e e o que o autoteste de `audit_base.py` prova com fixtures
em memoria. `auditar_mapa` e a casca fina que le o disco.
"""

import json
import os
import re

ARQUIVO = "mapa.json"

# Campo -> tipos aceitos (`None` = o campo pode ser nulo: sistema ainda sem remoto ou sem git).
# `bindings` e lista (projeto modular pode ser poliglota); `[]` = nao se aplica ou nao da para saber.
CAMPOS = {
    "id": (str,),
    "nome": (str,),
    "caminho": (str,),
    "repo": (str, type(None)),
    "raiz_git": (str, type(None)),
    "tipo": (str,),
    "modular": (bool,),
    "bindings": (list,),
    "situacao": (str,),
}
VALORES = {
    "tipo": ("app", "site"),
    "situacao": ("ativo", "adocao-posterior"),
}
BINDINGS = ("typescript", "javascript", "python")
ID_KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DRIVE = re.compile(r"^[A-Za-z]:")


def _caminho_relativo_com_barra(valor: str) -> bool:
    return "\\" not in valor and not valor.startswith("/") and not DRIVE.match(valor)


def _checar_campos(rotulo: str, sistema: dict) -> list:
    achados = []
    for campo, tipos in CAMPOS.items():
        if campo not in sistema:
            achados.append(f"{rotulo}: falta o campo '{campo}'")
        elif type(sistema[campo]) not in tipos:
            achados.append(
                f"{rotulo}: '{campo}' com tipo {type(sistema[campo]).__name__}"
            )
    return achados


def _checar_bindings(rotulo: str, sistema: dict) -> list:
    achados = []
    if "binding" in sistema:
        achados.append(f"{rotulo}: campo antigo 'binding'; use 'bindings' (lista)")
    bindings = sistema.get("bindings")
    if not isinstance(bindings, list):
        return achados
    fora = [b for b in bindings if b not in BINDINGS]
    if fora:
        achados.append(f"{rotulo}: bindings {fora} fora de {BINDINGS}")
    if len(set(map(str, bindings))) != len(bindings):
        achados.append(f"{rotulo}: bindings {bindings} com valor repetido")
    return achados


def _checar_valores(rotulo: str, sistema: dict) -> list:
    achados = []
    for campo, aceitos in VALORES.items():
        if campo in sistema and sistema[campo] not in aceitos:
            achados.append(
                f"{rotulo}: '{campo}' = {sistema[campo]!r} fora de {aceitos}"
            )
    if isinstance(sistema.get("id"), str) and not ID_KEBAB.match(sistema["id"]):
        achados.append(f"{rotulo}: id '{sistema['id']}' fora de kebab-case")
    for campo in ("caminho", "raiz_git"):
        valor = sistema.get(campo)
        if isinstance(valor, str) and not _caminho_relativo_com_barra(valor):
            achados.append(
                f"{rotulo}: '{campo}' = '{valor}' — use caminho relativo a raiz da base, com /"
            )
    return achados


def _repetidos(sistemas: list, campo: str) -> list:
    vistos, achados = set(), []
    for sistema in sistemas:
        valor = sistema.get(campo) if isinstance(sistema, dict) else None
        if valor in vistos:
            achados.append(f"{ARQUIVO}: {campo} '{valor}' repetido")
        if valor is not None:
            vistos.add(valor)
    return achados


def divergencias(mapa: dict) -> list:
    """Nucleo: os problemas de schema do mapa ja lido (`dict`)."""
    if not isinstance(mapa, dict) or not isinstance(mapa.get("sistemas"), list):
        return [f"{ARQUIVO}: falta a lista 'sistemas'"]
    achados = []
    for indice, sistema in enumerate(mapa["sistemas"]):
        rotulo = f"{ARQUIVO} sistemas[{indice}]"
        if not isinstance(sistema, dict):
            achados.append(f"{rotulo}: nao e um objeto")
            continue
        rotulo += f" ({sistema.get('id', '?')})"
        achados += (
            _checar_campos(rotulo, sistema)
            + _checar_valores(rotulo, sistema)
            + _checar_bindings(rotulo, sistema)
        )
    return (
        achados
        + _repetidos(mapa["sistemas"], "id")
        + _repetidos(mapa["sistemas"], "caminho")
    )


def auditar_mapa(base_dir: str) -> list:
    """Casca: le o `mapa.json` da raiz da base e devolve os achados de `divergencias`."""
    caminho = os.path.join(base_dir, ARQUIVO)
    if not os.path.isfile(caminho):
        return [f"{ARQUIVO}: ausente na raiz da base"]
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            mapa = json.load(arquivo)
    except (OSError, json.JSONDecodeError) as erro:
        return [f"{ARQUIVO}: ilegivel ({erro})"]
    return divergencias(mapa)
