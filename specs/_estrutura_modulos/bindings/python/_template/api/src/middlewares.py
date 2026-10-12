"""Cadeia de seguranca do modulo <module>. Lei dona: specs/arquitetura/03-operacao.md §2.1.

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

from core.ports import Auth, IdGenerator
from .errors import ApiError, error_envelope
from .logger import Logger

NextCall = Callable[[Request], Awaitable[Any]]


def _path_relative(path: str, base_route: str) -> str:
    """`publicRoutes` e declarado RELATIVO a rotaBase ("GET /health"), mas esta cadeia roda antes
    do router — aqui o caminho ainda e absoluto. Sem tirar o prefixo, nenhuma rota publica casaria
    e /health, /meta e /resumo responderiam 401."""
    if not path.startswith(base_route):
        return path
    return path[len(base_route) :] or "/"


@dataclass(frozen=True)
class EdgeContext:
    """O que a cadeia precisa alem da config. Agrupado para respeitar o limiar de 4 parametros
    (specs/arquitetura/04-regras.md §4.7) — e porque os tres andam sempre juntos."""

    generator: IdGenerator
    auth: Auth
    logger: Logger


def record_middlewares(app: Any, config: Any, boundary: EdgeContext) -> None:
    generator, auth, logger = boundary.generator, boundary.auth, boundary.logger
    security = config.security
    manifest = config.manifest
    public_set = {route.upper() for route in manifest["publicRoutes"]}
    windows: dict[str, tuple[float, int]] = {}

    @app.middleware("http")
    async def chain(request: Request, call_next: NextCall) -> Any:
        request.state.request_id = generator.hash()
        try:
            _limit(request, security["rateLimit"], windows)
            await _authenticate(request, auth, public_set, manifest["basePath"])
            response = await call_next(request)
        except ApiError as error:
            return _respond_error(error, request, logger)
        except Exception as cause:  # noqa: BLE001 — traduzido, nunca engolido
            internal = ApiError("INTERNAL", config.texts["genericError"], str(cause))
            return _respond_error(internal, request, logger)

        _apply_headers(response, security["headers"])
        _apply_cors(request, response, security["cors"])
        response.headers["x-request-id"] = request.state.request_id
        return response


def _respond_error(error: ApiError, request: Request, logger: Logger) -> JSONResponse:
    """Unico lugar que transforma excecao em resposta. Detalhe vai para o log, nunca ao cliente."""
    request_id = getattr(request.state, "request_id", "")
    logger.error(
        "request failed",
        data={
            "requestId": request_id,
            "code": error.code,
            "path": request.url.path,
            "detail": error.detail or error.message,
        },
    )
    return JSONResponse(status_code=error.status, content=error_envelope(error, request_id))


def _apply_headers(response: Any, headers: dict[str, Any]) -> None:
    if headers["hsts"]:
        response.headers["strict-transport-security"] = "max-age=31536000; includeSubDomains"
    if headers["noSniff"]:
        response.headers["x-content-type-options"] = "nosniff"
    if headers["frameDeny"]:
        response.headers["x-frame-options"] = "DENY"
    response.headers["referrer-policy"] = headers["referrerPolicy"]


def _apply_cors(request: Request, response: Any, cors: dict[str, Any]) -> None:
    """Origens sao DECLARADAS em config/security.json. `*` e proibido."""
    origin = request.headers.get("origin")
    if origin is not None and origin in cors["allowedOrigins"]:
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-methods"] = ", ".join(cors["methods"])


def _limit(request: Request, config: dict[str, Any], windows: dict[str, tuple[float, int]]) -> None:
    """Contador em memoria: suficiente para um processo. Multi-instancia exige porta dedicada."""
    limit = config["readLimit"] if request.method == "GET" else config["writeLimit"]
    key = f"{request.client.host if request.client else '?'}:{request.method}"
    now = time.monotonic()
    start, count = windows.get(key, (now, 0))

    if now - start > config["windowSeconds"]:
        windows[key] = (now, 1)
        return
    if count + 1 > limit:
        raise ApiError("LIMIT_EXCEEDED", "request limit exceeded")
    windows[key] = (start, count + 1)


async def _authenticate(request: Request, auth: Auth, public_set: set[str], base_route: str) -> None:
    """DENY BY DEFAULT: so as rotas de `module.json:publicRoutes` passam sem token."""
    relative_path = _path_relative(request.url.path, base_route)
    if f"{request.method} {relative_path}".upper() in public_set:
        request.state.permissions = []
        return

    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError("UNAUTHENTICATED", "missing token")

    claims = await auth.verify(header[7:])
    if claims is None:
        raise ApiError("UNAUTHENTICATED", "invalid token")
    request.state.permissions = claims.get("permissions", [])


def require_permission(request: Request, permission: str) -> None:
    """Autorizacao por permissao NOMEADA. RLS no banco e defesa em profundidade, nao o controle."""
    if permission not in getattr(request.state, "permissions", []):
        raise ApiError("FORBIDDEN", "insufficient permission")
