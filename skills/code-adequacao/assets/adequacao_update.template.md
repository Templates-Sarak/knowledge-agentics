# Log de Adequação: code-adequacao

> **Append-only.** Cada tarefa concluída adiciona uma entrada; nada é reescrito. Persiste em
> `.sarak/adequation_update.md` no projeto-alvo (versionável — o git é o histórico). Snapshot da auditoria
> (`.sarak/audit/audit-<date>.md`) permanece congelado; aqui acumula-se o "depois".

**Campanha:** [ALVO] · **Backlog:** `.sarak/audit/backlog-[DATE].json`

---

## Resumo (atualize ao fim de cada onda)
- **Tarefas:** [done]/[total] · skipped [n] · invalidated [n] · new [n]
- **Ondas concluídas:** [1, 2, ...]
- **Cobertura:** [X]% → [Y]%

---

## Entradas (uma por tarefa concluída — append)

### [id] — [module] · [risk] · onda [N]
- **Arquivo:** [file:lines]
- **Mudança:** [currentState] → [targetState]
- **Dimensão/regra:** [dimension] — [rule]
- **Caracterização:** [verde antes/depois | já havia testes]
- **Verificação:** [testes + validator: verde]
- **Commit:** [hash] — `adequa [module]: [currentState] → [targetState] [[id]]`
- **Modo:** [code-adequador (baixo/médio) | thread principal + HITL (alto)]

<!-- próxima entrada abaixo (append) -->

---

## Reconciliação (registre ao fim de cada onda)
### Onda [N] — módulos tocados: [lista]
- **Resolvidas de tabela (invalidated):** [ids]
- **Novas surgidas:** [ids — risco]
- **Alto risco novo → subiu ao usuário?** [Sim/Não]
