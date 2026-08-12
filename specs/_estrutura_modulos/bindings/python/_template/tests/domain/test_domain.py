"""Testes do dominio do modulo <modulo> — regras e validacao, sem I/O."""

from __future__ import annotations

import pytest

from core.domain import ErroDeValidacao, build_record
from core.engine import generate_artifact
from tests.fixtures import record_example

STATUS_VALIDOS = ["rascunho", "ativo", "encerrado"]
INSTANTE = "2024-01-01T00:00:00.000Z"


def test_monta_com_o_primeiro_status_quando_nenhum_e_informado() -> None:
    registro = build_record({"titulo": "Exemplo"}, STATUS_VALIDOS, "10001", INSTANTE)
    assert registro.status == "rascunho"
    assert registro.hash == "10001"


def test_remove_espaco_em_volta_do_titulo() -> None:
    registro = build_record({"titulo": "  Exemplo  "}, STATUS_VALIDOS, "10001", INSTANTE)
    assert registro.titulo == "Exemplo"


def test_recusa_titulo_vazio() -> None:
    with pytest.raises(ErroDeValidacao):
        build_record({"titulo": "   "}, STATUS_VALIDOS, "10001", INSTANTE)


def test_recusa_status_fora_do_vocabulario() -> None:
    with pytest.raises(ErroDeValidacao):
        build_record({"titulo": "X", "status": "inventado"}, STATUS_VALIDOS, "10001", INSTANTE)


def test_nao_inventa_instante_nem_identificador() -> None:
    registro = build_record({"titulo": "X"}, STATUS_VALIDOS, "99999", INSTANTE)
    assert (registro.hash, registro.criado_em) == ("99999", INSTANTE)


TEMPLATE = "<h1>{{titulo}}</h1><p>{{hash}}</p>"


def test_motor_e_deterministico() -> None:
    registro = record_example()
    assert generate_artifact(registro, TEMPLATE) == generate_artifact(registro, TEMPLATE)


def test_motor_escapa_html() -> None:
    registro = record_example(titulo="<script>alert(1)</script>")
    assert "<script>" not in generate_artifact(registro, TEMPLATE)


def test_motor_preserva_marcador_sem_valor() -> None:
    assert generate_artifact(record_example(), "{{inexistente}}") == "{{inexistente}}"
