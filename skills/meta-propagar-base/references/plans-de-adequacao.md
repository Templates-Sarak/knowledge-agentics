# Moldes — plans de adequação

Um molde por proposta do `--relatorio`. A tabela lacuna/ação → plan vive em `PLANS`, no
`scripts/relatorio.py`: **título, destino da síntese, ordem e `depende_de`** saem de lá (a ordem também é dado);
aqui só o corpo. Todas são **família `00`** e têm o formato do `_templates/template-plan.md` **do
repositório** — copie o cabeçalho (frontmatter e nota) e as seções §9–§11 dele; os moldes abaixo preenchem o
frontmatter e as seções §1 a §8.

**Ordem e dependências:** num repositório com o `00-indice` em formato antigo, **"Converter o `00-indice`" é
sempre a primeira (`plan-00.01`) e todas as outras dependem dela** (`depende_de`). A decisão sobre
`divergente`/`conflito` e a migração de famílias vêm depois da lei renomeada (quando ela é proposta). Só
valem as dependências de plans que o HITL aceitou.

**Antes de escrever, no repositório alvo:**
- leia o `00-contexto` e o `00-prompt-revisor` dele; o `proximo_numero_plan` da família `00` dá o `NN`
  (família sem entrada, ou formato escalar antigo, começa em `01`) — crie `specs/plan/plan-00.NN-<slug>.md`, a
  linha no `00-indice` e incremente o contador **na mesma ação** (no formato escalar, é a plan de conversão que
  troca o campo; as demais entram na tabela com o `NN` sugerido);
- a forma da plan, da spec e do ADR é da skill **`spec-write`**; o catálogo de famílias, do
  `panorama/00-planejamento.md` §1; a numeração, do `00-indice` §4. **Aponte para eles, não os copie.**
- **o `--aplicar` exige worktree limpo:** o usuário commita as plans (e o índice) antes de levá-las ao executor.

**Convenções dos moldes:** `<…>` = preencher com o que o `--plano --id <id>` mostrou; **a lista de arquivos vai
inteira na §3.1** (o executor não tem outro contexto); toda plan referencia, na §4, o `00-contexto`, o
`00-knowledge`, `padrao-escrita` e as fontes citadas; a §7 sempre fecha com `propagar.py --plano --id <id>` (o
item da proposta some do plano) e a linha **Gate:** (`nenhum` quando o repositório não é modular). **O
executor não decide nada que dependa do usuário:** catálogo, mapeamento e decisões chegam prontos na §3.1.

---

## 1. Converter o `00-indice` para o contador por família — sempre a primeira

````md
---
tipo: "plan"
familia: "00"
titulo: "Converter o 00-indice para o contador por família"
status: "🔴 A executar"
prioridade: "Alta"
tags: ["plan"]
destino_sintese: "—"
---
# 1. Objetivo
O `proximo_numero_plan` do `00-indice` é um mapa família → próximo `NN`, e a tabela segue o molde atual.

# 3. Escopo
## 3.1 Dentro
- `specs/00-indice.md` — frontmatter (`proximo_numero_plan`) e a tabela
## 3.2 Fora
- As plans em si; qualquer outro arquivo.

# 4. Referências obrigatórias
Molde atual: na base, `specs/_estrutura_base/00-indice.md` (campo `proximo_numero_plan` e §4) · `00-contexto.md`
· `spec-write`.

# 5. Instruções de execução
1. Leia o contador escalar atual (<valor>) e as plans em `specs/plan/` (as plans `plan-00.NN` desta
   adequação já estão na tabela).
2. Troque o escalar pelo mapa. Entrada `"00"`: o próximo `NN` livre da família `00`, contando as plans
   `plan-00.NN` desta adequação (<valor>). As plans antigas (`plan-NN-…`) não têm família: **não crie outras
   entradas** — elas nascem na plan de famílias.
3. Ajuste a tabela às colunas do molde atual, preservando as linhas existentes.

# 6. Critérios de aceite
- [ ] `proximo_numero_plan` é mapa, com a entrada `"00"` correta.
- [ ] Uma linha por plan em `specs/plan/`, nenhuma a mais.

# 7. Como verificar
- `git diff -- specs/00-indice.md` → só frontmatter e tabela.
- `propagar.py --plano --id <id>` → lacuna `molde em formato antigo` vazia. **Gate:** `nenhum`.

# 8. Destino da síntese
**Destino:** `—` (ajuste de formato do molde de processo).
````

## 2. Reconciliar a lei do template renomeada (destrava os `bloqueado`)

````md
---
tipo: "plan"
familia: "00"
titulo: "Reconciliar a lei do template renomeada"
status: "🔴 A executar"
prioridade: "Alta"
tags: ["plan"]
depende_de: "plan-00.NN-converter-o-00-indice"
destino_sintese: "—"
---
# 1. Objetivo
Cada arquivo de `specs/arquitetura/` com nome fora do reservado tem destino decidido — vira a lei do template
sob o nome reservado, a fundação tecnológica ou conteúdo do projeto —, e o plano deixa de listar `bloqueado`.

# 3. Escopo
## 3.1 Dentro
Tabela decidida pelo revisor **antes de liberar a plan**:
| Arquivo atual | Destino |
|---|---|
| `specs/arquitetura/<arquivo>` | lei renomeada → `<nome reservado>` · fundação → `00-fundacao-tecnologica.md` · conteúdo do projeto → fica (plan de famílias) |
## 3.2 Fora
- `tools/`, código e qualquer arquivo não listado; conteúdo das leis além do renome.

# 4. Referências obrigatórias
`panorama/00-planejamento.md` §1 (nomes reservados da família `00`) · `00-contexto.md` · `00-knowledge.md` ·
`padrao-escrita` · na base, `specs/_estrutura_modulos/doutrina/` (a lei de referência) · saída de
`propagar.py --plano --id <id>`.

# 5. Instruções de execução
1. Aplique a tabela da §3.1: `git mv` para o nome reservado, onde a decisão é "lei renomeada".
2. Colisão com um reservado já existente: pare e reporte; não sobrescreva.
3. Atualize os `[[links]]` e referências que apontavam para o nome antigo (`grep`, nunca de memória).
4. Modular: rode `node tools/gate/validate.mjs --all`.

# 6. Critérios de aceite
- [ ] Nenhum arquivo da tabela com nome fora do reservado, salvo os de "conteúdo do projeto".
- [ ] Nenhum link quebrado para o nome antigo.
- [ ] Gate verde (modular).

# 7. Como verificar
- `git diff --stat` → só renomes da tabela e links.
- `propagar.py --plano --id <id>` → `bloqueado 0`; lacuna `lei/fundação` vazia (ou só o conteúdo do projeto declarado).
- **Gate:** `nenhum — conformidade de nomes, sem regra nova`.

# 8. Destino da síntese
**Destino:** `—` (nenhuma verdade nova; a lei já é a da base).
**Nota:** depois do renome, uma lei renomeada cujo conteúdo difere do template aparece como `divergente` no
plano — o que é esperado: ela cai na plan de decisão (§4), que depende desta.
````

## 3. Migrar specs e plans para famílias `FF.NN` e montar o catálogo

O **executor não propõe nem cria família** (regra do `00-prompt-executor` do repositório). O **revisor, com o
usuário e antes de liberar a plan**, decide o catálogo e o mapeamento `arquivo → FF.NN` e os escreve na §3.1.
A plan só executa.

````md
---
tipo: "plan"
familia: "00"
titulo: "Migrar specs e plans para famílias FF.NN e montar o catálogo"
status: "🔴 A executar"
prioridade: "Alta"
tags: ["plan"]
depende_de: "plan-00.NN-converter-o-00-indice, plan-00.NN-reconciliar-a-lei (se proposta)"
destino_sintese: "—"
---
# 1. Objetivo
`panorama/00-planejamento.md` tem o catálogo de famílias abaixo, e toda spec, arquitetura e plan viva usa
`FF.NN` (ou o nome reservado da família `00`), exatamente como no mapeamento.

# 3. Escopo
## 3.1 Dentro
**Catálogo aprovado** (vai para `panorama/00-planejamento.md` §1, como está):
| FF | Família | Escopo (uma linha) |
|---|---|---|
| 00 | Fundação | <o texto já existente do molde> |
| <FF> | <nome> | <escopo> |

**Mapeamento aprovado** (todo arquivo da lacuna `migracao-de-familias-pendente`, sem exceção):
| Nome atual | Novo nome | `familia` |
|---|---|---|
| `specs/specs/<NN-slug>.md` | `specs/specs/<FF.NN-slug>.md` | `"<FF>"` |
| `specs/plan/plan-<N>-<slug>.md` | `specs/plan/plan-<FF.NN>-<slug>.md` | `"<FF>"` |

**Contadores resultantes** (`proximo_numero_plan`): `"<FF>": "<NN>"`, … — o primeiro `NN` livre de cada família.

Também: `specs/panorama/00-planejamento.md` (catálogo), `specs/00-indice.md` (linhas e contadores).
## 3.2 Fora
- Conteúdo das specs (só nome, `familia:` e links); `specs/adr/` (ADR não tem família); código.
- Criar ou alterar família: o que não está no catálogo acima não se faz.

# 4. Referências obrigatórias
`panorama/00-planejamento.md` §1 (formato do catálogo) · `00-indice.md` §4 (contador) · `spec-write` (forma) ·
`spec-panorama` (validação) · `00-contexto.md` · `padrao-escrita`.

# 5. Instruções de execução
1. Preencha o catálogo (§1 do planejamento) **como está na §3.1**.
2. Para cada linha do mapeamento: `git mv`, `familia:` no frontmatter e os `[[links]]` que apontavam para o
   nome antigo (`grep`, nunca de memória).
3. Plans abertas: ajuste a linha do `00-indice` e grave os contadores da §3.1.
4. Rode a validação da `spec-panorama` (famílias e itens).
5. Arquivo fora do mapeamento, ou dúvida de família: **pare e reporte** — não decida.

# 6. Critérios de aceite
- [ ] Catálogo igual ao da §3.1; nenhuma família fora dele.
- [ ] Nenhum arquivo em formato antigo; `FF.NN` único por família somando `specs/` e `arquitetura/`.
- [ ] Índice sem linha órfã nem plan sem linha; contadores como na §3.1.

# 7. Como verificar
- `git diff --stat --find-renames` → só renomes, frontmatter, links, catálogo e índice.
- `propagar.py --plano --id <id>` → lacuna `migração de famílias` vazia.
- Validador da `spec-panorama` sem erro. **Gate:** `nenhum — sem regra de gate`.

# 8. Destino da síntese
**Destino:** `—` (o catálogo vive no `00-planejamento`, que não é síntese de plan).
````

## 4. Decidir arquivo a arquivo: adotar a versão da base ou manter (`divergente`)

A decisão é **do usuário**, tomada com o revisor **antes de liberar a plan** e escrita na tabela da §3.1. A §5
é **um comando**: nada de copiar corpo à mão — o `--adotar` faz a mesma escrita do aplicar (corpo da referência,
título e fim de linha do sistema) e o `--manter` registra a decisão no carimbo.

````md
---
tipo: "plan"
familia: "00"
titulo: "Decidir arquivo a arquivo: adotar a versão da base ou manter"
status: "🔴 A executar"
prioridade: "Média"
tags: ["plan"]
depende_de: "plan-00.NN-converter-o-00-indice, plan-00.NN-reconciliar-a-lei (se proposta)"
destino_sintese: "—"
---
# 1. Objetivo
Cada arquivo universal que difere da base, sem versão reconhecida no histórico, tem decisão aplicada: os
"adotar" ficam iguais à base; os "manter" ficam registrados no carimbo, com o motivo, e deixam de ser pendência.

# 3. Escopo
## 3.1 Dentro
Tabela de decisão (preenchida com o usuário **antes** de liberar a plan):
| Arquivo | Decisão | Motivo (só "manter") |
|---|---|---|
| `<caminho>` | adotar | — |
| `<caminho>` | manter | <texto dito pelo usuário> |

Escrevem-se apenas: os "adotar", `.sarak/base.json` (entradas `mantidos`), `.sarak/propagacao-<curto>.json`
e o que o aplicar escreve por rotina (carimbo, `00-resumo`) — nada além.
## 3.2 Fora
- Qualquer arquivo fora da tabela; moldes personalizados; código; decidir por conta própria.

# 4. Referências obrigatórias
Saída de `propagar.py --plano --id <id>` · skill `meta-propagar-base` (`SKILL.md`: ações `divergente`,
`conflito`, `mantido`) · `00-contexto.md` · `padrao-escrita`.

# 5. Instruções de execução
1. Com o worktree limpo, rode, da raiz da base, **um** comando com as decisões da tabela:
   `python <caminho da base>/skills/meta-propagar-base/scripts/propagar.py --aplicar --id <id> --adotar <caminho> [--adotar …] --manter <caminho> --motivo "<texto>" [--manter … --motivo "…"]`
2. Caminho com `[ERRO]` (não está em `divergente`/`conflito`): pare e reporte; não improvise.
3. Não commite.

# 6. Critérios de aceite
- [ ] O comando terminou sem `[ERRO]`.
- [ ] Todo "adotar" idêntico à base (descontado o título); todo "manter" intocado.
- [ ] Cada "manter" tem entrada em `mantidos` no `.sarak/base.json`, com o motivo da tabela.

# 7. Como verificar
- `git diff --stat` → só os "adotar" e `.sarak/`.
- `propagar.py --plano --id <id>` → os "adotar" saíram de `divergente`; os "manter" aparecem como `mantido`.
- **Gate:** `nenhum`.

# 8. Destino da síntese
**Destino:** `—` (alinhamento com a base; a decisão vive no carimbo).
````

## 5. Decidir arquivo a arquivo (com carimbo) — `conflito`

Mesmo molde do item 4 (a §5 também é **um comando** `--aplicar … --adotar … --manter … --motivo …`), com
estas diferenças:

- **Título e §1:** "Decidir arquivo a arquivo (com carimbo): adotar a versão da base ou manter" — o arquivo foi
  editado no projeto **e** mudou na base desde o carimbo.
- **§4 inclui** o `base_commit` do carimbo (`.sarak/base.json`): a versão antiga da fonte sai de
  `git show <base_commit>:<fonte>` na base, para o revisor mostrar o diff carimbo → base e carimbo → local ao
  usuário **antes** da decisão.
- **Decisões possíveis na tabela:** adotar a base · manter o local. **Mesclar** não cabe no comando: se o
  usuário quer mesclar, o revisor faz a mescla na própria plan (passos de edição explícitos na §5, arquivo a
  arquivo) e o arquivo sai da tabela; depois o `--manter` o registra com o motivo "mesclado".
- **§7:** os "adotar" saem de `conflito`; os "manter" aparecem como `mantido`.

## 6. Criar a base de linguagem que falta

````md
---
tipo: "plan"
familia: "00"
titulo: "Criar a base de linguagem que falta"
status: "🔴 A executar"
prioridade: "Média"
tags: ["plan"]
depende_de: "plan-00.NN-converter-o-00-indice"
destino_sintese: "arquitetura/00-base-<binding>.md"
---
# 1. Objetivo
`specs/arquitetura/00-base-<binding>.md` existe para cada binding do `mapa.json` do sistema, com o título do
projeto.

# 3. Escopo
## 3.1 Dentro
- `specs/arquitetura/00-base-<binding>.md` — <um por binding sem base: lacuna `binding-sem-base`>
## 3.2 Fora
- Outras arquiteturas; o conteúdo da base além do título; `tools/` e código.

# 4. Referências obrigatórias
Na base: `specs/_bases_arquiteturais/00-base-<binding>.md` (a fonte) e `instalar_base_de_linguagem` em
`skills/meta-iniciar-repositorio/scripts/init_repo.py` (como o título é reescrito) · `00-contexto.md` ·
`padrao-<binding>` · `padrao-escrita`.

# 5. Instruções de execução
1. Copie a fonte para `specs/arquitetura/00-base-<binding>.md` e reescreva a linha `titulo:` e o H1 com o
   nome do projeto, **como o instalador faz** (não invente outra forma).
2. Se o projeto já descreve essa arquitetura sob outro nome, pare e reporte: é caso da plan de lei renomeada.

# 6. Critérios de aceite
- [ ] Um `00-base-<binding>` por binding, com título do projeto e corpo igual à fonte.

# 7. Como verificar
- `git diff --stat` → só os arquivos novos de §3.1.
- `propagar.py --plano --id <id>` → lacuna `binding sem 00-base` vazia. **Gate:** `nenhum` (ou o do repositório, se modular).

# 8. Destino da síntese
**Destino:** `arquitetura/00-base-<binding>.md` — a própria base criada é a verdade; nada mais a transportar.
````

## 7. Tirar `.sarak/` do `.gitignore` (pré-requisito do aplicar)

> **Execute esta plan e commite antes do prompt de atualização direta:** com `.sarak/` ignorado o aplicar recusa.

````md
---
tipo: "plan"
familia: "00"
titulo: "Tirar .sarak/ do .gitignore"
status: "🔴 A executar"
prioridade: "Alta"
tags: ["plan"]
depende_de: "plan-00.NN-converter-o-00-indice"
destino_sintese: "—"
---
# 1. Objetivo
O `.sarak/base.json` (o carimbo) deixa de ser ignorado pelo git, para que a propagação o versione.

# 3. Escopo
## 3.1 Dentro
- `.gitignore` — só a(s) regra(s) que ignora(m) `.sarak/` (ache com `git check-ignore -v .sarak/base.json`)
## 3.2 Fora
- Qualquer outra regra; o conteúdo de `.sarak/`; segredos (`.env` continua ignorado).

# 4. Referências obrigatórias
`00-contexto.md` · `padrao-escrita` (segredos) · `meta-iniciar-repositorio` (o carimbo é versionado).

# 5. Instruções de execução
1. Rode `git check-ignore -v .sarak/base.json` e anote o arquivo e a linha da regra.
2. Remova só essa regra (ou troque-a por uma que não alcance `.sarak/base.json` nem `.sarak/propagacao-*.json`).
3. Confirme que nada em `.sarak/` é segredo antes de seguir.

# 6. Critérios de aceite
- [ ] `git check-ignore -q .sarak/base.json` sai com código 1 (não ignorado).

# 7. Como verificar
- `git diff -- .gitignore` → só a regra de §5.
- `propagar.py --plano --id <id>` → sem a lacuna `.sarak/ ignorado`. **Gate:** `nenhum`.

# 8. Destino da síntese
**Destino:** `—` (higiene de repositório).
````
