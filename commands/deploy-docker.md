---
description: Containeriza um app/módulo (qualquer stack) via o fluxo da skill deploy-docker — Dockerfile multi-stage, não-root, .dockerignore, healthcheck e compose, sem segredo na imagem, com HITL antes de build/push. Mutativo.
argument-hint: [módulo|alvo]
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# /deploy-docker — containerizar (build → push)

Alvo: **$1** (módulo ou app; se vazio, o diretório atual `.`).

Dispara o fluxo da skill **`deploy-docker`** para gerar uma imagem **enxuta, segura e reproduzível** (1 container
por módulo, microservice-ready). É **mutativo** (constrói/publica imagem) → HITL antes de build/push.

## Passos (skill `deploy-docker`)
1. **Pré-deploy comum** — `../deploy-vercel/references/predeploy-comum.md` (build local, env, sem segredo versionado).
2. **Dockerfile multi-stage** — escolha a base/template por stack (`references/docker-stacks.md`,
   `assets/docker-templates/`): **versão fixada** (sem `:latest`), runtime mínimo, **usuário não-root**,
   porta via `ENV`, `HEALTHCHECK`. **Nunca** `COPY .env` nem segredo em `ARG`/`ENV` de build.
3. **`.dockerignore`** — cubra `.git`/`.env*`/artefatos/`tests`.
4. **`docker-compose`** — **um serviço por módulo**, `env_file: .env` (sem valor inline).
5. **Validar** — `python skills/deploy-docker/scripts/validar_docker.py --raiz $1` (não-root, sem `:latest`, sem segredo). Resolva os alertas.
6. **HITL — plano de build/push** — módulo, base fixada, validação, tag **semântica** (sem `latest`), registry → **"⚠️ Confirma o build/push da imagem?"** → aguarde.
7. **Build + push** — `docker build` → suba o container e valide o **healthcheck** → `docker push`. Documente imagem/tag/porta/env.

## Limites
- **NUNCA** segredo na imagem (sem `COPY .env`, sem segredo em `ARG`/`ENV`); **NUNCA** tag `:latest`.
- **NÃO** rode como **root**; **NÃO** junte vários módulos num container (1 módulo = 1 imagem).
- **NÃO** builde/publique sem o HITL do passo 6 nem sem validar o healthcheck.
- **NÃO** saia do escopo: deploy serverless → `deploy-vercel`; autoria/licença/docs → `code-entrega`.
