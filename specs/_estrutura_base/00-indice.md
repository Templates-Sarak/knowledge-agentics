---
tipo: "processo"
titulo: "Índice de Execução — Mapa das Plans"
dominio: "Governança de Specs (SDD)"
status: "🟢 Vigente"
tags: ["processo", "indice", "sdd"]
relacionados: ["[[00-contexto]]", "[[00-backlog]]", "[[00-prompt-revisor]]", "[[00-prompt-executor]]"]
proximo_numero_plan: "01" # NN da próxima plan a nascer. Só sobe. Nunca reaproveitado — ver §4.
---

# 0. O que é este arquivo

O **mapa do trabalho em andamento**. Responde a duas perguntas, sempre:

1. **O que executo agora?** (a primeira `🔴 A executar` sem dependência pendente)
2. **O que está em jogo e não terminou?** (todo o resto da tabela)

**Este arquivo não é histórico.** Ele espelha, linha a linha, as plans que existem em `specs/plan/` — e uma
plan só existe enquanto não foi sintetizada. **Sintetizar remove a plan e a linha, na mesma ação**
([[00-prompt-revisor]] §7.4): a verdade passa a viver na spec fixa de destino, e o rastro completo, no Git.

Por isso o tamanho deste arquivo é limitado pelo **trabalho aberto**, não pela idade do repositório. Índice
que cresce é índice quebrado.

| Não confunda | É |
|---|---|
| [[00-indice]] | o que **está sendo feito** — uma linha por plan viva |
| [[00-backlog]] | o que foi **notado e não agendado** — sem status, sem fila, ninguém executa |

> ⚠️ **Este arquivo é um molde com instruções embutidas.** O bloco `> **Como escrever:**` **permanece** no
> arquivo como contrato de manutenção; a tabela começa vazia e é mantida pelo **agente revisor**.

**Quem escreve/atualiza:** exclusivamente o **agente revisor** ([[00-prompt-revisor]]).
**Quando atualizar:** ao criar uma plan (nova linha + `proximo_numero_plan` sobe), a cada mudança de status,
e ao **sintetizar** (linha removida junto com o arquivo da plan). **Status vive aqui e na própria plan — os
dois, sempre, na mesma ação.**

---

# 1. Fila de execução

> **Como escrever:** uma linha por plan que existe em disco, **em ordem de execução** — a ordem da tabela
> **é** o plano; não use a numeração para ordenar. Colunas obrigatórias, nesta ordem:
>
> - **#** — posição na fila (1, 2, 3…). Reordenável.
> - **Plan** — link relativo: `[plan-NN-slug](plan/plan-NN-slug.md)`.
> - **Objetivo** — uma linha, no infinitivo. O que muda no sistema.
> - **Depende de** — `plan-NN` que precisa estar sintetizada antes, ou `—`.
> - **Status** — um dos valores da §2. **Igual** ao frontmatter da plan.
> - **Destino** — para onde o conteúdo será sintetizado (§3).
>
> Quando a plan é sintetizada, **a linha sai desta tabela e o arquivo sai do disco**, juntos. Não há segunda
> tabela para onde migrar: o que acabou não ocupa mais espaço aqui.

| # | Plan | Objetivo | Depende de | Status | Destino |
|---|---|---|---|---|---|
| — | _(vazio — a primeira plan do repositório é preencher [[00-contexto]])_ | — | — | — | — |

---

# 2. Legenda de status

| Status | Significado | Quem marca |
|---|---|---|
| 🔴 A executar | Spec escrita e liberada. Aguarda executor. | revisor (ao criar) |
| 🟡 Em execução | Executor trabalhando. | executor (ao iniciar) |
| 🟠 Em revisão | Execução concluída no worktree, aguardando veredito. | executor (ao entregar) |
| 🔵 Em correção | Reprovada. Prompt de correção emitido, executor refazendo. | revisor (ao reprovar) |
| ⛔ Bloqueada | Impedida por dependência externa ou decisão pendente. **Exige motivo** na coluna Objetivo. | revisor |
| 🟢 Aprovada | Verificada. Liberada para commit; a síntese aguarda a autorização do usuário. | revisor (ao aprovar) |

> Um status avança na ordem `🔴 → 🟡 → 🟠 → (🔵 ⇄ 🟠) → 🟢 → (sintetizada e removida)`. **🔵 não volta para
> 🔴** — correção não é execução nova; a plan e o histórico de vereditos são os mesmos.
>
> **`🟢` é o estado mais curto que existe aqui.** Ele dura o tempo de o usuário ler a proposta de síntese e
> autorizar — minutos, na mesma conversa. Autorizou, o revisor sintetiza, apaga a plan e apaga esta linha. Um
> `🟢` que passou o dia parado é sinal de proposta de síntese não respondida, não de estado normal.
>
> **`⛔` não é depósito.** Plan bloqueada há tempo demais deixou de ser trabalho aberto: ou o impedimento caiu
> e ela volta para `🔴`, ou ela não vai acontecer. No segundo caso o revisor **não remove nada** — ele leva o
> caso ao usuário e desce para o [[00-backlog]] o que sobrou de útil; a **remoção é manual, do usuário**,
> quando for o caso. Abandono silencioso é o que faz índice virar cemitério.

---

# 3. Coluna *Destino* — valores válidos

Toda plan declara, **desde o momento em que é escrita**, para onde seu conteúdo será sintetizado:

| Valor | Quando usar |
|---|---|
| `arquitetura/NN-<nome>.md` | Mudou design estrutural, stack, fronteira de módulo, contrato de API. |
| `specs/NN-<nome>.md` | Mudou regra de negócio ou comportamento de funcionalidade. |
| `00-contexto.md` | Mudou regra inegociável, stack ou mapa de roteamento. |
| `adr/NNN-<nome>.md` | Houve **decisão com alternativa real descartada**. Passa a régua de três perguntas do [[00-prompt-revisor]] §5.2 — se não passa, não é ADR. **É o destino mais raro.** |
| **`—` (nenhum)** | Execução que não altera verdade documentada: correção de bug sem mudança de regra, refactor de conformidade, ajuste de build/CI, limpeza. |

> Vários destinos são permitidos (`arquitetura/03-api.md` + `adr/004-...`). **`—` é a resposta mais comum** —
> não invente destino para preencher a coluna, e não promova uma escolha óbvia a ADR só porque o menu oferece.
>
> Se a plan tem destino `—`, ela ainda passa pela síntese: o revisor confirma que não havia o que transportar
> e **remove a plan do mesmo jeito**. Destino `—` não é motivo para o arquivo ficar.

---

# 4. Regras de manutenção

- **Numeração é monotônica e definitiva.** `plan-07` é `plan-07` para sempre, mesmo depois de removida.
  **Nunca renumere** nem reaproveite um `NN`. O próximo número livre é **sempre** o valor do campo
  `proximo_numero_plan` no frontmatter deste arquivo — nunca o descubra escaneando `plan/`, porque plans
  sintetizadas sumiram da pasta. Ao criar uma plan: use o valor atual e **incremente-o** na mesma ação.
- **Uma linha aqui = um arquivo em `plan/`.** Sempre. Linha sem arquivo é índice mentindo; arquivo sem linha
  é trabalho invisível. Divergiu? A **plan** é a fonte da verdade e este índice está errado — corrija aqui.
- **Status e arquivo andam juntos.** Aprovou → `🟢` na plan **e** aqui. Sintetizou → spec fixa atualizada,
  `git rm` da plan **e** remoção da linha, na mesma passada. Nunca um sem o outro.
- **Antes de SINTETIZAR, confirme o rastro.** `git log --oneline -- specs/plan/plan-NN-*.md` tem de retornar
  ao menos um commit. Vazio significa que a plan nunca foi commitada: removê-la seria **perda total**. A
  checagem vem **antes** de escrever qualquer coisa — o usuário commita a plan primeiro, e só então a síntese
  acontece inteira. Nunca sintetize agora para remover depois: isso cria uma plan sintetizada em disco sem
  status que a descreva.
- **Dependência é contrato:** não libere (`🔴`) uma plan cuja dependência ainda esteja aberta. Dependência
  que sumiu da tabela **foi sintetizada** — logo já está embutida na spec fixa de destino, e deixa de ser
  "plan-NN" para ser essa spec. **Plan sintetizada nunca fica em disco para servir de contexto a outra**: se
  a dependente precisa de algo que a spec fixa não carrega, a síntese estava incompleta — o revisor a
  completa **antes** de remover ([[00-prompt-revisor]] §7.4).
- **Plan nunca referencia outra plan como fonte de conteúdo** — só `depende_de`, que é ordem de execução.
- **Uma plan `🟡 Em execução` por vez**, salvo plans comprovadamente disjuntas (arquivos sem interseção) — o
  revisor declara a disjunção ao liberar as duas.
- **Achado não entra aqui.** Vai para o [[00-backlog]]. Este arquivo é só trabalho liberado.
- **Só o revisor edita este arquivo.** O **executor nunca o toca**; ele escreve apenas na plan que executou.
