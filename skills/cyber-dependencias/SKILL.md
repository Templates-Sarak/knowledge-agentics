---
name: cyber-dependencias
description: Auditoria de dependências e supply chain — CVEs (npm/pip/osv audit), pacotes abandonados, typosquatting e scripts de instalação, com correção sob HITL. Use ao auditar segurança de dependências ou ao adicionar pacotes novos. NÃO acione proativamente.
---

# Skill: Segurança — Dependências (Supply Chain)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Garante que o projeto não herde vulnerabilidades de terceiros: varre **CVEs** e os vetores de **cadeia de
suprimentos** (lockfile, abandono, typosquat, `postinstall`). Mutativa ao corrigir → HITL antes de atualizar.

> Usa as ferramentas consagradas do ecossistema (`npm audit`/`pip-audit`/`osv-scanner`) — não reinventa base
> de CVE. Segredos em deps/config → `cyber-segredos`; código inseguro → `cyber-codigo`. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, em auditoria de segurança, antes de publicar, ao adicionar/atualizar dependências relevantes, ou periodicamente.
- Mutativa (atualiza pacotes) → HITL obrigatório antes de aplicar fixes que possam quebrar.

## Workflow
Trate **um projeto por vez**. Detalhe dos vetores em `references/supply-chain.md`.

1. **Auditar CVEs** — rode a ferramenta da stack: `npm audit --json > audit.json` (Node), `pip-audit` (Python) ou `osv-scanner -r .`. Para Node, normalize com `python scripts/parse_audit.py --arquivo audit.json` (resumo por severidade).
2. **Supply chain** — verifique lockfile (presente/íntegro), pacotes **abandonados**, **typosquatting** (nome/publisher), e scripts `postinstall`/`preinstall` suspeitos (ver `references/supply-chain.md`).
3. **Priorizar** — ordene `critical > high > moderate > low`; separe o que tem fix do que não tem.
4. **HITL — plano** — apresente: vulnerabilidades por severidade, fixes propostos (`npm audit fix`, updates, overrides) e **quais podem quebrar** (major/`--force`). → "⚠️ Confirma os updates?". **Aguarde.**
5. **Aplicar + verificar** — aplique o aprovado; rode o **build/testes** (update não pode quebrar a app); re-audite até `critical/high = 0` (ou justificado).
6. **Reportar** — severidades antes/depois, pacotes atualizados, pendências justificadas.

## Regras e limites
- **NUNCA** ignore `critical`/`high` sem justificativa técnica documentada **e** aprovação (HITL).
- **NUNCA** rode `npm audit fix --force` sem HITL — atravessa majors e pode quebrar a aplicação.
- **NÃO** atualize dependência sem rodar build/testes logo após (passo 5 é bloqueante).
- **NÃO** instale pacote novo sem checar nome exato/publisher (typosquatting) e scripts de install.
- **NÃO** use `npm install` no CI para builds reprodutíveis — use `npm ci` (respeita o lockfile).
- **NÃO** saia do escopo: segredo em dep/config → `cyber-segredos`; padrão de código inseguro → `cyber-codigo`.

## Checklist "pronta"
- [ ] Auditoria rodada com a ferramenta da stack (npm/pip/osv) e severidades resumidas?
- [ ] Lockfile íntegro; abandono/typosquat/postinstall verificados?
- [ ] HITL feito; fixes aplicados e os que quebram (major) confirmados?
- [ ] Build/testes verdes após os updates?
- [ ] `critical`/`high` zerados ou justificados; antes/depois reportado?

## Referências (Camada 3 — leia sob demanda)
- `scripts/parse_audit.py` — normaliza `npm audit --json` num resumo por severidade.
- `references/supply-chain.md` — ferramentas por stack + vetores (lockfile, abandono, typosquat, postinstall) e estratégia de fix.
