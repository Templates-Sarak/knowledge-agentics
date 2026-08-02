"""Rotas do modulo <modulo>. Lei dona: doutrina/02-contrato-e-dados.md §2.

O contrato manda: toda rota daqui existe em contrato/openapi.yaml, e o inverso tambem.
Regras cobradas aqui: valida na borda ANTES do dominio; exige permissao nomeada; monta a resposta
pelo mapeador (nunca o registro cru); lanca ErroApi (nunca resposta de erro ad hoc).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from core.dominio import ErroDeValidacao, Registro, montar_registro
from core.portas import DependenciasModulo
from .erros import ErroApi
from .mapeadores import para_colecao, para_contrato
from .middlewares import exigir_permissao

_CAMPOS_PERMITIDOS = {"titulo", "status"}

# Leitura e escrita: o minimo que todo modulo declara (doutrina/01-modulo.md §3.1).
_PERMISSOES_MINIMAS = 2


def _permissoes_de(config: Any) -> tuple[str, str]:
    """As permissoes vem do manifesto, nunca de literal. Manifesto incompleto derruba o boot."""
    permissoes = config.manifesto["permissoes"]
    if len(permissoes) < _PERMISSOES_MINIMAS:
        raise RuntimeError("[rotas] modulo.json:permissoes precisa declarar leitura e escrita")
    return permissoes[0], permissoes[1]


def _ler_paginacao(request: Request, config: Any) -> tuple[int, int]:
    """Paginacao validada na borda, com padrao e teto vindos de config/api.json."""
    bruto_pagina = request.query_params.get("pagina", "1")
    bruto_tamanho = request.query_params.get("tamanho", str(config.api["paginaTamanhoPadrao"]))
    if not bruto_pagina.isdigit() or int(bruto_pagina) < 1:
        raise ErroApi("VALIDACAO", 'parametro "pagina" deve ser inteiro >= 1')
    teto = config.api["paginaTamanhoMaximo"]
    if not bruto_tamanho.isdigit() or not 1 <= int(bruto_tamanho) <= teto:
        raise ErroApi("VALIDACAO", f'parametro "tamanho" deve estar entre 1 e {teto}')
    return int(bruto_pagina), int(bruto_tamanho)


def _ler_corpo(corpo: Any) -> dict[str, Any]:
    """Allowlist de entrada: campo desconhecido e REJEITADO, nunca ignorado (doutrina/02 §3.2)."""
    if not isinstance(corpo, dict):
        raise ErroApi("VALIDACAO", "corpo deve ser um objeto")
    desconhecido = next((c for c in corpo if c not in _CAMPOS_PERMITIDOS), None)
    if desconhecido is not None:
        raise ErroApi("VALIDACAO", f'campo desconhecido no corpo: "{desconhecido}"')
    return corpo


def criar_rotas(deps: DependenciasModulo, config: Any) -> APIRouter:
    router = APIRouter()
    ler, escrever = _permissoes_de(config)

    @router.get("/health")
    async def health() -> dict[str, Any]:
        await deps.repositorio.contar()
        return {"ok": True, "modulo": config.manifesto["id"]}

    @router.get("/meta")
    async def meta() -> dict[str, Any]:
        return config.manifesto

    @router.get("/resumo")
    async def resumo() -> dict[str, Any]:
        return {"total": await deps.repositorio.contar()}

    @router.get("/registros")
    async def listar(request: Request) -> dict[str, Any]:
        exigir_permissao(request, ler)
        pagina, tamanho = _ler_paginacao(request, config)
        resultado = await deps.repositorio.listar(pagina, tamanho)
        return para_colecao(resultado.itens, resultado.pagina, resultado.tamanho, resultado.total)

    @router.get("/registros/{hash_universal}")
    async def obter(request: Request, hash_universal: str) -> dict[str, Any]:
        exigir_permissao(request, ler)
        registro = await deps.repositorio.buscar_por_hash(hash_universal)
        if registro is None:
            raise ErroApi("NAO_ENCONTRADO", "registro nao encontrado")
        return para_contrato(registro)

    @router.post("/registros", status_code=201)
    async def criar(request: Request) -> dict[str, Any]:
        exigir_permissao(request, escrever)
        corpo = _ler_corpo(await request.json())
        registro = await _persistir(corpo, deps, config, request.state.request_id)
        return para_contrato(registro)

    return router


async def _persistir(
    corpo: dict[str, Any], deps: DependenciasModulo, config: Any, request_id: str
) -> Registro:
    """Erro de dominio e erro do CLIENTE: a borda o traduz para VALIDACAO (doutrina/02 §3.2)."""
    try:
        registro = montar_registro(
            corpo,
            config.dominio["statusValidos"],
            deps.geradorId.hash(),
            deps.relogio.agora(),
        )
    except ErroDeValidacao as causa:
        raise ErroApi("VALIDACAO", str(causa)) from causa

    await deps.repositorio.inserir(registro)
    await deps.auditoria.registrar(
        {
            "hash": registro.hash,
            "acao": "criar",
            "sujeito": "sistema",
            "camposAlterados": list(registro.como_dicionario().keys()),
            "requestId": request_id,
        }
    )
    return registro
