---
name: spec-atualizar
description: Lê arquivos de implementação da pasta specs/plan/ e atualiza ou cria as especificações definitivas correspondentes com segurança (via blocos e HITL). Use APENAS quando o usuário solicitar explicitamente para transferir a implementação consolidada. NÃO acione proativamente.
---

# Skill: Atualizar Especificações a partir do Plan

Skill responsável por atuar como ponte segura entre a fase de implementação rascunhada (pasta `specs/plan/`) e as especificações definitivas (pasta `specs/`).

> **Dependência:** Esta skill aplica as regras de documentação e padronização contidas em `spec-write`. Consulte-a se houver dúvidas sobre o formato final das specs.

## Quando usar
- O usuário acabou de finalizar uma implementação ou SDD e guardou os artefatos na pasta `specs/plan/`.
- O usuário pediu para atualizar as specs oficiais com base no que foi feito em `plan`.
- Acionada **sob demanda** (o usuário pede). Não dispara sozinha.

## Workflow

Trate o agrupamento de mudanças de forma cautelosa. Se houverem muitos arquivos, divida o processo em **blocos**.

1. **Ler a pasta de rascunhos**
   - Utilize as ferramentas de leitura para examinar todos os arquivos em `specs/plan/`.
   - Leia as especificações definitivas correspondentes em `specs/` (ou crie um mapa do que existe lá).

2. **Mapeamento e Particionamento**
   - Para cada arquivo em `plan/`, decida se ele *altera* uma spec existente ou se precisa virar uma *nova* spec.
   - Se o volume for grande (ex: mais de 2 arquivos complexos ou modificações profundas), divida as alterações em **blocos lógicos**.

3. **Confirmação HITL (Human-In-The-Loop) - OBRIGATÓRIA**
   - Para cada bloco de alterações, apresente ao usuário um plano claro:
     - **Quais specs serão afetadas:** (Ex: `specs/02-auth.md` será atualizada, `specs/05-nova-feature.md` será criada).
     - **Resumo das mudanças:** O que está sendo levado de `plan` para o formato definitivo.
   - Faça a pergunta de confirmação: `⚠️ Confirma a atualização deste bloco?`.
   - **Pare e aguarde** a aprovação do usuário.

4. **Aplicação das Mudanças**
   - Somente após a resposta positiva, grave/sobrescreva os arquivos na pasta `specs/` oficial mantendo os padrões exigidos.

5. **Finalização**
   - Após processar todos os blocos com sucesso, avise o usuário da conclusão e pergunte se ele deseja que os arquivos da pasta `specs/plan/` sejam apagados (limpeza).

## Regras e limites
- **NÃO** sobrescreva especificações definitivas sem antes passar pelo passo HITL explícito exibindo o resumo das mudanças. É necessário que o usuário aprove cada bloco.
- **NÃO** leve para as specs definitivas arquivos de código-fonte, apenas especificações documentais em Markdown.
- **NUNCA** apague os arquivos da pasta `plan` sem o consentimento do usuário.
- **NÃO** acione essa skill proativamente, apenas quando for explicitamente requisitado.

## Checklist "pronta"
Ao utilizar esta skill, garanta que:
- [ ] O diretório `plan/` foi lido completamente.
- [ ] O HITL foi disparado por bloco de mudança.
- [ ] O conteúdo migrado respeita a formatação oficial de uma spec.

## Referências
- `references/workflow.md` — Workflow detalhado e exemplos de particionamento e de como conduzir a entrevista HITL.
