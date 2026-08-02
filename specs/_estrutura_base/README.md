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
| `plan/` | O **COMO CHEGAR LÁ** — plans **ativas** | `plan-01-extrair-validacao.md` | Fila de execução |
| `plan/executadas/` | O que já terminou — plans aprovadas e sintetizadas | `plan-01-extrair-validacao.md` | Rastro auditável permanente |

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
diretório, elas têm **verificador executável**: `node ferramentas/gate/validar.mjs`.

As decisões que as justificam estão em `adr/000-decisoes-do-template.md`.

**Regra do SDD:** as specs de `specs/`, `arquitetura/` e `adr/` devem refletir a **realidade exata** do
repositório — um agente que as lê fica corretamente contextualizado sem abrir uma linha de código. Spec
divergente do código é defeito de primeira ordem.

---

## 2. Os planos (`plan/`) — **sim, entram no Git**

Uma **plan** é a unidade de trabalho do ciclo: `plan/plan-NN-<slug>.md`, escrita pelo **agente revisor** e
executada pelo **agente executor**. Ela contém descrição, escopo, referências, instruções, o **prompt de
execução** e o **destino da síntese**.

Plans são **versionadas e preservadas**. Elas não são rascunho: são o histórico de por que o repositório é
como é, e o registro de cada veredito de revisão. **Nenhuma plan é apagada, nunca.**

Para a fila não virar depósito, o volume é separado por pasta — e a pasta espelha o estado:

| Pasta | Status | O que é |
|---|---|---|
| `plan/` | 🔴 🟡 🟠 🔵 ⛔ | **Fila ativa** — o que está em jogo agora. Curta e legível |
| `plan/executadas/` | 🟢 ⚪ | **Histórico** — aprovadas (aguardando síntese) e já sintetizadas. Cresce para sempre |

O arquivo muda de pasta **uma única vez**, no momento da aprovação, movido pelo revisor com `git mv` — na mesma
ação em que a linha migra da §1 para a §4 do `00-indice`. A síntese (`spec-atualizar`) só muda o status para
`⚪`; o arquivo fica onde está.

> Numeração é **monotônica e definitiva**: `plan-07` é `plan-07` para sempre, e o próximo número livre considera
> as duas pastas. A ordem de execução se muda na coluna `#` do `00-indice`, nunca renomeando o arquivo.

---

## 3. O ciclo de execução

```
1. usuário traz uma demanda
2. REVISOR escreve  plan/plan-NN-<slug>.md  (status 🔴)  +  linha no 00-indice
3. usuário abre conversa nova: "leia 00-prompt-executor e execute plan-NN"
4. EXECUTOR executa → alterações no worktree → resumo escrito na própria plan (🟠)
5. REVISOR verifica DIRETAMENTE o worktree (não confia no resumo)
     ├─ reprovado → 🔵 + prompt de correção → volta ao 4
     └─ aprovado  → 🟢 + git mv para plan/executadas/ + linha migra da §1 para a §4
                    do 00-indice
6. USUÁRIO commita
7. periodicamente: usuário dispara a skill `spec-atualizar` → as 🟢 de plan/executadas/
   são sintetizadas em specs/ · arquitetura/ · adr/ e viram ⚪ Sintetizada (sem sair da pasta)
```

| Papel | Prompt de entrada | Pode escrever | Nunca faz |
|---|---|---|---|
| **Revisor** | `00-prompt-revisor.md` | specs, prompts, mensagens | tocar código · commitar |
| **Executor** | `00-prompt-executor.md` | código + resumo na própria plan | criar/alterar outras specs · commitar |
| **Usuário** | — | qualquer coisa | — (é quem commita e dispara `spec-atualizar`) |

**Nenhum agente commita. Nenhum agente adiciona co-autoria.**

---

## 4. Onde crio o quê?

| Quero… | Vá para |
|---|---|
| Pedir uma alteração no sistema | uma **plan** nova (revisor escreve) — molde `_templates/template-plan.md` |
| Registrar regra de negócio consolidada | `specs/NN-<nome>.md` — via `spec-atualizar`, não à mão |
| Registrar design/stack consolidados | `arquitetura/NN-<nome>.md` — idem |
| Registrar uma decisão com trade-off | `adr/NNN-<nome>.md` — idem |
| Consultar por que algo foi feito assim | `plan/executadas/` — veredito e escopo de cada execução |
| Contextualizar um agente novo | ele lê `00-contexto.md` — você não explica nada no chat |

> As specs fixas são atualizadas **pela síntese das plans** (skill `spec-atualizar`, com HITL), não por edição
> avulsa. Isso é o que mantém spec e código convergentes.

---

## 5. Convenções

- **Nomes** em `kebab-case`, com prefixo numérico: `01-login.md`, `plan-03-ajustar-cache.md`.
- **Frontmatter YAML obrigatório** em toda spec, com os campos do molde correspondente. Não invente campos.
  As `00-*` usam `tipo: "processo"`.
- **Referencie, nunca duplique.** Conteúdo copiado desatualiza e passa a mentir. Aponte para a fonte.
- **Ponteiro órfão é defeito**: toda spec citada existe; todo comando citado roda.
- **Datas sempre absolutas** (`2026-07-31`), nunca "semana passada".
- **Skills e commands não vivem aqui** — vêm da base Sarak instalada no agente. O catálogo é o `00-knowledge.md`.
