# Vercel por stack — config e compatibilidade

Específico da Vercel. Combine com o pré-deploy comum (`predeploy-comum.md`). Templates copiáveis em
`assets/vercel-templates/`.

## Config esperada por stack

| Stack | Arquivo | O que verificar |
|---|---|---|
| Next.js | `next.config.js`/`.ts` | `output`, `images.domains`/`remotePatterns`, redirects/rewrites |
| Vite / React SPA | `vercel.json` | `rewrites` de SPA (todas as rotas → `/`) |
| Python (FastAPI/Flask) | `vercel.json` | `builds`/`routes` com `@vercel/python`; handler em `main.py` |
| Monorepo | `vercel.json` / projeto | `rootDirectory` correto do app a publicar |

Se o `vercel.json` for necessário e não existir, crie o mínimo da stack (template em `assets/vercel-templates/`).

## Mínimos (resumo — texto completo nos templates)
- **SPA:** `{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }`
- **Python FastAPI:** `builds` com `@vercel/python` + `routes` apontando para `main.py`.
- **Monorepo:** `rootDirectory` do app + `framework`.

## Notas de compatibilidade (Vercel = serverless, imutável, sem FS persistente)

| Tecnologia | Problema comum | Solução |
|---|---|---|
| Python + Postgres | `psycopg2` falha no build | usar `psycopg2-binary` |
| FastAPI | timeout em operação longa | background tasks / filas |
| Next.js + imagens | domínios externos bloqueados | declarar em `next.config` `images.domains`/`remotePatterns` |
| Qualquer | escrita em filesystem | usar Vercel Blob, S3 ou R2 |

## Env vars
Compare via CLI: `vercel env ls` (lista por ambiente) e `vercel pull` (baixa para `.vercel/.env.*`).
Adicione com `vercel env add <NOME> <ambiente>`. Nunca em `vercel.json`.
