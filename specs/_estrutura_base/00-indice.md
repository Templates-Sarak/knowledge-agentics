---
tipo: "processo"
titulo: "Índice de Execução — Mapa das Plans"
dominio: "Governança de Specs (SDD)"
status: "🟢 Vigente"
tags: ["processo", "indice", "sdd"]
relacionados: ["[[00-contexto]]", "[[00-prompt-revisor]]", "[[00-prompt-executor]]"]
---

# 0. O que é este arquivo

O **mapa de execução** do repositório: a ordem em que as specs de `plan/` devem ser executadas, suas
dependências e o estado de cada uma. Responde a três perguntas, sempre:

1. **O que executo agora?** (a primeira `🔴 A executar` sem dependência pendente)
2. **O que já foi feito e está esperando síntese?** (as `🟢 Aprovada`)
3. **Para onde cada plan vai depois?** (coluna *Destino*)

> ⚠️ **Este arquivo é um molde com instruções embutidas.** Os blocos `> **Como escrever:**` **permanecem** no
> arquivo como contrato de manutenção; as tabelas começam vazias e são mantidas pelo **agente revisor**.

**Quem escreve/atualiza:** exclusivamente o **agente revisor** ([[00-prompt-revisor]]).
**Quando atualizar:** ao criar uma plan (nova linha), ao aprovar/reprovar uma execução (mudança de status) e
após `/spec-atualizar` (movimentação para o histórico). **Toda mudança de status vive aqui e na própria plan —
as duas, sempre, na mesma ação.**

---

# 1. Fila de execução

> **Como escrever:** uma linha por plan **ativa** (não sintetizada), **em ordem de execução** — a ordem da
> tabela **é** o plano; não use a numeração para ordenar. Colunas obrigatórias, nesta ordem:
>
> - **#** — posição na fila (1, 2, 3…). Reordenável.
> - **Plan** — link relativo: `[plan-NN-slug](plan/plan-NN-slug.md)`.
> - **Objetivo** — uma linha, no infinitivo. O que muda no sistema.
> - **Depende de** — `plan-NN` que precisa estar `🟢 Aprovada` antes, ou `—`.
> - **Status** — um dos valores da §2. **Igual** ao frontmatter da plan.
> - **Destino** — para onde o conteúdo é sintetizado depois (§3).

| # | Plan | Objetivo | Depende de | Status | Destino |
|---|---|---|---|---|---|
| — | _(vazio — a primeira plan do repositório é preencher [[00-contexto]])_ | — | — | — | — |

---

# 2. Legenda de status

| Status | Significado | Quem move para cá |
|---|---|---|
| 🔴 A executar | Spec escrita e liberada. Aguarda executor. | revisor (ao criar) |
| 🟡 Em execução | Executor trabalhando. | executor (ao iniciar) |
| 🟠 Em revisão | Execução concluída no worktree, aguardando veredito. | executor (ao entregar) |
| 🔵 Em correção | Reprovada. Prompt de correção emitido, executor refazendo. | revisor (ao reprovar) |
| 🟢 Aprovada | Verificada pelo revisor. Pronta para o usuário commitar. | revisor (ao aprovar) |
| ⚪ Sintetizada | Já absorvida nas specs fixas via `/spec-atualizar`. Sai da fila (§4). | revisor (após síntese) |
| ⛔ Bloqueada | Impedida por dependência externa/decisão pendente. **Exige motivo** na coluna Objetivo. | revisor |

> Um status só avança na ordem `🔴 → 🟡 → 🟠 → (🔵 ⇄ 🟠) → 🟢 → ⚪`. **🔵 não volta para 🔴** — correção não é
> execução nova; a plan e o histórico de vereditos são os mesmos.

---

# 3. Coluna *Destino* — valores válidos

Toda plan declara, **desde o momento em que é escrita**, para onde seu conteúdo será sintetizado:

| Valor | Quando usar |
|---|---|
| `arquitetura/NN-<nome>.md` | Mudou design estrutural, stack, fronteira de módulo, contrato de API. |
| `adr/NNN-<nome>.md` | Foi tomada uma decisão técnica com trade-off. **ADR é imutável** — decisão nova = ADR novo. |
| `specs/NN-<nome>.md` | Mudou regra de negócio ou comportamento de funcionalidade. |
| `00-contexto.md` | Mudou regra inegociável, stack ou mapa de roteamento. |
| **`—` (nenhum)** | Execução que não altera verdade documentada: correção de bug sem mudança de regra, refactor de conformidade, ajuste de build/CI, limpeza. |

> Vários destinos são permitidos (`arquitetura/03-api.md` + `adr/004-...`). `—` é uma resposta legítima e
> comum — **não invente destino** só para preencher a coluna.

---

# 4. Histórico — plans sintetizadas

> **Como escrever:** ao concluir `/spec-atualizar`, mova a linha da §1 para cá, com a **data absoluta**
> (`AAAA-MM-DD`) da síntese e a spec fixa efetivamente atualizada. O arquivo da plan **permanece** em `plan/`
> (é rastro auditável) — só sai da fila. Esta tabela é append-only: nada é editado nem removido.

| Plan | Sintetizada em | Spec fixa atualizada |
|---|---|---|
| — | — | — |

---

# 5. Regras de manutenção

- **Numeração é monotônica e definitiva.** `plan-07` é `plan-07` para sempre. **Nunca renumere** uma plan já
  criada — links, vereditos e histórico apontam para ela. Ordem de execução se muda na coluna **#**, não no nome.
- **Nunca remova uma linha.** Plan abandonada vira `⛔ Bloqueada` com o motivo; plan concluída vai para a §4.
- **Status duplicado é status divergente.** O valor aqui e no frontmatter da plan são atualizados na **mesma
  ação**. Divergiu? A **plan** é a fonte da verdade e este índice está errado — corrija aqui.
- **Dependência é contrato:** não libere (`🔴`) uma plan cuja dependência não esteja `🟢` ou `⚪`.
- **Uma plan `🟡 Em execução` por vez**, salvo plans comprovadamente disjuntas (arquivos sem interseção) — o
  revisor declara a disjunção ao liberar as duas.
- **Só o revisor edita este arquivo.** O executor nunca o toca; ele escreve apenas na plan que executou.
