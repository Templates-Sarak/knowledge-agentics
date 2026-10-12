"""Checagem de que toda skill termina a `description` com a trava `NÃO acione proativamente`,
exceto a lista FECHADA de skills proativas por desenho — cada entrada com a justificativa de por
que ela PRECISA disparar sem pedido para cumprir o papel (README.md §7: "skill mutativa/de
varredura termina com a trava; proativa é exceção declarada").

Separado de `audit_base.py` por SRP: aquele orquestra e imprime; este só compara.

Núcleo × casca: `frontmatter_description`/`skills_without_guard` são puros (recebem texto/lista já
lidos, nunca tocam `fs`) — é o que o `--selftest` de `audit_base.py` prova com fixtures em
memória. `audit_proactivity` é a casca fina que lê `fs` e delega.
"""

import os

GUARD = "NÃO acione proativamente"

# Exceções declaradas: skill que dispara SEM pedido do usuário, e por quê. Lista FECHADA — uma
# skill nova entra em PROACTIVE só com justificativa própria, nunca por omissão.
PROACTIVE = {
    "padrao-escrita": "always-referenced norm — the other skills consult it without being asked",
    "padrao-python": "always-referenced norm — the Python layer of the writing norm",
    "padrao-typescript": "always-referenced norm — the TS/JS layer of the writing norm",
    "spec-write": "always-referenced source of form for the other spec skills",
    "code-auditoria-padrao": "end-of-task gatekeeper — it only works if it fires unasked "
    "(explained in the body of its SKILL.md)",
}


def frontmatter_description(text):
    """Núcleo: a linha `description: ...` inteira do frontmatter YAML, ou `None` se não achar."""
    for line in text.split("\n"):
        if line.startswith("description:"):
            return line[len("description:") :].strip()
    return None


def skills_without_guard(names_and_descriptions, proactive):
    """Núcleo: nomes cuja descrição não tem a trava e que não estão na lista de exceções."""
    findings = []
    for name, description in names_and_descriptions:
        if description is None:
            findings.append(name)
            continue
        if GUARD not in description and name not in proactive:
            findings.append(name)
    return findings


def audit_proactivity(base_dir):
    """Casca: lê a `description` de cada `skills/*/SKILL.md` e cobra a trava."""
    directory = os.path.join(base_dir, "skills")
    if not os.path.isdir(directory):
        return []
    pairs = []
    for name in sorted(os.listdir(directory)):
        path = os.path.join(directory, name, "SKILL.md")
        if not os.path.isfile(path):
            continue
        text = open(path, encoding="utf-8").read()
        pairs.append((name, frontmatter_description(text)))
    return [
        "[%s] description without the guard '%s', and the skill is not in the list of "
        "declared exceptions (PROACTIVE)" % (name, GUARD)
        for name in skills_without_guard(pairs, PROACTIVE)
    ]
