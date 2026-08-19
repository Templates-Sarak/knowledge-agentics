---
name: code-licenca
description: Apresenta o catálogo de licenças no HITL, escreve/atualiza o LICENSE e aplica o SPDX id correto (package.json, README). Use ao escolher/trocar a licença do projeto ou preparar o LICENSE para publicação. NÃO acione proativamente.
---

# Skill: Licenciamento

Dona única de **licenciamento**. Separada de `code-assinatura` (autoria/assinatura) e
`code-documentacao` (README/CODEOWNERS/CHANGELOG) — cada pilar da antiga `code-entrega` tem um dono
só, e esta é a que escolhe e aplica a licença.

## Quando usar

- Sob demanda, ao escolher/trocar a licença de um projeto ou prepará-lo para publicação.
- Mutativa (escreve `LICENSE` e edita metadados) → HITL obrigatório antes de aplicar.

## Workflow

1. **Auditar o estado atual** — verifique se já existe `LICENSE` e qual `license` está em `package.json`.
2. **HITL — escolha** — apresente a **tabela-resumo** de `references/licencas.md` (permissivas,
   copyleft, proprietária), recomende conforme o caso (lib aberta → MIT/Apache-2.0; SaaS que quer
   copyleft → AGPL-3.0; código privado → Proprietária). **Aguarde a escolha.**
3. **Aplicar** — curtas (MIT, BSD-3-Clause, Unlicense, Proprietary) de `assets/licenses/<id>.txt`
   preenchendo `[ANO]`/`[NOME]`; longas (Apache-2.0, MPL-2.0, GPL-3.0, AGPL-3.0) verbatim da fonte
   oficial (URL em `references/licencas.md`) — nunca parafraseadas.
4. **SPDX + copyright** — `package.json` com o **SPDX id** correto (`"license": "MIT"`, `"UNLICENSED"`
   etc.); posicione o copyright onde a licença manda — corpo do `LICENSE` (MIT/BSD-3-Clause/
   Proprietária) ou headers/apêndice de cada arquivo (Apache-2.0/GPL-3.0/AGPL-3.0/MPL-2.0), conforme
   `references/licencas.md`.
5. **Reportar** — licença aplicada, SPDX id, onde o copyright ficou.

## Regras e limites

- **NUNCA** aplique licença sem o HITL do passo 2.
- **NUNCA** deixe o projeto sem `LICENSE` claro ao final — proprietária também conta como decisão
  explícita, não ausência.
- **NÃO** invente SPDX id fora do catálogo de `references/licencas.md`.
- **NÃO** escreva o `README` inteiro nem `CODEOWNERS`/`CHANGELOG` — isso é da `code-documentacao`;
  aqui só o `LICENSE`, o SPDX id e o texto que preenche a seção "Licença e Autoria" que ela aponta.
- **NÃO** decida autoria/assinatura — isso é da `code-assinatura`.

## Checklist "pronta"

- [ ] Tabela-resumo apresentada e a escolha do usuário registrada (HITL)?
- [ ] `LICENSE` criado/atualizado com o texto certo (curta preenchida, ou longa verbatim)?
- [ ] SPDX id correto em `package.json` (e `UNLICENSED` + `private: true` se proprietária)?
- [ ] Copyright posicionado no lugar certo para aquela licença (corpo vs. header)?
- [ ] Relatado o que foi aplicado?

## Referências (Camada 3 — leia sob demanda)

- `references/licencas.md` — catálogo das 8 licenças: explicação, SPDX id, URL canônica, onde vai
  o copyright.
- `assets/licenses/` — templates das licenças curtas (MIT, BSD-3-Clause, Unlicense, Proprietary).
