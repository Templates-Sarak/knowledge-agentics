"""Checagem de que todo artefato publicado (`skills/*`, `commands/*`, `agents/*`) começa por um
prefixo do vocabulário fechado de área — a mesma lei que `skills/meta-create-skill/references/
nomenclatura.md` declara como fonte única (ver o comentário daquele arquivo: antes dele existir,
`README.md` §6 e `meta-create-skill/SKILL.md` tinham cópia própria e divergiam).

Separado de `audit_base.py` por SRP: aquele orquestra e imprime; este só compara.

POLÍTICA: falha fechada. Se `nomenclatura.md` mudar de forma e o parser abaixo não extrair NENHUM
prefixo, a checagem inteira reprova — nunca passa em silêncio como se o vocabulário estivesse
vazio (mesmo defeito de fail-open que `thresholds.py`/Tarefa 1 evita para `thresholds.mjs`).

Núcleo × casca: `prefixes_of_text`/`prefix_root`/`outside_vocabulary` são puros (recebem
texto/lista já lidos, nunca tocam `fs`) — é o que o `--selftest` de `audit_base.py` prova com
fixtures em memória. `audit_naming` é a casca fina que lê `fs` e delega.
"""

import os
import re

_PREFIX_LINE = re.compile(r"^\|\s*`([a-z]+-)`\s*\|")
_NAME_PREFIX = re.compile(r"^([a-z]+)\d*-")


def prefixes_of_text(text):
    """Núcleo: os prefixos declarados na tabela de `nomenclatura.md` — linhas no formato
    '| `xxx-` | ...'. Lista VAZIA (nunca `None`) quando nada bate; quem chama decide o fail-closed."""
    return [
        m.group(1)
        for line in text.split("\n")
        for m in [_PREFIX_LINE.match(line)]
        if m
    ]


def prefix_root(name):
    """Núcleo: a raiz alfabética do prefixo de um NOME de artefato, sem o `\\d*` do fluxo
    numerado (`code1-auditar` -> `code`) e sem o traço. `None` se o nome não começa com
    letras seguidas de traço (com dígitos opcionais no meio)."""
    m = _NAME_PREFIX.match(name)
    return m.group(1) if m else None


def outside_vocabulary(names, prefixes):
    """Núcleo: os `nomes` cuja raiz de prefixo não está no vocabulário (`prefixos`, cada um já
    com o traço, ex. `'code-'`)."""
    valid_roots = {p.rstrip("-") for p in prefixes}
    return [name for name in names if prefix_root(name) not in valid_roots]


def _skill_names(base_dir):
    directory = os.path.join(base_dir, "skills")
    if not os.path.isdir(directory):
        return []
    return sorted(n for n in os.listdir(directory) if os.path.isdir(os.path.join(directory, n)))


def _md_names(base_dir, subdir):
    directory = os.path.join(base_dir, subdir)
    if not os.path.isdir(directory):
        return []
    return sorted(
        os.path.splitext(n)[0] for n in os.listdir(directory) if n.endswith(".md")
    )


def audit_naming(base_dir):
    """Casca: lê o vocabulário de `nomenclatura.md` e cobra que todo `skills/*`, `commands/*` e
    `agents/*` comece por um prefixo dele."""
    path = os.path.join(
        base_dir, "skills", "meta-create-skill", "references", "nomenclatura.md"
    )
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return [
            "[nomenclatura.md] file not found — prefix check failed (fail-closed)"
        ]

    prefixes = prefixes_of_text(text)
    if not prefixes:
        return [
            "[nomenclatura.md] zero prefixes extracted — unexpected format, "
            "check failed (fail-closed)"
        ]

    findings = []
    groups = {
        "skills": _skill_names(base_dir),
        "commands": _md_names(base_dir, "commands"),
        "agents": _md_names(base_dir, "agents"),
    }
    for directory, names in groups.items():
        for name in outside_vocabulary(names, prefixes):
            findings.append(
                "[%s] '%s' does not start with a vocabulary prefix (%s)"
                % (directory, name, ", ".join(prefixes))
            )
    return findings
