"""Checagem de convergência dos limiares 40/3/4 — compara a FONTE ÚNICA declarada em
`specs/_estrutura_modulos/tools/gate/thresholds.mjs` contra as cópias à mão em cada
`skills/padrao-<linguagem>/scripts/config.json` (`maxFunctionLines`/`maxNesting`/`maxParams`).

Separado de `audit_base.py` por SRP: aquele orquestra e imprime; este só compara.

POLÍTICA: falha fechada. Se `thresholds.mjs` mudar de forma e o parser abaixo deixar de
reconhecer o objeto `LIMIARES`, o retorno é reprovação explícita — nunca inferência silenciosa
(mesmo defeito de fail-open que este repo já mediu e corrigiu em outro lugar).

Núcleo × casca: as funções `_de_texto`/`_de_dict` são puras (recebem texto/estrutura já lidos,
nunca tocam `fs`) e são o que o `--autoteste` de `audit_base.py` prova com fixtures em memória.
As funções `_de_arquivo` são a casca fina que só lê o disco e delega.
"""

import json
import os
import re

CHAVES_MJS = ("linhasFuncao", "aninhamento", "parametros")
CHAVES_CONFIG = ("maxFunctionLines", "maxNesting", "maxParams")
MAPA_MJS_PARA_CONFIG = dict(zip(CHAVES_MJS, CHAVES_CONFIG))

_BLOCO_LIMIARES = re.compile(r"LIMIARES\s*=\s*\{(.*?)\}", re.DOTALL)


def limiares_de_texto_mjs(texto):
    """Núcleo: `{linhasFuncao, aninhamento, parametros}` extraído do TEXTO de `thresholds.mjs`,
    ou `None` se o formato não bater — fail-closed, nunca infere valor ausente."""
    bloco = _BLOCO_LIMIARES.search(texto)
    if bloco is None:
        return None
    corpo = bloco.group(1)
    valores = {}
    for chave in CHAVES_MJS:
        m = re.search(r"\b%s\s*:\s*(\d+)" % re.escape(chave), corpo)
        if m is None:
            return None
        valores[chave] = int(m.group(1))
    return valores


def limiares_de_thresholds(caminho):
    """Casca: lê `thresholds.mjs` do disco e delega ao núcleo."""
    try:
        texto = open(caminho, encoding="utf-8").read()
    except OSError:
        return None
    return limiares_de_texto_mjs(texto)


def limiares_de_dict_config(dados):
    """Núcleo: `{maxFunctionLines, maxNesting, maxParams}` de um dict já carregado, ou `None`
    se faltar algum dos três campos esperados."""
    if not all(chave in dados for chave in CHAVES_CONFIG):
        return None
    return {chave: dados[chave] for chave in CHAVES_CONFIG}


def limiares_de_config(caminho):
    """Casca: lê o `config.json` do disco e delega ao núcleo."""
    try:
        with open(caminho, encoding="utf-8") as f:
            dados = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    return limiares_de_dict_config(dados)


def divergencias(mjs, config, rotulo):
    """Núcleo: mensagens de divergência entre o trio-fonte (`mjs`, já resolvido e não-`None`)
    e a cópia de `rotulo` (nome da pasta `padrao-<linguagem>`)."""
    if config is None:
        return [
            "[%s] config.json ilegível ou sem os três campos esperados "
            "(maxFunctionLines/maxNesting/maxParams)" % rotulo
        ]
    achados = []
    for chave_mjs, chave_cfg in MAPA_MJS_PARA_CONFIG.items():
        if mjs[chave_mjs] != config[chave_cfg]:
            achados.append(
                "[%s] %s diverge da fonte única: thresholds.mjs.%s=%s vs config.json.%s=%s"
                % (
                    rotulo,
                    chave_mjs,
                    chave_mjs,
                    mjs[chave_mjs],
                    chave_cfg,
                    config[chave_cfg],
                )
            )
    return achados


def auditar_limiares(base_dir):
    """Casca: compara `thresholds.mjs` contra `padrao-python` e `padrao-typescript`."""
    caminho_mjs = os.path.join(
        base_dir, "specs", "_estrutura_modulos", "tools", "gate", "thresholds.mjs"
    )
    mjs = limiares_de_thresholds(caminho_mjs)
    if mjs is None:
        return [
            "[thresholds.mjs] formato inesperado — não foi possível extrair LIMIARES; "
            "comparação reprovada (fail-closed)"
        ]
    achados = []
    for pasta in ("padrao-python", "padrao-typescript"):
        caminho_cfg = os.path.join(base_dir, "skills", pasta, "scripts", "config.json")
        config = limiares_de_config(caminho_cfg)
        achados.extend(divergencias(mjs, config, pasta))
    return achados
