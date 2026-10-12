"""Checagem de que os manifestos do plugin `sarak` carregam UMA identidade só — `name`, `version`,
`description` e `author` escritos à mão em vários arquivos, um por provedor, divergem em silêncio:
o Claude mostrava uma `description`, o Codex outra, o marketplace uma terceira com o nome antigo da
base, e nada acusava.

A FONTE é `.claude-plugin/plugin.json` — a mesma que `plugin/sync_ide.py` já lê (`read_plugin_meta`)
para montar o caminho do cache e o manifesto do Antigravity. Os outros manifestos são ESPELHOS: cada
campo de identidade que eles declaram tem de ser igual ao da fonte. O que é próprio de um provedor
(o bloco `interface` do `.codex-plugin/plugin.json`, o `$schema` do `plugin.json`, o `owner` do
marketplace) fica fora da comparação por construção — só os campos listados abaixo são cobrados.

Manifesto AUSENTE é divergência, não silêncio: um espelho que some deixa um provedor sem identidade, e
"não há o que comparar" é exatamente a falha que esta checagem existe para pegar. A saída para um
espelho que deixar de existir de propósito é uma exceção NOMINAL, com o motivo ao lado (`EXCECOES`,
o mesmo critério de `paridade.py`) — hoje não há nenhuma.

Núcleo × casca, o padrão das irmãs: `divergencias` é pura — recebe `{caminho: dict | None}` já lido,
nunca toca `fs` — e é o que o autoteste de `audit_base.py` prova com fixtures em memória.
`ler_manifestos`/`auditar_manifestos` são a casca fina que lê o disco.
"""

import json
import os

FONTE = ".claude-plugin/plugin.json"
MARKETPLACE = ".claude-plugin/marketplace.json"

CAMPOS_DE_IDENTIDADE = ("name", "version", "description", "author")

# Espelho -> os campos de identidade que ele tem de repetir da fonte.
ESPELHOS = {
    ".codex-plugin/plugin.json": CAMPOS_DE_IDENTIDADE,
    "plugin.json": CAMPOS_DE_IDENTIDADE,
}

# O marketplace não tem `version`/`author` por plugin: só `name` e `description` de `plugins[0]`.
CAMPOS_DO_MARKETPLACE = ("name", "description")

# Caminho do manifesto -> o MOTIVO de ficar fora da comparação. Nunca uma lista muda sem explicação.
EXCECOES = {}


def _primeiro_plugin(marketplace):
    """`plugins[0]` do marketplace, ou `None` se o arquivo, a lista ou a entrada não existirem."""
    if not isinstance(marketplace, dict):
        return None
    plugins = marketplace.get("plugins")
    if not isinstance(plugins, list) or not plugins or not isinstance(plugins[0], dict):
        return None
    return plugins[0]


def _comparar(rotulo, espelho, fonte, campos):
    """Os campos de `campos` em que `espelho` difere da `fonte`; espelho `None` é um achado só."""
    if espelho is None:
        return [
            f"{rotulo}: manifesto ausente ou ilegível (a identidade vive em {FONTE})"
        ]
    return [
        f"{rotulo}: '{campo}' diverge da fonte {FONTE}"
        for campo in campos
        if espelho.get(campo) != fonte.get(campo)
    ]


def divergencias(manifestos, excecoes=EXCECOES):
    """Núcleo: as divergências de identidade entre a fonte e cada espelho, dado
    `{caminho: dict | None}` (`None` = ausente ou ilegível). Sem a fonte, só esse achado."""
    fonte = manifestos.get(FONTE)
    if fonte is None:
        return [f"{FONTE}: fonte da identidade do plugin ausente ou ilegível"]
    achados = []
    for caminho, campos in ESPELHOS.items():
        if caminho not in excecoes:
            achados += _comparar(caminho, manifestos.get(caminho), fonte, campos)
    if MARKETPLACE not in excecoes:
        primeiro = _primeiro_plugin(manifestos.get(MARKETPLACE))
        achados += _comparar(
            f"{MARKETPLACE} (plugins[0])", primeiro, fonte, CAMPOS_DO_MARKETPLACE
        )
    return achados


def _ler_json(caminho):
    """O JSON do arquivo, ou `None` se ele não existir ou não parsear — os dois são o mesmo achado."""
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except (OSError, json.JSONDecodeError):
        return None


def ler_manifestos(base_dir):
    """Casca: `{caminho relativo: dict | None}` da fonte, dos espelhos e do marketplace."""
    caminhos = (FONTE, MARKETPLACE, *ESPELHOS)
    return {rel: _ler_json(os.path.join(base_dir, rel)) for rel in caminhos}


def auditar_manifestos(base_dir):
    """Casca: lê os manifestos do disco e devolve os achados de `divergencias`."""
    return divergencias(ler_manifestos(base_dir))
