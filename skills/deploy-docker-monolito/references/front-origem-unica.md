# Front em imagem própria, sob a mesma origem da API

A doutrina (`00-arquitetura` §4.4) manda o `web/` de cada módulo falar **só** com `/api/v1/<módulo>`, por
caminho relativo — o que exige a **mesma origem**. A raiz de composição só sobe a API; **quem publica o
front sob a mesma origem é o container**. Aqui isso é uma imagem `nginxinc/nginx-unprivileged` (versão
fixa) com os `web/dist` dos módulos e um proxy para o serviço `app`. Arquivos no projeto do template:
`front.Dockerfile`, `deploy/nginx.conf` (estático, do projeto) e `deploy/nginx.modules.conf` (**gerado**).

## O que a imagem entrega

| Caminho | Destino |
|---|---|
| `/api/v1/` | proxy para `app:<ROOT_API_PORT>` (todos os módulos, um processo) |
| `/<webPath>/` | `web/dist` do módulo dono, com fallback de SPA **só dentro do módulo** |
| `/<webPath>` | 301 para `/<webPath>/` (relativo — `absolute_redirect off`, a porta interna não vaza) |
| `/<webPath>/assets/*` | arquivo com hash no nome, cache de 1 ano |
| `/healthz` | 200 sem tocar o backend — a sonda do `HEALTHCHECK` da imagem |
| `/` e qualquer outra | **404** (`location = / { return 404; }` explícita — sem ela a raiz devolve 403, índice de diretório negado) |

**Não há catch-all em `/`, por padrão.** Um `try_files … /index.html` na raiz serviria o app de um módulo
para rota que nenhum declarou (e mascararia 404 de API digitada errado). Se o projeto quiser uma home,
é um módulo com `webPath` próprio — decisão dele, visível no manifesto.

## As `location` são geradas dos manifestos

`node tools/sync-deploy.mjs` lê `modules/*/module.json` (ignora `_*`), fica com os de `webPath`
**não-nulo** e escreve `deploy/nginx.modules.conf`: três blocos por módulo (o 301, o `location /<webPath>/`
com `try_files` e `expires -1`, e o `location ~*` dos `assets/` com `expires 1y`). O `nginx.conf` estático o
**inclui** dentro do `server` — por isso o ajuste do projeto no `nginx.conf` (CSP, cabeçalhos) sobrevive à
regeneração.

- **`create-module` regenera**; `verify` roda `sync-deploy --check` (reprova se divergir).
- **`webPath` fora de `^/[a-z][a-z0-9-]*$` não vira `location`** — o gerador recusa (o valor entra num arquivo
  do nginx; o manifesto já o cobra pelo schema).
- **Tunables** (corpo máximo do upload, timeout do proxy) são `config/deploy.json:front` — o gerador os
  escreve no mesmo arquivo, no nível do `server`. Não são marcador nem literal no `nginx.conf`.
- `front.Dockerfile` não muda: o laço do estágio `build` descobre os módulos pela pasta e pelo `webPath`,
  e coloca cada `dist` em `/srv/site<webPath>/` — por isso `root` + `$uri` bastam e **`alias` não é usado**
  (`alias` + `try_files` é fonte conhecida de 404 falso).
- **Legado sem `module.json`:** escreva os três blocos à mão no `nginx.modules.conf` com o formato acima; não
  há o que gerar sem manifesto.

## O `base` do Vite

O `vite.config.*` do molde lê o `webPath` do próprio `module.json` e o usa como `base` (`/` se nulo) —
nenhum `--base` na linha de comando do build (ADR-021 §2). Há um segundo efeito a conferir no front de cada
módulo: o roteador do cliente (React Router) precisa de `basename` igual ao `webPath`, senão as rotas
internas resolvem na raiz (o molde não usa roteador).

## Cabeçalhos, compressão, cache

- **Segurança:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e uma
  CSP de partida (`default-src 'self'`). **Ajuste a CSP ao projeto**; é ponto de partida, não verdade.
- **`add_header` não herda:** um `add_header` num bloco interno **substitui** os do bloco externo. Por isso
  os blocos de módulo gerados usam `expires` para cache, nunca `add_header Cache-Control`.
- **gzip** para texto, JSON, JS, CSS e SVG; `gzip_vary on`.
- **Cache:** entrada HTML nunca (`expires -1`); `assets/` com hash, 1 ano.
- **Upload:** `client_max_body_size` (de `config/deploy.json`) — o maior upload que a API aceita. Sem isso
  vale 1 MB e o **proxy** devolve 413 antes de a API ver o arquivo.

## Detalhes que quebram em silêncio

- **Pasta do site própria (`/srv/site`):** copiar o build para `/usr/share/nginx/html` MESCLA com o
  `index.html` da imagem base, e `GET /` passa a devolver "Welcome to nginx!" com 200 — o oposto do 404
  prometido. O validador acusa essa cópia (`front_copies_to_default_html_root`).
- **Upstream por variável + `resolver 127.0.0.11`:** `proxy_pass http://app:porta` resolve o nome **uma vez**,
  no boot. Com variável e o DNS do Docker, resolve a cada uso: não crasha se o `app` ainda não existe e não
  fala com o IP morto depois de redeploy.
- **Porta do upstream não é literal:** o `nginx.conf` é um *template* (`/etc/nginx/templates/`); a imagem
  roda `envsubst` no start. `NGINX_ENVSUBST_FILTER: ^APP_` limita a substituição a `APP_*`, para nenhum
  `$variavel` do nginx ser reescrito. O arquivo gerado é copiado para `/etc/nginx/modules.d/` e lido por
  `include` — sem `envsubst`, porque não tem variável.
- **Não-root:** a imagem escuta em `8080` (porta interna do contrato da imagem) e não precisa de `80/443`;
  quem termina TLS é a entrada (túnel, Caddy ou Traefik), fora desta imagem.

## Módulo Python com front

O molde Python nasce sem `web/`: sem `front.Dockerfile`, sem `nginx.conf`, sem serviço `front`. Se um módulo
Python ganhar `web/`, copie `front.Dockerfile` e `deploy/nginx.conf` do binding `typescript`, acrescente o
serviço `front` ao `compose.yml`, `DEPLOY_FRONT_PORT` ao `deploy/.env.example` e a chave `front` ao
`config/deploy.json` — o `sync-deploy` passa a gerar as rotas (o gatilho é a presença de `deploy/nginx.conf`)
e o gate passa a exigir os arquivos de front.

## As duas imagens andam juntas

Backend e front saem do **mesmo commit** e publicam com a **mesma tag**. Nunca um front de uma versão
falando com uma API de outra. O pipeline (ou o passo 7 do workflow) é quem garante — não os arquivos.
