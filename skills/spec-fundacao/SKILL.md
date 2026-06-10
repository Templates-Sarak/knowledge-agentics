---
name: "spec-fundacao"
description: "Wizard oficial (Entrevista HITL) para definir o alicerce arquitetural e tecnológico de um repositório recém-iniciado, gerando os ADRs padronizados."
---

# Skill: Fundação Arquitetural (Wizard)

Esta skill opera como um entrevistador rigoroso (Wizard) focado em extrair as definições tecnológicas de base de um sistema e materializá-las através dos templates arquiteturais do ecossistema Sarak.

## O Gatilho
Deve ser engatilhada automaticamente ao final da skill `meta-iniciar-repositorio` ou invocada manualmente quando o usuário quiser "definir a stack", "registrar as tecnologias" ou "criar as ADRs de fundação".

## Workflow

1. **Entrevista Estruturada (HITL Obrigatório)**
   - **Ferramenta:** Diálogo (Chat)
   - **Ação:** PARE a execução e faça exatamente as 5 perguntas abaixo ao usuário, num único bloco amigável. Não gere nenhum documento antes que ele responda:
     1. **Stack:** Qual o ecossistema principal (Linguagens/Frameworks de Front-end e Back-end)?
     2. **Persistência:** Qual a estratégia de Banco de Dados e Cache?
     3. **Segurança:** Qual o mecanismo de Autenticação e Autorização?
     4. **Infraestrutura:** Qual a Nuvem e a estratégia de Deploy?
     5. **Integrações:** Existem integrações críticas iniciais (ex: gateways, APIs externas)?

2. **Consulta do Molde**
   - **Ação:** Consulte a Tabela de Roteamento Global para ler a estrutura do `template-adr.md` e do `template-arquitetura.md` (localizados em `_estrutura_base/_templates/`).

3. **Geração das Decisões (ADRs)**
   - **Ferramenta:** `Write`
   - **Ação:** Baseado nas respostas, redija as decisões individuais na pasta `specs/adr/` do repositório-alvo. Crie os arquivos em `kebab-case`.
   - **Formato Sugerido:** 
     - `specs/adr/001-stack-principal.md`
     - `specs/adr/002-banco-de-dados.md`
     - `specs/adr/003-autenticacao.md`
     - `specs/adr/004-infra-deploy.md`
   - *Nota:* Certifique-se de preencher corretamente o cabeçalho YAML e a seção de Contexto e Decisão de cada ADR.

4. **Amarração do Documento Central**
   - **Ferramenta:** `Write`
   - **Ação:** Crie o arquivo de mapa `specs/arquitetura/00-fundacao-tecnologica.md` (utilizando o `template-arquitetura.md`), e faça um resumo linkando via WikiLinks (`[[001-stack-principal]]`) os ADRs recém-gerados.

5. **Entrega**
   - Informe ao usuário que a fundação arquitetural foi documentada com sucesso.

## Regras de Ouro
- **NÃO** tente adivinhar as tecnologias. O HITL (Perguntas) é inegociável.
- **Formatação Rigorosa:** Todos os arquivos markdown gerados DEVEM possuir o bloco YAML inicial (`---`) e as propriedades exigidas pelos templates.
