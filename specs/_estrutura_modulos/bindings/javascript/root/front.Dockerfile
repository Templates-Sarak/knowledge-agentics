# syntax=docker/dockerfile:1
# Imagem do FRONT do monólito — o build estático de cada `web/` publicado por fora do processo do
# backend (00-arquitetura §4.4), sob a mesma origem da API. Imagem PRÓPRIA: o backend não carrega o
# toolchain do Vite, e o front não carrega o runtime do backend. Contexto de build: a RAIZ do projeto.
# Lei: specs/arquitetura/03-operacao.md §9.5.
#
# As DUAS imagens (esta e a do backend) saem do MESMO commit e publicam com a MESMA tag —
# nunca um front de uma versão falando com uma API de outra.

# ── build ───────────────────────────────────────────────────────────────────
FROM node:22.12.0-bookworm-slim AS build
WORKDIR /repo
COPY . .
RUN npm ci
# Cada módulo com web/ e webPath não-nulo é construído pelo PRÓPRIO vite.config (o `base` vem do
# webPath do manifesto) e vai para /site/<webPath>. Descoberta por convenção de pasta e pelo
# manifesto — nenhum módulo nomeado aqui.
RUN set -eu; mkdir -p /site; \
    for dir in modules/[a-z]*/; do \
      web_path=$(node -p "require('./$dir/module.json').webPath || ''"); \
      config=$(ls "$dir"web/vite.config.* 2>/dev/null | head -n 1 || true); \
      if [ -z "$web_path" ] || [ -z "$config" ]; then continue; fi; \
      (cd "$dir" && npx --no-install vite build --config "web/$(basename "$config")"); \
      mkdir -p "/site${web_path}/"; \
      cp -r "${dir}web/dist/." "/site${web_path}/"; \
    done

# ── final ───────────────────────────────────────────────────────────────────
# nginx-unprivileged: roda como usuário não-root de fábrica e escuta em 8080 — a origem única
# não pede root nem 80/443 (quem termina TLS é a entrada, fora desta imagem).
FROM nginxinc/nginx-unprivileged:1.27.3-alpine AS final

ARG IMAGE_VERSION=""
LABEL org.opencontainers.image.revision=$IMAGE_VERSION

# Pasta PRÓPRIA e vazia (/srv/site), nunca /usr/share/nginx/html: a imagem base já traz um
# index.html ali, e o COPY MESCLA com ele — GET / devolveria a página padrão do nginx (200).
COPY --from=build /site /srv/site
# A imagem renderiza /etc/nginx/templates/*.template com envsubst no start: o upstream do backend
# (porta) entra por variável de ambiente, não por literal no arquivo. As `location` dos módulos e os
# tunables do proxy vêm do arquivo GERADO (tools/sync-deploy.mjs), incluído pelo nginx.conf.
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
COPY deploy/nginx.modules.conf /etc/nginx/modules.d/modules.conf
USER nginx

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
