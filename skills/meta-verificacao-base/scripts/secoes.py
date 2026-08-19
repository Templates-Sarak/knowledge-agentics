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

Separado de `audit_base.py` por SRP. Núcleo × casca: `secoes_faltando` é pura (recebe texto e a
lista de prefixos, nunca toca `fs`) — é o que o `--autoteste` prova com fixtures em memória.
`auditar_secoes` é a casca fina que lê `fs` e delega.
"""

import os

SECOES_OBRIGATORIAS = ("## Quando usar", "## Regras", "## Checklist")


def secoes_faltando(texto, prefixos):
    """Núcleo: os prefixos de `prefixos` que não abrem nenhuma linha do `texto`."""
    linhas = texto.split("\n")
    return [
        prefixo
        for prefixo in prefixos
        if not any(linha.startswith(prefixo) for linha in linhas)
    ]


def auditar_secoes(base_dir):
    """Casca: cobra as seções obrigatórias em todo `skills/*/SKILL.md`."""
    pasta = os.path.join(base_dir, "skills")
    if not os.path.isdir(pasta):
        return []
    achados = []
    for nome in sorted(os.listdir(pasta)):
        caminho = os.path.join(pasta, nome, "SKILL.md")
        if not os.path.isfile(caminho):
            continue
        texto = open(caminho, encoding="utf-8").read()
        for secao in secoes_faltando(texto, SECOES_OBRIGATORIAS):
            achados.append(
                "[%s] seção obrigatória ausente (prefixo '%s')" % (nome, secao)
            )
    return achados
