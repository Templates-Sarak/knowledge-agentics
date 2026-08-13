"""Rotas do modulo <modulo>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §2.

O contrato manda: toda rota daqui existe em contract/openapi.yaml, e o inverso tambem.
Regras cobradas aqui: valida na borda ANTES do dominio; exige permissao nomeada; monta a resposta
pelo mapeador (nunca o registro cru); lanca ErroApi (nunca resposta de erro ad hoc).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from core.domain import ErroDeValidacao, Registro, build_record
from core.ports import DependenciasModulo
from .erros import ErroApi
from .mappers import to_collection, to_contract, to_meta
from .middlewares import require_permission

_CAMPOS_PERMITIDOS = {"titulo", "status"}

# Leitura e escrita: o minimo que todo modulo declara (specs/arquitetura/01-modulo.md §3.1).
_PERMISSOES_MINIMAS = 2


def _permissions_for(config: Any) -> tuple[str, str]:
    """As permissoes vem do manifesto, nunca de literal. Manifesto incompleto derruba o boot."""
    permissoes = config.manifesto["permissions"]
    if len(permissoes) < _PERMISSOES_MINIMAS:
        raise RuntimeError("[rotas] module.json:permissoes precisa declarar leitura e escrita")
    return permissoes[0], permissoes[1]


def _read_pagination(request: Request, config: Any) -> tuple[int, int]:
    """Paginacao validada na borda, com padrao e teto vindos de config/api.json."""
    bruto_pagina = request.query_params.get("pagina", "1")
    bruto_tamanho = request.query_params.get("tamanho", str(config.api["paginaTamanhoPadrao"]))
    if not bruto_pagina.isdigit() or int(bruto_pagina) < 1:
        raise ErroApi("VALIDACAO", 'parametro "pagina" deve ser inteiro >= 1')
    teto = config.api["paginaTamanhoMaximo"]
    if not bruto_tamanho.isdigit() or not 1 <= int(bruto_tamanho) <= teto:
        raise ErroApi("VALIDACAO", f'parametro "tamanho" deve estar entre 1 e {teto}')
    return int(bruto_pagina), int(bruto_tamanho)


def _read_body(corpo: Any) -> dict[str, Any]:
    """Allowlist de entrada: campo desconhecido e REJEITADO, nunca ignorado
    (specs/arquitetura/02-contrato-e-dados.md §3.2)."""
    if not isinstance(corpo, dict):
        raise ErroApi("VALIDACAO", "corpo deve ser um objeto")
    desconhecido = next((c for c in corpo if c not in _CAMPOS_PERMITIDOS), None)
    if desconhecido is not None:
        raise ErroApi("VALIDACAO", f'campo desconhecido no corpo: "{desconhecido}"')
    return corpo


def create_routes(deps: DependenciasModulo, config: Any) -> APIRouter:
    router = APIRouter()
    ler, escrever = _permissions_for(config)

    @router.get("/health")
    async def health() -> dict[str, Any]:
        await deps.repositorio.count()
        return {"ok": True, "module": config.manifesto["id"]}

    @router.get("/meta")
    async def meta() -> dict[str, Any]:
        return to_meta(config.manifesto)

    @router.get("/resumo")
    async def resumo() -> dict[str, Any]:
        return {"total": await deps.repositorio.count()}

    @router.get("/registros")
    async def list(request: Request) -> dict[str, Any]:
        require_permission(request, ler)
        pagina, tamanho = _read_pagination(request, config)
        resultado = await deps.repositorio.list(pagina, tamanho)
        return to_collection(resultado.itens, resultado.pagina, resultado.tamanho, resultado.total)

    @router.get("/registros/{hash_universal}")
    async def get(request: Request, hash_universal: str) -> dict[str, Any]:
        require_permission(request, ler)
        registro = await deps.repositorio.find_by_hash(hash_universal)
        if registro is None:
            raise ErroApi("NAO_ENCONTRADO", "registro nao encontrado")
        return to_contract(registro)

    @router.post("/registros", status_code=201)
    async def create(request: Request) -> dict[str, Any]:
        require_permission(request, escrever)
        corpo = _read_body(await request.json())
        registro = await _persist(corpo, deps, config, request.state.request_id)
        return to_contract(registro)

    return router


async def _persist(corpo: dict[str, Any], deps: DependenciasModulo, config: Any, request_id: str) -> Registro:
    """Erro de dominio e erro do CLIENTE: a borda o traduz para VALIDACAO
    (specs/arquitetura/02-contrato-e-dados.md §3.2)."""
    try:
        registro = build_record(
            corpo,
            config.dominio["statusValidos"],
            deps.geradorId.hash(),
            deps.relogio.now(),
        )
    except ErroDeValidacao as causa:
        raise ErroApi("VALIDACAO", str(causa)) from causa

    await deps.repositorio.insert(registro)
    await deps.auditoria.record(
        {
            "hash": registro.hash,
            "acao": "create",
            "sujeito": "sistema",
            "camposAlterados": list(registro.as_dict().keys()),
            "requestId": request_id,
        }
    )
    return registro
