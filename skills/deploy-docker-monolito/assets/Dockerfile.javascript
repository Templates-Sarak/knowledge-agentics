# syntax=docker/dockerfile:1
# Backend do monólito modular composto — binding JavaScript. UMA imagem para todos os módulos.
# Copie para a raiz do projeto como `Dockerfile`. Contexto de build: a RAIZ do projeto.
#
# JavaScript não emite: o fonte JÁ É o artefato (03-operacao §9). Mas o `tools/package.mjs <destino>`
# hoje exige dist/ da raiz e falha em JS (pendência da fase 2) — por isso o passo "assemble" abaixo
# reproduz, por convenção de pasta, o que o §9.1 manda copiar. Quando o package.mjs cobrir JS,
# troque o passo por `node tools/package.mjs /out/backend`.
#
# Marcador: <PROJECT> (prefixo do projeto, maiúsculas). Mesma versão de base nos três FROM.

# ── build ───────────────────────────────────────────────────────────────────
FROM node:22.12.0-bookworm-slim AS build
WORKDIR /repo
COPY . .
# assemble — só o que o processo composto lê em runtime (§9.1): raiz de composição, adapters,
# packages e, por módulo, module.json + config/ + api/ + core/. Por pasta, não por nome de módulo.
RUN set -eu; mkdir -p /out/backend; \
    cp -r src adapters packages package.json /out/backend/; \
    for dir in modules/[a-z]*/; do \
      id=$(basename "$dir"); \
      mkdir -p "/out/backend/modules/$id"; \
      cp "$dir/module.json" "/out/backend/modules/$id/module.json"; \
      for sub in config api core; do \
        if [ -d "$dir/$sub" ]; then cp -r "$dir/$sub" "/out/backend/modules/$id/$sub"; fi; \
      done; \
    done

# ── dependências de produção ────────────────────────────────────────────────
# Estágio separado, mesma base e libc do runtime. `npm ci --omit=dev` usa o package-lock.json
# da raiz (workspaces): instalação reprodutível.
FROM node:22.12.0-bookworm-slim AS production-dependencies
WORKDIR /repo
COPY . .
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# Dependência NATIVA sem binário pré-compilado para esta base (por exemplo argon2)?
# Troque o RUN acima por este: o toolchain entra e SAI na mesma camada.
# RUN apt-get update \
#  && apt-get install -y --no-install-recommends python3 make g++ \
#  && npm ci --omit=dev --no-audit --no-fund \
#  && apt-get purge -y --auto-remove python3 make g++ \
#  && rm -rf /var/lib/apt/lists/* \
#  && npm cache clean --force

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:22.12.0-bookworm-slim AS runtime
ENV NODE_ENV=production

ARG <PROJECT>_VERSION=""
LABEL org.opencontainers.image.revision=$<PROJECT>_VERSION

WORKDIR /app
COPY --from=production-dependencies --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /out/backend/ ./
USER node

# A porta vem de ROOT_API_PORT (env_file, runtime). A rota de health é <basePath>/health do
# primeiro module.json empacotado.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const fs=require('fs'),p=require('path');const f=fs.readdirSync('modules').filter(n=>!n.startsWith('_')).map(n=>p.join('modules',n,'module.json')).find(x=>fs.existsSync(x));const b=JSON.parse(fs.readFileSync(f,'utf8')).basePath;fetch('http://127.0.0.1:'+process.env.ROOT_API_PORT+b+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/composition.js"]
