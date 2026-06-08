---
name: code-adequacao
description: Adequa código legado ao padrao-escrita de forma segura e incremental — um item por vez, com rede de testes de caracterização antes de refatorar, preservando comportamento. Use APENAS quando pedirem adequação/refatoração de conformidade. NÃO acione proativamente.
---

# Skill: Adequação de Código Legado

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita, code-diagnostico`. Consulte-as antes de iniciar.

Pega código fora do padrão e o traz à conformidade com `padrao-escrita`, **um item por vez** e com
rede de segurança — porque legado geralmente não tem testes e refatorar às cegas quebra comportamento.

> O padrão-alvo vive em `padrao-escrita` (`SKILL.md` + `references/PADRAO-ORGANIZACAO.md`) e nos
> inegociáveis do `CLAUDE.md`. Esta skill **aplica** esse padrão — não o redefine. O diagnóstico/backlog
> vem da `code-diagnostico`.

## Quando usar
- Sob demanda, para adequar um módulo/arquivo legado (avulso ou vindo do backlog do diagnóstico).
- Como passo "por item" de uma orquestração de adequação.
- É mutativa → passo HITL obrigatório antes de qualquer alteração.

## Workflow
Trate **um item por vez** (um módulo; dentro dele, arquivo a arquivo). Não avance sem concluir o atual.

1. **Selecionar o item** — pegue UM item do backlog (ou indicado). Leia o item e suas violações.
2. **Detectar/confirmar violações** — confirme as violações no código atual (do backlog ou via leitura), mapeando cada uma à regra de `padrao-escrita`.
3. **Rede de segurança (caracterização)** — se **não há teste** cobrindo o comportamento do item: escreva **testes de caracterização** que capturam o comportamento **atual** (não o ideal); rode e confirme verdes. Se já há testes, use-os. _(estratégia em `references/caracterizacao.md`)_
4. **HITL — Plano de Refatoração** — apresente: o que será mudado / por quê / como / risco / o que os testes protegem. **Aguarde confirmação.**
5. **Refatorar** — aplique `padrao-escrita` ao item **preservando comportamento** (extrair config para `config.json`/`.env`, quebrar função, guard clauses, expor via `api/`, prefixar tabela, ajustar rota/casing). Mudanças pequenas e seguidas.
6. **Verificar** — rode os testes (caracterização + existentes). **Verde = aceita; vermelho = reverte e reavalia.** Nunca aceite item com teste falhando.
7. **Reportar** — resultado do item (conforme/parcial/pulado + o que mudou) para a orquestração marcar feito/pendente.

> Antes/depois por dimensão de violação em `references/examples.md`.

> **Em escala:** a campanha de adequação é orquestrada pelo command `/code3-adequar` (roteia cada tarefa pelo
> `risco`: baixo/médio → agente `code-adequador`; alto → thread principal com HITL), com a **rede de testes
> construída antes** por `/code2-caracterizar`, **reconciliação entre ondas** reusando o agente `code-auditor`, e
> o **log append-only** em `.sarak/adequacao_update.md` (template em `assets/`). Esta skill é a **lógica por item**.

## Regras e limites
- **NUNCA** refatore sem rede de testes — sem suíte, escreva caracterização **antes** (passo 3).
- **NUNCA** altere comportamento durante a adequação — é refatoração (estrutura), não correção de bug; bug vira item à parte.
- **NÃO** prossiga sem o HITL do passo 4 — toda mutação precisa de confirmação explícita.
- **NÃO** trate mais de um item por vez — um módulo/arquivo de cada vez, para manter a verificação isolada.
- **NÃO** aceite item com teste vermelho — reverta a mudança e reavalie.
- **NÃO** redefina o padrão — em dúvida, leia `padrao-escrita`, não improvise.
- **NÃO** saia do escopo: diagnóstico amplo é da `code-diagnostico`; aqui se adequa o item já identificado.

## Checklist "pronta" (por item)
- [ ] Há testes verdes cobrindo o item **antes** de refatorar (caracterização ou existentes)?
- [ ] O Plano de Refatoração foi apresentado e confirmado (HITL)?
- [ ] A refatoração preservou o comportamento (sem mudança funcional intencional)?
- [ ] Todas as violações do item foram resolvidas conforme `padrao-escrita`?
- [ ] Testes verdes ao final?
- [ ] Resultado do item reportado (conforme/parcial/pulado)?

## Referências (Camada 3 — leia sob demanda)
- `references/caracterizacao.md` — como escrever testes de caracterização quando não há suíte.
- `references/examples.md` — adequação de item bem-feita (com rede) × malfeita (refatorou às cegas).
- `assets/adequacao_update.template.md` — log append-only da campanha (persiste em `.sarak/adequacao_update.md`).
