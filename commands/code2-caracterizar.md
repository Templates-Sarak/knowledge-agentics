---
description: Fase 1 da adequação — constrói a rede de testes de caracterização nos módulos sem teste do backlog, capturando o comportamento ATUAL antes de qualquer refactor (de-risca a campanha e eleva a cobertura). Additivo (só cria testes, não refatora). Read-additivo sobre o source.
argument-hint: [alvo]
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# /code2-caracterizar — Fase 1: rede de segurança (testes de caracterização)

Alvo: **$1** (se vazio, use o backlog mais recente em `.sarak/audit/`).

Constrói a **rede de testes** dos módulos **sem teste** **antes** de qualquer refactor — para que a adequação
(Fase 2, `/code3-adequar`) possa provar que **nada mudou**. É **aditivo** (cria testes; **não** refatora código).
A lógica é da skill `code-adequacao` (`references/caracterizacao.md`) + `test-unitario` — aqui você orquestra.

## Passos

1. **Ler o backlog** — abra `.sarak/audit/backlog-<data>.json` (o mais recente, ou o do `$1`). Selecione os
   módulos com `cobertura: sem-testes` ou `parcial` e as tarefas com `precisaCaracterizacao: true`.

2. **HITL leve (escopo)** — liste os módulos a cobrir e confirme o escopo. Aditivo → sem HITL pesado.

3. **Caracterizar por módulo (um por vez)** — para cada módulo, siga `code-adequacao/references/caracterizacao.md`:
   - Teste pela **borda pública** (`api/`/funções públicas), **não** pelos internals (eles vão mudar no refactor).
   - Capture o **comportamento ATUAL** (caminho feliz, vazio, erro, limites) como o esperado — mesmo que imperfeito.
   - **Não corrija bug** aqui — se achar comportamento claramente errado, **registre como item à parte** (não conserte).
   - Ferramenta da stack via `test-unitario/references/ferramentas.md`; testes em `tests/` do módulo.
   - **Rode verde.** Verde = rede montada.

4. **Atualizar o backlog** — nas tarefas agora cobertas: `cobertura → ok|parcial`, `precisaCaracterizacao → false`.
   (Assim a Fase 2 sabe que a rede existe.)

5. **Reportar** — módulos cobertos, **cobertura antes/depois** (o gate `test-cobertura` se beneficia), e os
   **bugs registrados à parte** (que NÃO foram corrigidos). Indique o próximo passo: `/code3-adequar`.

## Limites
- **NÃO** refatore código-fonte — esta fase **só cria testes**. Refatorar é a Fase 2 (`/code3-adequar`).
- **NÃO** escreva o teste com o comportamento "ideal" — caracterização fixa o que o código **faz hoje**.
- **NÃO** teste internals que vão sumir no refactor — só a borda pública.
- **NÃO** corrija bug no meio — registre à parte; misturar quebra a premissa "preserva comportamento".
