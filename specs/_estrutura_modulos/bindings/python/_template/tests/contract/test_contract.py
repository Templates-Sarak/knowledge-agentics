"""Testes de contrato do modulo <modulo> — cada rota do contract/openapi.yaml.

Cobre o que a lei exige (specs/arquitetura/03-operacao.md §5): rota declarada, auth NEGADA por padrao e
payload malformado rejeitado. Roda com adapters de memoria — sem rede, sem banco.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.src import create_app
from tests.fixtures import AuthDeTeste, create_dependencies, record_example

ROTA_BASE = "/api/v1/<modulo>"
CREDENCIAL_DE_TESTE = "token-de-teste"


@pytest.fixture()
def client() -> TestClient:
    app = create_app(
        deps=create_dependencies([record_example()]),
        auth=AuthDeTeste(["<modulo>:ler", "<modulo>:escrever"], CREDENCIAL_DE_TESTE),
    )
    return TestClient(app)


def _auth() -> dict[str, str]:
    return {"authorization": f"Bearer {CREDENCIAL_DE_TESTE}"}


def test_health_responde_sem_token(client: TestClient) -> None:
    resposta = client.get(f"{ROTA_BASE}/health")
    assert resposta.status_code == 200
    assert resposta.json()["ok"] is True


def test_meta_ecoa_o_manifesto(client: TestClient) -> None:
    assert client.get(f"{ROTA_BASE}/meta").json()["basePath"] == ROTA_BASE


def test_resumo_devolve_a_contagem(client: TestClient) -> None:
    assert client.get(f"{ROTA_BASE}/resumo").json()["total"] == 1


def test_nega_leitura_sem_token(client: TestClient) -> None:
    resposta = client.get(f"{ROTA_BASE}/registros")
    assert resposta.status_code == 401
    assert resposta.json()["erro"]["codigo"] == "NAO_AUTENTICADO"


def test_nega_token_invalido(client: TestClient) -> None:
    resposta = client.get(f"{ROTA_BASE}/registros", headers={"authorization": "Bearer errado"})
    assert resposta.status_code == 401


def test_lista_no_envelope_de_colecao(client: TestClient) -> None:
    corpo = client.get(f"{ROTA_BASE}/registros", headers=_auth()).json()
    assert len(corpo["itens"]) == 1
    assert corpo["total"] == 1


def test_hash_inexistente_devolve_nao_encontrado(client: TestClient) -> None:
    resposta = client.get(f"{ROTA_BASE}/registros/00000", headers=_auth())
    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "NAO_ENCONTRADO"


def test_cria_e_devolve_so_os_campos_da_projecao(client: TestClient) -> None:
    resposta = client.post(f"{ROTA_BASE}/registros", json={"titulo": "Novo"}, headers=_auth())
    assert resposta.status_code == 201
    assert sorted(resposta.json().keys()) == ["criadoEm", "hash", "status", "titulo"]


def test_rejeita_campo_desconhecido(client: TestClient) -> None:
    resposta = client.post(
        f"{ROTA_BASE}/registros",
        json={"titulo": "Novo", "admin": True},
        headers=_auth(),
    )
    assert resposta.status_code == 400
    assert resposta.json()["erro"]["codigo"] == "VALIDACAO"


def test_rejeita_paginacao_invalida(client: TestClient) -> None:
    assert client.get(f"{ROTA_BASE}/registros?pagina=0", headers=_auth()).status_code == 400


def test_rejeita_tamanho_acima_do_teto(client: TestClient) -> None:
    assert client.get(f"{ROTA_BASE}/registros?tamanho=9999", headers=_auth()).status_code == 400
