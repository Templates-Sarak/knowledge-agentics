---
tipo: "spec"
familia: "FF" # Família do catálogo (panorama/00-planejamento.md §1). O nome do arquivo começa por ela.
titulo: "Nome da Funcionalidade"
dominio: "Nome do Módulo (Ex: Autenticação)"
status: "🔴 A Implementar" # Opções: 🔴 A Implementar, 🟡 Em Progresso, 🟢 Implementado
prioridade: "Alta"
tags: ["spec"]
relacionados: [] # Ex: [[02.01-banco-de-dados]]. SÓ specs fixas (specs/ · arquitetura/ · adr/).
                 # NUNCA uma plan: ela é removida na síntese e o ponteiro morre junto.
---

> **Molde de spec.** Nome do arquivo: `specs/FF.NN-<slug>.md` — `FF` é uma família do catálogo
> ([[00-planejamento]] §1) e `NN` o próximo livre **dentro da família, somando `specs/` e `arquitetura/`** (o
> par `FF.NN` nunca se repete entre as duas), ambos com zero à esquerda. O campo `familia` repete o `FF`.

# 1. Visão Geral
Descreva brevemente o objetivo desta funcionalidade e o problema que ela resolve.

# 2. Regras de Negócio
- **Regra 1:** ...
- **Regra 2:** ...

# 3. Critérios de Aceite
- [ ] Cenário A funciona conforme esperado.
- [ ] Cenário B lança o erro X.

# 4. Plano de Testes (Quality Gate)
Mapeamento obrigatório dos testes que as skills (`test-unitario`, `api-contrato` ou `test-e2e`) deverão implementar para considerar esta spec "Concluída".

## Testes Unitários
- [ ] **Deve** ...
- [ ] **Deve** ...

## Testes de Contrato (API)
- [ ] **Endpoint** `GET /api/v1/...`: Deve retornar o payload no formato X sem quebrar o contrato.

## Testes E2E (Integração)
- [ ] Fluxo feliz: ...
