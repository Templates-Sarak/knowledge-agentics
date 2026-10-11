# Produção — o molde do compose

Arquivo: `assets/compose.production.yml`. É um **molde**: vai ao servidor sozinho, ao lado do `.env`, e
puxa as imagens do registry. **Nunca builda.** Escolhas de entrada e de registry são **do HITL** do
passo 12 do workflow — o molde não decide por ninguém.

## O que o molde fixa

| Controle | Como | Por quê |
|---|---|---|
| Imagem por **digest** | `<registry>/<project>-app@${DEPLOY_APP_DIGEST:?}` | tag se move; o digest que já rodou, não — "reverter" volta ao bit exato |
| `cap_drop: [ALL]` | todo serviço | o processo não precisa de nenhuma capability |
| `no-new-privileges` | `security_opt` em todo serviço | impede ganho de privilégio por setuid |
| **Nenhuma** porta publicada | sem `ports` | o servidor não aceita conexão de entrada; a entrada é um serviço na rede |
| Rede dedicada | `networks: backbone` | isola o projeto; **sem** `internal: true` |
| `restart: unless-stopped` | todo serviço | sobe com o host, respeita `stop` manual |
| `stop_grace_period` | `${DEPLOY_STOP_GRACE_PERIOD:?}` | ≥ teto de desligamento + folga, senão o Docker manda `SIGKILL` com trabalho em voo |
| `env_file: .env` | `app` | segredo entra como ambiente do processo; o `.env` mora só no servidor, e só ele |
| `depends_on … service_healthy` | `front` espera o `app` | o proxy não sobe apontando para o vazio |

**Por que a rede não é `internal: true`:** esse flag corta a saída para a internet. O backend precisa
chegar ao banco gerenciado e a APIs externas. "Interna" aqui quer dizer **sem porta publicada e numa rede
própria**, não "sem rota de saída".

**`stop_grace_period`:** o template **não define** teto de desligamento hoje — `composition.*` não trata
`SIGTERM`. Até existir, meça o pior pedido em voo e dimensione por ele; é pendência da fase 2.

## Os dois arquivos de ambiente no servidor

Decisão: **manter a separação do local**. No servidor ficam, ao lado do compose:

| Arquivo | Equivale a | Conteúdo | Quem lê |
|---|---|---|---|
| `.env` | o `.env` da raiz | `ROOT_API_PORT`, `<MODULE>_*` (segredos reais) | o processo do `app` (`env_file`) e a interpolação |
| `.env.deploy` | `<INFRA_DIR>/.env` | `DEPLOY_REGISTRY`, `DEPLOY_APP_DIGEST`, `DEPLOY_FRONT_DIGEST`, `DEPLOY_STOP_GRACE_PERIOD` | só o compose |

```
docker compose -f compose.production.yml --env-file .env --env-file .env.deploy up -d
```

O motivo **não** é o `sync-env` — ele não roda no servidor, que não tem a árvore de fonte. É o resto:

1. **Mesma forma que o local** — um comando e dois arquivos em ambos; ninguém aprende duas convenções.
2. **O ambiente do processo não carrega registry nem digests.** Com tudo num `.env`, o `env_file` injetaria as
   `DEPLOY_*` no `app`, que não as usa.
3. **Rotacionar o digest não toca segredo.** A publicação (ou um agente) reescreve só o `.env.deploy`; o `.env`
   com credenciais não é aberto por quem só troca versão.

A leitura contrária (um arquivo só, mais simples) é válida em servidor pequeno; o custo é o item 2 e 3.
O servidor não é um clone do repositório: os dois arquivos vivem só lá, fora do versionamento.

## A entrada (escolhida no HITL)

O molde deixa o marcador `<ENTRY>`. Três caminhos comuns, todos como **serviço na rede `backbone`**, com
imagem por digest, `cap_drop: [ALL]` e `no-new-privileges`:

- **Túnel `cloudflared`** — sai do servidor, nunca aceita conexão; nenhum certificado local. O token vem
  do cofre, entra no `.env` (`:?`). Zero porta aberta no host — o caso mais fechado.
- **Caddy** — TLS automático; precisa publicar 80/443 (única exceção ao "sem portas", declarada no HITL).
- **Traefik** — roteamento por label; mesma exceção de portas que o Caddy.

A entrada fala com `front:8080` pelo nome do serviço. Qual usar depende de onde o servidor está — por isso
é decisão do HITL, não do molde.

## Registry e ordem da publicação

1. As **duas imagens**, mesma tag de commit, `--build-arg <PROJECT>_VERSION=<commit>`.
2. Push no registry escolhido no HITL (sem `latest`).
3. **Registrar os digests** (`sha256:…`) que o registry devolveu — são eles que entram em
   `DEPLOY_APP_DIGEST` e `DEPLOY_FRONT_DIGEST`.
4. No servidor: os digests no `.env.deploy`; `docker compose -f compose.production.yml --env-file .env
   --env-file .env.deploy up -d`.
   O compose **para e sobe** o serviço recriado — nunca duas instâncias simultâneas (relevante quando
   há agendador interno).

Reversão = escrever os digests anteriores no `.env.deploy` e repetir o `up -d`.

## Variante declarada — emulador local de Supabase (postgrest + nginx)

Para o projeto cujos adapters usam `@supabase/supabase-js`: o SDK **não** fala o protocolo do Postgres,
fala PostgREST por HTTP, e monta a URL como `<base>/rest/v1/<tabela>`. O SellersGO resolve em dev com três
serviços no compose local — **não** em produção (lá o banco é o gerenciado):

| Serviço | Imagem | Papel |
|---|---|---|
| `db` | `postgres:16-alpine` (versão fixa) | as tabelas dos módulos |
| `rest` | `postgrest/postgrest:v12.2.3` | expõe as tabelas como REST; `PGRST_JWT_SECRET` do `.env` com `:?` |
| `gateway` | `nginx:1.27-alpine` | remove o prefixo `/rest/v1` — a única peça que existe por causa do formato do SDK |

Credenciais e chaves JWT locais vêm do `.env` (gitignored), nunca de literal no compose. Só entra se o
projeto usa `supabase-js`; quem usa o adapter `postgres` do template não precisa.
