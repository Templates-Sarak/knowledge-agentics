---
name: deploy-vercel
description: Prepara e publica um projeto na Vercel (qualquer stack) sem erros — pré-deploy comum, vercel.json por stack e publicação via CLI (preview antes de production), com HITL. Use quando pedirem deploy/publicação na Vercel ou configurar vercel.json. NÃO acione proativamente.
---

# Skill: Deploy Vercel

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Leva um projeto a um deploy **sem surpresas** na Vercel: previne falhas auditando configuração, variáveis,
dependências e build **antes** de publicar, e só então publica via CLI — preview primeiro, production depois,
com confirmação do usuário. É **mutativa** (publica) → HITL obrigatório antes do deploy de produção.

> Princípios globais em `CLAUDE.md`. O **pré-deploy comum** (build/env/segredos/deps) está em
> `references/predeploy-comum.md` e é **reutilizável pelos futuros `deploy-*`** — aqui o corpo cobre só o
> que é específico da Vercel. Antes da entrega, rode `code-entrega` (autoria + licença + documentação).

## Quando usar
- Sob demanda, antes de um deploy de produção ou preview na Vercel; ao integrar um projeto novo ao pipeline Vercel.
- Após mudanças em env vars, dependências ou configuração de build.
- Mutativa → passo HITL obrigatório antes do `--prod`.

## Workflow
Trate **um projeto por vez**. Detalhe da Vercel em `references/vercel-stacks.md`; checklist genérico em `references/predeploy-comum.md`.

1. **Pré-deploy comum** — siga `references/predeploy-comum.md` e rode `python scripts/validar_predeploy.py --raiz <projeto>` (JSON: config de build presente, env exigidas no `.env.example`, segredos versionados). Resolva os alertas antes de avançar.
2. **Config Vercel por stack** — identifique a stack (`Glob`) e valide/crie o `vercel.json` mínimo (templates em `assets/vercel-templates/`; tabela stack→config + compatibilidade em `references/vercel-stacks.md`). Next.js usa `next.config.*`; SPA precisa de `rewrites`; Python usa `@vercel/python`.
3. **Env vars via CLI** — compare o `.env.example` com o que está na Vercel usando `vercel env ls` (ou `vercel pull` para baixar). Liste as ausentes por ambiente (production/preview/development). **Nunca** ponha valor real no `vercel.json` — só no painel/CLI.
4. **Build local (bloqueante)** — rode o build (`npm run build`, ou startup `uvicorn main:app` p/ Python). Falhou → corrija antes de seguir.
5. **HITL — plano de deploy** — apresente: branch, ambiente, status de env vars, build local, o que mudou. → "⚠️ Confirma o deploy?". **Aguarde.**
6. **Publicar** — `vercel deploy` (preview) → validar a URL → `vercel deploy --prod` (production). Monitore a saída; erro de build no lado da Vercel → leia o log e volte ao passo correspondente.
7. **Pós-deploy** — acesse a URL e valide os fluxos principais; cheque os Function Logs por erros de runtime; confirme que as env vars são lidas. Documente URL/ambiente/variáveis na conclusão.

## Regras e limites
- **NUNCA** faça deploy para production sem antes validar em preview — a sequência é build local → preview → production.
- **NUNCA** coloque segredo no `vercel.json` ou em arquivo versionado — valores reais só no painel/CLI da Vercel.
- **NÃO** avance com build local quebrado (passo 4 é bloqueante) — deploy com build quebrado sempre falha.
- **NÃO** ignore warnings de deps incompatíveis com serverless (binário nativo, escrita em filesystem) — o ambiente é imutável.
- **NÃO** rode `vercel deploy --prod` sem o HITL do passo 5.
- **NÃO** considere "publicado com sucesso" na CLI como app funcionando — o passo 7 (pós-deploy) é obrigatório.
- **NÃO** saia do escopo: autoria/licença/documentação é da `code-entrega`; faxina é da `code-limpeza-projeto`. Aqui só se valida e publica na Vercel.

## Checklist "pronta"
- [ ] Pré-deploy comum ok (build local verde, env declaradas, sem segredo versionado, deps compatíveis)?
- [ ] `vercel.json`/`next.config.*` presente e correto para a stack?
- [ ] Env vars comparadas via `vercel env ls` e pendências resolvidas?
- [ ] HITL apresentado e deploy confirmado pelo usuário?
- [ ] Deploy de preview validado **antes** do production?
- [ ] Function Logs verificados e URL de produção respondendo?
- [ ] URL/ambiente/variáveis documentados na conclusão?

## Referências (Camada 3 — leia sob demanda)
- `references/predeploy-comum.md` — checklist genérico de pré-deploy, reutilizável por qualquer `deploy-*`.
- `references/vercel-stacks.md` — tabela stack→`vercel.json`, mínimos por stack e notas de compatibilidade serverless.
- `scripts/validar_predeploy.py` + `scripts/config.json` — validação determinística de pré-deploy (listas no config).
- `assets/vercel-templates/` — `vercel.json` copiável por stack (`spa`, `fastapi`, `monorepo`).
