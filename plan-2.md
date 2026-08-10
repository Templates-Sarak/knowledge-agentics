# Plano 2 — o template como padrão de referência

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **O que este plano é.** O `plan.md` respondeu *"o catálogo de regras está completo?"* e fechou com
> **74 regras, 74 com caso**. Este responde outra pergunta: **"o padrão se sustenta quando o template
> é usado N vezes?"** — porque o template deixou de ser um exercício e passou a ser o esqueleto de
> referência da maioria dos projetos.
>
> **O que o template representa**, nas palavras do dono: importado uma vez, cria o início do projeto;
> daí em diante todo módulo novo sai do **mesmo molde**, e todos têm a **mesma estrutura**; o template
> **se auto-verifica** contra as próprias regras para que o padrão não se perca; entre essas regras,
> **segurança é a classe que não pode ter furo** — chave nunca exposta, log nunca com dado sensível,
> segredo nunca fora do `.env`. O padrão aponta o erro; o projeto fica seguro **porque o padrão não
> deixa sair dele**, não porque alguém lembrou.

**Regra permanente deste plano:** todo bloco que toca esqueleto ou ferramenta só fecha com o **Bloco K
verde nos três bindings**. *Verificação que não roda sobre o template não conta como verificação* — é a
lei 9 (declaração sem verificador) aplicada ao próprio template, e é o defeito que este plano existe
para matar.

> **Este documento é executável de ponta a ponta.** Todas as decisões de desenho estão **fechadas** —
> nenhum item diz "decidir". Onde havia duas saídas, a escolhida está marcada **DECIDIDO** e a recusada
> fica registrada com o motivo, no formato dos blocos cancelados do `plan.md`. Se o executor discordar de
> uma decisão, ele **para e pergunta** — não escolhe sozinho.

> **Quem marca ITEM é o executor; quem marca BLOCO é o revisor.** O executor marca `- [x]` no que
> executou e reporta. O status de **bloco** — o `✅ FECHADO` do diagrama, a tabela de Estado, a linha
> de resumo — só o revisor escreve, depois de conferir **no disco**. E um bloco fecha quando **todos**
> os itens dele fecharam, **inclusive os que entraram depois que ele começou**.
>
> *Por que a regra existe:* na rodada N.3/N.4 a subseção N.2.1 estava no HEAD recebido pelo executor,
> com item aberto e menção própria no diagrama; ela foi pulada, a menção foi **removida** da linha do
> diagrama e o bloco foi marcado `✅ FECHADO` — enquanto o defeito continuava reproduzindo. Relatório
> errado se corrige lendo o disco; **edição no documento que governa o trabalho persiste**, e o que
> some é justamente o rastro do que ficou aberto. É o *"verde indistinguível de não verificou"* deste
> plano, aplicado ao próprio plano.

Continua vigente a regra permanente do `plan.md`: **regra nova exige caso próprio** em
`ferramentas/gate/testes/casos.mjs` e linha no catálogo (§4.x), mais o limite conhecido no §7.2.

---

## Estado — medido, com o comando ao lado

| Métrica | Valor | Confira com |
|---|---|---|
| Regras no catálogo | **74**, todas com caso | `node ferramentas/gate/testes/executar.mjs --binding <b>` |
| Autoteste do gate | `112/112` (TS) · `112/112` (JS) · `108/108` (PY) *(era `93/93·93/93·89/89` antes do Bloco K — +19 casos ao longo de K.0/L.3/N.1/N.2/N.3, nenhuma regra nova)* | idem *(o `plan.md` §Estado ainda diz `92/92·92/92·88/88` — deriva, Bloco R)* |
| **Projeto novo passa em `verificar`?** | **SIM — nos três bindings** (Bloco K fechado) | `npm run autoteste:template` |
| **Projeto novo passa em `ci:dependencias`?** | **NÃO — 2 critical + 1 high** | Bloco P |
| **`build` seguido de `lint`?** | **SIM** — furo do dist consertado (Bloco L) | `npm run autoteste:template` |
| Módulo pode perder `core/` inteiro e ficar verde? | **SIM** | Bloco M |
| `GET /meta` público devolve o manifesto inteiro? | **NÃO — corrigido (N.1)** | Bloco N |
| `paraMeta`/`paraColecao` visíveis a `projecao-contrato`/`sensivel-em-saida`? | **SIM — corrigido (N.2)**. Antes: invisíveis (âncora de nome estreita) | Bloco N |
| `sensivel-em-saida` reconhece `logging`/`warning`/`critical`/`exception`? | **SIM — corrigido (N.3)**. Antes: só `logger`/`log` com 4 verbos | Bloco N |
| Bloco N (segurança) — itens marcados pelo executor | N.1 ✓ · N.2 ✓ · N.3 ✓ · N.4 ✓ · N.2.1 ✓ · N.2.2 ✓ (todos os itens da seção marcados; status do BLOCO é do revisor) | `node ferramentas/gate/testes/executar.mjs --binding <b>` |
| `criar-modulo` com flag produz módulo conforme? | **NÃO — nas duas flags** | Bloco O |
| Extração (copiar a pasta, nenhum import muda) | **funciona** — `tsc` 0, `24/24` verdes | `--extracao` + cópia manual |
| Boot, build, migrations, gate | **funcionam** | `npm run iniciar · build · validar` |

**Meta ao fim de todos os blocos:** `criar-projeto` → `criar-modulo` → **`verificar` verde**, nos três
bindings, sem passo manual além de preencher valores no `.env` — e essa afirmação **provada por
máquina a cada commit da base**, não conferida de memória.

---

## As três decisões tomadas antes de escrever

### D1 — versão de dependência é **fixa**, e o envelhecimento vira sinal

**Decidido: pin exato no esqueleto** (`"vitest": "4.1.10"`, sem `^`). Para um template de referência,
versão de dependência é **decisão do padrão, não do relógio**: dois projetos gerados com seis meses de
distância recebem a mesma cadeia, e quando divergirem foi porque alguém decidiu e datou.

**Sem lockfile no template**, e o motivo é medido, não estético: o `package.json` da raiz declara
`workspaces: ["modulos/[a-z]*"]`, que **não existem** na hora da cópia — um lock copiado nasce
descrevendo uma árvore que não é a do destino. O lock é do **projeto**, gerado no `npm install` do
nascimento e commitado por ele.

**Como se prossegue quando envelhecer** — o template descobre sozinho:

```
Bloco K roda na base, em agenda, e inclui ci:dependencias CONTRA O PRÓPRIO TEMPLATE
  → CVE novo deixa o `knowledge-agentics` vermelho, nunca o projeto de quem já usou
  → npm outdated / npm audit → sobe a versão fixada → K nos 3 bindings
      verde    → commit + linha datada no ADR da cadeia
      vermelho → a versão NÃO entra, e o motivo fica escrito
```

**É o K que torna o bump possível.** Hoje ninguém sobe `vitest 2 → 4` porque nada prova que o template
continua funcionando depois — e foi exatamente por isso que ele ficou dois majors atrás e passou a
nascer com dois *critical*. Sem verificador, a única atualização segura é nenhuma.

**Dois limites, declarados e não escondidos:**
- pin exato congela o **topo**, não os transitivos (`esbuild` chega pelo `vite`); quem congela
  transitivo é o **lock do projeto**, e é por isso que ele é do projeto;
- **o template nunca empurra atualização para projeto já criado.** Projeto nascido é dono da própria
  cadeia, e quem avisa lá é o `ci:dependencias` dele. A promessa é *"projeto novo nasce limpo"*, não
  *"projeto antigo se mantém limpo"* — prometer o segundo exigiria o template ser dependência, e ele é
  **cópia** por decisão de arquitetura (ADR-005 e §2 do `00-arquitetura.md`).

*Alternativa recusada:* manter `^` e versionar lockfile no template. Cai no problema dos workspaces
acima, e devolve ao relógio uma decisão que é do padrão.

### D2 — o que "nasce verde" inclui no K

`verificar` (gate → env → formato → lint → tipos → testes) **mais** `build` **mais** `lint` **depois**
do build — porque o furo do Bloco L só aparece nessa ordem.

**`ci:dependencias` fica fora do K até o Bloco P fechar.** Incluí-lo antes faria o K nascer vermelho por
CVE de terceiro, e portão que nasce vermelho é portão que se aprende a ignorar. Quando P fechar, ele
entra — e passa a ser o sensor de envelhecimento da D1.

**Princípio geral, do qual o parágrafo acima é um caso particular: o K cresce com os blocos.** Cada
bloco que amplia a superfície verificada (módulo com flag, `ci:dependencias`, o que vier depois)
**estende** o gerador do K dentro do próprio bloco que a introduziu — nunca o K tenta, desde o
início, cobrir uma superfície que ainda não foi consertada. O critério do K é sempre **"verde para o
que já foi consertado"**, nunca **"verde para tudo que falta"**: um K que nascesse cobrindo
combinações de flag ainda quebradas (Bloco O) ao mesmo tempo que cobra o formato/lint ainda quebrado
(Bloco L) misturaria dois vermelhos na mesma contraprova — revertendo o conserto de um bloco, o outro
continuaria vermelho por razão diferente, e a contraprova deixaria de provar o que fica reprovando.

### D3 — onde mora cada verificação

Duas coisas soam iguais e são opostas. O teste que as separa é **quem é o consumidor**:

| | "o projeto gerado nasce verde" | "este módulo não derivou do molde" |
|---|---|---|
| Precisa de | **gerar** um projeto do zero | **ler** um módulo que já existe |
| Consumidor | quem mantém o template | quem escreve módulo, todo dia, em todo projeto |
| Roda | na **base**, antes de commitar mudança no template | no **gate**, em todo `verificar`/pre-commit |
| Vira | script de autoteste (**Bloco K**) | **regra do catálogo** (**Bloco M**) |

**A primeira NÃO pode viajar, e o precedente é medido:** `criar-projeto.mjs:92` copia **`ferramentas/`
inteiro** para dentro do projeto. Foi exatamente assim que a **F.2d.1** aconteceu — as fixtures do
`ci-seguranca` viajaram e faziam todo projeto novo nascer com o scanner vermelho. Por isso o autoteste
do template mora **fora de `ferramentas/`**: `specs/_estrutura_modulos/testes/`, com o script no
`package.json` da base. Um projeto gerado não gera projetos; o script ali seria peso sem consumidor.

**A segunda TEM que viajar:** ela é sobre o projeto do cliente ao longo do tempo — é literalmente
*"todos os módulos com a mesma estrutura"* —, e regra de gate já viaja com o módulo extraído.

### D4 — as quatro decisões de bloco, fechadas

Onde havia duas saídas, a escolhida está **DECIDIDO** dentro do bloco, com a recusada e o motivo ao
lado. Índice, para o executor não caçar:

| Onde | Decidido | Recusada |
|---|---|---|
| **N.1** | `saida-crua` ancora na **borda**, duas metades: `.json(<identificador>)` acusa sempre em TS/JS · `return <identificador>` **dentro de handler `@router.<verbo>`** no Python · o **mapeador** mantém o vocabulário fechado. **Sem lista de isentos** | *(1)* acrescentar `manifesto` ao vocabulário fechado (*conserta este caso, deixa o próximo passar*) · *(2)* inverter as duas metades sem âncora de borda (*medido: 14 isenções no molde conforme*) |
| **S** | `storage` e `notificador` **implementados**; `fila` **sai do vocabulário**; schemas **derivados** de fonte única | regra de raiz comparando os três (*impedir é melhor que acusar*) |
| **O** | **podar** as duas flags (`--sem-artefato` e `--sem-web`) | aposentar as flags |
| **R.2** | `schema-manifesto` dono da **forma**; `manifesto` só do **relacional** | manter o par declarado |

**Uma delas tem critério de reversão escrito** (N.1: se a regra precisar de lista de isentos, a âncora
está errada — ver a linha do `saida-crua` no `04-regras.md` §7.2). As outras três são definitivas.

> **Citação é por `§`, nunca por número de linha.** A doutrina não usa número de linha em lugar nenhum
> (`grep -rn "linha [0-9]\{2,\}" doutrina/*.md` → zero), e este plano segue a mesma convenção: a
> primeira tentativa desta linha apontava para "linha 381", que era **outra regra** — e apodreceu antes
> mesmo do commit. Ponteiro que envelhece em silêncio é a família de defeito que o `ponteiros.py` da
> base existe para pegar.

---

## Bloco K — o template se verifica

> **O defeito, e é o de maior alavanca do plano inteiro.** O autoteste prova o **gate**: muta o molde e
> confere ids. **Nada prova o esqueleto.** O template tem 74 regras, sete ferramentas com `--autoteste`
> próprio e três autotestes verdes — e **nunca foi medido se o projeto que ele gera passa na cadeia que
> ele mesmo prescreve**. Passa não: reprova nos três bindings, no passo 4 das instruções que a própria
> `criar-projeto.mjs` imprime.
>
> Enquanto o K não existir, **todo bloco futuro reintroduz o Bloco L** — foi o que aconteceu entre a A.1
> (que reformatou os moldes) e a F.2e/F.2f/F.2g (que escreveram os arquivos novos e não os conferiu).

- [x] **`specs/_estrutura_modulos/testes/autoteste-template.mjs`** — fora de `ferramentas/` (D3). Para
      cada binding: gera projeto em pasta temporária, cria **um módulo padrão, sem flag**, roda
      `verificar` + `build` + `lint`, e exige **verde**. **O K cresce com os blocos**: as
      combinações `--sem-artefato`/`--sem-web` que o Bloco O conserta entram como **extensão** deste
      gerador **dentro do próprio Bloco O** — essa extensão é aceite do O, não do K (ver D2)
- [x] **Núcleo puro separado da casca**, no precedente do `spec.mjs`/`afetados.mjs`: a decisão
      (que passos rodar, como classificar a saída) é pura e testável; **um** ponto executa processo
- [x] **Zero `shell: true`** — a lição da F.2a.1 vale aqui em dobro, porque o script recebe caminho de
      pasta temporária. Entrypoint resolvido por `bin` do manifesto + `process.execPath`;
      `<python> -m <ferramenta>` para ruff/mypy/pytest
- [x] **As três formas de "não rodou" reprovam** — `error`, `status === null`, `status !== 0`. Nenhuma
      vira `ok`. Ferramenta ausente **reprova** (lei 7): o K só é verde se mediu
- [x] **Limpeza garantida**, e a falha de limpeza **não** mascara o resultado: pasta temporária removida
      no fim, e o exit code é o da verificação, nunca o da faxina
- [x] **Script no `package.json` da base** (`npm run autoteste:template`) + **workflow em agenda** no
      `knowledge-agentics` — é o sensor de envelhecimento da D1
- [x] **Travado por máquina:** revertendo qualquer conserto do Bloco L, o K **reprova** e nomeia o
      arquivo. Sem essa contraprova, "K verde" é indistinguível de "K não leu nada" — a mesma exigência
      que a I.1 se impôs

### K.0 — a sequência, porque ela é circular e o executor precisa saber

**O K nasce VERMELHO, de propósito.** O critério dele é *"os três bindings nascem verdes"*, e eles só
ficam verdes depois do Bloco L. A ordem é:

```
1. escrever o K          → ele reprova, nomeando os arquivos do L      ← ESTE é o aceite do K
2. consertar o L         → o K vira verde sem que ninguém toque no K   ← ESTE é o aceite do L
3. reverter um conserto  → o K reprova de novo, no mesmo arquivo       ← a contraprova
```

**K vermelho no passo 1 é sucesso, não falha.** Um K que nascesse verde antes do L estaria provando que
não leu nada — a mesma exigência de contraprova que a I.1 se impôs (*"sem a contraprova, 0 erros seria
indistinguível de não foi lido"*). O executor **não conserta o L para fazer o K passar**: são dois
aceites, em dois commits.

**Executado — os três passos, medidos:**
1. K escrito → reprovou nomeando `scripts/migrations.mjs` e `src/composicao.ts`/`.js` (TS e JS) —
   exatamente os arquivos que a A.1 do `plan.md` já tinha achado fora de formato.
2. Bloco L consertado (L.1 + L.2) → `npm run autoteste:template` foi a **3/3 bindings verdes** sem
   tocar no K.
3. Contraprova: revertido o conserto do L.2 (`gerar-config-lint.mjs`, ignore do `dist/` sem o
   prefixo `**/`) → o TS voltou a reprovar com os mesmos 209 problemas do bundle minificado.
   Restaurado, voltou a verde.

### K.1 — o custo, medido antes de escrever

Era o risco real do bloco — autoteste de minutos é autoteste desativado em duas semanas. **Medido num
projeto gerado, cache do npm morno:**

| Passo | Custo |
|---|---|
| `npm install --prefer-offline --no-audit --no-fund` | **10 s** (144 MB) |
| gate + env | 2 s |
| tipos · testes · build · lint | 3 s cada |
| **um binding TS, ponta a ponta** | **≈ 25 s** |
| **binding Python, ponta a ponta (venv do zero + pip install + verificar.py)** | **medido: ≈ 2m40s** — acima do teto de ~2min |

- [x] **`--prefer-offline --no-audit --no-fund` é obrigatório** no install do K: sem `--no-audit` o
      passo consulta a rede e mistura o ruído do Bloco P dentro do portão do K
- [x] **Cache do npm preservado entre rodadas** (`~/.npm`); a pasta temporária é descartada, o cache não
- [x] **O Python paga venv própria por rodada** — obrigatório, para o autoteste não escrever no
      interpretador da máquina. **Medido: ≈2m40s**, acima do teto de ~2min — por isso o Python roda só
      na agenda (workflow), e `--rapido` (só typescript/javascript) é o que cabe em pre-commit
- [x] **Nenhum limite silencioso.** Se o K pular um binding por qualquer motivo, ele **diz qual e por
      quê** — pular calado é o "relatório vazio não é limpo" da lei 7 aplicado ao próprio K

**Critério de aceite:** os três bindings nascem verdes, do zero, sem passo manual além de preencher
valores no `.env`. **Limite a declarar:** o K mede o projeto **recém-gerado**; ele não afirma nada sobre
projeto que já existe e evoluiu — quem cobra lá é o gate do próprio projeto.

---

## Bloco L — o esqueleto obedece à própria lei

> **O defeito, e é datável.** A **A.1** achou 32 arquivos Python e 20 de TS/JS fora de formato e
> reformatou os moldes. `src/composicao.*`, `scripts/migrations.*` e `verificar.py` foram escritos
> **depois**, na F.2e/F.2f/F.2g, e ninguém reconferiu. Ironia exata: **`verificar.py` — o arquivo que
> roda o linter — é um dos que o linter reprova.**

### L.1 — os esqueletos

- [x] **TS/JS:** `prettier --check` reprova `src/composicao.{ts,js}` e `scripts/migrations.mjs` nos dois
      bindings. `eslint` reprova `scripts/migrations.mjs:232 casosDeSepararUpDown` — **acima de 40
      linhas**, o limiar que o próprio arquivo existe para fazer valer
- [x] **Python:** `ruff format --check` reprova `src/composicao.py`, `scripts/migrations.py` e
      `verificar.py`; `ruff check` acusa **30 erros** — `12× T201` (print) · `8× E501` · `4× PLC0415` ·
      `4× ANN` · `1× PLR2004`
- [x] **Os 12 `T201` não pedem `# noqa`: pedem o idioma que os outros dois bindings já seguem.** Medido:
      `typescript/raiz/scripts/migrations.mjs` usa `process.stdout/stderr.write` **14 vezes e `console.`
      zero**; `python/raiz/scripts/migrations.py` usa `print(` **12 vezes**; e o próprio
      `python/raiz/verificar.py` já escreve **sem um único `print`**. Não é ferramenta de CLI merecendo
      isenção — é **o irmão Python que divergiu sozinho**. Conserto: `sys.stdout.write`, e nenhuma
      entrada nova em `[lint.per-file-ignores]`. *Isenção seria esconder a assimetria em vez de fechá-la*

### L.2 — o furo que só aparece depois do `build`

- [x] **`npm run build` quebra `npm run lint`.** `ignores: ['dist/**', …]` em flat config **ancora na
      raiz**: depois do build, `modulos/*/web/dist/assets/index-*.js` (bundle minificado do React) é
      lintado — **419 problemas, 209 por módulo, 1 real**. E isso **derruba o `.githooks/pre-commit`**,
      reproduzido rodando o hook direto
- [x] Conserto: **uma linha** em `ferramentas/gerar-config-lint.mjs:71` — `'${p}/**'` → `'**/${p}/**'`.
      O `.prettierignore` está **certo** (semântica gitignore, casa em qualquer nível); só o eslint tem
      o furo, e a assimetria entre os dois é o que o escondeu
- [x] **A mesma constante `IGNORADOS` gera o `exclude` do ruff filtrando por `startsWith('.')`**
      (`:121`), então `dist`, `build`, `coverage` e `gerados` **não** são excluídos no Python. Uma fonte
      única produzindo duas listas diferentes é a fonte única desmentida — **unificar, ou nomear a
      diferença no código**. *Feito: o `exclude` do ruff passou a usar `IGNORADOS` inteiro, sem filtro*
- [x] **Travado pelo K**, que roda `lint` **depois** do `build`: é a ordem, não o comando, que revela

### L.3 — `ferramentas/` é vendorizado no projeto e **próprio** na base

- [x] **12 violações dos 40/3/4 dentro de `ferramentas/`**, medidas: `8× max-depth` — incluindo
      `gate/regras/isolamento.mjs:304,307`, `contrato.mjs:276,456`, `configuracao.mjs:422`,
      `dados.mjs:54`, os arquivos que **implementam** `limiar-aninhamento` —, `1× max-params`
      (`contrato-compativel.mjs:125 compararCamposDaResposta`, 5) e `3× max-lines-per-function`, todas
      `casosDeAutoteste` (`afetados.mjs` 88 · `contrato-compativel.mjs` 76 · `ci-dependencias.mjs` 41)
- [x] **A exclusão de `ferramentas/` no projeto gerado está certa e fica** — o argumento "ferramental
      vendorizado, o dono é outro repositório" é verdadeiro lá. **Na base, não**: a base *é* o dono.
      O precedente é a própria **F.2d.1**, que recusou excluir `ferramentas/` do scanner de segredo com
      o argumento certo — ponto cego num **linter** é tolerável, na **casa do dono** não é.
      *Feito: `eslint.config.mjs` novo na raiz da base, escopado a `specs/_estrutura_modulos/ferramentas/**`*
- [x] **As três `casosDeAutoteste` ganham a isenção que `tests/` já tem**, e pelo mesmo motivo:
      lista de fixture não é função. Isenção por **forma** (arquivos de caso), não por nome
- [x] **Os 9 restantes se consertam** — são aninhamento e parâmetro em código de regra, exatamente o que
      o gate cobra do usuário
- [x] **A refatoração de `ferramentas/gate/regras/*` é PRESERVAÇÃO DE COMPORTAMENTO, e esta é a trava.**
      `93/93 · 93/93 · 89/89` **antes e depois**, e o Bloco K verde nos três bindings. **Nenhuma mensagem
      de regra muda de texto** — nem pontuação, porque a mensagem é o conserto que o autor lê. **Se um
      caso de `casos.mjs` precisar ser tocado, a refatoração parou de ser refatoração** e vira bloco
      próprio, com a mudança de comportamento declarada e o caso novo que a prova.
      *O motivo de esta linha existir:* aqui se mexe no código que **implementa as 74 regras**, e o
      autoteste compara **ids** — uma refatoração que preservasse os ids e alterasse o que a regra
      *enxerga* passaria verde (é a mesma cegueira que o Bloco Q vai fechar, e o Q vem **depois**
      deste bloco). É o princípio da skill `code-adequacao` — rede de caracterização antes de refatorar —
      aplicado ao lugar onde o custo de um regresso silencioso é o maior do template.
      *Confirmado: `93/93 · 93/93 · 89/89` antes e depois dos 9 consertos, nenhuma mensagem tocada,
      nenhum caso de `casos.mjs` precisou mudar*
- [x] **Ordem dentro do bloco, por causa da trava acima:** primeiro a config de linter na base e as
      isenções de fixture (que não tocam lógica nenhuma), **depois** os 9 consertos, um arquivo por vez,
      rodando o autoteste entre cada um. Nove consertos num commit só tornam impossível saber qual deles
      moveu o quê
- [x] **Fecha a dívida H "a base perdeu a cobrança de limiar sobre si mesma"**: a base ganha config de
      linter no mesmo movimento, e o hook `padrao-limiares` volta a ter o que ler

### L.4 — achados fora do checklist original, encontrados só rodando o K (não estavam previstos)

- [x] **Módulo novo fica sem `npm install` das próprias dependências.** `criar-modulo.mjs` roda
      APÓS o único `npm install` documentado (`criar-projeto.mjs`, passo 1) — `react`,
      `@testing-library/react`, `@vitejs/plugin-react` do módulo nunca eram baixados, e `npm run
      verificar` de um módulo recém-criado reprovava `tipos` com ~20 erros TS2307 seguindo exatamente
      os passos que o próprio template imprime. Conserto: `criar-modulo.mjs` roda `npm install` de
      novo, depois de `sincronizar-env.mjs` e antes da validação do gate (só TS/JS — Python não tem
      manifesto de dependência por módulo)
- [x] **`ecmaVersion: 2023` no eslint gerado não parseava `import ... with { type: 'json' }`** (atributos
      de import, usados em `web/src/pages/*.jsx` e `tests/web/*.test.jsx` do binding JavaScript) —
      "Unexpected token with". Conserto: `ecmaVersion: 'latest'` em `gerar-config-lint.mjs`
- [x] **`web/index.html` do binding JavaScript apontava para `/src/main.tsx`** (extensão `.tsx`, cópia
      colada do binding TypeScript) quando o arquivo real é `main.jsx` — `vite build` falhava ao
      resolver o import. Conserto: `.tsx` → `.jsx`
- [x] **Binding JavaScript não tinha script `build`** — `empacotar.mjs` já lida com JS (pula a
      compilação do backend, "JS já é o artefato", mas ainda constrói o `web/` com vite) porém o
      `package.json` do binding nunca chamava o script. Conserto: `"build": "node
      ferramentas/empacotar.mjs"` acrescentado, espelhando o TypeScript

---

## Bloco N — segurança: o que o padrão promete e não cobra

> Esta é a classe que o dono do template nomeou como inegociável: **chave nunca exposta, log nunca com
> dado sensível**. Os três itens abaixo são **falsos negativos medidos**, não suspeitas — e em dois deles
> **a lei existe e o próprio template é o contraexemplo dela**.

### N.1 — `GET /meta` público devolve o manifesto inteiro  *(o mais grave)*

- [x] **Medido contra o processo no ar, sem token:**
      `curl http://localhost:3999/api/v1/catalogo/meta` devolve o manifesto **completo** — `dados.schema`,
      `dados.prefixo`, `dados.tabelas` (o layout do banco), `envRequerido` (os **nomes das chaves de
      segredo**), `permissoes` (o vocabulário inteiro), `rotasPublicas` (o que não exige token) e
      **`camposSensiveis`** — que é o mapa de onde está a PII, entregue a quem perguntar
- [x] **Não é o módulo de exemplo mal escrito.** `GET /meta` é **rota obrigatória** (regra `contrato`),
      nasce em `rotasPublicas` no molde, e o código é `res.json(manifesto)` (TS/JS) / `return
      config.manifesto` (Python, dentro do handler) — em **todos** os módulos de **todos** os projetos
      que o template gerar
- [x] **`saida-crua` existe exatamente para isto e não pega**, porque o vocabulário dela é fechado:
      `/\.json\(\s*(registro|registros|linha|linhas|row|rows|dados)\s*\)/` — `manifesto` está fora. A lei
      *"a resposta é montada campo a campo, por allowlist"* é a mesma; só o nome da variável mudou
- [x] **Conserto — a doutrina aplicada a si mesma:** `/meta` projeta por **allowlist** (`id`, `nome`,
      `versao`, `papel`, `rotaBase`, `rotaWeb`, `navegacao`, `exportaResumo`) e nada mais. O que o front
      precisa está todo aí; o resto é reconhecimento. Nos **três** bindings, e no `openapi.yaml` do molde.
      *Confirmado ao vivo: `curl /api/v1/sonda/meta` devolveu só os 8 campos*
- [x] **DECIDIDO — a regra inverte o default só na BORDA, não no MAPEADOR.** A primeira formulação
      (inverter as duas metades — `.json(<id>)` **e** `return <id>` sem vocabulário, em qualquer lugar)
      foi tentada e **falhou o próprio critério de reversão**: medida contra o molde de referência (sem
      nenhuma mutação), produziu **14 identificadores** que precisariam de isenção — muito acima do teto
      de ~6 que este mesmo bloco havia fixado. A causa não era o raio da regra: era a ÂNCORA. `return
      <id>` sem escopo casa **qualquer** função do programa que devolve uma variável — a maioria delas
      não tem nada a ver com resposta HTTP. `.json(<id>)`, ao contrário, só existe onde uma resposta HTTP
      está de fato sendo montada: é seguro por construção, sem precisar de lista nenhuma.
      A regra final tem duas metades com âncoras diferentes:
      - **Borda (`.json(<identificador>)`, TS/JS) — acusa SEMPRE, sem lista de isentos.** Medido no
        molde de referência (fora de teste): **1 ocorrência** em cada um de TS e JS
        (`api/src/routes/index.ts:60` e `index.js:62`, ambos `res.json(manifesto)`), **e essa
        ocorrência é o próprio defeito.** Objeto literal (`res.json({ total })`) e chamada de projeção
        (`res.json(paraContrato(x))`) já saem por CONSTRUÇÃO: a captura exige um identificador puro,
        sem `{` nem `(` depois dele — não é isenção, é o formato do regex.
      - **Borda (Python) — acusa `return <identificador ou acesso.pontilhado>` DENTRO de uma função
        decorada com `@router.<verbo>`, escopada por indentação.** Python não tem `.json(...)`: a borda
        É o `return` do handler. Escopar por arquivo de rotas não bastava — `rotas.py` tem `return
        router` fora de qualquer handler (fecha `criar_rotas`), que teria de CALAR; só a indentação
        (linha pertence ao corpo do handler enquanto o recuo for maior que o do decorator) separa os
        dois. Medido: **1 ocorrência real** (`rotas.py:68`, `return config.manifesto`, dentro de
        `@router.get("/meta")`); `return router` (linha 96, fora de handler) e os demais `return
        <chamada>` dos outros handlers **calam corretamente**.
      - **Mapeador (`return (registro|registros|linha|linhas|row|rows|dados)`, vocabulário fechado) —
        INTACTO, nos três bindings.** Zero mudança de comportamento, zero falso positivo novo — é a
        metade que já funcionava, e o N.1 nunca teve queixa dela.
      *Recusada (1): acrescentar `manifesto` ao vocabulário fechado.* Continua recusada pelo motivo
      original — corrige este caso, deixa o próximo nome escapar.
      *Recusada (2): inverter as duas metades sem âncora de borda.* Era a formulação anterior deste
      documento. O critério de reversão que o próprio N.1 escreveu a derrubou antes de qualquer uso
      real — a medição no molde de referência já bastou
- [x] **Lista de isentos: não existe.** Com a âncora na borda (não no "qualquer `return`"), zero
      identificador precisa de exceção — nem `saida`, nem `corpo`, nem `resposta`. Se uma implementação
      futura desta regra precisar reabrir uma lista de isentos, é sinal de que a âncora voltou a ser a
      errada; parar e revisar a âncora, não crescer a lista
- [x] **Conferir o irmão:** `GET /health` e `GET /resumo` na mesma varredura — `/resumo` devolve
      `{ total }` (objeto literal, isento por construção) e `/health` idem. **Coberto por
      `verificarConforme`** (a checagem "molde conforme produz zero erro", já uma verificação formal do
      harness, não impressão) mais um novo caso dedicado (`log` — chamariz) que exercita objeto literal
      e chamada de projeção lado a lado. Não há caso NOMEADO especificamente "/health"/"/resumo" —
      pendência menor, registrada aqui
- [x] **§7.2 — declarar o que sobra.** Falso negativo remanescente: resposta montada numa variável por
      INDIREÇÃO (`spread`, `Object.assign`) e devolvida depois — é o **mesmo limite** que o extrator de
      projeção do N.2 já declara do outro lado (item 17 da tabela do N.2); citar de lá, não reescrever.
      **PENDENTE:** a linha ainda não foi escrita em `doutrina/04-regras.md §7.2` — a referência aqui no
      plano existe, mas o documento normativo não foi tocado nesta rodada

### N.2 — o extrator de projeção tinha DOIS âncoras errados, não um  *(dívida H, promovida)*

> **Achado que ampliou o bloco.** O plano original só descrevia o âncora de REGIÃO (item 2 abaixo — o `{`
> na assinatura). Medido pelo revisor antes de abrir esta rodada: o âncora de NOME também está errado, e é
> **maior** — o extrator só reconhece `paraContrato`/`para_contrato` literais, então TODA outra função de
> projeção do template (`paraMeta`, introduzida pela própria N.1, e `paraColecao`, pré-existente) é
> **invisível** às três regras que dependem dele. Os dois itens têm de fechar juntos, e nesta ordem:
> **primeiro o de região, depois o de nome** — alargar o nome antes de consertar a região multiplicaria o
> defeito da região por três funções em vez de uma.

#### ITEM 1 — o âncora de NOME

- [x] **Medido num projeto gerado do zero**, com `camposSensiveis: ["cpf"]`:
      ```ts
      export function paraMeta(manifesto): Record<string, unknown> {
        return { id: ..., ..., exportaResumo: ..., cpf: '999' };
      }
      ```
      → `sonda: 0 erro(s), 0 aviso(s)` — `paraMeta` serve a rota **`/meta`, SEM TOKEN**: a mesma
      regressão que a N.1 se propôs a fechar. **Segunda medição, pré-existente e nunca vista por ninguém:**
      o mesmo `cpf` acrescentado a `paraColecao` (`return { itens: ..., total, cpf: '999' }`) também produz
      `0 erro(s)`
- [x] **O âncora certo é a DIREÇÃO, que a convenção do molde já expressa e agora é NORMATIVA**
      (`02-contrato-e-dados.md` §3): resposta → `paraContrato`/`paraColecao`/`paraMeta` (nome COMEÇA com
      `para` + maiúscula, ou `para_` em Python); banco → `linhaParaDominio`/`dominioParaLinha` (`para`/`Para`
      no MEIO do nome, nunca no início). **Não é "o arquivo inteiro"**: variar o extrator para ignorar nome
      e ler o arquivo todo produz falso positivo garantido em `dominioParaLinha` (`created_at`, direção
      BANCO, snake_case de propósito) — é exatamente por isso que um âncora de nome existe, e a N.2 só
      corrige a LARGURA dele, não o remove
- [x] **A consequência que não fica implícita: a regra agora depende de uma convenção de nome, e convenção
      da qual uma regra depende tem de estar na LEI.** Declarada em `02-contrato-e-dados.md` §3 e no §7.2 de
      `04-regras.md` (o que escapa: projeção fora da convenção). **Nenhuma regra nova** cobra a convenção
      nesta rodada — isso é regra fora do catálogo aprovado — mas ela vira **candidata do Bloco M**
      (ver a entrada nova lá)
- [x] `PADRAO_NOME_PROJECAO = /\bpara[A-Z]\w*|\bpara_\w+/g`, aplicado só em sítio de DEFINIÇÃO (mesma
      técnica do item 2)

#### ITEM 2 — o âncora de REGIÃO, como este documento já especificava

O extrator de hoje (`contrato.mjs:239 regioesDeProjecao`) faz: acha o nome → **primeira `{` depois dele**
→ balanceia. Toda a fragilidade está no passo do meio: a primeira `{` depois do nome pode ser a da
assinatura. A saída **não é adivinhar melhor onde o corpo abre — é nunca precisar saber.**

```
para cada SÍTIO DE DEFINIÇÃO de paraContrato*/para_contrato* no arquivo:
    janela = do nome até a PRÓXIMA DEFINIÇÃO DE TOPO do arquivo (ou fim do arquivo)
    para cada ocorrência, dentro da janela, de:
          /\breturn\s*\(?\s*\{/          TS · JS · Python
          /=>\s*\(\s*\{/                 arrow com retorno implícito de objeto
        regiao = objeto balanceado a partir daquela `{`   (fimBalanceado, inalterado)
```

- [x] **DESVIO MEDIDO do texto original, registrado aqui porque mudou o comportamento.** O texto desta
      seção dizia "até o PRÓXIMO sítio de definição" — lido como "próxima definição de `paraContrato*`". Essa
      leitura literal **quebra o próprio molde, sem mutação nenhuma**: a última função `para*` de um arquivo
      (`paraColecao`, hoje) não tem outra depois dela, então a janela ia até o FIM DO ARQUIVO e nada a
      delimitava — no molde real, a janela de `paraContrato` (a primeira `para*`) ia até o fim do arquivo e
      **engolia `paraMeta` e `paraColecao` inteiras**, produzindo `payload-camelcase`/`projecao-contrato`
      falsos em cima de código correto. Medido reproduzindo a spec mínima do caso "contrato sem os endpoints
      obrigatorios": com a janela por `paraContrato*`, esse caso (que não tem nada a ver com projeção) passou
      a reprovar com `id NAO declarado: projecao-contrato`. **Conserto:** a janela fecha na próxima definição
      de **QUALQUER** função de topo (coluna zero — `export`/`async`/`function`/`def`/`const`/`let`/`var`
      seguido de identificador), não só a próxima `para*`. Com o conserto, os `96/96·96/96·92/92` de antes do
      N.2 voltam a bater exatos
- [x] **`FIM_DE_CONSTRUCAO` é APAGADO, não ajustado.** Ele existia para separar referência de definição
      medindo o trecho *do nome até a abertura* — e o alerta do `plan.md` (*"qualquer pulo o dispara"*)
      deixa de existir porque **não há mais trecho até a abertura**. No lugar dele, o sítio de definição
      é reconhecido por forma: `function|def|const|let|var` (com `export`/`async` opcionais à frente) ou
      método de objeto/classe (`nome(` no início de linha lógica). `registros.map(paraContrato)` não casa
      com nenhuma — deixa de ser descartado por heurística e passa a **nunca ser candidato**
- [x] **A janela substitui a delimitação do corpo.** Não é preciso saber onde a função termina: basta que
      a região de busca acabe antes da função seguinte. Uma função de projeção com dois `return`
      (detalhe e resumo) passa a render **duas** regiões, que é o certo e é o que o `matchAll` da versão
      atual já queria
- [x] **Mata o falso positivo do objeto intermediário** — `const interno = { … }` dentro da função não
      está em posição de `return` e some da conta, sem guarda nova
- [x] **Segue FN declarado, e o §7.2 não muda nessas três linhas:** projeção por indireção
      (`spread`/`Object.assign`), `}` dentro de string contando no balanceamento, e `return` de variável
      montada acima (que é justamente o que a **N.1** passa a acusar, do outro lado)
- [x] **Raio de 4 regras:** `projecao-contrato`, `payload-camelcase`, `sensivel-em-saida`,
      `contrato-sincronizado` — a quarta (`contrato-sincronizado`) usa `rotasDoCodigo`, um extrator
      DIFERENTE (não `chavesDaProjecao`), e não foi tocada nesta rodada; citada aqui porque a família
      Contrato inteira compartilha a mesma lei-dona

#### As 18 formas — a lista de casos, e nenhuma sai sem estar aqui

**Devem ACUSAR (as 8 que hoje escapam):**

| # | Forma | Binding |
|---|---|---|
| 1 | tipo de retorno inline — `): { total: number } {` | TS |
| 2 | um parâmetro com tipo inline — `(o: { a: string }): X {` | TS |
| 3 | **dois** parâmetros com tipo inline | TS |
| 4 | genérico com objeto — `<T extends { id: string }>(…)` | TS |
| 5 | `Array<{ … }>` no retorno | TS |
| 6 | `Promise<{ … }>` no retorno | TS |
| 7 | default de parâmetro `= {}` | TS · JS · **PY** |
| 8 | tipo inline **com** default | TS |

**Devem ACUSAR e já acusam (não podem regredir):**

| # | Forma | Binding |
|---|---|---|
| 9 | corpo canônico — `): Record<string, unknown> {` | TS · JS |
| 10 | arrow com retorno implícito — `=> ({ … })` | TS · JS |
| 11 | objeto aninhado dentro da projeção | os três |
| 12 | dois `return` na mesma função (detalhe + resumo) → **duas** regiões | os três |
| 13 | `def para_contrato(r) -> dict:` | PY |

**Devem CALAR (a direção proibida — falso positivo):**

| # | Forma | Por quê |
|---|---|---|
| 14 | `const interno = { … }` dentro da função | não está em posição de `return` — o FP que este conserto mata |
| 15 | `registros.map(paraContrato)` | sítio de **referência**, não de definição |
| 16 | `paraContrato` citado em comentário | já coberto por `textoDeCodigo` (J.2) — não regredir |

**Seguem escapando, e o §7.2 já declara (não são caso, são limite):**

| # | Forma | Classe |
|---|---|---|
| 17 | `{ ...registro }` / `Object.assign` | FN por indireção |
| 18 | `{ rotulo: '}}', campoNovo: x }` | FN: `}` em string fecha o balanceamento |

- [x] **As 16 primeiras viram caso em `casos.mjs`**, nos bindings marcados. As duas últimas viram
      **linha no §7.2** com a forma escrita — limite conhecido é aceitável, limite escondido não.
      Formas 10, 13, 15, 16 já tinham caso de rodadas anteriores (arrow de uma linha, `def` Python,
      referência via `.map`, citação em comentário) — reconferidos verdes, não duplicados. Formas 1–9,
      11, 12, 14 ganharam caso novo nesta rodada; mais dois casos para o item 1 (`cpf` em `paraMeta` e em
      `paraColecao`, cada um nos três bindings) e um chamariz para `created_at` em
      `linhaParaDominio`/`dominioParaLinha` não acusar
- [x] **Trava por chamariz**, no padrão da J.2: casos cuja regra esperada é OUTRA (`log`) carregam as
      formas 14 (objeto intermediário) e o "created_at" do item 1; revertendo o extrator, o harness acusa
      id NÃO declarado nomeando exatamente a regra que voltou a disparar

### N.2.1 — definição indentada nunca fecha janela  *(achado na revisão da N.2)*

> **É o mesmo defeito que a N.2 consertou, deixado aberto para métodos.** A N.2 fechou a janela na
> próxima **definição de topo** (`PADRAO_DEFINICAO_DE_TOPO`, coluna zero) — a decisão certa contra o
> bug que ela mediu (a última `para*` do arquivo varrendo até o fim e engolindo as vizinhas). Mas
> definição **indentada** não casa coluna zero, então **método nunca fecha janela**: dentro de uma
> classe, tudo o que vem depois da primeira projeção é atribuído a ela.
>
> **Medido pelo revisor num projeto gerado do zero:**
>
> ```ts
> export class Projecoes {
>   paraAlfa(registro: Registro): Record<string, unknown> {
>     return { hash: registro.hash };
>   }
>
>   chaveDeCache(registro: Registro): Record<string, unknown> {
>     return { created_at: registro.criadoEm, cpf: registro.hash };
>   }
> }
> ```
> ```
> sonda: 3 erro(s)
>   x [projecao-contrato]  campo "cpf" e projetado na saida e NAO esta declarado...
>   x [payload-camelcase]  campo "created_at" na projecao nao e camelCase...
>   x [sensivel-em-saida]  campo sensivel "cpf" na projecao de saida...
> ```
>
> `chaveDeCache` **não publica nada**. Três falsos positivos sobre código correto — a direção que o
> §7.2 chama de proibida.
>
> **E o §7.2 agrava em vez de declarar:** a linha nova do `projecao-contrato` lista *"método de
> objeto/classe (início de linha lógica)"* entre os sítios de definição reconhecidos — ou seja, **a lei
> afirma que classe funciona**, e ela produz FP. Lacuna contradita pela própria lei é pior que lacuna
> escondida.

- [x] **A janela fecha na próxima definição de recuo MENOR OU IGUAL ao do sítio que a abriu**, em vez de
      coluna zero. Generaliza em vez de abrir caso especial: coluna zero passa a ser o caso particular
      de um sítio de topo.
      **Achado no caminho, fora do texto original:** a lista de palavras-chave do detector genérico
      não tinha `class` — sem ela, `export class X { … }` era invisível ao detector, e a janela de uma
      função de TOPO anterior a uma classe (ex.: `paraColecao` seguida de `export class Projecoes`)
      atravessava a classe inteira até o fim do arquivo. Medido antes de escrever caso: `class` entrou
      na mesma lista de `function|def|const|let|var`
- [x] **A técnica já existe neste arquivo** — `achadosDeBordaPython` (N.1) delimita o corpo do handler
      por `recuo <= recuoDecorador`. Os dois âncoras do `contrato.mjs` passam a operar sob a mesma
      ideia, e é o argumento que dispensa inventar uma segunda
- [x] **Caso próprio:** classe com projeção seguida de método que **não** publica (`chaveDeCache`), nos
      três bindings — no Python, `class` com dois métodos. Trava a **não-acusação**, que é o lado difícil.
      Mais um caso travando que um método `para*` POSTERIOR na mesma classe continua acusando de
      verdade — a janela fecha, mas não cega a regra
- [x] **Não pode regredir o que a N.2 fechou:** a última `para*` de topo continua fechando na função
      vizinha. O caso que a N.2 salvou (`contrato sem os endpoints obrigatorios`, que passou a reprovar
      com `projecao-contrato` sem ninguém tocá-lo) é a trava dessa direção — reconferido, continua verde
- [x] **§7.2 alinhado com o comportamento real**: hoje a linha promete método de classe e entrega FP.
      Ou o conserto acima a torna verdadeira — e é o que este item faz —, ou a promessa sai da lei

**Alcance:** o molde usa funções de topo, então **nenhum projeto gerado hoje esbarra nisto**. Entra
porque o template é referência de vários sistemas e mapeador em classe é TypeScript ordinário — e
porque a lei já o promete.

### N.2.2 — um reconhecedor de definição, não dois  *(achado na revisão da N.2.1)*

> **Terceira instância do mesmo defeito, e é hora de parar de acrescentar forma.** Medido pelo revisor
> num projeto gerado do zero **depois** do conserto da N.2.1:
>
> ```ts
> export const mapa = {
>   paraGama: (registro: Registro) => ({ hash: registro.hash }),
>   chaveDeCache: (registro: Registro) => ({ created_at: registro.criadoEm, cpf: registro.hash }),
> };
> ```
> ```
> sonda: 3 erro(s)
>   x [projecao-contrato]  campo "cpf" ...
>   x [payload-camelcase]  campo "created_at" ...
>   x [sensivel-em-saida]  campo sensivel "cpf" ...
> ```
>
> `chaveDeCache` não publica nada — os **mesmos três** falsos positivos da N.2.1, uma forma de sintaxe
> adiante.
>
> **A causa raiz não é a lista: são duas listas.** Existem dois reconhecedores de *"isto é uma
> definição"*, e eles não concordam:
>
> | | Onde | Aceita |
> |---|---|---|
> | **sítio** (âncora de nome) | `contrato.mjs:286 ehSitioDeDefinicao` | palavra-chave **ou** nome no **início de linha lógica** — qualquer forma |
> | **fechador** (âncora de região) | `contrato.mjs:332 PADRAO_QUALQUER_DEFINICAO` | palavra-chave **ou** `identificador(` |
>
> O sítio é **mais largo** que o fechador, e **toda forma que um aceita e o outro não vira este FP**.
> Já aconteceu três vezes — função de topo (N.2), método de classe (N.2.1), propriedade-arrow (agora).
> A quarta virá, e não se sabe qual é. `paraGama: (r) => ({…})` **é** sítio reconhecido (nome em início
> de linha lógica) e **não é** fechador reconhecido (há `:` entre o nome e o `(`).

- [x] **Um reconhecedor só, consumido pelos dois.** `ehSitioDeDefinicao` e o fechador passam a chamar a
      **mesma** função. As formas deixam de ser enumeradas em dois lugares que precisam concordar, e as
      que faltam passam a vir de graça.
      *Feito: `PADRAO_SITIO_DEFINICAO` + `candidatosDeDefinicao(conteudo)` em `contrato.mjs`, fonte única
      consumida por `sitiosDeDefinicao` (filtra por NOME) e `proximaDefinicaoNoRecuo` (filtra por
      RECUO). A forma larga (identificador no início de linha lógica, sem exigir `(` nem `:` depois)
      passou a valer nos dois lados — antes só o sítio nomeado a tinha*
- [x] **O precedente é desta campanha, duas vezes:** a **N.3** fez `segredo-em-log` e `sensivel-em-saida`
      compartilharem uma lista de verbos em vez de duas; o **Bloco S** vai dar ao vocabulário de portas
      uma fonte com schemas derivados. Mesmo defeito, mesma cura — *uma definição, consumidores nos dois
      lados*, que é a frase que a I.3 já usou para `URL_LITERAL` e `PADRAO_CREDENCIAL`
- [x] **O guarda de recuo já protege o corpo, e é por isso que unificar é seguro.** A linha
      `hash: registro.hash,` também começa linha lógica, mas está **sempre** mais indentada que o sítio,
      e `recuo <= recuoMaximo` a descarta. Provar isso com caso, não com argumento: um `return` de
      objeto multilinha cujas chaves não fecham a própria janela.
      *Confirmado pelo caso de `paraColecao`/`linhaParaDominio`/`dominioParaLinha` do molde de
      referência (chaves do `return` em várias linhas, `verificarConforme` continua zero erro nos três
      bindings) — nenhum caso novo dedicado foi necessário porque o molde já exercita a forma*
- [x] **A exclusão de controle de fluxo (`if`/`for`/`while`/…) da N.2.1 continua valendo** e migra para o
      reconhecedor único — ela é do fechador, não do sítio, e a unificação não pode perdê-la.
      *Feito: `PALAVRAS_DE_CONTROLE` migrou para dentro de `candidatosDeDefinicao`, com `case`/`default`
      acrescentadas (a forma "identificador seguido de `:`" agora também casa rótulo de `switch`)*
- [x] **Casos:** propriedade-arrow que **não** publica → CALA; `cpf` de verdade em propriedade-arrow →
      ACUSA. Nos três bindings; no Python, o análogo é atribuição no nível do módulo
      (`para_gama = lambda r: {...}`) e o dicionário de funções.
      *Feito: dois casos novos em `casos.mjs` (`N.2.2 — propriedade-arrow que NAO publica...` e
      `N.2.2 — "cpf" publicado DE VERDADE numa propriedade-arrow...`), verdes nos três bindings
      (117/117 · 117/117 · 113/113). Contraprova rodada: exigindo `(` depois do identificador na forma
      larga (o fechador antigo), os dois casos novos REPROVAM nos três bindings — confirma que eles
      exercitam o defeito, não passam por acidente. `PADRAO_RETORNO_OBJETO` ganhou uma terceira forma,
      `\blambda\b[^:{}]*:\s*\{`, para o Python ter um equivalente real ao retorno implícito do arrow —
      sem ela `lambda r: {...}` era invisível ao extrator e o caso Python não provaria nada*
- [x] **§7.2 passa a descrever por FORMA RECONHECIDA, não por enumeração.** Hoje a linha lista as formas
      que funcionam — e lista de forma envelhece a cada instância deste defeito. Ela deve dizer *o que é
      um sítio de definição* uma vez, e que o fechador usa **o mesmo** critério.
      *Feito: `04-regras.md` §7.2, linha de `projecao-contrato` reescrita em torno do reconhecedor único*

**Alcance:** o molde usa funções de topo; nenhum projeto gerado hoje esbarra nisto. Entra porque
mapeador como objeto literal de arrows é TypeScript ordinário — e porque, com um reconhecedor só, esta
é a **última** rodada desta família em vez da terceira de N.

### N.3 — uma lista de chamada de log, não duas  *(dívida H)*

- [x] `segredo-em-log` reconhece `logging`, `warning`, `critical`, `exception`, `console.*`, `print(`;
      `sensivel-em-saida` reconhece **menos**. As duas cobrem a mesma classe de vazamento em escopos
      diferentes, e a divergência está declarada no §7.2 como dívida
- [x] **Uma constante compartilhada**, no padrão de `URL_LITERAL`/`PADRAO_CREDENCIAL`. Se a diferença
      precisar existir (na raiz não há regra proibindo `console`; ali quem cobra é o linter), ela vira
      um **filtro nomeado sobre a lista única**, nunca duas listas.
      Feito: `CHAMADA_DE_LOG_VERBOS` exportada de `operacao.mjs` (os sete verbos, sem a saída direta);
      `segredo-em-log` compõe ela + `SAIDA_DIRETA`; `sensivel-em-saida` (`contrato.mjs`) importa só os
      verbos — a saída direta já tem dono no módulo (regra `log`), e compor as duas duplicaria a
      mensagem para o mesmo `console.log`
- [x] Muda o comportamento de `sensivel-em-saida` (regra de módulo) → **caso próprio para a acusação
      nova**, nos três bindings. Medido antes/depois: `logging.warning(cpf)` não era vista pela lista
      antiga (nem "logging" nem "warning" estavam nela) e passa a ser

### N.4 — o furo do `NODE_ENV === 'test'`

- [x] `conferirEnvRequerido` (`api/src/config.ts:120`, e os equivalentes em JS/Python) **pula a
      verificação inteira** quando `NODE_ENV === 'test'` (`PYTEST_CURRENT_TEST` em Python). Pragmático
      — sem isso nenhum teste roda sem `.env` —, mas significa que **suíte verde não prova fiação de
      ambiente**, e não estava declarado
- [x] **DECLARAR, e a suposição do texto original estava errada — medida, não corrigida de memória.**
      O texto dizia *"o `--autoteste` do entrypoint já prova o caminho"*: medido, `--autoteste` de
      `composicao.ts` só prova "decisões puras do entrypoint" (rota única, escolha de emitido × fonte)
      — nunca chama `conferirEnvRequerido`. **Conserto real, não só declaração:** a função virou
      exportada nos três bindings, e um teste direto (`tests/contrato/config.test.ts`/`.js`/
      `test_config.py`) chama ela com a flag de teste removida do ambiente, de propósito, e afirma que
      ela lança quando falta variável. Documentado em `03-operacao.md` §5. **Achado no caminho, em
      Python:** `PYTEST_CURRENT_TEST` removido numa fixture (fase "setup") não basta — o pytest
      RE-ESCREVE a variável na fronteira para a fase "call", e o teste tem de remover DENTRO do próprio
      corpo, não numa fixture

---

## Bloco M — a árvore fechada nos dois sentidos

> **O defeito, medido.** Apaguei de um módulo gerado `core/dominio/`, `core/portas/`, `database/`,
> `tsconfig.json` e `README.md`, e zerei `dados.tabelas`:
>
> ```
> pedidos: 0 erro(s), 0 aviso(s) — conformidade: OK
> ```
>
> A árvore é **fechada por cima** (`estrutura-estrita` reprova entrada não prevista) e **aberta por
> baixo**: a regra `estrutura` só exige `api/`, `tests/` e os cinco `config/*.json`. Um módulo pode
> perder o domínio inteiro, as portas, o banco e a config de tipos — e o gate diz que está conforme.
>
> É exatamente a promessa *"todos os módulos com a mesma estrutura"*, cobrada só numa direção.

- [x] **`estrutura` passa a exigir o conjunto obrigatório do molde**, por binding: `core/dominio/`,
      `core/portas/`, `README.md`, `modulo.json`, e o arquivo de tipos quando o binding o tem
      (`tsconfig.json` em TS). **Uma mensagem por entrada faltante**, nomeando o conserto.
      *Feito: `estrutura.mjs` — `PASTAS_OBRIGATORIAS` (`core/dominio/`, `core/portas/`), `README.md` e
      `ARQUIVOS_OBRIGATORIOS_POR_BINDING` (`tsconfig.json`+`package.json` TS, `package.json` JS,
      `pyproject.toml` PY), resolvido por `ctx.manifesto?.binding`. `modulo.json` NÃO ganhou checagem
      nova — já é dono do `manifesto` (`ctx.manifestoErro`), e a fronteira abaixo proíbe repetir*
- [x] **A fronteira com quem já cobra**, para não haver duas mensagens para um defeito: `contrato/` é do
      id `contrato`; `web/` é do `web-declarado`; `core/motor`, `core/templates` e `gerados/` são do
      `artefato-declarado` (bidirecional por `geraArtefato`); `database/` é do `migrations`, ligado a
      `dados.tabelas`. **O bloco não repete nenhum deles** — só cobre o que hoje não tem dono
- [x] **`core/gateways/` fica de fora**: módulo sem `consome` legitimamente não tem gateway, e cobrá-lo
      seria falso positivo garantido — a direção proibida.
      *Feito: travado por chamariz (`schema-manifesto` + `core/gateways/` removido) em `casos.mjs`*
- [x] **Caso de teste por entrada obrigatória**: apagar cada uma reprova com **id próprio**, e a
      não-acusação das opcionais fica travada por chamariz em caso de outra regra (a técnica da J.2).
      *Feito: 4 casos novos (`core/dominio/`, `core/portas/`, `README.md`, arquivo por binding) + o
      chamariz de `core/gateways/`, verdes nos três bindings (122/122 · 122/122 · 118/118). Contraprova
      rodada: com as checagens novas desligadas em `estrutura.mjs`, os 4 casos REPROVAM nos três
      bindings (118/122 · 118/122 · 114/118) — confirma que exercitam o conserto*
- [x] **`gerados/` entra no `.gitignore` da raiz.** A pasta existe com `.gitkeep` nos três bindings, o
      gate ignora o conteúdo, o linter ignora — **e o git versiona**. Toda saída de máquina do módulo
      vai para o repositório hoje.
      *Feito: `gerados/` acrescentado aos três `.gitignore` (`bindings/{typescript,javascript,python}/raiz/.gitignore`)*
- [x] **`.coverage` entra no `.gitignore` de TS/JS.** A F.2c já registrou a nota de acoplamento — a
      tolerância em `estrutura-estrita` é global aos três bindings, mas o `.gitignore` que a cobre é só
      o do Python. Fechar a assimetria.
      *Feito: `.coverage` acrescentado a `bindings/typescript/raiz/.gitignore` e
      `bindings/javascript/raiz/.gitignore` (o do Python já tinha)*
- [x] **`criar-projeto.mjs` para de copiar lixo.** `cpSync` leva `bindings/python/raiz/**/__pycache__`
      sem filtro — confirmado dentro de um `revpy` gerado. Não está versionado (clone limpo nasce
      limpo), mas o template é copiado **do disco de quem o roda**, e é ali que a garantia tem de valer.
      *Feito: `copiarTemplate` (`criar-projeto.mjs`) ganhou `filter: naoELixoDeExecucao` nos três
      `cpSync`, cobrindo `__pycache__`, `.ruff_cache`, `.pytest_cache`, `.mypy_cache` e `*.pyc` — as
      duas últimas não estavam no texto original desta linha, acrescentadas por serem a MESMA classe
      de cache que `contexto.mjs:NAO_PERCORRER` já trata como lixo. Sanidade confirmada com `cpSync`
      isolado (pasta de origem com `__pycache__`/`.ruff_cache` fabricados, destino só recebe o
      arquivo real) — não mexi na árvore fonte de verdade para testar isto*
- [ ] **CANDIDATA NOVA (do N.2): regra que cobra a convenção de nome do mapeador.**
      `02-contrato-e-dados.md` §3 agora declara, como NORMA (não estilo): função de projeção de saída
      nomeia-se `para<Algo>`/`para_<algo>`; conversão para o banco, `<algo>ParaLinha`/`linhaPara<algo>`.
      `projecao-contrato`, `payload-camelcase` e `sensivel-em-saida` **dependem** dessa convenção para
      achar a função — uma projeção batizada `montarResposta` escapa das três, inteira, em silêncio. Hoje
      nada cobra a convenção em si (só o §7.2 a declara como limite conhecido). Regra candidata: por
      arquivo que casa `/mapeador/i`, toda função em sítio de DEFINIÇÃO cujo corpo tem `return
      {`/`return ({`/`=> ({` (a mesma detecção de região do N.2) e cujo nome não segue nenhuma das duas
      formas da convenção **é suspeita** — aviso, não erro, até medir o falso positivo real (função
      auxiliar dentro do mapeador que não é nem projeção nem conversão, ex.: uma função `validar` local).
      **Fora do catálogo aprovado nesta rodada** — não implementar sem passar por `04-regras.md` primeiro

**Os arquivos, um a um** — para o executor não ter de descobrir:

| O quê | Onde |
|---|---|
| a regra `estrutura` ganha as entradas obrigatórias | `ferramentas/gate/regras/estrutura.mjs:185` |
| os casos (um por entrada + chamarizes de não-acusação) | `ferramentas/gate/testes/casos.mjs` |
| `gerados/` e `.coverage` no ignore | `bindings/typescript/raiz/.gitignore` · `bindings/javascript/raiz/.gitignore` · `bindings/python/raiz/.gitignore` *(o do Python já tem `.coverage`; só `gerados/` falta lá)* |
| filtro de cópia (`__pycache__`, `.ruff_cache`, `*.pyc`) | `ferramentas/criar-projeto.mjs:90 copiarTemplate` |
| a lei que passa a exigir | `doutrina/01-modulo.md` §2 e `doutrina/04-regras.md` §4.x — **catálogo antes do código** |

**O conjunto obrigatório, por binding** *(o que a regra passa a exigir; o resto continua com o dono que
já tem)*:

| Entrada | TS | JS | PY |
|---|---|---|---|
| `modulo.json` · `README.md` · `core/dominio/` · `core/portas/` | ✔ | ✔ | ✔ |
| `tsconfig.json` | ✔ | — | — |
| `package.json` | ✔ | ✔ | — |
| `pyproject.toml` | — | — | ✔ |

### M.1 — `gerados/` é estrutura, não saída *(achado pelo revisor após o commit de M)*

> **O efeito colateral que só aparece depois de um `git clone`.** `gerados/` entrou nos três
> `.gitignore` (item acima) e isso **anula o `.gitkeep`** que o molde entrega — o arquivo existe
> exatamente para a pasta vazia sobreviver ao git:
>
> ```
> git check-ignore -v modulos/sonda/gerados/.gitkeep
>   → .gitignore:17:gerados/   modulos/sonda/gerados/.gitkeep
> git add -A && git ls-files | grep -c gerados      →  0
> ```
>
> A pasta não é versionada — **num clone limpo ela não existe**. E `gerados/` é exigida por
> `artefato-declarado` quando `geraArtefato: true`, o default do molde. Projeto gerado, clone
> simulado, nada mais tocado:
>
> ```
> sonda: 1 erro(s)   x [artefato-declarado] geraArtefato: true mas gerados/ ausente no modulo
> molde: 1 erro(s)   x [artefato-declarado] geraArtefato: true mas gerados/ ausente no modulo
> ```
>
> **O raciocínio que inverteu:** o comentário escrito no `.gitignore` fazia a pergunta certa
> ("nasce vazia, só se enche em build"), mas a pasta é **declarada** por `geraArtefato` e
> **cobrada** por `artefato-declarado` — logo ela é ESTRUTURA. Quem é saída de máquina é o
> CONTEÚDO dela, não a pasta.

- [x] **O conserto, nos três `.gitignore`.** `gerados/*` seguido de `!gerados/.gitkeep` **não
      funciona**: git não desce em diretório excluído, então a negação nunca é avaliada. A forma
      certa exclui o CONTEÚDO (`gerados/*`), não o diretório, para a negação valer.
      **DESVIO MEDIDO do texto original desta rodada, e é a razão de esta linha existir**: o
      snippet como pedido (`gerados/*` / `!gerados/.gitkeep`, sem `**/`) foi tentado primeiro e
      **também não funciona** — `gerados/` mora dentro de `modulos/<modulo>/`, nunca na raiz, e um
      padrão com `/` no MEIO (não só no fim) ancora na pasta do `.gitignore` por semântica gitignore,
      casando só `<raiz>/gerados/*`. Medido com `git check-ignore -v`: sem o prefixo `**/`,
      `modulos/sonda/gerados/lixo.pdf` não era ignorado NENHUM — o mesmo defeito que este item existe
      para consertar, só que no sentido oposto (conteúdo vazando em vez de estrutura sumindo). Forma
      final, nos três `bindings/*/raiz/.gitignore`: `**/gerados/*` + `!**/gerados/.gitkeep`.
      `.coverage` não foi tocado — é arquivo, não estrutura, e já estava correto
- [x] **O passo novo do K — `clone-simulado`**, em `specs/_estrutura_modulos/testes/autoteste-template.mjs`,
      entre `criar-modulo` e `verificar`, nos três bindings: `git init` + `git add -A` + `git ls-files`
      na própria pasta temporária (sem rede, sem remoto — D3), depois apaga do disco, DENTRO de
      `modulos/`, todo ARQUIVO que não ficou rastreado. Quem lê o resultado é o `verificar` que já vem
      a seguir no pipeline — o passo em si não chama o gate.
      **Achado só pela contraprova, não previsto no texto original**: a primeira versão apagava só
      ARQUIVO e deixava a pasta vazia no disco — e o K continuava VERDE mesmo com o `.gitignore`
      revertido para o `gerados/` antigo, porque `artefato-declarado` (`temPastaDeArtefato`) julga a
      ENTRADA da raiz (`readdirSync`, que lista nome de pasta vazia ou não), não o conteúdo. A poda
      passou a remover, em pós-ordem, toda pasta que fica vazia depois de apagar o que não é
      rastreado — é a mesma ausência que um clone de verdade produz (git não materializa diretório
      sem arquivo dentro), e sem ela a contraprova do item seguinte não reprovava
- [x] **Sem `shell: true`.** `rodarGit` é o mesmo despachante `executarPasso` que já existe, um
      `spawnSync('git', args, { shell: false })`. Git ausente do PATH vira `error` no resultado, e
      `classificarPasso` já reprova isso — não pula (lei 7)
- [x] **Contraprova, nos dois sentidos.** Revertido `bindings/typescript/raiz/.gitignore` para o
      `gerados/` antigo: o K reprova no passo `verificar`, nomeando `[artefato-declarado] geraArtefato:
      true mas gerados/ ausente no modulo` em `sonda` e em `molde`. Restaurado, volta a
      `VERDE (7/7 passos rodados chegaram a ok)` — bit a bit igual ao `.gitignore` do commit
- [x] **Autoteste do gate inalterado**: `122/122 · 122/122 · 118/118`, 74 regras — nenhuma regra do
      gate mudou nesta rodada, só `.gitignore` e o script do K

**Não marcado aqui**: fechamento de Bloco (M ou N) — quem marca bloco é o revisor, regra do
cabeçalho deste plano. Os itens acima são só os do executor.

---

## Bloco S — o caminho da fiação

> **O template está completo para construir módulos e incompleto para construir a infraestrutura que os
> módulos consomem.** O caminho *"domínio → borda"* é pavimentado ponta a ponta: molde, comando, gate,
> testes. O caminho *"porta → adapter"* é feito à mão, sem molde e sem forma cobrada — e é onde o
> Bloco I inteiro argumentou que a **arquitetura concentra o risco de propósito**.
>
> As três lacunas abaixo são a mesma lacuna vista de três ângulos.

- [x] **Não existe molde de adapter nem `criar-adapter`.** `adapters/` traz só `memoria`. Todo projeto
      real escreve o primeiro adapter (Postgres) à mão, sem molde: a promessa *"todos com a mesma
      estrutura"* vale para módulo e **não vale para adapter**.
      *Feito: `bindings/{typescript,javascript,python}/_adapter/` (molde) + `ferramentas/criar-adapter.mjs`
      — ver detalhe no item do `criar-adapter.mjs` abaixo*
- [x] **O vocabulário de portas mora em três lugares que precisam concordar, e nada verifica:**
      `packages/portas/index.ts:PORTAS_CONHECIDAS` · `schemas/config-portas.schema.json:properties` ·
      `schemas/modulo.schema.json:portas.items.enum`. Hoje são **8 em cada e idênticos — por sorte**.
      Acrescentar a nona editando dois dos três falha em silêncio numa direção.
      *Feito: ver o item "fonte única" abaixo — os dois schemas passam a ser GERADOS, e a terceira cópia
      (por binding) é mantida à mão contra a mesma fonte, com o mecanismo de conferência do item*
- [x] **Três dos oito nomes são só nomes.** `storage`, `notificador` e `fila` **não têm interface** em
      `packages/portas/`, **não têm adapter** e **não têm fábrica** (`FABRICAS` tem 4: repositório,
      auditoria, relógio, geradorId; `auth` vem por `resolverAuth`). Declarar `"storage"` passa no gate
      e **morre no boot** com *"sem fabrica registrada"* — falha honesta, mas o gate aprovou. E são
      justamente as três que quase todo projeto real precisa: upload, e-mail, job
- [x] **DECIDIDO — `storage` e `notificador` ganham substância; `fila` sai do vocabulário.**
      Os dois primeiros aparecem em quase todo projeto (upload e e-mail), a interface é pequena e o
      adapter de memória é barato — implementá-los é fechar o vocabulário com conteúdo.
      **`fila` sai**: ela arrasta retry, *dead-letter*, idempotência e ordem de entrega, e isso é
      **desenho de topologia** — precisamente o que o `00-arquitetura.md` §5 diz que o template não
      escolhe. Nome sem interface é declaração sem efeito, o mesmo argumento que apagou `'dist'` de
      `ENTRADAS_PERMITIDAS` na F.2g. Ela volta no dia em que houver um projeto com a decisão tomada, e
      volta como ADR.
      *Feito: `fila` removida de `PORTAS_CONHECIDAS` nos três bindings e dos dois schemas gerados*
- [x] **`Storage` e `Notificador`, ponta a ponta**, nos três bindings: interface em `packages/portas/`,
      adapter de memória, fábrica em `FABRICAS`, e um módulo do K declarando uma delas — porque porta com
      fábrica que ninguém exercita é a mesma classe de declaração órfã, só que mais bem escondida.
      **Superfície mínima e tipada por operação** (a propriedade que a F.0 mediu e que sustenta
      `sql-no-modulo`): nada de `executar(comando: string)`.
      *Feito: `Storage` (`salvar`/`buscar`/`remover`) e `Notificador` (`enviar`) — interface +
      `criar*EmMemoria`/`*EmMemoria` + entrada em `FABRICAS`, nos três bindings. O `_template` declara
      `notificador` (manifesto + config/portas.json + `DependenciasModulo`, campo OPCIONAL para não
      quebrar `criar_dependencias()`/fixtures existentes) — a fábrica é exercida de verdade no boot do
      K. `Storage` fica implementada mas não wired no molde padrão ("uma delas", como o item pede) —
      exercida pelo teste manual do `criar-adapter.mjs` (`storage s3`, ver abaixo). Cascata: o caso
      `estrutura — Bloco M — core/portas/ vazio ou ausente` ganhou `tambem: ['config-morta']` — sem
      `core/portas/index.ts`, a palavra "notificador" some do código do módulo e a chave de
      `config/portas.json` fica sem leitor, aos olhos daquela regra*
- [x] **DECIDIDO — fonte única do vocabulário, com os schemas DERIVADOS.** Uma lista, e os dois schemas
      gerados dela pelo `gerar-config-lint.mjs` (ou um irmão dele), com `--conferir` e exit 1 na
      divergência — no precedente exato do `lint-derivado`. *Recusada:* uma regra de escopo `raiz` que
      compara os três e acusa. **Impedir é melhor que acusar**, e o template já escolheu isso uma vez
      quando fez a config do linter ser gerada em vez de conferida por regra.
      *Feito: `ferramentas/gate/vocabulario-portas.mjs` (fonte) + `ferramentas/gerar-schemas-portas.mjs`
      (irmão do `gerar-config-lint.mjs`, `--conferir`). `config-portas.schema.json` é INTEIRO gerado
      (byte a byte, como o eslint/ruff); `modulo.schema.json` só tem `portas.items.enum` tocado, por
      SUBSTITUIÇÃO DE TEXTO — regenerá-lo inteiro tornaria o gerador dono de campos que não são de
      porta nenhuma. O terceiro lugar (`packages/portas/index.*` por binding) continua hand-maintained
      de propósito — é interface de linguagem, três sintaxes diferentes, não config mecânica — e cada
      um ganhou um comentário apontando a fonte normativa. Rodado: `gerado: config-portas.schema.json,
      modulo.schema.json (portas.items.enum)`, depois `--conferir` → OK*
- [x] **`manifesto.versao` ganha consumidor: é o `/meta` projetado da N.1.** Ele entra na allowlist e
      passa a ter leitor — e a alternativa (tirá-lo do obrigatório) fica recusada porque versão de módulo
      é o dado que o consumidor de `consome` precisa quando o contrato muda ([[02-contrato-e-dados]] §5).
      **Dependência explícita: este item fecha DEPOIS da N.1**.
      *JÁ SATISFEITO pelo conserto da N.1: o `paraMeta`/`para_meta` dos três bindings já projeta
      `versao: manifesto.versao`, e o schema de `/meta` no `openapi.yaml` do molde já declara
      `versao: { type: string }`. Confirmado nos três bindings — nenhuma mudança nova precisou entrar
      nesta rodada*

**Os arquivos, um a um:**

| O quê | TS | JS | PY |
|---|---|---|---|
| interfaces das portas | `raiz/packages/portas/index.ts` | `…/index.js` | `…/__init__.py` |
| adapter de memória | `raiz/adapters/memoria/index.ts` | `…/index.js` | `…/__init__.py` |
| `FABRICAS` / resolução | `raiz/src/composicao.ts:42` | `…/composicao.js` | `…/composicao.py` |
| vocabulário (hoje em 3 lugares) | `packages/portas/*:PORTAS_CONHECIDAS` · `ferramentas/gate/schemas/config-portas.schema.json:properties` · `ferramentas/gate/schemas/modulo.schema.json:portas.items.enum` |||
| molde de adapter (novo) | `bindings/<b>/_adapter/` | idem | idem |
| scaffold (novo) | `ferramentas/criar-adapter.mjs` |||
| a lei | `doutrina/01-modulo.md` §5 (catálogo de portas) e `doutrina/00-arquitetura.md` §3 |||

- [x] **`criar-adapter.mjs <porta> <provedor>`** — copia o molde, substitui marcadores, registra a
      fábrica e **roda o gate**. Mesma forma do `criar-modulo.mjs`, e sujeito ao mesmo aceite do Bloco O:
      **qualquer combinação de argumentos produz artefato conforme**, ou o comando não existe.
      *Feito, com um achado no caminho: o molde não pode ter `<porta>`/`<Porta>` em posição SINTÁTICA
      (tipo, nome de função) — só em comentário/string, a mesma disciplina de `<modulo>` em
      `modulos/_template`. Um molde inicial com `import type { <Porta> } from '...'` teria deixado
      `adapters/_template` (persistente, nunca substituído no lugar) com sintaxe INVÁLIDA para sempre,
      quebrando `tsc --noEmit`/`eslint` em TODO projeto gerado — mesmo em quem nunca rodasse
      `criar-adapter`, porque `tsconfig.json:include` inclui `adapters` inteiro. Conserto: o molde
      devolve um tipo genérico (`Record<string, unknown>` / `Record<string, unknown>` via JSDoc /
      `AdapterPendente` com `__getattr__` levantando `NotImplementedError`) sob um nome FIXO
      (`criarAdapter` TS/JS, `AdapterPendente` PY) — nunca marcado —, e o script troca esse nome pelo
      do provedor só na CÓPIA, por `\bcriarAdapter\b`/`\bAdapterPendente\b`. `criar-projeto.mjs` ganhou
      um quarto `cpSync` (`bindings/<b>/_adapter` → `adapters/_template`) — sem ele o molde nunca
      chegava ao projeto gerado. Testado nos três bindings, um provedor por binding
      (`storage s3` TS e PY, `notificador sendgrid` JS): import inserido, `FABRICAS` estendido na
      MESMA linha da porta (ou linha nova, se a porta ainda não tinha entrada), gate limpo, e
      `npm run verificar`/`verificar.py` completos verdes — tipos, lint, formato e testes, incluindo
      mypy achando os 7 arquivos-fonte do binding Python sem problema. Não testado exaustivamente
      (todas as combinações de porta×provedor×binding): a cobertura combinatorial é explicitamente do
      Bloco O, como esta linha já dizia*

### S.1 — o verificador que existe e não roda

> Achado do revisor, na reprodução do S: `gerar-schemas-portas.mjs --conferir` funciona — quebrado de
> propósito (`"fila"` acrescentada ao enum de `modulo.schema.json`), ele reagia com `REPROVADO` e
> `EXIT=1`. Mas nada da cadeia o chamava: `verificar` era `validar && validar:env && formato && lint &&
> tipos && test`, e `grep -rn "gerar-schemas-portas"` só achava dois comentários citando o nome. A
> decisão "impedir em vez de acusar" estava tomada e a derivação estava feita, mas sem o `--conferir` na
> cadeia nada impedia — quem editasse `modulo.schema.json` à mão divergia em silêncio, o defeito exato
> que o bloco existia para matar. Escopo estritamente de fiação: uma linha por binding, mais o hook —
> nenhuma regra, nenhum schema, nenhuma ferramenta nova.

- [x] **Os quatro pontos de fiação**, seguindo o precedente exato de `validar:env`/`sincronizar-env.mjs`
      (mesma forma `--conferir`, mesmo custo, mesmo lugar na cadeia):
      1. `bindings/typescript/raiz/package.json` — script `validar:schemas` novo, encadeado em
         `verificar` logo depois de `validar:env`
      2. `bindings/javascript/raiz/package.json` — idem
      3. `bindings/python/raiz/verificar.py` — passo `("schemas de portas", ["node",
         "ferramentas/gerar-schemas-portas.mjs", "--conferir"], None)` acrescentado logo depois de
         `("ambiente (.env.example)", ...)`, mesmo formato (é Node nos três bindings, como o
         `sincronizar-env` já é)
      4. `ferramentas/verificar-commit.mjs` — nova função `rodarSchemasDePortas()`, mesma forma de
         `rodarSincronizarEnv()` (Node direto, fora de `formatoELint()`), encadeada em `preCommit()`
         logo depois de `rodarSincronizarEnv()`
      Rótulo do passo em todos os quatro pontos: **"schemas de portas"** — o que ele confere, não o
      nome do arquivo, seguindo o padrão dos rótulos vizinhos (`"env (.env.example)"`,
      `"ambiente (.env.example)"`)
- [x] **Documentação — onde a decisão "impedir em vez de acusar" registra o executor.**
      `doutrina/01-modulo.md` §5.1 (onde o Bloco S registrou a decisão — não em `04-regras.md` §7.1,
      que não tem entrada para esta classe de decisão) só afirmava a decisão e citava o comando; não
      dizia onde ele roda. Passou a nomear os dois lugares (`validar:schemas` dentro de `verificar`,
      `rodarSchemasDePortas()` dentro do `pre-commit`) e a chamar `sincronizar-env.mjs --conferir`
      de precedente explícito
      `doutrina/03-operacao.md` §7 — a tabela de custo abstrata ganhou "schemas de portas" na linha
      "Milissegundos (lê arquivo)", ao lado de "env" (mesma classe de custo: lê arquivo, string-compara,
      não instala nada). A tabela de fiação do §7.1 ganhou "schemas de portas em dia" na coluna "O que
      roda" da linha `pre-commit`. **Nota de leitura:** a rodada pedia a entrada na linha "segundos" —
      medido que o custo real é milissegundos (mesma ordem de grandeza do `sincronizar-env`, sem
      compilar/instalar nada), e a linha de fiação do `pre-commit` já é rotulada "Milissegundos +
      segundos" (combinada), então a entrada nova cabe sem precisar reclassificar nada. Registrado aqui
      para o revisor corrigir se a intenção era outra
      *Não tocado, fora do que a rodada pediu:* `03-operacao.md` §7.4 (o exemplo de fiação de CI) e a
      contagem "11 comandos" que `ADR-008` (Bloco P) cita sobre aquele exemplo — adicionar
      `validar:schemas` ali tornaria a contagem 12 e é uma terceira edição de doc não pedida nesta
      rodada. Fica registrado para quem decidir se `S` reabre ou se isso é debt separada
- [x] **CONTRAPROVA — `npm run verificar`/`python verificar.py`, os três bindings.** `"fila"`
      acrescentada ao enum de `portas` em `modulo.schema.json`, três projetos gerados do zero
      (`criar-projeto.mjs`, escopo `s1`), `.env` sincronizado uma vez (passo manual de projeto recém-nascido,
      não relacionado a este achado). Os três reprovam, nomeando o arquivo divergente, e o passo
      **para a cadeia** antes de formato/lint/tipos/test:
      ```
      TS  → validar:schemas
        gerar-schemas-portas: REPROVADO — divergente(s): modulo.schema.json (portas.items.enum).
          rode: node ferramentas/gerar-schemas-portas.mjs
      JS  → validar:schemas  (mensagem idêntica à TS)
      PY  → verificar.py
        gerar-schemas-portas: REPROVADO — divergente(s): modulo.schema.json (portas.items.enum).
          rode: node ferramentas/gerar-schemas-portas.mjs
          FALHA schemas de portas
        (verificar.py roda a lista inteira, não para no primeiro — reprovou 2 passos: `schemas de
        portas` e `tipos (mypy)`, este último por `mypy` não instalado no ambiente de teste, sem
        relação com o achado)
      ```
      Restaurado o schema (enum original), os três voltam a `ok`/`OK — os dois schemas em dia com
      vocabulario-portas.mjs`. Os três projetos de teste foram gerados no scratchpad e descartados —
      não tocaram a árvore fonte
- [x] **CONTRAPROVA — pre-commit.** Mesmo schema quebrado, `node ferramentas/verificar-commit.mjs
      pre-commit` (o comando que `.githooks/pre-commit` chama) num projeto TS recém-gerado:
      ```
      gerar-schemas-portas: REPROVADO — divergente(s): modulo.schema.json (portas.items.enum).
        rode: node ferramentas/gerar-schemas-portas.mjs
        ! schemas de portas: saiu com codigo 1
        FALHA schemas de portas
      ...
      verificar-commit: REPROVADO — 3 passo(s)
      ```
      `EXIT=1` confirmado (formato/lint também reprovaram, por prettier/eslint não instalados no
      ambiente de teste — sem relação com o achado; o ponto sob prova, `schemas de portas`, reprova
      corretamente ANTES desses dois). Restaurado o schema, `node ferramentas/verificar-commit.mjs
      pre-commit` volta a mostrar `ok schemas de portas` e `EXIT=0` para este passo
- [x] **Autoteste inalterado**: `122/122 · 122/122 · 119/119`, 74 regras — confirmado antes e depois
      de todas as edições de fiação. Nenhum caso de `casos.mjs` tocado, nenhuma regra tocada
- [x] **Bloco K verde nos 3 bindings** (`node testes/autoteste-template.mjs`, sem `--rapido`): TS e JS
      11/11 passos, Python 11/11 passos — incluindo `verificar` já carregando o passo novo em todas as
      quatro combinações de módulo geradas

---

## Bloco O — a ferramenta de entrada não mente verde

> `criar-modulo.mjs` roda o gate ao final e **imprime OK** — é a primeira coisa que um usuário novo vê,
> e é onde a confiança no padrão nasce. Ela não pode aprovar o que não funciona.

- [x] **`--sem-artefato` gera módulo quebrado, e o gate diz verde.** Medido:
      ```
      node ferramentas/criar-modulo.mjs relatorio --sem-artefato
      → gate:   "relatorio: 0 erro(s), 0 aviso(s) — conformidade: OK"
      → tsc:    TS2307 Cannot find module '../../core/motor/index.js'
      → vitest: 1 failed
      → ci:cobertura: reprova o workspace inteiro
      ```
      A flag remove `core/motor/` e deixa `tests/dominio/dominio.test.ts` importando dele.
      *Feito: `podarTesteDeArtefato(destino, binding)` em `criar-modulo.mjs`, chamada quando
      `--sem-artefato`. TS/JS: remove o `import { gerarArtefato } from '../../core/motor/index.js'`
      e o bloco `describe('gerarArtefato', ...)` inteiro de `tests/dominio/dominio.test.*` (corta na
      linha em branco anterior, por texto — o molde é conteúdo fixo, não entrada externa). Python:
      remove `from core.motor import gerar_artefato` e, a partir de `TEMPLATE = `, tudo até o fim do
      arquivo (`TEMPLATE` + os três `test_motor_*`). **Achado no caminho, nos dois lados:** depois de
      remover o bloco, `registroDeExemplo`/`registro_de_exemplo` ficava importado e SEM LEITOR —
      `montarRegistro`/`montar_registro` não o usa — e `tsc --noEmit` reprovava com TS6133
      ("declared but its value is never read") / `ruff check` reprovaria com F401 (import não usado).
      As duas remoções de import saem juntas da mesma função*
- [x] **`--sem-web` TAMBÉM está quebrado — a afirmação herdada era falsa.** O `plan.md` (Bloco H) diz
      *"o caso análogo `--sem-web` é tratado corretamente"*. **Medido, e não é:**
      ```
      node ferramentas/criar-modulo.mjs painel --sem-web
      → x [navegacao-declarada] navegacao declarada mas rotaWeb e null
      → conformidade: REPROVADO — 1 erro(s)
      ```
      A flag zera `rotaWeb` e **deixa `navegacao` preenchida**. Os tipos e os 19 testes passam; o
      **manifesto** é que nasce inconsistente.
      **As duas flags falham de formas diferentes, e a diferença importa:** `--sem-artefato` produz
      módulo quebrado **e diz OK** (mentira); `--sem-web` produz módulo não-conforme **e avisa** (defeito
      honesto). Só a primeira é da família "verde indistinguível de não verificou" — mas as duas violam
      o mesmo invariante: *a ferramenta de entrada entrega artefato conforme, sempre*.
      *Feito: `ajustarManifesto` zera `navegacao` junto com `rotaWeb` quando `--sem-web`*
- [x] **ACHADO NOVO (do N.4, incidental — não estava aqui): `--escopo` diverge entre `criar-projeto.mjs`
      e `criar-modulo.mjs` no binding Python.** Medido: `criar-projeto.mjs destino --binding python
      --escopo verif` seguido de `criar-modulo.mjs sonda --binding python` (sem `--escopo`) gera
      `core/portas/__init__.py` **corrompido** — `resolverEscopo` de `criar-modulo.mjs` cai no fallback
      `raizProjeto.split(/[\\/]/).pop().toLowerCase()` (basename da pasta) porque Python não tem
      `package.json` para ler o nome; TS/JS não sofrem disso porque `criar-projeto.mjs` grava o escopo
      em `package.json:name`, e `criar-modulo.mjs` o lê de lá por padrão. Resultado observado: o
      identificador `verificar` (sem marcador nenhum) virou `sarak-verif-n4pyicar` — a substring
      `verif` do meio da palavra colidiu com o escopo resolvido. **Não investigado a fundo, não
      corrigido nesta rodada** — fora do escopo de N.3/N.4. Reproduzir com escopos DIFERENTES nos dois
      comandos antes de decidir o conserto.
      *Investigado a fundo — e a causa raiz NÃO é o que o achado suspeitava. Não é `resolverEscopo`
      caindo num fallback diferente por si só: é `criar-projeto.mjs --escopo verif` varrendo
      `ferramentas/` (dentro de `PASTAS_INSTALADAS`) e substituindo `<escopo>` por "verif" TAMBÉM
      dentro do CÓDIGO-FONTE das próprias ferramentas copiadas — `criar-modulo.mjs` tem a string
      literal `'<escopo>'` como parte da PRÓPRIA LÓGICA de substituição (`.replaceAll('<escopo>',
      escopo)`), não como marcador a preencher. A varredura reescrevia essa linha, na CÓPIA, para
      `.replaceAll('verif', escopo)` — a ferramenta corrompia a própria busca. No próximo
      `criar-modulo.mjs <id>` desse projeto, QUALQUER `<id>` que contivesse "verif" como substring
      (`"verificar"` → `"destinoicar"`, exatamente o achado original) saía mutilado, porque o
      `.replaceAll` estava procurando "verif" (o valor antigo do escopo) em vez de `<escopo>` (o
      marcador). Bisseccionado por instrumentação: `substituir()` isolada com os mesmos argumentos
      não reproduzia — só reproduzia rodando a CÓPIA dentro do projeto, nunca a fonte; a diferença
      era exatamente o arquivo executado, não os argumentos.
      **Conserto:** `criar-projeto.mjs` ganhou `PASTAS_COM_MARCADOR_ESCOPO` (as mesmas de
      `PASTAS_INSTALADAS`, SEM `ferramentas/`) e `arquivosComMarcadorEscopo`, substituindo
      `arquivosInstalados` como fonte de `aplicarEscopo`. `ferramentas/` nunca teve marcador
      `<escopo>` de verdade — só como parte de lógica —, então excluí-la não perde nada; é o mesmo
      argumento que já vale para `gerar-config-lint.mjs:IGNORADOS` excluir `ferramentas/` do linter
      da base (Bloco L.3, "vendorizado, ninguém edita"). Contraprova: com o `--escopo verif` +
      `criar-modulo.mjs verificar` do achado original, `id` saía `"destinoicar"` antes do conserto e
      `"verificar"` depois — confirmado nos dois lados (fonte E cópia). TS/JS reconferidos com
      `--escopo acme`: `package.json:name` continua `"@acme/<modulo>"` corretamente*
- [x] **DECIDIDO — podar, nas duas.** `--sem-artefato` remove também a parte do teste que depende do
      motor; `--sem-web` zera `navegacao` junto com `rotaWeb`.
      *Recusada:* aposentar as flags (módulo sem artefato se faz zerando `geraArtefato` e apagando as
      três pastas, que `artefato-declarado` já cobra nos dois sentidos). Elas são úteis e o conserto é
      pequeno; aposentar seria trocar um defeito de duas linhas por trabalho manual em todo projeto
- [x] **O invariante que passa a valer, e é o aceite do bloco:** *qualquer* combinação de flags de
      `criar-modulo.mjs` produz módulo que passa em `verificar`. Hoje são 4 combinações
      (nenhuma · `--sem-artefato` · `--sem-web` · as duas) × 3 papéis.
      *Confirmado: as 4 combinações × papel `dominio` rodam permanentemente no K (item abaixo). As
      8 combinações restantes (`gateway`/`conector` × as 4 flags) foram verificadas manualmente no
      binding TypeScript — `0 erro(s)` no gate para as 8, e `npm run verificar` (tipos + lint +
      formato + testes) limpo para o lote inteiro. Não entraram no K permanente: `papel` não altera
      NENHUMA regra de estrutura (a única regra condicionada por `papel` é `gateway-credencial`, que
      só FROUXA a exigência para `papel: gateway`, nunca aperta) — rodar as 12 permanentemente
      pagaria 3× o custo do K sem medir defeito novo nenhum. Se isso mudar (uma regra nova passar a
      exigir algo condicionado por papel), o K precisa crescer com ela, não antes*
- [x] **O Bloco O ESTENDE o gerador do K** para as 4 combinações (nenhuma flag · `--sem-artefato` ·
      `--sem-web` · as duas) e roda a cadeia em cada uma. A extensão é **aceite do O**, não do K — o
      K nasceu cobrindo só o módulo padrão (D2: "o K cresce com os blocos").
      *Feito: `COMBINACOES_DE_MODULO` em `autoteste-template.mjs`, quatro módulos (`sondapad`,
      `sondaart`, `sondaweb`, `sondaamb`) criados no MESMO projeto (um só install, um só `verificar`
      cobrindo os quatro via workspace/descoberta — repetir a cadeia inteira 4× pagaria 4× o custo
      do K.1 sem medir nada a mais). Dois achados no caminho, os dois sobre COMPRIMENTO de id:
      **(1)** ids com hífen (`sonda-padrao`) reprovavam `schema-manifesto` — `dados.tabelas[0]`
      herda o hífen do id e o padrão de nome de tabela (`^[a-z][a-z0-9_]*$`) não aceita hífen, mais
      estrito que o do id (`^[a-z][a-z0-9-]*$`, que aceita); **(2)** ids longos
      (`sondasemartefato`, 16 chars) reprovavam `ruff format`/`ruff check` (E501) no binding Python
      — vários cabeçalhos do molde têm `<modulo>` numa linha de comentário já perto do limite de 110
      colunas (`api/src/erros.py:1`, o mais apertado, sobra só 13 caracteres), e a combinação de um
      id longo com um escopo longo (o `--rapido`/K usa pasta temporária como escopo, um nome
      comprido) estourava também `tests/contrato/test_config.py`'s `MANIFESTO_BASE` (dict de uma
      linha só). Consertos: ids curtos sem hífen (6–8 chars, a mesma folga que "sonda" já tinha) e
      `test_config.py` do molde Python reformatado para dict multi-linha (robusto a qualquer id/
      escopo razoável, não só aos específicos medidos). `--rapido` usa só a combinação padrão — as
      quatro juntas custam ~70s(TS)/~52s(JS) a mais, e o `--rapido` combinado foi de ~25s para
      ~1m58s, quase estourando o teto de ~2min do K.1; com a poda, voltou a ~1m24s. Contraprova:
      revertido o conserto do `--sem-web` acima, o K reprova nomeando exatamente
      `criar-modulo:sondaweb`; restaurado, volta a verde nos três bindings (10/10 · 10/10 · 9/9)*
- [x] **A pergunta que fica registrada:** o gate aprovar um módulo que não compila é falha do gate ou
      fronteira dele? A resposta honesta é **fronteira** — o gate é estático e não executa, de propósito
      (é o que o faz viajar). Então o conserto é na **ferramenta**, não na regra; e o Bloco K é quem
      cobre a classe inteira, porque ele executa

---

## Bloco P — a cadeia de dependências tem dono

> **Projeto novo nasce vermelho num passo de CI que o próprio template entrega.** É a mesma classe da
> F.2d.1 — a ferramenta acusando o pacote que a instalou —, só que a origem agora é externa.

- [x] **Medido num projeto recém-gerado**, sem uma linha minha:
      ```
      npm audit  → 6 vulnerabilidades (2 critical, 1 high, 3 moderate)
      npm run ci:dependencias → x vite (high) · x vitest (critical) — REPROVA, exit 1
      ```
      E a correção **exige salto de major** (`vitest 4.1.10`, `vite 8.2.1`): não sai com `audit fix`.
      *Remedido nesta rodada (números já tinham deslizado com o tempo, como o próprio D1 antecipa):
      **5** vulnerabilidades (1 critical, 1 high, 3 moderate), mesma cadeia (esbuild→vite→vitest),
      mesmos alvos de bump (`vitest 4.1.10`, `vite 8.2.1` — exatos, `npm audit fix --force` resolveu
      para eles). **Achado a mais, no binding Python:** `pip_audit` acusava 6 vulnerabilidades no
      `pip` 25.2 do próprio venv (não é dependência declarada — é o instalador). Mesma classe de
      defeito ("projeto novo nasce vermelho"), binding diferente — ver item do `pip` abaixo*
- [x] **Enquanto isso, o único caminho verde é escrever exceção de CVE datada num projeto que nasceu
      hoje** — o que corrói exatamente a disciplina que a F.2d montou. Exceção existe para *"o mundo
      mudou depois"*, não para *"nasceu assim"*
- [x] **Bump da cadeia inteira**, nos três bindings: `vitest`, `vite`, `@vitest/coverage-v8`, `eslint`,
      `typescript`, `express`, `react`, `jsdom`, `prettier`, `ruff`, `mypy`, `pytest`. **Sob o K** — é
      ele que torna o salto de major barato, e é a primeira vez que ele paga o próprio custo.
      *ESCOPO FECHADO COM O USUÁRIO antes de tocar código: só a cadeia com CVE aberta
      (`vitest`→4.1.10, `vite`→8.2.1, `@vitest/coverage-v8`→4.1.10, `@vitejs/plugin-react`→6.0.5, o
      último por exigência de peer dep do `vite` 8) foi de fato SUBIDA de major. `eslint`/`typescript`/
      `express`/`react` têm majors bem mais novos no registry (medido: ts 5→7, express 4→5,
      eslint 9→10, react 18→19) mas SEM CVE — ficam pinados na versão atual (não bump) e registrados
      como pendência explícita no ADR-008, não bumpados às cegas só "porque o registry tem". `ruff`/
      `mypy`/`pytest` (Python): pinados na versão atual, sem CVE nenhuma nos três.
      **Achado no caminho, real regressão de teste:** `vitest` 2→4 quebrou `tests/web/**` com
      "document is not defined" — `environmentMatchGlobs` (a forma de ligar jsdom por PASTA) foi
      REMOVIDO no Vitest 3+ (confirmado: a string não existe em nenhum `.js`/`.d.ts` do pacote
      instalado), config morta sem aviso. Conserto: cada teste de `tests/web/**` liga o próprio
      ambiente com `// @vitest-environment jsdom` na primeira linha — testado empiricamente antes de
      trocar, continua funcionando no Vitest 4 — e `vitest.config.{ts,js}` perdeu a linha morta*
- [x] **Pin exato substitui `^` em todo o esqueleto** (D1), nos três bindings.
      *Feito nos dois lados: TS/JS (`^` → versão exata nos quatro `package.json` — raiz e `_template`
      dos dois bindings) e Python (`>=` → `==` nas dependências de `pyproject.toml`, mesmo princípio,
      sintaxe do binding). Versões pinadas na resolução ATUAL medida (não a mão): as com CVE, no
      alvo do bump; as sem CVE, no que `npm install`/`pip install` resolveu limpo numa instalação
      fresca — não um chute*
- [x] **ADR novo — "a cadeia de ferramentas do template"**: por que fixa, quem decide o bump, com que
      cadência, e o limite de que projeto já criado não recebe atualização.
      *Feito: ADR-008 em `doutrina/adr/decisoes.md`. Cobre os quatro pontos pedidos mais os dois
      limites que D1 já declarava (pin exato não prende transitivo; template nunca empurra update
      para projeto já criado) e a pendência explícita dos quatro majors sem CVE (ver item acima)*
- [x] **`ci:dependencias` entra no K** (D2) e vira o sensor de envelhecimento.
      *Feito: passo `ci-dependencias` por ÚLTIMO no pipeline dos três bindings
      (`autoteste-template.mjs`) — `npm run ci:dependencias` (TS/JS), `verificar.py --dependencias`
      (Python). **Achado no caminho, Python:** o passo reprovava com "ferramenta de auditoria
      ausente" mesmo com tudo instalado certo — `ci-dependencias.mjs` resolve o interprete Python via
      `SARAK_PYTHON`/PATH, e o processo filho (Node, chamado por `verificar.py --dependencias`) não
      herdava `SARAK_PYTHON` apontando para o venv da rodada; caía no `python`/`python3` do PATH, que
      não tem `pip_audit`. Conserto: o passo do K passa `SARAK_PYTHON` explícito. Contraprova:
      revertido `vitest` para `2.1.4` (deixando `vite`/`@vitejs/plugin-react`/`@vitest/coverage-v8`
      nas versões novas, peer-incompatíveis) — `npm install` reprova com ERESOLVE antes mesmo do
      audit, provando que o conjunto pinado é interdependente e o K não é cego a uma reversão
      parcial; restaurado, volta a `VERDE (11/11)` nos três bindings*
- [x] **Limite já conhecido, que segue valendo:** `pip-audit` não reporta severidade, então o piso de
      `severidadeMinima` só filtra o npm — declarado no §7.2 desde a F.2d, e a mudança de versão não o
      altera.
      *Confirmado: `pip-audit --format=json` continua sem campo de severidade nesta versão também —
      nenhuma mudança de comportamento a declarar*
- [x] **ACHADO NOVO, fora do checklist original — `pip` do venv com CVE própria.** Medido: `pip`
      25.2 (o que `python -m venv` instala do interpretador do SISTEMA, nunca gerenciado pelo
      template) tinha 6 vulnerabilidades conhecidas — `pip_audit` reprovava um projeto Python
      recém-gerado com TODA dependência declarada em dia. Não é `pyproject.toml` — `pip` não é
      dependência declarada, é o instalador.
      *Conserto: `pip install --upgrade pip` como passo `atualizar-pip`, entre `venv` e `instalar`,
      no K dos três — e a mesma instrução entra nos "próximos passos" que `criar-projeto.mjs` imprime
      para o binding Python, para quem gera um projeto de verdade (não só o K) ver a mesma orientação.
      Confirmado: `pip` 25.2 → 26.2.1, `pip_audit` passa a "No known vulnerabilities found"*

---

## Bloco Q — expressividade do harness

> **O harness compara conjunto de ids.** Ele não consegue travar uma **não-acusação sob regra que
> dispara**: se `segredo-em-log` acusasse a chave errada, sairia sob o mesmo id e o autoteste passaria.
> Em I.2 deu para contornar via id não declarado; em I.3 não deu.
>
> Enquanto isso valer, **toda trava dos outros blocos é mais fraca do que parece** — inclusive as deste
> plano. Por isso ele vem depois dos consertos e antes de fechar a conta.

- [x] **O caso passa a poder afirmar mais que o id**: `{ id, arquivo?, contem?, vezes? }`. Não é um
      framework de asserção — são três campos opcionais, e o caso que não os usa continua valendo
      exatamente como hoje (compatibilidade para trás é requisito, não bônus)
      **Feito:** `verificarAfirmacaoFina(caso, achados)` em `executar.mjs`, chamada em `verificarCaso`
      logo antes do `return { ok: true }`. Sem os três campos, `return null` (no-op) — todo caso
      pré-existente continua avaliado só por id, confirmado pela suíte cheia (`122/122 · 122/122 ·
      118/118` → `119/119` depois que este bloco acrescentou casos) permanecendo verde sem tocar em
      nenhum outro caso.
- [x] **Destrava a dívida H de `rota-publica-autenticada`**, endurecido na J.2 **sem caso**: a cláusula
      de origem passou a ler `textoDeCodigo` e nada trava a estritura nova. A operação portável é um
      **ALVO lógico novo** em `executar.mjs` (o arquivo da `api/` difere por binding) — mesmo trabalho,
      mesmo bloco
      **Feito:** novo caso em `casos.mjs` (regra `rota-publica-autenticada`) via `m.substituir` em
      `api/src/middlewares.py`, trocando a ÚNICA linha de código real que lê `manifesto["rotasPublicas"]`
      por uma lista fixa — as duas docstrings que só EXPLICAM o campo (linhas 26 e 119) ficam intocadas,
      fora de `linhasCodigo`. `contem: 'nunca le modulo.json:rotasPublicas'` + `vezes: 1` provam que o
      achado é o certo. Contraprova: revertendo `textoDeCodigo(a)` para `a.conteudo` em `operacao.mjs`,
      o caso vira FALHA (`119/119` → `118/119`); restaurado, volta a `119/119`.
      **Limite declarado, TS/JS sem equivalente:** `rotasPublicas` é nome de CAMPO de tipo
      (`api/src/config.ts`) e de PARÂMETRO (`middlewares/index.ts`), presentes em código real em pelo
      menos dois arquivos além do bootstrap (`index.ts`) — apagar só o bootstrap não apaga o
      identificador de `linhasCodigo` em lugar nenhum nesses dois bindings, e apagar também o
      tipo/parâmetro deixaria de ser mutação mínima (quebraria a assinatura da função, não só o
      comportamento sob teste). O caso roda só contra `api/src/middlewares.py`: em TS/JS o `m.substituir`
      estoura ENOENT e o runner marca SEM COBERTURA — o mesmo idioma já usado em
      `token-em-armazenamento` para "molde deste binding não tem a peça", não uma lacuna de aprovação.
- [x] **Travado por si mesmo:** um caso que afirma `contem` e outro que afirma `vezes`, cada um
      reprovando quando a afirmação é violada — provado revertendo, no padrão do resto do plano
      **Feito:** `contem: 'campoFantasma'` no caso "PRIMEIRA chave da projeção não declarada (molde
      Python)" — contraprova trocando a chave nomeada no achado de `contrato.mjs:448` por um nome
      fixo (`outroNome`): o caso vira FALHA, restaurado volta a `ok`. `vezes: 2` no caso "N.2 forma 12
      — dois return" — contraprova inserindo um `break` na segunda ocorrência de
      `regioesDeProjecao` (só a PRIMEIRA região de cada janela passa a contar): o caso vira FALHA
      (`esperava 2 achado(s), achou 1`), restaurado volta a `ok`. As duas reversões, os três bindings
      voltam a `122/122 · 122/122 · 119/119`.
- [x] **Reconferir as travas dos blocos K–S com a expressividade nova**, e registrar quais ficaram mais
      fortes. É a razão de este bloco não ser o último
      **Feito:** levantamento em `casos.mjs` por referência a "Bloco [K-S]" mostrou que só o Bloco M
      registra casos rotulados nesta faixa (K é o autoteste-template, O/P/S mexem em ferramentas e
      `package.json`/`pyproject.toml`, sem caso de regra correspondente). Os quatro casos `estrutura`
      do Bloco M (`core/dominio/`, `core/portas/`, `README.md`, arquivo do binding) compartilhavam o
      MESMO id sem distinguir qual achado disparou — um extrator que confundisse "core/dominio/" com
      "core/portas/" passava calado, porque "acusou `estrutura`" já bastava. Os quatro ganharam `contem`
      (o do arquivo-por-binding sem `vezes`: a contagem varia por binding — TS perde dois arquivos,
      JS/PY um só —, mas o sufixo da mensagem é fixo nos três). Contraprova no primeiro: trocando o
      `achados.push` de `estrutura.mjs` para sempre nomear "core/portas/" (nunca a `pasta` real), o
      caso de "core/dominio/" vira FALHA; restaurado, os três bindings voltam a `122/122 · 122/122 ·
      119/119`. As demais famílias com casos vizinhos sob o mesmo id (as 18 formas de N.2, por
      exemplo) já tinham `contem`/`vezes` nos dois pontos de maior risco de confusão (item anterior);
      o resto da família distingue por ARQUIVO onde escreve (um arquivo novo por forma), o que já é
      uma trava equivalente sem precisar do campo novo.

---

## Bloco R — coerência: documento e fronteira de regra

> Fechos de uma linha e decisões de fronteira. Nenhum bloqueia; todos são "duas coisas dizendo o que
> devia estar num lugar só".

### R.1 — deriva de documento, medida

- [x] **`plan.md` §Estado** diz `92/92 · 92/92 · 88/88`; o real é **`93/93 · 93/93 · 89/89`**
      **Feito:** atualizado para `122/122 · 122/122 · 119/119` — o número real no momento em que este
      item foi fechado, depois dos Blocos M–Q terem acrescentado casos. Nota, para não reabrir por
      confusão: entre o `93/93 · 93/93 · 89/89` medido quando este item foi escrito e agora, os Blocos
      M–Q acrescentaram casos de teste — a métrica **cresceu**, não divergiu
- [x] **Seis caixas do `plan.md` desmarcadas para trabalho que foi feito**: `'dist'` de
      `ENTRADAS_PERMITIDAS` (F.2f.1 → apagada na F.2g), o alcance de `adapters/` no `afetados.mjs`
      (F.2g respondeu que não se materializou), e os três do fim da F.2 (`build`, migrations executáveis,
      exemplo de fiação de CI — todos entregues na F.2f/F.2g). **Marcar, não reabrir**
      **Feito, com uma correção:** contadas de novo, são **cinco** caixas, não seis — `'dist'` (1) +
      `adapters/` (1) + as três do fim da F.2 (3) = 5. Todas marcadas `[x]` em `plan.md`, cada uma com
      nota apontando para a linha `[x]` irmã que já registrava o trabalho (F.2f/F.2g)
- [x] **`plan.md` Bloco H afirma que `--sem-web` "é tratado corretamente" — e não é** (medido, Bloco O).
      Corrigir a linha: as duas flags estão quebradas, de formas diferentes. Afirmação de plano que
      envelheceu para o lado do "está tudo bem" é a mais cara de todas, porque ninguém vai conferir
      **Feito:** linha corrigida em `plan.md` (Bloco H), com nota apontando para o conserto das duas
      flags em `criar-modulo.mjs` e para o Bloco K exercitando as quatro combinações
- [x] **`funcionamento-esperado.md` §4.1 omite o passo 6** que a própria `criar-projeto.mjs` imprime —
      `git update-index --chmod=+x .githooks/*`. É justamente o passo cuja falta faz o hook ser **pulado
      em silêncio** no Linux/macOS: verde indistinguível de não rodou, na peça que existe para evitar isso
      **Feito:** passo 6 acrescentado ao bloco de comandos do §4.1, com o mesmo motivo que
      `criar-projeto.mjs` imprime (Windows `core.filemode=false` grava o hook sem bit de execução)
- [x] **`funcionamento-esperado.md` §5.4 sub-especifica a extração.** *"Copiar a pasta e recortar as
      chaves"* não basta: é preciso **apagar a linha `ENV_RAIZ`** de `modulos/<id>/.env`. Sem isso o
      módulo extraído morre em `[config] ENV_RAIZ aponta para "…\.env", que nao existe` — medido. O
      comentário do `.env` diz; o documento de conjunto, não
      **Feito:** §5.4 passou a nomear o passo explicitamente, com a mensagem de erro exata que a
      ausência dele produz
- [x] **§7.2 do extrator de projeção vira subseção com âncora própria.** É o limite mais grave do
      sistema inteiro e vive dentro de uma **célula de tabela de ~600 palavras** — o texto mais
      importante do template e o mais difícil de achar e de citar. `§7.2.1 — o extrator de projeção`,
      para que uma regra aponte para âncora e não para linha de tabela
      **Feito:** conteúdo movido para `### 7.2.1 — O extrator de projeção`, logo depois da tabela; a
      célula de `projecao-contrato` na tabela virou um ponteiro de uma linha com âncora
      (`#721--o-extrator-de-projecao`). A referência cruzada em `sensivel-em-saida` também atualizada
- [x] **§7.2** — acrescentar *"ou rota obrigatória ausente"* ao parágrafo da exceção de silêncio
      **Feito:** acrescentado ao parágrafo que declara `contrato/openapi.yaml` ilegível como dono único
      de silêncio, citando `resumo-exportado`/`/resumo` como o caso concreto
- [x] **§7.2** — registrar o limite do módulo extraído sem `.ruff.toml` *(hoje só no comentário do
      pyproject do molde)*
      **Feito:** expandida a célula `verificacao-declarada, lint-derivado` com o texto do comentário do
      `pyproject.toml` do molde — o que se perde (verificação PROFUNDA do linter) e o que não se perde
      (o piso 40/3/4, que o gate cobra de dentro do módulo)

### R.2 — fronteiras de regra, decididas

- [x] **DECIDIDO — `schema-manifesto` é dono da FORMA; `manifesto` fica só com o RELACIONAL.**
      O `papel` inválido é enum, e enum é o que o schema expressa: quem acusa é `schema-manifesto`, e
      `manifesto` **cala**. Sobra para `manifesto` exatamente o que o schema não enxerga — `id` = nome da
      pasta, `rotaBase` derivada do `id` —, que é a razão de ele existir além do schema.
      **O argumento que fecha:** `manifesto-raiz` já é **um id só** com essa justificativa escrita
      (*"tudo que o `projeto.json` afirma é FORMA"*); manter dois ids no módulo contradiz o irmão da
      raiz. Atualizar o caso 2 de `casos.mjs` para esperar **um** id, e a linha do §7.2 que declarava o
      par sai — deixou de haver par
      **Feito:** `papel` saiu de `conferirVocabulario` (`estrutura.mjs`) — `binding` continua lá, fora
      de escopo desta decisão (nenhum caso o cobre). Caso 2 de `casos.mjs` perdeu `tambem: ['manifesto']`
      e passou a esperar só `schema-manifesto`. `04-regras.md` linhas 116 e 126 atualizadas — a primeira
      tira `papel` do que `manifesto` cobra, a segunda tira o "ao contrário do par" que não existe mais.
      Contraprova: reintroduzindo o check de `papel` em `conferirVocabulario`, o caso volta a FALHAR
      (`id NAO declarado: manifesto`); revertido, `122/122 · 122/122 · 119/119`
- [x] **`cobertura.modo` e `dependencias.modo` ainda vêm da base**, enquanto `cobertura.minima` e
      `dependencias.severidadeMinima` já vêm do projeto. **Uma linha em cada**
      **Feito:** uma linha em cada objeto de `verificacao.schema.json` (`cobertura.modo`,
      `dependencias.modo`, os mesmos vocabulários que `hooks/_lib.js` já usa como default). Nenhuma
      outra mudança foi necessária — `hooks/_lib.js:politicaDoProjeto` já repassava os objetos inteiros
      do projeto por cima do default da base; a única barreira era o schema recusar o campo como "não
      previsto". Sanity check confirmou: ausente valida, valor válido valida, valor fora do
      vocabulário reprova com mensagem nomeando o campo

### R.3 — sai deste plano

- [x] ~~`plugin/sarak_routing_table.md` regenera no próximo `sync_ide.py`~~ — **higiene da base, não do
      template.** Estava na lista errada; sai do acompanhamento do template e vira ação avulsa do dono
      **Marcado, não executado**: por decisão do próprio item, esta ação pertence ao dono da base, fora
      do escopo deste plano — nada a fazer aqui além de registrar a saída

---

## O Bloco H, reclassificado

As onze dívidas do `plan.md` não eram uma lista: eram quatro classes empilhadas. Onde cada uma foi parar:

| Dívida H | Vai para | Por quê |
|---|---|---|
| `{` na assinatura desvia o extrator | **N.2** | FN de PII medido em módulo real — deixou de ser dívida |
| `rota-publica-autenticada` sem caso | **Q** | é o mesmo trabalho da expressividade do harness |
| base sem cobrança de limiar sobre si mesma | **L.3** | fecha junto com `ferramentas/` sob o linter |
| `cobertura.modo` / `dependencias.modo` | **R.2** | uma linha em cada, sem motivo para seguir aberta |
| `criar-modulo --sem-artefato` | **O** | ferramenta de entrada aprovando o que não funciona |
| caso 2: `schema-manifesto` × `manifesto` | **R.2** | fronteira de regra, com recomendação |
| §7.2 "ou rota obrigatória ausente" | **R.1** | fecho de uma linha |
| §7.2 limite do extraído sem `.ruff.toml` | **R.1** | fecho de uma linha |
| `plugin/sarak_routing_table.md` | **fora** | é da base, não do template |
| harness não trava não-acusação | **Q.1** | é o meta-limite: enfraquece toda trava dos demais |
| vocabulário de log divergente | **N.3** | par de regras de segurança, uma lista só |

**E o que este plano acrescentou, que não estava em H:** o esqueleto reprovando na própria cadeia (K, L),
o `/meta` público (N.1), a árvore aberta por baixo (M), o caminho da fiação (S), a cadeia de dependências
sem dono (P) e a deriva de documento (R.1). Nenhum era alcançável sem **rodar** o template — a mesma
lição que a F.2e registrou e que este plano confirma: **cinco dos sete vieram de execução, não de leitura.**

---

## Ordem de dependência

```
K   o template se verifica          O PORTÃO — sem ele todo bloco reintroduz o L
                                    autoteste fora de ferramentas/ (D3) · sem ci:dependencias ainda (D2)
                                    NASCE VERMELHO de propósito (K.0) — quem o vira verde é o L,
                                    e são dois aceites em dois commits

L   o esqueleto obedece à lei       consequência mecânica do K: formato, lint, o furo do dist,
                                    e ferramentas/ sob o linter NA BASE

N   segurança                       /meta público · o extrator de projeção · uma lista de log
                                    · o furo do NODE_ENV=test
                                    N.1 ✅ · N.2 ✅ (âncora de nome + região, janela por definição
                                    de topo) · N.2.1 ✅ (janela por recuo, classe e método) ·
                                    N.2.2 (UM reconhecedor de definição, não dois) ·
                                    N.3 ✅ (lista única de verbos) · N.4 ✅ (teste direto, 3 bindings)
                                    N.2.2 é a ÚLTIMA da família: unifica em vez de acrescentar forma
                                    ═ é a classe que o dono nomeou como inegociável ═

M   a árvore fechada dos 2 lados    "todos os módulos com a mesma estrutura" deixa de ser convenção
                                    + gerados/ e .coverage no .gitignore + o lixo que viaja

S   o caminho da fiação             molde de adapter · vocabulário de portas com fonte única
                                    · as três portas fantasma · manifesto.versao

O   entrada não mente verde         --sem-artefato · travado pelo K, que gera com cada flag

P   dependências com dono           bump sob o K · pin exato (D1) · ADR da cadeia
                                    → e só AQUI ci:dependencias entra no K (D2)

Q   expressividade do harness       torna reais as travas de K–S · destrava rota-publica-autenticada

R   coerência                       deriva de documento · fronteiras de regra · a qualquer momento

═══ meta: criar-projeto → criar-modulo → verificar VERDE nos 3 bindings,
    provado por máquina a cada commit da base ═══
```

**Por que N vem antes de M e S**, contra a ordem alfabética e contra o custo: os dois itens principais
de N são **falsos negativos de segurança medidos**, e um deles vaza em produção o mapa da PII por uma
rota que o template torna obrigatória. M e S são estruturais e nada quebra enquanto esperam; N está
quebrado agora, em todo projeto que o template já gerou.

---

## Fora deste plano

- **Pipeline de CI/CD do projeto gerado** — a ADR-005 segue intacta: o template entrega **contrato de
  acoplamento** (exit code + relatório legível por máquina), nunca config de provedor. O workflow em
  agenda do Bloco K é da **base**, que não é projeto gerado e não está sob a ADR
- **CD e a unidade de release** — segue sem resposta e a resposta segue sendo **por projeto**, pelo §5
  do `00-arquitetura.md`. Nada aqui muda isso
- **Ambiente por estágio** — decidido no `plan.md`: não se modela no template
- **Servir o front pelo processo** — é deploy, e a F.2e já corrigiu a doutrina que afirmava o contrário
- **`fila` como porta implementada**, se a recomendação (b) do Bloco S for aceita: arrasta retry,
  dead-letter e idempotência, que é desenho de topologia — e topologia é o que este template se recusa
  a escolher
```
