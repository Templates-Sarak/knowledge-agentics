"""Checagem de contagem defasada no roteador de capacidades (`00-knowledge.md`) — os cabeçalhos
`# 5. Commands (13)`, `# 6. Agents (5)`, `# 7. Hooks (5)` citam um número escrito à mão.

O `ponteiros.py` já cobre a completude por NOME (todo artefato em disco está citado em algum lugar
do arquivo, e toda citação resolve para um artefato real) — não cobre o NÚMERO ao lado do título, que
fica mudo quando um command/agent entra ou sai e ninguém tocou a prosa do cabeçalho.

`Commands`/`Agents` contam por listagem direta de `commands/*.md` e `agents/*.md` — mesma convenção
que `ponteiros.py` já assume para esses dois. `Hooks` NÃO conta `hooks/*.js` direto: a pasta tem
`_lib.js` (biblioteca compartilhada, não um hook) junto dos cinco hooks de verdade, e contar arquivo
contaria a lib como um sexto. A fonte de verdade de "o que é um hook" é `hooks/hooks.json` — o que
está wireado lá é, por definição, o catálogo; nada além disso conta.

Separado de `audit_base.py` por SRP. Núcleo × casca: `contagens_do_texto`/`divergencias` são puras
(recebem texto/dicts, nunca tocam `fs`) — é o que o `--autoteste` prova com fixtures em memória.
`contagens_reais`/`auditar_contagens` são a casca fina que lê `fs` e delega.
"""

import json
import os
import re

CABECALHOS = ("Commands", "Agents", "Hooks")
CABECALHO_COM_CONTAGEM = re.compile(
    r"^#\s+\d+\.\s+(%s)\s*\((\d+)\)" % "|".join(CABECALHOS)
)
CAMINHO_DO_HOOK = re.compile(r"hooks/([\w-]+)\.js")

# Todo roteador que se declara dono desses três cabeçalhos — hoje os dois `00-knowledge.md`
# (base e site) compartilham o mesmo catálogo de commands/agents/hooks.
ROTEADORES = (
    "specs/_estrutura_base/00-knowledge.md",
    "specs/_estrutura_base_site/00-knowledge.md",
)


def contagens_do_texto(texto):
    """Núcleo: `{rótulo: número citado}` para cada cabeçalho `# N. Rótulo (número)` do texto."""
    achados = {}
    for linha in texto.split("\n"):
        m = CABECALHO_COM_CONTAGEM.match(linha)
        if m:
            achados[m.group(1)] = int(m.group(2))
    return achados


def divergencias(citadas, reais):
    """Núcleo: os rótulos onde o número citado diverge do número real."""
    return [
        "%s: cabeçalho cita %d, base tem %d" % (rotulo, citadas[rotulo], reais[rotulo])
        for rotulo in citadas
        if rotulo in reais and citadas[rotulo] != reais[rotulo]
    ]


def hooks_wireados(base_dir):
    """O nome de cada hook citado em `hooks/hooks.json` — dedupe, pois o mesmo script pode
    aparecer em mais de um evento mas conta como uma capacidade só."""
    caminho = os.path.join(base_dir, "hooks", "hooks.json")
    if not os.path.isfile(caminho):
        return set()
    config = json.load(open(caminho, encoding="utf-8"))
    nomes = set()
    for entradas in config.get("hooks", {}).values():
        for entrada in entradas:
            for h in entrada.get("hooks", []):
                m = CAMINHO_DO_HOOK.search(h.get("command", ""))
                if m:
                    nomes.add(m.group(1))
    return nomes


def _contagem_de_pasta(base_dir, pasta, extensao):
    caminho = os.path.join(base_dir, pasta)
    if not os.path.isdir(caminho):
        return 0
    return sum(1 for nome in os.listdir(caminho) if nome.endswith(extensao))


def contagens_reais(base_dir):
    """Casca: quantos commands/agents existem em disco, quantos hooks estão wireados."""
    return {
        "Commands": _contagem_de_pasta(base_dir, "commands", ".md"),
        "Agents": _contagem_de_pasta(base_dir, "agents", ".md"),
        "Hooks": len(hooks_wireados(base_dir)),
    }


def auditar_contagens(base_dir):
    """Casca: para cada roteador que existe, compara o número do cabeçalho com a contagem real."""
    reais = contagens_reais(base_dir)
    achados = []
    for rel in ROTEADORES:
        caminho = os.path.join(base_dir, rel)
        if not os.path.isfile(caminho):
            continue
        texto = open(caminho, encoding="utf-8").read()
        citadas = contagens_do_texto(texto)
        for div in divergencias(citadas, reais):
            achados.append("[%s] %s" % (rel, div))
    return achados
