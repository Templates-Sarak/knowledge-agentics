---
description: Fase 2 da adequação — caminha o backlog onda a onda e adequa cada tarefa ao padrão Sarak, roteando pelo risco (baixo/médio ao agente code-adequador; alto na thread principal com HITL), com gate de diff, commit por tarefa, reconciliação entre ondas e log append-only. Mutativo no código-fonte.
argument-hint: [id|--wave N]
allowed-tools: Task, Read, Edit, Write, Grep, Glob, Bash
---

# /code3-adequar — Fase 2: laço de adequação (roteado por risco)

Escopo: **$ARGUMENTS** — `<id>` (uma tarefa) · `--wave N` (uma onda) · **vazio** (backlog inteiro).

Você é o **orquestrador** da adequação. Caminha o backlog `.sarak/audit/backlog-<date>.json` **tarefa a tarefa**
(sequencial), roteando pelo `risk`, com rede de testes já montada (Fase 1). A **lógica por item** é da skill
`code-adequacao`; o **diff** passa por `git-revisao-diff`; os **hooks** disparam sozinhos no edit/commit.

> Pré-requisito: rode `/code2-caracterizar` antes (módulos sem teste precisam da rede). Tarefa com
> `needsCharacterization: true` ainda pendente → caracterize antes de refatorá-la.

## Passos

1. **Selecionar tarefas do escopo** — abra o backlog (aceita chaves antigas em português — tabela em `code-diagnostico/references/backlog-format.md` §Compatibilidade de leitura; ao atualizar, grave só as chaves novas); filtre pelo `$ARGUMENTS`. Ordene por **`wave` → `risk` asc →
   respeitando `dependsOn`** (uma tarefa só roda depois das suas dependências `done`).

2. **Por tarefa (sequencial):**
   - **Garantir a rede** — se `needsCharacterization: true` ainda, caracterize antes (ou aponte `/code2-caracterizar`).
     Confirme os testes do módulo **verdes** antes de mexer.
   - **Rotear pelo `risk`:**
     - **`low`/`medium`** (baixo/médio) → delegue ao agente **`code-adequador`** (via `Task`, Sonnet), passando a tarefa. Ele
       refatora, verifica e devolve relatório + diff (não commita).
     - **`high`** (alto) → execute **aqui (thread principal)** via `code-adequacao`: apresente o **Plano de Refatoração**
       (o quê / por quê / como / risco / o que os testes protegem) → **"⚠️ Confirma?"** → **aguarde**. Só então refatore.
   - **Verificar** — testes (caracterização + existentes) + validator da linguagem **verdes**. Vermelho → reverta
     a tarefa e marque `status: skipped` com o motivo; siga para a próxima.
   - **Gate do diff** — rode `git-revisao-diff` (`scripts/review_diff.py` + julgamento) no diff da tarefa. Bloqueio
     (conflito/debug) → resolva antes de commitar.
   - **Commit (1 por tarefa)** — `git add` do escopo da tarefa + commit com mensagem estruturada:
     `adequa <module>: <currentState> → <targetState> [<id>]`. Os hooks (limiares/format/segredos) disparam aqui.
   - **Registrar** — atualize o backlog (`status → done`) e **append** a entrada em `.sarak/adequation_update.md`
     (template em `code-adequacao/assets/adequacao_update.template.md`).

3. **Reconciliação ao fim de cada onda** — reuse o agente **`code-auditor`** (read-only) nos **módulos tocados**:
   compare com as tarefas `pending` restantes → marque `done`/`invalidated` (resolvida de tabela) ou adicione `new`.
   O snapshot `.sarak/audit/audit-<date>.md` **permanece congelado**; só o backlog vivo muda. Tarefa **nova de
   alto risco** → **suba ao usuário** antes de prosseguir.

4. **Encerrar o escopo** — resumo: tarefas `done`/`skipped`/`invalidated`/`new`, cobertura, e o que ficou pendente.

## `/goal` (opcional — só ondas baixo/médio)
Para dirigir as ondas autônomas sem confirmar a cada passo, o usuário pode usar o nativo:
`/goal todas as tarefas das ondas 1-2 status ∈ {done,skipped,invalidated} e a suíte passa`. **Alto risco fica fora**
(é HITL por item). Você só caminha; o `/goal` é o motor.

## Limites
- **NUNCA** mude comportamento — adequação preserva comportamento; bug → item à parte.
- **NUNCA** refatore alto risco sem o **HITL** (Plano → Confirma) na thread principal.
- **NUNCA** commite com a rede vermelha ou com o gate de diff bloqueando — nem use `--no-verify` em bloqueio real.
- **NÃO** trate mais de uma tarefa por vez (verificação isolada); **um commit por tarefa**.
- **NÃO** delegue alto risco a agente (agente não faz HITL) — alto risco é thread principal.
- **NÃO** saia do escopo: faxina é da `code-limpeza-projeto`; autoria/licença/docs é da `code-entrega`
  (`/code-entregar`).
