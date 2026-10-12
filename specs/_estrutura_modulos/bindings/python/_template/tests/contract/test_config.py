"""Prova que `_check_env_required` DE FATO derruba o boot quando falta variavel.

Sob `PYTEST_CURRENT_TEST` setado (pytest o define automaticamente, em toda a suite) o bypass cala a
checagem de proposito: sem `.env` real, qualquer teste derrubaria antes do primeiro `def test_...`.
Isso deixa "suite verde" incapaz de provar, sozinha, que a fiacao de ambiente esta correta — so o
boot real prova. Este teste fecha essa lacuna removendo `PYTEST_CURRENT_TEST` do ambiente, de
proposito, so durante a chamada.

Usa `<MODULE>_API_PORT` (ja declarada em module.json:requiredEnv pelo molde) em vez de inventar uma
chave nova: uma chave sintetica usada via `os.environ[...]` seria acusada por `env-declared` — "usada
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

KEY = "<MODULE>_API_PORT"

BASE_MANIFEST = {
    "id": "<module>",
    "name": "<Module>",
    "version": "0.1.0",
    "role": "domain",
    "basePath": "/api/v1/<module>",
    "webPath": None,
    "navigation": None,
    "exportsSummary": False,
    "data": {
        "schema": "<scope>",
        "prefix": "<module_snake>_",
        "tables": [],
    },
    "requiredEnv": [KEY],
    "ports": [],
    "permissions": [],
    "publicRoutes": [],
    "sensitiveFields": [],
}


def test_fails_boot_when_variable_missing_outside_pytest():
    pytest_original = os.environ.pop("PYTEST_CURRENT_TEST", None)
    original_key = os.environ.pop(KEY, None)
    try:
        with pytest.raises(RuntimeError, match="variables missing from the environment"):
            _check_env_required(BASE_MANIFEST)
    finally:
        if pytest_original is not None:
            os.environ["PYTEST_CURRENT_TEST"] = pytest_original
        if original_key is not None:
            os.environ[KEY] = original_key


def test_does_not_fail_when_variable_present():
    pytest_original = os.environ.pop("PYTEST_CURRENT_TEST", None)
    original_key = os.environ.get(KEY)
    os.environ[KEY] = "3999"
    try:
        _check_env_required(BASE_MANIFEST)
    finally:
        if pytest_original is not None:
            os.environ["PYTEST_CURRENT_TEST"] = pytest_original
        if original_key is None:
            os.environ.pop(KEY, None)
        else:
            os.environ[KEY] = original_key
