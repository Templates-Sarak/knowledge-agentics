---
description: Cria (ou revisa) uma skill do ecossistema Sarak via o fluxo da skill meta-create-skill — escopo, description-gatilho, scaffold determinístico, SKILL.md denso e validação pelo checklist. Use ao criar/padronizar uma skill.
argument-hint: [nome-da-skill]
allowed-tools: Read, Edit, Write, Bash, Glob
---

# /meta-criar-skill — criar/revisar uma skill no padrão Sarak

Skill alvo: **$1** (nome em kebab-case com prefixo de área, ex.: `code-review`).

Dispara o fluxo da skill **`meta-create-skill`** para criar uma skill nova **no padrão** (3 camadas, description
que dispara, regras e checklist). A lógica/o padrão vivem na skill; aqui você orquestra.

## Passos (skill `meta-create-skill`)
1. **Definir escopo** — 1 frase sem "e"; **cheque similares** (sobreposição ≥70% → expanda a existente, não crie).
2. **Escrever a `description`** — fórmula `o quê + quando/gatilho [+ trava se sob demanda]`; enxuta (Camada 1).
3. **Scaffold** — `python skills/meta-create-skill/scripts/scaffold_skill.py $1 [--dir skills] [--with-script]`
   (valida prefixo de área + kebab-case; cria o esqueleto de 3 camadas). **Sem `: ` na description** (quebra o YAML).
4. **SKILL.md denso** — seções: o que é / quando usar / workflow acionável (ferramenta+ação+critério) / regras `NÃO/NUNCA` / checklist / ponteiros. ~150–200 linhas.
5. **HITL se mutativa** — se a skill altera algo, inclua no workflow dela um passo de confirmação antes da 1ª ação mutativa.
6. **Camada 3 (condicional)** — `references/`/`scripts/`/`assets/` só se houver conteúdo; cada arquivo com ponteiro no SKILL.md.
7. **Validar** — passe o **checklist "pronta"** da `meta-create-skill` (description com gatilho+trava; passos acionáveis; sem ponteiro órfão; script sem hardcoded).

## Limites
- **NUNCA** crie skill sem checar similares (≥70% → expanda); **NUNCA** `description` sem gatilho.
- **NÃO** use o prefixo redundante `skill-`; use prefixo de **área** (kebab-case), igual ao nome da pasta.
- **NÃO** deixe o `SKILL.md` virar roteador vazio nem inchar; verboso vai para Camada 3.
- **NÃO** crie arquivo de Camada 3 sem ponteiro no SKILL.md, nem script para tarefa que exige julgamento.
