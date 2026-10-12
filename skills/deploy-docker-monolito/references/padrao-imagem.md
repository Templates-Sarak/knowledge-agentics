# Padrão da imagem do backend (monólito modular composto)

Uma imagem para o processo composto inteiro: a raiz de composição (`src/composition.*`) monta todos os
módulos sob `/api/v1/<módulo>` num processo, numa porta (`00-arquitetura` §5). O `Dockerfile` está na raiz do
projeto do template (fonte: `specs/_estrutura_modulos/bindings/<binding>/root/Dockerfile`); os três bindings
seguem o mesmo desenho, e muda só **como o artefato nasce** em cada um. Lei: `03-operacao` §9.5.

## O artefato por binding

| Binding | Artefato | Como nasce | Entrypoint de produção |
|---|---|---|---|
| TypeScript | `dist/` da raiz + `modules/<id>/{module.json,config/*.json,dist/}` + `config/runtime.json` + `package.json` e `package-lock.json` mesclados | `node tools/package.mjs <destino>` (`03-operacao` §9.1) | `node dist/src/composition.js` (`start:prod`) |
| JavaScript | o próprio fonte: `src/`, `adapters/`, `packages/`, `config/runtime.json` e, por módulo, `module.json` + `config/` + `api/` + `core/`; mesmo `package.json` e lock | `node tools/package.mjs <destino>` (o mesmo, §9.1) | `node src/composition.js` |
| Python | `src/`, `adapters/`, `packages/`, `config/runtime.json` e, por módulo, `module.json` + `config/` + `api/` + `core/` | laço de shell no `Dockerfile` (não há empacotamento em Python — §9.1) | `python -m src.composition` |

Nenhum Dockerfile tem lista de `COPY` por módulo: Node pergunta ao `package.mjs`; Python percorre
`modules/[a-z]*/` com um laço que copia **as mesmas quatro coisas** por módulo. Módulo novo entra sem editar o
Dockerfile. `contract/openapi.yaml`, `core/templates`, `database/` e `tests/` ficam fora de propósito — o
processo não os lê rodando (§9.1).

## Os estágios

1. **`build`** — `COPY . .` (o `.dockerignore` corta `node_modules`, `dist`, `tests`, `specs`, `.env*`),
   instalação completa e geração do artefato. É o único estágio que vê o fonte e o toolchain.
2. **`production-dependencies`** — estágio **separado**, na **mesma base e libc** do runtime. Instala só o
   que roda em produção (`npm ci --omit=dev` sobre o lock do artefato; no Python, a união mecânica de
   `[project].dependencies` + o extra de cada adapter escolhido). Estágio próprio porque cache de dependência
   e artefato mudam em ritmos diferentes, e porque o resultado é copiado como uma peça só.
3. **`runtime`** — base mínima, usuário não-root, **só o artefato** (`COPY --from`, nunca `COPY . .`),
   `HEALTHCHECK`, `LABEL org.opencontainers.image.revision`.

A versão da base é a **mesma** nos três `FROM` (o validador pega `:latest` e tag ausente; manter as três
iguais é disciplina do projeto — um `ARG` no `FROM` esconderia a tag do validador).

## O driver do banco viaja com o adapter

`pg` (Node) e `psycopg` (Python) **não** estão no `Dockerfile`: o adapter `postgres` os declara
(`adapters/postgres/package.json`; extra `postgres` do `pyproject.toml`), e o artefato só os leva se algum
`config/ports.json` escolhe o provedor (ADR-021 §4). Nada a instalar à mão.

## Dependência nativa (argon2, bcrypt, sharp…)

O problema real: binário compilado numa libc não roda em outra (`alpine`/musl ≠ `slim`/glibc). A regra:

- compile **na mesma base** do runtime — por isso `production-dependencies` é `FROM` a mesma imagem;
- se não houver binário pré-compilado, o toolchain entra **e sai na mesma camada** (`apt-get install … &&
  npm ci … && apt-get purge --auto-remove …`). Os Dockerfiles trazem o bloco pronto, comentado.
  Toolchain em camada separada fica na imagem para sempre, mesmo "removido" depois.

## Rótulo de versão

`ARG IMAGE_VERSION` + `LABEL org.opencontainers.image.revision`. Quem publica passa
`--build-arg IMAGE_VERSION=<commit curto>` **nas duas imagens** (localmente, `DEPLOY_IMAGE_VERSION` em
`deploy/.env`): é como se descobre qual commit um digest carrega, sem depender de variável que alguém mantém
à mão.

## Ambiente e segredo

- **`env_file: .env`** no compose; o `.env` real nunca entra na imagem (`.dockerignore` + `package.mjs`
  copia só `.env.example`).
- Por que `env_file` e não bind do `.env`: o artefato **não leva o `.env` do módulo**, então o ponteiro
  `ENV_ROOT` (ADR-004) nunca é resolvido dentro do container. O ambiente do processo tem a precedência
  máxima da cascata (processo > `.env` do módulo > `.env` apontado), então basta injetá-lo. O bind
  read-only do `.env` também funciona (a `loadEnvRoot` da raiz lê `<cwd>/.env`) e evita o segredo
  aparecer em `docker inspect`; é a alternativa se isso importar.
- **Porta e host:** `ROOT_API_PORT` do `.env`, lida em runtime; **`ROOT_API_HOST` é sobrescrito no
  `environment:` do serviço `app`** (`0.0.0.0`) — o `.env` de dev guarda loopback, e dentro do container
  isso é inalcançável. É propriedade do container, não do ambiente, e o processo continua sem default
  (`03-operacao` §9.5). **Produção repete a sobrescrita** (`assets/compose.production.yml`). Nada de porta
  no Dockerfile; não há `EXPOSE`.
- **`<MODULE>_DB_URL`:** dentro do container o banco é o serviço `db`, não `127.0.0.1`. O fragmento
  **gerado** `deploy/compose.modules.yml` sobrescreve uma linha por módulo; produção usa a URL real no `.env`.

## Health

Rota obrigatória de todo módulo: `GET <basePath>/health` (`02-contrato-e-dados`), pública
(`publicRoutes`). Não há health global na raiz. O `HEALTHCHECK` lê o `basePath` do primeiro `module.json`
empacotado e consulta a porta de `ROOT_API_PORT` — sem módulo nomeado no Dockerfile.

## O que não fazer

- `tsx`, `ts-node` ou `--experimental-transform-types` no `CMD` — roda o fonte, não o artefato.
- `COPY . .` no estágio final, `COPY .env`, segredo em `ARG`/`ENV`.
- Fixar um módulo (`/api/v1/<módulo>/health`) no `HEALTHCHECK` ou uma porta literal.
- `ENV ROOT_API_HOST=0.0.0.0` no Dockerfile: o `env_file` do compose a vence e o `.env` de dev volta a mandar.
- Várias imagens de backend para o mesmo processo composto.
