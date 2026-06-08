# Onde segredos se escondem (além do código-fonte)

O scan de código pega o óbvio. Estes são os pontos que **escapam** e precisam de varredura/atenção extra.

## 1. Bundle do front (crítico)
Tudo que vai para o cliente é **público**. Um segredo importado num componente acaba no JS servido.
- Rode o scanner no build: `scan_segredos.py --raiz dist` (ou `build`/`.next`).
- `NEXT_PUBLIC_*` / `VITE_*` / `REACT_APP_*` são **embutidas no bundle** → só para valores não-secretos.
- Chave de API de terceiro "no front" = exposta. O correto é um proxy no backend.

## 2. Logs e mensagens de erro
- `console.log`/logger imprimindo `req.headers.authorization`, body com senha, connection string.
- Stack trace em produção revelando token/var de ambiente.
- Rode o scanner em `logs/` e revise o que o logger registra.

## 3. Histórico do Git
- Segredo commitado e "removido" continua no histórico → **`git-especialista-repositorio`**.

## 4. Config e CI/CD
- `.env` versionado por engano, `*.pem`/`id_rsa`, `.npmrc` com token.
- Workflows de CI (`.github/workflows/*.yml`) com segredo em texto em vez de `secrets.*`.
- `docker-compose.yml`/`Dockerfile` com `ENV SECRET=...`.

## 5. Geração de segredos
- Token/ID de sessão gerado com `Math.random()` (previsível) em vez de CSPRNG (`crypto.randomBytes`/`secrets`).

## 6. Frontend storage
- Token de auth em `localStorage` (acessível a XSS) — preferir cookie `HttpOnly` (ver `cyber-auth`).

> Catálogo de padrões (o que conta como "segredo") em `scripts/config.json` — fonte única do ecossistema.
