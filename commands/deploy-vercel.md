---
description: Prepara e publica um projeto na Vercel (qualquer stack) via o fluxo da skill deploy-vercel — pré-deploy, vercel.json por stack, env por CLI e publicação preview→produção, com HITL. Mutativo (publica).
argument-hint: [projeto]
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# /deploy-vercel — publicar na Vercel (preview → produção)

Projeto: **$1** (se vazio, o diretório atual `.`).

Dispara o fluxo da skill **`deploy-vercel`** para levar o projeto a um deploy **sem surpresas**. É **mutativo**
(publica) → HITL obrigatório antes do `--prod`. A lógica está na skill; aqui você orquestra.

## Passos (skill `deploy-vercel`)
1. **Pré-deploy comum** — `references/predeploy-comum.md` + `python skills/deploy-vercel/scripts/validar_predeploy.py --raiz $1`
   (config de build, env no `.env.example`, sem segredo versionado). Resolva os alertas.
2. **`vercel.json` por stack** — identifique a stack (`Glob`) e valide/crie o mínimo (`references/vercel-stacks.md`,
   templates em `assets/vercel-templates/`). **Nunca** segredo no `vercel.json`.
3. **Env vars** — compare `.env.example` com `vercel env ls`; liste as ausentes por ambiente.
4. **Build local (bloqueante)** — rode o build; falhou → corrija antes de seguir.
5. **HITL — plano de deploy** — branch, ambiente, status de env, build local, o que mudou → **"⚠️ Confirma o deploy?"** → aguarde.
6. **Publicar** — `vercel deploy` (preview) → validar a URL → `vercel deploy --prod`.
7. **Pós-deploy** — acesse a URL, valide os fluxos, cheque Function Logs; documente URL/ambiente/vars.

## Limites
- **NUNCA** `--prod` sem validar preview antes, nem sem o HITL do passo 5.
- **NUNCA** segredo no `vercel.json`/arquivo versionado — só no painel/CLI.
- **NÃO** avance com build local quebrado (passo 4 é bloqueante).
- **NÃO** saia do escopo: autoria/licença/docs → `code-entrega`; faxina → `code-limpeza-projeto`.
