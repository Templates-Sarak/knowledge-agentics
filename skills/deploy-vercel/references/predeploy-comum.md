# Pré-deploy comum (reutilizável por qualquer `deploy-*`)

Validações independentes de provedor, feitas **antes** de publicar em qualquer alvo (Vercel, Netlify,
Railway...). Os futuros `deploy-*` referenciam esta lista em vez de duplicá-la. O motor determinístico é
`scripts/validar_predeploy.py` (config de build, env exigidas, segredos versionados).

## 1. Build local passa
- Rode o build da stack (`npm run build`, `pnpm build`, `go build`, startup do servidor Python...).
- **Bloqueante:** build quebrado localmente quase sempre quebra no provedor. Resolva antes de seguir.

## 2. Variáveis de ambiente declaradas
- Leia o `.env.example` (fonte da verdade das vars exigidas) — nunca o `.env` real.
- Garanta que toda variável exigida existe no destino, por ambiente (production / preview / development).
- **Nunca** coloque valor real em arquivo versionado (config do provedor, repositório). Segredos só no cofre do provedor.

## 3. Sem segredos versionados
- Nenhum `.env`, `.env.local`, `.env.production`, `*.pem` commitado.
- Nenhum literal de `secret`/`password`/`api_key`/`token`/credencial em arquivos de configuração versionados.
- Achou? Remova do versionamento, rotacione o segredo exposto e mova para o cofre do provedor.

## 4. Dependências compatíveis com o destino
- Sinalize o que costuma quebrar em ambientes serverless/imutáveis:

| Problema | Exemplo | Solução |
|---|---|---|
| Binário nativo | `psycopg2` (Python) | usar `psycopg2-binary` |
| Escrita em filesystem | `fs.writeFileSync(...)` | storage externo (S3, R2, Blob) |
| Porta hardcoded | `app.run(port=8000)` | usar a env `PORT` |
| Operação longa | tarefa > limite de timeout | background job / fila / streaming |

## 5. Pronto para o passo específico do provedor
Com 1–4 verdes, prossiga para a configuração e publicação específicas do alvo (ex.: `vercel.json` e
`vercel deploy` na skill `deploy-vercel`).
