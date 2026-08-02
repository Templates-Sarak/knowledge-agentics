"""Cadeia de seguranca do modulo <modulo>. Lei dona: specs/arquitetura/03-operacao.md §2.1.

Ordem obrigatoria, igual em todo modulo:
  requestId -> headers -> CORS -> rate limit -> autenticacao -> autorizacao -> rota -> erro

Nenhuma rota monta erro a mao: quem transforma excecao em resposta e o tratador, no fim da cadeia.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse

from core.portas import Auth, GeradorId
from .erros import ErroApi, envelope_de_erro
from .logger import Logger

Proximo = Callable[[Request], Awaitable[Any]]


def _caminho_relativo(caminho: str, rota_base: str) -> str:
    """`rotasPublicas` e declarado RELATIVO a rotaBase ("GET /health"), mas esta cadeia roda antes
    do router — aqui o caminho ainda e absoluto. Sem tirar o prefixo, nenhuma rota publica casaria
    e /health, /meta e /resumo responderiam 401."""
    if not caminho.startswith(rota_base):
        return caminho
    return caminho[len(rota_base):] or "/"


@dataclass(frozen=True)
class ContextoDaBorda:
    """O que a cadeia precisa alem da config. Agrupado para respeitar o limiar de 4 parametros
    (specs/arquitetura/04-regras.md §4.7) — e porque os tres andam sempre juntos."""

    gerador: GeradorId
    auth: Auth
    logger: Logger


def registrar_middlewares(app: Any, config: Any, borda: ContextoDaBorda) -> None:
    gerador, auth, logger = borda.gerador, borda.auth, borda.logger
    seguranca = config.seguranca
    manifesto = config.manifesto
    publicas = {rota.upper() for rota in manifesto["rotasPublicas"]}
    janelas: dict[str, tuple[float, int]] = {}

    @app.middleware("http")
    async def cadeia(request: Request, proximo: Proximo) -> Any:
        request.state.request_id = gerador.hash()
        try:
            _limitar(request, seguranca["rateLimit"], janelas)
            await _autenticar(request, auth, publicas, manifesto["rotaBase"])
            resposta = await proximo(request)
        except ErroApi as erro:
            return _responder_erro(erro, request, logger)
        except Exception as causa:  # noqa: BLE001 — traduzido, nunca engolido
            interno = ErroApi("INTERNO", config.textos["erroGenerico"], str(causa))
            return _responder_erro(interno, request, logger)

        _aplicar_headers(resposta, seguranca["headers"])
        _aplicar_cors(request, resposta, seguranca["cors"])
        resposta.headers["x-request-id"] = request.state.request_id
        return resposta


def _responder_erro(erro: ErroApi, request: Request, logger: Logger) -> JSONResponse:
    """Unico lugar que transforma excecao em resposta. Detalhe vai para o log, nunca ao cliente."""
    request_id = getattr(request.state, "request_id", "")
    logger.error(
        "falha na requisicao",
        dados={
            "requestId": request_id,
            "codigo": erro.codigo,
            "caminho": request.url.path,
            "detalhe": erro.detalhe or erro.mensagem,
        },
    )
    return JSONResponse(status_code=erro.status, content=envelope_de_erro(erro, request_id))


def _aplicar_headers(resposta: Any, headers: dict[str, Any]) -> None:
    if headers["hsts"]:
        resposta.headers["strict-transport-security"] = "max-age=31536000; includeSubDomains"
    if headers["noSniff"]:
        resposta.headers["x-content-type-options"] = "nosniff"
    if headers["frameDeny"]:
        resposta.headers["x-frame-options"] = "DENY"
    resposta.headers["referrer-policy"] = headers["referrerPolicy"]


def _aplicar_cors(request: Request, resposta: Any, cors: dict[str, Any]) -> None:
    """Origens sao DECLARADAS em config/seguranca.json. `*` e proibido."""
    origem = request.headers.get("origin")
    if origem is not None and origem in cors["origensPermitidas"]:
        resposta.headers["access-control-allow-origin"] = origem
        resposta.headers["access-control-allow-methods"] = ", ".join(cors["metodos"])


def _limitar(request: Request, config: dict[str, Any], janelas: dict[str, tuple[float, int]]) -> None:
    """Contador em memoria: suficiente para um processo. Multi-instancia exige porta dedicada."""
    limite = config["limiteLeitura"] if request.method == "GET" else config["limiteEscrita"]
    chave = f"{request.client.host if request.client else '?'}:{request.method}"
    agora = time.monotonic()
    inicio, contagem = janelas.get(chave, (agora, 0))

    if agora - inicio > config["janelaSegundos"]:
        janelas[chave] = (agora, 1)
        return
    if contagem + 1 > limite:
        raise ErroApi("LIMITE_EXCEDIDO", "limite de requisicoes excedido")
    janelas[chave] = (inicio, contagem + 1)


async def _autenticar(request: Request, auth: Auth, publicas: set[str], rota_base: str) -> None:
    """DENY BY DEFAULT: so as rotas de `modulo.json:rotasPublicas` passam sem token."""
    relativo = _caminho_relativo(request.url.path, rota_base)
    if f"{request.method} {relativo}".upper() in publicas:
        request.state.permissoes = []
        return

    cabecalho = request.headers.get("authorization", "")
    if not cabecalho.startswith("Bearer "):
        raise ErroApi("NAO_AUTENTICADO", "token ausente")

    claims = await auth.verificar(cabecalho[7:])
    if claims is None:
        raise ErroApi("NAO_AUTENTICADO", "token invalido")
    request.state.permissoes = claims.get("permissoes", [])


def exigir_permissao(request: Request, permissao: str) -> None:
    """Autorizacao por permissao NOMEADA. RLS no banco e defesa em profundidade, nao o controle."""
    if permissao not in getattr(request.state, "permissoes", []):
        raise ErroApi("NAO_AUTORIZADO", "permissao insuficiente")
