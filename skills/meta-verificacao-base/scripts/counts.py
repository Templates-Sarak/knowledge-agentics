"""Checagem de contagem defasada no roteador de capacidades (`00-knowledge.md`) — os cabeçalhos
`# 5. Commands (13)`, `# 6. Agents (5)`, `# 7. Hooks (5)` citam um número escrito à mão.

O `pointers.py` já cobre a completude por NOME (todo artefato em disco está citado em algum lugar
do arquivo, e toda citação resolve para um artefato real) — não cobre o NÚMERO ao lado do título, que
fica mudo quando um command/agent entra ou sai e ninguém tocou a prosa do cabeçalho.

`Commands`/`Agents` contam por listagem direta de `commands/*.md` e `agents/*.md` — mesma convenção
que `pointers.py` já assume para esses dois. `Hooks` NÃO conta `hooks/*.js` direto: a pasta tem
`_lib.js` (biblioteca compartilhada, não um hook) junto dos cinco hooks de verdade, e contar arquivo
contaria a lib como um sexto. A fonte de verdade de "o que é um hook" é `hooks/hooks.json` — o que
está wireado lá é, por definição, o catálogo; nada além disso conta.

Separado de `audit_base.py` por SRP. Núcleo × casca: `counts_of_text`/`divergences` são puras
(recebem texto/dicts, nunca tocam `fs`) — é o que o `--selftest` prova com fixtures em memória.
`actual_counts`/`audit_counts` são a casca fina que lê `fs` e delega.
"""

import json
import os
import re

HEADERS = ("Commands", "Agents", "Hooks")
HEADER_WITH_COUNT = re.compile(
    r"^#\s+\d+\.\s+(%s)\s*\((\d+)\)" % "|".join(HEADERS)
)
HOOK_PATH = re.compile(r"hooks/([\w-]+)\.js")

# Todo roteador que se declara dono desses três cabeçalhos — hoje os dois `00-knowledge.md`
# (base e site) compartilham o mesmo catálogo de commands/agents/hooks.
ROUTERS = (
    "specs/_estrutura_base/00-knowledge.md",
    "specs/_estrutura_base_site/00-knowledge.md",
)


def counts_of_text(text):
    """Núcleo: `{rótulo: número citado}` para cada cabeçalho `# N. Rótulo (número)` do texto."""
    findings = {}
    for line in text.split("\n"):
        m = HEADER_WITH_COUNT.match(line)
        if m:
            findings[m.group(1)] = int(m.group(2))
    return findings


def divergences(cited, actual):
    """Núcleo: os rótulos onde o número citado diverge do número real."""
    return [
        "%s: header cites %d, base has %d" % (label, cited[label], actual[label])
        for label in cited
        if label in actual and cited[label] != actual[label]
    ]


def wired_hooks(base_dir):
    """O nome de cada hook citado em `hooks/hooks.json` — dedupe, pois o mesmo script pode
    aparecer em mais de um evento mas conta como uma capacidade só."""
    path = os.path.join(base_dir, "hooks", "hooks.json")
    if not os.path.isfile(path):
        return set()
    config = json.load(open(path, encoding="utf-8"))
    names = set()
    for entries in config.get("hooks", {}).values():
        for entry in entries:
            for h in entry.get("hooks", []):
                m = HOOK_PATH.search(h.get("command", ""))
                if m:
                    names.add(m.group(1))
    return names


def _dir_count(base_dir, directory, extension):
    path = os.path.join(base_dir, directory)
    if not os.path.isdir(path):
        return 0
    return sum(1 for name in os.listdir(path) if name.endswith(extension))


def actual_counts(base_dir):
    """Casca: quantos commands/agents existem em disco, quantos hooks estão wireados."""
    return {
        "Commands": _dir_count(base_dir, "commands", ".md"),
        "Agents": _dir_count(base_dir, "agents", ".md"),
        "Hooks": len(wired_hooks(base_dir)),
    }


def audit_counts(base_dir):
    """Casca: para cada roteador que existe, compara o número do cabeçalho com a contagem real."""
    actual = actual_counts(base_dir)
    findings = []
    for rel in ROUTERS:
        path = os.path.join(base_dir, rel)
        if not os.path.isfile(path):
            continue
        text = open(path, encoding="utf-8").read()
        cited = counts_of_text(text)
        for div in divergences(cited, actual):
            findings.append("[%s] %s" % (rel, div))
    return findings
