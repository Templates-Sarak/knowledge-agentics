# Auditoria de Conformidade — [ALVO] ([DATA])

> Consultoria de adequação ao padrão Sarak. **Read-only** (nada foi modificado). Snapshot do "como-encontrado".
> Critério: `padrao-escrita`. Plano executável (tarefas) no Apêndice / `backlog-[DATE].json`.

## 1. Sumário executivo
- **Conformidade geral:** [X]% · **Módulos:** [N] ([M] sem testes)
- **Violações:** [total] — por dimensão: hardcoded [n] · thresholds [n] · srp [n] · coupling [n] · data [n] · api [n] · validation [n] · logging [n] · typing [n] · contract-doc [n] · coverage [n módulos]
- **Esforço estimado:** [n] tarefas — Onda 1 [n] · Onda 2 [n] · Onda 3 [n]
- **Maiores riscos:** [2-3 itens de risco alto — acoplamento/dados que exigem caracterização robusta]

## 2. Mapa por módulo
| Módulo | Violações | Dimensões dominantes | Cobertura | Risco de mexer |
|---|---|---|---|---|
| [orders] | [n] | [hardcoded, thresholds] | [untested] | [médio] |

## 3. Backlog decomposto (tarefas)
A fila executável. Cada tarefa = uma ordem de serviço (schema em `references/decomposicao.md`). Resumo legível
abaixo; o contrato máquina completo está no `backlog-[DATE].json`.

| id | módulo | arquivo:linhas | dimensão | risco | onda | caracteriz.? | estado → alvo |
|---|---|---|---|---|---|---|---|
| [orders-001] | [orders] | [order_service.py:12] | [hardcoded] | [baixo] | [1] | [não] | [timeout 30 fixo → config.json] |
| [orders-003] | [orders] | [order_service.py:45-118] | [thresholds] | [médio] | [2] | [sim] | [função 73 linhas → ≥2 funções] |

## 4. Sequenciamento em ondas
- **Onda 1 — quick-wins (risco baixo):** [tarefas]. Alto valor, baixo risco — começar por aqui.
- **Onda 2 — clean code (risco médio):** [tarefas]. Exige rede de testes onde `needsCharacterization`.
- **Onda 3 — estrutural (risco alto):** [tarefas]. Acoplamento/dados — **caracterização robusta antes**; humano no loop.

## 5. Mapa de dependências
- [orders-003 dependsOn orders-001 — extrair config antes de quebrar a função]
- [módulos sem testes → caracterizar antes de qualquer tarefa que muda código]

## 6. Recomendações
- **ADR necessário** (decisão arquitetural, vai para `docs/`): [itens de acoplamento/dados — contexto → decisão → consequência]
- **Bugs ≠ adequação** (registrar à parte, não corrigir na adequação): [comportamentos suspeitos achados durante a varredura]
- **Cobrir com testes primeiro:** [módulos sem testes que precedem ondas estruturais]

---

## Apêndice — backlog.json
Contrato máquina consumido por `/code3-adequar`. Ver `backlog-[DATE].json` (e por módulo em `.sarak/audit/<module>/backlog.json`).
