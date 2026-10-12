"""Raiz de composicao — o WIRING, e nada alem. Lei dona: specs/arquitetura/00-arquitetura.md §3.4.

O que este modulo faz:
  1. DESCOBRE os modulos lendo modules/*/module.json — nao existe lista fixa de modulos no codigo;
  2. resolve as portas de cada um a partir do config/ports.json DELE;
  3. INJETA os adapters e monta cada api/ sob a rotaBase do manifesto;
  4. sobe UM processo, UMA porta (specs/arquitetura/00-arquitetura.md §5).

O que ele NAO faz: regra de negocio, nem servir front (specs/arquitetura/00-arquitetura.md §4.4:
cada `web/` e build estatico do PROPRIO modulo, publicado por fora deste processo). Nenhum modulo
importa daqui, e nada aqui conhece o dominio de modulo nenhum. Acrescentar um modulo nao pode
exigir editar este arquivo.

Uso, sempre da RAIZ do projeto (ROOT_API_PORT no ambiente ou no `.env` da raiz):

    python -m src.composition              sobe o processo
    python -m src.composition --selftest  roda a prova interna das decisoes puras
"""

from __future__ import annotations

import contextlib
import importlib
import json
import os
import signal
import sys
import threading
from pathlib import Path
from typing import Any, Callable, Iterator

from adapters.memory import (
    DenyingTokenVerifier,
    DefaultIdGenerator,
    InMemoryAudit,
    InMemoryNotifier,
    InMemoryRepository,
    InMemoryStorage,
    SystemClock,
)
from adapters.postgres import PostgresAudit, PostgresRepository

# Fabrica de adapter por (porta, provedor). Acrescentar provedor e acrescentar linha AQUI, so.
#
# Toda fabrica recebe o manifesto do modulo que esta compondo (`dict`, o mesmo formato de
# `discover_modules`) — `memory` ignora (nao precisa saber QUEM a chamou, por isso os `lambda`
# descartam o argumento), `postgres` usa (`module["id"]` para a chave de ambiente,
# `module["pasta"]` para ler `data.schema`/`data.prefix` do proprio manifesto). Sem isto, um
# adapter que precisa de contexto por-modulo nao teria como sabe-lo.
FACTORIES: dict[str, dict[str, Callable[[dict[str, Any]], Any]]] = {
    "repository": {"memory": lambda module: InMemoryRepository(), "postgres": PostgresRepository},
    "audit": {"memory": lambda module: InMemoryAudit(), "postgres": PostgresAudit},
    "clock": {"system": lambda module: SystemClock()},
    "idGenerator": {"default": lambda module: DefaultIdGenerator()},
    "storage": {"memory": lambda module: InMemoryStorage()},
    "notifier": {"memory": lambda module: InMemoryNotifier()},
}


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def discover_modules(root: Path) -> list[dict[str, Any]]:
    """Le todos os manifestos. E a DESCOBERTA: o sistema conhece os modulos por declaracao, nao
    por import. Molde (`_*`) fica de fora — e material do scaffold, nao um modulo do sistema."""
    base = root / "modules"
    if not base.exists():
        return []

    findings = []
    for dir in sorted(base.iterdir()):
        if dir.name.startswith("_") or not (dir / "module.json").exists():
            continue
        manifest = _read_json(dir / "module.json")
        manifest["dir"] = dir
        findings.append(manifest)
    return findings


def resolve_dependencies(module: dict[str, Any]) -> dict[str, Any]:
    """Resolve as portas declaradas, lendo a ESCOLHA em config/ports.json do modulo.

    Porta declarada sem provedor conhecido derruba o boot — melhor falhar aqui que servir errado.
    """
    choices = _read_json(module["dir"] / "config" / "ports.json")
    dependencies: dict[str, Any] = {}

    for port in module["ports"]:
        provider = choices.get(port)
        factory = FACTORIES.get(port, {}).get(provider or "")
        if factory is None:
            identifier = module["id"]
            raise RuntimeError(
                f'[composition] {identifier}: port "{port}" with provider '
                f'"{provider}" without a registered factory'
            )
        dependencies[port] = factory(module)
    return dependencies


def resolve_token_verifier() -> DenyingTokenVerifier:
    """Enquanto nao houver login, NEGA tudo — as rotas que precisam funcionar sem token estao
    declaradas em `publicRoutes` de cada modulo, e so elas passam."""
    return DenyingTokenVerifier()


def verify_routes_unique(modules: list[dict[str, Any]]) -> None:
    """Nenhum par de modulos pode reivindicar a mesma rotaBase: o dispatcher so guarda UM app por
    prefixo, entao o segundo modulo simplesmente desapareceria, mudo, do sistema. PURO — dado o
    array de manifestos, so decide; nao toca disco nem rede."""
    by_route: dict[str, list[str]] = {}
    for module in modules:
        by_route.setdefault(module["basePath"], []).append(module["id"])

    collisions = {route: ids for route, ids in by_route.items() if len(ids) > 1}
    if not collisions:
        return
    detail = "; ".join(f'"{route}" ({", ".join(ids)})' for route, ids in collisions.items())
    raise RuntimeError(f"[composition] baseRoute colliding across modules: {detail}")


def choose_base_route(base_routes: list[str], path: str) -> str | None:
    """Escolhe a rotaBase cujo prefixo casa `path`, por FRONTEIRA de segmento — nunca por
    `startswith` cru: "/api/v1/catalog" nao pode casar "/api/v1/catalog-x". PURO.

    Precisa disto porque o dispatcher da raiz NAO usa `Mount` do Starlette: `Mount` faz STRIP do
    prefixo casado antes de repassar, mas cada sub-app de modulo ja tem a propria rotaBase
    embutida no roteador dela (o `create_app` do modulo aplica `prefix=manifesto["basePath"]`) —
    stripar de novo faria toda rota do modulo responder 404. O dispatcher, por isso, so ESCOLHE o
    app certo e repassa o `scope` intacto (`AsgiRoot` abaixo). Ordena por comprimento decrescente
    para a rotaBase mais especifica vencer primeiro, caso um dia existam rotas aninhadas.
    """
    for base_route in sorted(base_routes, key=len, reverse=True):
        if path == base_route or path.startswith(base_route + "/"):
            return base_route
    return None


def _import_api_module(module: dict[str, Any]) -> Any:
    """Carrega `api.src` do modulo — o mesmo `create_app` que os testes de contrato usam.

    Cada modulo Python usa `core.*` como import ABSOLUTO relativo a PASTA DELE (o mesmo motivo de
    cada modulo ser testado isolado — pyproject.toml raiz, comentario de `pythonpath`). Compor N
    modulos no MESMO processo faria o segundo `import core.ports` devolver o `core` do PRIMEIRO
    modulo — o cache global do Python em `sys.modules` conhece o NOME, nao o arquivo; dois modulos
    fisicamente diferentes compartilham o mesmo nome `core`. Por isso o import de cada modulo
    acontece com `sys.path` apontando SO para a pasta dele, com o cache de `core`/`api` limpo
    antes: o `create_app` capturado guarda so o que precisa (fechamento de funcao), entao o proximo
    modulo pode reusar os MESMOS nomes sem colidir com o anterior.
    """
    dir = str(module["dir"])
    prefixes = ("core.", "api.")
    module_names = [n for n in sys.modules if n in ("core", "api") or n.startswith(prefixes)]
    for name in module_names:
        del sys.modules[name]

    sys.path.insert(0, dir)
    try:
        return importlib.import_module("api.src")
    finally:
        sys.path.remove(dir)


class AsgiRoot:
    """O app do PROCESSO: dispatcha por rotaBase para o app ASGI do modulo dono, sem `Mount` (ver
    `choose_base_route`). So entende `http` e `lifespan` — nenhum modulo declara websocket."""

    def __init__(self, apps_by_base_route: dict[str, Any]) -> None:
        self._apps = apps_by_base_route
        self._routes = list(apps_by_base_route)

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "lifespan":
            await self._lifecycle(receive, send)
            return
        if scope["type"] != "http":
            await self._not_found(send)
            return

        base_route = choose_base_route(self._routes, scope["path"])
        if base_route is None:
            await self._not_found(send)
            return
        await self._apps[base_route](scope, receive, send)

    @staticmethod
    async def _lifecycle(receive: Any, send: Any) -> None:
        """Nenhum modulo declara startup/shutdown — so confirma o protocolo para o uvicorn nao
        acusar 'lifespan unsupported'."""
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return

    @staticmethod
    async def _not_found(send: Any) -> None:
        body = json.dumps({"error": {"code": "NOT_FOUND", "message": "route not found"}}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 404,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": body})


def build_system(root: Path) -> AsgiRoot:
    """Monta o app do PROCESSO: um app ASGI por modulo, sob a `basePath` dele. Cada modulo ja
    expoe suas rotas sob a propria rotaBase — `create_app` cuida disso; aqui NAO se remonta rota
    nenhuma, so se escolhe qual app atende cada requisicao (`AsgiRoot`)."""
    modules = discover_modules(root)
    verify_routes_unique(modules)

    auth = resolve_token_verifier()
    apps: dict[str, Any] = {}
    for module in modules:
        deps_by_name = resolve_dependencies(module)
        api = _import_api_module(module)
        # `ModuleDependencies` e um dataclass POR MODULO (core/ports/__init__.py de cada um, nao
        # um tipo global) — o bootstrap acessa `deps.idGenerator` por ATRIBUTO, nunca por chave. Como
        # `_import_api_module` ja deixou o `core.ports` FRESCO deste modulo em `sys.modules`
        # (import transitivo de `api.src`), a classe certa e essa — nunca uma importada aqui em
        # cima, que colidiria com o `core` de outro modulo pelo mesmo motivo do import da api.
        deps = sys.modules["core.ports"].ModuleDependencies(**deps_by_name)
        config = api.load_configuration(module["dir"])
        apps[module["basePath"]] = api.create_app(deps, auth, config)
    return AsgiRoot(apps)


def _read_pairs_env(path: Path) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        cleaned = line.strip()
        if cleaned == "" or cleaned.startswith("#") or "=" not in cleaned:
            continue
        key, _, value = cleaned.partition("=")
        pairs.append((key.strip(), value.strip()))
    return pairs


def _load_env_root(root: Path) -> None:
    """Carrega o `.env` UNICO da raiz (specs/arquitetura/00-arquitetura.md §5) no processo, sem
    sobrescrever o que ja veio de fora (mesma precedencia de ADR-004). E o unico lugar que toca
    este arquivo: cada modulo, chamado daqui, ainda resolve o proprio `.env`/`ENV_ROOT`, mas a
    essa altura o processo ja tem tudo — a leitura dele so confirma o que ja esta la."""
    path = root / ".env"
    if not path.exists():
        return
    for key, value in _read_pairs_env(path):
        os.environ.setdefault(key, value)


def _env_required_root(key: str) -> str:
    """Le uma variavel obrigatoria da RAIZ. Ausente = boot morre com mensagem acionavel."""
    value = os.environ.get(key)
    if value is None or value == "":
        raise RuntimeError(f"[composition] required variable missing: {key} (declare it in project.json)")
    return value


def _log_composition(level: str, message: str, **fields: Any) -> None:
    """Log ESTRUTURADO da raiz de composicao — uma linha JSON, a mesma forma `{nivel, modulo,
    mensagem}` dos modulos."""
    _write(json.dumps({"level": level, "module": "composition", "message": message, **fields}) + "\n")


def parse_runtime_config(text: str) -> int:
    """PURA — valida o TEXTO de `config/runtime.json` e devolve `shutdown.drainTimeoutMs` (ms).
    Tunable ausente ou invalido DERRUBA o boot, nomeando a chave: nunca um default embutido (mesma lei
    de `ROOT_API_PORT`)."""
    try:
        raw = json.loads(text.removeprefix("﻿"))
    except json.JSONDecodeError as cause:
        raise RuntimeError(f"[composition] config/runtime.json is not valid JSON: {cause}") from cause
    cap = raw.get("shutdown", {}).get("drainTimeoutMs") if isinstance(raw, dict) else None
    if isinstance(cap, bool) or not isinstance(cap, int) or cap <= 0:
        raise RuntimeError(
            "[composition] config/runtime.json: shutdown.drainTimeoutMs must be an integer > 0 (ms)"
        )
    return cap


def _load_runtime_config(root: Path) -> int:
    path = root / "config" / "runtime.json"
    if not path.exists():
        raise RuntimeError(f"[composition] {path} missing — the root declares the shutdown cap here")
    return parse_runtime_config(path.read_text(encoding="utf-8"))


def shutdown_exit_code(result: str) -> int:
    """PURA — o codigo de saida do desligamento: so "drained" (drenou dentro do teto) sai 0."""
    return 0 if result == "drained" else 1


@contextlib.contextmanager
def _capture_signals_without_reraise(server: Any) -> Iterator[None]:
    """Substitui o `capture_signals` do uvicorn: o original, depois de desligar gracioso, REEMITE o
    sinal capturado com o handler original — o processo morre POR SINAL (143 no Linux, 0xC000013A no
    Windows), nunca com `exit 0`, e o orquestrador nao distingue "drenou" de "foi morto". Aqui o
    desligamento que drenou sai 0 de verdade. Depende do `uvicorn.Server` fixado (`==` no pyproject)."""
    from uvicorn.server import HANDLED_SIGNALS  # noqa: PLC0415

    if threading.current_thread() is not threading.main_thread():
        yield
        return
    originals = {sig: signal.signal(sig, server.handle_exit) for sig in HANDLED_SIGNALS}
    try:
        yield
    finally:
        for sig, handler in originals.items():
            signal.signal(sig, handler)


def _drain_timeout_exit() -> None:
    code = shutdown_exit_code("timeout")
    _log_composition("error", "shutdown completed", result="timeout", code=code)
    os._exit(code)


def _build_server(app: Any, host: str, port: int, drain_ms: int) -> Any:
    """O servidor uvicorn com o teto de drenagem. Ao 1o SIGTERM/SIGINT (SIGBREAK no Windows) ele para
    de aceitar conexoes e drena; um relogio de `drain_ms` derruba o processo com codigo != 0 se a
    drenagem nao terminar (ver `_capture_signals_without_reraise` para o motivo da substituicao)."""
    import uvicorn  # noqa: PLC0415

    class ServerWithCap(uvicorn.Server):
        def handle_exit(self, sig: int, frame: Any) -> None:
            if not self.should_exit:
                _log_composition("info", "shutdown started", signal=int(sig), drainTimeoutMs=drain_ms)
                clock = threading.Timer(drain_ms / 1000, _drain_timeout_exit)
                clock.daemon = True
                clock.start()
            super().handle_exit(sig, frame)

        def capture_signals(self) -> Any:
            return _capture_signals_without_reraise(self)

    return ServerWithCap(uvicorn.Config(app, host=host, port=port, log_level="info"))


def start_system(root: Path) -> None:
    """Sobe o processo: um app ASGI, uma porta (specs/arquitetura/00-arquitetura.md §5). Porta e host
    vem do ambiente — nenhum literal aqui — e a falta de qualquer um DERRUBA o boot, nomeando a
    chave. SIGTERM/SIGINT desligam gracioso, dentro do teto de `config/runtime.json`."""
    _load_env_root(root)
    port = int(_env_required_root("ROOT_API_PORT"))
    host = _env_required_root("ROOT_API_HOST")
    drain_ms = _load_runtime_config(root)
    app = build_system(root)
    _log_composition("info", f"system starting on port {port}", host=host, port=port)
    # Lazy DE PROPOSITO (em `_build_server`): uvicorn so e preciso para SUBIR o processo de verdade;
    # `--selftest` e os testes importam este modulo sem nunca chamar `start_system`.
    server = _build_server(app, host, port, drain_ms)
    server.run()
    code = shutdown_exit_code("drained")
    _log_composition("info", "shutdown completed", result="drained", code=code)


# ================================================================================================
# AUTOTESTE — so as decisoes PURAS (`verify_routes_unique`, `choose_base_route`): descoberta,
# DI, import isolado e boot sao I/O de verdade, provados pela subida real de processo (relatorio
# do bloco), nao por fixture em memoria.
# ================================================================================================


def _test_manifest(id_: str, base_route: str) -> dict[str, Any]:
    return {"id": id_, "basePath": base_route}


def _unique_routes_cases() -> list[dict[str, Any]]:
    return [
        {"name": "empty list", "modules": [], "expects_error": False},
        {"name": "a single module", "modules": [_test_manifest("a", "/api/v1/a")], "expects_error": False},
        {
            "name": "distinct routes",
            "modules": [_test_manifest("a", "/api/v1/a"), _test_manifest("b", "/api/v1/b")],
            "expects_error": False,
        },
        {
            "name": "colliding routes",
            "modules": [_test_manifest("a", "/api/v1/a"), _test_manifest("a2", "/api/v1/a")],
            "expects_error": True,
        },
    ]


def _route_choice_cases() -> list[dict[str, Any]]:
    routes = ["/api/v1/catalog", "/api/v1/orders"]
    return [
        {
            "name": "matches exactly",
            "routes": routes,
            "path": "/api/v1/catalog",
            "expected": "/api/v1/catalog",
        },
        {
            "name": "matches a sub-path",
            "routes": routes,
            "path": "/api/v1/catalog/health",
            "expected": "/api/v1/catalog",
        },
        {
            "name": "does NOT match a partial prefix",
            "routes": routes,
            "path": "/api/v1/catalog-x/health",
            "expected": None,
        },
        {"name": "no match", "routes": routes, "path": "/nothing", "expected": None},
    ]


def _write(text: str) -> None:
    sys.stdout.write(text)
    sys.stdout.flush()


TEST_CAP = 5000


def _runtime_cases() -> list[tuple[str, bool]]:
    def throws(text: str) -> bool:
        try:
            parse_runtime_config(text)
        except RuntimeError:
            return True
        return False

    invalid = ("0", "-5", "1.5", '"10"', "true")
    valid = '{"shutdown":{"drainTimeoutMs":' + str(TEST_CAP) + "}}"
    return [
        (
            "parse_runtime_config: accepts an integer cap > 0",
            parse_runtime_config(valid) == TEST_CAP,
        ),
        ("parse_runtime_config: a missing key fails", throws("{}")),
        (
            "parse_runtime_config: zero, negative, fractional, text and bool fail",
            all(throws('{"shutdown":{"drainTimeoutMs":' + v + "}}") for v in invalid),
        ),
        ("parse_runtime_config: broken JSON fails", throws("{")),
        (
            "shutdown_exit_code: only drained exits 0",
            shutdown_exit_code("drained") == 0
            and shutdown_exit_code("timeout") != 0
            and shutdown_exit_code("error") != 0,
        ),
    ]


def _run_selftest() -> int:
    failures = 0

    for test_case in _unique_routes_cases():
        threw = False
        try:
            verify_routes_unique(test_case["modules"])
        except RuntimeError:
            threw = True
        ok = threw == test_case["expects_error"]
        _write(f"  {'ok   ' if ok else 'FAIL'} verify_routes_unique: {test_case['name']}\n")
        if not ok:
            failures += 1

    for test_case in _route_choice_cases():
        obtained = choose_base_route(test_case["routes"], test_case["path"])
        ok = obtained == test_case["expected"]
        _write(f"  {'ok   ' if ok else 'FAIL'} choose_base_route: {test_case['name']}\n")
        if not ok:
            failures += 1
            _write(f"       expected: {test_case['expected']!r} obtained: {obtained!r}\n")

    runtime = _runtime_cases()
    for name, ok in runtime:
        _write(f"  {'ok   ' if ok else 'FAIL'} {name}\n")
        if not ok:
            failures += 1

    total = len(_unique_routes_cases()) + len(_route_choice_cases()) + len(runtime)
    _write(f"\nselftest: {total - failures}/{total} ok\n")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_run_selftest())
    else:
        start_system(Path.cwd())
