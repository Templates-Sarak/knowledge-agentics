"""Nenhum arquivo que VIAJA para o projeto gerado pode nomear um sistema do `mapa.json`.

O `create-project` copia a doutrina, os bindings e o `tools/` para todo projeto gerado, inclusive os
de cliente, e o `meta-iniciar-repositorio` copia os moldes do fluxo SDD. Um `id` ou um `nome` de
sistema do mapa dentro desses arquivos vaza para quem recebe o projeto o fato de que outro sistema
existe — foi o defeito do `ADR-023`, que citava os sistemas e a contagem de excecoes de cada um.

A lista de sistemas vem do `mapa.json` lido em runtime, nunca escrita aqui: sistema novo no mapa
passa a ser coberto sem tocar este arquivo. Documentacao que NAO viaja (`skills/**`, `README.md` da
base, o `mapa.json`) pode citar sistema a vontade — e la que o detalhe por sistema mora.

Nucleo x casca, o padrao das irmas (`map_schema.py`, `manifests.py`): `divergences` e pura — recebe os
textos e os sistemas ja lidos, nunca toca `fs` — e e o que o selftest de `audit_base.py` prova com
fixtures. `audit_systems_in_shipped_files` e a casca fina que le o disco.
"""

import json
import os
import re

from map_schema import system_name, systems_of

MAP_FILE = "mapa.json"

# Pastas da base cujo conteudo e copiado para o projeto gerado. Relativas a raiz da base, com `/`.
# `specs/_estrutura_base*/` sao os moldes do fluxo SDD; as de `_estrutura_modulos/` sao o que o
# `create-project` instala (doutrina -> specs/arquitetura, bindings, tools) mais `tests/`, cujo
# vocabulario e fixtures alimentam o gate no projeto gerado.
SHIPPED = (
    "specs/_estrutura_modulos/doutrina",
    "specs/_estrutura_modulos/bindings",
    "specs/_estrutura_modulos/tools",
    "specs/_estrutura_modulos/tests",
    "specs/_estrutura_base",
    "specs/_estrutura_base_site",
)

IGNORED_DIRS = {"node_modules", ".git", "__pycache__", ".venv", ".ruff_cache"}
BINARY_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".woff",
    ".woff2",
    ".pdf",
    ".zip",
    ".gz",
}


def _term_pattern(term: str):
    """O termo inteiro, sem colar em outra palavra nem em outro id kebab-case (`recorta-site` nao casa
    dentro de `recorta-site-novo`). Maiusculas e minusculas valem igual: o nome cita-se de qualquer jeito."""
    return re.compile(r"(?<![\w-])" + re.escape(term) + r"(?![\w-])", re.IGNORECASE)


def system_terms(map_data: dict) -> list:
    """`[(termo, system_id)]` — o `id` e o `nome` de cada sistema. Vazio se o mapa nao tem sistemas."""
    terms = []
    for system in systems_of(map_data):
        if not isinstance(system, dict) or not isinstance(system.get("id"), str):
            continue
        for value in (system.get("id"), system_name(system)):
            if isinstance(value, str) and value.strip():
                terms.append((value.strip(), system["id"]))
    return terms


def divergences(texts_by_file: dict, terms: list) -> list:
    """Uma mensagem por (arquivo, linha, termo). `texts_by_file` e `{caminho_relativo: texto}`."""
    patterns = [
        (term, system_id, _term_pattern(term))
        for term, system_id in terms
    ]
    findings = []
    for file, text in texts_by_file.items():
        for number, line in enumerate(text.split("\n"), start=1):
            for term, system_id, pattern in patterns:
                if pattern.search(line):
                    findings.append(
                        f"{file}:{number}: cites the system '{system_id}' (\"{term}\") - "
                        "a file that ships to the generated project does not name a system"
                    )
    return findings


def is_shipped(rel_path: str) -> bool:
    """Nucleo: o caminho relativo a raiz da base (com `/`) esta sob uma pasta que viaja?"""
    return any(rel_path == d or rel_path.startswith(d + "/") for d in SHIPPED)


def _read_map(base_dir: str):
    path = os.path.join(base_dir, MAP_FILE)
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file), None
    except (OSError, ValueError) as error:
        return None, f"{MAP_FILE}: could not be read ({error})"


def _shipped_texts(base_dir: str) -> dict:
    texts = {}
    for directory in SHIPPED:
        root = os.path.join(base_dir, *directory.split("/"))
        for current, subdirs, files in os.walk(root):
            subdirs[:] = [p for p in subdirs if p not in IGNORED_DIRS]
            for name in files:
                if os.path.splitext(name)[1].lower() in BINARY_EXTENSIONS:
                    continue
                path = os.path.join(current, name)
                try:
                    with open(path, "r", encoding="utf-8") as file:
                        texts[
                            os.path.relpath(path, base_dir).replace(os.sep, "/")
                        ] = file.read()
                except (OSError, UnicodeDecodeError):
                    continue
    return texts


def audit_systems_in_shipped_files(base_dir: str) -> list:
    """Casca: le o mapa e os arquivos que viajam. Fail-closed: mapa ilegivel ou sem sistema nenhum e
    achado — uma guarda que nao tem o que procurar passaria em silencio, o defeito que ela evita."""
    map_data, error = _read_map(base_dir)
    if error is not None:
        return [f"{error} - the guard of systems in shipped files did not run"]
    terms = system_terms(map_data)
    if not terms:
        return [
            f"{MAP_FILE}: no system with id/name - the guard has nothing to look for"
        ]
    return divergences(_shipped_texts(base_dir), terms)
