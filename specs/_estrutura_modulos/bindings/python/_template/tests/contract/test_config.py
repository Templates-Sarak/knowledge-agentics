"""Prova que `_check_env_required` DE FATO derruba o boot quando falta variavel — plan-2.md N.4.

Sob `PYTEST_CURRENT_TEST` setado (pytest o define automaticamente, em toda a suite) o bypass cala a
checagem de proposito: sem `.env` real, qualquer teste derrubaria antes do primeiro `def test_...`.
Isso deixa "suite verde" incapaz de provar, sozinha, que a fiacao de ambiente esta correta — so o
boot real prova. Este teste fecha essa lacuna removendo `PYTEST_CURRENT_TEST` do ambiente, de
proposito, so durante a chamada.

Usa `<MODULO>_API_PORT` (ja declarada em modulo.json:envRequerido pelo molde) em vez de inventar uma
chave nova: uma chave sintetica usada via `os.environ[...]` seria acusada por `env-declarado` — "usada
no codigo e ausente do manifesto" — por um vazamento que nao tem nada a ver com este teste.

MEDIDO: remover `PYTEST_CURRENT_TEST` numa FIXTURE (fase "setup") nao basta — o pytest RE-ESCREVE a
variavel na fronteira de fase, antes de entrar na fase "call" que roda o corpo do teste, e o valor
removido volta antes de `_check_env_required` ser chamada. A remocao tem de acontecer DENTRO do
proprio corpo do teste (mesma fase "call"), com `try/finally` para restaurar mesmo se o teste falhar.
"""

from __future__ import annotations

import os

import pytest

from api.src.config import _check_env_required

CHAVE = "<MODULO>_API_PORT"

MANIFESTO_BASE = {
    "id": "<modulo>",
    "nome": "<Modulo>",
    "versao": "0.1.0",
    "papel": "dominio",
    "rotaBase": "/api/v1/<modulo>",
    "rotaWeb": None,
    "navegacao": None,
    "exportaResumo": False,
    "dados": {
        "schema": "<escopo>",
        "prefixo": "<modulo>_",
        "tabelas": [],
    },
    "envRequerido": [CHAVE],
    "portas": [],
    "permissoes": [],
    "rotasPublicas": [],
    "camposSensiveis": [],
}


def test_derruba_quando_falta_variavel_fora_do_pytest():
    pytest_original = os.environ.pop("PYTEST_CURRENT_TEST", None)
    chave_original = os.environ.pop(CHAVE, None)
    try:
        with pytest.raises(RuntimeError, match="variaveis ausentes no ambiente"):
            _check_env_required(MANIFESTO_BASE)
    finally:
        if pytest_original is not None:
            os.environ["PYTEST_CURRENT_TEST"] = pytest_original
        if chave_original is not None:
            os.environ[CHAVE] = chave_original


def test_nao_derruba_quando_a_variavel_esta_presente():
    pytest_original = os.environ.pop("PYTEST_CURRENT_TEST", None)
    chave_original = os.environ.get(CHAVE)
    os.environ[CHAVE] = "3999"
    try:
        _check_env_required(MANIFESTO_BASE)
    finally:
        if pytest_original is not None:
            os.environ["PYTEST_CURRENT_TEST"] = pytest_original
        if chave_original is None:
            os.environ.pop(CHAVE, None)
        else:
            os.environ[CHAVE] = chave_original
