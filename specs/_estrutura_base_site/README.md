# 🧭 Como usar o diretório de Specs (Site)

Este diretório (`specs/`) é o "cérebro" do site. É aqui que se define **o que** cada página faz, **como** o
site é construído e **por qual caminho** qualquer alteração passa.

O modelo é **SDD (Spec-Driven Development)**: **toda e qualquer alteração nasce de uma spec**. Nada é alterado
"direto no código" — nem uma cor, nem uma linha de copy.

> Esta é a base de **site institucional/marketing**. Para aplicação/produto, use `_estrutura_base`. O ciclo, os
> papéis e as specs de processo são **idênticos** nas duas; o que muda são as specs fixas de conteúdo.

---

## 1. Os dois grupos de arquivos

### 1.1 Specs de processo — `00-*.md` (a entrada de qualquer agente)

| Arquivo | Papel | Natureza |
|---|---|---|
| `00-contexto.md` | Que site é este, regras inegociáveis, mapa de roteamento | **Por projeto** — molde com instruções; §4/§5/§6 já vêm preenchidas |
| `00-indice.md` | Fila de execução das plans: ordem, dependências, status, destino | **Por projeto** — mantido pelo revisor |
| `00-knowledge.md` | Roteador de capacidades (skills/commands/agents/hooks/MCP) | **Universal** — idêntico ao de `_estrutura_base` |
| `00-prompt-revisor.md` | Prompt que forma o agente revisor numa conversa nova | **Universal** |
| `00-prompt-executor.md` | Prompt que forma o agente executor (a cada execução de plan) | **Universal** |

### 1.2 Specs de conteúdo (a verdade do site)

| Pasta | Pergunta | Conteúdo | Natureza |
|---|---|---|---|
| `arquitetura/` | O **COMO** | Stack, identidade visual, tom de voz, SEO/NAP, a11y/performance, estrutura de código (`01`–`06`) | Documento vivo |
| `specs/` | O **QUÊ** | Layout global, Home, páginas internas, formulários, páginas legais (`06`–`10`) | Documento vivo |
| `adr/` | O **POR QUÊ** | Decisões com trade-off (`001-...`) | **Imutável** — decisão nova = ADR novo |
| `plan/` | O **COMO CHEGAR LÁ** | **Todas** as plans (`plan-NN-<slug>.md`), do nascimento ao expurgo | Fila de execução — o `status` diz em que pé cada uma está |

Moldes em `_templates/`. Inventário completo das specs fixas em [`INDEX.md`](INDEX.md).

**Regra do SDD:** `arquitetura/`, `specs/` e `adr/` devem refletir a **realidade exata** do site — um agente
que as lê fica corretamente contextualizado sem abrir uma linha de código. Spec divergente do site é defeito
de primeira ordem.

---

## 2. Onde entra cada tipo de definição de site

Erro mais comum aqui é escrever a coisa certa no arquivo errado:

| Definição | Vai para |
|---|---|
| Cor, fonte, espaçamento, token | `arquitetura/02-identidade-visual.md` — **nunca** hardcoded no componente |
| Palavra visível ao usuário, tom, promessa | `arquitetura/03-tom-de-voz-e-copy.md` |
| CNPJ, endereço, telefone, keywords, JSON-LD | `arquitetura/04-dados-institucionais-seo.md` — fonte única do NAP |
| Nível WCAG, orçamento de Core Web Vitals | `arquitetura/05-acessibilidade-e-performance.md` |
| Onde o arquivo mora, como componentiza, i18n | `arquitetura/06-estrutura-de-codigo.md` |
| Comportamento de header/footer/menu | `specs/06-layout-global-e-nav.md` |
| Quais seções a Home tem e em que ordem | `specs/07-pagina-home.md` |
| Estrutura de página interna, hub & spoke | `specs/08-paginas-internas-e-hub.md` |
| Campos, validação, destino do lead | `specs/09-formularios-e-contato.md` |
| Consentimento, cookies, políticas | `specs/10-paginas-legais-e-cookies.md` |

---

## 3. Os planos (`plan/`) — **sim, entram no Git**

Uma **plan** é a unidade de trabalho: `plan/plan-NN-<slug>.md`, escrita pelo **agente revisor** e executada
pelo **agente executor**. Contém descrição, escopo, referências, instruções e o **destino da síntese**. O
prompt de execução **não** vive nela — é entregue na conversa, como ponteiro (`00-prompt-revisor` §5.3).

Enquanto está ativa ou aguardando síntese, a plan é **versionada e preservada** — é o histórico de por que o
site é como é, com cada veredito de revisão. **Nenhuma plan é apagada antes de sintetizada, e nenhuma é
apagada sem que sua verdade já esteja na spec fixa correspondente.**

**Nenhum arquivo se move durante o ciclo.** Toda plan vive em `plan/`, e o que responde "em que pé está isto?"
é o `status` do frontmatter — espelhado nas duas tabelas do `00-indice`:

| Status | Onde aparece no índice | O que é |
|---|---|---|
| 🔴 🟡 🟠 🔵 ⛔ | §1 Fila de execução | O que está em jogo agora e exige ação |
| 🟢 Aprovada | §4 Encerradas | Verificada; a síntese aguarda a autorização do usuário |
| ⚪ Sintetizada | §4 Encerradas | Verdade já transportada; o arquivo é resíduo aguardando expurgo |

A síntese é feita pelo **revisor**, na própria conversa da aprovação e sob autorização do usuário. O
**expurgo** é outra coisa e tem outro dono — a skill `spec-atualizar`, disparada manualmente, que reverifica
cada `⚪` antes de remover o arquivo e a linha da §4.

> Numeração é **monotônica e definitiva**: `plan-07` é `plan-07` para sempre, mesmo depois de expurgada. O
> próximo número livre vem do campo `proximo_numero_plan` no `00-indice`, nunca de escanear a pasta. A ordem
> de execução se muda na coluna `#` do `00-indice`, nunca renomeando o arquivo.
>
> ⚠️ **Não confunda** `plan/` com as specs `06`–`10` de `specs/`: aquelas são a verdade das páginas, estas são
> as tarefas que chegam lá.

---

## 4. O ciclo de execução

```
1. usuário traz uma demanda (página nova, ajuste de copy, otimização, correção)
2. REVISOR escreve  plan/plan-NN-<slug>.md  (status 🔴)  +  linha no 00-indice
3. usuário abre conversa nova: "leia 00-prompt-executor e execute plan-NN"
4. EXECUTOR executa → alterações no worktree → resumo escrito na própria plan (🟠)
5. REVISOR verifica DIRETAMENTE o worktree (não confia no resumo)
     ├─ reprovado → 🔵 + prompt de correção → volta ao 4
     └─ aprovado  → 🟢 + linha migra da §1 para a §4 do 00-indice
                    + REVISOR propõe a síntese e espera a autorização do usuário
6. USUÁRIO autoriza → REVISOR sintetiza em arquitetura/ · specs/ · adr/, acrescenta o
   bloco `## Síntese` à plan, marca ⚪ e completa a linha da §4
7. USUÁRIO commita — código, spec fixa e plan ⚪ na mesma unidade de verdade
8. periodicamente: usuário dispara a skill `spec-atualizar` → cada ⚪ é REVERIFICADA e
   então removida (arquivo + linha do 00-indice)
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

## 5. Como este diretório nasce num projeto novo

1. A skill **`spec-site-fundacao`** entrevista o usuário (HITL), copia esta estrutura **inteira** para `specs/`
   do projeto, preenche as specs fixas e semeia as §1 e §3 do `00-contexto.md`.
2. A skill **`site-criacao`** aprofunda o detalhamento de `arquitetura/` e `specs/` com o formulário granular.
3. A **primeira plan** do repositório **completa** o `00-contexto.md` (§2 regras específicas, §7 fronteiras,
   §8 estado) — sem ele preenchido, nenhum agente se contextualiza por inteiro.
4. Daí em diante, tudo passa pelo ciclo da §4. A pasta `plan/` nasce vazia e só o revisor escreve nela.

---

## 6. Convenções

- **Nomes** em `kebab-case`, com prefixo numérico: `07-pagina-home.md`, `plan-03-otimizar-lcp.md`.
- **Frontmatter YAML obrigatório** em toda spec, com os campos do molde correspondente. Não invente campos.
  As `00-*` usam `tipo: "processo"`; as specs fixas ainda não preenchidas usam `tipo: "template"` e
  `status: "🟡 Pendente"` até serem instanciadas no projeto.
- **Referencie, nunca duplique.** Conteúdo copiado desatualiza e passa a mentir. Aponte para a fonte.
- **Ponteiro órfão é defeito**: toda spec citada existe; todo comando citado roda.
- **Datas sempre absolutas** (`2026-08-01`), nunca "semana passada".
- **Skills e commands não vivem aqui** — vêm da base Sarak instalada no agente. Catálogo em `00-knowledge.md`.
