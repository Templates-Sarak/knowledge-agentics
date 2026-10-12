# syntax=docker/dockerfile:1
# Backend do monólito modular composto — binding Python. UMA imagem para todos os módulos.
# Contexto de build: a RAIZ do projeto. Lei: specs/arquitetura/03-operacao.md §9.5.
#
# Python não emite: o processo roda o fonte por natureza (§9.1) e não existe `package.mjs` para este
# binding. O artefato é montado aqui por convenção de pasta. Mesma versão de base nos três FROM.

# ── build ───────────────────────────────────────────────────────────────────
FROM python:3.12.8-slim-bookworm AS build
WORKDIR /repo
COPY . .
# assemble — raiz de composição, adapters, packages e, por módulo, module.json + config/ + api/ + core/.
RUN set -eu; mkdir -p /out/backend; \
    cp -r src adapters packages /out/backend/; \
    mkdir -p /out/backend/config; \
    cp config/runtime.json /out/backend/config/runtime.json; \
    for dir in modules/[a-z]*/; do \
      id=$(basename "$dir"); \
      mkdir -p "/out/backend/modules/$id"; \
      cp "$dir/module.json" "/out/backend/modules/$id/module.json"; \
      for sub in config api core; do \
        if [ -d "$dir/$sub" ]; then cp -r "$dir/$sub" "/out/backend/modules/$id/$sub"; fi; \
      done; \
    done
# Dependências de produção: união MECÂNICA de [project].dependencies da raiz e de cada módulo, mais o
# extra de cada adapter ESCOLHIDO em algum config/ports.json (o extra tem o nome do provedor — é como o
# driver do `postgres` entra só em quem o usa). Nunca uma lista escrita à mão que envelhece.
RUN python - > /tmp/requirements.txt <<'PY'
import glob
import json
import tomllib

chosen = set()
for path in glob.glob('modules/[a-z]*/config/ports.json'):
    with open(path, encoding='utf-8') as handle:
        chosen |= {value for value in json.load(handle).values() if isinstance(value, str)}

requirements = set()
for manifest in ['pyproject.toml', *sorted(glob.glob('modules/[a-z]*/pyproject.toml'))]:
    with open(manifest, 'rb') as handle:
        project = tomllib.load(handle).get('project', {})
    requirements.update(project.get('dependencies', []))
    for extra, dependencies in project.get('optional-dependencies', {}).items():
        if extra in chosen:
            requirements.update(dependencies)
print('\n'.join(sorted(requirements)))
PY

# ── dependências de produção ────────────────────────────────────────────────
# Estágio separado, mesma base e libc do runtime: o venv criado aqui roda lá.
FROM python:3.12.8-slim-bookworm AS production-dependencies
COPY --from=build /tmp/requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt
# Dependência NATIVA sem wheel para esta base? O toolchain entra e SAI na mesma camada:
# RUN apt-get update \
#  && apt-get install -y --no-install-recommends build-essential \
#  && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
#  && apt-get purge -y --auto-remove build-essential \
#  && rm -rf /var/lib/apt/lists/*

# ── runtime ─────────────────────────────────────────────────────────────────
FROM python:3.12.8-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/opt/venv/bin:$PATH

# A imagem se rotula com a própria versão (commit curto): é como se sabe o que roda a partir do
# digest. Passe --build-arg IMAGE_VERSION=<commit>; sem ele o rótulo fica vazio.
ARG IMAGE_VERSION=""
LABEL org.opencontainers.image.revision=$IMAGE_VERSION

RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=production-dependencies /opt/venv /opt/venv
COPY --from=build --chown=app:app /out/backend/ ./
USER app

# A porta e o host vêm de ROOT_API_PORT e ROOT_API_HOST, injetados no runtime (compose.yml) — sem
# EXPOSE e sem literal. A rota de health é <basePath>/health do primeiro module.json empacotado.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import glob,json,os,sys,urllib.request as u;f=sorted(glob.glob('modules/[a-z]*/module.json'))[0];b=json.load(open(f))['basePath'];sys.exit(0 if u.urlopen('http://127.0.0.1:'+os.environ['ROOT_API_PORT']+b+'/health',timeout=4).status==200 else 1)"]

# O entrypoint normal da raiz de composição: o host de escuta é o ROOT_API_HOST.
CMD ["python", "-m", "src.composition"]
