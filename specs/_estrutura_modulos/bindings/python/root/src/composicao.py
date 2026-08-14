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

Uso, sempre da RAIZ do projeto (RAIZ_API_PORT no ambiente ou no `.env` da raiz):

    python -m src.composicao              sobe o processo
    python -m src.composicao --autoteste  roda a prova interna das decisoes puras
"""

from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

from adapters.memory import (
    AuditoriaEmMemoria,
    AuthQueNega,
    GeradorPadrao,
    NotificadorEmMemoria,
    RelogioDoSistema,
    RepositorioEmMemoria,
    StorageEmMemoria,
)
from adapters.postgres import AuditoriaPostgres, RepositorioPostgres

# Fabrica de adapter por (porta, provedor). Acrescentar provedor e acrescentar linha AQUI, so.
#
# Toda fabrica recebe o manifesto do modulo que esta compondo (`dict`, o mesmo formato de
# `discover_modules`) — `memory` ignora (nao precisa saber QUEM a chamou, por isso os `lambda`
# descartam o argumento), `postgres` usa (`module["id"]` para a chave de ambiente,
# `module["pasta"]` para ler `data.schema`/`data.prefix` do proprio manifesto). Sem isto, um
# adapter que precisa de contexto por-modulo nao teria como sabe-lo.
FABRICAS: dict[str, dict[str, Callable[[dict[str, Any]], Any]]] = {
    "repositorio": {"memory": lambda modulo: RepositorioEmMemoria(), "postgres": RepositorioPostgres},
    "auditoria": {"memory": lambda modulo: AuditoriaEmMemoria(), "postgres": AuditoriaPostgres},
    "relogio": {"sistema": lambda modulo: RelogioDoSistema()},
    "geradorId": {"padrao": lambda modulo: GeradorPadrao()},
    "storage": {"memory": lambda modulo: StorageEmMemoria()},
    "notificador": {"memory": lambda modulo: NotificadorEmMemoria()},
}


def _read_json(caminho: Path) -> Any:
    return json.loads(caminho.read_text(encoding="utf-8-sig"))


def discover_modules(raiz: Path) -> list[dict[str, Any]]:
    """Le todos os manifestos. E a DESCOBERTA: o sistema conhece os modulos por declaracao, nao
    por import. Molde (`_*`) fica de fora — e material do scaffold, nao um modulo do sistema."""
    base = raiz / "modules"
    if not base.exists():
        return []

    achados = []
    for pasta in sorted(base.iterdir()):
        if pasta.name.startswith("_") or not (pasta / "module.json").exists():
            continue
        manifesto = _read_json(pasta / "module.json")
        manifesto["pasta"] = pasta
        achados.append(manifesto)
    return achados


def resolve_dependencies(modulo: dict[str, Any]) -> dict[str, Any]:
    """Resolve as portas declaradas, lendo a ESCOLHA em config/ports.json do modulo.

    Porta declarada sem provedor conhecido derruba o boot — melhor falhar aqui que servir errado.
    """
    escolhas = _read_json(modulo["pasta"] / "config" / "ports.json")
    dependencias: dict[str, Any] = {}

    for porta in modulo["ports"]:
        provedor = escolhas.get(porta)
        fabrica = FABRICAS.get(porta, {}).get(provedor or "")
        if fabrica is None:
            identificador = modulo["id"]
            raise RuntimeError(
                f'[composicao] {identificador}: porta "{porta}" com provedor '
                f'"{provedor}" sem fabrica registrada'
            )
        dependencias[porta] = fabrica(modulo)
    return dependencias


def resolve_auth() -> AuthQueNega:
    """Enquanto nao houver login, NEGA tudo — as rotas que precisam funcionar sem token estao
    declaradas em `publicRoutes` de cada modulo, e so elas passam."""
    return AuthQueNega()


def verify_routes_unique(modulos: list[dict[str, Any]]) -> None:
    """Nenhum par de modulos pode reivindicar a mesma rotaBase: o dispatcher so guarda UM app por
    prefixo, entao o segundo modulo simplesmente desapareceria, mudo, do sistema. PURO — dado o
    array de manifestos, so decide; nao toca disco nem rede."""
    por_rota: dict[str, list[str]] = {}
    for modulo in modulos:
        por_rota.setdefault(modulo["basePath"], []).append(modulo["id"])

    colisoes = {rota: ids for rota, ids in por_rota.items() if len(ids) > 1}
    if not colisoes:
        return
    detalhe = "; ".join(f'"{rota}" ({", ".join(ids)})' for rota, ids in colisoes.items())
    raise RuntimeError(f"[composicao] rotaBase colidindo entre modulos: {detalhe}")


def choose_base_route(rotas_base: list[str], caminho: str) -> str | None:
    """Escolhe a rotaBase cujo prefixo casa `caminho`, por FRONTEIRA de segmento — nunca por
    `startswith` cru: "/api/v1/catalogo" nao pode casar "/api/v1/catalogo-x". PURO.

    Precisa disto porque o dispatcher da raiz NAO usa `Mount` do Starlette: `Mount` faz STRIP do
    prefixo casado antes de repassar, mas cada sub-app de modulo ja tem a propria rotaBase
    embutida no roteador dela (o `create_app` do modulo aplica `prefix=manifesto["basePath"]`) —
    stripar de novo faria toda rota do modulo responder 404. O dispatcher, por isso, so ESCOLHE o
    app certo e repassa o `scope` intacto (`RaizAsgi` abaixo). Ordena por comprimento decrescente
    para a rotaBase mais especifica vencer primeiro, caso um dia existam rotas aninhadas.
    """
    for rota_base in sorted(rotas_base, key=len, reverse=True):
        if caminho == rota_base or caminho.startswith(rota_base + "/"):
            return rota_base
    return None


def _import_api_module(modulo: dict[str, Any]) -> Any:
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
    pasta = str(modulo["pasta"])
    prefixos = ("core.", "api.")
    nomes_do_modulo = [n for n in sys.modules if n in ("core", "api") or n.startswith(prefixos)]
    for nome in nomes_do_modulo:
        del sys.modules[nome]

    sys.path.insert(0, pasta)
    try:
        return importlib.import_module("api.src")
    finally:
        sys.path.remove(pasta)


class RaizAsgi:
    """O app do PROCESSO: dispatcha por rotaBase para o app ASGI do modulo dono, sem `Mount` (ver
    `choose_base_route`). So entende `http` e `lifespan` — nenhum modulo declara websocket."""

    def __init__(self, apps_por_rota_base: dict[str, Any]) -> None:
        self._apps = apps_por_rota_base
        self._rotas = list(apps_por_rota_base)

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "lifespan":
            await self._lifecycle(receive, send)
            return
        if scope["type"] != "http":
            await self._not_found(send)
            return

        rota_base = choose_base_route(self._rotas, scope["path"])
        if rota_base is None:
            await self._not_found(send)
            return
        await self._apps[rota_base](scope, receive, send)

    @staticmethod
    async def _lifecycle(receive: Any, send: Any) -> None:
        """Nenhum modulo declara startup/shutdown — so confirma o protocolo para o uvicorn nao
        acusar 'lifespan unsupported'."""
        while True:
            mensagem = await receive()
            if mensagem["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif mensagem["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return

    @staticmethod
    async def _not_found(send: Any) -> None:
        corpo = json.dumps({"erro": {"codigo": "NAO_ENCONTRADO", "mensagem": "rota nao encontrada"}}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 404,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": corpo})


def build_system(raiz: Path) -> RaizAsgi:
    """Monta o app do PROCESSO: um app ASGI por modulo, sob a `basePath` dele. Cada modulo ja
    expoe suas rotas sob a propria rotaBase — `create_app` cuida disso; aqui NAO se remonta rota
    nenhuma, so se escolhe qual app atende cada requisicao (`RaizAsgi`)."""
    modulos = discover_modules(raiz)
    verify_routes_unique(modulos)

    auth = resolve_auth()
    apps: dict[str, Any] = {}
    for modulo in modulos:
        deps_por_nome = resolve_dependencies(modulo)
        api = _import_api_module(modulo)
        # `DependenciasModulo` e um dataclass POR MODULO (core/ports/__init__.py de cada um, nao
        # um tipo global) — o bootstrap acessa `deps.geradorId` por ATRIBUTO, nunca por chave. Como
        # `_import_api_module` ja deixou o `core.ports` FRESCO deste modulo em `sys.modules`
        # (import transitivo de `api.src`), a classe certa e essa — nunca uma importada aqui em
        # cima, que colidiria com o `core` de outro modulo pelo mesmo motivo do import da api.
        deps = sys.modules["core.ports"].DependenciasModulo(**deps_por_nome)
        config = api.load_configuration(modulo["pasta"])
        apps[modulo["basePath"]] = api.create_app(deps, auth, config)
    return RaizAsgi(apps)


def _read_pairs_env(caminho: Path) -> list[tuple[str, str]]:
    pares: list[tuple[str, str]] = []
    for linha in caminho.read_text(encoding="utf-8-sig").splitlines():
        limpa = linha.strip()
        if limpa == "" or limpa.startswith("#") or "=" not in limpa:
            continue
        chave, _, valor = limpa.partition("=")
        pares.append((chave.strip(), valor.strip()))
    return pares


def _load_env_root(raiz: Path) -> None:
    """Carrega o `.env` UNICO da raiz (specs/arquitetura/00-arquitetura.md §5) no processo, sem
    sobrescrever o que ja veio de fora (mesma precedencia de ADR-004). E o unico lugar que toca
    este arquivo: cada modulo, chamado daqui, ainda resolve o proprio `.env`/`ENV_RAIZ`, mas a
    essa altura o processo ja tem tudo — a leitura dele so confirma o que ja esta la."""
    caminho = raiz / ".env"
    if not caminho.exists():
        return
    for chave, valor in _read_pairs_env(caminho):
        os.environ.setdefault(chave, valor)


def _env_required_root(chave: str) -> str:
    """Le uma variavel obrigatoria da RAIZ. Ausente = boot morre com mensagem acionavel."""
    valor = os.environ.get(chave)
    if valor is None or valor == "":
        raise RuntimeError(f"[composicao] variavel obrigatoria ausente: {chave} (declare em project.json)")
    return valor


def start_system(raiz: Path) -> None:
    """Sobe o processo: um app ASGI, uma porta (specs/arquitetura/00-arquitetura.md §5). A porta
    vem do ambiente — nenhum literal aqui — e a falta dela DERRUBA o boot, nomeando a chave."""
    # Lazy DE PROPOSITO: uvicorn e servidor ASGI, so preciso para SUBIR o processo de verdade.
    # `--autoteste` (composicao.py) e os testes importam este modulo sem nunca chamar
    # start_system — import no topo pagaria o custo desse import em todo caminho que so quer
    # build_system()/verify_routes_unique(), nunca boot real.
    import uvicorn  # noqa: PLC0415

    _load_env_root(raiz)
    porta = int(_env_required_root("RAIZ_API_PORT"))
    app = build_system(raiz)
    uvicorn.run(app, port=porta)


# ================================================================================================
# AUTOTESTE — so as decisoes PURAS (`verify_routes_unique`, `choose_base_route`): descoberta,
# DI, import isolado e boot sao I/O de verdade, provados pela subida real de processo (relatorio
# do bloco), nao por fixture em memoria.
# ================================================================================================


def _test_manifest(id_: str, rota_base: str) -> dict[str, Any]:
    return {"id": id_, "basePath": rota_base}


def _unique_routes_cases() -> list[dict[str, Any]]:
    return [
        {"name": "lista vazia", "modules": [], "espera_erro": False},
        {"name": "um so modulo", "modules": [_test_manifest("a", "/api/v1/a")], "espera_erro": False},
        {
            "name": "rotas distintas",
            "modules": [_test_manifest("a", "/api/v1/a"), _test_manifest("b", "/api/v1/b")],
            "espera_erro": False,
        },
        {
            "name": "rotas colidindo",
            "modules": [_test_manifest("a", "/api/v1/a"), _test_manifest("a2", "/api/v1/a")],
            "espera_erro": True,
        },
    ]


def _route_choice_cases() -> list[dict[str, Any]]:
    rotas = ["/api/v1/catalogo", "/api/v1/pedidos"]
    return [
        {"name": "casa exato", "rotas": rotas, "caminho": "/api/v1/catalogo", "esperado": "/api/v1/catalogo"},
        {
            "name": "casa sub-caminho",
            "rotas": rotas,
            "caminho": "/api/v1/catalogo/health",
            "esperado": "/api/v1/catalogo",
        },
        {
            "name": "NAO casa prefixo parcial",
            "rotas": rotas,
            "caminho": "/api/v1/catalogo-x/health",
            "esperado": None,
        },
        {"name": "sem match", "rotas": rotas, "caminho": "/nada", "esperado": None},
    ]


def _write(texto: str) -> None:
    sys.stdout.write(texto)


def _run_selftest() -> int:
    falhas = 0

    for caso in _unique_routes_cases():
        lancou = False
        try:
            verify_routes_unique(caso["modules"])
        except RuntimeError:
            lancou = True
        ok = lancou == caso["espera_erro"]
        _write(f"  {'ok   ' if ok else 'FALHA'} verify_routes_unique: {caso['nome']}\n")
        if not ok:
            falhas += 1

    for caso in _route_choice_cases():
        obtido = choose_base_route(caso["rotas"], caso["caminho"])
        ok = obtido == caso["esperado"]
        _write(f"  {'ok   ' if ok else 'FALHA'} choose_base_route: {caso['nome']}\n")
        if not ok:
            falhas += 1
            _write(f"       esperado: {caso['esperado']!r} obtido: {obtido!r}\n")

    total = len(_unique_routes_cases()) + len(_route_choice_cases())
    _write(f"\nautoteste: {total - falhas}/{total} ok\n")
    return 0 if falhas == 0 else 1


if __name__ == "__main__":
    if "--autoteste" in sys.argv:
        sys.exit(_run_selftest())
    else:
        start_system(Path.cwd())
