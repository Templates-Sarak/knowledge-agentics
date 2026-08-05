"""Bootstrap da api do modulo <modulo>. Lei dona: specs/arquitetura/01-modulo.md §5.

REGRA CENTRAL: este arquivo RECEBE os adapters ja instanciados — nunca os cria e nunca importa
adapter nem SDK de fornecedor. Quem escolhe o provedor e a raiz de composicao, lendo
config/portas.json. E o que permite trocar Postgres por outro banco editando um JSON.
"""

from __future__ import annotations

from fastapi import FastAPI

from core.portas import Auth, DependenciasModulo
from .config import ConfiguracaoModulo, carregar_configuracao, env_obrigatoria
from .logger import criar_logger
from .middlewares import ContextoDaBorda, registrar_middlewares
from .rotas import criar_rotas

__all__ = ["criar_app", "porta_de_escuta", "carregar_configuracao", "env_obrigatoria"]


def criar_app(deps: DependenciasModulo, auth: Auth, config: ConfiguracaoModulo | None = None) -> FastAPI:
    """Monta o modulo num FastAPI. Usado pela raiz de composicao E pelos testes de contrato."""
    configuracao = config or carregar_configuracao()
    manifesto = configuracao.manifesto

    logger = criar_logger(
        modulo=manifesto["id"],
        nivel_minimo=configuracao.api["nivelLog"],
        campos_sensiveis=manifesto["camposSensiveis"],
    )

    app = FastAPI(
        title=configuracao.textos["titulo"],
        version=manifesto["versao"],
        docs_url=None,
        redoc_url=None,
    )
    registrar_middlewares(app, configuracao, ContextoDaBorda(deps.geradorId, auth, logger))
    app.include_router(criar_rotas(deps, configuracao), prefix=manifesto["rotaBase"])
    return app


def porta_de_escuta() -> int:
    """Execucao standalone — dev isolado e modulo ja extraido.

    A porta vem do ambiente, e a falta dela DERRUBA o boot (specs/arquitetura/01-modulo.md §4.3).
    O limite de corpo (config/api.json:corpoMaximoKb) e aplicado pelo servidor ASGI na frente.
    """
    return int(env_obrigatoria("<MODULO>_API_PORT"))


def limite_de_corpo_em_bytes(config: ConfiguracaoModulo) -> int:
    return int(config.api["corpoMaximoKb"]) * 1024
