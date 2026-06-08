# Decomposição em Tarefas + Ondas (o plano executável)

Leia ao **emitir o backlog para adequação** (consultoria). Estende `backlog-format.md` de forma **aditiva**:
o `resumo`/`itens[]` daquele schema permanecem; aqui adiciona-se o array **`tarefas[]`** — a **fila executável**
que a etapa de adequação (`/code3-adequar`, futura) consome. O `code-auditor`/`/code1-auditar` orquestram isso em escala.

> Princípio: **quanto mais dividida e detalhada a tarefa, mais simples a execução.** Cada tarefa carrega
> contexto suficiente para o executor agir **sem re-descobrir** nada.

---

## O átomo: `tarefa`

**Granularidade:** *uma mudança coerente, em **um** arquivo, verificável isoladamente.* Pequena o bastante
para o executor fazer `[caracteriza se preciso] → refatora → verifica verde → commita` num passo só.
**Não** fragmentar em "uma violação = uma tarefa" (gera commits triviais); **não** agrupar arquivos distintos
numa tarefa (quebra a verificação isolada).

```jsonc
{
  "id": "orders-003",              // estável: <modulo>-<seq>. Liga tarefa → status → commit → condição do /goal
  "modulo": "orders",
  "arquivo": "backend/orders/order_service.py",
  "linhas": "45-118",              // faixa afetada (referência, não trava)
  "dimensao": "limiares",          // dimensão dominante (ver backlog-format.md)
  "regra": "função ≤ 40 linhas (padrao-escrita Nível 0)",
  "estadoAtual": "processa_pedido com 73 linhas e aninhamento 4",
  "estadoAlvo": "quebrar em ≥2 funções com guard clauses, preservando comportamento",
  "risco": "medio",                // baixo | medio | alto  — É O ROTEADOR (ver abaixo)
  "precisaCaracterizacao": true,   // módulo sem testes → rede ANTES de refatorar
  "dependeDe": ["orders-001"],     // ids de tarefas que precisam vir antes (ex.: extrair config antes de quebrar)
  "verificacao": "pytest tests/orders + validate.py no arquivo",
  "onda": 2,                       // 1 | 2 | 3 (ver Ondas)
  "status": "pending"              // pending | done | pulada | invalidada
}
```

Campos obrigatórios: `id`, `modulo`, `arquivo`, `dimensao`, `regra`, `estadoAtual`, `estadoAlvo`, `risco`,
`precisaCaracterizacao`, `verificacao`, `onda`, `status`. `linhas`/`dependeDe` são opcionais.

---

## Ondas (sequenciamento por risco)

A ordem respeita a `code-adequacao` (quick-wins primeiro; estrutural por último, pois exige caracterização robusta):

| Onda | Foco | Dimensões | Risco típico |
|---|---|---|---|
| **1** | Quick-wins | `hardcoded` (segredos/config), `logging`, `tipagem`, `doc-contrato` | baixo |
| **2** | Clean code | `limiares`, `srp`, `api` (rotas/casing), `validacao` | médio |
| **3** | Estrutural | `acoplamento`, `dados` (extrair via `api/`, prefixar tabela) | alto |

**Ordenação das `tarefas[]`:** por (`risco` asc, `severidade` desc) — o mesmo critério do backlog. Dentro da
onda, respeitar `dependeDe`. Módulo **sem testes** (`cobertura: sem-testes`) marca `precisaCaracterizacao: true`
em toda tarefa que **muda código** (criar teste, dimensão `cobertura`, não precisa).

---

## `risco` é o roteador (contrato com a etapa de execução)

O `risco` por tarefa não serve só para ordenar — ele **pré-decide como a tarefa será executada** na etapa
futura (`/code3-adequar`). Por isso vale investir em classificá-lo bem:

| `risco` | Modelo | Modo de execução | HITL |
|---|---|---|---|
| **baixo** | Sonnet | agente autônomo (`code-adequador`) | leve — `/goal` dirige |
| **médio** | Sonnet | agente autônomo, revisão de diff ao fim | revisão do diff |
| **alto** | Opus | **thread principal** (humano no loop) | **por item**, antes de refatorar |

> A auditoria detalhada entrega, além da lista de tarefas, a **tabela de roteamento** de modelo + modo + HITL.
> Classificar o `risco` errado custa caro: subestimar empurra um refactor estrutural para um agente autônomo.

Critério de `risco` (de `backlog-format.md`): `hardcoded`/`logging`/`cobertura` = **baixo**; `limiares`/`srp`/
`api`/`validacao` = **médio**; `acoplamento`/`dados` = **alto** (exige caracterização robusta antes de mexer).
