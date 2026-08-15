# Plano 3.0 — a limpeza para produção

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **O que este plano é.** O template carrega hoje a **arqueologia da própria construção**: comentários
> que explicam *como era antes*, citações a planos que o leitor não tem, e nomes de caso de teste que
> dizem em que rodada nasceram. Nada disso serve a quem **recebe** o template — serve a quem o
> construiu. Este plano remove essa camada e deixa **só o template**.
>
> **O que este plano NÃO é.** Não muda funcionalidade. Nem regra, nem ferramenta, nem estrutura, nem o
> comportamento de auto-verificação. **Zero linha de código executável muda** — e isso não é promessa,
> é o critério de aceite mecânico do Bloco BA.
>
> **Com UMA exceção, declarada e isolada:** o **Bloco BG** conserta um defeito do instalador
> (`init_repo.py` adivinha papel e artefato no modo em lote) e **muda comportamento por decisão**. Ele
> fica **fora** do `no-comments-diff` e tem prova própria. *Exceção declarada é aceitável; exceção
> diluída no critério não é.*
>
> **E o escopo cresceu para caber a produção.** Os Blocos **BA–BE** são o template
> (`specs/_estrutura_modulos/`). Os Blocos **BF** e **BG** são a **base que entrega o template** — as
> skills que o usuário invoca e o script que dá o primeiro passo. Sem eles, a limpeza deixaria o
> template impecável por trás de uma porta que não abre: foi exatamente isso que o `plan-3.1` §AF achou,
> com **100% das instalações via skill falhando**.

**Decisões do dono, tomadas antes de escrever:**
- **Comentário em tom de AVISO permanece.** O que impede alguém de desfazer uma guarda é carga
  estrutural, não ruído.
- **O template segue auto-verificável.** Essa e qualquer outra funcionalidade são preservadas.
- **O resíduo de campanha é REMOVIDO** — o git guarda o histórico.
- **O ADR-009 vira a convenção de nomenclatura deste template**, escrita no presente.

**Regras herdadas:** as quatro do `plan-3.md`, sem alteração.

---

## A regra deste plano, e ela é uma só

> **O comentário tem de ser legível por quem nunca viu este repositório.**
>
> Se a frase diz **o que fazer** ou **o que quebra**, ela **fica** — perdendo só a citação.
> Se ela narra o passado, ou aponta para um documento que o leitor não tem, ela **sai**.

```
FICA — avisa, e o aviso é a carga:
   o prefixo `**/` é obrigatório: sem ele o padrão ancora na pasta do próprio
   .gitignore e `modules/<id>/generated/` não é ignorado

SAI — narra:
   antes eram dois reconhecedores, um por âncora, e o de baixo regrediu (plan-2.md N.2.1)

FICA, sem a citação — a medição é o aviso, a rodada não é:
   antes:  `textoDeCodigo` remove comentário: sem isso, a chave citada num comentário
           virava uso de verdade (medido no Bloco N.1, plan-2.md)
   depois: `textoDeCodigo` remove comentário: sem isso, a chave citada num comentário
           vira uso de verdade
```

**O tempo verbal é o teste mais rápido.** *"virava"* é história; *"vira"* é aviso. Passado narrado sai;
presente que adverte fica.

---

## Estado — medido antes de decidir

| Métrica | Valor |
|---|---|
| Citações a `plan*.md` dentro do template | **137** — `bindings/` 46 · `tools/` 43 · `doutrina/` 24 · `tests/` 23 |
| Referências a *"Bloco X"* | **239** |
| Marcadores de arqueologia (*"antes era"*, *"o defeito"*, *"na rodada"*, *"regrediu"*) | **76** |
| Arquivos afetados | **56** |
| Nomes de caso em `cases.mjs` com marca de rodada | **27** |
| Lacunas do `04-regras.md` §7 que citam plano | **10** |
| `tests/` do template | **1,4 MB** — dos quais **1,16 MB** é `rename-refusals.json` |
| **Ponteiros mortos em `skills/`** (Bloco BF) | **11 arquivos** — 9 `.md` + **2 `.py`, que são código** |
| Entradas de `skills/` já na linha de base do `--depois-estrito` | **21 de 200** — dívida contada, com arquivo e linha |
| **Chutes do instalador** (Bloco BG) | **2** — papel inferido pelo nome do id, e `--sem-artefato` nunca passado |

**O número que define a urgência:** `create-project.mjs` copia **`tools/` inteiro** para todo projeto
gerado, e a **`doutrina/` vira o `specs/arquitetura/`** dele. Então **67 das 137 citações viajam para
dentro de cada projeto que alguém criar**, apontando para um `plan-2.md` que aquele projeto nunca terá.
Não é dívida da base: é dívida entregue ao usuário.

---

## Bloco BA — a ferramenta de aceite, e ela vem primeiro ✅ **FECHADO** *(commit `6d8a277`, revisado e reproduzido)*

> **A prova mecânica de "zero mudança funcional" já existe neste repositório.** `textoDeCodigo`
> (`tools/gate/text.mjs`) remove comentário e docstring de qualquer arquivo. Então a pergunta *"mexi só
> em comentário?"* não precisa de heurística nenhuma — precisa de **igualdade**.
>
> **Por que antes de limpar qualquer coisa:** escrita depois, ela é escrita contra a árvore já mexida e
> não tem linha de base. Mesma lição do Bloco AB do `plan-3.md`, e não é preciso aprendê-la de novo.

- [x] `tests/no-comments-diff.mjs`, no contrato dos irmãos: **núcleo puro · zero dependência ·
      `--autoteste` · exit 0/1**. Recebe uma árvore de referência e a atual; para todo arquivo de código
      dos dois lados, exige `textoDeCodigo(antes) === textoDeCodigo(depois)`, **byte a byte**
- [x] **Diferença de um byte reprova, e a mensagem nomeia arquivo e linha.** Não há "diferença
      aceitável" aqui: se o código sem comentário mudou, alguém mexeu em código achando que mexia em
      comentário
- [x] **Cobre os três bindings e as duas sintaxes de comentário** — `//`, `#`, `--`, bloco `/* */` e
      docstring Python. `textoDeCodigo` já faz isso; o item é provar que faz, com caso de autoteste
- [x] **Contraprova por reversão:** mude **um identificador** dentro de um arquivo que só deveria ter
      perdido comentário e exija que a ferramenta reprove nomeando-o. Verde que não sabe ficar vermelho
      não provou nada
- [x] **Linha de base gravada antes do primeiro comentário removido** — é o `antes` de tudo o que vem
      depois
- [x] **A contraprova é contra ARQUIVO REAL, não só fixture.** Fixture prova a regra; arquivo real prova
      que a regra alcança o arquivo. Exigência mínima: mutar **uma linha do último terço** de cada `.py`
      de `skills/` e de cada `.mjs` de `tools/` e a ferramenta reprovar nomeando-o. Cerca de comentário
      que abre e não fecha apaga tudo o que vem depois **em silêncio** — é a direção proibida, e a
      única forma de vê-la é mutar longe do começo do arquivo
- [x] **Exceção declarada, no formato de catraca** (mesmo desenho de `citation-baseline.json`): o Bloco
      BA registra a própria ferramenta em `run-all-selftests.mjs`, o BF conserta caminho **dentro** de
      dois `.py`, e o BG reescreve `init_repo.py` — três mudanças de código **autorizadas**, e a
      ferramenta hoje não tem como distingui-las de um acidente. Cada entrada nomeia **arquivo + bloco
      que autorizou + o que mudou**; a ferramenta imprime as autorizadas à parte e exige o conjunto
      **exato** — entrada que já não diverge REPROVA (exceção morta é o que a catraca existe para
      matar). Regravar a linha de base **não** é a saída: o cabeçalho da própria ferramenta declara que
      isso invalida a prova

> **Carry-over para a rodada do BB** *(não reabre o BA)*: a guarda de cerca aberta cobre a docstring
> Python e **não** cobre o bloco `/* */` da família JS — `linhasDeCodigo` devolve `cercaAberta` num caso
> e `null` no outro. Hoje a exposição é zero (0 arquivos de 156 com bloco aberto no fim, medido) e um
> bloco aberto introduzido durante a limpeza reprova sozinho, porque some linha que a referência tem —
> reproduzido. Mas guarda assimétrica é guarda que ninguém conferiu: feche a simetria junto do BB, com
> fixture próprio.

---

## Bloco BB — `tools/` e `bindings/`, as 89 citações que viajam ✅ **FECHADO** *(commit `4862bf3`, revisado e reproduzido)*

> São as que entram no projeto do usuário. `tools/` é copiado inteiro; `bindings/<b>/root` vira a raiz
> do projeto e `_template` vira o molde de módulo.

- [x] As **43 citações em `tools/`** e as **46 em `bindings/`** — comentário por comentário, pela regra
      deste plano. Não é varredura por palavra-chave: cada uma se lê e se decide
- [x] **O aviso permanece; a proveniência sai.** Onde a frase depende de uma medição, a **medição fica**
      (*"sem isto, `npm run test --workspaces` roda zero testes e sai 0"*); o **onde e quando ela foi
      feita, não**
- [x] **Cabeçalho de arquivo:** hoje vários abrem com *"Lei dona: … (plan-2.md Bloco S)"*. A **lei dona
      fica** — é ponteiro vivo para a doutrina que viaja junto. O **bloco de plano sai**
- [x] **Não invente resumo.** Comentário que perder a citação e ficar sem sentido é comentário cujo
      conteúdo estava só na citação — nesse caso ele **sai inteiro**, não vira paráfrase vaga
- [x] ⚠️ **Primeiro item do bloco: a exceção da catraca passa a carregar a IMPRESSÃO DIGITAL do código
      autorizado** *(defeito de desenho do revisor, medido na rodada BE)*. Hoje a autorização é **por
      arquivo**: com `verify-citations.mjs` e `run-all-selftests.mjs` na catraca, **qualquer** mudança de
      código neles passa em silêncio pelo resto da campanha — reproduzido, mutei a assinatura de
      `itemAplicaAoArquivo` e o `no-comments-diff` saiu **0**. Cada entrada guarda o hash de
      `textoDeCodigo` no momento da autorização: bate → autorizada; não bate com o hash **nem** com a
      referência → **REPROVA** como mudança nova; voltou a bater com a referência → exceção morta,
      reprova (já funciona)
- [x] `no-comments-diff` verde ao final deste bloco, contra a linha de base do BA
- [x] **`package.json` da raiz entra no escopo deste bloco** *(decisão do revisor, rodada BE)*. As chaves
      `"//verificar:citacoes:*"` são comentário por convenção — JSON não tem comentário, e essas duas
      moram **dentro de `scripts`**. Carregam arqueologia (*"Rodada AB / plan-3 Bloco AC"*, *"Inventario
      comeca vazio, e --antes fica verde por vacuidade ate…"*) e o `no-comments-diff` **não as alcança**
      (`.json` fica fora por desenho). Nenhum outro bloco as reivindicava
- [x] **A linha de base de citação do `plan-3.1` §AJ.0 é ENTRADA deste bloco.** `--depois-estrito`
      registra **200 achados em 50 arquivos** — nome antigo distintivo ainda citado. **48 deles morrem
      sozinhos** com a remoção do `apply-rename.mjs` (Bloco BE), então a superfície real aqui e no BC é
      **~152**. Citação morta é **ponteiro quebrado**, não arqueologia — mas mora na mesma linha que a
      arqueologia, e quem lê para tirar uma lê a outra no mesmo movimento
- [x] ⚠️ **Nem toda entrada da linha de base é resíduo.** Algumas são MENÇÃO DELIBERADA — o `§7.2` cita
      `rotaBase`, `lerTexto`, `envRequerido` como **exemplos do que o corte encontra**, e o
      `verify-citations.mjs` documenta o próprio mecanismo. **Essas sobrevivem.** Não zere a linha de
      base por zerar: cada entrada se decide, como todo o resto deste plano

---

## Bloco BC — `doutrina/`, e o ADR que vira convenção ✅ **FECHADO** *(commit `6107c2f`, revisado e reproduzido)*

> A doutrina é **copiada para dentro de cada projeto** como `specs/arquitetura/`. É a lei que o usuário
> lê, e hoje ela cita rodadas de um plano que ele não tem.

- [x] As **24 citações** nos seis documentos de doutrina, pela mesma regra
- [x] **As 10 lacunas declaradas do §7** — a lacuna **fica**, com a forma exata que escapa e a medição.
      A referência ao plano **sai**. Lacuna declarada continua sendo o padrão desta casa; o que muda é
      que ela para de depender de um documento externo para ser entendida
- [x] **O ADR-009 vira a convenção de nomenclatura deste template**, escrita no **presente**: *a árvore
      de arquivos é inglês; o conteúdo dela é português; `specs/arquitetura/` é a única exceção*. Com a
      tabela de fronteira item a item — que é o que o usuário precisa para decidir um caso novo — e
      **sem a narrativa de que houve uma migração**
- [x] **Os outros ADRs do template** recebem a mesma leitura: decisão e consequência, no presente. ADR
      é registro de **decisão**, não de **processo**
- [x] ⚠️ **A tabela de mapeamento do ADR-009 (`antigo→novo`) é o alvo natural deste bloco e some com
      ele** — ela existe para documentar uma migração que deixa de ser mencionada. Confirme que nada
      mais aponta para ela antes de removê-la

---

## Bloco BD — os nomes de caso, que são saída de ferramenta ✅ **FECHADO** *(commit `1571f91`, revisado e reproduzido)*

> **27 casos de `cases.mjs` se chamam pela rodada que os produziu**, e esse nome é o que aparece na
> saída do autoteste do gate — a primeira coisa que alguém lê quando o gate reprova.

```
hoje:   'N.2 forma 1 — tipo de retorno inline desvia o extrator antigo'
        'Bloco M — core/domain/ vazio ou ausente'
depois: 'tipo de retorno inline não desvia o extrator'
        'core/domain/ vazio ou ausente'
```

- [x] Os **27 nomes** passam a dizer **o que o caso prova**, não de onde veio
- [x] **O `contem:` e a asserção não mudam** — só o rótulo. Se algum caso perder a identidade ao perder
      o prefixo (dois casos com o mesmo nome), o nome estava carregando informação: reescreva o nome,
      não o caso
- [x] Autoteste do gate continua **126/126 · 126/126 · 122/122**, com os mesmos ids

---

## Bloco BE — o resíduo de campanha ✅ **FECHADO** *(`8cfd180` + `bea1ed8`, revisado e reproduzido)*

> Campanha encerrada (`plan-3.md`, Bloco AD fechado). O que ela deixou em `tests/` são **artefatos de
> processo**, não do template.

- [x] **Remover** `tests/apply-rename.mjs` (142 KB), `tests/rename-inventory.json` (47 KB) e
      `tests/rename-refusals.json` (1,16 MB). O git guarda o histórico, e é onde esse tipo de coisa deve
      ficar
- [x] **Fica o que tem uso corrente:** `template-self-test.mjs` (Bloco K), `verify-map.mjs`,
      `verify-citations.mjs`
- [x] ⚠️ **`verify-citations.mjs` consome o inventário.** Ou ele perde essa dependência e passa a
      verificar só o que resolve hoje, ou sai junto. **Decidir e registrar** — não deixar um verificador
      apontando para um arquivo removido, que é o defeito que este template inteiro existe para não ter
- [x] Conferir que nada em `tools/`, `package.json` ou hook chama o que foi removido

---

## Bloco BF — `skills/`, os ponteiros que sobraram *(dívida contada, não região desconhecida)* ✅ **APROVADO** *(revisado e reproduzido — aguardando commit)*

> **Não é arqueologia — é ponteiro quebrado ativo.** Onze arquivos de `skills/` ainda citam
> `ferramentas/`, `criar-modulo.mjs`, `core/dominio`, `--papel`. Quem seguir `padrao-python/SKILL.md` ou
> `test-api-contrato/SKILL.md` digita caminho que não existe — exatamente o que acontecia com o
> `meta-iniciar-repositorio` antes do `plan-3.1` §AF, onde **100% das instalações falhavam**.
>
> **Por que aqui e não em plano próprio:** o trabalho é o MESMO — ponteiro morto em prosa, lido linha a
> linha pela regra deste plano — e a rede que o cobra é a mesma: **21 das 200 entradas da linha de base
> do `--depois-estrito` já são de `skills/`**. É dívida contada, com arquivo e linha. Plano separado
> criaria uma segunda campanha para a mesma edição.
>
> ⚠️ **O que MUDA de escopo, e o documento tem de dizer:** os Blocos BA–BE tratam de
> `specs/_estrutura_modulos/` — o template. Este trata da **base que o entrega**. São árvores
> diferentes, e misturá-las em silêncio seria a fronteira arbitrária que o `plan-3.md` §AC matou.

- [x] ✅ **DECIDIDO PELO DONO: as skills são atualizadas.** Não viram lacuna declarada — instrução
      errada não se declara, se conserta.
- [x] Os **9 arquivos `.md`** — `padrao-escrita` (SKILL + 2 references), `padrao-python/SKILL.md`,
      `test-api-contrato` (SKILL + 2 references), `code-diagnostico/SKILL.md`,
      `code-auditoria-padrao/references/workflow.md`. Prosa: mesma regra deste plano
- [x] ⚠️ **Os 2 arquivos `.py` são CÓDIGO, não prosa** — `git-verificacao-commit/scripts/gerar_config.py`
      e `meta-verificacao-base/scripts/ponteiros.py`. Caminho errado ali não é documentação
      desatualizada: é **ferramenta apontando para o nada**. Confira se o `--autoteste` de cada um
      cobre o caminho corrigido; se não cobrir, o conserto é cego e precisa de caso
- [x] **`--depois-estrito` sem nenhuma entrada de `skills/`** ao final — as 21 drenadas, e a linha de
      base regravada com o número novo declarado

---

## Bloco BH — `tests/`, a máquina que construiu a campanha *(escopo que faltava, achado na rodada BE)*

> **Nenhum bloco reivindicava a prosa de `tests/`** — o executor levantou isso e estava certo. BB é
> `tools/` + `bindings/`, BC é `doutrina/`, BD é `cases.mjs`, BF é `skills/`. `tests/` ficou de fora, e é
> onde a arqueologia é mais densa: **88 marcas** (*"Bloco X"*, `plan-*.md`, *"Rodada N"*) contra 182 em
> `tools/` + `bindings/` — **um terço da superfície inteira**, invisível no plano até agora.
>
> **Por que importa mesmo não viajando.** `tests/` não é copiado para o projeto gerado (medido:
> `create-project.mjs` não o cita). Mas é o que o **mantenedor** do template lê, e a regra deste plano
> não faz distinção de público: *legível por quem nunca viu este repositório*.

- [ ] As **88 marcas** em `tests/*.mjs`, pela regra do plano — `template-self-test.mjs` 40 ·
      `verify-citations.mjs` 27 · `no-comments-diff.mjs` 13 · `run-all-selftests.mjs` 5 · `verify-map.mjs` 3
- [ ] ⚠️ **A comparação com precedente apagado morre junto.** Sobraram 9 menções do tipo *"mesma
      disciplina de `rename-refusals.json` (Bloco AI, `apply-rename.mjs`)"* — não são ponteiro quebrado
      (não afirmam onde algo mora hoje), mas comparam o desenho a um arquivo que **o Bloco BE apagou**.
      Para quem nunca viu o repositório, é referência a nada. **O que a frase ensina fica; o precedente
      sai** — *"começa vazia e cresce só por decisão explícita"* é a carga, *"igual ao `rename-refusals`"*
      não é
- [ ] **O instrumento deste plano é o caso mais irônico e não escapa:** `no-comments-diff.mjs` nasceu
      nesta campanha e já carrega 13 marcas de *"Bloco BA"*. Ele se limpa como qualquer outro
- [ ] `no-comments-diff` verde ao final do bloco — com `verify-citations.mjs` e `run-all-selftests.mjs`
      cobertos pela impressão digital do Bloco BB, **não** pela autorização em branco de hoje

---

## Bloco BI — o manual, e os exemplos da lei *(achado na rodada BF)* ✅ **APROVADO** *(revisado e reproduzido — aguardando commit)*

> **O `README.md` do template está inteiro no vocabulário de antes do rename.** É o primeiro documento que
> alguém abre, e **todo comando dele falha**: `node ferramentas/criar-projeto.mjs`, `ferramentas/criar-modulo.mjs`,
> `ferramentas/gate/validar.mjs --todos`, `ferramentas/gate/testes/executar.mjs`, e **dois links markdown para
> `ferramentas/`**, pasta que não existe. São **13 entradas na linha de base** — a maior concentração das 131.
>
> **A lei ensina chave de manifesto que o gate rejeita:** `01-modulo.md:251-252` mostra `"consome"`,
> `"modulo"`, `"contrato"`, `"porQue"` num exemplo `jsonc`, e `04-regras.md:297` repete `"modulo"`. Isso
> **vira o `specs/arquitetura/` de todo projeto gerado**.
>
> **Por que nada pegou.** O `--depois-estrito` MEDIU e a catraca ACEITOU, porque nenhum bloco reivindicava
> o `README.md` e porque as três varreduras do BC (citação de plano, id nu, tempo verbal) **não alcançam
> exemplo em JSON**: `distintivo()` devolve `false` para `consome`, `modulo`, `contrato` — o falso negativo
> declarado do §7.2. Lacuna de escopo do plano, minha, não do executor.

- [x] `specs/_estrutura_modulos/README.md` inteiro na forma atual — **cada comando RODADO**, não relido.
      Comando de manual que ninguém executa é exatamente o `autoteste:template` outra vez
- [x] Os **dois links markdown** para `ferramentas/` resolvendo
- [x] Os exemplos de manifesto de `doutrina/01-modulo.md` e `04-regras.md` **conferidos contra
      `module.schema.json`**, chave por chave — a fonte é o schema, não a memória
- [x] **A classe, não os sítios:** todo exemplo `json`/`jsonc` da doutrina e dos `README.md` validado
      contra o schema que o gate usa. Chave que o schema não conhece reprova
- [x] A linha de base cai de **131** para o que sobrar, com o número declarado e as 13 do `README.md`
      **zeradas** — dívida que este bloco existe para pagar, não para redeclarar

---

## Bloco BJ — o rename que passou por cima do código *(achado na rodada BI — é correção, não limpeza)*

> **A campanha de renomeação reescreveu TEXTO em arquivos cujo CÓDIGO nunca foi migrado.** Não é
> arqueologia: são instruções e chaves que **falham hoje**, e que **viajam no projeto do usuário**. Os dois
> instrumentos são estruturalmente cegos a isso — `.json` fica fora do `no-comments-diff` por desenho, e
> `distintivo('modulo')` é `false`, então o `--depois-estrito` não enxerga chave curta em português.

**Os dois sítios já medidos, e a mesma causa raiz nos dois:**

- **`bindings/python/root/verificar.py`** — o inventário tem `verificar → verify` como **`simbolo`**, e
  `itemAplicaAoArquivo` aplica `simbolo` dentro de `bindings/`. O rename reescreveu as strings de uso do
  arquivo, e **o arquivo nunca foi renomeado** (não existe item `arquivo` para ele). Resultado: **7
  ocorrências** de `python verify.py` dentro de um arquivo chamado `verificar.py` — docstring, linhas de
  uso e a **mensagem de erro de runtime da linha 213**. Mais `pyproject.toml:44` e
  `_template/api/src/config.py:106`. O `README.md:92` diz `python verificar.py`, que é o nome real.
- **`config/conformidade.json` nos TRÊS bindings** — `_exemplo` diz `"module": "legado"`, e
  `tools/gate/validate.mjs:24` lê `e.modulo === a.modulo`. O item `modulo → module` é do tipo **`chave`**,
  e `chave` é aplicado a **todo arquivo** sem filtro de caminho. Quem copiar o `_exemplo` para `excecoes`
  escreve uma exceção que **o gate silenciosamente ignora** — falso positivo de conformidade, a direção
  proibida. A doutrina (`04-regras.md:297`) já está **certa** e bate com o código; é o JSON que ficou errado.

- [ ] **Decida o `verificar.py` e declare:** ou o arquivo passa a se chamar `verify.py` (e o `README.md:92`,
      o `pyproject.toml` e o `create-project` acompanham), ou as 7 strings voltam a dizer `verificar.py`.
      A régua é o ADR-009 (a **árvore** é inglês). Escolha uma e aplique inteira — meia migração é o que
      criou o defeito
- [ ] **`conformidade.json` ×3:** `_exemplo` bate com o que `validate.mjs` LÊ. A fonte é o código, não o
      schema (não há schema formal para este arquivo)
- [ ] ⚠️ **A CLASSE, não os dois sítios.** Para **cada** item de tipo `chave` do `citation-terms.json`:
      o nome novo está no dado e o **leitor** ainda usa o antigo? Varra os `config/*.json` que viajam e o
      código que os lê. Para cada item de tipo `simbolo` cujo texto casa um **nome de arquivo**: o arquivo
      foi renomeado junto? Traga a tabela — item | onde o texto mudou | o que o código lê | veredito
- [ ] **Contraprova por execução, não por leitura:** escreva a exceção do `_exemplo` num
      `conformidade.json` de projeto gerado e prove que o gate **passa a perdoar** a regra. Antes do
      conserto ela é ignorada; depois, vale. Sem isso, o conserto é alegado
- [ ] `no-comments-diff` verde · gate ×3 · `autoteste:template` 3/3 — nada disso pode mexer em regra

---

## Bloco BG — o instalador que ADIVINHA *(o único bloco FUNCIONAL deste plano)*

> **Achado no `plan-3.1` §AF, conserto segurado de propósito para decisão do dono.**
> `init_repo.py:criar_modulos()` tem dois chutes no modo em lote:
>
> ```python
> papel = "conector" if modulo == "conector" else "dominio"   # adivinha o papel pelo NOME
> [..., "--role", papel]                                      # nunca passa --sem-artefato
> ```
>
> `gateway-pagamentos` sai com `role: dominio` em silêncio, e **todo** módulo criado em lote sai com
> `generatesArtifact: true` — inclusive um conector, que por natureza não publica artefato. A skill
> `code-modulo` **pergunta** as duas coisas e acerta; o atalho `--modulos a b c` chuta.
>
> **É o mesmo defeito que este ecossistema mata em todo lugar: inferência silenciosa em vez de
> declaração.** E está na ferramenta que dá o primeiro passo de todo projeto novo.

- [x] ✅ **DECIDIDO PELO DONO: opção (c) — declaração na própria linha.** *"Não podemos depender de
      chutes."* As opções (a) *perguntar* e (b) *declarar o default e não mudar* estão **descartadas**:
      a primeira mata o atalho (que existe para rodar dentro de script, sem interação), a segunda
      mantém o defeito de pé com uma etiqueta

- [ ] **A forma:** `--modulos <id>:<role>[:artefato]`, e o **sufixo de papel é OBRIGATÓRIO**.

      ```
      node init_repo.py --modulos catalogo:domain hub:connector pagamentos:gateway
      ```

      Sem sufixo, **erro** com a forma correta na mensagem — nunca um default silencioso. *Default
      documentado ainda é escolha feita por quem não estava lá; a diferença entre chute e declaração é
      quem digitou.*
- [ ] **O terceiro token só existe para `domain`, e é o único ponto ambíguo.** `connector` e `gateway`
      **não geram artefato por arquitetura**, não por convenção: a doutrina (§) descreve o conector como
      quem **agrega o que os outros publicam**, consumindo apenas `/health`, `/meta` e `/resumo` — quem
      agrega não publica. Declarar `:artefato` num deles **reprova**, com a razão na mensagem.
      Para `domain`, ausência do token = **sem artefato**: é a direção conservadora, porque módulo que
      ganha o esqueleto depois não perde nada, e módulo que nasce com esqueleto morto carrega
      `core/engine`, `core/templates`, `database/` e uma **migração para tabela que nunca usa**
- [ ] **A ORDEM deixa de ser adivinhada junto.** Hoje `sorted(modulos, key=lambda m: m == "conector")`
      põe por último o módulo **chamado** `conector` — o agregador tem de vir depois dos agregados.
      Passa a ordenar **pelo papel declarado**: `connector` por último. Mesma intenção, zero inferência

### BG.1 — o módulo de agregação, e por que o nome dele é parte do problema

> **O agregador é hoje identificado por se chamar `conector`.** Isso não é só a mecânica do chute — é um
> **nome que descreve o papel em vez da função**, e é o que torna a inferência por nome tentadora. Um
> módulo chamado `conector` com `role: connector` é como uma classe chamada `Classe`: não diz o que faz.
>
> E depois da campanha de idioma há uma segunda estranheza visível no comando: o papel virou `connector`
> (inglês, decisão 8 reinterpretada no `plan-3.md` §AD.3) enquanto o id seguiu `conector` (português,
> como todo id e rota). `conector:connector` é literalmente o mesmo conceito duas vezes, em duas línguas.

- [ ] **O instalador para de criar um módulo agregador por conta própria.** Quem quiser um declara
      `<id>:connector`. Nenhum módulo é inventado por default — **inventar módulo é a forma mais cara de
      chute**, porque o usuário herda uma pasta que ele não pediu e não sabe para que serve
- [ ] ✅ **DECIDIDO PELO DONO: o id sugerido é `hub`.** A doutrina descreve a função — monta o menu a
      partir de `navigation` e soma `/resumo` **sem lista fixa** —, e `hub` a nomeia:

      ```
      conector:connector   →  "o conector, que é conector"
      hub:connector        →  "o hub, que agrega"
      ```

      **E `hub` tem uma propriedade que os outros candidatos não tinham:** é a mesma palavra em
      português e em inglês. Ela não reabre a fronteira de idioma em lugar nenhum — nem no id (que é
      vocabulário do projeto, português) nem na leitura de quem chega de fora
- [ ] **Atualize os exemplos junto**, senão a mudança não chega a ninguém: `init_repo.py` §uso,
      `meta-iniciar-repositorio/SKILL.md`, `code-modulo` (SKILL + `examples.md`), e a doutrina onde ela
      cita o agregador por nome. **É a mesma classe de ponteiro morto do Bloco BF** — troca de nome sem
      troca de exemplo é o defeito que este plano inteiro existe para não deixar passar
- [ ] ⚠️ **`connector` como VALOR do enum não muda** — é vocabulário de arquitetura e está no schema.
      O que muda é o **id sugerido**, que é vocabulário do projeto. *O papel descreve a categoria; o id
      descreve a coisa.*
- [ ] Depois de decidido: contraprova por reversão — um módulo com papel não-inferível pelo nome
      (`gateway-pagamentos`) sai com o papel CERTO, e o gate concorda
- [ ] ⚠️ **Este bloco é declaradamente FUNCIONAL e fica FORA do `no-comments-diff`** (ver o critério de
      aceite). A prova dele é outra: **reexecução do §AF** — instalação limpa pela skill, do zero, até o
      primeiro commit verde
- [ ] **A divergência de profundidade entre as duas entrevistas fica REGISTRADA, não consertada:**
      `meta-iniciar-repositorio` monta o equivalente ao Fluxo A do `code-modulo` mas não pergunta
      topologia de schema, `ui.modo` nem idioma — decisões que o `code-modulo` trata como ADR. **Não é
      defeito** (o handoff já declara a pendência de registrar ADRs); é divergência estrutural entre
      dois caminhos para o mesmo resultado. Vira pergunta no `plan-3.0` ou fica declarada — **decisão do
      dono, e não bloqueia produção**

---

## Ordem de dependência

```
BA   a ferramenta de aceite      PRIMEIRO, e com LINHA DE BASE — escrita depois, ela
                                 não tem contra o que comparar

BB   tools/ e bindings/          o que viaja para o projeto do usuário
BC   doutrina/ e o ADR           idem — é a lei que ele lê
BD   nomes de caso               saída de ferramenta, independente dos outros
BE   o resíduo de campanha       independente · tem uma decisão dentro (verify-citations)
BF   skills/                     a BASE que entrega o template, não o template. Depois do
                                 BE: 48 entradas da linha de base morrem lá
BG   o instalador que adivinha   FUNCIONAL, fora do no-comments-diff · decisões TOMADAS
                                 (opção c) · prova é a reexecução do §AF
BG.1 o módulo de agregação       dentro do BG: para de ser criado por default, e o nome
                                 sugerido deixa de ser `conector`

═══ meta: um template que se explica para quem o recebe, sem contar como foi feito ═══
```

**Este plano roda por ÚLTIMO na família 3.** O `plan-3.1.md` está FECHADO (AF `3132c2c` · AG `1c805d7` ·
AH `3ebed84` · AJ `9128037`+`78db148`), e o que ele escreveu já nasceu na regra deste plano.

> **⚠️ O ESCOPO DESTE PLANO CRESCEU, e o documento diz onde.** Os Blocos **BA–BE** tratam do
> **template** (`specs/_estrutura_modulos/`) e não mudam uma linha executável. Os Blocos **BF** e **BG**
> tratam da **base que entrega o template** — e o **BG muda comportamento**. São coisas diferentes com
> provas diferentes, e é por isso que estão separados em vez de diluídos.

---

## Critério de aceite

- [ ] **`no-comments-diff` verde** contra a linha de base do BA, **para os Blocos BA–BF** — a prova de
      que **nenhuma linha de código executável mudou**. É o item que sustenta todos os outros.
      **O Bloco BG está declaradamente FORA**: ele muda comportamento por decisão, e a prova dele é a
      reexecução do `plan-3.1` §AF (instalação limpa pela skill, do zero, até o primeiro commit verde).
      *Exceção declarada é aceitável; exceção diluída no critério não é*
- [ ] Autoteste do gate **126/126 · 126/126 · 122/122**, com os **mesmos ids** — este é o número
      DEPOIS do `plan-3.1` §AH, que acrescentou `mapeador-nomenclatura` ao catálogo (75 regras).
      *Critério com número velho é a forma mais silenciosa de aceitar regressão*
- [ ] **Bloco K 13/13 nos três bindings**
- [ ] ⚠️ **O grep é piso, não teto** *(corrigido na rodada BB, onde o critério greppável foi satisfeito
      e a regra do plano não foi aplicada)*. Três formas, e as duas últimas nenhum grep de citação pega:
      **(a)** `plan-*.md` e *"Bloco \<letra\>"*; **(b)** o **id de bloco NU** — `I.1`, `B.3`, `N.1`,
      `N.2`, `N.3`, `I.2`, `J.2`, `G.2` — que cita plano sem dizer *"Bloco"* nem *"plan-"*; **(c)** a
      **narração em passado sem citação nenhuma**: *"virava"*, *"nunca chegava"*, *"a regra ficava
      limpa"*, *"o extrator antigo"*, *"a regra estreita anterior deixava passar"*. A (c) é a regra
      deste plano e só se cobra lendo. **Cuidado com o falso positivo:** passado que descreve o
      **diff do usuário** fica — *"campo passou a ser OBRIGATORIO na requisicao"*
      (`contract-compatible.mjs`) é mensagem de runtime sobre o contrato dele, não história do repo
- [ ] Zero ocorrência de `plan-*.md` e de *"Bloco \<letra\>"* dentro de `specs/_estrutura_modulos/` —
      **medido, não afirmado**
- [ ] **Zero ponteiro morto em `skills/`** (Bloco BF), medido pelo `--depois-estrito`: nenhuma das 21
      entradas de `skills/` sobrevive na linha de base
- [ ] Um projeto gerado do zero: `verify` → `build` → `lint` → **primeiro commit**, e a `specs/arquitetura/`
      dele **não cita documento nenhum que ele não tenha**
- [ ] **`--depois-estrito` com a linha de base reduzida ao que é menção deliberada** — e o número final
      declarado. É a prova de que os ponteiros mortos foram drenados, não silenciados
- [ ] **`npm run autoteste:tudo` 13/13 e `npm run typecheck:tools` limpo** — as duas redes que o
      `plan-3.1` §AJ acrescentou. E rode-as **pelo comando**, não chamando o arquivo direto: foi
      exatamente essa substituição que manteve o `npm run autoteste:template` morto por seis rodadas

---

## Fora deste plano

- **Traduzir comentário ou doutrina.** Continuam em português (`plan-3.md`, Bloco AC decisão 2).
- **Reescrever comentário que já está no presente e instrui.** Se passa na regra, não se toca — reescrita
  gratuita é risco sem ganho, e cada byte tocado é um byte que o `no-comments-diff` tem de julgar.
- **Os planos da raiz** (`plan.md`, `plan-2*`, `plan-3*`) e o `funcionamento-esperado.md`. São da base,
  não do template, e **registro histórico não se limpa** — é a decisão já tomada no `plan-3.md` §AD.5.
- **Qualquer mudança de comportamento NÃO PREVISTA**, inclusive "melhoria óbvia" achada no caminho.
  Achou? **Registra e segue.** Os Blocos BA–BF têm uma propriedade que vale mais que qualquer conserto
  oportunista: **são reversíveis em bloco, porque não mudam código** — e o `no-comments-diff` prova isso
  por igualdade, não por confiança.
  **A única mudança de comportamento autorizada é o Bloco BG**, e ela é autorizada porque foi decidida
  pelo dono ANTES de começar, está isolada num bloco próprio, e tem prova própria. *Conserto decidido
  antes é escopo; conserto decidido no caminho é escopo que ninguém revisou.*
