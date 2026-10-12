"""Checagem de que os manifestos do plugin `sarak` carregam UMA identidade só — `name`, `version`,
`description` e `author` escritos à mão em vários arquivos, um por provedor, divergem em silêncio:
o Claude mostrava uma `description`, o Codex outra, o marketplace uma terceira com o nome antigo da
base, e nada acusava.

A FONTE é `.claude-plugin/plugin.json` — a mesma que `plugin/sync_ide.py` já lê (`read_plugin_meta`)
para montar o caminho do cache e o manifesto do Antigravity. Os outros manifestos são MIRRORS: cada
campo de identidade que eles declaram tem de ser igual ao da fonte. O que é próprio de um provedor
(o bloco `interface` do `.codex-plugin/plugin.json`, o `$schema` do `plugin.json`, o `owner` do
marketplace) fica fora da comparação por construção — só os campos listados abaixo são cobrados.

Manifesto AUSENTE é divergência, não silêncio: um espelho que some deixa um provedor sem identidade, e
"não há o que comparar" é exatamente a falha que esta checagem existe para pegar. A saída para um
espelho que deixar de existir de propósito é uma exceção NOMINAL, com o motivo ao lado (`EXCEPTIONS`,
o mesmo critério de `parity.py`) — hoje não há nenhuma.

Núcleo × casca, o padrão das irmãs: `divergences` é pura — recebe `{caminho: dict | None}` já lido,
nunca toca `fs` — e é o que o selftest de `audit_base.py` prova com fixtures em memória.
`read_manifests`/`audit_manifests` são a casca fina que lê o disco.
"""

import json
import os

SOURCE = ".claude-plugin/plugin.json"
MARKETPLACE = ".claude-plugin/marketplace.json"

IDENTITY_FIELDS = ("name", "version", "description", "author")

# Espelho -> os campos de identidade que ele tem de repetir da fonte.
MIRRORS = {
    ".codex-plugin/plugin.json": IDENTITY_FIELDS,
    "plugin.json": IDENTITY_FIELDS,
}

# O marketplace não tem `version`/`author` por plugin: só `name` e `description` de `plugins[0]`.
MARKETPLACE_FIELDS = ("name", "description")

# Caminho do manifesto -> o MOTIVO de ficar fora da comparação. Nunca uma lista muda sem explicação.
EXCEPTIONS = {}


def _first_plugin(marketplace):
    """`plugins[0]` do marketplace, ou `None` se o arquivo, a lista ou a entrada não existirem."""
    if not isinstance(marketplace, dict):
        return None
    plugins = marketplace.get("plugins")
    if not isinstance(plugins, list) or not plugins or not isinstance(plugins[0], dict):
        return None
    return plugins[0]


def _compare(label, mirror, source, fields):
    """Os campos de `campos` em que `espelho` difere da `fonte`; espelho `None` é um achado só."""
    if mirror is None:
        return [
            f"{label}: manifest missing or unreadable (the identity lives in {SOURCE})"
        ]
    return [
        f"{label}: '{field}' diverges from the source {SOURCE}"
        for field in fields
        if mirror.get(field) != source.get(field)
    ]


def divergences(manifests, exceptions=EXCEPTIONS):
    """Núcleo: as divergências de identidade entre a fonte e cada espelho, dado
    `{caminho: dict | None}` (`None` = ausente ou ilegível). Sem a fonte, só esse achado."""
    source = manifests.get(SOURCE)
    if source is None:
        return [f"{SOURCE}: source of the plugin identity missing or unreadable"]
    findings = []
    for path, fields in MIRRORS.items():
        if path not in exceptions:
            findings += _compare(path, manifests.get(path), source, fields)
    if MARKETPLACE not in exceptions:
        first = _first_plugin(manifests.get(MARKETPLACE))
        findings += _compare(
            f"{MARKETPLACE} (plugins[0])", first, source, MARKETPLACE_FIELDS
        )
    return findings


def _read_json(path):
    """O JSON do arquivo, ou `None` se ele não existir ou não parsear — os dois são o mesmo achado."""
    try:
        with open(path, encoding="utf-8") as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError):
        return None


def read_manifests(base_dir):
    """Casca: `{caminho relativo: dict | None}` da fonte, dos espelhos e do marketplace."""
    paths = (SOURCE, MARKETPLACE, *MIRRORS)
    return {rel: _read_json(os.path.join(base_dir, rel)) for rel in paths}


def audit_manifests(base_dir):
    """Casca: lê os manifestos do disco e devolve os achados de `divergences`."""
    return divergences(read_manifests(base_dir))
