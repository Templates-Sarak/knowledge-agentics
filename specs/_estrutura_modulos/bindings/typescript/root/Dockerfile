# syntax=docker/dockerfile:1
# Backend do monólito modular composto — binding TypeScript. UMA imagem para todos os módulos.
# Contexto de build: a RAIZ do projeto. Lei: specs/arquitetura/03-operacao.md §9.5.
#
# Mantenha a MESMA versão de base nos três FROM: o binário nativo compilado num estágio precisa
# da mesma libc e da mesma ABI do Node do estágio que o executa.

# ── build ───────────────────────────────────────────────────────────────────
# Compila o backend (tsc) e empacota o artefato autossuficiente por convenção (§9.1): dist/ +
# module.json + config/*.json + package.json e package-lock.json mesclados. Nenhuma lista de COPY por
# módulo — quem decide o que viaja é o tools/package.mjs.
FROM node:22.12.0-bookworm-slim AS build
WORKDIR /repo
COPY . .
RUN npm ci
RUN node tools/package.mjs /out/backend

# ── dependências de produção ────────────────────────────────────────────────
# Estágio separado, na MESMA base e libc do runtime: o que for compilado aqui roda lá. O lock do
# artefato torna a instalação reprodutível; o driver do adapter `postgres` já vem no package.json
# do artefato quando algum módulo escolhe esse provedor em config/ports.json.
FROM node:22.12.0-bookworm-slim AS production-dependencies
WORKDIR /app
COPY --from=build /out/backend/package.json /out/backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force
# Dependência NATIVA sem binário pré-compilado para esta base (por exemplo argon2)?
# Troque o RUN acima por este: o toolchain entra e SAI na mesma camada, e só o .node pronto fica.
# RUN apt-get update \
#  && apt-get install -y --no-install-recommends python3 make g++ \
#  && npm ci --omit=dev --no-audit --no-fund \
#  && apt-get purge -y --auto-remove python3 make g++ \
#  && rm -rf /var/lib/apt/lists/* \
#  && npm cache clean --force

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:22.12.0-bookworm-slim AS runtime
ENV NODE_ENV=production

# A imagem se rotula com a própria versão (commit curto): é como se sabe o que roda a partir do
# digest. Passe --build-arg IMAGE_VERSION=<commit>; sem ele o rótulo fica vazio.
ARG IMAGE_VERSION=""
LABEL org.opencontainers.image.revision=$IMAGE_VERSION

WORKDIR /app
# Só o artefato e as dependências de produção. Nada de fonte .ts, tools/, tests/ nem .env.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /out/backend/ ./
USER node

# Sem EXPOSE e sem porta literal: a porta e o host vêm de ROOT_API_PORT e ROOT_API_HOST, injetados
# no runtime (compose.yml). A rota de health é por módulo (<basePath>/health), então a sonda lê o
# basePath do primeiro module.json empacotado — nenhum módulo nomeado aqui.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const fs=require('fs'),p=require('path');const f=fs.readdirSync('modules').filter(n=>!n.startsWith('_')).map(n=>p.join('modules',n,'module.json')).find(x=>fs.existsSync(x));const b=JSON.parse(fs.readFileSync(f,'utf8')).basePath;fetch('http://127.0.0.1:'+process.env.ROOT_API_PORT+b+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# O artefato emitido (`start:prod`) — nunca o fonte via tsx.
CMD ["node", "dist/src/composition.js"]
