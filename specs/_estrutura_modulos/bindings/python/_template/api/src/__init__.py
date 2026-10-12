"""Bootstrap da api do modulo <module>. Lei dona: specs/arquitetura/01-modulo.md §5.

REGRA CENTRAL: este arquivo RECEBE os adapters ja instanciados — nunca os cria e nunca importa
adapter nem SDK de fornecedor. Quem escolhe o provedor e a raiz de composicao, lendo
config/ports.json. E o que permite trocar Postgres por outro banco editando um JSON.
"""

from __future__ import annotations

from fastapi import FastAPI

from core.ports import Auth, ModuleDependencies
from .config import ModuleConfiguration, load_configuration, env_required
from .logger import create_logger
from .middlewares import EdgeContext, record_middlewares
from .routes import create_routes

__all__ = ["create_app", "listen_port", "load_configuration", "env_required"]


def create_app(deps: ModuleDependencies, auth: Auth, config: ModuleConfiguration | None = None) -> FastAPI:
    """Monta o modulo num FastAPI. Usado pela raiz de composicao E pelos testes de contrato."""
    configuration = config or load_configuration()
    manifest = configuration.manifest

    logger = create_logger(
        module=manifest["id"],
        min_level=configuration.api["logLevel"],
        sensitive_fields=manifest["sensitiveFields"],
    )

    app = FastAPI(
        title=configuration.texts["title"],
        version=manifest["version"],
        docs_url=None,
        redoc_url=None,
    )
    record_middlewares(app, configuration, EdgeContext(deps.idGenerator, auth, logger))
    app.include_router(create_routes(deps, configuration), prefix=manifest["basePath"])
    return app


def listen_port() -> int:
    """Execucao standalone — dev isolado e modulo ja extraido.

    A porta vem do ambiente, e a falta dela DERRUBA o boot (specs/arquitetura/01-modulo.md §4.3).
    O limite de corpo (config/api.json:maxBodyKb) e aplicado pelo servidor ASGI na frente.
    """
    return int(env_required("<MODULE>_API_PORT"))


def body_limit_bytes(config: ModuleConfiguration) -> int:
    return int(config.api["maxBodyKb"]) * 1024
