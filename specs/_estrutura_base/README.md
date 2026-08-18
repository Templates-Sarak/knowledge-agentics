# 🧭 Como usar o diretório de Specs

Este diretório (`specs/`) é o "cérebro" do projeto. É aqui que você define **o que** a IA deve construir, **como**
o sistema é estruturado e **por qual caminho** qualquer alteração passa.

O modelo é **SDD (Spec-Driven Development)**: **toda e qualquer alteração nasce de uma spec**. Nada é alterado
"direto no código".

---

## 1. Os dois grupos de arquivos

### 1.1 Specs de processo — `00-*.md` (a entrada de qualquer agente)

| Arquivo | Papel | Natureza |
|---|---|---|
| `00-contexto.md` | O que é o repositório, regras inegociáveis, mapa de roteamento para as specs fixas | **Por projeto** — molde com instruções, preenchido pelo revisor |
| `00-indice.md` | Fila de execução das plans: ordem, dependências, status, destino | **Por projeto** — mantido pelo revisor |
| `00-knowledge.md` | Roteador de capacidades (skills/commands/agents/hooks/MCP) | **Universal** — igual em todo projeto |
| `00-prompt-revisor.md` | Prompt que forma o agente revisor numa conversa nova | **Universal** |
| `00-prompt-executor.md` | Prompt que forma o agente executor (a cada execução de plan) | **Universal** |

> As specs **universais** são idênticas em todos os repositórios — é por isso que dependem de `00-contexto` e
> `00-indice` para conhecer a regra de negócio e a arquitetura locais.

### 1.2 Specs de conteúdo (a verdade do sistema)

| Pasta | Pergunta | Exemplo | Natureza |
|---|---|---|---|
| `specs/` | O **QUÊ** — regras de negócio, validações, comportamento | `01-login.md` | Documento vivo |
| `arquitetura/` | O **COMO** — design estrutural, stack, banco, contratos | `00-base-python.md`, `04-regras.md` | Documento vivo |
| `adr/` | O **POR QUÊ** — decisões técnicas com trade-off | `000-decisoes-do-template.md`, `001-escolha-do-postgres.md` | **Imutável** — decisão nova = ADR novo |
| `plan/` | O **COMO CHEGAR LÁ** — toda plan, do nascimento ao expurgo | `plan-01-extrair-validacao.md` | Fila de execução — o `status` diz em que pé cada uma está |

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

As decisões que as justificam estão em `adr/000-decisoes-do-template.md`.

**Regra do SDD:** as specs de `specs/`, `arquitetura/` e `adr/` devem refletir a **realidade exata** do
repositório — um agente que as lê fica corretamente contextualizado sem abrir uma linha de código. Spec
divergente do código é defeito de primeira ordem.

---

## 2. Os planos (`plan/`) — **sim, entram no Git**

Uma **plan** é a unidade de trabalho do ciclo: `plan/plan-NN-<slug>.md`, escrita pelo **agente revisor** e
executada pelo **agente executor**. Ela contém descrição, escopo, referências, instruções, o **prompt de
execução** e o **destino da síntese**.

Enquanto está ativa ou aguardando síntese, uma plan é **versionada e preservada**: é o histórico de por que o
repositório é como é, e o registro de cada veredito de revisão. **Nenhuma plan é apagada antes de sintetizada
— e nenhuma é apagada sem que sua verdade já esteja na spec fixa correspondente.**

Depois de sintetizada e expurgada, a plan **some do worktree**: seu conteúdo virou verdade consolidada em
`specs/`, `arquitetura/` ou `adr/`, e o rastro de como se chegou lá passa a viver no histórico do Git, não
como arquivo do repositório.

**Nenhum arquivo se move durante o ciclo.** Toda plan vive em `plan/`, e o que responde "em que pé está isto?"
é o `status` do frontmatter — espelhado nas duas tabelas do `00-indice`:

| Status | Onde aparece no índice | O que é |
|---|---|---|
| 🔴 🟡 🟠 🔵 ⛔ | §1 Fila de execução | O que está em jogo agora e exige ação |
| 🟢 Aprovada | §4 Encerradas | Verificada; a síntese aguarda a autorização do usuário |
| ⚪ Sintetizada | §4 Encerradas | Verdade já transportada; o arquivo é resíduo aguardando expurgo |

A síntese é feita pelo **revisor**, na própria conversa da aprovação e sob autorização do usuário: ela
acrescenta o bloco `## Síntese` à plan, marca `⚪` e completa a linha da §4. O **expurgo** é outra coisa e tem
outro dono — a skill `spec-atualizar`, disparada manualmente pelo usuário, que reverifica cada `⚪` antes de
remover o arquivo (`git rm`) e a linha da §4.

> Numeração é **monotônica e definitiva**: `plan-07` é `plan-07` para sempre, mesmo depois de removida. O
> próximo número livre **não** vem de escanear as pastas (uma plan sintetizada some das duas) — vem do campo
> `proximo_numero_plan` no frontmatter do `00-indice`. A ordem de execução se muda na coluna `#` do
> `00-indice`, nunca renomeando o arquivo.

---

## 3. O ciclo de execução

```
1. usuário traz uma demanda
2. REVISOR escreve  plan/plan-NN-<slug>.md  (status 🔴)  +  linha no 00-indice
3. usuário abre conversa nova: "leia 00-prompt-executor e execute plan-NN"
4. EXECUTOR executa → alterações no worktree → resumo escrito na própria plan (🟠)
5. REVISOR verifica DIRETAMENTE o worktree (não confia no resumo)
     ├─ reprovado → 🔵 + prompt de correção → volta ao 4
     └─ aprovado  → 🟢 + linha migra da §1 para a §4 do 00-indice
                    + REVISOR propõe a síntese e espera a autorização do usuário
6. USUÁRIO autoriza → REVISOR sintetiza em specs/ · arquitetura/ · adr/, acrescenta o
   bloco `## Síntese` à plan, marca ⚪ e completa a linha da §4
7. USUÁRIO commita — código, spec fixa e plan ⚪ na mesma unidade de verdade
8. periodicamente: usuário dispara a skill `spec-atualizar` → cada ⚪ é REVERIFICADA e
   então removida (arquivo + linha do 00-indice). A spec fixa já era, desde o passo 6,
   a única fonte viva dessa verdade
```

| Papel | Prompt de entrada | Pode escrever | Nunca faz |
|---|---|---|---|
| **Revisor** | `00-prompt-revisor.md` | plans, specs fixas (na síntese autorizada), prompts, mensagens | tocar código · commitar · remover plan |
| **Executor** | `00-prompt-executor.md` | código + resumo na própria plan | criar/alterar outras specs · commitar · mover ou remover plan |
| **Usuário** | — | qualquer coisa | — (é quem commita, autoriza a síntese e dispara `spec-atualizar`) |

**Nenhum agente commita e nenhum agente adiciona co-autoria.** Commit é ato do usuário; a única exceção é
solicitação expressa dele naquela conversa — e, mesmo então, a mensagem sai **sem `Co-Authored-By`** e sem
qualquer outra marca de autoria de agente.

---

## 4. Onde crio o quê?

| Quero… | Vá para |
|---|---|
| Pedir uma alteração no sistema | uma **plan** nova (revisor escreve) — molde `_templates/template-plan.md` |
| Registrar regra de negócio consolidada | `specs/NN-<nome>.md` — pela síntese do revisor, não à mão |
| Registrar design/stack consolidados | `arquitetura/NN-<nome>.md` — idem |
| Registrar uma decisão com trade-off | `adr/NNN-<nome>.md` — idem |
| Consultar por que algo foi feito assim | A spec fixa de destino é a verdade atual. Para o veredito e o escopo originais: a plan, se ainda estiver em `plan/`; se já foi expurgada, `git log --diff-filter=D` no path dela |
| Contextualizar um agente novo | ele lê `00-contexto.md` — você não explica nada no chat |

> As specs fixas são atualizadas **pela síntese das plans** (feita pelo revisor, no ato da aprovação e sob
> autorização do usuário — [[00-prompt-revisor]] §7.3), nunca por edição avulsa. Isso é o que mantém spec e
> código convergentes: no instante em que a execução é aprovada, a verdade documentada já acompanhou.

---

## 5. Convenções

- **Nomes** em `kebab-case`, com prefixo numérico: `01-login.md`, `plan-03-ajustar-cache.md`.
- **Frontmatter YAML obrigatório** em toda spec, com os campos do molde correspondente. Não invente campos.
  As `00-*` usam `tipo: "processo"`.
- **Referencie, nunca duplique.** Conteúdo copiado desatualiza e passa a mentir. Aponte para a fonte.
- **Ponteiro órfão é defeito**: toda spec citada existe; todo comando citado roda.
- **Datas sempre absolutas** (`2026-07-31`), nunca "semana passada".
- **Skills e commands não vivem aqui** — vêm da base Sarak instalada no agente. O catálogo é o `00-knowledge.md`.
