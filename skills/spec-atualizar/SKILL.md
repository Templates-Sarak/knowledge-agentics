---
name: spec-atualizar
description: Expurga do diretório de specs as plans já sintetizadas (⚪) — reverifica que a verdade está mesmo na spec fixa de destino, que a spec bate com o código e que a plan já existe no histórico do Git, e só então remove o arquivo e a linha do 00-indice. Use APENAS quando o usuário pedir explicitamente a limpeza/expurgo das plans. NÃO sintetiza — a síntese é do agente revisor, no ato da aprovação. NÃO acione proativamente.
---

# Skill: Expurgar as Plans já Sintetizadas

Última etapa do ciclo SDD, e a **única** rotina autorizada a remover uma plan do repositório.

Quando esta skill roda, a síntese **já aconteceu**: o agente revisor transportou a verdade da plan para a spec
fixa de destino no momento da aprovação, sob autorização do usuário (`00-prompt-revisor.md` §7.3), e deixou a
plan marcada `⚪ Sintetizada`. O que sobra em `specs/plan/` é **resíduo**: arquivo cujo conteúdo já vive em
outro lugar.

O trabalho aqui não é escrever spec — é **provar que a plan pode sumir sem perda** e, provado isso, apagá-la.
A pergunta que a skill responde, uma vez por plan: *"se este arquivo desaparecer agora, alguma informação
deixa de existir?"* Se a resposta não for um **não** demonstrado, a plan fica.

> **Esta skill não sintetiza.** Encontrou uma plan `🟢 Aprovada` (síntese pendente)? Ela **não é sua** — passe
> ao usuário para que o revisor a sintetize. Escrever spec fixa aqui seria fazer, sem o contexto do diff, o
> que o revisor faz com o diff na frente.

## Quando usar

- O usuário pediu explicitamente para **limpar / expurgar / remover as plans sintetizadas**.
- **Só manual.** Não roda por gatilho, não roda "de vez em quando por conta própria", não é acionada ao fim de
  uma aprovação. Quem decide a hora é o usuário.
- **Não** é usada para sintetizar (revisor, na aprovação), executar (executor) nem escrever plan (revisor).

## O que ela lê

| Local | Papel |
|---|---|
| `specs/plan/` — status `⚪ Sintetizada` | **A entrada desta skill.** Candidatas ao expurgo |
| `specs/plan/` — status `🟢 Aprovada` | **Não são suas.** Síntese pendente — relate ao usuário e siga |
| `specs/plan/` — demais status | Fila ativa. Nem olhe para remoção |
| `specs/00-indice.md` §4 | A linha de cada candidata, e a data/destino da síntese |
| A spec fixa declarada no bloco `## Síntese` de cada plan | **A prova** — é nela que a verdade tem de estar |
| Código-fonte que a plan tocou | **A contraprova** — a spec fixa tem de bater com o que o código faz hoje |
| `git log -- <caminho da plan>` | O rastro. Sem commit, não há histórico a recuperar depois |

## Workflow

### 1. Levantamento

- Liste `specs/plan/` e separe **apenas** as plans com `status: "⚪ Sintetizada"`.
- Nenhuma? **Pare** e informe: nada a expurgar. Não invente trabalho, não vá procurar `🟢` para processar.
- Registre também as `🟢 Aprovada` encontradas — elas entram no relato final (§5) como **síntese pendente**,
  nunca no lote.
- Leia a §4 do `00-indice.md` para localizar a linha de cada candidata.

### 2. Os quatro portões (por plan, um a um)

Uma plan só é removida se as **quatro** verificações passarem. Falhou uma? Ela **fica**, com o motivo
registrado. Nunca remova "as outras três passaram, vai".

| # | Portão | Como verificar | Se falhar |
|---|---|---|---|
| 1 | **Síntese registrada** | A plan tem o bloco `## Síntese` com data e destino, `status: ⚪` e a linha da §4 com *Sintetizada em* preenchida | Fica. É `🟢` mal fechada — devolva ao revisor |
| 2 | **Verdade na spec fixa** | Abra a spec fixa citada no bloco `## Síntese` e confirme que o conteúdo declarado está **de fato lá** — o texto, não só o arquivo | Fica. Síntese incompleta — leve ao usuário |
| 3 | **Spec fixa × código** | Confronte a spec fixa com o código que a plan tocou. Ela descreve o sistema como ele **é hoje**? | Fica. Divergência é achado de primeira ordem — vira plan nova de reconciliação |
| 4 | **Rastro no Git** | `git log --oneline -- specs/plan/plan-NN-<slug>.md` retorna pelo menos um commit | Fica. Plan nunca commitada não tem histórico: apagá-la é perda total, não expurgo |

Sobre o **portão 4**: ele existe porque o rastro de uma plan expurgada vive só no Git
(`git log --diff-filter=D`). Se o arquivo nunca foi commitado, esse rastro não existe — remover seria apagar
contexto, veredito e resumo de execução para sempre. Não cobre o usuário por isso: apenas **não remova**, diga
que basta commitar e rodar a skill de novo.

Sobre o **portão 3**: é a reconciliação que dá sentido ao intervalo em `⚪`. Entre a síntese e o expurgo existe
uma janela em que a plan inteira ainda está em disco — é a última chance de perceber que a spec fixa ficou
errada **com a evidência original ainda à mão**. Usar essa janela é o trabalho; pulá-la torna a skill um `rm`
com etapas.

### 3. HITL — uma confirmação para o lote

Apresente o resultado dos portões **antes** de remover qualquer coisa, em tabela: uma linha por plan, o
veredito de cada portão e a decisão (remover / fica, com motivo). Depois pergunte:

`⚠️ Confirma o expurgo das plans marcadas para remoção?`

E **aguarde**. Sem resposta positiva, nada é removido. O usuário pode excluir plans específicas do lote — nesse
caso remova só as que ele manteve na lista, sem discutir.

### 4. Remoção (só o que passou nos quatro portões e foi confirmado)

Para cada plan aprovada no HITL, na mesma passada:

1. `git rm specs/plan/plan-NN-<slug>.md` — **sem commit**. Quem commita é o usuário, sempre.
2. No `specs/00-indice.md`, **apague a linha** correspondente da §4. Não a marque, não a mova: apague.
3. **Não toque** no `proximo_numero_plan`. A numeração é monotônica: o `NN` da plan removida não volta a ser
   usado, nunca.

Arquivo removido com linha sobrando no índice (ou o inverso) é índice quebrado. As duas coisas andam juntas.

### 5. Entrega

Relate, sem omitir nada:

- **Expurgadas:** quais plans, e para que spec fixa cada uma tinha sido sintetizada.
- **Mantidas:** quais ficaram, em que portão pararam e o que falta para poderem sair na próxima rodada.
- **Síntese pendente:** as `🟢 Aprovada` encontradas — o revisor precisa sintetizá-las antes que virem
  candidatas.
- **Achados de reconciliação:** toda divergência do portão 3, com a sugestão de plan nova.
- As alterações (inclusive os `git rm`) estão no **worktree, sem commit**.

Plan pulada em silêncio é falha: ela ficaria ocupando o diretório para sempre, sem ninguém saber por quê.

## Regras e limites

- **NUNCA sintetize.** Se a verdade não está na spec fixa, a plan **fica** e o caso vai para o revisor. Esta
  skill não escreve em `specs/`, `arquitetura/`, `adr/` nem `00-contexto.md`.
- **NUNCA remova plan que não esteja `⚪ Sintetizada`.** `🟢` tem síntese pendente; a fila ativa está em jogo.
- **NUNCA remova sem os quatro portões verdes e sem o HITL confirmado.** Nenhum atalho, nem "é óbvio que pode".
- **NUNCA reaproveite o número de uma plan removida.** `proximo_numero_plan` no `00-indice.md` continua sendo
  a única fonte do próximo `NN`.
- **NUNCA commite e NUNCA adicione co-autoria.** Nem `Co-Authored-By`, nem qualquer outra marca de autoria de
  agente. Commit é ato do usuário; a única exceção é solicitação expressa dele naquela conversa.
- **NÃO conserte a divergência que encontrar.** Achado do portão 3 vira plan nova, escrita pelo revisor — não
  uma edição avulsa aqui.
- **NÃO acione esta skill proativamente.**

## Checklist "pronta"

- [ ] `specs/plan/` lido; só as `⚪ Sintetizada` entraram no lote.
- [ ] `🟢 Aprovada` encontradas foram relatadas como síntese pendente, não processadas.
- [ ] Os quatro portões verificados **por plan**, com evidência real (spec fixa aberta, código conferido,
      `git log` rodado) — não por leitura do frontmatter.
- [ ] Tabela de vereditos apresentada e HITL confirmado antes de qualquer remoção.
- [ ] Cada plan removida: `git rm` do arquivo **e** linha apagada da §4 do `00-indice`, na mesma passada.
- [ ] `proximo_numero_plan` intocado.
- [ ] Plans mantidas relatadas com o portão em que pararam.
- [ ] Nada commitado. Nenhuma co-autoria. Nenhuma spec fixa escrita.

## Referências

- `references/workflow.md` — os portões na prática, formulação do HITL e do relato final.
- `00-prompt-revisor.md` §7.3 (no repositório do projeto) — como a síntese foi feita, e portanto o que esta
  skill está verificando.
