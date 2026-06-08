# Log de Adequação: code-adequacao

> **Append-only.** Cada tarefa concluída adiciona uma entrada; nada é reescrito. Persiste em
> `.sarak/adequacao_update.md` no projeto-alvo (versionável — o git é o histórico). Snapshot da auditoria
> (`.sarak/audit/auditoria-<data>.md`) permanece congelado; aqui acumula-se o "depois".

**Campanha:** [ALVO] · **Backlog:** `.sarak/audit/backlog-[DATA].json`

---

## Resumo (atualize ao fim de cada onda)
- **Tarefas:** [done]/[total] · pulada [n] · invalidada [n] · nova [n]
- **Ondas concluídas:** [1, 2, ...]
- **Cobertura:** [X]% → [Y]%

---

## Entradas (uma por tarefa concluída — append)

### [id] — [modulo] · [risco] · onda [N]
- **Arquivo:** [caminho:linhas]
- **Mudança:** [estadoAtual] → [estadoAlvo]
- **Dimensão/regra:** [dimensao] — [regra]
- **Caracterização:** [verde antes/depois | já havia testes]
- **Verificação:** [testes + validator: verde]
- **Commit:** [hash] — `adequa [modulo]: [estadoAtual] → [estadoAlvo] [[id]]`
- **Modo:** [code-adequador (baixo/médio) | thread principal + HITL (alto)]

<!-- próxima entrada abaixo (append) -->

---

## Reconciliação (registre ao fim de cada onda)
### Onda [N] — módulos tocados: [lista]
- **Resolvidas de tabela (invalidada):** [ids]
- **Novas surgidas:** [ids — risco]
- **Alto risco novo → subiu ao usuário?** [Sim/Não]
