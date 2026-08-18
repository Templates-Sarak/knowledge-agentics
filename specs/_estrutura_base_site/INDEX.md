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
| `arquitetura/01-stack-tecnologica.md` | Framework, renderização, CSS, hospedagem, build |
| `arquitetura/02-identidade-visual.md` | Paleta, tipografia, tokens, design system |
| `arquitetura/03-tom-de-voz-e-copy.md` | Persona, mensagem, tom — **toda** palavra visível |
| `arquitetura/04-dados-institucionais-seo.md` | NAP, Schema.org, keywords, metadados |
| `arquitetura/05-acessibilidade-e-performance.md` | Nível WCAG e orçamento de Core Web Vitals |
| `arquitetura/06-estrutura-de-codigo.md` | Pastas, componentização, separação UI × conteúdo, i18n |
| `specs/06-layout-global-e-nav.md` | Header, footer, menu mobile, navegação |
| `specs/07-pagina-home.md` | Blocagem e ordem das seções da Home |
| `specs/08-paginas-internas-e-hub.md` | Páginas secundárias e padrão hub & spoke |
| `specs/09-formularios-e-contato.md` | Campos, validação, conversão, leads |
| `specs/10-paginas-legais-e-cookies.md` | LGPD, políticas, banner de consentimento |

## Estrutura do Vault

- 📄 **`00-*.md`**: specs de processo — contexto, roteamento de capacidades, índice de execução e os prompts
  dos dois papéis. Entrada de qualquer agente.
- 📁 **`arquitetura/`**: design vivo e regras globais do site (O COMO).
- 📁 **`specs/`**: specs vivas de páginas e componentes (O QUÊ).
- 📁 **`adr/`**: decisões imutáveis (O POR QUÊ). Decisão nova = ADR novo.
- 📁 **`plan/`**: **todas** as plans (`plan-NN-<slug>.md`), do nascimento ao expurgo — toda alteração do site
  passa por elas. Não há subpasta: o `status` do frontmatter é que diz se a plan está na fila (🔴 🟡 🟠 🔵 ⛔),
  aprovada aguardando síntese (🟢) ou já sintetizada aguardando expurgo (⚪). A skill `spec-atualizar`,
  disparada manualmente, reverifica as ⚪ e as remove; depois disso o rastro fica no histórico do Git.
- 📁 **`_templates/`**: moldes (`template-spec`, `template-arquitetura`, `template-adr`, `template-plan`).

## O ciclo em uma linha

`revisor escreve plan` → `executor executa (worktree, sem commit)` → `revisor verifica e aprova` → `usuário
autoriza` → `revisor sintetiza nas specs fixas (plan vira ⚪)` → `usuário commita` → `spec-atualizar
reverifica e expurga a plan`

Detalhe em [`README.md`](README.md).
