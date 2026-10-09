# 🧭 Como usar o diretório de Specs

Este diretório (`specs/`) é o "cérebro" do projeto. É aqui que você define **o que** a IA deve construir, **como**
o sistema é estruturado e **por qual caminho** qualquer alteração passa.

O modelo é **SDD (Spec-Driven Development)**: **toda e qualquer alteração nasce de uma instrução do agente
revisor**. Nada é alterado "direto no código".

Essa instrução tem duas formas, e quem escolhe é o revisor, na **triagem** (`00-prompt-revisor` §4):
**plan** quando a alteração deixa verdade documentada para trás (regra, contrato, stack, comportamento);
**prompt direto**, sem arquivo nenhum, quando não deixa (bug sem mudança de regra, typo, conformidade,
limpeza). A via direta encurta a papelada — nunca a verificação.

---

## 1. Os dois grupos de arquivos

### 1.1 Specs de processo — `00-*.md` (a entrada de qualquer agente)

| Arquivo | Papel | Natureza |
|---|---|---|
| `00-contexto.md` | O que é o repositório, regras inegociáveis, mapa de roteamento para as specs fixas | **Por projeto** — molde com instruções, preenchido pelo revisor |
| `00-indice.md` | Fila de execução das plans: ordem, dependências, status, destino | **Por projeto** — mantido pelo revisor |
| `00-knowledge.md` | Roteador de capacidades (skills/commands/agents/hooks/MCP) | **Universal** — igual em todo projeto |
| `00-prompt-revisor.md` | Prompt que forma o agente revisor numa conversa nova | **Universal** |
| `00-prompt-executor.md` | Prompt que forma o agente executor (a cada execução) | **Universal** |
| `00-backlog.md` | Achados registrados e **não agendados** — sem status, sem fila | **Por projeto** — mantido pelo revisor |
| `panorama/00-planejamento.md` | Catálogo de **famílias** (§1) e **horizonte** de itens (§2) | **Por projeto** — mantido pelo revisor; família e item novos só com aprovação do usuário |
| `panorama/00-resumo.md` | O **estado de relance**: progresso por item, plans em curso, bloqueios | **Gerado** pela skill `spec-panorama` — nunca editado à mão |

> As specs **universais** são idênticas em todos os repositórios — é por isso que dependem de `00-contexto` e
> `00-indice` para conhecer a regra de negócio e a arquitetura locais.

### 1.2 Specs de conteúdo (a verdade do sistema)

| Pasta | Pergunta | Exemplo | Natureza |
|---|---|---|---|
| `specs/` | O **QUÊ** — regras de negócio, validações, comportamento | `01.01-login.md` | Documento vivo |
| `arquitetura/` | O **COMO** — design estrutural, stack, banco, contratos | `00-base-python.md`, `04-regras.md` | Documento vivo |
| `adr/` | O **POR QUÊ** — decisões técnicas com trade-off | `000-decisoes-do-template.md`, `001-escolha-do-postgres.md` | **Imutável** — decisão nova = ADR novo |
| `plan/` | O **COMO CHEGAR LÁ** — trabalho em andamento | `plan-01.01-extrair-validacao.md` | **Temporária** — removida no ato da síntese |

Moldes de todos eles em `_templates/`.

### 1.3 A lei da arquitetura de módulos mora em `arquitetura/`

Projeto que adota o **template de módulos** recebe as cinco leis dentro de `arquitetura/` — elas *são* specs
de arquitetura, e por isso não ganham uma árvore paralela:

| Arquivo | Responde |
|---|---|
| `00-arquitetura.md` | de que peças o sistema é feito, onde estão as fronteiras |
| `01-modulo.md` | como um módulo é por dentro; manifesto, config, portas, gateways |
| `02-contrato-e-dados.md` | forma da API, do erro, do schema, da migration |
| `03-operacao.md` | segurança, log, teste, extração |
| **`04-regras.md`** | **o catálogo normativo — a regra exata e o que a verifica** |
| `00-base-<linguagem>.md` | a stack e o ferramental desta linguagem |

**Estas seis não se editam à mão como as demais specs.** As cinco primeiras vêm do template e são atualizadas
por ele; mudar de ideia sobre uma delas é ADR novo em `adr/`. E, diferente de toda outra spec deste
diretório, elas têm **verificador executável**: `node tools/gate/validate.mjs`.

As decisões que as justificam estão em `adr/000-decisoes-do-template.md`. Por chegarem prontas, elas não
seguem a numeração por família: são nomes reservados da família `00`, listados no catálogo
(`panorama/00-planejamento.md` §1).

**Regra do SDD:** as specs de `specs/`, `arquitetura/` e `adr/` devem refletir a **realidade exata** do
repositório — um agente que as lê fica corretamente contextualizado sem abrir uma linha de código. Spec
divergente do código é defeito de primeira ordem.

---

## 2. Os planos (`plan/`) — **sim, entram no Git**

Uma **plan** é a unidade de trabalho do ciclo **quando há verdade a preservar**: `plan/plan-FF.NN-<slug>.md`,
escrita pelo **agente revisor** e executada pelo **agente executor**. Demanda que não deixa verdade nenhuma
não passa por aqui — corre pela via direta e não gera arquivo (`00-prompt-revisor` §6). Ela contém descrição, escopo, referências, instruções, o **prompt de
execução** e o **destino da síntese**.

Enquanto existe, a plan é **versionada**: ela é o registro do escopo, das instruções e de cada veredito.
Toda plan viva tem exatamente uma linha no `00-indice`, e o `status` do frontmatter diz em que pé ela está —
`🔴 A executar` · `🟡 Em execução` · `🟠 Em revisão` · `🔵 Em correção` · `⛔ Bloqueada` · `🟢 Aprovada`.

**A plan é temporária, e some no ato da síntese.** Quando o revisor transporta a verdade dela para a spec
fixa de destino, ele **remove o arquivo e a linha do índice na mesma ação** (`00-prompt-revisor` §7.4). Não
existe estado "sintetizada aguardando limpeza": sintetizou, saiu.

Isso é deliberado e resolve dois problemas de uma vez. Enquanto a plan sintetizada ficava em disco, havia
**duas fontes vivas** da mesma verdade — e o índice crescia com o histórico até virar cemitério. Agora o
tamanho do `00-indice` é limitado pelo **trabalho aberto**, e a spec fixa é a única fonte.

A janela de conferência não se perdeu: o commit que remove a plan **mostra a plan inteira no diff**. Continua
possível auditar se a spec fixa ficou correta — no lugar onde histórico mora, que é o Git
(`git log --diff-filter=D -- specs/plan/plan-FF.NN-*.md`).

A **única** trava entre a síntese e o `git rm` é o rastro: se `git log` no path da plan vier vazio, ela nunca
foi commitada, e apagá-la seria perda total. Nesse caso ela fica até o usuário commitar.

> Numeração é **por família, monotônica e definitiva**: `plan-02.07` é `plan-02.07` para sempre, mesmo depois
> de removida. O próximo número livre **não** vem de escanear a pasta (plans sintetizadas sumiram dela) — vem
> do contador da família no mapa `proximo_numero_plan` do frontmatter do `00-indice`. A ordem de execução se
> muda na coluna `#` do `00-indice`, nunca renomeando o arquivo.

---

## 3. O ciclo de execução

O ciclo abaixo é o da **plan**. Antes dele há sempre a triagem do revisor (`00-prompt-revisor` §4): demanda
que não deixa verdade documentada corre pela **via direta** — o revisor emite o prompt, o executor executa, o
revisor verifica e o usuário commita. Sem plan, sem linha no índice e sem síntese; os passos 2 e 6 não
existem lá.

```
1. usuário traz uma demanda
2. REVISOR escreve  plan/plan-FF.NN-<slug>.md  (status 🔴)  +  linha no 00-indice
3. usuário abre conversa nova: "leia 00-prompt-executor e execute plan-FF.NN"
4. EXECUTOR executa → alterações no worktree → resumo escrito na própria plan (🟠)
5. REVISOR verifica DIRETAMENTE o worktree (não confia no resumo)
     ├─ reprovado → 🔵 + prompt de correção → volta ao 4
     └─ aprovado  → 🟢 + REVISOR propõe a síntese e espera a autorização do usuário
6. USUÁRIO autoriza → REVISOR sintetiza em specs/ · arquitetura/ · adr/, acrescenta o
   bloco `## Síntese` à plan e então REMOVE a plan (git rm) e a linha do 00-indice
7. USUÁRIO commita — código, spec fixa e a remoção da plan na mesma unidade de verdade

Achado fora do escopo, em qualquer passo, desce para o 00-backlog — nunca vira plan
nova no meio do caminho.
```

| Papel | Prompt de entrada | Pode escrever | Nunca faz |
|---|---|---|---|
| **Revisor** | `00-prompt-revisor.md` | plans, `00-indice`, `00-backlog`, specs fixas (na síntese autorizada), prompts | tocar código · commitar |
| **Executor** | `00-prompt-executor.md` | código + resumo (na plan, ou na conversa) | criar/alterar outras specs · commitar · mover ou remover plan |
| **Usuário** | — | qualquer coisa | — (é quem commita, autoriza a síntese e promove itens do backlog) |

**Nenhum agente commita e nenhum agente adiciona co-autoria.** Commit é ato do usuário; a única exceção é
solicitação expressa dele naquela conversa — e, mesmo então, a mensagem sai **sem `Co-Authored-By`** e sem
qualquer outra marca de autoria de agente.

---

## 4. Onde crio o quê?

| Quero… | Vá para |
|---|---|
| Pedir uma alteração no sistema | leve ao **revisor**: ele tria (`00-prompt-revisor` §4) e escreve uma **plan** (molde `_templates/template-plan.md`) ou emite um **prompt direto** |
| Registrar um problema que não é para agora | `00-backlog.md` — uma linha, sem status e sem fila |
| Registrar regra de negócio consolidada | `specs/FF.NN-<nome>.md` — pela síntese do revisor, não à mão |
| Registrar design/stack consolidados | `arquitetura/FF.NN-<nome>.md` — idem |
| Registrar uma decisão com trade-off | `adr/NNN-<nome>.md` — idem |
| Consultar por que algo foi feito assim | A spec fixa de destino é a verdade atual. Para o veredito e o escopo originais: a plan, se ainda existir; se já foi sintetizada, `git log --diff-filter=D` no path dela |
| Contextualizar um agente novo | ele lê `00-contexto.md` — você não explica nada no chat |

> As specs fixas são atualizadas **pela síntese das plans** (feita pelo revisor, no ato da aprovação e sob
> autorização do usuário — [[00-prompt-revisor]] §7.4), nunca por edição avulsa. Isso é o que mantém spec e
> código convergentes: no instante em que a execução é aprovada, a verdade documentada já acompanhou.

---

## 5. Convenções

- **Nomes** em `kebab-case`, com prefixo de família (`FF.NN`, catálogo em `panorama/00-planejamento.md` §1):
  `01.01-login.md`, `plan-02.03-ajustar-cache.md`. Exceção: os nomes reservados da família `00` (fundação) não seguem `FF.NN` — a lista está no catálogo.
- **Frontmatter YAML obrigatório** em toda spec, com os campos do molde correspondente. Não invente campos.
  As `00-*` usam `tipo: "processo"`.
- **Referencie, nunca duplique.** Conteúdo copiado desatualiza e passa a mentir. Aponte para a fonte.
- **Ponteiro órfão é defeito**: toda spec citada existe; todo comando citado roda.
- **Datas sempre absolutas** (`2026-07-31`), nunca "semana passada".
- **Skills e commands não vivem aqui** — vêm da base Sarak instalada no agente. O catálogo é o `00-knowledge.md`.
