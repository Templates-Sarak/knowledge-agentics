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

1. **O que executo agora?** (a primeira `🔴 A executar` da §1 sem dependência pendente)
2. **O que já foi feito e está esperando síntese?** (as `🟢 Aprovada` da §4)
3. **Para onde cada plan vai depois?** (coluna *Destino*)

A estrutura reflete a das pastas — **duas tabelas, duas pastas**:

| Seção | Pasta | Contém |
|---|---|---|
| **§1 Fila de execução** | `plan/` | O que está em jogo: 🔴 🟡 🟠 🔵 ⛔ |
| **§4 Histórico** | `plan/executadas/` | O que terminou: 🟢 (aguardando síntese) e ⚪ (sintetizada) |

> ⚠️ **Este arquivo é um molde com instruções embutidas.** Os blocos `> **Como escrever:**` **permanecem** no
> arquivo como contrato de manutenção; as tabelas começam vazias e são mantidas pelo **agente revisor**.

**Quem escreve/atualiza:** o **agente revisor** ([[00-prompt-revisor]]) — mais a skill `spec-atualizar`, que
completa as colunas de síntese na §4.
**Quando atualizar:** ao criar uma plan (nova linha na §1), ao reprovar (status), ao **aprovar** (linha migra
para a §4 junto com o arquivo) e ao sintetizar (colunas de síntese). **Toda mudança de status vive aqui e na
própria plan — as duas, sempre, na mesma ação.**

---

# 1. Fila de execução — plans **ativas** (`plan/`)

> **Como escrever:** uma linha por plan que ainda está em jogo, **em ordem de execução** — a ordem da tabela
> **é** o plano; não use a numeração para ordenar. Espelha exatamente os arquivos na **raiz** de `plan/`.
> Colunas obrigatórias, nesta ordem:
>
> - **#** — posição na fila (1, 2, 3…). Reordenável.
> - **Plan** — link relativo: `[plan-NN-slug](plan/plan-NN-slug.md)`.
> - **Objetivo** — uma linha, no infinitivo. O que muda no sistema.
> - **Depende de** — `plan-NN` que precisa estar `🟢 Aprovada` antes, ou `—`.
> - **Status** — um dos valores da §2. **Igual** ao frontmatter da plan.
> - **Destino** — para onde o conteúdo é sintetizado depois (§3).
>
> Ao aprovar uma plan, a linha **sai desta tabela e vai para a §4** — junto com o arquivo, que é movido para
> `plan/executadas/`. **Localização física e seção deste índice andam sempre juntas.**

| # | Plan | Objetivo | Depende de | Status | Destino |
|---|---|---|---|---|---|
| — | _(vazio — a primeira plan do repositório é preencher [[00-contexto]])_ | — | — | — | — |

---

# 2. Legenda de status

| Status | Significado | Pasta | Quem move para cá |
|---|---|---|---|
| 🔴 A executar | Spec escrita e liberada. Aguarda executor. | `plan/` | revisor (ao criar) |
| 🟡 Em execução | Executor trabalhando. | `plan/` | executor (ao iniciar) |
| 🟠 Em revisão | Execução concluída no worktree, aguardando veredito. | `plan/` | executor (ao entregar) |
| 🔵 Em correção | Reprovada. Prompt de correção emitido, executor refazendo. | `plan/` | revisor (ao reprovar) |
| ⛔ Bloqueada | Impedida por dependência externa/decisão pendente. **Exige motivo** na coluna Objetivo. | `plan/` | revisor |
| 🟢 Aprovada | Verificada pelo revisor. Pronta para o usuário commitar e para a síntese. | **`plan/executadas/`** | revisor (ao aprovar — move o arquivo) |
| ⚪ Sintetizada | Já absorvida nas specs fixas pela skill `spec-atualizar`. | **`plan/executadas/`** | quem conduziu a síntese |

> Um status só avança na ordem `🔴 → 🟡 → 🟠 → (🔵 ⇄ 🟠) → 🟢 → ⚪`. **🔵 não volta para 🔴** — correção não é
> execução nova; a plan e o histórico de vereditos são os mesmos.
>
> **A aprovação é o único momento em que um arquivo de plan muda de pasta.** `plan/` guarda o que está em
> jogo; `plan/executadas/` guarda o que terminou (aguardando síntese ou já sintetizado). É isso que impede a
> raiz de `plan/` de virar um depósito — sem apagar nada.

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

# 4. Histórico — plans executadas (`plan/executadas/`)

> **Como escrever:** duas etapas, nesta tabela.
>
> 1. **Ao aprovar** (revisor): mova a linha da §1 para cá, preencha *Aprovada em* com a **data absoluta**
>    (`AAAA-MM-DD`), status `🟢`, e ajuste o link para `plan/executadas/…`. As colunas de síntese ficam `—`.
> 2. **Ao sintetizar** (skill `spec-atualizar`): status `⚪`, *Sintetizada em* com a data e *Spec fixa* com o
>    que foi efetivamente atualizado ou criado.
>
> **Nenhuma linha é removida jamais** — só completada. Espelha exatamente os arquivos em `plan/executadas/`,
> que crescem indefinidamente e devem crescer: são o histórico de por que o repositório é como é.

| Plan | Status | Aprovada em | Sintetizada em | Spec fixa atualizada |
|---|---|---|---|---|
| — | — | — | — | — |

> Exemplo de linha completa:
> `| [plan-05-tabela-sessions](plan/executadas/plan-05-tabela-sessions.md) | ⚪ | 2026-07-28 | 2026-08-01 | arquitetura/04-dados.md · adr/003-jwt-vs-sessao.md |`

---

# 5. Regras de manutenção

- **Numeração é monotônica e definitiva.** `plan-07` é `plan-07` para sempre. **Nunca renumere** uma plan já
  criada — links, vereditos e histórico apontam para ela. Ordem de execução se muda na coluna **#**, não no nome.
- **Nunca remova uma linha.** Plan abandonada vira `⛔ Bloqueada` com o motivo (e fica em `plan/`); plan
  aprovada vai para a §4.
- **Mover o arquivo e mover a linha é uma só ação.** Aprovou → `git mv` para `plan/executadas/` **e** linha da
  §1 para a §4, na mesma passada. Arquivo em `executadas/` com linha na §1 (ou o inverso) é índice quebrado.
- **`plan/executadas/` nunca é limpa.** Não se apaga plan — a subpasta existe justamente para tirar o volume
  da frente sem perder o rastro. Deleção só a pedido explícito do usuário, com o custo declarado.
- **Status duplicado é status divergente.** O valor aqui e no frontmatter da plan são atualizados na **mesma
  ação**. Divergiu? A **plan** é a fonte da verdade e este índice está errado — corrija aqui.
- **Dependência é contrato:** não libere (`🔴`) uma plan cuja dependência não esteja `🟢` ou `⚪`.
- **Uma plan `🟡 Em execução` por vez**, salvo plans comprovadamente disjuntas (arquivos sem interseção) — o
  revisor declara a disjunção ao liberar as duas.
- **Só o revisor edita este arquivo** — exceto as colunas de síntese da §4, completadas por quem conduz a
  skill `spec-atualizar`. O **executor nunca o toca**; ele escreve apenas na plan que executou.
