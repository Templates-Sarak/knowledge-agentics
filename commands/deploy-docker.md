---
description: Containeriza um projeto via o fluxo da skill deploy-docker-monolito (monólito modular composto, padrão) ou deploy-docker-microsservico (módulo extraído) — Dockerfile multi-stage, não-root, healthcheck, compose, sem segredo na imagem, com HITL antes de build/push. Mutativo.
argument-hint: [alvo] [monolito|microsservico]
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# /deploy-docker — containerizar (roteia, depois build → push)

Alvo: **$1** (projeto ou módulo; se vazio, o diretório atual `.`). Modo opcional: **$2**.

Este command **roteia** entre duas skills e mantém o HITL; a lógica vive nelas. É **mutativo**
(constrói/publica imagem) → HITL antes de build/push.

## Roteamento
1. **Detecte** no alvo: `project.json` **e** `modules/` ⇒ **monólito modular composto** →
   skill **`deploy-docker-monolito`** (padrão). Um módulo solto (um `module.json` sem `project.json` pai, ou
   o pedido explícito de "1 módulo = 1 imagem") ⇒ skill **`deploy-docker-microsservico`**.
2. **Em dúvida, pergunte** — "monólito composto (uma imagem de backend + front) ou módulo extraído
   (1 módulo = 1 imagem)?" — e **aguarde**. Se `$2` foi dado, ele decide.

## Passos (da skill escolhida)
1. **Pré-deploy comum** — `../deploy-vercel/references/predeploy-comum.md` (build local, env, sem segredo versionado).
2. **Arquivos** — siga o workflow da skill. **Projeto do template:** os arquivos (Dockerfile multi-stage,
   `front.Dockerfile`, `.dockerignore`, `compose.yml`, `deploy/`) já nasceram com o `create-project` — confira
   e ajuste, **não copie**. **Legado:** a fonte é `specs/_estrutura_modulos/bindings/<binding>/root/`. Módulo
   extraído: Dockerfile multi-stage (versão fixada, não-root, `HEALTHCHECK`) pela skill dele.
3. **Validar** — projeto do template: `node tools/gate/validate.mjs --all` (o gate cobra a presença e as
   variáveis do compose). Legado, ou arquivo do template ajustado:
   `deploy-docker-monolito/scripts/validate_monolith.py --root $1` **e**
   `deploy-docker-microsservico/scripts/validate_docker.py --root $1`; módulo extraído: só o segundo.
   Resolva os bloqueios.
4. **Paridade local** — suba o compose (monólito: `node tools/docker-up.mjs up`, que passa os dois
   `--env-file` — `.env` e `deploy/.env` — e exige Compose 2.23+) e confira o healthcheck verde.
5. **HITL — plano de build/push** — o que será construído (monólito: as **duas imagens com a mesma tag de
   commit**), bases fixadas, validação, tag **semântica** (sem `latest`), registry →
   **"⚠️ Confirma o build/push da imagem?"** → aguarde.
6. **Build + push + digests** — `docker build` → healthcheck → `docker push` → registre os **digests**.
7. **Produção (monólito, sob novo HITL)** — compose de produção por digest; entrada e registry escolhidos ali.

## Limites
- **NUNCA** segredo na imagem (sem `COPY .env`, sem segredo em `ARG`/`ENV`); **NUNCA** tag `:latest`.
- **NÃO** rode como **root**; **NÃO** rode TS do fonte em produção (artefato emitido, `start:prod`).
- **NÃO** junte vários módulos extraídos numa mesma imagem; **NÃO** sirva o front de dentro do backend.
- **NÃO** builde/publique sem o HITL do passo 5 nem sem validar o healthcheck.
- **NÃO** saia do escopo: deploy serverless → `deploy-vercel`; autoria/licença/docs → `/code-entregar`.
