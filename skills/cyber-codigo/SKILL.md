---
name: cyber-codigo
description: Análise estática de segurança (SAST) — injeção, XSS, eval, desserialização insegura, cripto fraca e random inseguro (sast_scan.py). Audita normas do padrao-escrita, não as redefine. Use ao auditar segurança do código ou em revisão de PR sensível. NÃO acione proativamente.
---

# Skill: Segurança — Código (SAST)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Procura **padrões de código inseguro** que viram vulnerabilidade quando tocam input externo: injeção,
XSS, `eval`, desserialização, cripto fraca, random previsível. É **estática** (não roda o código).
Mutativa ao corrigir → HITL antes de refatorar.

> SQLi, **validação de todo input na borda `api/`** e **queries parametrizadas** já são **norma** do
> `padrao-escrita` — aqui se **audita conformidade**. Segredos → `cyber-segredos`; deps → `cyber-dependencias`;
> teste dinâmico (DAST) → `cyber-config`. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, em auditoria de segurança, antes de publicar, ou em revisão de código sensível (auth, pagamentos, upload).
- Mutativa (refatora código inseguro) → HITL obrigatório antes de aplicar.

## Workflow
Trate **um projeto/módulo por vez**. Significado e correção de cada achado em `references/padroes-sast.md`.

1. **Varrer** — `python scripts/sast_scan.py --raiz <projeto>` (JSON: `tipo`, `confianca`, `arquivo:linha`, trecho).
2. **Triar pelo fluxo do dado** — `confianca: alta` prioriza; `media`/`baixa` só viram risco se **input externo** alcança o ponto (siga o dado da borda `api/` até o sink). Descarte falsos positivos (ex.: `Math.random` para animação).
3. **Classificar** — para cada confirmado: tipo de falha (injeção/XSS/cripto/…), severidade, e a correção segura do `references/padroes-sast.md`.
4. **HITL — plano** — apresente os achados confirmados + correção proposta por arquivo. → "⚠️ Confirma os patches?". **Aguarde.**
5. **Refatorar** — aplique a correção segura (args em array, sanitização, `safe_load`, bcrypt/argon2, CSPRNG, allowlist de host). Preserve comportamento; teste.
6. **Re-scan + reportar** — rode de novo; confirme que os achados confirmados sumiram; reporte antes/depois.

## Regras e limites
- **NÃO** trate a saída como verdade — é heurística; **triar pelo fluxo do input** antes de afirmar vulnerabilidade.
- **NUNCA** "resolva" um achado escondendo o padrão (ex.: renomear) — corrija a causa (não concatenar input, sanitizar, etc.).
- **NUNCA** use cripto fraca para senha (MD5/SHA1) — `bcrypt`/`argon2`; nem `Math.random` para token — CSPRNG.
- **NÃO** aplique refatoração sem o HITL do passo 4; preserve o comportamento (é correção de segurança, não feature).
- **NÃO** saia do escopo: segredo hardcoded → `cyber-segredos`; CVE de dep → `cyber-dependencias`; authz/IDOR/rate-limit → `cyber-api`; headers/TLS → `cyber-config`.

## Checklist "pronta"
- [ ] `sast_scan.py` rodado e os achados triados pelo fluxo do input (FP descartados)?
- [ ] Cada confirmado classificado (tipo, severidade, correção)?
- [ ] HITL feito; patches aplicados preservando comportamento?
- [ ] Cripto/random corrigidos (bcrypt/argon2; CSPRNG) onde aplicável?
- [ ] Re-scan limpo dos confirmados; antes/depois reportado?

## Referências (Camada 3 — leia sob demanda)
- `scripts/sast_scan.py` + `scripts/config.json` — SAST por padrões (com `confianca`); padrões no config.
- `references/padroes-sast.md` — risco e **correção segura** de cada tipo + como triar por confiança.
