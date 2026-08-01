# 🧭 Mapa de Especificações (Bússola da IA)

> **Atenção IAs:** Este diretório é a fonte da verdade do projeto. **Comece por `00-contexto.md`** — nenhuma
> tarefa começa antes dele.

## Ordem de leitura

| # | Arquivo | O que é |
|---|---|---|
| 1 | **`00-contexto.md`** | O que este repositório é, regras inegociáveis e o mapa "que spec eu leio para esta tarefa?" |
| 2 | **`00-knowledge.md`** | Roteador de capacidades: situação → skill/command/agent/hook. Universal. |
| 3 | **`00-indice.md`** | Fila de execução das plans, com dependências e status. |
| 4 | **`00-prompt-revisor.md`** / **`00-prompt-executor.md`** | O prompt do seu papel. Leia o seu, conheça o outro. |
| 5 | `arquitetura/` → `specs/` → `adr/` | O detalhe: o COMO, o QUÊ e o POR QUÊ. |

## Estrutura do Vault

- 📄 **`00-*.md`**: as specs de processo — contexto, roteamento de capacidades, índice de execução e os prompts
  dos dois papéis. São a entrada de qualquer agente.
- 📁 **`arquitetura/`**: design vivo e regras globais (O COMO).
- 📁 **`specs/`**: specs vivas de funcionalidades (O QUÊ).
- 📁 **`adr/`**: decisões imutáveis (O POR QUÊ). Decisão nova = ADR novo.
- 📁 **`plan/`**: as plans de execução (`plan-NN-<slug>.md`) — **versionadas**, é por elas que toda alteração
  do repositório passa. Rastro auditável, não arquivo temporário.
- 📁 **`_templates/`**: moldes (`template-spec`, `template-arquitetura`, `template-adr`, `template-plan`).

## O ciclo em uma linha

`revisor escreve plan` → `executor executa (worktree, sem commit)` → `revisor verifica e aprova` →
`usuário commita` → `spec-atualizar sintetiza nas specs fixas`

Detalhe em [`README.md`](README.md).
