---
name: cyber-dados
description: Proteção de dados e privacidade (LGPD) — inventário de PII, minimização, mascaramento em logs, cripto em trânsito/repouso, retenção e direitos do titular. Use ao auditar tratamento de dados pessoais. NÃO acione proativamente.
---

# Skill: Segurança — Dados & Privacidade (LGPD)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Garante que **dados pessoais** sejam tratados com cuidado e cifra: coletar o mínimo, proteger em trânsito
e repouso, não vazar PII em logs e respeitar a LGPD (consentimento, retenção, direitos do titular).
Domínio de **revisão/política**; mudanças são mutativas → HITL.

> Cripto **de senha** é da `cyber-auth`; **algoritmos fracos** no código, da `cyber-codigo`; **TLS/headers**,
> da `cyber-config`; varrer **logs por segredo/PII**, use o scanner da `cyber-segredos`. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao auditar tratamento de dados pessoais, antes de publicar sistema com dados de usuário, ou em conformidade LGPD.
- Mutativa (ajusta cifra/log/retenção) → HITL obrigatório.

## Workflow
Trate **um sistema por vez**. Checklist LGPD + padrões de PII em `references/lgpd-privacidade.md`.

1. **Inventário de PII** — mapeie quais dados pessoais o sistema coleta/armazena (nome, **CPF/CNPJ**, e-mail, telefone, endereço, e **dados sensíveis** LGPD: saúde, biometria, etc.) e onde (banco, logs, cache, terceiros).
2. **Minimização** — coletar/armazenar só o necessário; não persistir o que não usa; não logar PII.
3. **Criptografia** — **em trânsito** (TLS — ver `cyber-config`) e **em repouso** (campos sensíveis cifrados no banco; chaves no `.env`/KMS, não hardcoded — ver `cyber-segredos`).
4. **Mascaramento em logs** — CPF/e-mail/cartão **mascarados** (ex.: `123.***.**9-00`); rode o scanner da `cyber-segredos` em `logs/` para confirmar que não há PII/segredo crú.
5. **Retenção & direitos** — política de retenção (apagar quando não precisa); suportar direitos do titular (acesso, correção, **exclusão**, portabilidade).
6. **Consentimento & base legal** — coleta com base legal/consentimento explícito; finalidade declarada.
7. **Log de eventos de segurança** — registrar login/falha/mudança de permissão/acesso a dado sensível (sem PII/segredo no log).
8. **HITL + reportar** — plano de ajustes → confirmar → aplicar → reportar (no `relatorio_seguranca.md` da `cyber-config`).

## Regras e limites
- **NUNCA** logue PII em texto claro (CPF, e-mail, cartão, token) — **mascare**; log é dado também.
- **NUNCA** armazene dado pessoal sensível **sem cifra em repouso**; chaves de cifra no `.env`/KMS, nunca hardcoded.
- **NÃO** colete/retenha dado pessoal sem **finalidade e base legal**; minimize sempre.
- **NÃO** ignore os **direitos do titular** (acesso/correção/exclusão/portabilidade) — o sistema precisa suportá-los.
- **NÃO** aplique mudanças sem o HITL do passo 8.
- **NÃO** saia do escopo: senha → `cyber-auth`; algoritmo fraco no código → `cyber-codigo`; TLS/headers → `cyber-config`; segredo/chave → `cyber-segredos`.

## Checklist "pronta"
- [ ] Inventário de PII feito (o quê, onde, sensível ou não)?
- [ ] Minimização aplicada (coleta/retém só o necessário; não loga PII)?
- [ ] Cifra em trânsito (TLS) e em repouso (campos sensíveis) com chave no `.env`/KMS?
- [ ] PII mascarada em logs (confirmado com o scanner da `cyber-segredos`)?
- [ ] Retenção definida e direitos do titular suportados?
- [ ] Consentimento/base legal e finalidade declarados?
- [ ] Eventos de segurança logados (sem PII/segredo); HITL feito; reportado?

## Referências (Camada 3 — leia sob demanda)
- `references/lgpd-privacidade.md` — checklist LGPD, padrões de PII (CPF/CNPJ/e-mail/telefone/cartão), mascaramento, retenção e direitos do titular.
