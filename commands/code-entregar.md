---
description: Prepara um projeto para pré-entrega via o fluxo da skill code-entrega — assinatura, licença e documentação na ordem certa, com HITL em cada pilar. Mutativo.
argument-hint: [projeto]
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# /code-entregar — pré-entrega (assinatura → licença → documentação)

Projeto: **$1** (se vazio, o diretório atual `.`).

Dispara o fluxo da skill **`code-entrega`** para deixar o projeto pronto para publicar, nos três
pilares — **autoria**, **licença** e **documentação** — cada um com dono próprio. É **mutativo**
→ HITL obrigatório em cada pilar. A lógica está nas skills; aqui você orquestra.

## Passos (skill `code-entrega`)
1. **`code-assinatura`** — `python skills/code-assinatura/scripts/scan_assinaturas.py --raiz $1`,
   tria contra os autorizados, HITL antes de remover, limpa e acerta metadados de autoria.
2. **`code-licenca`** — apresente a tabela-resumo de `skills/code-licenca/references/licencas.md`,
   HITL da escolha, aplique `LICENSE` + SPDX id.
3. **`code-documentacao`** — `python skills/code-documentacao/scripts/auditar_docs.py --raiz $1`,
   gere/atualize README/CONTRIBUTING/CHANGELOG/CODEOWNERS a partir dos templates.
4. **Consolidar** — reúna o resultado dos três num relato único.
5. **Reportar** — gere `skills/code-entrega/assets/entrega_update.md` preenchido; comunique que o
   projeto está pronto para publicar.

## Limites
- **NUNCA** pule um dos três pilares nem mude a ordem (assinatura → licença → documentação).
- **NUNCA** aplique licença ou remova assinatura sem o HITL do pilar correspondente.
- **NÃO** publique — isso é dos `/deploy-vercel`/`/deploy-docker`; este command termina quando o
  projeto está pronto.
- **NÃO** saia do escopo: faxina de lixo é da `code-limpeza-projeto`.
