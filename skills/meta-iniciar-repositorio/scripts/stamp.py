"""stamp.py — o carimbo `.sarak/base.json` de um sistema e o registro dele no `mapa.json` da base.

    python stamp.py --target <dir> --kind app|site [--binding <b> ...] [--modular]
                    [--register --id <id> --name <nome>] [--map <arquivo>]
    python stamp.py --selftest      prova o nucleo com fixtures em memoria (sem disco)

Uma fonte para cada coisa:
  - `.sarak/base.json` (no SISTEMA) — de qual commit da base ele veio. E a fonte da VERSAO.
  - `mapa.json` (na raiz da BASE, versionado) — QUAIS sistemas adotam a base. Nao guarda versao.

Usado pelo `init_repo.py` (apps) e pela skill `spec-site-fundacao` (sites); a propagacao de
atualizacoes da base le os dois. Sem `--register`, o mapa nao e tocado.

Nucleo x casca: `build_stamp`, `register_in_map`, `relative_path`, `map_entry` e os `normalize_*`
sao PURAS (recebem dados, nunca tocam `fs` nem processo) — sao o que o `--selftest` prova. As
funcoes que leem git e escrevem arquivo sao a casca fina.

Chaves em ingles (ADR-023). Quem LE estado ja gravado por versao anterior (carimbo, mapa) passa pelos
`normalize_*`: o mapa antigo->novo vive so aqui (`LEGACY_*`), nunca espalhado em `if`.
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

KINDS = ("app", "site")
BINDINGS = ("typescript", "javascript", "python")
LIFECYCLES = ("active", "later-adoption")
# Resultado da ULTIMA propagacao (nao uma comparacao ao vivo com o HEAD). Sistema recem-instalado nasce
# `updated`; `outdated` = nunca recebeu propagacao nem adocao; `pending` = sobrou decisao humana.
STATUSES = ("outdated", "pending", "updated")
ID_KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SDD_PACKAGE = {"app": "specs-sdd-app", "site": "specs-sdd-site"}
MODULAR_PACKAGE = "module-template"
STAMP_FILE = Path(".sarak") / "base.json"
MAP_FILE = "mapa.json"

# ----------------------------------------------------- compatibilidade com o estado antigo (PT)
# Mapa antigo -> novo, centralizado. Chaves e valores que versoes anteriores gravaram em
# `.sarak/base.json` e em `mapa.json`; so a LEITURA os aceita, a escrita grava so as novas.
LEGACY_STAMP_KEYS = {
    "base_com_alteracoes_locais": "base_dirty",
    "data": "date",
    "tipo": "kind",
    "pacotes": "packages",
    "mantidos": "kept",
}
LEGACY_KEPT_KEYS = {
    "caminho": "path",
    "motivo": "reason",
    "sha1_sistema": "system_sha1",
    "sha1_referencia": "reference_sha1",
}
LEGACY_MAP_ROOT_KEYS = {"sistemas": "systems"}
LEGACY_MAP_ENTRY_KEYS = {
    "nome": "name",
    "caminho": "path",
    "raiz_git": "git_root",
    "tipo": "kind",
    "situacao": "lifecycle",
    "status_base": "status_commit",
}
# Valores antigos por chave NOVA (a chave ja traduzida).
LEGACY_VALUES = {
    "lifecycle": {"ativo": "active", "adocao-posterior": "later-adoption"},
    "status": {
        "desatualizado": "outdated",
        "pendente": "pending",
        "atualizado": "updated",
    },
}
LEGACY_PACKAGE_VALUES = {"template-modulos": "module-template"}


# ------------------------------------------------------------------ nucleo


def _validate_system(info: dict) -> None:
    if info["kind"] not in KINDS:
        raise ValueError(f"kind '{info['kind']}' is invalid — use {' | '.join(KINDS)}")
    bindings = info["bindings"]
    invalid = [b for b in bindings if b not in BINDINGS]
    if invalid:
        raise ValueError(f"binding {invalid} is invalid — use {' | '.join(BINDINGS)}")
    if len(set(bindings)) != len(bindings):
        raise ValueError(f"bindings {bindings} has a repeated value")


def _rename_keys(data: dict, renames: dict) -> dict:
    """Nucleo: `data` com as chaves traduzidas por `renames`, na mesma posicao. A chave nova ja
    presente vence a antiga (o dado novo nunca e sobrescrito pelo velho)."""
    renamed = {}
    for key, value in data.items():
        target = renames.get(key, key)
        if target != key and target in data:
            continue
        renamed[target] = value
    return renamed


def bindings_of(entry: dict) -> list:
    """Nucleo: a lista `bindings` de uma entrada — converte o campo antigo `binding` (escalar ou
    `None`) em vez de quebrar. E a compatibilidade do registro idempotente com mapa antigo."""
    if "bindings" in entry:
        return list(entry["bindings"])
    legacy = entry.get("binding")
    return [legacy] if legacy else []


def _without_legacy_binding(entry: dict) -> dict:
    """A entrada com `binding` trocado por `bindings`, na mesma posicao da chave."""
    if "binding" not in entry:
        return entry
    items = bindings_of(entry)
    return {
        ("bindings" if k == "binding" else k): (items if k == "binding" else v)
        for k, v in entry.items()
        if k != "bindings"
    }


def normalize_stamp(stamp: dict) -> dict:
    """Nucleo: o conteudo de um `.sarak/base.json` (novo OU antigo) na forma nova. Nao muta `stamp`.
    Traduz chaves do carimbo, de cada entrada de `kept` e os valores de `packages`."""
    result = _rename_keys(stamp, LEGACY_STAMP_KEYS)
    if isinstance(result.get("packages"), list):
        result["packages"] = [
            LEGACY_PACKAGE_VALUES.get(p, p) for p in result["packages"]
        ]
    if isinstance(result.get("kept"), list):
        result["kept"] = [
            _rename_keys(e, LEGACY_KEPT_KEYS) if isinstance(e, dict) else e
            for e in result["kept"]
        ]
    return result


def normalize_map_entry(entry: dict) -> dict:
    """Nucleo: uma entrada do `mapa.json` (nova OU antiga) na forma nova — chaves, `binding`
    escalar -> `bindings` e valores de `lifecycle`/`status`. Nao muta `entry`."""
    result = _rename_keys(_without_legacy_binding(entry), LEGACY_MAP_ENTRY_KEYS)
    for key, renames in LEGACY_VALUES.items():
        if key in result and isinstance(result[key], str):
            result[key] = renames.get(result[key], result[key])
    return result


def normalize_map(map_data: dict) -> dict:
    """Nucleo: o `mapa.json` inteiro (novo OU antigo) na forma nova. Nao muta `map_data`."""
    result = _rename_keys(map_data, LEGACY_MAP_ROOT_KEYS)
    result["systems"] = [normalize_map_entry(e) for e in result.get("systems", [])]
    return result


def build_stamp(base: dict, info: dict, date: str) -> dict:
    """Nucleo: o conteudo do `.sarak/base.json`. `base` = {repo, commit, dirty}; `info` = {kind,
    modular, bindings}; `date` = AAAA-MM-DD. Os `packages` dizem o que o sistema recebeu da base."""
    _validate_system(info)
    packages = [SDD_PACKAGE[info["kind"]]] + (
        [MODULAR_PACKAGE] if info["modular"] else []
    )
    return {
        "base_repo": base["repo"],
        "base_commit": base["commit"],
        "base_dirty": base["dirty"],
        "date": date,
        "kind": info["kind"],
        "modular": info["modular"],
        "bindings": list(info["bindings"]),
        "packages": packages,
    }


def relative_path(
    target: str, base_root: str, paths: types.ModuleType = os.path
) -> str:
    """Nucleo: `target` relativo a `base_root`, com `/`. Drives diferentes (Windows) e erro claro.
    `paths` e `os.path` em uso real; o autoteste injeta `ntpath`/`posixpath`."""
    try:
        relative = paths.relpath(target, base_root)
    except ValueError as error:
        raise ValueError(
            f"'{target}' and '{base_root}' are on different drives — the map only stores a path "
            "relative to the base root; move the system to the same drive or register it by hand"
        ) from error
    return relative.replace("\\", "/")


def map_entry(ident: str, name: str, locations: dict, info: dict) -> dict:
    """Nucleo: a entrada de um sistema no `mapa.json`. `locations` = {path, repo, git_root}."""
    _validate_system(info)
    if not ID_KEBAB.match(ident or ""):
        raise ValueError(
            f"id '{ident}' is invalid — use kebab-case (e.g. earendel-erp)"
        )
    return {
        "id": ident,
        "name": name,
        "path": locations["path"],
        "repo": locations["repo"],
        "git_root": locations["git_root"],
        "kind": info["kind"],
        "modular": info["modular"],
        "bindings": list(info["bindings"]),
        "lifecycle": "active",
    }


def with_status(entry: dict, status: str, commit: str | None) -> dict:
    """Nucleo: a entrada com `status` e `status_commit` (o commit CURTO da base em que o status foi definido)."""
    if status not in STATUSES:
        raise ValueError(f"status '{status}' is invalid — use {' | '.join(STATUSES)}")
    return {**entry, "status": status, "status_commit": commit[:7] if commit else None}


def register_in_map(map_data: dict, system: dict) -> dict:
    """Nucleo: o mapa com `system` registrado — idempotente. Mesmo `path` atualiza a entrada (no
    lugar, preservando campos que o sistema nao traz); `id` ja usado por outro path e erro.
    Um mapa em chaves antigas e lido e reescrito em ingles (`normalize_map`)."""
    result = normalize_map(copy.deepcopy(map_data))
    systems = result["systems"]
    for existing in systems:
        if (
            existing.get("id") == system["id"]
            and existing.get("path") != system["path"]
        ):
            raise ValueError(
                f"id '{system['id']}' is already registered for '{existing.get('path')}'"
            )
    for index, existing in enumerate(systems):
        if existing.get("path") == system["path"]:
            systems[index] = {**existing, **system}
            return result
    systems.append(dict(system))
    return result


def serialize(data: dict) -> str:
    """Nucleo: o JSON como a base o versiona — 2 espacos, acentos preservados, `\\n` final."""
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


# ------------------------------------------------------------------ casca


def base_root() -> Path:
    """Raiz da base Sarak, deduzida deste arquivo (skills/<skill>/scripts/stamp.py)."""
    return Path(__file__).resolve().parents[3]


def _git(folder: Path, *args) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(folder), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
    except FileNotFoundError:
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def base_state(root: Path) -> dict:
    """Casca: repo, commit e se ha alteracao local nao commitada na base (o carimbo avisa)."""
    commit = _git(root, "rev-parse", "HEAD")
    if commit is None:
        raise ValueError(
            f"the base at {root} is not a git repository with a commit — no stamp possible"
        )
    return {
        "repo": _git(root, "remote", "get-url", "origin"),
        "commit": commit,
        "dirty": bool(_git(root, "status", "--porcelain")),
    }


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as file:
        file.write(serialize(data))


def stamp(target: Path, root: Path, info: dict) -> dict:
    """Casca: escreve `<target>/.sarak/base.json` com o commit atual da base."""
    result = build_stamp(
        base_state(root), info, datetime.datetime.now(datetime.UTC).date().isoformat()
    )
    _write_json(target / STAMP_FILE, result)
    dirty = " (base has uncommitted local changes)" if result["base_dirty"] else ""
    print(
        f"[OK] Stamp {STAMP_FILE.as_posix()}: base {result['base_commit'][:12]}{dirty}."
    )
    return result


def _locations(target: Path, root: Path) -> dict:
    top = _git(target, "rev-parse", "--show-toplevel")
    return {
        "path": relative_path(str(target.resolve()), str(root)),
        "repo": _git(target, "remote", "get-url", "origin"),
        "git_root": relative_path(str(Path(top).resolve()), str(root)) if top else None,
    }


def register(
    target: Path, root: Path, registration: dict, map_path: Path | None = None
) -> dict:
    """Casca: registra o sistema no `mapa.json` (o da base, ou `map_path` — usado em teste).
    `registration` = {id, name, kind, modular, bindings}."""
    ident, name = registration["id"], registration["name"]
    info = {key: registration[key] for key in ("kind", "modular", "bindings")}
    destination = map_path or root / MAP_FILE
    current = (
        json.loads(destination.read_text(encoding="utf-8"))
        if destination.exists()
        else {"systems": []}
    )
    entry = map_entry(ident, name, _locations(target, root), info)
    # Instalacao nova: a base acabou de ser aplicada inteira — nasce `updated`, no commit do carimbo.
    entry = with_status(entry, "updated", base_state(root)["commit"])
    _write_json(destination, register_in_map(current, entry))
    print(f"[OK] System '{ident}' registered in {destination}.")
    return entry


def _parser():
    parser = argparse.ArgumentParser(
        description="Stamp .sarak/base.json + registration in the base's mapa.json."
    )
    parser.add_argument("--target", required=True, help="System folder.")
    parser.add_argument("--kind", required=True, choices=KINDS)
    parser.add_argument(
        "--binding",
        dest="bindings",
        action="append",
        default=[],
        choices=BINDINGS,
        help="Repeatable (--binding typescript --binding python). Omitted when not applicable.",
    )
    parser.add_argument(
        "--modular", action="store_true", help="The system adopts the module template."
    )
    parser.add_argument(
        "--register", action="store_true", help="Also register in mapa.json."
    )
    parser.add_argument(
        "--id", help="Kebab-case id in the map (required with --register)."
    )
    parser.add_argument("--name", help="Readable name in the map (default: the id).")
    parser.add_argument(
        "--map", help="Another mapa.json (test). Default: the one at the base root."
    )
    return parser


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if "--selftest" in sys.argv[1:]:
        return selftest()
    args = _parser().parse_args()
    if args.register and not args.id:
        print("[ERROR] --register requires --id", file=sys.stderr)
        return 2
    info = {"kind": args.kind, "modular": args.modular, "bindings": args.bindings}
    target, root = Path(args.target).resolve(), base_root()
    try:
        stamp(target, root, info)
        if args.register:
            registration = {"id": args.id, "name": args.name or args.id, **info}
            register(target, root, registration, Path(args.map) if args.map else None)
    except (ValueError, OSError) as error:
        print(f"[ERROR] {error}", file=sys.stderr)
        return 1
    return 0


# ------------------------------------------------------------------ autoteste

BASE = {"repo": "https://example/base.git", "commit": "abc123", "dirty": False}
MODULAR_APP = {"kind": "app", "modular": True, "bindings": ["typescript"]}
SITE = {"kind": "site", "modular": False, "bindings": []}
LOCATIONS = {
    "path": "../Earendel/ERP",
    "repo": "https://example/erp.git",
    "git_root": "../Earendel/ERP",
}


def _raises(function) -> bool:
    try:
        function()
    except ValueError:
        return True
    return False


def _entry(ident: str = "earendel-erp", path: str = "../Earendel/ERP") -> dict:
    return map_entry(ident, "ERP", {**LOCATIONS, "path": path}, MODULAR_APP)


MAP = {"_doc": "x", "systems": [_entry("other", "../Other")]}

# Estado como versoes anteriores o gravaram (chaves e valores em portugues).
OLD_STAMP = {
    "base_repo": "https://example/base.git",
    "base_commit": "abc123",
    "base_com_alteracoes_locais": True,
    "data": "2026-10-09",
    "tipo": "app",
    "modular": True,
    "bindings": ["typescript"],
    "pacotes": ["specs-sdd-app", "template-modulos"],
    "mantidos": [
        {"caminho": "a.md", "motivo": "m", "sha1_sistema": "1", "sha1_referencia": "2"}
    ],
}
OLD_ENTRY = {
    "id": "earendel-erp",
    "nome": "ERP",
    "caminho": "../Earendel/ERP",
    "repo": None,
    "raiz_git": "../Earendel/ERP",
    "tipo": "app",
    "modular": True,
    "bindings": ["typescript"],
    "situacao": "adocao-posterior",
    "status": "desatualizado",
    "status_base": "973a0f5",
}
OLD_MAP = {"_doc": "x", "sistemas": [OLD_ENTRY]}

CASES = [
    (
        "status: fresh install is born updated at the short commit",
        lambda: (
            with_status(_entry(), "updated", "973a0f589c7d0efd")["status_commit"]
            == "973a0f5"
            and with_status(_entry(), "updated", "973a0f589c7d0efd")["status"]
            == "updated"
        ),
    ),
    (
        "status: invalid is an error",
        lambda: _raises(lambda: with_status(_entry(), "ok", None)),
    ),
    (
        "stamp of modular app: sdd-app + module-template",
        lambda: (
            build_stamp(BASE, MODULAR_APP, "2026-10-09")["packages"]
            == ["specs-sdd-app", "module-template"]
        ),
    ),
    (
        "stamp of site: only specs-sdd-site",
        lambda: build_stamp(BASE, SITE, "2026-10-09")["packages"] == ["specs-sdd-site"],
    ),
    (
        "stamp keeps commit and local change flag",
        lambda: build_stamp({**BASE, "dirty": True}, SITE, "d")["base_dirty"] is True,
    ),
    (
        "stamp writes only the new keys",
        lambda: (
            set(build_stamp(BASE, MODULAR_APP, "d"))
            == {
                "base_repo",
                "base_commit",
                "base_dirty",
                "date",
                "kind",
                "modular",
                "bindings",
                "packages",
            }
        ),
    ),
    (
        "invalid kind is an error",
        lambda: _raises(lambda: build_stamp(BASE, {**SITE, "kind": "lib"}, "d")),
    ),
    (
        "invalid binding in the list is an error",
        lambda: _raises(
            lambda: build_stamp(BASE, {**SITE, "bindings": ["typescript", "go"]}, "d")
        ),
    ),
    (
        "id outside kebab-case is an error",
        lambda: _raises(lambda: _entry("ERP_Earendel")),
    ),
    (
        "register appends at the end and keeps the _doc",
        lambda: (
            [s["id"] for s in register_in_map(MAP, _entry())["systems"]]
            == ["other", "earendel-erp"]
            and register_in_map(MAP, _entry())["_doc"] == "x"
        ),
    ),
    (
        "registering twice is idempotent",
        lambda: (
            register_in_map(register_in_map(MAP, _entry()), _entry())
            == register_in_map(MAP, _entry())
        ),
    ),
    (
        "same path updates in place, without duplicating",
        lambda: (
            [
                s["name"]
                for s in register_in_map(
                    MAP, {**_entry("other", "../Other"), "name": "New"}
                )["systems"]
            ]
            == ["New"]
        ),
    ),
    (
        "update keeps a field the system does not bring",
        lambda: (
            register_in_map(
                {"systems": [{**_entry(), "lifecycle": "later-adoption"}]},
                {k: v for k, v in _entry().items() if k != "lifecycle"},
            )["systems"][0]["lifecycle"]
            == "later-adoption"
        ),
    ),
    (
        "repeated id on another path is an error",
        lambda: _raises(lambda: register_in_map(MAP, _entry("other", "../Different"))),
    ),
    (
        "register does not mutate the received map",
        lambda: (register_in_map(MAP, _entry()), len(MAP["systems"]))[1] == 1,
    ),
    (
        "relative path with / (windows)",
        lambda: (
            relative_path(
                r"C:\Code\Earendel\ERP", r"C:\Code\knowledge-agentics", ntpath
            )
            == "../Earendel/ERP"
        ),
    ),
    (
        "relative path with / (posix)",
        lambda: (
            relative_path("/code/ZP/New", "/code/knowledge-agentics", posixpath)
            == "../ZP/New"
        ),
    ),
    (
        "different drives is a clear error",
        lambda: _raises(
            lambda: relative_path(r"D:\System", r"C:\Code\knowledge-agentics", ntpath)
        ),
    ),
    (
        "serializes with 2 spaces, accent and final \\n",
        lambda: serialize({"name": "Fundação"}) == '{\n  "name": "Fundação"\n}\n',
    ),
    (
        "polyglot stamp: list with two bindings",
        lambda: (
            build_stamp(
                BASE, {**MODULAR_APP, "bindings": ["typescript", "python"]}, "d"
            )["bindings"]
            == ["typescript", "python"]
        ),
    ),
    (
        "empty list: not applicable",
        lambda: build_stamp(BASE, SITE, "d")["bindings"] == [],
    ),
    (
        "repeated binding in the list is an error",
        lambda: _raises(
            lambda: build_stamp(BASE, {**SITE, "bindings": ["python", "python"]}, "d")
        ),
    ),
    (
        "old entry with scalar binding becomes a list on register",
        lambda: (
            register_in_map(
                {
                    "systems": [
                        {
                            **{k: v for k, v in _entry().items() if k != "bindings"},
                            "binding": "typescript",
                        }
                    ]
                },
                _entry(),
            )["systems"][0]["bindings"]
            == ["typescript"]
            and "binding"
            not in register_in_map(
                {"systems": [{**_entry(), "binding": "python"}]}, _entry()
            )["systems"][0]
        ),
    ),
    (
        "old null binding becomes an empty list",
        lambda: (
            bindings_of({"binding": None}) == []
            and bindings_of({"binding": "python"}) == ["python"]
        ),
    ),
    (
        "legacy stamp: keys, packages and kept entries are normalized",
        lambda: (
            normalize_stamp(OLD_STAMP)
            == {
                "base_repo": "https://example/base.git",
                "base_commit": "abc123",
                "base_dirty": True,
                "date": "2026-10-09",
                "kind": "app",
                "modular": True,
                "bindings": ["typescript"],
                "packages": ["specs-sdd-app", "module-template"],
                "kept": [
                    {
                        "path": "a.md",
                        "reason": "m",
                        "system_sha1": "1",
                        "reference_sha1": "2",
                    }
                ],
            }
        ),
    ),
    (
        "new stamp passes through normalize_stamp unchanged",
        lambda: (
            normalize_stamp(build_stamp(BASE, MODULAR_APP, "d"))
            == build_stamp(BASE, MODULAR_APP, "d")
        ),
    ),
    (
        "legacy map entry: keys, scalar values and status are normalized",
        lambda: (
            normalize_map_entry(OLD_ENTRY)
            == {
                "id": "earendel-erp",
                "name": "ERP",
                "path": "../Earendel/ERP",
                "repo": None,
                "git_root": "../Earendel/ERP",
                "kind": "app",
                "modular": True,
                "bindings": ["typescript"],
                "lifecycle": "later-adoption",
                "status": "outdated",
                "status_commit": "973a0f5",
            }
        ),
    ),
    (
        "legacy map is read and rewritten in English by register_in_map",
        lambda: (
            lambda result: (
                "systems" in result
                and "sistemas" not in result
                and result["_doc"] == "x"
                and [s["path"] for s in result["systems"]] == ["../Earendel/ERP"]
                and result["systems"][0]["status"] == "outdated"
                and result["systems"][0]["lifecycle"] == "active"
            )
        )(register_in_map(OLD_MAP, _entry())),
    ),
    (
        "legacy map: a new key already present beats the old one",
        lambda: normalize_map_entry({"nome": "old", "name": "new"})["name"] == "new",
    ),
    (
        "normalize does not mutate the received data",
        lambda: (normalize_map(OLD_MAP), "sistemas" in OLD_MAP and "nome" in OLD_ENTRY)[
            1
        ],
    ),
]


def selftest() -> int:
    """Prova o nucleo com fixtures em memoria — nao le git nem escreve arquivo."""
    failures = [name for name, case in CASES if not case()]
    for name in failures:
        print(f"[FAIL] {name}", file=sys.stderr)
    print(f"stamp --selftest: {len(CASES) - len(failures)}/{len(CASES)} case(s) green")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
