---
tipo: "processo"
titulo: "Contexto do Repositório — Briefing de Entrada"
dominio: "Governança de Specs (SDD)"
status: "🟢 Vigente"
tags: ["processo", "contexto", "sdd"]
relacionados: ["[[00-knowledge]]", "[[00-indice]]", "[[00-prompt-revisor]]", "[[00-prompt-executor]]"]
---

# 0. O que é este arquivo

Esta é a **porta de entrada de qualquer agente** neste repositório. Um agente que leu esta spec — e só ela —
deve saber: **o que** o repositório é, **quais regras** governam qualquer alteração, **onde** está cada
informação e **como** se trabalha aqui.

> ⚠️ **Este arquivo é um molde com instruções embutidas.** Ele chega ao repositório **vazio de conteúdo
> específico**: cada seção traz um bloco `> **Como escrever:**` (a instrução, que **permanece** no arquivo como
> contrato de manutenção) e um bloco `<!-- PREENCHER -->` (o conteúdo real, que o **agente revisor** escreve).
> Preencher esta spec é a **primeira** plan de qualquer repositório novo.

**Quem escreve/atualiza:** exclusivamente o **agente revisor** ([[00-prompt-revisor]]).
**Quando atualizar:** sempre que uma plan aprovada mudar stack, arquitetura, fronteiras de módulo, regra
inegociável ou o mapa de roteamento. Nunca por conta própria fora de uma plan.

---

# 1. Identidade do repositório

> **Como escrever:** 3 a 6 linhas, em prosa direta. Responda: **o que este repositório é** (produto? base de
> conhecimento? biblioteca? site?), **qual problema resolve**, **quem consome** (usuário final, outros repos,
> agentes) e **o que ele explicitamente NÃO é**. Sem marketing, sem histórico. Um agente lê isto e para de
> supor. Proibido descrever a estrutura de pastas aqui — isso é da §3.

<!-- PREENCHER -->

---

# 2. Regras inegociáveis (resumo operante)

> **Como escrever:** liste **apenas** as regras que um agente pode violar sem perceber, em forma de bullets
> curtos e verificáveis. Duas fontes, nesta ordem:
> 1. **Universais do ecossistema** — não reescreva: aponte para `CLAUDE.md` (raiz) e para a skill
>    `padrao-escrita`. Cite no máximo os limiares que causam reprovação imediata (SRP; função ≤ 40 linhas;
>    aninhamento ≤ 3; ≤ 4 parâmetros; zero hardcoded; segredos só em `.env`; consumo só via `api/` de outro
>    módulo; `shared/` sem lógica).
> 2. **Específicas deste repositório** — o que só vale aqui (convenções de nomes locais, uma biblioteca
>    proibida, um diretório que não se toca, um formato de retorno obrigatório).
>
> **Regra de ouro: referencie, nunca duplique.** Se uma regra já está numa spec fixa ou numa skill, escreva
> uma linha e o ponteiro. Conteúdo duplicado desatualiza e passa a mentir.

<!-- PREENCHER -->

---

# 3. Stack e arquitetura em uma página

> **Como escrever:** o mínimo para orientar, com ponteiro para o detalhe. Inclua:
> - **Stack**: linguagens + versões, frameworks, banco, runtime, gerenciador de pacotes.
> - **Camada de padrão da linguagem**: qual skill `padrao-*` se aplica (`padrao-python`, `padrao-typescript`,
>   `padrao-go`, `padrao-java`).
> - **Mapa de módulos/domínios**: tabela `módulo → responsabilidade → onde vive (backend/frontend)`.
> - **Fronteiras**: quem pode chamar quem, e por onde (contrato `api/`).
> - **Comandos vitais**: instalar, rodar, testar, lintar, buildar — copiáveis, verificados.
>
> Cada item aponta para a spec fixa em `arquitetura/` que o detalha. Esta seção é o índice, não o tratado.

<!-- PREENCHER -->

---

# 4. Mapa de roteamento — "que spec eu leio para esta tarefa?"

> **Como escrever:** esta é a seção **mais valiosa** do arquivo e a razão de ele existir. Uma tabela que
> responde à pergunta que todo agente faz ao receber uma tarefa. Uma linha por tipo de tarefa recorrente
> no repositório, com caminhos **relativos a `specs/`** e clicáveis.
>
> Preencha a coluna "Leia antes" com **specs fixas** (`arquitetura/`, `specs/`, `adr/`) — para skills e
> commands, aponte para [[00-knowledge]], que é o roteador de capacidades.
>
> | Tipo de tarefa | Leia antes (specs fixas) | Capacidade |
> |---|---|---|
> | Alterar regra de negócio de \<módulo\> | `specs/NN-<modulo>.md` | [[00-knowledge]] |
> | Criar/alterar endpoint | `arquitetura/NN-api.md` + spec do módulo | [[00-knowledge]] |
> | Mexer em schema/migration | `arquitetura/NN-dados.md` + ADR relevante | [[00-knowledge]] |
> | Mudar decisão estrutural | todos os `adr/` + `arquitetura/` | [[00-knowledge]] |
>
> Mantenha entre 6 e 15 linhas. Se passar disso, o repositório precisa de specs melhores, não de mais linhas
> aqui. **Ponteiro órfão é defeito**: toda spec citada tem de existir.

<!-- PREENCHER -->

---

# 5. Como se trabalha aqui (ciclo SDD)

> **Como escrever:** esta seção é **universal — copie o bloco abaixo como está**. Só acrescente desvios reais
> deste repositório (por exemplo: "toda plan que toca `pagamentos/` exige ADR"). Não reescreva o ciclo.

**Toda e qualquer alteração passa por uma spec.** Nada é alterado "direto no código".

```
revisor escreve  specs/plan/plan-NN-<slug>.md
      ↓
executor lê  00-prompt-executor  +  plan-NN  e executa
      ↓
alterações ficam no worktree (nenhum agente commita)
      ↓
revisor VERIFICA diretamente (não confia no resumo do executor)
      ├─ reprovado → prompt de correção → executor corrige → repete
      └─ aprovado  → status da plan + [[00-indice]] atualizados
      ↓
usuário commita
      ↓
periodicamente: /spec-atualizar sintetiza as plans aprovadas nas specs fixas (adr/ · arquitetura/ · specs/)
```

| Papel | Spec de entrada | Pode escrever | Nunca faz |
|---|---|---|---|
| **Revisor** | [[00-prompt-revisor]] | specs, prompts, mensagens | tocar código · commitar |
| **Executor** | [[00-prompt-executor]] | código + resumo na própria plan | criar/alterar outras specs · commitar |
| **Usuário** | — | qualquer coisa | — (é quem commita e dispara `/spec-atualizar`) |

<!-- PREENCHER: desvios específicos deste repositório, se houver -->

---

# 6. Capacidades disponíveis

> **Como escrever:** seção **universal — não a preencha com conteúdo**. Apenas mantenha o ponteiro. As
> skills, commands, agents e hooks **não vivem neste repositório**: vêm da memória/plugin do agente. O
> catálogo e as regras de roteamento estão em [[00-knowledge]].

Antes de escolher **como** fazer algo, leia **[[00-knowledge]]** — é o roteador de capacidades
(situação → skill/command/agent/hook) e o único lugar onde esse catálogo é mantido.

---

# 7. Fronteiras — o que nunca fazer neste repositório

> **Como escrever:** bullets no imperativo negativo, cada um com o **porquê** em meia linha. Só o que é
> específico deste repositório (as proibições de papel já estão na §5 e nas specs de prompt). Exemplos do
> tipo de item: diretórios gerados que não se editam à mão; arquivos que só o usuário altera; operações
> irreversíveis que exigem confirmação; integrações que não podem ser chamadas em desenvolvimento.

<!-- PREENCHER -->

---

# 8. Estado e pendências conhecidas

> **Como escrever:** o que um agente descobriria do jeito difícil. Dívidas técnicas aceitas, áreas em
> migração, incoerências conhecidas entre código e spec, decisões em aberto. **Datas sempre absolutas**
> (`2026-07-31`, nunca "semana passada"). Item resolvido sai daqui — esta seção não é histórico; o histórico
> é o `git` e os `adr/`.

<!-- PREENCHER -->

---

# 9. Contrato de manutenção desta spec

- **Alvo de tamanho:** ≤ 200 linhas preenchidas. Estourou? O conteúdo pertence a uma spec fixa — mova e aponte.
- **Referencie, nunca duplique.** Esta spec é um **mapa**, não território.
- **Ponteiro órfão é defeito.** Toda spec citada existe; todo comando citado roda.
- **Só o revisor edita**, e só no contexto de uma plan aprovada.
- **Sincronia obrigatória:** se uma plan mudou stack, fronteira ou regra, a mesma plan atualiza esta spec.
  Contexto desatualizado é pior que contexto ausente — o agente confia nele.
