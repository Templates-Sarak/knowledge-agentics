# Hardening de HTTP/Infra — política e valores

Referência do que o `check_headers.py` mede e como corrigir. Valores são ponto de partida — ajuste ao app.

## Headers de segurança (resposta)
| Header | Valor recomendado | Protege contra |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; object-src 'none'; frame-ancestors 'self'` | XSS, injeção de recurso |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | downgrade p/ HTTP |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `X-Frame-Options` | `DENY` ou `SAMEORIGIN` | clickjacking (ou use `frame-ancestors` no CSP) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | vazamento de URL |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=()` | abuso de APIs do browser |

> Em Next/Express, configure via `next.config` `headers()` / `helmet`. CORS é tratado junto da `cyber-api`.

## Cookies (conferir nas respostas `Set-Cookie`)
- `HttpOnly` + `Secure` + `SameSite` (ver `cyber-auth`).

## Arquivos/paths que não podem responder 200
- `/.git/…`, `/.env*`, `/backup.*`, `/dump.sql`, `/.DS_Store`, `/config.json`, `/phpinfo.php`, `/admin` sem auth.
- O `check_headers.py` sonda esses paths; qualquer 200 é exposição → bloquear no servidor/CDN.

## TLS & transporte
- HTTPS obrigatório; redirect 301 de HTTP→HTTPS; HSTS ligado.
- TLS ≥ 1.2; sem ciphers fracos (avaliar com SSL Labs, fora do escopo do script).

## Erros & debug em produção
- **Sem stack trace/SQL/caminho** na resposta de erro (mensagem genérica + log interno).
- `DEBUG=false`/`NODE_ENV=production`; sem endpoints de debug expostos.
- Sem listagem de diretório no servidor.
