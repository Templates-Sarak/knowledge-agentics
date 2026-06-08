# Docker por stack (imagem base + template)

Tabela de partida por stack. Sempre **multi-stage**, **versão fixada** (nunca `:latest`), runtime mínimo e
**usuário não-root**. Os templates copiáveis estão em `assets/docker-templates/`.

| Stack | Base de build | Base de runtime | Template | Notas |
|---|---|---|---|---|
| Node/TS | `node:20-slim` | `node:20-slim` (ou `distroless/nodejs20`) | `Dockerfile.node` | `npm ci` no build; copie só `dist/` + `node_modules` de produção |
| Python | `python:3.12-slim` | `python:3.12-slim` | `Dockerfile.python` | instale deps numa venv no build; runtime sem toolchain; `uvicorn`/`gunicorn` |
| Go | `golang:1.22` | `gcr.io/distroless/static` (ou `alpine`) | `Dockerfile.go` | binário estático (`CGO_ENABLED=0`); runtime quase vazio |
| Java | `maven:3.9-eclipse-temurin-21` | `eclipse-temurin:21-jre` | `Dockerfile.java` | build do `.jar` no estágio Maven; runtime só JRE |
| Estático (SPA) | `node:20-slim` | `nginx:1.27-alpine` | `Dockerfile.static` | build do bundle; sirva por nginx; SPA precisa de fallback `try_files` |

## Princípios (valem para todas as stacks)

1. **Multi-stage** — estágio de build (deps + compilação) ≠ estágio de runtime. A imagem final leva só o
   artefato; o toolchain de build fica para trás (imagem menor, menos superfície).
2. **Versão fixada** — `python:3.12-slim`, não `python:latest`. Build reproduzível e auditável.
3. **Usuário não-root** — crie um usuário (`adduser`) e `USER app` antes do `CMD`. Container rodando como root
   é risco de escape de privilégio.
4. **Porta/tunables via `ENV`/`ARG`** — nada de porta hardcoded; o app lê a env `PORT` (zero-hardcoded,
   `padrao-escrita`). `EXPOSE` documenta, não fixa.
5. **`HEALTHCHECK`** — toda imagem de serviço declara um healthcheck (o orquestrador depende dele para saber
   se o container está saudável).
6. **Sem segredo na imagem** — nunca `COPY .env`, nunca segredo em `ARG`/`ENV` de build (fica no histórico de
   camadas). Segredo só em runtime (`env_file`/cofre do orquestrador).

## docker-compose (orquestração local, microservice-ready)

- **Um serviço por módulo** — espelha a fatia vertical (módulo=domínio). Cada serviço aponta para o
  `Dockerfile` do seu módulo.
- **Rede compartilhada** — os módulos se falam pela rede do compose, consumindo o **`api/`** um do outro (nunca
  o banco direto de outro módulo — regra de encapsulamento do `PADRAO-ORGANIZACAO.md`).
- **`env_file: .env`** — nunca valores inline no `docker-compose.yml`. O `.env` fica no `.gitignore`; o
  `.env.example` é versionado.
- **Volumes só para dev** — bind-mount de código é conveniência local; a imagem de produção é
  self-contained (não depende de volume de código).
- **`depends_on`** — ordem de subida; para readiness real, combine com healthcheck.
