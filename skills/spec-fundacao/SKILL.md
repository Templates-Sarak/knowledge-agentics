---
name: spec-fundacao
description: Entrevista HITL que define o alicerce arquitetural e tecnológico de um repositório recém-iniciado e grava as decisões como ADRs padronizados. Use logo após iniciar o repositório, ou quando pedirem para definir stack, banco, idioma ou padrões do projeto. NÃO acione proativamente.
---

# Skill: Fundação Arquitetural (Wizard)

Entrevistador rigoroso (wizard) focado em extrair as definições tecnológicas de base de um sistema
e materializá-las através dos templates arquiteturais do ecossistema Sarak.

## Quando usar

- Ao final da skill `meta-iniciar-repositorio` (encadeamento natural do fluxo de início de repositório).
- Sob demanda, quando o usuário quiser "definir a stack", "registrar as tecnologias" ou "criar as ADRs de fundação".

## Workflow

1. **Entrevista estruturada (HITL obrigatório)**
   - **Ferramenta:** Diálogo (chat).
   - **Ação:** PARE a execução e faça exatamente as 5 perguntas abaixo, num único bloco amigável.
     Não gere nenhum documento antes que o usuário responda:
     1. **Stack:** qual o ecossistema principal (linguagens/frameworks de front-end e back-end)?
     2. **Persistência:** qual a estratégia de banco de dados e cache?
     3. **Segurança:** qual o mecanismo de autenticação e autorização?
     4. **Infraestrutura:** qual a nuvem e a estratégia de deploy?
     5. **Integrações:** existem integrações críticas iniciais (ex.: gateways, APIs externas)?
2. **Consultar o molde**
   - **Ação:** Consulte a Tabela de Roteamento Global para ler a estrutura do `template-adr.md` e
     do `template-arquitetura.md` (em `_estrutura_base/_templates/`).
3. **Gerar as decisões (ADRs)**
   - **Ferramenta:** `Write`.
   - **Ação:** Com base nas respostas, redija as decisões individuais em `specs/adr/` do
     repositório-alvo, arquivos em `kebab-case` — formato sugerido: `001-stack-principal.md`,
     `002-banco-de-dados.md`, `003-autenticacao.md`, `004-infra-deploy.md`. Preencha corretamente
     o cabeçalho YAML e as seções de Contexto e Decisão de cada ADR.
4. **Amarrar o documento central**
   - **Ferramenta:** `Write`.
   - **Ação:** Crie `specs/arquitetura/00-fundacao-tecnologica.md` (a partir do
     `template-arquitetura.md`) com um resumo linkando via WikiLinks (`[[001-stack-principal]]`)
     os ADRs recém-gerados.
5. **Entrega**
   - Informe ao usuário que a fundação arquitetural foi documentada com sucesso.

## Regras e limites

- **NÃO** adivinhe as tecnologias — o HITL (as 5 perguntas do passo 1) é inegociável; nunca pule
  para o passo 3 sem as respostas.
- **NÃO** grave ADR ou documento central sem o bloco YAML inicial (`---`) e as propriedades que o
  respectivo template exige.

## Checklist "pronta"

- [ ] As 5 perguntas foram feitas e respondidas antes de qualquer arquivo ser gerado?
- [ ] `template-adr.md` e `template-arquitetura.md` foram consultados antes de escrever?
- [ ] Um ADR por decisão, em `specs/adr/`, `kebab-case`, com YAML + Contexto + Decisão preenchidos?
- [ ] `specs/arquitetura/00-fundacao-tecnologica.md` criado, linkando os ADRs via WikiLinks?
- [ ] Usuário informado da conclusão?
