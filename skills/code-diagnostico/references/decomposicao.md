# Decomposição em Tarefas + Ondas (o plano executável)

Leia ao **emitir o backlog para adequação** (consultoria). Estende `backlog-format.md` de forma **aditiva**:
o `summary`/`items[]` daquele schema permanecem; aqui adiciona-se o array **`tasks[]`** — a **fila executável**
que a etapa de adequação (`/code3-adequar`, futura) consome. O `code-auditor`/`/code1-auditar` orquestram isso em escala.

> Princípio: **quanto mais dividida e detalhada a tarefa, mais simples a execução.** Cada tarefa carrega
> contexto suficiente para o executor agir **sem re-descobrir** nada.

---

## O átomo: a tarefa (`task`)

**Granularidade:** *uma mudança coerente, em **um** arquivo, verificável isoladamente.* Pequena o bastante
para o executor fazer `[caracteriza se preciso] → refatora → verifica verde → commita` num passo só.
**Não** fragmentar em "uma violação = uma tarefa" (gera commits triviais); **não** agrupar arquivos distintos
numa tarefa (quebra a verificação isolada).

```jsonc
{
  "id": "orders-003",              // estável: <module>-<seq>. Liga tarefa → status → commit → condição do /goal
  "module": "orders",
  "file": "backend/orders/order_service.py",
  "lines": "45-118",               // faixa afetada (referência, não trava)
  "dimension": "thresholds",       // dimensão dominante (ver backlog-format.md)
  "rule": "função ≤ 40 linhas (padrao-escrita Nível 0)",
  "currentState": "processa_pedido com 73 linhas e aninhamento 4",
  "targetState": "quebrar em ≥2 funções com guard clauses, preservando comportamento",
  "risk": "medium",                // low | medium | high  — É O ROTEADOR (ver abaixo)
  "needsCharacterization": true,   // módulo sem testes → rede ANTES de refatorar
  "dependsOn": ["orders-001"],     // ids de tarefas que precisam vir antes (ex.: extrair config antes de quebrar)
  "verification": "pytest tests/orders + validate.py no arquivo",
  "wave": 2,                       // 1 | 2 | 3 (ver Ondas)
  "status": "pending"              // pending | done | skipped | invalidated (| new, ao surgir na reconciliação)
}
```

Campos obrigatórios: `id`, `module`, `file`, `dimension`, `rule`, `currentState`, `targetState`, `risk`,
`needsCharacterization`, `verification`, `wave`, `status`. `lines`/`dependsOn` são opcionais.
Os nomes antigos (`modulo`, `arquivo`, `estadoAtual`…) são aceitos na leitura — tabela em
`backlog-format.md` §Compatibilidade de leitura.

---

## Ondas (sequenciamento por risco)

A ordem respeita a `code-adequacao` (quick-wins primeiro; estrutural por último, pois exige caracterização robusta):

| Onda | Foco | Dimensões | Risco típico |
|---|---|---|---|
| **1** | Quick-wins | `hardcoded` (segredos/config), `logging`, `typing`, `contract-doc` | baixo |
| **2** | Clean code | `thresholds`, `srp`, `api` (rotas/casing), `validation` | médio |
| **3** | Estrutural | `coupling`, `data` (extrair via `api/`, prefixar tabela) | alto |

**Ordenação das `tasks[]`:** por (`risk` asc, `severity` desc) — o mesmo critério do backlog. Dentro da
onda, respeitar `dependsOn`. Módulo **sem testes** (`coverage: untested`) marca `needsCharacterization: true`
em toda tarefa que **muda código** (criar teste, dimensão `coverage`, não precisa).

---

## `risk` é o roteador (contrato com a etapa de execução)

O `risk` por tarefa não serve só para ordenar — ele **pré-decide como a tarefa será executada** na etapa
futura (`/code3-adequar`). Por isso vale investir em classificá-lo bem:

| `risk` | Modelo | Modo de execução | HITL |
|---|---|---|---|
| **low** (baixo) | Sonnet | agente autônomo (`code-adequador`) | leve — `/goal` dirige |
| **medium** (médio) | Sonnet | agente autônomo, revisão de diff ao fim | revisão do diff |
| **high** (alto) | Opus | **thread principal** (humano no loop) | **por item**, antes de refatorar |

> A auditoria detalhada entrega, além da lista de tarefas, a **tabela de roteamento** de modelo + modo + HITL.
> Classificar o `risk` errado custa caro: subestimar empurra um refactor estrutural para um agente autônomo.

Critério de `risk` (de `backlog-format.md`): `hardcoded`/`logging`/`coverage` = **low**; `thresholds`/`srp`/
`api`/`validation` = **medium**; `coupling`/`data` = **high** (exige caracterização robusta antes de mexer).
