---
name: code-entrega
description: Gate de pré-entrega que deixa um projeto publicável — padroniza autoria, aplica a licença escolhida (catálogo no HITL) e garante a documentação no padrão. Use APENAS na pré-entrega ou quando pedirem para acertar autoria/licença/documentação. NÃO acione proativamente.
---

# Skill: Entrega (Autoria · Licença · Documentação)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita, code-diagnostico, code-adequacao`. Consulte-as antes de iniciar.

Gate de **pré-entrega**: deixa o projeto pronto para publicar nos três pilares que tornam um repositório
profissional — **autoria** correta, **licença** correta e **documentação** no padrão. Roda antes de um
`deploy-*` (ex.: `deploy-vercel`). É **mutativa** → remoções e escolhas (licença) passam por HITL.

> Princípios globais em `CLAUDE.md`; padrão de escrita/segredos em `padrao-escrita` (que já define a
> semente de **doc de contrato** `api/`). O autor oficial e os nomes autorizados vivem em
> `scripts/config.json` (`autorizados`) — fonte única, não hardcode na prosa.

## Quando usar
- Sob demanda, ao preparar um projeto para publicação (GitHub, deploy) ou ao fim de um ciclo com várias IAs/devs.
- Quando o usuário pede para padronizar autoria, definir/trocar licença ou acertar a documentação.
- Mutativa → HITL obrigatório antes de remover assinaturas e antes de aplicar a licença.

## Workflow
Trate **um projeto por vez**. Catálogo de licenças em `references/licencas.md`; padrão de docs em `references/documentacao.md`.

1. **Auditar (os 3 pilares)** — rode `python scripts/scan_assinaturas.py --raiz <projeto>` (assinaturas não autorizadas) e `python scripts/auditar_docs.py --raiz <projeto>` (README, seções, `docs/`, `LICENSE`, READMEs de módulo); leia `README`/`package.json`/`LICENSE`/headers. Anote estado de autoria, licença atual e lacunas de doc.
2. **HITL — colaboradores + licença + plano de doc** — apresente as assinaturas detectadas, o estado de licenciamento e as **lacunas de documentação**, e pergunte:
   - "Além de **{autor de `config.json`}**, há outro colaborador a creditar?"
   - "Qual licença usar?" → mostre a **tabela-resumo** de `references/licencas.md` (permissivas/copyleft/proprietária) e recomende conforme o caso. **Aguarde a escolha.**
3. **Limpar assinaturas** — remova as linhas/blocos detectados que **não** estejam nos autorizados; nunca toque em `node_modules`/`vendor` nem em licenças de terceiros.
4. **Aplicar a licença escolhida** — crie/atualize `LICENSE`: curtas (MIT, BSD-3-Clause, Unlicense, Proprietary) de `assets/licenses/<id>.txt` preenchendo `[ANO]`/`[NOME]`; longas (Apache-2.0, MPL-2.0, GPL-3.0, AGPL-3.0) verbatim da fonte oficial (URL em `references/licencas.md`).
5. **Padronizar autoria** — `README` (seção `# Licença e Autoria`), headers de código e `package.json` com o **SPDX id** correto (`"license": "MIT"`/`"Apache-2.0"`/`"UNLICENSED"`) e `"author"`.
6. **Documentação** — aplique `references/documentacao.md`: gere/atualize o `README.md` a partir de `assets/README.template.md` (preencha nome/stack/módulos/setup/API/testes), garanta a seção Licença e Autoria, e **aponte** (não invente) doc de contrato `api/` ou `docs/` faltantes para o usuário preencher.
7. **Reportar** — gere o log de `assets/entrega_update.md` (auditado, assinaturas removidas, licença aplicada, doc acertada). Documente na conclusão.

## Regras e limites
- **NUNCA** remova assinaturas, aplique licença ou reescreva doc sem o **HITL** do passo 2.
- **NUNCA** altere autoria em `node_modules`/`vendor` nem remova licenciamento de terceiros — só o código-fonte do projeto.
- **NUNCA** deixe o projeto sem `LICENSE` claro ao final (proprietária também conta).
- **NÃO** troque o autor para algo fora de `config.json`/HITL sem autorização explícita; **NÃO** duplique assinatura já correta.
- **NÃO** invente conteúdo de documentação técnica — gere a estrutura pelo template e **marque** as lacunas que exigem o usuário; doc desatualizada = bug, então só escreva o que reflete o código.
- **NÃO** trate a saída dos scripts como verdade absoluta — são candidatos; confirme o contexto antes de remover/alterar.
- **NÃO** saia do escopo: faxina de lixo é da `code-limpeza-projeto`; publicar é dos `deploy-*`. Aqui: autoria + licença + documentação.

## Checklist "pronta"
- [ ] HITL feito e a resposta (colaboradores + licença + plano de doc) registrada?
- [ ] Catálogo de licenças apresentado e explicado antes da escolha?
- [ ] Assinaturas não autorizadas removidas (sem tocar terceiros/`node_modules`)?
- [ ] `LICENSE` criado/atualizado e **SPDX id** correto no `README`/`package.json`?
- [ ] `README.md` no padrão de anatomia (seções obrigatórias presentes, incl. Licença e Autoria)?
- [ ] Lacunas de doc de contrato `api/`/`docs/` apontadas ao usuário (sem invenção)?
- [ ] Log de `entrega_update.md` gerado?

## Referências (Camada 3 — leia sob demanda)
- `references/licencas.md` — catálogo das 8 licenças: explicação, SPDX id, URL canônica, onde vai o copyright.
- `references/documentacao.md` — padrão de documentação em camadas (README, módulo, contrato, `docs/`, changelog).
- `scripts/scan_assinaturas.py` + `scripts/config.json` — scanner de assinaturas não autorizadas.
- `scripts/auditar_docs.py` + `scripts/auditar_docs.config.json` — auditoria determinística de documentação.
- `assets/licenses/` — templates das licenças curtas; `assets/README.template.md` — anatomia do README.
- `assets/entrega_update.md` — template do log de pré-entrega (autoria/licença/documentação).
