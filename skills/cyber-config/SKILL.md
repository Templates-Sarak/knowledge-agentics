---
name: cyber-config
description: Hardening de configuração HTTP com teste ativo (DAST leve) — headers de segurança, TLS e arquivos/paths sensíveis expostos (check_headers.py). Use ao endurecer a config de um app ou auditar a superfície HTTP. NÃO acione proativamente.
---

# Skill: Segurança — Configuração & Hardening (DAST)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Endurece a **superfície HTTP/infra** e confirma com **teste ativo**: headers de segurança presentes, nada
sensível exposto, TLS forçado, sem debug vazando. É o domínio com **DAST** — roda contra um app real.
Mutativa ao corrigir → HITL.

> ⚠️ Teste ativo **só no próprio app** (staging/local) ou **alvo autorizado** — nunca terceiros.
> CORS é decidido junto da `cyber-api`; flags de cookie junto da `cyber-auth`; aqui mora a **política de
> headers** e a sondagem de exposição. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao endurecer a config de um app, antes de publicar, ou ao auditar a superfície HTTP.
- Mutativa (ajusta headers/config) → HITL; teste ativo exige URL própria/autorizada.

## Workflow
Trate **um app por vez**. Política e valores em `references/hardening.md`.

1. **Confirmar autorização** — a URL é do **próprio app** (staging/local) ou alvo autorizado? Se não, **pare**.
2. **DAST de headers/paths** — `python scripts/check_headers.py --url <url-propria>` → JSON: headers presentes/faltando + `paths_expostos` (qualquer 200 em `/.git`, `/.env`, `/backup.*` é exposição).
3. **Revisar config estática** — `next.config`/`helmet`/servidor: headers, redirect HTTP→HTTPS, HSTS, `Set-Cookie` flags, `NODE_ENV=production`/`DEBUG=false`, sem listagem de diretório.
4. **Erros & debug** — confirme que erros não retornam stack trace/SQL/caminho; sem endpoints de debug.
5. **HITL — plano** — headers a adicionar, paths a bloquear, debug a desligar, TLS/HSTS. → "⚠️ Confirma o hardening?". **Aguarde.**
6. **Aplicar + re-testar** — configure; rode o `check_headers.py` de novo → `headers_faltando: []` e `paths_expostos: []`.
7. **Reportar** — use `assets/relatorio_seguranca.md` (consolidado dos domínios cyber).

## Regras e limites
- **NUNCA** rode o DAST contra um alvo que não seja **próprio/autorizado** — segurança defensiva, não ataque a terceiros.
- **NUNCA** publique com `/.git`, `/.env`, backups ou `phpinfo` respondendo 200 — exposição direta de segredo/código.
- **NÃO** deixe stack trace/erro verboso em produção — mensagem genérica + log interno (sem segredo, ver `cyber-dados`).
- **NÃO** sirva sem HTTPS/HSTS; **NÃO** aplique config sem o HITL do passo 5.
- **NÃO** saia do escopo: CORS/SSRF/authz → `cyber-api`; cookies de sessão → `cyber-auth`; segredo no código → `cyber-segredos`.

## Checklist "pronta"
- [ ] Alvo de teste é próprio/autorizado (confirmado)?
- [ ] `check_headers.py` rodado: headers de segurança presentes e nenhum path sensível em 200?
- [ ] HTTPS forçado + HSTS; cookies com flags (ver `cyber-auth`)?
- [ ] Erros sem stack trace; debug desligado em produção?
- [ ] HITL feito; re-teste com `headers_faltando: []` e `paths_expostos: []`?
- [ ] Relatório consolidado preenchido?

> **Em escala:** a auditoria dos 7 domínios cyber é orquestrada pelo command `/cyber1-auditar` (fan-out: um agente
> `cyber-auditor` por domínio → relatório consolidado em `.sarak/security/`) e a adequação por `/cyber2-adequar`
> (HITL por achado, ordenado por severidade, re-scan via `cyber-auditor`). `cyber-config` é o lar do **formato
> consolidado** (relatório + `achados[]`).

## Referências (Camada 3 — leia sob demanda)
- `scripts/check_headers.py` + `scripts/config.json` — DAST leve (headers + sondagem de paths) no próprio app.
- `references/hardening.md` — política de headers (valores), arquivos/paths a bloquear, TLS, debug.
- `references/achados-format.md` — schema do `achados[]` (fila máquina da correção) + roteador severidade/domínio.
- `assets/relatorio_seguranca.md` — template do **relatório consolidado** de segurança (todos os domínios cyber).
