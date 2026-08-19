---
name: spec-write
description: Traduz ideia ou requisito do usuário em especificação padronizada do fluxo SDD (spec, plan, ADR), na forma e no vocabulário corretos. Use ao escrever ou revisar qualquer spec, plan ou ADR — é a fonte de forma que as demais skills de spec referenciam.
---

# Skill: Escrita de Especificações (spec-write)

O "funil" que obriga toda especificação e decisão arquitetural do ecossistema Sarak a nascer no
formato padronizado. É a **fonte de forma** — as demais skills de spec (`spec-fundacao`,
`spec-site-fundacao`, `spec-atualizar`) e o fluxo SDD inteiro assumem que uma spec/plan/ADR
gravada em disco passou por aqui.

## Quando usar

- **Dispara proativamente** (exceção declarada — ver `README.md` §7): sempre que o usuário pedir
  para "escrever uma spec", "rascunhar uma feature", "documentar uma funcionalidade", ou pedir
  para transformar uma ideia em documento — mesmo sem `/spec-write` explícito.
- Também via `/spec-write` direto.

## Workflow

1. **Entender a ideia** — leia o requisito. Identifique o tipo: requisito de negócio (feature),
   documento arquitetural, ou decisão (ADR).
2. **Consultar o molde**
   - **Ferramenta:** Tabela de Roteamento Global.
   - **Ação:** Descubra o caminho absoluto de `knowledge-agentics/specs/_estrutura_base/_templates/`
     e leia o template certo — `template-spec.md` para funcionalidade; `template-adr.md` ou
     `template-arquitetura.md` para decisão técnica/arquitetura.
3. **Produzir a spec**
   - **Ferramenta:** Escrita de documento.
   - **Ação:** Formate a ideia inteira dentro do formato do molde lido — bloco `YAML Frontmatter`
     (`---`) obrigatório no topo, campos `status`/`dominio`/`prioridade` preenchidos, regras em
     seções numeradas, Critérios de Aceite em checklist markdown (`- [ ]`).
4. **Desenhar o plano de testes (TDD/BDD)**
   - **Ação:** Preencha a seção `# 4. Plano de Testes` do template: **unitários** (cenários das
     regras de negócio isoladas, para `test-unitario`); **contrato/API** (garantia do formato dos
     dados, para `test-api-contrato`, se a spec expõe/consome endpoint de rede — senão, *N/A*);
     **E2E** (fluxos críticos de UI, para `test-e2e`, se há jornada de usuário — senão, *N/A*).
5. **Análise de impacto (HITL)**
   - **Ação:** Avalie silenciosamente se a spec introduz tecnologia nova, dependência crítica ou
     mudança de paradigma. Se sim, **PARE** e pergunte: *"Notei que esta spec introduz mudanças
     arquiteturais. Deseja que eu também crie/atualize o documento de Arquitetura e um ADR
     correspondente?"* Só gere os documentos extras se autorizado.
6. **Salvar no repositório-alvo**
   - **Ferramenta:** `Write`.
   - **Ação:** Grave o Markdown na pasta correta do projeto-alvo (`specs/`, `arquitetura/` ou
     `adr/`), nome de arquivo em `kebab-case` (ex.: `01-autenticacao.md`).

## Regras e limites

- **NÃO** invente metadados — nenhum campo novo no cabeçalho YAML além dos que o `template` já declara.
- **NÃO** grave o documento definitivo com Critérios de Aceite vagos — se a ideia do usuário estiver
  pouco clara, faça perguntas críticas no chat **antes** de escrever no disco (aja como um analista
  de negócios sênior, não como um transcritor).
- **NÃO** gere código-fonte — o entregável é o documento vivo (spec/plan/ADR) atualizado; a execução
  vem depois, em outra skill.
- **NÃO** pule a §4 (Plano de Testes) nem a análise de impacto do passo 5 — são obrigatórias mesmo
  quando o resultado é *N/A*/"sem mudança arquitetural".

## Checklist "pronta"

- [ ] Tipo de documento identificado (feature/arquitetura/ADR) e o molde certo foi lido antes de escrever?
- [ ] Frontmatter YAML presente, sem campo inventado, com `status`/`dominio`/`prioridade` preenchidos?
- [ ] Critérios de Aceite em checklist markdown (`- [ ]`), regras em seções numeradas?
- [ ] Seção `# 4. Plano de Testes` preenchida (unitários, contrato/API, E2E — ou `N/A` justificado)?
- [ ] Mudança arquitetural avaliada; se houver, o HITL do passo 5 foi feito antes de gerar Arquitetura/ADR extras?
- [ ] Arquivo salvo em `kebab-case`, na pasta correta (`specs/`, `arquitetura/` ou `adr/`) do repositório-alvo?
