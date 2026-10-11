# Padrão da imagem do backend (monólito modular composto)

Uma imagem para o processo composto inteiro: a raiz de composição (`src/composition.*`) monta todos os
módulos sob `/api/v1/<módulo>` num processo, numa porta (`00-arquitetura` §5). Os três Dockerfiles de
`assets/` seguem o mesmo desenho; muda só **como o artefato nasce** em cada binding.

## O artefato por binding (medido no template, não presumido)

| Binding | Artefato | Como nasce | Entrypoint de produção | Observação |
|---|---|---|---|---|
| TypeScript | `dist/` da raiz + `modules/<id>/{module.json,config/*.json,dist/}` + `package.json` mesclado + `.env.example` | `node tools/package.mjs <destino>` (`03-operacao` §9.1) | `node dist/src/composition.js` (`start:prod`) | emite com `tsc`; `importApi` prefere o `dist/` do módulo |
| JavaScript | o próprio fonte: `src/`, `adapters/`, `packages/`, `package.json` e, por módulo, `module.json` + `config/` + `api/` + `core/` | **`package.mjs` não serve**: exige `dist/` da raiz e aborta em JS | `node src/composition.js` | o Dockerfile monta o artefato por convenção de pasta (pendência da fase 2) |
| Python | `src/`, `adapters/`, `packages/` e, por módulo, `module.json` + `config/` + `api/` + `core/` | não há `package.mjs` útil (não emite, e não é Node) | `python -c` sobre `build_system` (ver abaixo) | `composition.py` sobe o uvicorn em `127.0.0.1`, sem host configurável |

Nenhum Dockerfile tem lista de `COPY` por módulo: o TypeScript pergunta ao `package.mjs`; JS e Python
percorrem `modules/[a-z]*/` com um laço de shell que copia **as mesmas quatro coisas** por módulo.
Módulo novo entra sem editar o Dockerfile. `contract/openapi.yaml`, `core/templates`, `database/` e
`tests/` ficam fora de propósito — o processo não os lê rodando (medido no §9.1).

## Pré-requisitos do projeto

- **`package-lock.json` versionado** (TS/JS): os Dockerfiles usam `npm ci`, que falha sem lockfile. O
  `create-project` não o gera — rode `npm install` e commite o lock.
- **Binding JavaScript/Python**: `node tools/create-module.mjs <id> --binding <binding>` — o `create-module`
  não infere o binding do projeto (padrão `typescript`), e um módulo JS marcado como TS reprova o gate.

## Os estágios

1. **`build`** — `COPY . .` (o `.dockerignore` corta `node_modules`, `dist`, `tests`, `specs`, `.env*`),
   instalação completa e geração do artefato. É o único estágio que vê o fonte e o toolchain.
2. **`production-dependencies`** — estágio **separado**, na **mesma base e libc** do runtime. Instala só o
   que roda em produção (`--omit=dev`; no Python, a união mecânica de `[project].dependencies`). Estágio
   próprio porque cache de dependência e artefato mudam em ritmos diferentes, e porque o resultado é
   copiado como uma peça só.
3. **`runtime`** — base mínima, usuário não-root, **só o artefato** (`COPY --from`, nunca `COPY . .`),
   `HEALTHCHECK`, `LABEL org.opencontainers.image.revision`.

A versão da base é a **mesma** nos três `FROM` (o validador pega `:latest` e tag ausente; manter as três
iguais é disciplina do projeto — um `ARG` no `FROM` esconderia a tag do validador).

## Dependência nativa (argon2, bcrypt, sharp…)

O problema real: binário compilado numa libc não roda em outra (`alpine`/musl ≠ `slim`/glibc). A regra:

- compile **na mesma base** do runtime — por isso `production-dependencies` é `FROM` a mesma imagem;
- se não houver binário pré-compilado, o toolchain entra **e sai na mesma camada** (`apt-get install … &&
  npm install … && apt-get purge --auto-remove …`). Os Dockerfiles trazem o bloco pronto, comentado.
  Toolchain em camada separada fica na imagem para sempre, mesmo "removido" depois.

## Rótulo de versão

`ARG <PROJECT>_VERSION` + `LABEL org.opencontainers.image.revision`. Quem publica passa
`--build-arg <PROJECT>_VERSION=<commit curto>` **nas duas imagens**: é como se descobre qual commit um
digest carrega, sem depender de variável que alguém mantém à mão.

## Ambiente e segredo

- **`env_file: .env`** no compose; o `.env` real nunca entra na imagem (`.dockerignore` + `package.mjs`
  copia só `.env.example`).
- Por que `env_file` e não bind do `.env`: o artefato **não leva o `.env` do módulo**, então o ponteiro
  `ENV_ROOT` (ADR-004) nunca é resolvido dentro do container. O ambiente do processo tem a precedência
  máxima da cascata (processo > `.env` do módulo > `.env` apontado), então basta injetá-lo. O bind
  read-only do `.env` também funciona (a `loadEnvRoot` da raiz lê `<cwd>/.env`) e evita o segredo
  aparecer em `docker inspect`; é a alternativa se isso importar.
- **Porta:** `ROOT_API_PORT` do `.env`, lida em runtime (`envRequiredRoot`). Nada de porta no Dockerfile;
  não há `EXPOSE`.
- **`<MODULE>_DB_URL`:** dentro do container o banco é o serviço `db` (ou o host gerenciado), não
  `127.0.0.1`. O compose sobrescreve a chave por `environment:`; produção usa a URL real no `.env`.

## Health

Rota obrigatória de todo módulo: `GET <basePath>/health` (`02-contrato-e-dados`), pública
(`publicRoutes`). Não há health global na raiz. O `HEALTHCHECK` lê o `basePath` do primeiro `module.json`
empacotado e consulta a porta de `ROOT_API_PORT` — sem módulo nomeado no Dockerfile.

## Python — o host do uvicorn

`start_system` chama `uvicorn.run(app, port=porta)`: o host padrão é `127.0.0.1`, inalcançável de outro
container. O `CMD` do `Dockerfile.python` monta o sistema por `build_system` (função pública) e passa
`host=$APP_BIND_HOST`. É contorno: quando `composition.py` aceitar o host, volta a ser `python src/composition.py`.

## O que não fazer

- `tsx`, `ts-node` ou `--experimental-transform-types` no `CMD` — roda o fonte, não o artefato.
- `COPY . .` no estágio final, `COPY .env`, segredo em `ARG`/`ENV`.
- Fixar um módulo (`/api/v1/<módulo>/health`) no `HEALTHCHECK` ou uma porta literal.
- Várias imagens de backend para o mesmo processo composto.
