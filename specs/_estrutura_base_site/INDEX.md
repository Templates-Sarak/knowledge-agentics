# 🧭 Mapa de Especificações do Site (Bússola da IA)

> **Atenção IAs:** Este diretório é a fonte da verdade do site. **Comece por `00-contexto.md`** — nenhuma
> tarefa começa antes dele.

## Ordem de leitura

| # | Arquivo | O que é |
|---|---|---|
| 1 | **`00-contexto.md`** | Que site é este, regras inegociáveis e o mapa "que spec eu leio para esta tarefa?" |
| 2 | **`00-knowledge.md`** | Roteador de capacidades: situação → skill/command/agent/hook. Universal. |
| 3 | **`00-indice.md`** | Fila de execução das plans, com dependências e status. |
| 4 | **`00-prompt-revisor.md`** / **`00-prompt-executor.md`** | O prompt do seu papel. Leia o seu, conheça o outro. |
| 5 | `arquitetura/` → `specs/` → `adr/` | O detalhe: o COMO, o QUÊ e o POR QUÊ. |

## As specs fixas do site

| Arquivo | Dono de |
|---|---|
| `arquitetura/02.01-stack-tecnologica.md` | Framework, renderização, CSS, hospedagem, build |
| `arquitetura/01.01-identidade-visual.md` | Paleta, tipografia, tokens, design system |
| `arquitetura/01.02-tom-de-voz-e-copy.md` | Persona, mensagem, tom — **toda** palavra visível |
| `arquitetura/01.03-dados-institucionais-seo.md` | NAP, Schema.org, keywords, metadados |
| `arquitetura/02.03-acessibilidade-e-performance.md` | Nível WCAG e orçamento de Core Web Vitals |
| `arquitetura/02.02-estrutura-de-codigo.md` | Pastas, componentização, separação UI × conteúdo, i18n |
| `specs/03.01-layout-global-e-nav.md` | Header, footer, menu mobile, navegação |
| `specs/03.02-pagina-home.md` | Blocagem e ordem das seções da Home |
| `specs/03.03-paginas-internas-e-hub.md` | Páginas secundárias e padrão hub & spoke |
| `specs/03.04-formularios-e-contato.md` | Campos, validação, conversão, leads |
| `specs/03.05-paginas-legais-e-cookies.md` | LGPD, políticas, banner de consentimento |

## Estrutura do Vault

- 📄 **`00-*.md`**: specs de processo — contexto, roteamento de capacidades, índice de execução e os prompts
  dos dois papéis. Entrada de qualquer agente.
- 📁 **`arquitetura/`**: design vivo e regras globais do site (O COMO).
- 📁 **`specs/`**: specs vivas de páginas e componentes (O QUÊ).
- 📁 **`adr/`**: decisões imutáveis (O POR QUÊ). Decisão nova = ADR novo.
- 📁 **`plan/`**: as plans **abertas** (`plan-FF.NN-<slug>.md`). Não há subpasta: o `status` do frontmatter diz
  se a plan está na fila (🔴 🟡 🟠 🔵 ⛔) ou aprovada aguardando a autorização de síntese (🟢). **A plan é
  temporária** — no ato da síntese o revisor a remove junto com a linha do índice, e o rastro passa a viver
  no histórico do Git.
- 📄 **`00-backlog.md`**: achados registrados e **não agendados** — sem status, sem fila, ninguém executa.
- 📁 **`panorama/`**: o planejamento — hoje, o **catálogo de famílias** (`00-planejamento.md` §1), fonte
  única do `FF` que numera specs (`FF.NN-<slug>.md`) e plans (`plan-FF.NN-<slug>.md`).
- 📁 **`_templates/`**: moldes (`template-spec`, `template-arquitetura`, `template-adr`, `template-plan`).

## O ciclo em uma linha

**Com plan** (a demanda deixa verdade): `revisor escreve plan` → `executor executa (worktree, sem commit)` →
`revisor verifica e aprova` → `usuário autoriza` → `revisor sintetiza nas specs fixas **e remove a plan**` →
`usuário commita`

**Via direta** (não deixa): `revisor emite o prompt` → `executor executa (worktree, sem commit)` →
`revisor verifica e aprova` → `usuário commita`. Nenhum arquivo nasce; sem síntese.

Detalhe em [`README.md`](README.md).
