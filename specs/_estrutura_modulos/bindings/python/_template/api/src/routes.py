"""Rotas do modulo <module>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §2.

O contrato manda: toda rota daqui existe em contract/openapi.yaml, e o inverso tambem.
Regras cobradas aqui: valida na borda ANTES do dominio; exige permissao nomeada; monta a resposta
pelo mapeador (nunca o registro cru); lanca ApiError (nunca resposta de erro ad hoc).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from core.domain import ValidationError, Entry, build_record
from core.ports import ModuleDependencies
from .errors import ApiError
from .mappers import to_collection, to_contract, to_meta
from .middlewares import require_permission

_ALLOWED_FIELDS = {"title", "status"}

# Leitura e escrita: o minimo que todo modulo declara (specs/arquitetura/01-modulo.md §3.1).
_MINIMUM_PERMISSIONS = 2


def _permissions_for(config: Any) -> tuple[str, str]:
    """As permissoes vem do manifesto, nunca de literal. Manifesto incompleto derruba o boot."""
    permissions = config.manifest["permissions"]
    if len(permissions) < _MINIMUM_PERMISSIONS:
        raise RuntimeError("[routes] module.json:permissions must declare read and write")
    return permissions[0], permissions[1]


def _read_pagination(request: Request, config: Any) -> tuple[int, int]:
    """Paginacao validada na borda, com padrao e teto vindos de config/api.json."""
    raw_page = request.query_params.get("page", "1")
    raw_page_size = request.query_params.get("pageSize", str(config.api["defaultPageSize"]))
    if not raw_page.isdigit() or int(raw_page) < 1:
        raise ApiError("VALIDATION", 'parameter "page" must be an integer >= 1')
    cap = config.api["maxPageSize"]
    if not raw_page_size.isdigit() or not 1 <= int(raw_page_size) <= cap:
        raise ApiError("VALIDATION", f'parameter "pageSize" must be between 1 and {cap}')
    return int(raw_page), int(raw_page_size)


def _read_body(body: Any) -> dict[str, Any]:
    """Allowlist de entrada: campo desconhecido e REJEITADO, nunca ignorado
    (specs/arquitetura/02-contrato-e-dados.md §3.2)."""
    if not isinstance(body, dict):
        raise ApiError("VALIDATION", "body must be an object")
    unknown_field = next((c for c in body if c not in _ALLOWED_FIELDS), None)
    if unknown_field is not None:
        raise ApiError("VALIDATION", f'unknown field in body: "{unknown_field}"')
    return body


def create_routes(deps: ModuleDependencies, config: Any) -> APIRouter:
    router = APIRouter()
    read, write = _permissions_for(config)

    @router.get("/health")
    async def health() -> dict[str, Any]:
        await deps.repository.count()
        return {"ok": True, "module": config.manifest["id"]}

    @router.get("/meta")
    async def meta() -> dict[str, Any]:
        return to_meta(config.manifest)

    @router.get("/summary")
    async def summary() -> dict[str, Any]:
        return {"total": await deps.repository.count()}

    @router.get("/entries")
    async def list(request: Request) -> dict[str, Any]:
        require_permission(request, read)
        page, page_size = _read_pagination(request, config)
        result = await deps.repository.list(page, page_size)
        return to_collection(result.items, result.page, result.page_size, result.total)

    @router.get("/entries/{hash_universal}")
    async def get(request: Request, hash_universal: str) -> dict[str, Any]:
        require_permission(request, read)
        entry = await deps.repository.find_by_hash(hash_universal)
        if entry is None:
            raise ApiError("NOT_FOUND", "entry not found")
        return to_contract(entry)

    @router.post("/entries", status_code=201)
    async def create(request: Request) -> dict[str, Any]:
        require_permission(request, write)
        body = _read_body(await request.json())
        entry = await _persist(body, deps, config, request.state.request_id)
        return to_contract(entry)

    return router


async def _persist(body: dict[str, Any], deps: ModuleDependencies, config: Any, request_id: str) -> Entry:
    """Erro de dominio e erro do CLIENTE: a borda o traduz para VALIDACAO
    (specs/arquitetura/02-contrato-e-dados.md §3.2)."""
    try:
        entry = build_record(
            body,
            config.domain["validStatuses"],
            deps.idGenerator.hash(),
            deps.clock.now(),
        )
    except ValidationError as cause:
        raise ApiError("VALIDATION", str(cause)) from cause

    await deps.repository.insert(entry)
    await deps.audit.record(
        {
            "hash": entry.hash,
            "action": "create",
            "actor": "system",
            "changedFields": list(entry.as_dict().keys()),
            "requestId": request_id,
        }
    )
    return entry
