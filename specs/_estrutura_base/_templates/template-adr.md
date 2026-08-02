---
tipo: "adr"
titulo: "Título Curto e Direto (Ex: Escolha do PostgreSQL)"
status: "Proposto" # Opções: Proposto, 🟢 Aceito, Rejeitado, 🔴 Substituído
tags: ["adr"]
relacionados: []
substitui: ""      # Ex: [[001-escolha-mysql]]
substituido_por: ""
---

> **Onde vive cada ADR.** `specs/adr/` é o **único** diretório de decisões do projeto:
>
> | Arquivo | O quê | Editável? |
> |---|---|---|
> | `000-decisoes-do-template.md` | ADR-001..007 — por que o template de módulos é como é | **Não.** Vem do template; mudar de ideia é ADR novo aqui |
> | `NNN-<nome>.md` | decisões deste projeto (stack, schema, idioma das pastas, fornecedor) | você escreve, usando este molde |
>
> **Exceção ao gate de módulos** (`config/conformidade.json`) exige o campo `decisao` apontando para um ADR
> daqui — **sem esse link, o gate rejeita a própria exceção**. Escreva a decisão *antes* de registrar a
> exceção, nunca depois.

# 1. Contexto e Problema
Qual era a situação que nos forçou a tomar essa decisão?

# 2. Decisão
O que decidimos fazer de fato?

# 3. Consequências
- **Positivas:** ...
- **Negativas (Trade-offs):** ...
