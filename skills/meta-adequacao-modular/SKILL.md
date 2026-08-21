---
name: meta-adequacao-modular
description: Leva um repositório legado (já em produção, git+GitHub) ao template modular Sarak — diagnostica o terreno, instala o gate ANTES do refactor, escreve as plans de campanha (prefixo xx-) e, numa conversa separada, confere o agregado por critério mecânico. Use quando pedirem para adequar/migrar um sistema existente à arquitetura de módulos. NÃO acione proativamente.
---

# Skill: Adequação Modular

> **Dependência:** aplica `padrao-escrita` (Nível 0) e o catálogo `specs/arquitetura/04-regras.md` do
> projeto-alvo (na base Sarak: `specs/_estrutura_modulos/doutrina/04-regras.md` — Nível 1). Reusa
> `meta-iniciar-repositorio` (instalação), `spec-atualizar` (expurgo de plan sintetizada), `code-diagnostico`
> + `code-adequacao` (via `/code1-auditar` → `/code2-caracterizar` → `/code3-adequar`, campanha de Nível 0
> que **compõe** com esta), `db-migrations` (renomear tabela com dado real) e `git-especialista-repositorio`
> (`/git1-auditar`, o momento mais barato para rodar antes de reestruturar). **Não duplique regra de
> nenhuma delas aqui — referencie.**

Leva um repositório **anterior ao padrão** — já versionado, com código em produção — a se **verificar** como
um projeto nascido do template de módulos. O produto são as **plans de campanha** e o **aparato de gate
instalado antes de qualquer refactor**; a execução em si é de `/code2-caracterizar` + `/code3-adequar` +
`db-migrations`, fora desta skill.

## Quando usar
- Sob demanda, quando o usuário quer adequar/migrar um sistema legado ao template de módulos Sarak.
- **Mutativa** (instala arquivos, escreve plans, decide nomes) → **HITL em cada portão do mapa (seção
  "Mapa de HITL" mais abaixo)**.
- **Roda em DUAS conversas separadas, nunca na mesma**: Fase A (planejar) e Fase B (conferir), por revisores
  diferentes. A independência do revisor da Fase B não é estilo — é o que dá valor ao veredito.

## As duas fases — detecção mecânica, não pergunta

```
existem plans "xx-*" em specs/plan/ ?
   nenhuma                              → FASE A (planejar)
   existem e todas 🟢/⚪                → FASE B (conferir)
   existem e alguma ainda ativa         → campanha em andamento — aponte /code3-adequar e pare
```

## Os dois caminhos de entrada — ramificação obrigatória

```
existe specs/00-indice.md **e** specs/plan/ ?
   não → CAMINHO (i)  — sistema sem specs SDD    → passos 1–2 são no-op DECLARADO
   sim → CAMINHO (ii) — specs SDD divergentes     → passos 1–2 são trabalho real
```

Rode o diagnóstico mecânico da skill antes de perguntar qualquer coisa ao usuário — ele já responde fase,
caminho, **em que branch o alvo está**, **se o aparato do template já está instalado**, colisões e
candidatos a módulo:

```
python scripts/diagnosticar_terreno.py --raiz <alvo> --json
```

**Os candidatos a módulo são descobertos**, varrendo a raiz de módulos do alvo — `modules/` e o nome de
geração antiga que aponta para ela (`modulos/`). `--modulos <pasta> ...` continua existindo como
**override explícito**, para topologia que o script não decide (monólito, por-camadas, `apps/`). O campo
`modulos_origem` diz qual dos dois produziu a lista: `[]` com origem `varredura` é *"não há candidato"*;
`[]` com origem `flag` é *"ninguém apontou"* — não confunda os dois.

Confirme o resultado com o usuário em uma linha (fato, não escolha) e siga. Detalhe de cada campo do
relatório em `references/workflow.md` §0.

## O aparato do template já está aqui? — terceiro sinal, obrigatório antes do Passo 3

`template_instalado.estado` responde uma pergunta que fase/caminho **não** respondem — e confundi-la com
"é legado" foi um defeito medido desta skill (um projeto 100% gerado por `create-project.mjs` +
`create-module.mjs` era diagnosticado como legado colidindo, pelos próprios arquivos do template):

```
"nao-instalado"  → nenhuma peça do template presente. O fluxo normal (Passo 3, instalar tudo) está certo.
"parcial"        → algumas peças já existem. NÃO reinstale por cima — o Passo 3 instala só o que
                   `template_instalado.faltando` lista.
"completo"       → nada a instalar. Se, além disso, `fase == "A"` e `modulos_candidatos` veio vazio,
                   PARE: não há nada a planejar — o alvo já é (ou já foi) um projeto do template.
                   Confirme com o usuário se a campanha já terminou ou se a skill foi apontada para o
                   projeto errado, antes de seguir.
```

Enquanto `template_instalado.estado != "nao-instalado"`, **`colisao_raiz` e `workspaces_legado` já vêm
filtrados** pelo próprio script (o que é do template não conta como legado) — não repita esse julgamento
por conta própria.

## Fase A — planejar (uma conversa, revisor)

### Passo 0 — abrir
Usuário abre conversa nova como **revisor** e invoca esta skill. Rode o diagnóstico acima.

**Se `branch.e_padrao` for `true`, PARE** — a campanha não roda em `main`/`master` (é o `NUNCA` das regras
abaixo, agora com verificador). Vá ao portão de HITL de branch: peça o nome, crie-a e só então siga.
`branch.atual` vazio (`""`) ou `"(destacado)"` significa **não foi possível determinar** — pergunte, nunca
presuma que está seguro. `arvore_suja: null` é *"não consegui verificar"*, jamais *"está limpa"*.

### Passo 1 — sintetizar e limpar `plan/`
- **(i) sem specs:** no-op declarado — diga em voz alta *"não havia plan/spec: nada a sintetizar"*. Nunca
  invente trabalho aqui.
- **(ii) com specs:** `plan/` **tem** de ficar sem nenhuma plan `🟢 Aprovada` pendente de síntese — sintetize
  (o revisor, na própria conversa) e rode `spec-atualizar` para expurgar as `⚪`.

### Passo 2 — specs vs código
- **(i):** a adequação **inclui instalar** a pasta de specs. Só `00-contexto.md` e `00-indice.md` recebem
  conteúdo do alvo; `00-knowledge.md` + os dois `00-prompt-*.md` são **copiados sem reescrever** (leia-os no
  estado em que estiverem — essa área evolui). `specs/specs/` **nasce vazia** — não infira regra de negócio
  do código; o `00-contexto.md` declara a fronteira: *"specs documentam deste ponto em diante; o
  comportamento anterior está em `tests/`, não em prosa"*.
- **(ii):** confira **cada** spec fixa contra o código real. Divergência não é só relatada — **gera uma
  plan** `xx-nn-specs-<assunto>` que atualiza a spec (nunca uma edição silenciosa).

### Passo 3 — avaliar a adequação necessária (a régua ANTES da execução)
Ordem, e nenhuma delas espera pelo passo 5:
1. Compare a árvore atual × a que o template produziria: `comparar_arvore.py` (de
   `meta-iniciar-repositorio/scripts/`) contra um `create-project.mjs` de referência.
2. **Instale o aparato de verificação como ato próprio — só o que `template_instalado` diz que falta**.

   **Antes de instalar, pergunte se o que "falta" já existe sob outro nome.** `template_instalado`
   classifica por **presença de caminho**: um legado maduro que tenha gate, scaffolder ou
   `conformidade.json` próprios — em `scripts/`, em português, com outro nome — aparece como
   `faltando: ["gate", ...]`. Instalar o canônico ali cria **dois donos da mesma lei**, que é o defeito
   que a campanha existe para remover. Medido num legado real: um gate próprio de 544 linhas, com regras
   **mais estritas** que o canônico, seria duplicado (ou, pior, substituído — perdendo regra em nome de
   conformidade). Se houver equivalente funcional:
   - **não instale o segundo** — a convergência é por **renomeação, em plan** (`scripts/` → `tools/`),
     movendo o arquivo e nunca o motor;
   - **declare a decisão no índice da campanha**: por que não instalou, o que faz o papel do aparato hoje,
     e **o que substitui a régua vermelha inicial** como métrica (item 3 abaixo) — decisão que só existe
     dentro do raciocínio de uma plan é decisão que ninguém acha;
   - registre-a também onde o projeto guarda decisão técnica com trade-off (`specs/adr/`).

   É portão de HITL (mapa abaixo): equivalência exige julgamento — "mais estrito" não é "igual" —, e é
   por isso que a máquina pergunta em vez de decidir.

   Não havendo equivalente, siga por `template_instalado.estado`:
   - `estado == "nao-instalado"` → instale tudo (`tools/`, `config/`, `project.json`,
     `packages/ports/`, `adapters/memory/`, `.githooks/`), na **raiz de verdade** do repositório, mesclando
     e nunca sobrescrevendo.
   - `estado == "parcial"` → instale **apenas** as peças de `template_instalado.faltando` — reinstalar o
     que já existe arrisca sobrescrever configuração já ajustada.
   - `estado == "completo"` → **nada a instalar**; siga direto para o item 3 (o gate ainda roda, mesmo
     sem instalar nada — é a verificação, não a instalação, que nunca se pula).
   **Nunca aninhe numa subpasta** (regras de escopo `root` leem a raiz; `core.hooksPath` aceita um valor
   só; `ENV_RAIZ=../../.env` quebra com um nível a mais).
3. Rode `node tools/gate/validate.mjs --todos` e **deixe vermelho honesto**. Converta cada violação em
   exceção nominal em `config/conformidade.json` (`modulo`+`regra`+`motivo`+`decisao` apontando um ADR
   **real**). O número de exceções é a métrica da campanha.
4. Ponha a área ainda-não-migrada **fora de escopo de lint/tipos, declarada e encolhendo** (o
   `eslint`/`tsc`/`prettier` não têm dívida — §7 abaixo); "caminhos ignorados" é a segunda métrica.
5. Decida nome de cada módulo candidato (kebab-case; o script sugere), prefixo de tabela (renomear ×
   exceção, **ofereça a exceção primeiro**) e chaves de ambiente (renomear × exceção) — cada um é um portão
   de HITL (mapa abaixo). Template dos sete itens de renomeação em `references/templates.md`.

Detalhe completo (mecânica da dívida declarada, o buraco `eslint`/`tsc`/`prettier`, e por que a régua vem
antes) em `references/workflow.md` §1–§3.

### Passo 4 — escrever a(s) plan(s) de adequação
Toda plan nasce com o prefixo **`xx-`** (`xx-nn-descricao`), registrada em `specs/00-indice.md` como
qualquer plan do fluxo SDD (molde `_estrutura_base/_templates/template-plan.md`), com **definição de pronto
cobrada por máquina** (ex.: *"ao fim desta plan, `conformidade.json` tem uma exceção a menos"*). O `nn` é a
ordem de execução — decisão de HITL (risco × valor), não a ordem em que os módulos foram encontrados.

### HITL final da Fase A — o plano completo
Antes de escrever qualquer plan, apresente: fase e caminho detectados, a lista de módulos com o nome
decidido para cada um, prefixo de tabela por módulo (renomear/exceção), chaves de env (renomear/exceção), a
fronteira da área legada, e a ordem (`nn`) proposta. **"⚠️ Aprova este plano de adequação completo?"**
**Aguarde.**

## Fora da skill — a execução (passo 5)

Por módulo, nesta ordem (as duas campanhas — Nível 1 desta skill e Nível 0 de `code-` — compõem):

```
caracterizar (/code2-caracterizar)
  → mover para a árvore fechada (a xx-* plan, pelo ciclo SDD padrão: revisor→executor)
  → adequar Nível 0 (/code3-adequar, backlog de /code1-auditar — campanha separada e complementar)
  → gate verde (validate.mjs <modulo>)
  → apagar as exceções daquele módulo em conformidade.json
```

Migration com dado real (prefixo de tabela) passa por `db-migrations` (expand-contract, backup, HITL) —
nunca SQL improvisado dentro de uma plan. Se o passo 1 revelou segredo no histórico, encaminhe
`/git1-auditar` → `/git2-adequar` antes de reestruturar pastas.

## Fase B — conferir (outra conversa, outro revisor)

### Passo 6 — reabrir
Usuário abre conversa nova como revisor **diferente** do que executou, invoca esta skill — a detecção
mecânica acima já aponta Fase B (todas as `xx-*` são `🟢`/`⚪`).

### Passo 7 — critério mecânico, quase todo máquina
```
node tools/gate/validate.mjs --todos            → 0 erros
npm run verify  (ou python verificar.py)        → exit 0
exceções reais em conformidade.json             == as previstas no plano da Fase A
caminhos ignorados (lint/prettier)              == os declarados no passo 3
node tools/gate/validate.mjs --extracao <modulo> → 0 erros, por módulo tocado
specs/plan/ sem nenhuma "xx-*" pendente          (todas sintetizadas e expurgadas)
```
Com isso mecânico, o **único** julgamento do revisor é o que máquina não confere: **as specs continuaram
verdadeiras em relação ao código?** Aprove ou reprove — reportando os dois lados, nunca só "passou".

## Mapa de HITL — onde a skill para

| Portão | Por quê |
|---|---|
| fase (A/B) e caminho (i)/(ii) detectados | confirmar o fato antes de agir |
| `template_instalado.estado == "completo"` e sem módulos candidatos | confirmar que não há nada a planejar, em vez de reinstalar por cima |
| aparato equivalente encontrado sob outro nome | instalar o canônico ao lado ou convergir por renomeação — "mais estrito" não é "igual", e a máquina não julga isso |
| lista de módulos e o nome de cada um | qual capacidade vira qual `id` — o portão central |
| prefixo de tabela: renomear ou excetuar | por módulo; risco de migração é decisão de negócio |
| chaves de ambiente: renomear ou excetuar | `env-modulo` é estrito, sem meio-termo |
| a fronteira da área legada (fora de lint/tipos) | define o que fica sem cobertura, e por quanto tempo |
| ordem de execução (o `nn` das plans) | trade-off risco × valor |
| antes de qualquer migração SQL | backup — já é regra da `db-migrations` |
| colisão de `package.json`/`pyproject.toml` (só quando `template_instalado.estado == "nao-instalado"`) | mesclar scripts; **NUNCA `--forcar`** sem autorização |
| branch e primeiro commit da campanha | irreversível e externo |
| o plano completo, antes de escrever qualquer plan | o gate de "confirma?" que encerra a Fase A |

**Onde HITL é desperdício** (a máquina decide e só reporta): gate verde ou não; quais regras violadas;
`.env.example` × manifestos; árvore cabe em `ENTRADAS_PERMITIDAS`; spec citando caminho inexistente.

## Regras e limites
- **NUNCA** rode a Fase A e a Fase B na mesma conversa — destrói a independência do revisor da Fase B.
- **NUNCA** infira spec de negócio a partir do código no caminho (i) — spec errada é pior que spec ausente,
  porque é autoritativa. `specs/specs/` nasce vazia, e isso é correto.
- **NUNCA** trabalhe em `main` — a campanha roda em branch; o commit é sempre do usuário.
- **NUNCA** registre exceção em `conformidade.json` sem `decisao` apontando um ADR **real** em `specs/adr/`
  — o gate rejeita a própria exceção sem esse link, e um ADR inexistente aqui é achado, não conserto.
- **NUNCA** aninhe o template instalado numa subpasta — regras de escopo `root`, `core.hooksPath` e a
  cascata `ENV_RAIZ` exigem a raiz de verdade.
- **NÃO** escreva SQL de renomeação de tabela dentro de uma plan — roteie para `db-migrations`.
- **NÃO** trate a área legada como "resolvida depois" sem declará-la em `config/conformidade.json` e no
  escopo do linter — dívida não declarada é dívida escondida.
- **NÃO** toque em `Earendel/`, `ERP/` ou qualquer projeto fora do repositório desta conversa ao **construir**
  esta skill — mas, uma vez instalada, ela roda sobre o repositório-alvo que o usuário confirmar.
- **NÃO** saia do escopo: segurança de segredos/dependências é `cyber-*`; performance é `otimizacao-*`.

## Checklist "pronta"
- [ ] Fase (A/B) e caminho (i)/(ii) detectados **mecanicamente** e confirmados, não perguntados de saída?
- [ ] `branch.e_padrao` conferido no Passo 0 — a campanha está em branch própria, e não em `main`/`master`?
- [ ] `template_instalado` lido **antes** do Passo 3 — e, se `completo` sem módulos candidatos, a skill
      parou e disse "nada a planejar" em vez de reinstalar?
- [ ] O que `faltando` lista foi conferido contra **equivalente sob outro nome** antes de instalar — e, se
      havia, a decisão de não duplicar ficou declarada no índice da campanha e num ADR (não só dentro de
      uma plan)?
- [ ] `colisao_raiz`/`workspaces_legado` não foram tratados como legado quando eram o próprio scaffold do
      template (`template_instalado.estado != "nao-instalado"`)?
- [ ] Caminho (i): `00-contexto`/`00-indice` preenchidos, os três universais copiados sem reescrever,
      `specs/specs/` vazia e a fronteira declarada?
- [ ] Caminho (ii): `plan/` sem `🟢` pendente; cada divergência spec×código virou plan, não edição silenciosa?
- [ ] O aparato de gate foi instalado **antes** de qualquer plan de execução (nunca depois, como plan), e
      só nas peças que `template_instalado.faltando` listava?
- [ ] `conformidade.json` tem uma exceção nominal (com ADR real) por violação aceita, e nenhuma sem motivo?
- [ ] Cada módulo tem `id` kebab-case decidido, com os sete itens do template de renomeação resolvidos?
- [ ] Prefixo de tabela e chaves de ambiente: decisão de HITL registrada (renomear ou exceção), por módulo?
- [ ] Toda plan escrita usa o prefixo `xx-`, está no `00-indice.md`, e tem definição de pronto por máquina?
- [ ] O HITL do plano completo aconteceu **antes** de qualquer plan ser escrita?
- [ ] Fase B rodou em conversa separada, por revisor diferente do da execução?
- [ ] O critério mecânico do §7 foi conferido inteiro antes do veredito, e o julgamento humano ficou restrito
      a "as specs continuam verdadeiras"?

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — detalhe de cada passo, a mecânica da dívida declarada, o buraco
  `eslint`/`tsc`/`prettier`, e as seis armadilhas medidas.
- `references/templates.md` — o template dos sete itens de renomeação de módulo, o esqueleto de plan `xx-*`,
  o snippet de exceção em `conformidade.json` e o relatório da Fase B.
- `references/examples.md` — os dois caminhos ((i) e (ii)) percorridos ponta a ponta, e o resultado do
  legado sintético usado para validar esta skill.
- `scripts/diagnosticar_terreno.py` — o diagnóstico mecânico (fase, caminho, **branch e árvore suja**,
  **se o aparato do template já está instalado** — nada/parcial/completo, com as peças que faltam —, colisão de manifesto **só quando é
  legado de verdade**, geração do template, candidatos a módulo **descobertos** por varredura da raiz de
  módulos — com `--modulos` como override — e conformidade de nome). `--autoteste` prova o núcleo com
  fixtures.
