"""Testes de contrato do modulo <module> — cada rota do contract/openapi.yaml.

Cobre o que a lei exige (specs/arquitetura/03-operacao.md §5): rota declarada, auth NEGADA por padrao e
payload malformado rejeitado. Roda com adapters de memoria — sem rede, sem banco.

POR QUE `httpx.AsyncClient` + `ASGITransport` e NAO `fastapi.testclient.TestClient`: o `TestClient`
sem `with` abre um portal do anyio — logo um EVENT LOOP novo — a CADA requisicao. No Windows, todo
loop novo do asyncio cria um par de sockets (`socket.socketpair()`, que no Windows e um fallback
em Python: `listen` + `connect` nao bloqueante + `accept` SEM timeout). Se o SYN de loopback se
perde, o `accept` espera para sempre: medido, o `pytest` do modulo travava de forma intermitente (ver
doutrina/adr/decisoes.md). O cliente assincrono fala com o app direto, num UNICO loop (escopo de
sessao, em `pyproject.toml`) — um `socketpair` por execucao de pytest, nao um por requisicao.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest_asyncio

from api.src import create_app
from tests.fixtures import AuthDeTeste, create_dependencies, record_example

ROTA_BASE = "/api/v1/<module>"
CREDENCIAL_DE_TESTE = "token-de-teste"


@pytest_asyncio.fixture()
async def client() -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(
        deps=create_dependencies([record_example()]),
        auth=AuthDeTeste(["<module>:ler", "<module>:escrever"], CREDENCIAL_DE_TESTE),
    )
    transporte = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transporte, base_url="http://modulo-de-teste") as cliente:
        yield cliente


def _auth() -> dict[str, str]:
    return {"authorization": f"Bearer {CREDENCIAL_DE_TESTE}"}


async def test_health_responde_sem_token(client: httpx.AsyncClient) -> None:
    resposta = await client.get(f"{ROTA_BASE}/health")
    assert resposta.status_code == 200
    assert resposta.json()["ok"] is True


async def test_meta_ecoa_o_manifesto(client: httpx.AsyncClient) -> None:
    assert (await client.get(f"{ROTA_BASE}/meta")).json()["basePath"] == ROTA_BASE


async def test_resumo_devolve_a_contagem(client: httpx.AsyncClient) -> None:
    assert (await client.get(f"{ROTA_BASE}/resumo")).json()["total"] == 1


async def test_nega_leitura_sem_token(client: httpx.AsyncClient) -> None:
    resposta = await client.get(f"{ROTA_BASE}/registros")
    assert resposta.status_code == 401
    assert resposta.json()["erro"]["codigo"] == "NAO_AUTENTICADO"


async def test_nega_token_invalido(client: httpx.AsyncClient) -> None:
    resposta = await client.get(f"{ROTA_BASE}/registros", headers={"authorization": "Bearer errado"})
    assert resposta.status_code == 401


async def test_lista_no_envelope_de_colecao(client: httpx.AsyncClient) -> None:
    corpo = (await client.get(f"{ROTA_BASE}/registros", headers=_auth())).json()
    assert len(corpo["itens"]) == 1
    assert corpo["total"] == 1


async def test_hash_inexistente_devolve_nao_encontrado(client: httpx.AsyncClient) -> None:
    resposta = await client.get(f"{ROTA_BASE}/registros/00000", headers=_auth())
    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "NAO_ENCONTRADO"


async def test_cria_e_devolve_so_os_campos_da_projecao(client: httpx.AsyncClient) -> None:
    resposta = await client.post(f"{ROTA_BASE}/registros", json={"titulo": "Novo"}, headers=_auth())
    assert resposta.status_code == 201
    assert sorted(resposta.json().keys()) == ["criadoEm", "hash", "status", "titulo"]


async def test_rejeita_campo_desconhecido(client: httpx.AsyncClient) -> None:
    resposta = await client.post(
        f"{ROTA_BASE}/registros",
        json={"titulo": "Novo", "admin": True},
        headers=_auth(),
    )
    assert resposta.status_code == 400
    assert resposta.json()["erro"]["codigo"] == "VALIDACAO"


async def test_rejeita_paginacao_invalida(client: httpx.AsyncClient) -> None:
    resposta = await client.get(f"{ROTA_BASE}/registros?pagina=0", headers=_auth())
    assert resposta.status_code == 400


async def test_rejeita_tamanho_acima_do_teto(client: httpx.AsyncClient) -> None:
    resposta = await client.get(f"{ROTA_BASE}/registros?tamanho=9999", headers=_auth())
    assert resposta.status_code == 400
