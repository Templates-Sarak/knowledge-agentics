"""Checagem de que toda skill termina a `description` com a trava `NÃO acione proativamente`,
exceto a lista FECHADA de skills proativas por desenho — cada entrada com a justificativa de por
que ela PRECISA disparar sem pedido para cumprir o papel (README.md §7: "skill mutativa/de
varredura termina com a trava; proativa é exceção declarada").

Separado de `audit_base.py` por SRP: aquele orquestra e imprime; este só compara.

Núcleo × casca: `descricao_do_frontmatter`/`skills_sem_trava` são puros (recebem texto/lista já
lidos, nunca tocam `fs`) — é o que o `--autoteste` de `audit_base.py` prova com fixtures em
memória. `auditar_proatividade` é a casca fina que lê `fs` e delega.
"""

import os

TRAVA = "NÃO acione proativamente"

# Exceções declaradas: skill que dispara SEM pedido do usuário, e por quê. Lista FECHADA — uma
# skill nova entra em PROATIVAS só com justificativa própria, nunca por omissão.
PROATIVAS = {
    "padrao-escrita": "norma sempre-referenciada — as demais skills a consultam sem pedir",
    "padrao-python": "norma sempre-referenciada — a camada Python do padrao-escrita",
    "padrao-typescript": "norma sempre-referenciada — a camada TS/JS do padrao-escrita",
    "spec-write": "fonte de forma sempre-referenciada pelas demais skills de spec",
    "code-auditoria-padrao": "gatekeeper de fim de tarefa — só funciona se dispara sem pedido "
    "(explicado no corpo do SKILL.md dela)",
}


def descricao_do_frontmatter(texto):
    """Núcleo: a linha `description: ...` inteira do frontmatter YAML, ou `None` se não achar."""
    for linha in texto.split("\n"):
        if linha.startswith("description:"):
            return linha[len("description:") :].strip()
    return None


def skills_sem_trava(nomes_e_descricoes, proativas):
    """Núcleo: nomes cuja descrição não tem a trava e que não estão na lista de exceções."""
    achados = []
    for nome, descricao in nomes_e_descricoes:
        if descricao is None:
            achados.append(nome)
            continue
        if TRAVA not in descricao and nome not in proativas:
            achados.append(nome)
    return achados


def auditar_proatividade(base_dir):
    """Casca: lê a `description` de cada `skills/*/SKILL.md` e cobra a trava."""
    pasta = os.path.join(base_dir, "skills")
    if not os.path.isdir(pasta):
        return []
    pares = []
    for nome in sorted(os.listdir(pasta)):
        caminho = os.path.join(pasta, nome, "SKILL.md")
        if not os.path.isfile(caminho):
            continue
        texto = open(caminho, encoding="utf-8").read()
        pares.append((nome, descricao_do_frontmatter(texto)))
    return [
        "[%s] description sem a trava '%s', e a skill não está na lista de exceções "
        "declaradas (PROATIVAS)" % (nome, TRAVA)
        for nome in skills_sem_trava(pares, PROATIVAS)
    ]
