"""carimbo.py — o carimbo `.sarak/base.json` de um sistema e o registro dele no `mapa.json` da base.

    python carimbo.py --target <dir> --tipo app|site [--binding <b> ...] [--modular]
                      [--registrar --id <id> --nome <nome>] [--mapa <arquivo>]
    python carimbo.py --autoteste      prova o nucleo com fixtures em memoria (sem disco)

Uma fonte para cada coisa:
  - `.sarak/base.json` (no SISTEMA) — de qual commit da base ele veio. E a fonte da VERSAO.
  - `mapa.json` (na raiz da BASE, versionado) — QUAIS sistemas adotam a base. Nao guarda versao.

Usado pelo `init_repo.py` (apps) e pela skill `spec-site-fundacao` (sites); a propagacao de
atualizacoes da base le os dois. Sem `--registrar`, o mapa nao e tocado.

Nucleo x casca: `montar_carimbo`, `registrar_no_mapa`, `caminho_relativo` e `entrada_do_mapa` sao
PURAS (recebem dados, nunca tocam `fs` nem processo) — sao o que o `--autoteste` prova. As funcoes
que leem git e escrevem arquivo sao a casca fina.
"""

import argparse
import copy
import datetime
import json
import ntpath
import os
import posixpath
import re
import subprocess
import sys
import types
from pathlib import Path

TIPOS = ("app", "site")
BINDINGS = ("typescript", "javascript", "python")
SITUACOES = ("ativo", "adocao-posterior")
# Resultado da ULTIMA propagacao (nao uma comparacao ao vivo com o HEAD). Sistema recem-instalado nasce
# `atualizado`; `desatualizado` = nunca recebeu propagacao nem adocao; `pendente` = sobrou decisao humana.
STATUS = ("desatualizado", "pendente", "atualizado")
ID_KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PACOTE_SDD = {"app": "specs-sdd-app", "site": "specs-sdd-site"}
PACOTE_MODULAR = "template-modulos"
ARQUIVO_DO_CARIMBO = Path(".sarak") / "base.json"
NOME_DO_MAPA = "mapa.json"


# ------------------------------------------------------------------ nucleo


def _validar_sistema(info: dict) -> None:
    if info["tipo"] not in TIPOS:
        raise ValueError(f"tipo '{info['tipo']}' invalido — use {' | '.join(TIPOS)}")
    bindings = info["bindings"]
    invalidos = [b for b in bindings if b not in BINDINGS]
    if invalidos:
        raise ValueError(f"binding {invalidos} invalido — use {' | '.join(BINDINGS)}")
    if len(set(bindings)) != len(bindings):
        raise ValueError(f"bindings {bindings} com valor repetido")


def bindings_de(entrada: dict) -> list:
    """Nucleo: a lista `bindings` de uma entrada — converte o campo antigo `binding` (escalar ou
    `None`) em vez de quebrar. E a compatibilidade do registro idempotente com mapa antigo."""
    if "bindings" in entrada:
        return list(entrada["bindings"])
    antigo = entrada.get("binding")
    return [antigo] if antigo else []


def _sem_binding_antigo(entrada: dict) -> dict:
    """A entrada com `binding` trocado por `bindings`, na mesma posicao da chave."""
    if "binding" not in entrada:
        return entrada
    lista = bindings_de(entrada)
    return {("bindings" if k == "binding" else k): (lista if k == "binding" else v) for k, v in entrada.items() if k != "bindings"}


def montar_carimbo(base: dict, info: dict, data: str) -> dict:
    """Nucleo: o conteudo do `.sarak/base.json`. `base` = {repo, commit, sujo}; `info` = {tipo, modular,
    bindings}; `data` = AAAA-MM-DD. Os pacotes dizem o que o sistema recebeu da base."""
    _validar_sistema(info)
    pacotes = [PACOTE_SDD[info["tipo"]]] + ([PACOTE_MODULAR] if info["modular"] else [])
    return {
        "base_repo": base["repo"],
        "base_commit": base["commit"],
        "base_com_alteracoes_locais": base["sujo"],
        "data": data,
        "tipo": info["tipo"],
        "modular": info["modular"],
        "bindings": list(info["bindings"]),
        "pacotes": pacotes,
    }


def caminho_relativo(alvo: str, raiz_base: str, caminhos: types.ModuleType = os.path) -> str:
    """Nucleo: `alvo` relativo a `raiz_base`, com `/`. Drives diferentes (Windows) e erro claro.
    `caminhos` e `os.path` em uso real; o autoteste injeta `ntpath`/`posixpath`."""
    try:
        relativo = caminhos.relpath(alvo, raiz_base)
    except ValueError as erro:
        raise ValueError(
            f"'{alvo}' e '{raiz_base}' estao em drives diferentes — o mapa so guarda caminho relativo "
            "a raiz da base; mova o sistema para o mesmo drive ou registre-o a mao"
        ) from erro
    return relativo.replace("\\", "/")


def entrada_do_mapa(ident: str, nome: str, locais: dict, info: dict) -> dict:
    """Nucleo: a entrada de um sistema no `mapa.json`. `locais` = {caminho, repo, raiz_git}."""
    _validar_sistema(info)
    if not ID_KEBAB.match(ident or ""):
        raise ValueError(f"id '{ident}' invalido — use kebab-case (ex.: earendel-erp)")
    return {
        "id": ident,
        "nome": nome,
        "caminho": locais["caminho"],
        "repo": locais["repo"],
        "raiz_git": locais["raiz_git"],
        "tipo": info["tipo"],
        "modular": info["modular"],
        "bindings": list(info["bindings"]),
        "situacao": "ativo",
    }


def com_status(entrada: dict, status: str, commit: str | None) -> dict:
    """Nucleo: a entrada com `status` e `status_base` (o commit CURTO da base em que o status foi definido)."""
    if status not in STATUS:
        raise ValueError(f"status '{status}' invalido — use {' | '.join(STATUS)}")
    return {**entrada, "status": status, "status_base": commit[:7] if commit else None}


def registrar_no_mapa(mapa: dict, sistema: dict) -> dict:
    """Nucleo: o mapa com `sistema` registrado — idempotente. Mesmo `caminho` atualiza a entrada (no
    lugar, preservando campos que o sistema nao traz); `id` ja usado por outro caminho e erro."""
    novo = copy.deepcopy(mapa)
    novo["sistemas"] = [_sem_binding_antigo(e) for e in novo.get("sistemas", [])]
    sistemas = novo["sistemas"]
    for existente in sistemas:
        if (
            existente.get("id") == sistema["id"]
            and existente.get("caminho") != sistema["caminho"]
        ):
            raise ValueError(
                f"id '{sistema['id']}' ja registrado para '{existente.get('caminho')}'"
            )
    for indice, existente in enumerate(sistemas):
        if existente.get("caminho") == sistema["caminho"]:
            sistemas[indice] = {**existente, **sistema}
            return novo
    sistemas.append(dict(sistema))
    return novo


def serializar(dados: dict) -> str:
    """Nucleo: o JSON como a base o versiona — 2 espacos, acentos preservados, `\\n` final."""
    return json.dumps(dados, indent=2, ensure_ascii=False) + "\n"


# ------------------------------------------------------------------ casca


def raiz_da_base() -> Path:
    """Raiz da base Sarak, deduzida deste arquivo (skills/<skill>/scripts/carimbo.py)."""
    return Path(__file__).resolve().parents[3]


def _git(pasta: Path, *args) -> str | None:
    try:
        r = subprocess.run(
            ["git", "-C", str(pasta), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
    except FileNotFoundError:
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def estado_da_base(raiz: Path) -> dict:
    """Casca: repo, commit e se ha alteracao local nao commitada na base (o carimbo avisa)."""
    commit = _git(raiz, "rev-parse", "HEAD")
    if commit is None:
        raise ValueError(
            f"a base em {raiz} nao e um repositorio git com commit — sem carimbo possivel"
        )
    return {
        "repo": _git(raiz, "remote", "get-url", "origin"),
        "commit": commit,
        "sujo": bool(_git(raiz, "status", "--porcelain")),
    }


def _escrever_json(caminho: Path, dados: dict) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8", newline="\n") as arquivo:
        arquivo.write(serializar(dados))


def carimbar(target: Path, raiz: Path, info: dict) -> dict:
    """Casca: escreve `<target>/.sarak/base.json` com o commit atual da base."""
    carimbo = montar_carimbo(
        estado_da_base(raiz), info, datetime.datetime.now(datetime.UTC).date().isoformat()
    )
    _escrever_json(target / ARQUIVO_DO_CARIMBO, carimbo)
    sujo = (
        " (base com alteracoes locais nao commitadas)"
        if carimbo["base_com_alteracoes_locais"]
        else ""
    )
    print(
        f"[OK] Carimbo {ARQUIVO_DO_CARIMBO.as_posix()}: base {carimbo['base_commit'][:12]}{sujo}."
    )
    return carimbo


def _locais(target: Path, raiz: Path) -> dict:
    topo = _git(target, "rev-parse", "--show-toplevel")
    return {
        "caminho": caminho_relativo(str(target.resolve()), str(raiz)),
        "repo": _git(target, "remote", "get-url", "origin"),
        "raiz_git": caminho_relativo(str(Path(topo).resolve()), str(raiz))
        if topo
        else None,
    }


def registrar(target: Path, raiz: Path, cadastro: dict, mapa: Path | None = None) -> dict:
    """Casca: registra o sistema no `mapa.json` (o da base, ou `mapa` — usado em teste).
    `cadastro` = {id, nome, tipo, modular, bindings}."""
    ident, nome = cadastro["id"], cadastro["nome"]
    info = {chave: cadastro[chave] for chave in ("tipo", "modular", "bindings")}
    destino = mapa or raiz / NOME_DO_MAPA
    atual = (
        json.loads(destino.read_text(encoding="utf-8"))
        if destino.exists()
        else {"sistemas": []}
    )
    entrada = entrada_do_mapa(ident, nome, _locais(target, raiz), info)
    # Instalacao nova: a base acabou de ser aplicada inteira — nasce `atualizado`, no commit do carimbo.
    entrada = com_status(entrada, "atualizado", estado_da_base(raiz)["commit"])
    _escrever_json(destino, registrar_no_mapa(atual, entrada))
    print(f"[OK] Sistema '{ident}' registrado em {destino}.")
    return entrada


def _parser():
    parser = argparse.ArgumentParser(
        description="Carimbo .sarak/base.json + registro no mapa.json da base."
    )
    parser.add_argument("--target", required=True, help="Pasta do sistema.")
    parser.add_argument("--tipo", required=True, choices=TIPOS)
    parser.add_argument(
        "--binding", dest="bindings", action="append", default=[], choices=BINDINGS,
        help="Repetivel (--binding typescript --binding python). Omitido quando nao se aplica.",
    )
    parser.add_argument(
        "--modular", action="store_true", help="O sistema adota o template de modulos."
    )
    parser.add_argument(
        "--registrar", action="store_true", help="Tambem registra no mapa.json."
    )
    parser.add_argument(
        "--id", help="Id kebab-case no mapa (obrigatorio com --registrar)."
    )
    parser.add_argument("--nome", help="Nome legivel no mapa (padrao: o id).")
    parser.add_argument(
        "--mapa", help="Outro mapa.json (teste). Padrao: o da raiz da base."
    )
    return parser


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if "--autoteste" in sys.argv[1:]:
        return autoteste()
    args = _parser().parse_args()
    if args.registrar and not args.id:
        print("[ERRO] --registrar exige --id", file=sys.stderr)
        return 2
    info = {"tipo": args.tipo, "modular": args.modular, "bindings": args.bindings}
    target, raiz = Path(args.target).resolve(), raiz_da_base()
    try:
        carimbar(target, raiz, info)
        if args.registrar:
            cadastro = {"id": args.id, "nome": args.nome or args.id, **info}
            registrar(target, raiz, cadastro, Path(args.mapa) if args.mapa else None)
    except (ValueError, OSError) as erro:
        print(f"[ERRO] {erro}", file=sys.stderr)
        return 1
    return 0


# ------------------------------------------------------------------ autoteste

BASE = {"repo": "https://exemplo/base.git", "commit": "abc123", "sujo": False}
APP_MODULAR = {"tipo": "app", "modular": True, "bindings": ["typescript"]}
SITE = {"tipo": "site", "modular": False, "bindings": []}
LOCAIS = {
    "caminho": "../Earendel/ERP",
    "repo": "https://exemplo/erp.git",
    "raiz_git": "../Earendel/ERP",
}


def _erro(funcao) -> bool:
    try:
        funcao()
    except ValueError:
        return True
    return False


def _entrada(ident: str = "earendel-erp", caminho: str = "../Earendel/ERP") -> dict:
    return entrada_do_mapa(ident, "ERP", {**LOCAIS, "caminho": caminho}, APP_MODULAR)


MAPA = {"_doc": "x", "sistemas": [_entrada("outro", "../Outro")]}

CASOS = [
    (
        "status: instalacao nova nasce atualizado no commit curto",
        lambda: com_status(_entrada(), "atualizado", "973a0f589c7d0efd")["status_base"] == "973a0f5"
        and com_status(_entrada(), "atualizado", "973a0f589c7d0efd")["status"] == "atualizado",
    ),
    ("status invalido e erro", lambda: _erro(lambda: com_status(_entrada(), "ok", None))),
    (
        "carimbo de app modular: sdd-app + template-modulos",
        lambda: (
            montar_carimbo(BASE, APP_MODULAR, "2026-10-09")["pacotes"]
            == ["specs-sdd-app", "template-modulos"]
        ),
    ),
    (
        "carimbo de site: so specs-sdd-site",
        lambda: (
            montar_carimbo(BASE, SITE, "2026-10-09")["pacotes"] == ["specs-sdd-site"]
        ),
    ),
    (
        "carimbo guarda commit e alteracao local",
        lambda: (
            montar_carimbo({**BASE, "sujo": True}, SITE, "d")[
                "base_com_alteracoes_locais"
            ]
            is True
        ),
    ),
    (
        "tipo invalido e erro",
        lambda: _erro(lambda: montar_carimbo(BASE, {**SITE, "tipo": "lib"}, "d")),
    ),
    (
        "binding invalido na lista e erro",
        lambda: _erro(lambda: montar_carimbo(BASE, {**SITE, "bindings": ["typescript", "go"]}, "d")),
    ),
    ("id fora de kebab-case e erro", lambda: _erro(lambda: _entrada("ERP_Earendel"))),
    (
        "registrar acrescenta no fim e preserva o _doc",
        lambda: (
            [s["id"] for s in registrar_no_mapa(MAPA, _entrada())["sistemas"]]
            == ["outro", "earendel-erp"]
            and registrar_no_mapa(MAPA, _entrada())["_doc"] == "x"
        ),
    ),
    (
        "registrar duas vezes e idempotente",
        lambda: (
            registrar_no_mapa(registrar_no_mapa(MAPA, _entrada()), _entrada())
            == registrar_no_mapa(MAPA, _entrada())
        ),
    ),
    (
        "mesmo caminho atualiza no lugar, sem duplicar",
        lambda: (
            [
                s["nome"]
                for s in registrar_no_mapa(
                    MAPA, {**_entrada("outro", "../Outro"), "nome": "Novo"}
                )["sistemas"]
            ]
            == ["Novo"]
        ),
    ),
    (
        "atualizar preserva campo que o sistema nao traz",
        lambda: (
            registrar_no_mapa(
                {"sistemas": [{**_entrada(), "situacao": "adocao-posterior"}]},
                {k: v for k, v in _entrada().items() if k != "situacao"},
            )["sistemas"][0]["situacao"]
            == "adocao-posterior"
        ),
    ),
    (
        "id repetido em outro caminho e erro",
        lambda: _erro(
            lambda: registrar_no_mapa(MAPA, _entrada("outro", "../Diferente"))
        ),
    ),
    (
        "registrar nao muta o mapa recebido",
        lambda: (registrar_no_mapa(MAPA, _entrada()), len(MAPA["sistemas"]))[1] == 1,
    ),
    (
        "caminho relativo com / (windows)",
        lambda: (
            caminho_relativo(
                r"C:\Code\Earendel\ERP", r"C:\Code\knowledge-agentics", ntpath
            )
            == "../Earendel/ERP"
        ),
    ),
    (
        "caminho relativo com / (posix)",
        lambda: (
            caminho_relativo("/code/ZP/Novo", "/code/knowledge-agentics", posixpath)
            == "../ZP/Novo"
        ),
    ),
    (
        "drives diferentes e erro claro",
        lambda: _erro(
            lambda: caminho_relativo(
                r"D:\Sistema", r"C:\Code\knowledge-agentics", ntpath
            )
        ),
    ),
    (
        "serializa com 2 espacos, acento e \\n final",
        lambda: serializar({"nome": "Fundação"}) == '{\n  "nome": "Fundação"\n}\n',
    ),
    (
        "carimbo poliglota: lista com dois bindings",
        lambda: montar_carimbo(BASE, {**APP_MODULAR, "bindings": ["typescript", "python"]}, "d")["bindings"] == ["typescript", "python"],
    ),
    ("lista vazia: nao se aplica", lambda: montar_carimbo(BASE, SITE, "d")["bindings"] == []),
    ("binding repetido na lista e erro", lambda: _erro(lambda: montar_carimbo(BASE, {**SITE, "bindings": ["python", "python"]}, "d"))),
    (
        "entrada antiga com binding escalar vira lista ao registrar",
        lambda: registrar_no_mapa({"sistemas": [{**{k: v for k, v in _entrada().items() if k != "bindings"}, "binding": "typescript"}]}, _entrada())["sistemas"][0]["bindings"] == ["typescript"]
        and "binding" not in registrar_no_mapa({"sistemas": [{**_entrada(), "binding": "python"}]}, _entrada())["sistemas"][0],
    ),
    ("binding antigo nulo vira lista vazia", lambda: bindings_de({"binding": None}) == [] and bindings_de({"binding": "python"}) == ["python"]),
]


def autoteste() -> int:
    """Prova o nucleo com fixtures em memoria — nao le git nem escreve arquivo."""
    falhas = [nome for nome, caso in CASOS if not caso()]
    for nome in falhas:
        print(f"[FALHA] {nome}", file=sys.stderr)
    print(f"carimbo --autoteste: {len(CASOS) - len(falhas)}/{len(CASOS)} caso(s) verde")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
