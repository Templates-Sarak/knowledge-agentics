---
name: spec-atualizar
description: Reconcilia o diretório de plans com o 00-indice e limpa resíduo — plan sintetizada que ficou em disco, linha órfã no índice, plan órfã sem linha, plan abandonada há muito tempo. Ferramenta de REPARO, não rotina do ciclo — no fluxo normal o revisor sintetiza e remove a plan na mesma ação. Use APENAS quando o usuário pedir a reconciliação/limpeza do diretório de specs. NÃO sintetiza. NÃO acione proativamente.
---

# Skill: Reconciliar e Limpar o Diretório de Plans

**Esta skill não faz parte do ciclo normal.** No fluxo corrente, o agente revisor sintetiza a plan aprovada
e **remove o arquivo e a linha do índice na mesma ação** (`00-prompt-revisor.md` §7.4) — não existe estado
"sintetizada aguardando limpeza", e nada se acumula esperando por esta skill.

Ela existe para os casos em que o invariante quebrou:

> **Invariante:** uma linha no `00-indice` ⟷ um arquivo em `specs/plan/`. Sempre, nos dois sentidos.

Quebra quando um ciclo é interrompido no meio, quando um repositório vem do modelo antigo (que mantinha
plans marcadas `⚪ Sintetizada` até um expurgo manual), ou quando alguém editou à mão. O trabalho aqui é
**restaurar o invariante sem perder informação**.

> **Esta skill não sintetiza.** Encontrou plan `🟢 Aprovada` com síntese pendente, ou plan cuja verdade não
> está na spec fixa? Ela **não é sua** — relate ao usuário para que o revisor a sintetize, com o diff na
> frente. Escrever spec fixa aqui seria fazer às cegas o que o revisor faz com evidência.

## Quando usar

- O usuário pediu **reconciliação, limpeza ou auditoria** do diretório de plans.
- O `00-indice` e `specs/plan/` divergiram, ou o repositório veio do modelo antigo com resíduo `⚪`.
- **Só manual.** Nunca por gatilho, nunca ao fim de uma aprovação, nunca "de vez em quando".

## O que ela lê

| Local | Papel |
|---|---|
| `specs/plan/` — todos os arquivos | Um lado do invariante |
| `specs/00-indice.md` — a tabela | O outro lado |
| Bloco `## Síntese` de cada plan | Diz se a verdade já foi transportada, e para onde |
| A spec fixa citada nesse bloco | **A prova** — é nela que a verdade tem de estar |
| `git log -- <caminho da plan>` | O rastro. Sem commit, não há o que recuperar depois |

## Workflow

### 1. Levantamento

Monte as duas listas e cruze:

| Situação | O que é | Ação |
|---|---|---|
| Linha **e** arquivo, status igual | Saudável | Nada |
| Linha **e** arquivo, status **divergente** | Índice mentindo | A **plan** é a verdade — corrija o índice |
| Arquivo **sem** linha | Plan órfã — trabalho invisível | Recrie a linha, no status da plan |
| Linha **sem** arquivo | Índice mentindo — a plan já saiu | Remova a linha |
| Plan com bloco `## Síntese` ainda em disco | **Resíduo** (modelo antigo, ou ciclo interrompido) | Vai para os portões da §2 |
| Plan `⛔ Bloqueada` há muito tempo | Não é trabalho aberto | Leve ao usuário: volta para `🔴`, ou sai e o que sobra desce para `00-backlog.md` |

### 2. Portões — só para o resíduo com `## Síntese`

Uma plan só é removida se **todos** passarem. Qualquer "não" e ela fica, com o motivo relatado.

| # | Portão | Como conferir | Se falhar |
|---|---|---|---|
| 1 | **Síntese registrada** | A plan tem o bloco `## Síntese` com data e destino | Fica. É `🟢` mal fechada — devolva ao revisor |
| 2 | **Verdade na spec fixa** | Abra a spec de destino e ache lá o que a plan transportava | Fica. Devolva ao revisor: sintetizar não é seu |
| 3 | **Spec bate com o código** | O que a spec fixa afirma é o que o código faz hoje | Fica. Divergência é achado — relate |
| 4 | **Rastro no Git** | `git log --oneline -- specs/plan/plan-NN-*.md` retorna ≥ 1 commit | Fica. Plan nunca commitada não tem histórico: apagá-la é **perda total**, não limpeza |

Destino `—` (nada a transportar) dispensa os portões 2 e 3 — mas **não** o 1 nem o 4.

### 3. HITL

Apresente o lote e **pare**:

```
⚠️ Confirma a reconciliação abaixo?
```

Liste, separadamente: plans a **remover** (com o destino de síntese de cada uma), linhas de índice a
**corrigir ou remover**, plans que **ficam** e por qual portão falharam.

### 4. Aplicar

- `git rm` de cada plan aprovada no lote — **sem commit**; quem commita é o usuário.
- Corrija o `00-indice` na mesma passada: linha removida junto com o arquivo, status corrigido onde divergia,
  linha recriada onde faltava.
- Nada meio feito: arquivo e linha andam juntos.

### 5. Relatório

- **Removidas:** quais plans, e para que spec fixa cada uma tinha sido sintetizada.
- **Índice corrigido:** linhas criadas, removidas, status ajustados.
- **Ficaram:** quais, e o portão que falhou.
- **Para o revisor:** plans `🟢` com síntese pendente, e divergências spec×código encontradas no portão 3.
- **Para o backlog:** o que sobrou de plan abandonada e ainda vale registrar.

## Regras e limites

- **NUNCA sintetize.** Verdade fora da spec fixa = a plan fica e o caso vai para o revisor.
- **NUNCA remova plan sem os quatro portões**, e nunca uma plan da fila ativa (🔴 🟡 🟠 🔵).
- **NUNCA commite.** `git rm` deixa a remoção no índice do Git; o commit é do usuário.
- **NUNCA edite spec fixa, código ou plan** — esta skill só remove plan e conserta linha de índice.
- **NÃO transforme achado em trabalho.** O que merecer registro vai para `00-backlog.md`, não para uma plan.

## Checklist "pronta"

- [ ] As duas listas (arquivos × linhas) foram cruzadas, e cada divergência classificada pela §1?
- [ ] Cada candidata a remoção passou pelos **quatro** portões, com evidência nomeada?
- [ ] O portão 4 (`git log`) foi rodado em cada uma — nenhuma plan sem commit foi apagada?
- [ ] HITL apresentado com os três grupos (remover, corrigir, ficam) e confirmado?
- [ ] Arquivo e linha removidos juntos, sem sobra nos dois lados?
- [ ] Nada commitado, nenhuma spec fixa tocada, nenhuma síntese feita?
- [ ] Relatório entregue, com o que voltou para o revisor e o que desceu para o backlog?
