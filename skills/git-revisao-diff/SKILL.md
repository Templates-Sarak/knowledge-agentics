---
name: git-revisao-diff
description: Revisão de qualidade do diff staged antes do commit — checa só o que mudou contra o padrao-escrita e marca debug/TODO/conflito (revisar_diff.py). Complementar à git-verificacao-commit (segredos). Use ao revisar um diff/PR ou quando o gate bloquear. NÃO acione proativamente.
---

# Skill: Revisão de Diff (gate de qualidade pré-commit)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita, code-diagnostico`. Consulte-as antes de iniciar.

Revisa **o que está sendo commitado** — só o diff staged, não o repo inteiro — contra o `padrao-escrita`,
para que código fora do padrão não entre. Tem uma parte **determinística** (script, roda no hook) e uma
parte de **julgamento** (conformidade/clareza, feita pelo agente quando invocada).

> Complementar à `git-verificacao-commit` (aquela é o gate de **segredos**; esta é o gate de **qualidade**).
> Revisão do **repo inteiro** é da `code-diagnostico`; aqui o foco é o **diff**. Os limiares precisos vêm dos
> validadores de linguagem (`padrao-python`/`padrao-typescript`/`padrao-go`/`padrao-java`). Globais em `CLAUDE.md`.

## Quando usar
- Ao revisar um diff/PR antes do commit, quando o gate `revisar_diff.py` bloquear, ou para checar o staged manualmente.
- Roda no **pre-commit hook** (parte determinística). A revisão profunda (julgamento) é quando o agente é chamado.

> **Delegável:** a revisão de julgamento pode ser delegada ao agente **`code-revisor`** (perspectiva independente,
> read-only, em contexto isolado) — sob demanda ou por orquestradores (ex.: por tarefa no `/code3-adequar`). Pode
> rodar em **fan-out por lente** (bugs / padrão / segurança). Esta skill é a **lógica e os critérios** que ele aplica.

## Como o gate é acionado
- **Determinístico (hook):** o `pre-commit` roda `revisar_diff.py` no staged → **exit 1** bloqueia em conflito de merge / breakpoint de debug. É instalado junto com o gate de segredos (ver `git-commit-inicial`), encadeado no mesmo `pre-commit`.
- **Julgamento (agente):** a conformidade fina (limiares, SRP, clareza) é o modelo lendo o diff — invocada manualmente, ou via `claude -p` no hook se você quiser revisão por modelo a cada commit (mais lento).

## Workflow (revisão pelo agente)
Trate **um diff por vez**. Critérios em `references/criterios.md`.

1. **Pegar o diff e os arquivos alterados** — `git diff --cached` e `git diff --cached --name-only`.
2. **Gate determinístico** — `python scripts/revisar_diff.py` (conflito de merge, breakpoint, log de debug, TODO, `.only`/`.skip`). Bloqueio → resolver antes.
3. **Limiares por linguagem** — rode o validador da stack **nos arquivos alterados**: `padrao-python` (`validate.py`), `padrao-typescript` (`validate.mjs`), `padrao-go`/`padrao-java` (linter configurado). Função ≤40, aninhamento ≤3, ≤4 params.
4. **Conformidade & clareza (julgamento)** — no que mudou: SRP (a mudança faz uma coisa?), nomes claros, sem hardcoded (config/.env), validação na borda, testes acompanham (norma §9), sem lógica em dumb component. Ver `references/criterios.md`.
5. **Classificar & reportar** — achados com `arquivo:linha`, severidade e correção. **Bloqueio** (impede commit) × **aviso** (registrar).
6. **(Se gate bloqueou)** — orientar a correção; nunca `--no-verify` para burlar achado real.

## Regras e limites
- **NÃO** revise o repo inteiro aqui — só o **diff staged**; auditoria completa é da `code-diagnostico`.
- **NUNCA** oriente `git commit --no-verify` para passar por cima de um bloqueio real (conflito/debug) — resolva.
- **NÃO** duplique os limiares — eles vêm dos validadores de `padrao-*` (rode-os nos arquivos alterados).
- **NÃO** trate `aviso` como bloqueio nem `bloqueio` como opcional — respeite a severidade do config.
- **NÃO** saia do escopo: segredo no staged → `git-verificacao-commit`; histórico → `git-especialista-repositorio`; backlog do repo → `code-diagnostico`.

## Checklist "pronta"
- [ ] Diff e arquivos alterados obtidos (escopo = só o staged)?
- [ ] `revisar_diff.py` rodado; conflito de merge/breakpoint resolvidos (sem bloqueio)?
- [ ] Validador da linguagem rodado nos arquivos alterados (limiares ok)?
- [ ] Conformidade/clareza revisada no que mudou (SRP, nomes, hardcoded, testes)?
- [ ] Achados reportados com severidade e correção; nada de `--no-verify` em bloqueio real?

## Referências (Camada 3 — leia sob demanda)
- `scripts/revisar_diff.py` + `scripts/config.json` — gate determinístico do diff (conflito/debug/TODO; exit 1 bloqueia).
- `references/criterios.md` — o que revisar num diff (conformidade `padrao-escrita` focada na mudança) + como rodar os validadores nos arquivos alterados.
