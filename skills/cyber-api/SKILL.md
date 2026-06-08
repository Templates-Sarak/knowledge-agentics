---
name: cyber-api
description: Auditoria de segurança de API — autorização (IDOR/BOLA), rate limiting, CORS, SSRF/CSRF e exposição de dados, com teste ativo no próprio app. Use ao auditar/implementar segurança de API. NÃO acione proativamente.
---

# Skill: Segurança — API & Abuso

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Verifica **quem pode fazer o quê** numa API e se ela resiste a abuso: autorização por objeto e por função,
rate limiting, exposição de dados e os clássicos web (CORS/SSRF/CSRF). Domínio de **revisão + config**,
com **DAST leve** no próprio app. Mutativa ao corrigir → HITL.

> Escopo de teste ativo: **só no próprio app** (staging/local) ou **alvo autorizado** — nunca terceiros.
> Autenticação/sessão é da `cyber-auth`; headers/TLS/exposição de arquivos é da `cyber-config` (use o
> `check_headers.py` de lá para CORS/headers). Validação na borda é norma (`padrao-escrita`). Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao auditar endpoints/API, implementar rate limit/autorização, ou antes de publicar uma API.
- Mutativa (corrige authz/config) → HITL obrigatório.

## Workflow
Trate **uma API por vez**. Checklist completo em `references/checklist-api.md`.

1. **Mapear endpoints** — liste rotas, métodos, quem deveria acessar cada uma e quais recebem ID de objeto.
2. **Autorização** (a falha nº1 em APIs):
   - **IDOR/BOLA**: todo acesso a objeto por ID checa **dono/permissão** (não confiar no ID do cliente).
   - **Function-level**: rotas admin/privilegiadas exigem role — não só "não aparece no front".
   - **Mass assignment**: aceitar só os campos permitidos (allowlist), nunca `req.body` inteiro em update.
   - **Multi-tenant**: isolamento por tenant em toda query.
3. **Abuso & limites**: **rate limiting/throttling** (login + endpoints caros), **limite de payload** e **paginação máxima**, **excessive data exposure** (DTO só com campos públicos).
4. **Web classics**: **CORS** (sem `*` com credenciais — ver `cyber-config`), **CSRF** (ação de estado exige token), **SSRF** (allowlist de host; bloquear IP interno/metadata), **webhook** (verificar assinatura), **GraphQL** (depth limit, introspection off em prod), **open redirect**, lógica/**race**.
5. **DAST leve (próprio app)** — teste autorizado: acessar objeto de outro usuário (espera 403), exceder o rate limit (espera 429), CORS com origin não permitida. Documente o resultado.
6. **HITL — plano** — achados + correção (middleware de authz, rate limiter, allowlist de campos/hosts, DTO). → "⚠️ Confirma?". **Aguarde.**
7. **Corrigir + reportar** — aplique; re-teste; reporte antes/depois.

## Regras e limites
- **NUNCA** confie no ID/role vindo do cliente — autorização é **server-side** por objeto e por função (anti-IDOR/BOLA).
- **NUNCA** aceite o corpo inteiro em update (mass assignment) — allowlist de campos.
- **NUNCA** configure CORS com `Access-Control-Allow-Origin: *` **junto** com credenciais.
- **NÃO** deixe endpoint caro/login **sem rate limit**; nem API sem limite de payload/paginação.
- **NUNCA** faça teste ativo fora do **próprio app/alvo autorizado** — DAST só com permissão.
- **NÃO** aplique correção sem o HITL do passo 6.
- **NÃO** saia do escopo: login/JWT/cookies → `cyber-auth`; headers/TLS → `cyber-config`; padrão de código (SSRF no código) → `cyber-codigo`.

## Checklist "pronta"
- [ ] Todo acesso por ID checa dono/permissão (IDOR/BOLA) e rotas privilegiadas exigem role?
- [ ] Mass assignment bloqueado (allowlist de campos); multi-tenant isolado?
- [ ] Rate limiting nos endpoints sensíveis/caros + limites de payload/paginação?
- [ ] Excessive data exposure evitado (DTO público); CORS sem `*`+credenciais?
- [ ] CSRF/SSRF/webhook-assinatura/GraphQL tratados?
- [ ] DAST leve feito **no próprio app**; HITL; antes/depois reportado?

## Referências (Camada 3 — leia sob demanda)
- `references/checklist-api.md` — checklist (alinhado ao OWASP API Top 10) com a correção de cada item + padrão de rate limiting.
