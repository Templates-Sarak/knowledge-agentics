"""Checagem de que todo artefato publicado (`skills/*`, `commands/*`, `agents/*`) começa por um
prefixo do vocabulário fechado de área — a mesma lei que `skills/meta-create-skill/references/
nomenclatura.md` declara como fonte única (ver o comentário daquele arquivo: antes dele existir,
`README.md` §6 e `meta-create-skill/SKILL.md` tinham cópia própria e divergiam).

Separado de `audit_base.py` por SRP: aquele orquestra e imprime; este só compara.

POLÍTICA: falha fechada. Se `nomenclatura.md` mudar de forma e o parser abaixo não extrair NENHUM
prefixo, a checagem inteira reprova — nunca passa em silêncio como se o vocabulário estivesse
vazio (mesmo defeito de fail-open que `limiares.py`/Tarefa 1 evita para `thresholds.mjs`).

Núcleo × casca: `prefixos_do_texto`/`raiz_do_prefixo`/`fora_do_vocabulario` são puros (recebem
texto/lista já lidos, nunca tocam `fs`) — é o que o `--autoteste` de `audit_base.py` prova com
fixtures em memória. `auditar_nomenclatura` é a casca fina que lê `fs` e delega.
"""

import os
import re

_LINHA_DE_PREFIXO = re.compile(r"^\|\s*`([a-z]+-)`\s*\|")
_PREFIXO_DO_NOME = re.compile(r"^([a-z]+)\d*-")


def prefixos_do_texto(texto):
    """Núcleo: os prefixos declarados na tabela de `nomenclatura.md` — linhas no formato
    '| `xxx-` | ...'. Lista VAZIA (nunca `None`) quando nada bate; quem chama decide o fail-closed."""
    return [
        m.group(1)
        for linha in texto.split("\n")
        for m in [_LINHA_DE_PREFIXO.match(linha)]
        if m
    ]


def raiz_do_prefixo(nome):
    """Núcleo: a raiz alfabética do prefixo de um NOME de artefato, sem o `\\d*` do fluxo
    numerado (`code1-auditar` -> `code`) e sem o traço. `None` se o nome não começa com
    letras seguidas de traço (com dígitos opcionais no meio)."""
    m = _PREFIXO_DO_NOME.match(nome)
    return m.group(1) if m else None


def fora_do_vocabulario(nomes, prefixos):
    """Núcleo: os `nomes` cuja raiz de prefixo não está no vocabulário (`prefixos`, cada um já
    com o traço, ex. `'code-'`)."""
    raizes_validas = {p.rstrip("-") for p in prefixos}
    return [nome for nome in nomes if raiz_do_prefixo(nome) not in raizes_validas]


def _nomes_de_skills(base_dir):
    pasta = os.path.join(base_dir, "skills")
    if not os.path.isdir(pasta):
        return []
    return sorted(n for n in os.listdir(pasta) if os.path.isdir(os.path.join(pasta, n)))


def _nomes_de_md(base_dir, subpasta):
    pasta = os.path.join(base_dir, subpasta)
    if not os.path.isdir(pasta):
        return []
    return sorted(
        os.path.splitext(n)[0] for n in os.listdir(pasta) if n.endswith(".md")
    )


def auditar_nomenclatura(base_dir):
    """Casca: lê o vocabulário de `nomenclatura.md` e cobra que todo `skills/*`, `commands/*` e
    `agents/*` comece por um prefixo dele."""
    caminho = os.path.join(
        base_dir, "skills", "meta-create-skill", "references", "nomenclatura.md"
    )
    try:
        texto = open(caminho, encoding="utf-8").read()
    except OSError:
        return [
            "[nomenclatura.md] arquivo não encontrado — checagem de prefixo reprovada (fail-closed)"
        ]

    prefixos = prefixos_do_texto(texto)
    if not prefixos:
        return [
            "[nomenclatura.md] zero prefixos extraídos — formato inesperado, "
            "checagem reprovada (fail-closed)"
        ]

    achados = []
    grupos = {
        "skills": _nomes_de_skills(base_dir),
        "commands": _nomes_de_md(base_dir, "commands"),
        "agents": _nomes_de_md(base_dir, "agents"),
    }
    for pasta, nomes in grupos.items():
        for nome in fora_do_vocabulario(nomes, prefixos):
            achados.append(
                "[%s] '%s' não começa com prefixo do vocabulário (%s)"
                % (pasta, nome, ", ".join(prefixos))
            )
    return achados
