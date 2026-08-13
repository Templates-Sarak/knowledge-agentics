"""Bootstrap da api do modulo <modulo>. Lei dona: specs/arquitetura/01-modulo.md §5.

REGRA CENTRAL: este arquivo RECEBE os adapters ja instanciados — nunca os cria e nunca importa
adapter nem SDK de fornecedor. Quem escolhe o provedor e a raiz de composicao, lendo
config/ports.json. E o que permite trocar Postgres por outro banco editando um JSON.
"""

from __future__ import annotations

from fastapi import FastAPI

from core.ports import Auth, DependenciasModulo
from .config import ConfiguracaoModulo, load_configuration, env_required
from .logger import create_logger
from .middlewares import ContextoDaBorda, record_middlewares
from .rotas import create_routes

__all__ = ["create_app", "listen_port", "load_configuration", "env_required"]


def create_app(deps: DependenciasModulo, auth: Auth, config: ConfiguracaoModulo | None = None) -> FastAPI:
    """Monta o modulo num FastAPI. Usado pela raiz de composicao E pelos testes de contrato."""
    configuracao = config or load_configuration()
    manifesto = configuracao.manifesto

    logger = create_logger(
        modulo=manifesto["id"],
        nivel_minimo=configuracao.api["nivelLog"],
        campos_sensiveis=manifesto["sensitiveFields"],
    )

    app = FastAPI(
        title=configuracao.textos["titulo"],
        version=manifesto["version"],
        docs_url=None,
        redoc_url=None,
    )
    record_middlewares(app, configuracao, ContextoDaBorda(deps.geradorId, auth, logger))
    app.include_router(create_routes(deps, configuracao), prefix=manifesto["basePath"])
    return app


def listen_port() -> int:
    """Execucao standalone — dev isolado e modulo ja extraido.

    A porta vem do ambiente, e a falta dela DERRUBA o boot (specs/arquitetura/01-modulo.md §4.3).
    O limite de corpo (config/api.json:corpoMaximoKb) e aplicado pelo servidor ASGI na frente.
    """
    return int(env_required("<MODULO>_API_PORT"))


def body_limit_bytes(config: ConfiguracaoModulo) -> int:
    return int(config.api["corpoMaximoKb"]) * 1024
