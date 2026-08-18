---
tipo: "processo"
titulo: "Índice de Execução — Mapa das Plans"
dominio: "Governança de Specs (SDD)"
status: "🟢 Vigente"
tags: ["processo", "indice", "sdd"]
relacionados: ["[[00-contexto]]", "[[00-prompt-revisor]]", "[[00-prompt-executor]]"]
proximo_numero_plan: "01" # NN da próxima plan a nascer. Só sobe. Nunca reaproveitado, mesmo que uma plan
                           # seja depois removida por síntese — ver §5.
---

# 0. O que é este arquivo

O **mapa de execução** do repositório: a ordem em que as specs de `plan/` devem ser executadas, suas
dependências e o estado de cada uma. Responde a três perguntas, sempre:

1. **O que executo agora?** (a primeira `🔴 A executar` da §1 sem dependência pendente)
2. **O que já terminou e ainda ocupa espaço?** (as `🟢` e `⚪` da §4)
3. **Para onde cada plan vai depois?** (coluna *Destino*)

**Todas as plans vivem em `plan/`** — não há subpasta e nenhum arquivo se move durante o ciclo. O que separa
as duas tabelas é o **estado**, não o lugar:

| Seção | Contém | Por que separada |
|---|---|---|
| **§1 Fila de execução** | 🔴 🟡 🟠 🔵 ⛔ | O que está em jogo agora e exige ação |
| **§4 Encerradas** | 🟢 Aprovada · ⚪ Sintetizada | O que acabou e aguarda síntese ou expurgo. A linha some daqui só no expurgo (§2) |

> ⚠️ **Este arquivo é um molde com instruções embutidas.** Os blocos `> **Como escrever:**` **permanecem** no
> arquivo como contrato de manutenção; as tabelas começam vazias e são mantidas pelo **agente revisor**.

**Quem escreve/atualiza:** o **agente revisor** ([[00-prompt-revisor]]) — mais a skill `spec-atualizar`, que
**remove** a linha da §4 (e o arquivo do disco) ao expurgar uma plan já sintetizada.
**Quando atualizar:** ao criar uma plan (nova linha na §1 + `proximo_numero_plan` sobe), ao reprovar (status),
ao **aprovar** (linha migra da §1 para a §4), ao **sintetizar** (status `⚪` + colunas de síntese preenchidas)
e ao **expurgar** (linha e arquivo removidos — §2). **Toda mudança de status vive aqui e na própria plan — as
duas, sempre, na mesma ação, exceto a remoção final, que apaga a própria plan.**

---

# 1. Fila de execução — plans **ativas**

> **Como escrever:** uma linha por plan que ainda está em jogo, **em ordem de execução** — a ordem da tabela
> **é** o plano; não use a numeração para ordenar. Espelha exatamente os arquivos de `plan/` cujo status
> ainda é 🔴 🟡 🟠 🔵 ⛔. Colunas obrigatórias, nesta ordem:
>
> - **#** — posição na fila (1, 2, 3…). Reordenável.
> - **Plan** — link relativo: `[plan-NN-slug](plan/plan-NN-slug.md)`.
> - **Objetivo** — uma linha, no infinitivo. O que muda no sistema.
> - **Depende de** — `plan-NN` que precisa estar `🟢 Aprovada` antes, ou `—`.
> - **Status** — um dos valores da §2. **Igual** ao frontmatter da plan.
> - **Destino** — para onde o conteúdo é sintetizado depois (§3).
>
> Ao aprovar uma plan, a linha **sai desta tabela e vai para a §4**. O arquivo não se move — o que mudou foi
> o estado dela, e é o `status` que a tira da fila.

| # | Plan | Objetivo | Depende de | Status | Destino |
|---|---|---|---|---|---|
| — | _(vazio — a primeira plan do repositório é preencher [[00-contexto]])_ | — | — | — | — |

---

# 2. Legenda de status

| Status | Significado | Seção | Quem marca |
|---|---|---|---|
| 🔴 A executar | Spec escrita e liberada. Aguarda executor. | §1 | revisor (ao criar) |
| 🟡 Em execução | Executor trabalhando. | §1 | executor (ao iniciar) |
| 🟠 Em revisão | Execução concluída no worktree, aguardando veredito. | §1 | executor (ao entregar) |
| 🔵 Em correção | Reprovada. Prompt de correção emitido, executor refazendo. | §1 | revisor (ao reprovar) |
| ⛔ Bloqueada | Impedida por dependência externa/decisão pendente. **Exige motivo** na coluna Objetivo. | §1 | revisor |
| 🟢 Aprovada | Verificada pelo revisor. Liberada para commit; a síntese aguarda a autorização do usuário. | §4 | revisor (ao aprovar) |
| ⚪ Sintetizada | A verdade já está na spec fixa de destino. O arquivo é resíduo aguardando expurgo. | §4 | revisor (ao sintetizar — [[00-prompt-revisor]] §7.3) |

> Um status só avança na ordem `🔴 → 🟡 → 🟠 → (🔵 ⇄ 🟠) → 🟢 → ⚪ → (expurgada)`. **🔵 não volta para 🔴** —
> correção não é execução nova; a plan e o histórico de vereditos são os mesmos.
>
> **Nenhum arquivo se move; o que muda é o status.** `🟢` costuma durar minutos (a síntese acontece na própria
> conversa de aprovação, assim que o usuário autoriza); `⚪` dura até a próxima rodada de `spec-atualizar`.
> Esse intervalo em `⚪` é deliberado: é a janela em que ainda dá para conferir se a spec fixa ficou correta,
> com a plan inteira ainda em disco. Depois do expurgo, o rastro completo (contexto, resumo do executor,
> veredito, síntese) vive só no histórico do **Git** — a spec fixa de destino é a verdade vigente, e a plan
> removida é a evidência de como se chegou lá, recuperável com
> `git log --diff-filter=D -- specs/plan/plan-NN-*.md`.

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

# 4. Encerradas — aguardando síntese (`🟢`) ou expurgo (`⚪`)

> **Como escrever:** três etapas — a linha nasce na aprovação, é completada na síntese e **removida** no
> expurgo.
>
> 1. **Ao aprovar** (revisor): mova a linha da §1 para cá com status `🟢`, preencha *Aprovada em* com a **data
>    absoluta** (`AAAA-MM-DD`) e carregue o `destino_sintese` da plan para a coluna *Spec fixa* (já estava
>    preenchido desde a criação — só migra junto; até a síntese, é destino **declarado**). *Sintetizada em*
>    fica `—`.
> 2. **Ao sintetizar** (revisor, autorizado pelo usuário — [[00-prompt-revisor]] §7.3): status `⚪`,
>    *Sintetizada em* com a data, e *Spec fixa* ajustada para o que foi de fato atualizado ou criado. Destino
>    `—`? Fica `—`: a plan é sintetizada do mesmo jeito, sem nada a transportar.
> 3. **Ao expurgar** (skill `spec-atualizar`): a skill reverifica, remove o arquivo (`git rm`, sem commit) e
>    **apaga esta linha** na mesma passada. Nada sobra marcado nesta tabela.
>
> Esta tabela é uma **fila de espera**, não histórico: só contém o que ainda ocupa espaço no repositório.
> Espelha exatamente as plans de `plan/` com status `🟢` ou `⚪`. O histórico de por que o repositório é como é
> vive na spec fixa de destino (verdade consolidada) e, em detalhe, no **Git**.

| Plan | Status | Aprovada em | Sintetizada em | Spec fixa |
|---|---|---|---|---|
| — | — | — | — | — |

> Exemplo, logo após a aprovação (síntese ainda não autorizada):
> `| [plan-05-tabela-sessions](plan/plan-05-tabela-sessions.md) | 🟢 | 2026-07-28 | — | arquitetura/04-dados.md · adr/003-jwt-vs-sessao.md |`
>
> E depois da síntese, aguardando expurgo:
> `| [plan-05-tabela-sessions](plan/plan-05-tabela-sessions.md) | ⚪ | 2026-07-28 | 2026-07-28 | arquitetura/04-dados.md · adr/003-jwt-vs-sessao.md |`
>
> Assim que `spec-atualizar` expurga esta plan, a linha inteira desaparece da tabela.

---

# 5. Regras de manutenção

- **Numeração é monotônica e definitiva.** `plan-07` é `plan-07` para sempre, mesmo depois de expurgada.
  **Nunca renumere** nem reaproveite um `NN`. O próximo número livre é **sempre** o valor do campo
  `proximo_numero_plan` no frontmatter deste arquivo — nunca o descubra escaneando `plan/`, porque plans
  expurgadas sumiram da pasta. Ao criar uma plan: use o valor atual do campo e **incremente-o** na mesma ação.
- **Linha da §1 nunca é removida em silêncio.** Plan abandonada vira `⛔ Bloqueada` com o motivo; plan
  aprovada migra para a §4. A **única** remoção de linha deste índice é a da §4, e só acontece no expurgo
  (§2, §4) — é uma remoção **esperada**, não uma exceção à regra.
- **Status e seção andam juntos.** Aprovou → status `🟢` na plan **e** linha da §1 para a §4, na mesma
  passada. Sintetizou → status `⚪` na plan **e** colunas de síntese preenchidas aqui. Expurgou → `git rm` do
  arquivo **e** remoção da linha, juntos. Nunca um sem o outro. **Nenhuma dessas etapas move arquivo**: plan
  nasce e morre em `plan/`.
- **`⚪` não se acumula indefinidamente.** É resíduo com prazo: some na próxima rodada de `spec-atualizar`
  (ver [[spec-atualizar]]), a **única** rotina autorizada a remover arquivo de plan — e só depois de
  reverificar que a spec fixa de destino já carrega a verdade e que a plan já está no histórico do Git.
- **Status duplicado é status divergente.** O valor aqui e no frontmatter da plan são atualizados na **mesma
  ação**. Divergiu? A **plan** é a fonte da verdade e este índice está errado — corrija aqui. (Exceção: depois
  de expurgada, a plan não existe mais para consultar — a última verdade fica no commit de remoção, no Git.)
- **Dependência é contrato:** não libere (`🔴`) uma plan cuja dependência não esteja `🟢` ou `⚪`. Se a
  dependência não existe mais em disco, ela **foi expurgada** — e só se expurga o que já foi sintetizado, de
  modo que a dependência já está embutida na spec fixa de destino: deixa de ser um "plan-NN" e passa a ser
  essa spec. **Plan nunca referencia outra plan como fonte de conteúdo** — só `depende_de`, que é ordem de
  execução.
- **Uma plan `🟡 Em execução` por vez**, salvo plans comprovadamente disjuntas (arquivos sem interseção) — o
  revisor declara a disjunção ao liberar as duas.
- **Só o revisor edita este arquivo** — exceto a remoção de linha da §4, feita por quem conduz a skill
  `spec-atualizar`. O **executor nunca o toca**; ele escreve apenas na plan que executou.
