"""Checagem do SCHEMA do `mapa.json` da raiz da base — a lista dos sistemas que adotam a base.

O mapa e o que a propagacao de atualizacoes le para saber onde a base chegou; um campo com tipo
errado, um `id` repetido ou um caminho absoluto quebram a propagacao em silencio, numa maquina que
nao e a de quem escreveu. Por isso o schema e cobrado aqui, por maquina.

O que NAO se cobra, de proposito: que o `caminho` exista. O `audit_base` roda em CI e em outras
maquinas, onde os sistemas nao estao clonados ao lado da base — exigir o caminho reprovaria o mapa
inteiro em todo lugar menos aqui. Os caminhos sao relativos a raiz desta base, com `/`.

Nucleo x casca, o padrao das irmas (`manifests.py` e o molde de forma): `divergences` e pura —
recebe o mapa ja lido, nunca toca `fs` — e e o que o selftest de `audit_base.py` prova com fixtures
em memoria. `audit_map` e a casca fina que le o disco.
"""

import json
import os
import re

FILE = "mapa.json"

# Chaves e valores que o `mapa.json` usava antes da lei de idioma (ADR-023): lidos so para dar a dica
# da migracao e para o leitor de sistemas aceitar o mapa antigo. UM mapa antigo->novo, centralizado.
LEGACY_FIELDS = {
    "sistemas": "systems", "nome": "name", "caminho": "path", "raiz_git": "git_root",
    "tipo": "kind", "situacao": "lifecycle", "binding": "bindings", "status_base": "status_commit",
}
LEGACY_VALUES = {
    "ativo": "active", "adocao-posterior": "later-adoption", "desatualizado": "outdated",
    "pendente": "pending", "atualizado": "updated",
}
LEGACY_BY_NEW = {new: old for old, new in LEGACY_FIELDS.items()}

# Campo -> tipos aceitos (`None` = o campo pode ser nulo: sistema ainda sem remoto ou sem git).
# `bindings` e lista (projeto modular pode ser poliglota); `[]` = nao se aplica ou nao da para saber.
FIELDS = {
    "id": (str,),
    "name": (str,),
    "path": (str,),
    "repo": (str, type(None)),
    "git_root": (str, type(None)),
    "kind": (str,),
    "modular": (bool,),
    "bindings": (list,),
    "lifecycle": (str,),
    "status": (str,),
    "status_commit": (str, type(None)),
}
VALUES = {
    "kind": ("app", "site"),
    "lifecycle": ("active", "later-adoption"),
    "status": ("outdated", "pending", "updated"),
}
BINDINGS = ("typescript", "javascript", "python")
SHORT_COMMIT = re.compile(r"^[0-9a-f]{7,40}$")
KEBAB_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DRIVE = re.compile(r"^[A-Za-z]:")


def _relative_path_with_slash(value: str) -> bool:
    return "\\" not in value and not value.startswith("/") and not DRIVE.match(value)


def _check_fields(label: str, system: dict) -> list:
    findings = []
    for field, types in FIELDS.items():
        if field not in system:
            if LEGACY_BY_NEW.get(field) in system:
                continue  # o campo antigo presente e acusado por _check_legacy
            findings.append(f"{label}: missing field '{field}'")
        elif type(system[field]) not in types:
            findings.append(
                f"{label}: '{field}' with type {type(system[field]).__name__}"
            )
    return findings


def _check_legacy(label: str, system: dict) -> list:
    return [
        f"{label}: legacy field '{old}'; use '{new}'"
        for old, new in LEGACY_FIELDS.items()
        if old in system
    ]


def _check_bindings(label: str, system: dict) -> list:
    findings = []
    bindings = system.get("bindings")
    if not isinstance(bindings, list):
        return findings
    outside = [b for b in bindings if b not in BINDINGS]
    if outside:
        findings.append(f"{label}: bindings {outside} outside {BINDINGS}")
    if len(set(map(str, bindings))) != len(bindings):
        findings.append(f"{label}: bindings {bindings} with duplicate value")
    return findings


def _check_values(label: str, system: dict) -> list:
    findings = []
    for field, accepted in VALUES.items():
        if field in system and system[field] not in accepted:
            legacy = LEGACY_VALUES.get(system[field])
            hint = f" (legacy value; use '{legacy}')" if legacy else ""
            findings.append(
                f"{label}: '{field}' = {system[field]!r} outside {accepted}{hint}"
            )
    if isinstance(system.get("id"), str) and not KEBAB_ID.match(system["id"]):
        findings.append(f"{label}: id '{system['id']}' outside kebab-case")
    base = system.get("status_commit")
    if isinstance(base, str) and not SHORT_COMMIT.match(base):
        findings.append(f"{label}: status_commit '{base}' — use a base commit (7 to 40 hexadecimals) or null")
    for field in ("path", "git_root"):
        value = system.get(field)
        if isinstance(value, str) and not _relative_path_with_slash(value):
            findings.append(
                f"{label}: '{field}' = '{value}' — use a path relative to the base root, with /"
            )
    return findings


def _duplicates(systems: list, field: str) -> list:
    seen, findings = set(), []
    for system in systems:
        value = system.get(field) if isinstance(system, dict) else None
        if value in seen:
            findings.append(f"{FILE}: {field} '{value}' duplicate")
        if value is not None:
            seen.add(value)
    return findings


def systems_of(map_data) -> list:
    """Os sistemas do mapa ja lido; aceita tambem a chave antiga `sistemas` (ver LEGACY_FIELDS).
    Lista vazia se o mapa nao tem a lista."""
    if not isinstance(map_data, dict):
        return []
    for key in ("systems", "sistemas"):
        if isinstance(map_data.get(key), list):
            return map_data[key]
    return []


def system_name(system: dict):
    """O `name` do sistema; aceita tambem a chave antiga `nome`. `None` se nao houver."""
    return system.get("name", system.get("nome"))


def divergences(map_data: dict) -> list:
    """Nucleo: os problemas de schema do mapa ja lido (`dict`)."""
    if not isinstance(map_data, dict) or not isinstance(map_data.get("systems"), list):
        legacy = isinstance(map_data, dict) and isinstance(map_data.get("sistemas"), list)
        if not legacy:
            return [f"{FILE}: missing the 'systems' list"]
        return [f"{FILE}: legacy field 'sistemas'; use 'systems'"] + divergences(
            {"systems": map_data["sistemas"]}
        )
    findings = []
    for index, system in enumerate(map_data["systems"]):
        label = f"{FILE} systems[{index}]"
        if not isinstance(system, dict):
            findings.append(f"{label}: is not an object")
            continue
        label += f" ({system.get('id', '?')})"
        findings += (
            _check_fields(label, system)
            + _check_legacy(label, system)
            + _check_values(label, system)
            + _check_bindings(label, system)
        )
    return (
        findings
        + _duplicates(map_data["systems"], "id")
        + _duplicates(map_data["systems"], "path")
    )


def audit_map(base_dir: str) -> list:
    """Casca: le o `mapa.json` da raiz da base e devolve os achados de `divergences`."""
    path = os.path.join(base_dir, FILE)
    if not os.path.isfile(path):
        return [f"{FILE}: missing at the base root"]
    try:
        with open(path, encoding="utf-8") as file:
            map_data = json.load(file)
    except (OSError, json.JSONDecodeError) as error:
        return [f"{FILE}: unreadable ({error})"]
    return divergences(map_data)
