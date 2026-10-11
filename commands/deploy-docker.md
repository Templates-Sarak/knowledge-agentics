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
2. **Gerar** — siga o workflow da skill: Dockerfile multi-stage (versão fixada, não-root, `HEALTHCHECK`);
   no monólito, também `front.Dockerfile` + `nginx.conf`, `.dockerignore`, `compose.yml` local e script de subida.
3. **Validar** — monólito: `deploy-docker-monolito/scripts/validar_monolito.py --raiz $1` **e**
   `deploy-docker-microsservico/scripts/validar_docker.py --raiz $1`; módulo extraído: só o segundo.
   Resolva os bloqueios.
4. **Paridade local** — suba o compose (monólito: `docker compose --env-file .env --env-file
   <INFRA_DIR>/.env --profile app up --build --wait`, Compose 2.23+) e confira o healthcheck verde.
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
