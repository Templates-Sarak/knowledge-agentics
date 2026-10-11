# syntax=docker/dockerfile:1
# Imagem do FRONT do monólito — o build estático de cada `web/` publicado por fora do processo
# do backend (00-arquitetura §4.4), sob a mesma origem da API. Imagem PRÓPRIA: o backend não carrega
# o toolchain do Vite, e o front não carrega o runtime do backend.
# Copie para a raiz do projeto como `front.Dockerfile`. Contexto de build: a RAIZ do projeto.
#
# As DUAS imagens (esta e a do backend) saem do MESMO commit e publicam com a MESMA tag —
# nunca um front de uma versão falando com uma API de outra.
#
# Marcadores: <PROJECT> (prefixo do projeto, maiúsculas), <INFRA_DIR> (pasta que guarda o nginx.conf,
# por exemplo `deploy`).

# ── build ───────────────────────────────────────────────────────────────────
FROM node:22.12.0-bookworm-slim AS build
WORKDIR /repo
COPY . .
RUN npm ci
# Cada módulo com web/ e webPath não-nulo é construído com --base igual ao webPath e vai para
# /site/<webPath>. O `base` na linha de comando é o contorno do fato de o vite.config.* do
# molde NÃO definir `base` (pendência da fase 2): sem ele, o index.html referencia /assets/...
# e o bundle quebra fora da raiz. Descoberta por convenção de pasta e pelo manifesto — nenhum
# módulo nomeado aqui.
RUN set -eu; mkdir -p /site; \
    for dir in modules/[a-z]*/; do \
      web_path=$(node -p "require('./$dir/module.json').webPath || ''"); \
      config=$(ls "$dir"web/vite.config.* 2>/dev/null | head -n 1 || true); \
      if [ -z "$web_path" ] || [ -z "$config" ]; then continue; fi; \
      base="${web_path%/}/"; \
      (cd "$dir" && npx --no-install vite build --config "web/$(basename "$config")" --base "$base"); \
      mkdir -p "/site${base}"; \
      cp -r "${dir}web/dist/." "/site${base}"; \
    done

# ── final ───────────────────────────────────────────────────────────────────
# nginx-unprivileged: roda como usuário não-root de fábrica e escuta em 8080 — a origem única
# não pede root nem 80/443 (quem termina TLS é a entrada, fora desta imagem).
FROM nginxinc/nginx-unprivileged:1.27.3-alpine AS final

ARG <PROJECT>_VERSION=""
LABEL org.opencontainers.image.revision=$<PROJECT>_VERSION

# Pasta PRÓPRIA e vazia (/srv/site), nunca /usr/share/nginx/html: a imagem base já traz um
# index.html ali, e o COPY MESCLA com ele — GET / devolveria a página padrão do nginx (200).
COPY --from=build /site /srv/site
# A imagem renderiza /etc/nginx/templates/*.template com envsubst no start: o upstream do
# backend (porta) entra por variável de ambiente, não por literal no arquivo.
COPY <INFRA_DIR>/nginx.conf /etc/nginx/templates/default.conf.template
USER nginx

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
