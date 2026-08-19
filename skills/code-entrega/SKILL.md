---
name: code-entrega
description: Orquestra a pré-entrega de um projeto — chama code-assinatura, code-licenca e code-documentacao na ordem certa, consolida o HITL e gera o log de entrega. Use APENAS na pré-entrega, antes de publicar (deploy-*). NÃO acione proativamente.
---

# Skill: Entrega (Orquestrador de Pré-entrega)

**Orquestrador fino** — não tem lógica própria de autoria, licença ou documentação; cada pilar tem
dono único (`code-assinatura`, `code-licenca`, `code-documentacao`) e esta skill só chama os três na
ordem certa e consolida o resultado. Roda antes de um `deploy-*` (ex.: `deploy-vercel`). É
**mutativa** por tabela (as três skills que chama são).

## Quando usar

- Sob demanda, ao preparar um projeto para publicação (GitHub, deploy) ou ao fim de um ciclo com
  várias IAs/devs.
- Quando o usuário pede para "deixar o projeto pronto para entrega" sem especificar qual dos três pilares.
- Se o pedido já é específico ("limpar assinaturas", "trocar a licença", "gerar o README"), acione
  a skill dona direto — não passe por aqui.

## Workflow

Trate **um projeto por vez**, na ordem fixa abaixo — cada passo é a skill dona, com o HITL dela.

1. **`code-assinatura`** — varre, tria e limpa assinaturas não autorizadas; acerta metadados de
   autoria. Aguarde o HITL dela.
2. **`code-licenca`** — apresenta o catálogo, aplica a licença escolhida, ajusta o SPDX id. Aguarde
   o HITL dela.
3. **`code-documentacao`** — gera/atualiza README, CONTRIBUTING, CHANGELOG, CODEOWNERS. Aguarde o
   HITL dela.
4. **Consolidar** — reúna o resultado dos três num único relato (o que foi auditado, decidido e
   alterado em cada pilar).
5. **Reportar** — gere o log de `assets/entrega_update.md` com o consolidado, e comunique ao usuário
   que o projeto está pronto para publicar.

## Regras e limites

- **NUNCA** pule uma das três skills nem mude a ordem — assinatura → licença → documentação (o
  README de `code-documentacao` tem uma seção "Licença e Autoria" que depende do que as duas
  primeiras já resolveram).
- **NÃO** duplique a lógica de nenhuma delas aqui — mudança de comportamento de autoria/licença/doc
  vai na skill dona, nunca nesta.
- **NÃO** publique — isso é dos `deploy-*`; esta skill termina quando o projeto está pronto.
- **NÃO** saia do escopo: faxina de lixo é da `code-limpeza-projeto`.

## Checklist "pronta"

- [ ] `code-assinatura` concluída, HITL dela feito?
- [ ] `code-licenca` concluída, HITL dela feito?
- [ ] `code-documentacao` concluída, HITL dela feito?
- [ ] Log de `entrega_update.md` gerado, consolidando os três pilares?

## Referências (Camada 3 — leia sob demanda)

- `assets/entrega_update.md` — template do log de pré-entrega (autoria/licença/documentação).
