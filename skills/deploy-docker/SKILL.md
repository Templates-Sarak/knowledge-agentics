---
name: deploy-docker
description: Containeriza um app/módulo (qualquer stack) para a arquitetura microservice-ready — Dockerfile multi-stage, usuário não-root, .dockerignore, healthcheck e docker-compose por módulo, sem segredo na imagem, com HITL. Use quando pedirem para conteinerizar, escrever Dockerfile/compose ou preparar imagem. NÃO acione proativamente.
---

# Skill: Deploy Docker

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Leva um app/módulo a uma **imagem de container enxuta, segura e reproduzível**: Dockerfile multi-stage,
usuário **não-root**, `.dockerignore`, healthcheck, versões fixadas e **zero segredo na imagem** — e um
`docker-compose` que orquestra os módulos localmente. É o que torna o **"microservice-ready"** do padrão
concreto: cada módulo vira **um container extraível**. É **mutativa** (constrói/publica imagem) → HITL
obrigatório antes de build/push.

> Princípios globais em `CLAUDE.md`. **1 container por módulo** (módulo=domínio) — detalhe em
> `padrao-escrita` → `references/PADRAO-ORGANIZACAO.md`. O **pré-deploy comum** (build/env/segredos/deps)
> está em `../deploy-vercel/references/predeploy-comum.md` e é reutilizável por qualquer `deploy-*`. Segredo
> na imagem é caça da `cyber-segredos`. Antes da entrega, rode `code-entrega`.

## Quando usar
- Sob demanda, ao conteinerizar um app/módulo, escrever/auditar `Dockerfile` ou `docker-compose`, ou preparar
  imagem para um registry.
- Após mudar runtime, dependências ou a forma de configurar (porta/env) de um módulo.
- Mutativa (gera Dockerfile/compose; pode buildar/publicar) → passo HITL obrigatório antes de build/push.

## Workflow
Trate **um módulo/imagem por vez**. Templates em `assets/docker-templates/`; tabela stack→base em
`references/docker-stacks.md`; checklist genérico em `../deploy-vercel/references/predeploy-comum.md`.

1. **Pré-deploy comum** — siga `../deploy-vercel/references/predeploy-comum.md` (build local verde, env no
   `.env.example`, sem segredo versionado, deps compatíveis). Resolva os alertas antes de avançar.
2. **Identificar stack e base** — `Glob`/inspeção do módulo → escolha a imagem base e o template
   (`references/docker-stacks.md`: node/python/go/java/estático). **Fixe a versão** da base (`:3.12-slim`,
   nunca `:latest`).
3. **Escrever o Dockerfile (multi-stage)** — copie o template da stack: estágio de build (deps + compilação)
   separado do estágio de runtime mínimo; copie só o artefato final; rode como **usuário não-root**; exponha a
   **porta via `ENV`/`ARG`** (zero-hardcoded); adicione `HEALTHCHECK`. **Nunca** `COPY .env` nem segredo em
   `ARG`/`ENV` de build.
4. **`.dockerignore`** — copie o template e garanta que `.git`, `.env*`, `node_modules`, build/artefatos e
   `tests/` fiquem fora do contexto (imagem menor, sem vazar segredo).
5. **`docker-compose` (orquestração local)** — **um serviço por módulo** (mesma malha/rede), `env_file: .env`
   (nunca valores inline), volumes só para dev, `depends_on` para ordem. Mantém os módulos desacoplados como em
   produção (comunicação pelo `api/`, não por banco compartilhado direto).
6. **Validar (determinístico)** — `python scripts/validar_docker.py --raiz <módulo>` (JSON: não-root,
   `.dockerignore` presente, sem `:latest`, sem `COPY .env`/segredo). Resolva os alertas. Depois `docker build`
   e cheque o tamanho/camadas; rode o container e o healthcheck localmente.
7. **HITL — plano de build/push** — apresente: módulo, stack/base fixada, resultado da validação, tag
   pretendida (semântica, **sem `latest`**), registry de destino. → "⚠️ Confirma o build/push da imagem?".
   **Aguarde.**
8. **Build + push** — `docker build -t <registry>/<modulo>:<versão>` → suba o container e valide o healthcheck →
   `docker push`. Documente imagem/tag/porta/env na conclusão.

## Regras e limites
- **NUNCA** coloque segredo na imagem — sem `COPY .env`, sem segredo em `ARG`/`ENV` de build; valores reais só
  em runtime (`env_file`/`-e`/cofre do orquestrador). Achou? caça e rotação com `cyber-segredos`.
- **NUNCA** use tag `:latest` (base ou publicação) — **fixe versões** para builds reproduzíveis.
- **NÃO** rode o processo como **root** — crie e use um usuário não-root (`USER`).
- **NÃO** use imagem single-stage pesada quando cabe **multi-stage** — runtime mínimo (`-slim`/`distroless`),
  sem toolchain de build na imagem final.
- **NÃO** hardcode porta/host/tunables no Dockerfile — venha de `ENV`/`ARG`/`config.json` do módulo.
- **NÃO** junte vários módulos num mesmo container — **1 módulo = 1 imagem** (extraível como microsserviço).
- **NÃO** builde/publique sem o HITL do passo 7, nem considere "buildou" como "funciona" — valide o healthcheck.
- **NÃO** saia do escopo: autoria/licença/documentação é da `code-entrega`; deploy serverless é da
  `deploy-vercel`. Aqui só se conteineriza e publica imagem.

## Checklist "pronta"
- [ ] Pré-deploy comum ok (build local verde, env declaradas, sem segredo versionado, deps compatíveis)?
- [ ] Dockerfile **multi-stage**, base com **versão fixada**, runtime mínimo?
- [ ] Processo roda como **usuário não-root** e tem `HEALTHCHECK`?
- [ ] `.dockerignore` presente cobrindo `.git`/`.env*`/artefatos/`tests`?
- [ ] Porta/tunables vêm de `ENV`/`ARG`/`config` (zero-hardcoded), **sem segredo** na imagem?
- [ ] `docker-compose` com **um serviço por módulo**, `env_file` (sem valor inline)?
- [ ] `validar_docker.py` sem alertas; tag **semântica** (sem `latest`)?
- [ ] HITL apresentado e build/push confirmado; healthcheck validado; imagem/tag/porta/env documentados?

## Referências (Camada 3 — leia sob demanda)
- `references/docker-stacks.md` — tabela stack→imagem base + template, e notas (multi-stage, não-root, healthcheck).
- `../deploy-vercel/references/predeploy-comum.md` — checklist genérico de pré-deploy, reutilizável por `deploy-*`.
- `scripts/validar_docker.py` + `scripts/config.json` — validação determinística da imagem (listas no config).
- `assets/docker-templates/` — `Dockerfile` por stack, `docker-compose.yml` e `.dockerignore` copiáveis.
