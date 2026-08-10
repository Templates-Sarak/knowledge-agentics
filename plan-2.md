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

Continua vigente a regra permanente do `plan.md`: **regra nova exige caso próprio** em
`ferramentas/gate/testes/casos.mjs` e linha no catálogo (§4.x), mais o limite conhecido no §7.2.

---

## Estado — medido, com o comando ao lado

| Métrica | Valor | Confira com |
|---|---|---|
| Regras no catálogo | **74**, todas com caso | `node ferramentas/gate/testes/executar.mjs --binding <b>` |
| Autoteste do gate | `111/111` (TS) · `111/111` (JS) · `107/107` (PY) *(era `96/96·96/96·92/92` antes do N.2 — 15 casos novos do N.2, nenhuma regra nova)* | idem *(o `plan.md` §Estado ainda diz `92/92·92/92·88/88` — deriva, Bloco R)* |
| **Projeto novo passa em `verificar`?** | **SIM — nos três bindings** (Bloco K fechado) | `npm run autoteste:template` |
| **Projeto novo passa em `ci:dependencias`?** | **NÃO — 2 critical + 1 high** | Bloco P |
| **`build` seguido de `lint`?** | **SIM** — furo do dist consertado (Bloco L) | `npm run autoteste:template` |
| Módulo pode perder `core/` inteiro e ficar verde? | **SIM** | Bloco M |
| `GET /meta` público devolve o manifesto inteiro? | **NÃO — corrigido (N.1)**. *N.3/N.4 do Bloco N seguem abertos* | Bloco N |
| `paraMeta`/`paraColecao` visíveis a `projecao-contrato`/`sensivel-em-saida`? | **SIM — corrigido (N.2)**. Antes: invisíveis (âncora de nome estreita) | Bloco N |
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

- [ ] **A janela fecha na próxima definição de recuo MENOR OU IGUAL ao do sítio que a abriu**, em vez de
      coluna zero. Generaliza em vez de abrir caso especial: coluna zero passa a ser o caso particular
      de um sítio de topo
- [ ] **A técnica já existe neste arquivo** — `achadosDeBordaPython` (N.1) delimita o corpo do handler
      por `recuo <= recuoDecorador`. Os dois âncoras do `contrato.mjs` passam a operar sob a mesma
      ideia, e é o argumento que dispensa inventar uma segunda
- [ ] **Caso próprio:** classe com projeção seguida de método que **não** publica (`chaveDeCache`), nos
      três bindings — no Python, `class` com dois métodos. Trava a **não-acusação**, que é o lado difícil
- [ ] **Não pode regredir o que a N.2 fechou:** a última `para*` de topo continua fechando na função
      vizinha. O caso que a N.2 salvou (`contrato sem os endpoints obrigatorios`, que passou a reprovar
      com `projecao-contrato` sem ninguém tocá-lo) é a trava dessa direção
- [ ] **§7.2 alinhado com o comportamento real**: hoje a linha promete método de classe e entrega FP.
      Ou o conserto acima a torna verdadeira — e é o que este item faz —, ou a promessa sai da lei

**Alcance:** o molde usa funções de topo, então **nenhum projeto gerado hoje esbarra nisto**. Entra
porque o template é referência de vários sistemas e mapeador em classe é TypeScript ordinário — e
porque a lei já o promete.

### N.3 — uma lista de chamada de log, não duas  *(dívida H)*

- [ ] `segredo-em-log` reconhece `logging`, `warning`, `critical`, `exception`, `console.*`, `print(`;
      `sensivel-em-saida` reconhece **menos**. As duas cobrem a mesma classe de vazamento em escopos
      diferentes, e a divergência está declarada no §7.2 como dívida
- [ ] **Uma constante compartilhada**, no padrão de `URL_LITERAL`/`PADRAO_CREDENCIAL`. Se a diferença
      precisar existir (na raiz não há regra proibindo `console`; ali quem cobra é o linter), ela vira
      um **filtro nomeado sobre a lista única**, nunca duas listas
- [ ] Muda o comportamento de `sensivel-em-saida` (regra de módulo) → **caso próprio para a acusação
      nova**, nos três bindings

### N.4 — o furo do `NODE_ENV === 'test'`

- [ ] `conferirEnvRequerido` (`api/src/config.ts:120`) **pula a verificação inteira** quando
      `NODE_ENV === 'test'`. Pragmático — sem isso nenhum teste roda sem `.env` —, mas significa que
      **suíte verde não prova fiação de ambiente**, e não achei isso declarado no §7.2
- [ ] Fechar **ou** declarar. A saída provável é declarar com precisão: os testes usam dublês, o boot
      real é que cobra, e o `--autoteste` do entrypoint já prova o caminho. Mas *"verde tem de significar
      verificou"* exige que a exceção esteja escrita

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

- [ ] **`estrutura` passa a exigir o conjunto obrigatório do molde**, por binding: `core/dominio/`,
      `core/portas/`, `README.md`, `modulo.json`, e o arquivo de tipos quando o binding o tem
      (`tsconfig.json` em TS). **Uma mensagem por entrada faltante**, nomeando o conserto
- [ ] **A fronteira com quem já cobra**, para não haver duas mensagens para um defeito: `contrato/` é do
      id `contrato`; `web/` é do `web-declarado`; `core/motor`, `core/templates` e `gerados/` são do
      `artefato-declarado` (bidirecional por `geraArtefato`); `database/` é do `migrations`, ligado a
      `dados.tabelas`. **O bloco não repete nenhum deles** — só cobre o que hoje não tem dono
- [ ] **`core/gateways/` fica de fora**: módulo sem `consome` legitimamente não tem gateway, e cobrá-lo
      seria falso positivo garantido — a direção proibida
- [ ] **Caso de teste por entrada obrigatória**: apagar cada uma reprova com **id próprio**, e a
      não-acusação das opcionais fica travada por chamariz em caso de outra regra (a técnica da J.2)
- [ ] **`gerados/` entra no `.gitignore` da raiz.** A pasta existe com `.gitkeep` nos três bindings, o
      gate ignora o conteúdo, o linter ignora — **e o git versiona**. Toda saída de máquina do módulo
      vai para o repositório hoje
- [ ] **`.coverage` entra no `.gitignore` de TS/JS.** A F.2c já registrou a nota de acoplamento — a
      tolerância em `estrutura-estrita` é global aos três bindings, mas o `.gitignore` que a cobre é só
      o do Python. Fechar a assimetria
- [ ] **`criar-projeto.mjs` para de copiar lixo.** `cpSync` leva `bindings/python/raiz/**/__pycache__`
      sem filtro — confirmado dentro de um `revpy` gerado. Não está versionado (clone limpo nasce
      limpo), mas o template é copiado **do disco de quem o roda**, e é ali que a garantia tem de valer
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

---

## Bloco S — o caminho da fiação

> **O template está completo para construir módulos e incompleto para construir a infraestrutura que os
> módulos consomem.** O caminho *"domínio → borda"* é pavimentado ponta a ponta: molde, comando, gate,
> testes. O caminho *"porta → adapter"* é feito à mão, sem molde e sem forma cobrada — e é onde o
> Bloco I inteiro argumentou que a **arquitetura concentra o risco de propósito**.
>
> As três lacunas abaixo são a mesma lacuna vista de três ângulos.

- [ ] **Não existe molde de adapter nem `criar-adapter`.** `adapters/` traz só `memoria`. Todo projeto
      real escreve o primeiro adapter (Postgres) à mão, sem molde: a promessa *"todos com a mesma
      estrutura"* vale para módulo e **não vale para adapter**
- [ ] **O vocabulário de portas mora em três lugares que precisam concordar, e nada verifica:**
      `packages/portas/index.ts:PORTAS_CONHECIDAS` · `schemas/config-portas.schema.json:properties` ·
      `schemas/modulo.schema.json:portas.items.enum`. Hoje são **8 em cada e idênticos — por sorte**.
      Acrescentar a nona editando dois dos três falha em silêncio numa direção
- [ ] **Três dos oito nomes são só nomes.** `storage`, `notificador` e `fila` **não têm interface** em
      `packages/portas/`, **não têm adapter** e **não têm fábrica** (`FABRICAS` tem 4: repositório,
      auditoria, relógio, geradorId; `auth` vem por `resolverAuth`). Declarar `"storage"` passa no gate
      e **morre no boot** com *"sem fabrica registrada"* — falha honesta, mas o gate aprovou. E são
      justamente as três que quase todo projeto real precisa: upload, e-mail, job
- [ ] **DECIDIDO — `storage` e `notificador` ganham substância; `fila` sai do vocabulário.**
      Os dois primeiros aparecem em quase todo projeto (upload e e-mail), a interface é pequena e o
      adapter de memória é barato — implementá-los é fechar o vocabulário com conteúdo.
      **`fila` sai**: ela arrasta retry, *dead-letter*, idempotência e ordem de entrega, e isso é
      **desenho de topologia** — precisamente o que o `00-arquitetura.md` §5 diz que o template não
      escolhe. Nome sem interface é declaração sem efeito, o mesmo argumento que apagou `'dist'` de
      `ENTRADAS_PERMITIDAS` na F.2g. Ela volta no dia em que houver um projeto com a decisão tomada, e
      volta como ADR
- [ ] **`Storage` e `Notificador`, ponta a ponta**, nos três bindings: interface em `packages/portas/`,
      adapter de memória, fábrica em `FABRICAS`, e um módulo do K declarando uma delas — porque porta com
      fábrica que ninguém exercita é a mesma classe de declaração órfã, só que mais bem escondida.
      **Superfície mínima e tipada por operação** (a propriedade que a F.0 mediu e que sustenta
      `sql-no-modulo`): nada de `executar(comando: string)`
- [ ] **DECIDIDO — fonte única do vocabulário, com os schemas DERIVADOS.** Uma lista, e os dois schemas
      gerados dela pelo `gerar-config-lint.mjs` (ou um irmão dele), com `--conferir` e exit 1 na
      divergência — no precedente exato do `lint-derivado`. *Recusada:* uma regra de escopo `raiz` que
      compara os três e acusa. **Impedir é melhor que acusar**, e o template já escolheu isso uma vez
      quando fez a config do linter ser gerada em vez de conferida por regra
- [ ] **`manifesto.versao` ganha consumidor: é o `/meta` projetado da N.1.** Ele entra na allowlist e
      passa a ter leitor — e a alternativa (tirá-lo do obrigatório) fica recusada porque versão de módulo
      é o dado que o consumidor de `consome` precisa quando o contrato muda ([[02-contrato-e-dados]] §5).
      **Dependência explícita: este item fecha DEPOIS da N.1**

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

- [ ] **`criar-adapter.mjs <porta> <provedor>`** — copia o molde, substitui marcadores, registra a
      fábrica e **roda o gate**. Mesma forma do `criar-modulo.mjs`, e sujeito ao mesmo aceite do Bloco O:
      **qualquer combinação de argumentos produz artefato conforme**, ou o comando não existe

---

## Bloco O — a ferramenta de entrada não mente verde

> `criar-modulo.mjs` roda o gate ao final e **imprime OK** — é a primeira coisa que um usuário novo vê,
> e é onde a confiança no padrão nasce. Ela não pode aprovar o que não funciona.

- [ ] **`--sem-artefato` gera módulo quebrado, e o gate diz verde.** Medido:
      ```
      node ferramentas/criar-modulo.mjs relatorio --sem-artefato
      → gate:   "relatorio: 0 erro(s), 0 aviso(s) — conformidade: OK"
      → tsc:    TS2307 Cannot find module '../../core/motor/index.js'
      → vitest: 1 failed
      → ci:cobertura: reprova o workspace inteiro
      ```
      A flag remove `core/motor/` e deixa `tests/dominio/dominio.test.ts` importando dele
- [ ] **`--sem-web` TAMBÉM está quebrado — a afirmação herdada era falsa.** O `plan.md` (Bloco H) diz
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
      o mesmo invariante: *a ferramenta de entrada entrega artefato conforme, sempre*
- [ ] **DECIDIDO — podar, nas duas.** `--sem-artefato` remove também a parte do teste que depende do
      motor; `--sem-web` zera `navegacao` junto com `rotaWeb`.
      *Recusada:* aposentar as flags (módulo sem artefato se faz zerando `geraArtefato` e apagando as
      três pastas, que `artefato-declarado` já cobra nos dois sentidos). Elas são úteis e o conserto é
      pequeno; aposentar seria trocar um defeito de duas linhas por trabalho manual em todo projeto
- [ ] **O invariante que passa a valer, e é o aceite do bloco:** *qualquer* combinação de flags de
      `criar-modulo.mjs` produz módulo que passa em `verificar`. Hoje são 4 combinações
      (nenhuma · `--sem-artefato` · `--sem-web` · as duas) × 3 papéis
- [ ] **O Bloco O ESTENDE o gerador do K** para as 4 combinações (nenhuma flag · `--sem-artefato` ·
      `--sem-web` · as duas) e roda a cadeia em cada uma. A extensão é **aceite do O**, não do K — o
      K nasceu cobrindo só o módulo padrão (D2: "o K cresce com os blocos")
- [ ] **A pergunta que fica registrada:** o gate aprovar um módulo que não compila é falha do gate ou
      fronteira dele? A resposta honesta é **fronteira** — o gate é estático e não executa, de propósito
      (é o que o faz viajar). Então o conserto é na **ferramenta**, não na regra; e o Bloco K é quem
      cobre a classe inteira, porque ele executa

---

## Bloco P — a cadeia de dependências tem dono

> **Projeto novo nasce vermelho num passo de CI que o próprio template entrega.** É a mesma classe da
> F.2d.1 — a ferramenta acusando o pacote que a instalou —, só que a origem agora é externa.

- [ ] **Medido num projeto recém-gerado**, sem uma linha minha:
      ```
      npm audit  → 6 vulnerabilidades (2 critical, 1 high, 3 moderate)
      npm run ci:dependencias → x vite (high) · x vitest (critical) — REPROVA, exit 1
      ```
      E a correção **exige salto de major** (`vitest 4.1.10`, `vite 8.2.1`): não sai com `audit fix`
- [ ] **Enquanto isso, o único caminho verde é escrever exceção de CVE datada num projeto que nasceu
      hoje** — o que corrói exatamente a disciplina que a F.2d montou. Exceção existe para *"o mundo
      mudou depois"*, não para *"nasceu assim"*
- [ ] **Bump da cadeia inteira**, nos três bindings: `vitest`, `vite`, `@vitest/coverage-v8`, `eslint`,
      `typescript`, `express`, `react`, `jsdom`, `prettier`, `ruff`, `mypy`, `pytest`. **Sob o K** — é
      ele que torna o salto de major barato, e é a primeira vez que ele paga o próprio custo
- [ ] **Pin exato substitui `^` em todo o esqueleto** (D1), nos três bindings
- [ ] **ADR novo — "a cadeia de ferramentas do template"**: por que fixa, quem decide o bump, com que
      cadência, e o limite de que projeto já criado não recebe atualização
- [ ] **`ci:dependencias` entra no K** (D2) e vira o sensor de envelhecimento
- [ ] **Limite já conhecido, que segue valendo:** `pip-audit` não reporta severidade, então o piso de
      `severidadeMinima` só filtra o npm — declarado no §7.2 desde a F.2d, e a mudança de versão não o
      altera

---

## Bloco Q — expressividade do harness

> **O harness compara conjunto de ids.** Ele não consegue travar uma **não-acusação sob regra que
> dispara**: se `segredo-em-log` acusasse a chave errada, sairia sob o mesmo id e o autoteste passaria.
> Em I.2 deu para contornar via id não declarado; em I.3 não deu.
>
> Enquanto isso valer, **toda trava dos outros blocos é mais fraca do que parece** — inclusive as deste
> plano. Por isso ele vem depois dos consertos e antes de fechar a conta.

- [ ] **O caso passa a poder afirmar mais que o id**: `{ id, arquivo?, contem?, vezes? }`. Não é um
      framework de asserção — são três campos opcionais, e o caso que não os usa continua valendo
      exatamente como hoje (compatibilidade para trás é requisito, não bônus)
- [ ] **Destrava a dívida H de `rota-publica-autenticada`**, endurecido na J.2 **sem caso**: a cláusula
      de origem passou a ler `textoDeCodigo` e nada trava a estritura nova. A operação portável é um
      **ALVO lógico novo** em `executar.mjs` (o arquivo da `api/` difere por binding) — mesmo trabalho,
      mesmo bloco
- [ ] **Travado por si mesmo:** um caso que afirma `contem` e outro que afirma `vezes`, cada um
      reprovando quando a afirmação é violada — provado revertendo, no padrão do resto do plano
- [ ] **Reconferir as travas dos blocos K–S com a expressividade nova**, e registrar quais ficaram mais
      fortes. É a razão de este bloco não ser o último

---

## Bloco R — coerência: documento e fronteira de regra

> Fechos de uma linha e decisões de fronteira. Nenhum bloqueia; todos são "duas coisas dizendo o que
> devia estar num lugar só".

### R.1 — deriva de documento, medida

- [ ] **`plan.md` §Estado** diz `92/92 · 92/92 · 88/88`; o real é **`93/93 · 93/93 · 89/89`**
- [ ] **Seis caixas do `plan.md` desmarcadas para trabalho que foi feito**: `'dist'` de
      `ENTRADAS_PERMITIDAS` (F.2f.1 → apagada na F.2g), o alcance de `adapters/` no `afetados.mjs`
      (F.2g respondeu que não se materializou), e os três do fim da F.2 (`build`, migrations executáveis,
      exemplo de fiação de CI — todos entregues na F.2f/F.2g). **Marcar, não reabrir**
- [ ] **`plan.md` Bloco H afirma que `--sem-web` "é tratado corretamente" — e não é** (medido, Bloco O).
      Corrigir a linha: as duas flags estão quebradas, de formas diferentes. Afirmação de plano que
      envelheceu para o lado do "está tudo bem" é a mais cara de todas, porque ninguém vai conferir
- [ ] **`funcionamento-esperado.md` §4.1 omite o passo 6** que a própria `criar-projeto.mjs` imprime —
      `git update-index --chmod=+x .githooks/*`. É justamente o passo cuja falta faz o hook ser **pulado
      em silêncio** no Linux/macOS: verde indistinguível de não rodou, na peça que existe para evitar isso
- [ ] **`funcionamento-esperado.md` §5.4 sub-especifica a extração.** *"Copiar a pasta e recortar as
      chaves"* não basta: é preciso **apagar a linha `ENV_RAIZ`** de `modulos/<id>/.env`. Sem isso o
      módulo extraído morre em `[config] ENV_RAIZ aponta para "…\.env", que nao existe` — medido. O
      comentário do `.env` diz; o documento de conjunto, não
- [ ] **§7.2 do extrator de projeção vira subseção com âncora própria.** É o limite mais grave do
      sistema inteiro e vive dentro de uma **célula de tabela de ~600 palavras** — o texto mais
      importante do template e o mais difícil de achar e de citar. `§7.2.1 — o extrator de projeção`,
      para que uma regra aponte para âncora e não para linha de tabela
- [ ] **§7.2** — acrescentar *"ou rota obrigatória ausente"* ao parágrafo da exceção de silêncio
- [ ] **§7.2** — registrar o limite do módulo extraído sem `.ruff.toml` *(hoje só no comentário do
      pyproject do molde)*

### R.2 — fronteiras de regra, decididas

- [ ] **DECIDIDO — `schema-manifesto` é dono da FORMA; `manifesto` fica só com o RELACIONAL.**
      O `papel` inválido é enum, e enum é o que o schema expressa: quem acusa é `schema-manifesto`, e
      `manifesto` **cala**. Sobra para `manifesto` exatamente o que o schema não enxerga — `id` = nome da
      pasta, `rotaBase` derivada do `id` —, que é a razão de ele existir além do schema.
      **O argumento que fecha:** `manifesto-raiz` já é **um id só** com essa justificativa escrita
      (*"tudo que o `projeto.json` afirma é FORMA"*); manter dois ids no módulo contradiz o irmão da
      raiz. Atualizar o caso 2 de `casos.mjs` para esperar **um** id, e a linha do §7.2 que declarava o
      par sai — deixou de haver par
- [ ] **`cobertura.modo` e `dependencias.modo` ainda vêm da base**, enquanto `cobertura.minima` e
      `dependencias.severidadeMinima` já vêm do projeto. **Uma linha em cada**

### R.3 — sai deste plano

- [ ] ~~`plugin/sarak_routing_table.md` regenera no próximo `sync_ide.py`~~ — **higiene da base, não do
      template.** Estava na lista errada; sai do acompanhamento do template e vira ação avulsa do dono

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
                                    N.1 ✅ · N.2 ✅ · N.2.1 (janela por recuo) · N.3 · N.4
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
