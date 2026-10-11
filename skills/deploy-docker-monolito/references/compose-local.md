# Compose local — os dois usos do mesmo `compose.yml`

Arquivo: `assets/compose.yml` → `compose.yml` na raiz do projeto. O script de subida é
`assets/docker-up.mjs` (`up`, `stop`, `logs`), copiado para `<INFRA_DIR>/`.

## Dois arquivos de ambiente, sempre

```
docker compose --env-file .env --env-file <INFRA_DIR>/.env <comando>
```

| Arquivo | Dono | Chaves |
|---|---|---|
| `.env` (raiz) | `tools/sync-env.mjs` | `ROOT_API_PORT` e os `<MODULE>_*` |
| `<INFRA_DIR>/.env` | o deploy (modelo: `assets/deploy.env.example` → `<INFRA_DIR>/.env.example`) | as `DEPLOY_*`, que só o compose lê |

- **Versão mínima declarada: Docker Compose 2.23.0.** A documentação do Compose afirma que várias opções
  `--env-file` são lidas em ordem e que o arquivo posterior sobrescreve o anterior, mas **não informa em que
  versão isso entrou**. O piso é o que os release notes comprovam (a variável `COMPOSE_ENV_FILES`, que
  carrega uma lista de arquivos, entrou na 2.23.0); o comportamento foi medido na v5.0.1. O `docker-up.mjs`
  recusa versão abaixo disso.
- **Sem `--env-file`, o compose lê só o `.env` do diretório do projeto.** Com os dois flags ele não lê mais
  nenhum automaticamente — por isso o `.env` da raiz também é passado.
- **O `env_file: .env` do serviço `app` continua apontando só para o `.env` da raiz**: o ambiente do
  processo não carrega nenhuma `DEPLOY_*`.
- O `<INFRA_DIR>/.env` já é ignorado pelo git (o `.env` do `.gitignore` do template casa em qualquer pasta)
  e fica fora do contexto de build (`**/.env` no `.dockerignore`). O `.env.example` dele é versionado.

## Uso 1 — dependências de dev (profile padrão)

```
docker compose --env-file .env --env-file <INFRA_DIR>/.env up --wait
```

Sobe **só** o Postgres (`db`, sem `profiles`). A aplicação roda no host (`npm run start`), falando com o
banco por `127.0.0.1:<DEPLOY_DB_PORT>`. Serve também o adapter `postgres` e o `npm run migrations`
(`03-operacao` §9.3), que lê `<MODULE>_DB_URL` do `.env`.

- **Versão fixa** (`postgres:16.6-alpine`), `healthcheck` com `pg_isready`, volume nomeado.
- **Porta só em loopback** (`127.0.0.1:${DEPLOY_DB_PORT}:5432`). Quem não precisa do banco no host remove
  `ports` — o `app` do profile `app` fala com `db` pela rede do compose.
- **Credencial do `<INFRA_DIR>/.env`, com `:?`** (`DEPLOY_DB_NAME`, `DEPLOY_DB_USER`, `DEPLOY_DB_PASSWORD`):
  ausente, o compose para nomeando a chave. Nenhum valor padrão embutido.
- **O adapter `postgres` no host** lê `<MODULE>_DB_URL` do `.env` da raiz: a URL aponta para
  `127.0.0.1:<DEPLOY_DB_PORT>` com a mesma credencial. Mantenha as duas pontas coerentes.

## Uso 2 — paridade com produção (profile `app`)

```
docker compose --env-file .env --env-file <INFRA_DIR>/.env --profile app up --build --wait
```

Constrói o **mesmo** `Dockerfile` e o `front.Dockerfile` e sobe `app` + `front`, com `--wait` (espera os
`HEALTHCHECK`s ficarem verdes). Só o `front` publica porta — em loopback (`DEPLOY_FRONT_PORT`); o `app` é
alcançado pelo proxy, como em produção. É o "funciona na imagem" antes de qualquer push.

- `app` recebe o `.env` por `env_file` e a URL do banco por `environment:` (o host é `db`). **Uma linha
  `<MODULE>_DB_URL` por módulo** que usa o adapter `postgres`; os que usam `memory` não precisam.
- `front` recebe `APP_UPSTREAM_PORT` = `ROOT_API_PORT` do `.env` da raiz.

**Os dois arquivos precisam de todas as chaves nos dois usos.** O compose interpola `${VAR:?}` de **todos**
os serviços, inclusive os de um profile inativo (medido com `docker compose config`): `ROOT_API_PORT` e
`DEPLOY_FRONT_PORT` ausentes derrubam até o `docker compose up` do Uso 1.

## Por que as `DEPLOY_*` não moram no `.env` da raiz

Medido: o `node tools/sync-env.mjs` — que roda a cada `create-module` — regrava o `.env` da raiz a partir
dos manifestos e **move para a seção `ORFAS`, comentada**, toda chave que nenhum manifesto exige. As
`DEPLOY_*` não são lidas por código algum, então caem lá, e o `docker compose config` passa a falhar. Também
não dá para declará-las como `ROOT_*` em `project.json:requiredEnv`: a regra `env-raiz-declarado` as
acusaria como "declarada e sem leitor" (só `adapters/`, `src/` e `packages/` leem `ROOT_*`).

**Onde mora "o ambiente que só o deploy lê" é decisão de doutrina da fase 2.** Isto aqui é o contorno
(um `.env` separado ao lado do compose, fora do alcance do `sync-env`), não a lei.

## Windows — porta do Postgres "acesso proibido"

Sintoma medido: publicar `127.0.0.1:<porta>` falha com *"An attempt was made to access a socket in a way
forbidden by its access permissions"* (ou `acesso proibido`) mesmo com a porta livre. Causa: o Hyper-V/WinNAT
reserva faixas de portas, que variam por máquina e por reinício. Confira as faixas:

```
netsh interface ipv4 show excludedportrange protocol=tcp
```

Escolha `DEPLOY_DB_PORT` (e `DEPLOY_FRONT_PORT`) fora delas. A publicação continua em loopback porque o
`npm run migrations` roda no host. O `docker-up.mjs` acusa o caso (`EACCES`) apontando a causa e o comando.
Se o banco não precisa ser alcançado do host, remova `ports` do serviço `db`.

## `docker-up.mjs`

| Subcomando | Faz |
|---|---|
| `up` | checa Docker ativo, Compose 2.23+, **os dois** `.env` presentes e portas livres (pula a checagem se a stack já roda); `compose --env-file … --env-file … --profile app up --build --detach --wait`; imprime `http://127.0.0.1:<porta>` |
| `stop` | `compose --profile app down` (volumes ficam) |
| `logs` | `compose --profile app logs --follow` |

Rode da raiz do projeto. Opções: `--compose-file`, `--root-env`, `--deploy-env` (padrão: o `.env` ao lado do
script), `--profile`, `--port-key` (repetível), `--url-key`. Zero
dependência, multiplataforma. A lógica pesada fica no compose e nos Dockerfiles.

## Variante — dependência externa fixada em tag (`additional_contexts`)

Quando o build precisa de um pacote que **não** está no contexto (por exemplo uma biblioteca interna
publicada em tag, extraída antes do build), o ERP usa um contexto adicional nomeado:

```yaml
build:
  context: .
  additional_contexts:
    ui_core: "${DEPLOY_UI_CORE_CONTEXT:?Prepare a biblioteca na tag fixa antes de subir}"
```

e, no Dockerfile, `COPY --from=ui_core /package.json …`. O valor é um **diretório** (ou URL git com tag),
sempre com `:?`. A tag fica registrada, e o script de subida é quem prepara o contexto. Use só quando a
dependência não puder vir do registry de pacotes — é a exceção, não o caminho.
