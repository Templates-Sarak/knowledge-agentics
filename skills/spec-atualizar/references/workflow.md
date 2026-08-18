# Workflow Detalhado: spec-atualizar (expurgo verificado)

Expande o passo-a-passo da skill com exemplos dos quatro portões, condução do HITL e formulação do relato.

> Lembrete de escopo: quando esta skill roda, a síntese já foi feita pelo **revisor**, na aprovação
> (`00-prompt-revisor.md` §7.3). Aqui só se **verifica e remove**. Nenhuma spec fixa é escrita.

---

## Passo 1: Levantamento (exemplo)

Suponha `specs/plan/` com seis arquivos:

| Plan | Status | O que significa |
|---|---|---|
| `plan-03-ajustar-cache.md` | ⚪ Sintetizada | Candidata |
| `plan-04-endpoint-sessao.md` | ⚪ Sintetizada | Candidata |
| `plan-05-tabela-sessions.md` | ⚪ Sintetizada | Candidata |
| `plan-06-tela-login.md` | 🟢 Aprovada | **Síntese pendente** — não é sua, vai no relato |
| `plan-07-corrigir-lcp-home.md` | 🔴 A executar | Fila ativa — nem olhe |
| `plan-08-form-contato.md` | 🟡 Em execução | Fila ativa — nem olhe |

Lote: **03, 04, 05**. A `plan-06` só volta a ser assunto depois que o revisor a sintetizar.

---

## Passo 2: Os quatro portões na prática

### Portão 1 — Síntese registrada

Leia o final da plan. Tem de existir algo como:

```markdown
## Síntese — 2026-08-01

Sintetizada em: `arquitetura/04-dados.md` e `adr/003-jwt-vs-sessao.md`
Observações: a tabela `sessions` e seus índices foram para a spec de dados; a justificativa da escolha
virou ADR. O script de migration em si não foi transportado (é código, vive no repositório).
```

Sem esse bloco, ou com `status` divergente da §4 do índice, o portão **falha** — a plan está marcada `⚪` mas
ninguém consegue provar o que foi transportado.

### Portão 2 — A verdade está mesmo na spec fixa

Abra `arquitetura/04-dados.md` e procure o conteúdo declarado. Não basta o arquivo existir:

| ❌ Não passa | ✅ Passa |
|---|---|
| A spec existe, mas não menciona a tabela `sessions` | A spec descreve a tabela `sessions`, colunas e índices |
| A spec cita "sessões" de passagem, sem o contrato | O contrato está lá, no presente, como o sistema é |
| O ADR `003` não foi criado | `adr/003-jwt-vs-sessao.md` existe, `🟢 Aceito`, com contexto e consequências |

Falhou? A plan fica, e o caso vai ao usuário: **a síntese ficou incompleta**, e quem completa é o revisor.

### Portão 3 — A spec fixa bate com o código

Este é o portão que justifica a janela `⚪`. Abra os arquivos que a plan tocou e confronte:

- A spec diz que a resposta inclui `expiresAt` em ISO-8601 — o código devolve isso mesmo?
- A spec descreve a validação de e-mail antes da persistência — é onde ela está de fato?

Divergiu? **Não conserte nada.** Registre como achado, mantenha a plan e sugira plan nova de reconciliação. A
plan em disco é justamente o que permite reconstruir o que se pretendia.

### Portão 4 — Rastro no Git

```bash
git log --oneline -- specs/plan/plan-05-tabela-sessions.md
```

Vazio significa que a plan nunca foi commitada: todo o seu conteúdo — contexto, resumo do executor, veredito,
síntese — existe **somente** neste arquivo. Removê-la seria apagar isso para sempre, e `git log
--diff-filter=D` não teria o que recuperar.

Não transforme isso em cobrança. Basta relatar: *"a `plan-05` fica: ainda não está no histórico do Git.
Commite e rode a skill novamente."*

---

## Passo 3: HITL — a tabela de vereditos

Uma confirmação para o lote inteiro, mas com o veredito **por plan** visível. O usuário precisa ver o que sai
e o que fica, e por quê:

```markdown
### 🧹 Expurgo — 3 candidatas

| Plan | P1 síntese | P2 spec fixa | P3 código | P4 git | Decisão |
|---|---|---|---|---|---|
| plan-03-ajustar-cache | ✅ | ✅ (destino `—`, nada a transportar) | ✅ | ✅ | **remover** |
| plan-04-endpoint-sessao | ✅ | ✅ `arquitetura/03-api.md` | ✅ | ✅ | **remover** |
| plan-05-tabela-sessions | ✅ | ✅ `arquitetura/04-dados.md` · `adr/003` | ⚠️ divergente | ✅ | **fica** |

**plan-05 — divergência (portão 3):** a spec diz que `sessions.expires_at` é `TIMESTAMPTZ`, o schema em
`db/migrations/012_sessions.sql:14` cria `TIMESTAMP` sem timezone. Sugiro plan nova de reconciliação.

**Síntese pendente:** `plan-06-tela-login` está 🟢 — o revisor precisa sintetizá-la antes que ela vire
candidata ao expurgo.

> ⚠️ Confirma o expurgo de plan-03 e plan-04?
```

Destino `—` passa no portão 2 sem spec fixa nenhuma: a plan declarou que não havia verdade documentada a
transportar, e o bloco `## Síntese` registra isso. O que ela precisa mostrar é o registro, não um arquivo.

---

## Passo 4: Remoção

Confirmado, para cada plan do lote:

```bash
git rm specs/plan/plan-03-ajustar-cache.md
git rm specs/plan/plan-04-endpoint-sessao.md
```

E as linhas correspondentes somem da §4 do `specs/00-indice.md`:

```diff
- | [plan-03-ajustar-cache](plan/plan-03-ajustar-cache.md) | ⚪ | 2026-07-20 | 2026-07-20 | — |
- | [plan-04-endpoint-sessao](plan/plan-04-endpoint-sessao.md) | ⚪ | 2026-07-28 | 2026-07-28 | arquitetura/03-api.md |
```

Nada substitui essas linhas. E o `proximo_numero_plan` do frontmatter **não muda**: `plan-03` e `plan-04`
continuam queimados para sempre.

---

## Passo 5: Relato final

```markdown
🧹 Expurgo concluído.

**Removidas (2):** plan-03-ajustar-cache (destino `—`), plan-04-endpoint-sessao (`arquitetura/03-api.md`).
**Índice:** 2 linhas removidas da §4.

**Mantidas (1):** plan-05-tabela-sessions — portão 3: `expires_at` diverge entre
`arquitetura/04-dados.md` e `db/migrations/012_sessions.sql:14`. Precisa de plan de reconciliação antes
de poder ser expurgada.

**Síntese pendente (1):** plan-06-tela-login (🟢) — aguardando o revisor.

As alterações, incluindo os `git rm`, estão no worktree, **sem commit**.
```

---

## Sobre o que se perde ao expurgar

Nada de conteúdo — só conveniência. O veredito, o escopo negociado e as suposições do executor já cumpriram
seu papel (formar a spec fixa) e continuam recuperáveis:

```bash
git log --diff-filter=D -- specs/plan/plan-04-endpoint-sessao.md
git show <commit> -- specs/plan/plan-04-endpoint-sessao.md
```

O que deixa de existir é a facilidade de encontrá-los com um `ls`. É exatamente por isso que o portão 4 é
inegociável: sem commit, essa recuperação não existe, e o expurgo deixa de ser expurgo para virar perda.
