---
name: code-auditoria-padrao
description: Gatekeeper operacional que invoca motores de validação de AST da linguagem para garantir conformidade imediata. Use obrigatoriamente no final de tarefas de escrita/refatoração antes de declarar conclusão.
---

# Skill: Auditoria Contínua de Padrões

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-a antes de iniciar. Os motores de AST residem nas skills de stack correspondentes (ex: `padrao-typescript`, `padrao-python`).

Orquestrador comportamental que atua como **Gatekeeper**. Ela garante que as diretrizes do ecossistema Sarak foram estritamente seguidas ao submeter código novo ou modificado a scripts de validação estática.

## Quando usar
- Obrigatoriamente e proativamente ao finalizar a implementação ou refatoração de um arquivo/módulo.
- Antes de entregar uma tarefa ao usuário (para atestar zero dívida técnica na entrega).

## Workflow
Trate **um módulo ou escopo de arquivos por vez**.

1. **Identificar a Linguagem/Stack** — determine qual a linguagem principal do repositório/módulo sendo trabalhado (ex: TypeScript, Python, Go).
2. **Acionar o Motor de AST** — execute o script de validação de código contido na respectiva skill da stack nos arquivos afetados (ex: rode o `.agents/skills/padrao-typescript/scripts/validate.mjs` ou script equivalente configurado). _(detalhe em `references/workflow.md`)_
3. **Avaliar o Exit Code (Gatekeeper)** — **Obrigatório:** se o comando falhar (Exit Code > 0) ou apresentar infrações (SRP, hardcoded, funções > 40 linhas, imports ilegais), o processo não avança.
4. **Corrigir Infrações** — leia as falhas apontadas pelo validador, corrija todas imediatamente no código-fonte. Não apresente as falhas ao usuário; resolva-as de forma autônoma.
5. **Revalidar** — volte ao passo 2 e repita até que o validador retorne Exit Code 0. Só então sinalize a conclusão da tarefa ao usuário.

## Regras e limites
- **NÃO** finalize a tarefa ou entregue o código sem rodar o motor de validação da respectiva stack.
- **NUNCA** ignore o resultado do validador. Exit > 0 significa código imperfeito; você é obrigado a corrigir as violações apontadas.
- **NÃO** crie parsers/scripts dentro desta skill — ela é uma orquestradora. A mecânica de validação de AST pertence às skills de stack (`padrao-[linguagem]`).
- **NUNCA** delegue ao usuário a correção das falhas mecânicas; se o validador falhar, assuma a responsabilidade e faça os ajustes no código (exceto em impasses arquiteturais complexos, onde o HITL é justificado).

## Checklist "pronta"
- [ ] O script de validação da stack correta foi executado nos arquivos modificados?
- [ ] O script de validação retornou Exit Code 0 (Zero violações)?
- [ ] Todas as infrações reportadas (se houveram) foram corrigidas de forma autônoma antes da entrega?

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — workflow detalhado de orquestração e bloqueio (exit code) com exemplos de tratamento de falhas.
