---
name: test-e2e
description: Escreve testes ponta-a-ponta dos fluxos críticos — UI (Playwright/Cypress) e API — contra ambiente próprio. Use ao cobrir jornadas críticas (login, checkout) ou validar integração ponta-a-ponta; ≠ lógica isolada (test-unitario).
---

# Skill: Testes End-to-End (E2E)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Valida **jornadas completas do usuário** atravessando UI → API → dados, como um usuário real faria. São o
**topo da pirâmide**: poucos, focados nos fluxos que **não podem quebrar**. Rodam contra ambiente
**próprio** (local/staging). Aditiva → confirme só o escopo (quais fluxos).

> Unit/integração é da `test-unitario` (base da pirâmide). E2E é caro e lento — cubra só o crítico.
> Premissa: web (UI) e/ou API HTTP. Princípios globais em `CLAUDE.md`.

## Quando usar
- Para cobrir jornadas críticas (login, cadastro, checkout, fluxo principal do produto), antes de publicar, ou ao validar integração ponta-a-ponta.
- Roda contra **ambiente próprio** (local/staging) — nunca produção de terceiros.

## Workflow
Trate **um fluxo por vez**. Foque nos caminhos que geram valor/risco.

1. **Mapear fluxos críticos** — liste as 3–7 jornadas que **não podem quebrar** (não tente cobrir tudo — e2e é caro).
2. **Escolher a ferramenta** — UI: **Playwright** (preferido) ou Cypress; API pura: cliente HTTP (supertest/httpx/requests).
3. **Escrever o cenário** — do ponto de vista do usuário (clicar, preencher, navegar / chamar endpoint); **seletores estáveis** (`data-testid`, role), não CSS frágil.
4. **Dados & ambiente** — ambiente próprio (local/staging), **dados de teste isolados** (seed/teardown); não depender de dado de produção.
5. **Rodar** — execute headless; investigue flaky (espera explícita por estado, não `sleep`).
6. **Reportar** — fluxos cobertos, falhas e screenshots/trace dos que quebraram.

## Regras e limites
- **NUNCA** rode e2e contra **produção de terceiros** — só ambiente próprio/autorizado (local/staging).
- **NÃO** cubra lógica isolada com e2e (lento/frágil) — isso é `test-unitario`; e2e só para a **jornada**.
- **NÃO** use `sleep`/tempo fixo — espere por **estado/elemento** (auto-wait); e2e flaky é pior que sem e2e.
- **NÃO** dependa de dados de produção nem de ordem entre testes — seed/teardown isolados.
- **NÃO** use seletor frágil (classe CSS/texto volátil) — `data-testid`/role estáveis.
- **NÃO** saia do escopo: unidade/integração → `test-unitario`; teste de carga → (futuro `test-carga`).

## Checklist "pronta"
- [ ] Só os fluxos **críticos** cobertos (não tudo)?
- [ ] Roda contra ambiente próprio (local/staging) com dados isolados?
- [ ] Seletores estáveis (`data-testid`/role); sem `sleep` (auto-wait)?
- [ ] Sem dependência de produção nem de ordem entre testes?
- [ ] Fluxos cobertos e falhas (com trace/screenshot) reportados?

## Referências (Camada 3 — leia sob demanda)
- `references/e2e.md` — Playwright/Cypress (UI) e e2e de API; seletores estáveis, dados/ambiente, anti-flaky.
