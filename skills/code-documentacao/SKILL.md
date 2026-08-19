---
name: code-documentacao
description: Gera e padroniza a superfície do repositório com quem chega de fora — README.md da raiz, CONTRIBUTING.md, CHANGELOG.md e .github/CODEOWNERS. Use ao preparar a documentação de entrada de um projeto ou padronizar seus arquivos de superfície. NÃO acione proativamente.
---

# Skill: Documentação (Superfície do Repositório)

Dona única da **superfície do repositório** — o que quem chega de fora vê primeiro. **Não é dona de
documentação técnica**: o que o sistema é, por que é assim e o que muda vive no fluxo **SDD**, em
`specs/` (contexto, arquitetura, ADRs). Esta skill **aponta** para lá; nunca descreve arquitetura.
Autoria é da `code-assinatura`; licença é da `code-licenca` — referencie, não repita.

## Quando usar

- Sob demanda, ao preparar a documentação de entrada de um projeto (README, CONTRIBUTING, CHANGELOG,
  CODEOWNERS) ou padronizar os arquivos de superfície existentes.
- Mutativa (gera/atualiza arquivo) → HITL antes de inventar qualquer conteúdo que exija conhecimento
  de negócio.

## Workflow

1. **Auditar** — `python scripts/auditar_docs.py --raiz <projeto>` (README ausente, seções faltando,
   `specs/` ausente, `LICENSE` ausente, módulos sem README). Leia o README atual, se existir.
2. **HITL — lacunas de negócio** — se faltar visão geral, stack ou setup (o que exige conhecimento do
   projeto, não é factual), pergunte ao usuário. **Nunca invente.**
3. **Gerar/atualizar o README** — a partir de `assets/README.template.md`, preenchendo o que é
   factual (nome, stack detectada, módulos via `Glob`, comandos de setup/testes). As seções
   "Arquitetura modular" e "API" são **ponteiro** para `specs/arquitetura/` e
   `contract/openapi.yaml` de cada módulo — nunca descreva arquitetura aqui.
4. **`.github/CODEOWNERS`** — crie/atualize com o(s) autor(es) já confirmado(s) (pela
   `code-assinatura`, se já rodada nesta entrega; senão pergunte).
5. **`CONTRIBUTING.md`** — gere a partir de `references/templates.md`.
6. **`CHANGELOG.md`** *(se o projeto for versionado/publicado)* — garanta a existência, formato Keep
   a Changelog + SemVer.
7. **Reportar** — arquivos gerados/atualizados e as lacunas apontadas ao usuário.

## Regras e limites

- **NUNCA** invente conteúdo que exige conhecimento de negócio (visão, decisões, contexto) — aponte
  a lacuna ao usuário; doc inventada é pior que doc ausente.
- **NÃO** descreva arquitetura, decisão técnica ou contexto — isso é do fluxo SDD, em `specs/`; aqui
  só se aponta, nunca se repete.
- **NÃO** decida ou aplique licença — isso é da `code-licenca`.
- **NÃO** remova assinatura nem edite metadados de autoria — isso é da `code-assinatura`.
- **NÃO** destrua `specs/` existente — esta skill complementa a documentação técnica, não a substitui.
- **NÃO** saia do escopo: faxina de lixo é da `code-limpeza-projeto`; publicar é dos `deploy-*`.

## Checklist "pronta"

- [ ] `auditar_docs.py` rodado e as lacunas conferidas contra o README atual?
- [ ] README no padrão de anatomia — seções obrigatórias presentes, "Arquitetura modular"/"API" como
      ponteiro (não conteúdo repetido de `specs/`/`contract/`)?
- [ ] `.github/CODEOWNERS` presente e correto?
- [ ] `CONTRIBUTING.md` presente?
- [ ] `CHANGELOG.md` presente, quando aplicável?
- [ ] Lacunas que exigem conhecimento de negócio apontadas ao usuário, sem invenção?

## Referências (Camada 3 — leia sob demanda)

- `references/documentacao.md` — padrão de documentação em camadas (README, módulo, contrato,
  `specs/`, changelog).
- `references/templates.md` — templates copiáveis de `CODEOWNERS` e `CONTRIBUTING.md`.
- `scripts/auditar_docs.py` + `scripts/auditar_docs.config.json` — auditoria determinística de
  documentação.
- `assets/README.template.md` — anatomia do README.
