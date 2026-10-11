---
name: deploy-docker-monolito
description: Containeriza um monólito modular composto (projeto do template de módulos) — uma imagem de backend, uma imagem de front separada em origem única, compose local com profiles e molde de produção por digest, sem segredo na imagem. Use ao conteinerizar um projeto com project.json e modules/*/module.json. NÃO acione proativamente.
---

# Skill: Deploy Docker — monólito modular composto

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Leva o **monólito modular composto** — um processo, uma porta, vários módulos montados sob
`/api/v1/<módulo>` — a **duas imagens** (backend e front), um compose local e um molde de produção.
Módulo **extraído** (1 módulo = 1 imagem) → `deploy-docker-microsservico`. É **mutativa** (gera arquivos,
builda e publica imagem) → HITL antes de build/push.

> A doutrina do template: front publicado **por fora** do processo (`00-arquitetura` §4.4), artefato por
> `node tools/package.mjs <destino>` (`03-operacao` §9.1), `.env` único da raiz (ADR-004). O catálogo
> normativo é o `04-regras.md`. O pré-deploy comum está em `../deploy-vercel/references/predeploy-comum.md`.

## Quando usar
- Projeto com `project.json` + `modules/*/module.json` (template de módulos), ou monólito composto legado.
- Para escrever/auditar Dockerfile, compose ou molde de produção desse projeto.
- Sob demanda; nunca proativa.

## Workflow
Trate **um projeto por vez**. Arquivos copiáveis em `assets/`; o porquê em `references/`.

1. **Pré-deploy comum** — siga `../deploy-vercel/references/predeploy-comum.md` (build local verde, env em
   `.env.example`, sem segredo versionado). Resolva os alertas antes de avançar.
2. **Detecção** — `Glob`/`Read` em `project.json`, `modules/*/module.json` e `package.json`/`pyproject.toml`:
   binding (TS/JS/Python), módulos com `webPath` não-nulo, dependências nativas (argon2, bcrypt, sharp…),
   sidecars (banco, PDF…), `ROOT_API_PORT` e a rota `<basePath>/health`. Registre o que achou.
3. **Dockerfile do backend** — copie `assets/Dockerfile.<binding>` como `Dockerfile` na raiz; preencha
   `<PROJECT>`. Detalhe e dependência nativa em `references/padrao-imagem.md`.
4. **Front** (se algum `web/`) — `assets/front.Dockerfile` + `assets/nginx.conf` (um bloco `location` por
   `webPath`, procedimento em `references/front-origem-unica.md`). Sem `web/` (o Python não tem) → sem imagem de front: apague `front.Dockerfile` e o serviço `front` do compose.
5. **`.dockerignore`** — copie `assets/.dockerignore` para a raiz (o contexto das duas imagens).
6. **`compose.yml` local** — `assets/compose.yml`: profile padrão = Postgres de dev; profile `app` = paridade.
   Crie `<INFRA_DIR>/.env` a partir de `assets/deploy.env.example` (as `DEPLOY_*`, fora do `.env` da raiz).
   `references/compose-local.md`.
7. **Script de subida** — `assets/docker-up.mjs` (`up`, `stop`, `logs`).
8. **Validar** — `python ../deploy-docker-microsservico/scripts/validar_docker.py --raiz <projeto>`
   (não-root, sem `:latest`, sem segredo em build) **e** `python scripts/validar_monolito.py --raiz <projeto>`
   (multi-stage, HEALTHCHECK, rótulo, sem `COPY . .` final, front, loopback, digest). Resolva os bloqueios.
9. **Paridade local** — `docker compose --env-file .env --env-file <INFRA_DIR>/.env --profile app up --build
   --wait` (ou `node <INFRA_DIR>/docker-up.mjs up`); healthcheck verde, e a API e o front respondem pela
   origem única do front. As chaves `DEPLOY_*` vêm de `<INFRA_DIR>/.env` (modelo `assets/deploy.env.example`).
10. **HITL — plano de build/push** — apresente: as **duas imagens com a mesma tag de commit**, bases
    fixadas, resultado da validação, registry de destino, **sem `latest`**. → "⚠️ Confirma o build/push?".
    **Aguarde.**
11. **Build + push + digests** — `docker build --build-arg <PROJECT>_VERSION=<commit>` nas duas;
    `docker push`; **registre os digests** (`sha256:…`) que o registry devolveu.
12. **Compose de produção (HITL)** — `assets/compose.production.yml` com os digests; a **entrada** (túnel,
    Caddy ou Traefik) e o registry são escolhidos aqui. `references/producao.md`.

## Regras e limites
- **NÃO** faça mais de **uma imagem de backend** para o monólito — o processo composto é uma unidade.
- **NUNCA** sirva o front de dentro do processo do backend — `web/` é publicado por fora (§4.4).
- **NUNCA** ponha segredo na imagem (`COPY .env`, segredo em `ARG`/`ENV`) — `.env` entra só em runtime.
- **NUNCA** use `:latest` (base ou publicação) — versão fixa; em produção, digest.
- **NÃO** rode o fonte TS em produção (`tsx`, `--experimental-transform-types`) — rode o artefato emitido.
- **NÃO** escreva lista de `COPY` por módulo — o artefato vem de `tools/package.mjs` (ou da convenção de pasta).
- **NÃO** dê valor padrão a variável de infraestrutura (`${PORTA:-3000}`) — use `${VAR:?mensagem}`.
- **NÃO** builde/publique sem o HITL do passo 10, nem trate "buildou" como "funciona" — valide o healthcheck.
- **NÃO** saia do escopo: módulo extraído é `deploy-docker-microsservico`; serverless é `deploy-vercel`;
  autoria/licença/docs são `code-entrega`; segredo vazado é `cyber-segredos`.

## Checklist "pronta"
- [ ] Pré-deploy comum ok e a detecção (binding, `webPath`, nativas, sidecars, porta, health) registrada?
- [ ] **Uma** imagem de backend: multi-stage, base fixada, não-root, `HEALTHCHECK`, `LABEL …revision`?
- [ ] Artefato sem `COPY . .` final, sem `tsx`, sem lista de `COPY` por módulo?
- [ ] Front em imagem própria (`nginx-unprivileged` fixa), uma `location` por `webPath`, sem catch-all em `/`?
- [ ] `compose.yml`: portas só em `127.0.0.1`, infra com `:?`, `DEPLOY_*` em `<INFRA_DIR>/.env`, profile `app` sobe verde com `--wait`?
- [ ] `.dockerignore` cobre `.env*` (com `!.env.example`), `node_modules`, `dist`, `.git`, `tests`, `specs`?
- [ ] `validar_docker.py` e `validar_monolito.py` sem bloqueios?
- [ ] HITL feito; as duas imagens com a mesma tag; digests registrados; produção sem portas, por digest?

## Referências (Camada 3 — leia sob demanda)
- `references/padrao-imagem.md` — o Dockerfile por binding, os estágios, dependência nativa, env e health.
- `references/front-origem-unica.md` — nginx, origem única, derivar as `location` dos `webPath`, o `base` do Vite.
- `references/compose-local.md` — os dois usos do compose, chaves `DEPLOY_*`, `docker-up.mjs`, variante `additional_contexts`.
- `references/producao.md` — molde de produção, entrada e registry no HITL, variante Supabase local.
- `assets/` — `Dockerfile.typescript|javascript|python`, `front.Dockerfile`, `nginx.conf`, `.dockerignore`,
  `compose.yml`, `compose.production.yml`, `deploy.env.example`, `docker-up.mjs`.
- `scripts/validar_monolito.py` + `scripts/config.json` — validação determinística do empacotamento do monólito
  (`--autoteste` registrado em `specs/_estrutura_modulos/tests/run-all-selftests.mjs`).
- `../deploy-docker-microsservico/scripts/validar_docker.py` — o validador genérico, reutilizado por referência.
