---
name: spec-revisao
description: Contraprova de paridade entre as specs e o sistema real — confronta o que specs/, arquitetura/ e adr/ afirmam com o que o worktree faz, e reporta cada divergência classificada por severidade. Use ao conferir se as specs refletem o código, antes de sintetizar uma plan, ou ao suspeitar de spec desatualizada. Read-only — aponta, não corrige. NÃO acione proativamente.
---

# Skill: Contraprova de Specs (spec-revisao)

> **Dependência:** esta skill assume o fluxo **SDD** descrito em `specs/_estrutura_base/README.md` e
> `00-prompt-revisor.md` (triagem, plan, síntese) e a **forma** de spec da skill `spec-write`.
> Consulte-os antes de iniciar. Ela não redefine nem repete nenhum dos dois.

O SDD afirma que `specs/`, `arquitetura/` e `adr/` refletem a **realidade exata** do repositório — um
agente que as lê fica corretamente contextualizado sem abrir uma linha de código — e chama a divergência
de **defeito de primeira ordem**. Isso é uma promessa que ninguém confere: spec e código envelhecem em
ritmos diferentes, e a spec mentirosa só aparece quando um agente já agiu com base nela.

Esta skill é a **contraprova**: o método que confronta a verdade documentada com a verdade em disco e
devolve um **relatório de divergências**. Entrega achado, nunca conserto.

**Dois eixos, uma pergunta:** *o que está escrito é verdade?*

- **specs × código** — a spec afirma algo que o worktree confirma ou desmente.
- **specs × specs** — a verdade documentada não pode divergir de si mesma (spec × arquitetura × ADR ×
  `00-indice`/`plan/`).

| Não confunda com | Eixo dela |
|---|---|
| `spec-write` | a **forma** da spec (molde, frontmatter, plano de testes) |
| `code-diagnostico` | o **código** contra o padrão de escrita (Nível 0) |
| `meta-verificacao-base` | a integridade da **base de skills**, não das specs de um projeto |
| **`spec-revisao`** | a spec contra a **realidade** que ela descreve |

## Quando usar

- Antes de o revisor **sintetizar** uma plan aprovada — a síntese grava verdade nova; conferir a antiga
  primeiro evita empilhar contradição.
- Ao suspeitar de **spec desatualizada** (a spec descreve um comportamento que o código não tem mais).
- Ao **entrar** num repositório desconhecido, antes de emitir instrução com base nas specs dele.
- Depois de uma campanha que mexeu em muito código (`/code3-adequar`, `/cyber2-adequar`, migração) —
  refactor em massa é o que mais deixa spec para trás.
- **Sob demanda.** Não dispara sozinha.

## Workflow

1. **Delimitar o escopo**
   - **Ferramenta:** conversa (HITL).
   - **Ação:** confirme o alvo — repositório inteiro, um domínio, ou só os arquivos que uma plan tocou.
   - **Critério:** escopo declarado em uma linha antes de qualquer leitura. Sem alvo, **pergunte**.
2. **Inventariar a verdade documentada**
   - **Ferramenta:** `Read`, `Glob`.
   - **Ação:** leia `specs/00-contexto.md` (§4, o mapa de roteamento) e liste as specs fixas dentro do
     escopo. Se o mapa não cobre a área, isso já é achado (`lacuna-de-roteamento`).
   - **Critério:** a lista de specs lidas é **declarada ao usuário**. Área não lida não vira veredito.
3. **Rodar a camada mecânica**
   - **Ferramenta:** `scripts/verificar_paridade.py --raiz <repo> [--json]`.
   - **Ação:** colete ponteiro morto, wikilink órfão, `00-indice` × `plan/`, status divergente e módulo
     sem spec — o que é determinístico sai daqui, e não do seu julgamento.
   - **Critério:** a saída é **primeira passada**, não veredito. Triar no passo 5 antes de reportar.
4. **Extrair e confrontar as asserções**
   - **Ferramenta:** `Grep`, `Glob`, `Read` e, se o projeto adota o template de módulos,
     `node tools/gate/validate.mjs`.
   - **Ação:** de cada spec do escopo, extraia as afirmações que o código pode confirmar ou desmentir
     (regra de negócio, rota, contrato, schema, stack, nome de módulo, comportamento observável) e
     procure cada uma no worktree.
   - **Critério:** cada achado nasce com **duas evidências** — `spec.md:linha` e `arquivo:linha`.
     Afirmação que o código não pode confirmar nem desmentir **não é achado**; é spec vaga (`spec-write`).
5. **Classificar**
   - **Ação:** enquadre cada divergência na tabela abaixo, com severidade.
   - **Critério:** achado sem classe ou sem as duas evidências **não entra no relatório**.
6. **Rotear (propor, não executar)**
   - **Ação:** para cada achado, proponha o canal do SDD — **plan** (a correção muda verdade
     documentada), **prompt direto** (não muda) ou **`00-backlog`** (não trava trabalho), com o motivo
     em uma linha. O critério da triagem é o do `00-prompt-revisor` §4; esta skill não cria outro.
   - **Critério:** proposta, nunca ação. Quem escreve plan, índice ou backlog é o revisor.
7. **Entregar o relatório**
   - **Ferramenta:** resposta na conversa.
   - **Ação:** tabela ordenada por severidade — classe · severidade · spec:linha · código:linha ·
     divergência em uma frase · canal proposto. Feche com o veredito: **paridade íntegra** ou **N
     divergências, M bloqueantes**, e o que ficou fora do escopo.
   - **Critério:** nada é gravado em disco. O relatório vive na conversa.

## Classes de divergência

| Classe | O que é | Severidade |
|---|---|---|
| `contradicao` | spec e código existem e **discordam** (regra, rota, contrato, schema, stack) | 🔴 bloqueio |
| `afirmacao-sem-codigo` | a spec afirma algo que **não existe** no worktree | 🔴 bloqueio |
| `incoerencia-interna` | spec × arquitetura × ADR × `00-indice`/`plan/` se contradizem entre si | 🔴 bloqueio |
| `codigo-sem-spec` | comportamento ou regra viva **sem verdade documentada** | 🟡 aviso |
| `ponteiro-morto` | a spec cita arquivo, módulo, símbolo ou `[[wikilink]]` que não existe mais | 🟡 aviso |
| `lacuna-de-roteamento` | o mapa do `00-contexto` §4 não cobre uma área que existe no repositório | 🟡 aviso |

**Bloqueio** é o achado que faria um agente agir errado lendo a spec. **Aviso** é o que o deixa
desinformado, sem induzi-lo ao erro.

## Regras e limites

- **NUNCA** edite spec, código, `00-indice`, `plan/` ou `00-backlog` — nem para consertar um typo que
  você acabou de encontrar. Esta skill é read-only por definição; corrigir no meio da conferência
  destrói a evidência do achado e atropela a triagem do revisor.
- **NUNCA** reporte achado sem o **par de evidências** (`spec:linha` + `arquivo:linha`). Divergência
  afirmada sem os dois lados é opinião, e opinião com cara de veredito é pior que silêncio.
- **NÃO** trate a saída do `verificar_paridade.py` como relatório final — molde, exemplo e prosa
  instrucional citam caminho fictício por ofício, e o script não distingue todos. Triagem é sua.
- **NÃO** decida **plan** ou **prompt direto** no lugar do revisor — proponha o canal e pare.
- **NÃO** julgue qualidade de código (limiares, SRP, nomes) — isso é `code-diagnostico`; nem forma de
  spec (frontmatter, molde, plano de testes) — isso é `spec-write`.
- **NÃO** reafirme a lei do Nível 1 dentro do relatório: onde há template de módulos, quem responde é
  `arquitetura/04-regras.md`, cobrado por `node tools/gate/validate.mjs`. Rode o gate e cite o veredito.
- **NÃO** emita veredito sobre área que não leu — declare o que ficou fora do escopo, sempre.

## Checklist "pronta"

- [ ] Escopo confirmado com o usuário e declarado antes da primeira leitura?
- [ ] Specs lidas listadas na resposta, e o que ficou fora do escopo declarado?
- [ ] `verificar_paridade.py` executado, e a saída dele **triada** (não copiada) para o relatório?
- [ ] Gate do template rodado quando o projeto o adota (`node tools/gate/validate.mjs`)?
- [ ] Todo achado tem classe, severidade e as **duas** evidências com caminho e linha?
- [ ] Todo achado tem canal proposto (plan / prompt direto / `00-backlog`) com motivo em uma linha?
- [ ] Nenhum arquivo do repositório foi criado, editado ou removido (`git status` limpo)?

## Referências (Camada 3 — leia sob demanda)

- `scripts/verificar_paridade.py` — a camada mecânica das seis checagens determinísticas (ponteiro
  morto, wikilink órfão, `00-indice` × `plan/`, status divergente, módulo sem spec). `--autoteste`
  prova os núcleos puros; `--json` é o contrato de máquina do passo 3.
