---
name: cyber-auth
description: Auditoria de autenticação e sessão — hashing de senha (bcrypt/argon2), JWT (alg/exp/assinatura), cookies, MFA e brute-force. Use ao auditar/implementar login e sessão. NÃO acione proativamente.
---

# Skill: Segurança — Autenticação & Sessão

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Verifica se **quem entra é quem diz ser** e se a sessão é segura: senhas bem guardadas, tokens íntegros,
cookies protegidos e login resistente a abuso. Domínio de **revisão/julgamento** (não scriptável); a
correção é mutativa → HITL.

> Rate limiting no login e CORS são da `cyber-api` (referenciar); segredo do JWT hardcoded é da
> `cyber-segredos`; cripto fraca de hash também aparece no `cyber-codigo`. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao auditar/implementar autenticação e sessão, ou antes de publicar sistema com contas/login.
- Mutativa (corrige auth) → HITL obrigatório antes de alterar.

## Workflow
Trate **um sistema por vez**. Checklist completo em `references/checklist-auth.md`.

1. **Mapear o fluxo** — leia o código de login/registro/sessão (`Read`/`Grep` por `jwt`, `bcrypt`, `cookie`, `session`, `password`).
2. **Auditar por dimensão** (ver `references/checklist-auth.md`):
   - **Senha:** armazenada com `bcrypt`/`argon2` (nunca MD5/SHA1/texto plano); política mínima.
   - **JWT/token:** assinatura verificada, **alg fixo** (rejeitar `none`/troca de alg), `exp` curto, segredo forte (no `.env`).
   - **Cookies:** `HttpOnly` + `Secure` + `SameSite` em cookies de sessão; token **não** em `localStorage`.
   - **Abuso:** proteção a **brute-force** (lockout/backoff + rate limit — ver `cyber-api`); **account enumeration** (mensagem/tempo uniforme em "usuário não existe" vs "senha errada").
   - **MFA** e **credenciais default** (remover admin/admin).
3. **HITL — plano** — achados + correção por arquivo (trocar hash, ajustar flags de cookie, fixar alg, etc.). → "⚠️ Confirma?". **Aguarde.**
4. **Corrigir + verificar** — aplique; teste o fluxo de login (não pode quebrar). Re-audite.
5. **Reportar** — dimensões antes/depois.

## Regras e limites
- **NUNCA** aceite senha em texto plano ou hash fraco (MD5/SHA1/SHA-256 puro) — use `bcrypt`/`argon2` com salt.
- **NUNCA** aceite JWT com `alg: none` ou sem verificação de assinatura; segredo do token vai no `.env` (forte).
- **NUNCA** deixe cookie de sessão sem `HttpOnly`/`Secure`/`SameSite`, nem token de auth em `localStorage` (exposto a XSS).
- **NÃO** revele em login se o usuário existe (account enumeration) — resposta uniforme.
- **NÃO** aplique mudanças sem o HITL do passo 3; teste o login após.
- **NÃO** saia do escopo: rate-limit/CORS/IDOR → `cyber-api`; segredo hardcoded → `cyber-segredos`; cripto em geral → `cyber-codigo`.

## Checklist "pronta"
- [ ] Senha com `bcrypt`/`argon2` (sem MD5/SHA1/plano) e política mínima?
- [ ] JWT com assinatura verificada, `alg` fixo (sem `none`), `exp` e segredo no `.env`?
- [ ] Cookies de sessão `HttpOnly`/`Secure`/`SameSite`; token fora do `localStorage`?
- [ ] Brute-force mitigado (lockout/rate) e sem account enumeration?
- [ ] MFA considerado; credenciais default removidas?
- [ ] HITL feito; login testado; antes/depois reportado?

## Referências (Camada 3 — leia sob demanda)
- `references/checklist-auth.md` — checklist detalhado de autenticação/sessão com a correção de cada item.
