# Front em imagem própria, sob a mesma origem da API

A doutrina (`00-arquitetura` §4.4) manda o `web/` de cada módulo falar **só** com `/api/v1/<módulo>`, por
caminho relativo — o que exige a **mesma origem**. A raiz de composição só sobe a API; **quem publica o
front sob a mesma origem é o deploy**. Aqui isso é uma imagem `nginxinc/nginx-unprivileged` (versão fixa)
com os `web/dist` dos módulos e um proxy para o serviço `app`.

## O que a imagem entrega

| Caminho | Destino |
|---|---|
| `/api/v1/` | proxy para `app:<ROOT_API_PORT>` (todos os módulos, um processo) |
| `/<webPath>/` | `web/dist` do módulo dono, com fallback de SPA **só dentro do módulo** |
| `/<webPath>/assets/*` | arquivo com hash no nome, cache de 1 ano |
| `/healthz` | 200 sem tocar o backend — a sonda do `HEALTHCHECK` da imagem |
| `/` e qualquer outra | **404** (`location = / { return 404; }` explícita — sem ela a raiz devolve 403, índice de diretório negado) |

**Não há catch-all em `/`, por padrão.** Um `try_files … /index.html` na raiz serviria o app de um módulo
para rota que nenhum declarou (e mascararia 404 de API digitada errado). Se o projeto quiser uma home,
é um módulo com `webPath: "/"` — decisão dele, visível no manifesto.

## Derivar as `location` dos manifestos (procedimento — a ferramenta é da fase 2)

1. Liste `modules/*/module.json` (ignore `_*`). Fique com os de `webPath` **não-nulo**.
2. Para cada um, copie o bloco "BLOCO POR MÓDULO" do `nginx.conf`, trocando `<WEB_PATH>` pelo `webPath`
   sem a barra inicial duplicada. Exemplo, `webPath: "/catalogo"`:

   ```nginx
   location /catalogo/ {
       try_files $uri $uri/ /catalogo/index.html;
       expires -1;
   }
   location ~* ^/catalogo/assets/.+\.(js|css|woff2?|png|jpe?g|webp|svg|ico)$ {
       expires 1y;
       access_log off;
   }
   ```
3. Confira que não há dois módulos com o mesmo `webPath` nem `webPath` sobre `/api/v1/` (o gate já cobra
   `basePath` único; `webPath` único é conferência manual até a ferramenta existir).
4. `front.Dockerfile` não muda: o laço do estágio `build` descobre os módulos pela pasta e pelo
   `webPath`, e coloca cada `dist` em `/srv/site<webPath>/` — por isso `root` + `$uri`
   bastam e **`alias` não é usado** (`alias` + `try_files` é fonte conhecida de 404 falso).

## O contorno do `base` do Vite

O `vite.config.*` do molde (`_template/web/`) **não define `base`**. Sem ele, o `index.html` gerado
referencia `/assets/...` — absoluto na raiz — e o bundle não carrega quando o módulo é servido em
`/<webPath>/`. O estágio `build` do `front.Dockerfile` contorna passando `--base <webPath>/` na linha de
comando do `vite build`, módulo a módulo. **Pendência da fase 2:** o molde passar a definir `base`
(derivado do `webPath`, sem literal) — aí o estágio volta a usar `node tools/package.mjs`.

Há um segundo efeito a conferir no front de cada módulo: o roteador do cliente (React Router) precisa de
`basename` igual ao `webPath`, senão as rotas internas resolvem na raiz.

## Cabeçalhos, compressão, cache

- **Segurança:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e uma
  CSP de partida (`default-src 'self'`). **Ajuste a CSP ao projeto**; é ponto de partida, não verdade.
- **`add_header` não herda:** um `add_header` num bloco interno **substitui** os do bloco externo. Por isso
  os blocos de módulo usam `expires` para cache, nunca `add_header Cache-Control`.
- **gzip** para texto, JSON, JS, CSS e SVG; `gzip_vary on`.
- **Cache:** entrada HTML nunca (`expires -1`); `assets/` com hash, 1 ano.
- **Upload:** `client_max_body_size` na `location /api/v1/` — o maior upload declarado nos `config/` dos
  módulos. Sem isso vale 1 MB e o **proxy** devolve 413 antes de a API ver o arquivo.

## Detalhes que quebram em silêncio

- **Pasta do site própria (`/srv/site`):** copiar o build para `/usr/share/nginx/html` MESCLA com o
  `index.html` da imagem base, e `GET /` passa a devolver "Welcome to nginx!" com 200 — o oposto do 404
  prometido. Medido subindo a imagem. O validador acusa essa cópia (`front_copies_to_default_html_root`).

- **Upstream por variável + `resolver 127.0.0.11`:** `proxy_pass http://app:porta` resolve o nome **uma vez**,
  no boot. Com variável e o DNS do Docker, resolve a cada uso: não crasha se o `app` ainda não existe e não
  fala com o IP morto depois de redeploy.
- **Porta do upstream não é literal:** o `nginx.conf` é um *template* (`/etc/nginx/templates/`); a imagem
  roda `envsubst` no start. `NGINX_ENVSUBST_FILTER: ^APP_` limita a substituição a `APP_*`, para nenhum
  `$variavel` do nginx ser reescrito.
- **Não-root:** a imagem escuta em `8080` (porta interna do contrato da imagem) e não precisa de `80/443`;
  quem termina TLS é a entrada (túnel, Caddy ou Traefik), fora desta imagem.

## As duas imagens andam juntas

Backend e front saem do **mesmo commit** e publicam com a **mesma tag**. Nunca um front de uma versão
falando com uma API de outra. O pipeline (ou o passo 10 do workflow) é quem garante — não os arquivos.
