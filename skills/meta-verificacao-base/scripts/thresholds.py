"""Checagem de convergência dos limiares 40/3/4 — compara a FONTE ÚNICA declarada em
`specs/_estrutura_modulos/tools/gate/thresholds.mjs` contra as cópias à mão em cada
`skills/padrao-<linguagem>/scripts/config.json` (`maxFunctionLines`/`maxNesting`/`maxParams`).

Separado de `audit_base.py` por SRP: aquele orquestra e imprime; este só compara.

POLÍTICA: falha fechada. Se `thresholds.mjs` mudar de forma e o parser abaixo deixar de
reconhecer o objeto `THRESHOLDS`, o retorno é reprovação explícita — nunca inferência silenciosa
(mesmo defeito de fail-open que este repo já mediu e corrigiu em outro lugar).

Núcleo × casca: as funções `thresholds_of_mjs_text`/`thresholds_of_config_dict` são puras (recebem texto/estrutura já lidos,
nunca tocam `fs`) e são o que o `--selftest` de `audit_base.py` prova com fixtures em memória.
As funções `thresholds_from_mjs_file/thresholds_of_config_file` são a casca fina que só lê o disco e delega.
"""

import json
import os
import re

MJS_KEYS = ("functionLines", "nesting", "params")
CONFIG_KEYS = ("maxFunctionLines", "maxNesting", "maxParams")
MJS_TO_CONFIG_MAP = dict(zip(MJS_KEYS, CONFIG_KEYS))

_THRESHOLDS_BLOCK = re.compile(r"THRESHOLDS\s*=\s*\{(.*?)\}", re.DOTALL)


def thresholds_of_mjs_text(text):
    """Núcleo: `{functionLines, nesting, params}` extraído do TEXTO de `thresholds.mjs`,
    ou `None` se o formato não bater — fail-closed, nunca infere valor ausente."""
    block = _THRESHOLDS_BLOCK.search(text)
    if block is None:
        return None
    body = block.group(1)
    values = {}
    for key in MJS_KEYS:
        m = re.search(r"\b%s\s*:\s*(\d+)" % re.escape(key), body)
        if m is None:
            return None
        values[key] = int(m.group(1))
    return values


def thresholds_from_mjs_file(path):
    """Casca: lê `thresholds.mjs` do disco e delega ao núcleo."""
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return None
    return thresholds_of_mjs_text(text)


def thresholds_of_config_dict(data):
    """Núcleo: `{maxFunctionLines, maxNesting, maxParams}` de um dict já carregado, ou `None`
    se faltar algum dos três campos esperados."""
    if not all(key in data for key in CONFIG_KEYS):
        return None
    return {key: data[key] for key in CONFIG_KEYS}


def thresholds_of_config_file(path):
    """Casca: lê o `config.json` do disco e delega ao núcleo."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    return thresholds_of_config_dict(data)


def divergences(mjs, config, label):
    """Núcleo: mensagens de divergência entre o trio-fonte (`mjs`, já resolvido e não-`None`)
    e a cópia de `rotulo` (nome da pasta `padrao-<linguagem>`)."""
    if config is None:
        return [
            "[%s] config.json unreadable or missing the three expected fields "
            "(maxFunctionLines/maxNesting/maxParams)" % label
        ]
    findings = []
    for mjs_key, config_key in MJS_TO_CONFIG_MAP.items():
        if mjs[mjs_key] != config[config_key]:
            findings.append(
                "[%s] %s diverges from the single source: thresholds.mjs.%s=%s vs config.json.%s=%s"
                % (
                    label,
                    mjs_key,
                    mjs_key,
                    mjs[mjs_key],
                    config_key,
                    config[config_key],
                )
            )
    return findings


def audit_thresholds(base_dir):
    """Casca: compara `thresholds.mjs` contra `padrao-python` e `padrao-typescript`."""
    mjs_path = os.path.join(
        base_dir, "specs", "_estrutura_modulos", "tools", "gate", "thresholds.mjs"
    )
    mjs = thresholds_from_mjs_file(mjs_path)
    if mjs is None:
        return [
            "[thresholds.mjs] unexpected format — could not extract THRESHOLDS; "
            "comparison failed (fail-closed)"
        ]
    findings = []
    for directory in ("padrao-python", "padrao-typescript"):
        config_path = os.path.join(base_dir, "skills", directory, "scripts", "config.json")
        config = thresholds_of_config_file(config_path)
        findings.extend(divergences(mjs, config, directory))
    return findings
