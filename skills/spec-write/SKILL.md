---
name: "spec-write"
description: "Padrão oficial para a IA traduzir ideias e requisitos do usuário em especificações de projeto perfeitamente padronizadas e formatadas."
---

# spec-write

Esta skill é o "funil" que obriga a IA a escrever todas as especificações e decisões arquiteturais de projeto segundo os padrões predefinidos do ecossistema Sarak.

## O Gatilho

Sempre que o usuário pedir para **"escrever uma spec"**, **"rascunhar uma feature"**, **"documentar uma funcionalidade"** ou pedir para transformar uma ideia em documento (ou se usar `/spec-write`), a IA deve **obrigatoriamente** seguir este workflow.

## Workflow

1. **Entenda a Ideia**: Leia atentamente o requisito ou ideia que o usuário deseja transformar em Spec. Identifique se é um requisito de negócio (feature), um documento arquitetural ou uma decisão (ADR).
2. **Consulte o Molde**: Acesse a Tabela de Roteamento Global e descubra o caminho absoluto da pasta global de templates (que estruturamos em `knowledge-agentics/specs/_estrutura_base/_templates/`). Leia o arquivo correspondente:
   - Se for uma funcionalidade, leia o `template-spec.md`.
   - Se for uma decisão técnica ou arquitetura, leia o `template-adr.md` ou `template-arquitetura.md`.
3. **Produza a Spec**: Formate a ideia inteira estritamente dentro do formato exigido pelo molde lido. 
   - Você **DEVE** incluir o bloco `YAML Frontmatter` (delimitado por `---`) no topo do documento.
   - Preencha corretamente campos como `status`, `dominio` e `prioridade`.
   - Quebre as regras em seções numeradas claras.
   - Escreva Critérios de Aceite no formato de checklist markdown (`- [ ]`).
4. **Desenho de Testes (TDD/BDD)**: Preencha obrigatoriamente a seção `# 4. Plano de Testes` do template da spec.
   - **Unitários:** Avalie as regras de negócio isoladas e defina os cenários essenciais (para a skill `test-unitario`).
   - **Contrato/API:** Se a spec expõe ou consome endpoints de rede, mapeie a garantia do formato dos dados (para a skill `api-contrato`). Se não houver I/O de rede, marque *N/A*.
   - **E2E:** Avalie se a funcionalidade possui jornada de usuário na interface. Se sim, defina os fluxos críticos (para a skill `test-e2e`). Se for uma rotina invisível de backend, marque *N/A*.
5. **Análise de Impacto (HITL)**: Avalie silenciosamente se a funcionalidade solicitada introduz uma nova tecnologia, dependência crítica ou mudança de paradigma. Se sim, **PARE** e pergunte ao usuário (Human-in-the-Loop): *'Notei que esta Spec introduz mudanças arquiteturais. Deseja que eu também crie/atualize o documento de Arquitetura e um ADR correspondente?'*. Só gere esses documentos extras se o usuário autorizar.
6. **Salve no Repositório-Alvo**: Crie o arquivo Markdown dentro da pasta correspondente (`specs/`, `arquitetura/` ou `adr/`) do projeto onde você está trabalhando. O nome do arquivo deve ser em `kebab-case` (Ex: `01-autenticacao.md`).

## Regras de Ouro

- **Proibido inventar metadados**: Não crie campos novos no cabeçalho YAML que não existam no `template`.
- **Aja como um Analista de Negócios Sênior**: Se a ideia do usuário estiver muito vaga, faça perguntas críticas no chat para completar os Critérios de Aceite *antes* de gravar o arquivo definitivo no disco.
- **Apenas Definição**: Esta skill não gera código-fonte. O objetivo final dela é entregar o documento vivo (Living Spec) atualizado e limpo. A execução ocorre depois.
