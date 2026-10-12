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
from tests.fixtures import FakeAuth, create_dependencies, record_example

BASE_ROUTE = "/api/v1/<module>"
TEST_CREDENTIAL = "test-token"


@pytest_asyncio.fixture()
async def client() -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(
        deps=create_dependencies([record_example()]),
        auth=FakeAuth(["<module>:read", "<module>:write"], TEST_CREDENTIAL),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test-module") as client:
        yield client


def _auth() -> dict[str, str]:
    return {"authorization": f"Bearer {TEST_CREDENTIAL}"}


async def test_health_answers_without_token(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{BASE_ROUTE}/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


async def test_meta_echoes_manifest(client: httpx.AsyncClient) -> None:
    assert (await client.get(f"{BASE_ROUTE}/meta")).json()["basePath"] == BASE_ROUTE


async def test_summary_returns_count(client: httpx.AsyncClient) -> None:
    assert (await client.get(f"{BASE_ROUTE}/summary")).json()["total"] == 1


async def test_denies_read_without_token(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{BASE_ROUTE}/entries")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


async def test_denies_invalid_token(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{BASE_ROUTE}/entries", headers={"authorization": "Bearer wrong"})
    assert response.status_code == 401


async def test_lists_in_collection_envelope(client: httpx.AsyncClient) -> None:
    body = (await client.get(f"{BASE_ROUTE}/entries", headers=_auth())).json()
    assert len(body["items"]) == 1
    assert body["total"] == 1


async def test_unknown_hash_returns_not_found(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{BASE_ROUTE}/entries/00000", headers=_auth())
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


async def test_creates_and_returns_only_projection_fields(client: httpx.AsyncClient) -> None:
    response = await client.post(f"{BASE_ROUTE}/entries", json={"title": "New"}, headers=_auth())
    assert response.status_code == 201
    assert sorted(response.json().keys()) == ["createdAt", "hash", "status", "title"]


async def test_rejects_unknown_field(client: httpx.AsyncClient) -> None:
    response = await client.post(
        f"{BASE_ROUTE}/entries",
        json={"title": "New", "admin": True},
        headers=_auth(),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION"


async def test_rejects_invalid_pagination(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{BASE_ROUTE}/entries?page=0", headers=_auth())
    assert response.status_code == 400


async def test_rejects_page_size_above_cap(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{BASE_ROUTE}/entries?pageSize=9999", headers=_auth())
    assert response.status_code == 400
