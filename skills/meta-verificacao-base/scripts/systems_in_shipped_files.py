"""Nenhum arquivo que VIAJA para o projeto gerado pode nomear um sistema do `mapa.json`.

O `create-project` copia a doutrina, os bindings e o `tools/` para todo projeto gerado, inclusive os
de cliente, e o `meta-iniciar-repositorio` copia os moldes do fluxo SDD. Um `id` ou um `nome` de
sistema do mapa dentro desses arquivos vaza para quem recebe o projeto o fato de que outro sistema
existe — foi o defeito do `ADR-023`, que citava os sistemas e a contagem de excecoes de cada um.

A lista de sistemas vem do `mapa.json` lido em runtime, nunca escrita aqui: sistema novo no mapa
passa a ser coberto sem tocar este arquivo. Documentacao que NAO viaja (`skills/**`, `README.md` da
base, o `mapa.json`) pode citar sistema a vontade — e la que o detalhe por sistema mora.

Nucleo x casca, o padrao das irmas (`mapa.py`, `manifestos.py`): `divergencias` e pura — recebe os
textos e os sistemas ja lidos, nunca toca `fs` — e e o que o autoteste de `audit_base.py` prova com
fixtures. `auditar_sistemas_nos_viajantes` e a casca fina que le o disco.
"""

import json
import os
import re

ARQUIVO_DO_MAPA = "mapa.json"

# Pastas da base cujo conteudo e copiado para o projeto gerado. Relativas a raiz da base, com `/`.
# `specs/_estrutura_base*/` sao os moldes do fluxo SDD; as tres de `_estrutura_modulos/` sao o que o
# `create-project` instala (doutrina -> specs/arquitetura, bindings, tools).
VIAJANTES = (
    "specs/_estrutura_modulos/doutrina",
    "specs/_estrutura_modulos/bindings",
    "specs/_estrutura_modulos/tools",
    "specs/_estrutura_base",
    "specs/_estrutura_base_site",
)

PASTAS_IGNORADAS = {"node_modules", ".git", "__pycache__", ".venv", ".ruff_cache"}
EXTENSOES_BINARIAS = {
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


def _padrao_do_termo(termo: str):
    """O termo inteiro, sem colar em outra palavra nem em outro id kebab-case (`recorta-site` nao casa
    dentro de `recorta-site-novo`). Maiusculas e minusculas valem igual: o nome cita-se de qualquer jeito."""
    return re.compile(r"(?<![\w-])" + re.escape(termo) + r"(?![\w-])", re.IGNORECASE)


def termos_dos_sistemas(mapa: dict) -> list:
    """`[(termo, id_do_sistema)]` — o `id` e o `nome` de cada sistema. Vazio se o mapa nao tem sistemas."""
    termos = []
    for sistema in mapa.get("sistemas", []):
        if not isinstance(sistema, dict) or not isinstance(sistema.get("id"), str):
            continue
        for campo in ("id", "nome"):
            valor = sistema.get(campo)
            if isinstance(valor, str) and valor.strip():
                termos.append((valor.strip(), sistema["id"]))
    return termos


def divergencias(textos_por_arquivo: dict, termos: list) -> list:
    """Uma mensagem por (arquivo, linha, termo). `textos_por_arquivo` e `{caminho_relativo: texto}`."""
    padroes = [
        (termo, id_do_sistema, _padrao_do_termo(termo))
        for termo, id_do_sistema in termos
    ]
    achados = []
    for arquivo, texto in textos_por_arquivo.items():
        for numero, linha in enumerate(texto.split("\n"), start=1):
            for termo, id_do_sistema, padrao in padroes:
                if padrao.search(linha):
                    achados.append(
                        f"{arquivo}:{numero}: cita o sistema '{id_do_sistema}' (\"{termo}\") - "
                        "arquivo que viaja para o projeto gerado nao nomeia sistema"
                    )
    return achados


def _ler_mapa(base_dir: str):
    caminho = os.path.join(base_dir, ARQUIVO_DO_MAPA)
    try:
        with open(caminho, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo), None
    except (OSError, ValueError) as erro:
        return None, f"{ARQUIVO_DO_MAPA}: nao foi possivel ler ({erro})"


def _textos_dos_viajantes(base_dir: str) -> dict:
    textos = {}
    for pasta in VIAJANTES:
        raiz = os.path.join(base_dir, *pasta.split("/"))
        for atual, subpastas, arquivos in os.walk(raiz):
            subpastas[:] = [p for p in subpastas if p not in PASTAS_IGNORADAS]
            for nome in arquivos:
                if os.path.splitext(nome)[1].lower() in EXTENSOES_BINARIAS:
                    continue
                caminho = os.path.join(atual, nome)
                try:
                    with open(caminho, "r", encoding="utf-8") as arquivo:
                        textos[
                            os.path.relpath(caminho, base_dir).replace(os.sep, "/")
                        ] = arquivo.read()
                except (OSError, UnicodeDecodeError):
                    continue
    return textos


def auditar_sistemas_nos_viajantes(base_dir: str) -> list:
    """Casca: le o mapa e os arquivos que viajam. Fail-closed: mapa ilegivel ou sem sistema nenhum e
    achado — uma guarda que nao tem o que procurar passaria em silencio, o defeito que ela evita."""
    mapa, erro = _ler_mapa(base_dir)
    if erro is not None:
        return [f"{erro} - a guarda de sistemas nos arquivos que viajam nao rodou"]
    termos = termos_dos_sistemas(mapa)
    if not termos:
        return [
            f"{ARQUIVO_DO_MAPA}: nenhum sistema com id/nome - a guarda nao tem o que procurar"
        ]
    return divergencias(_textos_dos_viajantes(base_dir), termos)
