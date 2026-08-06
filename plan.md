# Plano — verificação completa do template de módulos

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **Objetivo:** template reprodutível e **auto-verificável**, com todos os insumos de verificação
> (gate estático + lint + testes) prontos antes de montar o pipeline de CI/CD.

**Regra permanente:** toda regra nova exige, por `04-regras.md` §7.3, um **caso de teste próprio**
em `ferramentas/gate/testes/casos.mjs` e uma **linha no catálogo** (§4.x), mais o limite conhecido
no §7.2 quando houver. Regra sem caso não entra.

---

## Estado

| Métrica | Valor |
|---|---|
| Regras no catálogo | **72** |
| Regras com caso de teste próprio | **72** — cobertura total |
| Bindings | `typescript` · `javascript` · `python` — gate verde nos três |
| Escopos do gate | `modulo` · `global` · **`raiz`** (novo em I.1) |
| Autoteste | `87/87` (TS) · `87/87` (JS) · `83/83` (PY) |
| Pipeline do `verificar` | gate → env → formato → lint → tipos → testes, nos três bindings |

**Meta ao fim de todos os blocos:** ~70 regras, todas com caso, cobertura uniforme entre bindings —
e a **raiz** deixando de ser território sem verificador (Bloco I).

> **Unidade de verificação.** Até aqui o gate cobre **o módulo**. O Bloco I acrescenta o escopo
> **`raiz`** — `adapters/`, `src/`, `packages/` —, que nasce com o sistema, existe uma só, e é onde
> a arquitetura concentra o risco de propósito.

---

## Concluído

- [x] Importação do template para `specs/_estrutura_modulos/`, doutrina virando `specs/arquitetura/`
- [x] Três níveis com um dono cada (N0 `padrao-escrita` · N1 `04-regras.md` · N2 `padrao-<linguagem>`)
- [x] Gate honesto sobre os próprios limites (§7.2 reescrito, sem limite morto nem escondido)
- [x] Autoteste exige **igualdade** de ids — extra não declarado reprova (`tambem` como teto)
- [x] Coerência da base cobrada por máquina (`ponteiros.py`: citado→existe **e** existe→indexado)
- [x] `padrao-go` / `padrao-java` aposentadas sem perder norma
- [x] `test-api-contrato` reposicionada no que o gate estático não alcança
- [x] Campos órfãos do manifesto: `geraArtefato`, `ui`, `exportaResumo` → 4 regras novas

---

## Bloco A — Fundação

> Destrava B, C, D e G. Nada lê limiar antes disto existir.
>
> **Decisões tomadas:** os limiares 40/3/4 são **lei**, não política — vivem em
> `ferramentas/gate/limiares.mjs`, dentro do gate, e por isso viajam com o módulo extraído. O
> `verificacao.json` guarda só o que é ajustável por projeto. A config do linter é **gerada e
> versionada**, com a deriva cobrada por regra.

### A.1 — a camada  ✅ **concluído**
- [x] `ferramentas/gate/limiares.mjs` — fonte única; `escrita.mjs` consome
- [x] `config/verificacao.json` + schema *(cobertura, severidade de CVE, ferramenta por linguagem)*
- [x] `ferramentas/gerar-config-lint.mjs` — determinístico, com `--conferir` (exit 1 na divergência)
- [x] eslint (flat config) em TS/JS com as 5 regras que espelham o gate
- [x] `.ruff.toml` na raiz; `[tool.ruff]` **removido** do pyproject do módulo — declarar ali
      *sombreia* a raiz e devolve os limiares ao default do ruff
- [x] Formatador: `prettier` e `ruff format`, em `--check` no `verificar`
- [x] `verificar` dos 3 bindings: gate → env → **formato** → **lint** → tipos → testes
- [x] `criar-projeto.mjs` instala tudo

**Achado:** 32 arquivos do molde Python e 20 de TS/JS estavam fora de formato — nunca houve
formatador no template. Moldes reformatados.

**Limite conhecido:** módulo extraído fica sem `.ruff.toml` até ser religado a um esqueleto. O piso
do gate não cai (os limiares viajam em `ferramentas/gate/`); a A.3 fecha a janela.

### A.2 — as regras que cobram a camada  ✅ **concluído**
- [x] `verificacao-declarada` — o arquivo existe, é JSON válido e conforma ao schema
- [x] `lint-derivado` — a config na raiz é **alguma saída do gerador**; divergência reprova
- [x] `ctx.projeto` — ponto próprio em `contexto.mjs`, memoizado por raiz (o dado é por projeto;
      com 10 módulos, `carregarContexto` roda 10 vezes)
- [x] Guarda `ehProjeto` — módulo extraído e ainda solto não é projeto, e não é cobrado
- [x] Uma implementação só: a regra e o harness importam `saidaDe` do gerador

**Achado:** o `gate/README.md` afirmava "três regras globais" — são quatro desde `consome-contrato`.

### A.3 — config de lint **por módulo**, gerada do manifesto  ⟵ **AGORA**

> **Por que depois do Bloco B:** A.3 entrega **precisão** — `import-lateral`, `import-adapter`,
> `sdk-fornecedor` e `env-fora-do-carregador` já funcionam no gate, e o eslint só resolveria melhor
> alias, re-export e import dinâmico. O Bloco B entrega **cobertura**: invariantes de segurança que
> hoje não existem em regra nenhuma. Cobertura antes de precisão.
>
> Retomada: B, C, D e I estão fechados. É a vez dela.
- [ ] `import-lateral`, `import-adapter`, `sdk-fornecedor`, `env-fora-do-carregador` no eslint,
      com os caminhos derivados de cada `modulo.json` — AST resolve alias, re-export e import
      dinâmico; regex não. **Continuam também no gate**, como piso de extração
- [ ] Fecha a janela do módulo extraído: o módulo passa a carregar a própria config
- [ ] Exige decidir se `.ruff.toml` entra em `ENTRADAS_PERMITIDAS` (`regras/estrutura.mjs`)

---

## Bloco B — Segurança  *(7 de 8)*

### B.1 — segredo e RNG  ✅ **concluído**
- [x] `gitignore-segredo` — `.gitignore` da raiz cobre `.env` e `modulos/*/.env`
      *(o `.env` já versionado exige `git ls-files` → é passo de CI, estágio 0)*
- [x] `segredo-em-publico` — valor secreto em variável de **prefixo público** (`VITE_`/`NEXT_PUBLIC_`),
      que o bundler injeta no front. **A formulação óbvia é invertida**: chave *sem* prefixo não vaza,
      porque o bundler não a expõe
- [x] `random-inseguro` — RNG não-criptográfico gerando token/segredo **fora de `core/`**;
      dentro de `core/` o dono é `determinismo`, e nunca acusam a mesma linha

### B.2 — superfície HTTP e sessão  ✅ **concluído**
- [x] `rota-publica-autenticada` — a `api/` lê `modulo.json:rotasPublicas` e não escreve rota
      literal; toda entrada declarada existe no contrato **com aquele método**.
      *A cláusula "o middleware está na posição certa" foi **descartada**: o wiring é do bootstrap
      em TS/JS e de `registrar_middlewares` no Python — matcher que só funciona em 2 de 3 bindings
      é cobertura inventada. Declarado no §7.2*
- [x] `entrada-allowlist` — spread do corpo, corpo direto ao repositório, `Object.assign` em massa.
      *Passar o corpo para uma função é o caminho certo, não o defeito*
- [x] `cookie-seguro` — cookie de **sessão** sem `HttpOnly`/`Secure`/`SameSite`. Vocabulário próprio,
      **não** o de `random-inseguro`: aquele inclui `csrf`, e o cookie CSRF double-submit precisa ser
      legível por JS
- [x] `token-em-armazenamento` — token em `localStorage`/`sessionStorage`. O identificador
      `sessionStorage` carrega "session", então ele é removido antes da busca por contexto secreto

### B.3 — `sql-concatenado`  ↪ **movido para o Bloco I**
Onde a query é montada é no **adapter**, que vive fora de `modulos/` — o módulo não pode nem ter
driver (`sdk-fornecedor`) nem importar adapter (`import-adapter`). A regra pertence ao escopo `raiz`.
Sobra no módulo um vetor residual — string SQL crua entregue a uma porta — a **reavaliar depois de
I.3**: coberta a raiz, pode não valer uma regra.

---

## Bloco I — Escopo `raiz`  ✅ **concluído**

> **O problema.** `listarModulos` devolve só `modulos/*/` com `modulo.json`. `adapters/`, `src/` e
> `packages/` **nunca são analisados** — 57 regras para o módulo, **zero** para a fiação.
>
> E não é periferia: a raiz **nasce com o sistema** (`criar-projeto` a cria, `criar-modulo` só
> acrescenta módulos), existe **uma só** enquanto os módulos são N, e a arquitetura **empurra o
> risco para ela de propósito** — o módulo é proibido de tocar banco, importar adapter e ler env
> fora do carregador, então conexão, query, credencial e verificação de token acontecem todas ali.
>
> **Correção de fato:** o gate vive em `ferramentas/gate/`, na **raiz**, não dentro do módulo.
> Extrair um módulo não leva o gate — o esqueleto novo o repõe, junto com `adapters/`, `src/` e
> `packages/`. Regra de raiz sobrevive à extração como qualquer outra.
>
> **Já coberto ali:** desde a A.1 o eslint e o ruff rodam sobre o projeto inteiro — limiares,
> `no-console` e exceção engolida **valem** em `adapters/`. O que falta é regra **arquitetural**.
>
> **Nomenclatura:** *adapter* ≠ *middleware*. Middleware intercepta a requisição e vive **dentro**
> do módulo (`api/src/middlewares/`); adapter implementa uma **porta** que o módulo declara e vive
> **fora** (`adapters/`). O módulo *tem* middlewares e *usa* adapters.

### I.1 — manifesto de raiz  ✅ **concluído**

**Decidido: a raiz ganha manifesto.** O motivo é concreto — `sincronizar-env.mjs` gera o
`.env.example` da raiz **só a partir de `modulo.json:envRequerido`**. No dia em que a raiz precisar
de segredo próprio (`JWT_SECRET` para `resolverAuth()`, `DATABASE_URL` do adapter real, chave de
provedor), ele nasce **órfão**: fora do `.env.example`, invisível a `env-declarado` e a
`env-exemplo`. O segredo mais sensível do sistema é o único que ninguém declara.

- [x] **`projeto.json` na raiz** + `projeto.schema.json`. Nasce com **um** campo: `envRequerido`
- [x] **Escopo `raiz`** no motor, na impressão e no autoteste — roda **uma vez por projeto**
- [x] `ctx.projeto.codigo` — varre `adapters/`, `src/`, `packages/`; **nunca** entra em `ctx.codigo`
- [x] Convenção `RAIZ_<ASSUNTO>`, com o limite da colisão declarado no §7.2
- [x] `sincronizar-env.mjs` inclui as chaves da raiz; `CABECALHO_RAIZ` corrigido (era falso)
- [x] `manifesto-raiz` — **um id, não dois**: o `manifesto` do módulo só existe além do schema por
      cláusulas relacionais (`id` = nome da pasta, `rotaBase` derivada), e a raiz não tem nenhuma
- [x] `env-raiz-declarado` — nos dois sentidos. **Sem** análogo de `env-exemplo`:
      `sincronizar-env --conferir` já o faz e já roda no `verificar`

> **A trava virou mecânica.** `additionalProperties: false` no schema — acrescentar `portas`
> **reprova** até existir a regra que o cobre. Conselho vira invariante cobrado por máquina.

**Provado:** `adapters/` com URL literal, `console.log`, `catch {}` vazio, SQL concatenado, 6
parâmetros e 69 linhas → **zero** acusação das 57 regras de módulo; e o mesmo arquivo com
`process.env.RAIZ_PROVA` → acusado pelo escopo `raiz`. Sem a contraprova, "0 erros" seria
indistinguível de "não foi lido".

### I.2 — direção de dependência *(Família 1)*  ✅ **concluído**

O coração da arquitetura hexagonal, hoje sem verificador nenhum. Barata, leitura de import, zero
heurística. Pega a classe de erro que corrói a arquitetura em silêncio: no dia em que um adapter
importa de um módulo, a extraibilidade morreu e nada acusa.

```
modulos/  ──→  packages/portas/  ←──  adapters/
                      ↑
                    src/   composição: descobre módulos, injeta adapters, resolve auth
```

- [x] `portas-pura` — a porta não importa de `modulos/`, `adapters/` nem `src/`, **e** não carrega
      SDK de fornecedor. *"`sdk-fornecedor` mantém o driver fora de cada módulo; um `pg` na porta o
      devolveria a todos de uma vez, pela porta que eles importam"*
- [x] `adapter-isolado` — nunca importa de `modulos/` nem de `src/`. **Dependência externa é
      permitida**: o adapter é onde o SDK pertence, e a não-acusação é coberta por máquina
- [x] `composicao-descoberta` — `src/` não importa de `modulos/`. A composição **descobre** lendo
      `modulos/*/modulo.json`; import fixaria a lista em tempo de compilação
- [x] **"`src/` não contém regra de negócio" descartada** — `FABRICAS[porta][provedor]` é fiação
      legítima e um `if` sobre o papel do módulo é domínio vazando, e os dois são a mesma construção
      da linguagem. Registrado no §7.1, com a revisão humana
- *(o inverso — módulo importando adapter — já é `import-adapter`)*

**Distinção import × leitura, por construção:** as três só veem o que `importesDe()` extrai.
`readdirSync(join(raiz,'modulos'))` nunca chega à regra — não é lista de exceções.

**Limite declarado:** a forma por nome de package (`@<escopo>/catalogo`) escapa — a raiz não conhece
o escopo nem a lista de módulos, e `@<escopo>/x` é indistinguível de `@aws-sdk/x` por forma. Quem
cobre essa forma é `import-lateral`, que tem os ids.

### I.3 — segurança da fiação *(Família 2)*  ✅ **concluído**

É aqui que moram os dados mais sensíveis. Em boa parte são **as mesmas leis com outro dono** — mas
exigem texto próprio: os textos atuais dizem literalmente *"no código **do módulo**"*.

- [x] `sql-concatenado` — placeholder (`$1`, `?`, `:nome`, `%s`) e valor por parâmetro. *Vocabulário
      `SQL_FONTE` compartilhado com `gateway-http`; recorte próprio, porque a pergunta é outra*
- [x] `segredo-em-log` — credencial citada em chamada de log. **Sem `camposSensiveis`**: o sinal é
      `projeto.json:envRequerido` filtrado pelo `PADRAO_CREDENCIAL` da B.1 — uma declaração ganha um
      segundo consumidor em vez de nascer um campo
- [x] `hardcode-url-raiz` — reuso total do `URL_LITERAL`
- [x] `fallback-raiz` — reuso total do `PADROES_DE_FALLBACK`. Ler `process.env` na composição
      **segue permitido**: é o trabalho dela
- [x] **`hardcode-numero` e `random-inseguro` NÃO foram portados**, e a decisão está no §7.2:
      `LIMITE_EXCEDIDO: 429` da taxonomia canônica carrega `limite`, e `adapters/memoria/` gera hash
      com `Math.random()`. Portar por simetria acusaria o código que **é** a doutrina

**Implementação única:** `URL_LITERAL`, `PADROES_DE_FALLBACK`, `SQL_FONTE`, `SAIDA_DIRETA_FONTE`,
`PADRAO_CREDENCIAL` e `varrerRaiz` — uma definição cada, consumidores nos dois escopos.

**Limites declarados:** SQL em aspas triplas no Python escapa (o extrator de linhas de código as
descarta — a mesma proteção que impede a lei escrita em comentário de virar violação dela mesma);
e `db.query(id + ' from x')` sem verbo na linha não acusa — família conservadora.

---

## Bloco C — Testes  ✅ **concluído** *(2 regras — a terceira não devia existir)*

- [x] `testes-web` — módulo com `rotaWeb` tem `tests/web/` não-vazio. A mensagem oferece **os dois**
      consertos que a lei autoriza: criar o teste, ou descartar a tela zerando `rotaWeb`
- [x] `testes-gateway` — **um teste por gateway**, casado por convenção de nome. Exclui barril
      (`index`/`__init__`) reusando `gatewaysDe(ctx)`, agora compartilhada com `gateway-declarado`
- [x] ~~`testes-integracao`~~ — **não escrita, e não por ser inverificável.** `03-operacao.md:76`:
      *"Tudo roda com adapters de memória, sem rede e sem banco… Se um teste do módulo precisa de
      infraestrutura, a porta está mal desenhada."* A regra faria o gate cobrar o que a doutrina
      trata como **sintoma de defeito**. Registrada no §7.1. O teste com banco de verdade fica no
      **Bloco F** (migrations executáveis contra banco efêmero), onde é CI e não contradiz nada
- [x] *"mock derivado do contrato"* fica com a revisão humana — o mesmo objeto de mock serve às duas
      origens, e nada no arquivo diz de qual delas veio. Registrado no §7.1

**O terceiro lado do triângulo cobre algo real:** gateway declarado em `consome`, apontando para rota
que o dono declara — `gateway-declarado` cala, `consome-contrato` cala — e sem uma linha que o
exercite. Dois dos três lados aprovavam.

---

## Bloco D — Campos do manifesto ainda órfãos  ✅ **concluído**

- [x] `porta-declarada` — `manifesto.portas` × chaves de `config/portas.json`, **nos dois sentidos**.
      O `$comentario` do schema afirmava garantir isso e **não garantia** — schema não enxerga o
      manifesto. Corrigido, e agora nomeia quem cobra
- [x] `navegacao-declarada` — `navegacao` não-nula exige `rotaWeb`. **Uma direção só**: tela fora do
      menu é legítima (página de detalhe). `icone` não é verificável — quem o resolve é o conector
- [x] `permissao-literal` — argumento de `exigirPermissao` vem do manifesto, nunca de literal.
      **Batizada pelo defeito, não pela invariante**: um id `-declarada` prometeria a metade que foi
      descartada
- [x] `tabela-declarada` — tabela em `dados.tabelas` tem `CREATE TABLE` no SQL. **`rls` ganhou filtro**
      e parou de mandar acrescentar RLS a tabela que não existe. Fronteira tripla: sem SQL nenhum →
      `migrations`; sem `CREATE TABLE` → `tabela-declarada`; criada e sem RLS → `rls` (aviso)
- [x] **A outra metade das `permissoes` é INCOMPATÍVEL, não inverificável**: detectar "declarada e
      usada" exigiria procurar `<modulo>:ler` no código — exatamente o que `permissao-literal`
      proíbe. E o consumo é posicional, então a string nunca aparece. Registrado no §7.1
- [ ] `portas` — verificar se o campo do **manifesto** tem verificador semântico
      *(as ocorrências encontradas são do `config/portas.json`, que é outra coisa)*
- [x] ~~Achado do Bloco C~~ — **resolvido por `tabela-declarada`**. A justificativa do
      `artefato-declarado` (*"quem declara banco é `dados.tabelas`"*) só era verdade se algo cobrasse
      `dados.tabelas` contra o disco. Agora cobra

`rotasPublicas` está no Bloco B como `rota-publica-autenticada`.

---

## Bloco E — Cobertura do próprio gate  ✅ **concluído**

- [x] Caso próprio para `config-valida`
- [x] Caso próprio para `config-morta`
- [x] Caso próprio para `env-fora-do-carregador`
- [x] Caso próprio para `rls`
- [x] **Alvo lógico + família de sintaxe** — o caso nomeia `rotas`/`mapeadores` (o harness resolve o
      caminho) e declara o trecho por família (`js`/`py`). Resolver só o caminho seria pior que a
      lacuna: o caso deixaria de pular sem testar nada
- [x] `contrato-sincronizado`, `payload-camelcase` e `saida-crua` passam a rodar nos **três** bindings
- [x] Alvo inexistente **lança** `SEM_COBERTURA` com o motivo, nunca vira aprovação

**Resultado:** 44 → 48 regras com caso, cobertura total do catálogo. SEM COBERTURA restante (1·1·3) é
legítima — o molde do binding não tem a peça (`web/` no Python; mapeador Python em TS/JS).

---

## Bloco F — Insumos de CI que **não** são regras de gate

> Construir **junto do pipeline**, não antes: o formato de saída é ditado pelo consumidor.

- [ ] `ferramentas/afetados.mjs` — arquivo alterado → módulo → consumidores transitivos.
      **Maior retorno da lista**: sem ele o CI roda tudo a cada commit
- [ ] Detector de breaking change de contrato *(precisa de baseline git — fora do gate por isso)*
- [ ] `dependencia-fixada` — lockfile presente *(reavaliar: talvez seja regra de gate)*
- [ ] Passo de build — TS/JS não têm script `build`; `tsc --noEmit` não produz artefato
- [ ] Migrations executáveis — sobem e descem contra banco efêmero
- [ ] Estágio 0: `gitleaks` + `git ls-files` procurando `.env` versionado — **fail-closed**
- [ ] Audit de dependência — fail-open, severidade vinda da política

---

## Bloco G — Hooks dentro do template

- [ ] Os 5 hooks + `hooks.json` instalados pelo `criar-projeto.mjs`
- [ ] Lendo `config/verificacao.json` do projeto, não `hooks/config.json` da base

---

## Bloco H — Dívidas registradas

- [ ] `criar-modulo.mjs --sem-artefato` remove `core/motor` e deixa `tests/dominio` importando dele
      — módulo nasce com teste quebrado. O caso análogo `--sem-web` é tratado corretamente
- [ ] Caso 2 do autoteste: `schema-manifesto` × `manifesto` acusam o mesmo `papel` inválido.
      Declarado como par, não resolvido — decidir qual cala é definir a fronteira das duas
- [ ] §7.2 — acrescentar *"ou rota obrigatória ausente"* ao parágrafo da exceção de silêncio
- [ ] **`bindings/python/_template/tests/` não tem `__init__.py`** — `from tests.fixtures import …`
      não resolve e os testes do molde Python não rodam. O conserto é um arquivo vazio
- [ ] §7.2 — registrar o limite do módulo extraído sem `.ruff.toml` *(hoje só no comentário do
      pyproject do molde)*
- [x] ~~**Defeito de projeto repete uma mensagem por módulo sob `--todos`**~~ — **resolvido em
      I.1**, na origem: o escopo `raiz` roda uma vez por projeto. Não foi preciso mexer na impressão — `verificacao-declarada`
      e `lint-derivado` são fatos do projeto num gate cuja unidade de saída é o módulo. O conserto
      é na **impressão** (`validar.mjs` colapsa pares `(regra, mensagem)` idênticos, mantendo a
      contagem), nunca na regra: emitir só no primeiro contexto esconderia o defeito ao validar
      outro módulo isolado
- [ ] `plugin/sarak_routing_table.md` — regenera no próximo `sync_ide.py` *(ação do usuário)*
- [ ] **O harness não consegue travar uma NÃO-acusação sob regra que dispara.** Ele compara **ids**:
      se `segredo-em-log` acusasse `RAIZ_API_BASE_URL` por engano, sairia sob o mesmo id e o autoteste
      passaria. Em I.2 deu para travar via id não declarado; em I.3 não. Falta expressividade —
      afirmar *quantas vezes* ou *sobre o quê*, não só *quais regras*
- [ ] **Vocabulário de chamada de log divergiu**: `segredo-em-log` reconhece `logging`, `warning`,
      `critical`, `exception`, `console.*`, `print(`; `sensivel-em-saida` reconhece menos. Unificar
      muda uma regra de módulo — decidir junto com a dívida do caso 2 (`schema-manifesto` × `manifesto`)

---

## Ordem de dependência

```
FEITO      E    cobertura do gate      antecipado — toda regra nova já nasce provada nos 3 bindings
           A.1  a camada               limiares, política, eslint, formatador
           A.2  as regras da camada    verificacao-declarada, lint-derivado
           B.1  segredo e RNG

           B.2  superfície HTTP e sessão

           I.1  manifesto de raiz      escopo `raiz` + projeto.json

           I.2  direção de dependência Família 1

           I.3  segurança da fiação    Família 2 — Bloco I fechado

           C    testes                 2 regras — a terceira contradizia o §5
           D    campos órfãos          4 regras

           ══ o CATÁLOGO DE REGRAS está completo: 72 regras, 72 com caso ══

AGORA      A.3  lint por módulo        precisão; fecha a janela do extraído
           G    hooks no template      depende de A
           F    insumos de CI          junto do pipeline, não antes
           H    dívidas                a qualquer momento
           B.3  vetor residual de SQL no módulo — reavaliar depois de I.3
```

**O que resta não é regra de gate.** A.3 é camada de lint; G é instalação; F é orquestração de CI;
H é dívida. A meta de "~70 regras, todas com caso" foi cumprida com 72.

**A ordem mudou duas vezes, e as duas estão registradas:**

1. **A.3 saiu da frente do Bloco B** — entrega precisão sobre regras que já funcionam, enquanto B
   entrega cobertura que não existe. *(seção da A.3)*
2. **O Bloco I entrou na frente de C e D** — o escopo `raiz` estava descoberto por inteiro, e é
   onde a arquitetura concentra o risco de propósito. *(seção do Bloco I)*

---

## Fora deste plano

- **Pipeline CI/CD** — montado depois, quando todos os insumos existirem
- **Ambiente por estágio** — decidido: **não se modela no template**. `envRequerido` é o contrato,
  `.env.example` a forma versionada, e o ambiente real injeta por processo, que já está no topo da
  cascata da ADR-004. `fallback-silencioso` garante que chave faltando derruba o boot
- **Cobertura de teste como gate de merge** — critério de CI, nunca regra do catálogo (§1, lei 2)
