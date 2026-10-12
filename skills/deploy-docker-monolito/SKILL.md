---
name: deploy-docker-monolito
description: Containeriza um monólito modular composto (projeto do template de módulos) — uma imagem de backend, uma imagem de front separada em origem única, compose local com profiles e molde de produção por digest, sem segredo na imagem. No projeto do template os arquivos já nascem gerados (a skill confere e ajusta); no legado, parte dos arquivos do binding. Use ao conteinerizar um projeto com project.json e modules/*/module.json. NÃO acione proativamente.
---

# Skill: Deploy Docker — monólito modular composto

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Leva o **monólito modular composto** — um processo, uma porta, vários módulos montados sob
`/api/v1/<módulo>` — a **duas imagens** (backend e front), um compose local e um molde de produção.
Módulo **extraído** (1 módulo = 1 imagem) → `deploy-docker-microsservico`. É **mutativa** (ajusta arquivos,
builda e publica imagem) → HITL antes de build/push.

> **A doutrina é do template, não desta skill** (ADR-022): os arquivos de container vivem em
> `specs/_estrutura_modulos/bindings/<binding>/root/` e **todo projeto gerado por `create-project` já os
> traz**. Esta skill os **consome**: aponta para eles, não mantém cópia. O que é só dela é o que muda por
> provedor — o compose de **produção** por digest, a entrada e o registry. Lei:
> `specs/_estrutura_modulos/doutrina/03-operacao.md` §9.5; catálogo: `04-regras.md`
> (`container-present`, `compose-variables-declared`). Pré-deploy comum:
> `../deploy-vercel/references/predeploy-comum.md`.

## Quando usar
- Projeto com `project.json` + `modules/*/module.json` (template de módulos), ou monólito composto legado.
- Para conferir/ajustar Dockerfile, compose ou molde de produção desse projeto, e para publicar.
- Sob demanda; nunca proativa.

## Qual é o caso (a detecção decide a origem dos arquivos)

| Caso | Como reconhecer | De onde vêm os arquivos |
|---|---|---|
| **A — projeto do template** | tem `Dockerfile`, `compose.yml`, `deploy/` e `config/deploy.json` na raiz | já estão no projeto, gerados pelo `create-project`. **Confira e ajuste**; não copie nada de lugar nenhum |
| **B — projeto do template anterior ao ADR-022** | tem `project.json` + `modules/` e **não** tem os arquivos de container | `specs/_estrutura_modulos/bindings/<binding>/root/` (+ `tools/docker-up.mjs` e `tools/sync-deploy.mjs`) — a adoção entra por **plan**, não por esta skill (ver `meta-propagar-base`) |
| **C — monólito composto legado** (fora do template) | sem `project.json`/`module.json` | os mesmos arquivos de `bindings/<binding>/root/`, como ponto de partida a ajustar |

A base instalada como plugin leva `specs/` para os três provedores (`plugin/sync_ide.py`:
`SUBPASTAS_DO_PLUGIN`), então o caminho `../../specs/_estrutura_modulos/` vale a partir desta skill.

## Workflow
Trate **um projeto por vez**. O porquê de cada peça está em `references/`.

1. **Pré-deploy comum** — siga `../deploy-vercel/references/predeploy-comum.md` (build local verde, env em
   `.env.example`, sem segredo versionado). Resolva os alertas antes de avançar.
2. **Detecção** — `Glob`/`Read` em `project.json`, `modules/*/module.json`, `config/runtime.json`,
   `config/deploy.json`: caso (A/B/C), binding, módulos com `webPath` não-nulo, dependências nativas
   (argon2, bcrypt, sharp…), sidecars, `ROOT_API_PORT` e a rota `<basePath>/health`. Registre o que achou.
3. **Os arquivos**
   - **A** — leia o `Dockerfile`, o `compose.yml` e `deploy/nginx.conf` que o template gerou e ajuste o que o
     projeto precisa (dependência nativa → o bloco comentado do `Dockerfile`; CSP; sidecar). Rode
     `node tools/sync-deploy.mjs --check`: as rotas do front e a URL do banco **são geradas** dos manifestos
     (nada de `location` à mão). `references/padrao-imagem.md`, `references/front-origem-unica.md`.
   - **B/C** — copie de `bindings/<binding>/root/`: `Dockerfile`, `.dockerignore`, `compose.yml`,
     `deploy/.env.example`, `config/deploy.json` e, em TS/JS, `front.Dockerfile` e `deploy/nginx.conf`; de
     `tools/`, `docker-up.mjs` e `sync-deploy.mjs`. Troque `<project>` pelo nome do projeto e rode
     `node tools/sync-deploy.mjs`. Legado **sem** `module.json`/`config/runtime.json`: escreva à mão as duas
     peças geradas (formato em `references/front-origem-unica.md` e `compose-local.md`).
4. **Ambiente que só o compose lê** — `deploy/.env` (real, gitignored) a partir de `deploy/.env.example`,
   **fora** do `.env` da raiz (ADR-022). `references/compose-local.md`.
5. **Validar** — projeto do template: `node tools/gate/validate.mjs --all` (o gate cobra presença e variáveis
   do compose). **Legado — e qualquer ajuste que você tenha feito nos arquivos do template**:
   `python ../deploy-docker-microsservico/scripts/validate_docker.py --root <projeto>` (não-root, sem
   `:latest`, sem segredo em build) **e** `python scripts/validate_monolith.py --root <projeto>` (multi-stage,
   HEALTHCHECK, rótulo, sem `COPY . .` final, front, loopback, digest). Resolva os bloqueios.
6. **Paridade local** — `node tools/docker-up.mjs up` (`npm run docker:up`; Python:
   `python verify.py --docker up`): builda, sobe o profile `app` com `--wait` e imprime a URL. Confira
   `/` → 404, `/healthz` → 200 e `<basePath>/health` → 200 **pela origem única do front**.
7. **HITL — plano de build/push** — apresente: as **duas imagens com a mesma tag de commit**, bases
   fixadas, resultado da validação, registry de destino, **sem `latest`**. → "⚠️ Confirma o build/push?".
   **Aguarde.**
8. **Build + push + digests** — `docker build --build-arg IMAGE_VERSION=<commit>` nas duas; `docker push`;
   **registre os digests** (`sha256:…`) que o registry devolveu.
9. **Compose de produção (HITL)** — `assets/compose.production.yml` com os digests; a **entrada** (túnel,
   Caddy ou Traefik) e o registry são escolhidos aqui. O `stop_grace_period` **não se inventa**: é o que o
   `sync-deploy` já calculou (`drainTimeoutMs` + folga) em `deploy/compose.modules.yml`.
   `references/producao.md`.

## Regras e limites
- **NÃO** faça mais de **uma imagem de backend** para o monólito — o processo composto é uma unidade.
- **NUNCA** sirva o front de dentro do processo do backend — `web/` é publicado por fora (§4.4).
- **NUNCA** ponha segredo na imagem (`COPY .env`, segredo em `ARG`/`ENV`) — `.env` entra só em runtime.
- **NUNCA** use `:latest` (base ou publicação) — versão fixa; em produção, digest.
- **NÃO** rode o fonte TS em produção (`tsx`, `--experimental-transform-types`) — rode o artefato emitido.
- **NÃO** escreva lista de `COPY` por módulo nem `location` por módulo à mão — o artefato vem de
  `tools/package.mjs` e as rotas de `tools/sync-deploy.mjs`.
- **NÃO** mantenha cópia dos arquivos do template nesta skill — a fonte é `bindings/<binding>/root/`.
- **NÃO** dê valor padrão a variável de infraestrutura (`${PORTA:-3000}`) — use `${VAR:?mensagem}`.
- **NÃO** builde/publique sem o HITL do passo 7, nem trate "buildou" como "funciona" — valide o healthcheck.
- **NÃO** saia do escopo: módulo extraído é `deploy-docker-microsservico`; serverless é `deploy-vercel`;
  autoria/licença/docs são `code-entrega`; segredo vazado é `cyber-segredos`.

## Checklist "pronta"
- [ ] Caso (A/B/C) e detecção (binding, `webPath`, nativas, sidecars, porta, health) registrados?
- [ ] **Uma** imagem de backend: multi-stage, base fixada, não-root, `HEALTHCHECK`, `LABEL …revision`?
- [ ] Artefato sem `COPY . .` final, sem `tsx`, sem lista de `COPY` por módulo?
- [ ] Front em imagem própria (`nginx-unprivileged` fixa), `location` **geradas** (`sync-deploy --check`
      verde), sem catch-all em `/`?
- [ ] `compose.yml`: portas só em `127.0.0.1`, infra com `:?`, `DEPLOY_*` em `deploy/.env`, `ROOT_API_HOST`
      sobrescrito no serviço `app`, profile `app` sobe verde com `--wait`?
- [ ] `.dockerignore` cobre `.env*` (com `!.env.example`), `node_modules`, `dist`, `.git`, `tests`, `specs`?
- [ ] Gate verde (template) ou `validate_docker.py` e `validate_monolith.py` sem bloqueios (legado/ajustado)?
- [ ] HITL feito; as duas imagens com a mesma tag; digests registrados; produção sem portas, por digest, com
      `stop_grace_period` derivado do teto de desligamento?

## Referências (Camada 3 — leia sob demanda)
- `references/padrao-imagem.md` — o Dockerfile por binding, os estágios, dependência nativa, env e health.
- `references/front-origem-unica.md` — nginx, origem única, as `location` geradas dos `webPath`.
- `references/compose-local.md` — os dois usos do compose, `deploy/.env`, `docker-up.mjs`, variante `additional_contexts`.
- `references/producao.md` — molde de produção, entrada e registry no HITL, variante Supabase local.
- `assets/compose.production.yml` — **o único asset**: o molde de produção por digest (por provedor, por isso
  é da skill). Os demais arquivos são do template: `../../specs/_estrutura_modulos/bindings/<binding>/root/`.
- `scripts/validate_monolith.py` + `scripts/config.json` — validação determinística do empacotamento do monólito
  **legado** (`--selftest` registrado em `specs/_estrutura_modulos/tests/run-all-selftests.mjs`).
- `../deploy-docker-microsservico/scripts/validate_docker.py` — o validador genérico, reutilizado por referência.
