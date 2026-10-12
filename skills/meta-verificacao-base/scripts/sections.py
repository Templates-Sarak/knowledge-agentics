"""Checagem de que todo `SKILL.md` tem as seções obrigatórias do molde — hoje `audit_base.py` só
olha YAML (armadilha `: `), contrato de saída e ponteiro órfão, nunca a ESTRUTURA do corpo.

As três seções cobradas (`## Quando usar`, `## Regras...`, `## Checklist...`) são o mínimo
verificado por máquina como universalmente verdadeiro nas 49 skills existentes hoje — não inclui
`## Workflow`: seis skills legítimas não o têm por desenho (`padrao-escrita`/`padrao-python`/
`padrao-typescript` são normas de referência, não passo a passo; `code-modulo`/
`meta-adequacao-modular` ramificam em `## Fluxo A`/`## Fluxo B` em vez de um `## Workflow` único;
`meta-atualizar-base` tem `## Workflow` mas foi contado à parte). Cobrar `Workflow` aqui produziria
falso positivo nessas seis — o oposto do que a Tarefa 6 pediu (impedir a REGRESSÃO ao molde antigo
"O Gatilho"/"Regras de Ouro" sem checklist, não inventar uma exigência nova que a própria base não segue).

Separado de `audit_base.py` por SRP. Núcleo × casca: `missing_sections` é pura (recebe texto e a
lista de prefixos, nunca toca `fs`) — é o que o `--selftest` prova com fixtures em memória.
`audit_sections` é a casca fina que lê `fs` e delega.
"""

import os

REQUIRED_SECTIONS = ("## Quando usar", "## Regras", "## Checklist")


def missing_sections(text, prefixes):
    """Núcleo: os prefixos de `prefixos` que não abrem nenhuma linha do `texto`."""
    lines = text.split("\n")
    return [
        prefix
        for prefix in prefixes
        if not any(line.startswith(prefix) for line in lines)
    ]


def audit_sections(base_dir):
    """Casca: cobra as seções obrigatórias em todo `skills/*/SKILL.md`."""
    directory = os.path.join(base_dir, "skills")
    if not os.path.isdir(directory):
        return []
    findings = []
    for name in sorted(os.listdir(directory)):
        path = os.path.join(directory, name, "SKILL.md")
        if not os.path.isfile(path):
            continue
        text = open(path, encoding="utf-8").read()
        for section in missing_sections(text, REQUIRED_SECTIONS):
            findings.append(
                "[%s] required section missing (prefix '%s')" % (name, section)
            )
    return findings
