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
| Regras no catálogo | **73** |
| Regras com caso de teste próprio | **73** — cobertura total |
| Bindings | `typescript` · `javascript` · `python` — gate verde nos três |
| Escopos do gate | `modulo` · `global` · **`raiz`** (novo em I.1) |
| Autoteste | `89/89` (TS) · `89/89` (JS) · `85/85` (PY) |
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

> Destravou B, C, D e G. Nada lê limiar antes disto existir. *(A.3 cancelada — ver abaixo.)*
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

**Limite conhecido, e agora PERMANENTE:** módulo extraído fica sem `.ruff.toml` até ser religado a um
esqueleto. O piso do gate não cai — os limiares viajam em `ferramentas/gate/`, e o gate roda sem
instalar nada. A A.3 fecharia essa janela e foi **cancelada** (ver abaixo): o custo era uma config por
módulo que precisa nascer e permanecer completa, senão os limiares voltam ao default do ruff **dentro**
dos módulos. Fica declarado, não pendente.

### A.2 — as regras que cobram a camada  ✅ **concluído**
- [x] `verificacao-declarada` — o arquivo existe, é JSON válido e conforma ao schema
- [x] `lint-derivado` — a config na raiz é **alguma saída do gerador**; divergência reprova
- [x] `ctx.projeto` — ponto próprio em `contexto.mjs`, memoizado por raiz (o dado é por projeto;
      com 10 módulos, `carregarContexto` roda 10 vezes)
- [x] Guarda `ehProjeto` — módulo extraído e ainda solto não é projeto, e não é cobrado
- [x] Uma implementação só: a regra e o harness importam `saidaDe` do gerador

**Achado:** o `gate/README.md` afirmava "três regras globais" — são quatro desde `consome-contrato`.

### A.3 — config de lint **por módulo**  ❌ **CANCELADA** *(a premissa era falsa)*

> A investigação do Passo 0 mediu cinco coisas que desfizeram a justificativa. Fica registrada para
> não voltar como ideia:

| O que a plan prometia | O que a medição mostrou |
|---|---|
| AST alcança **import dinâmico** | o gate já alcança (`PADROES_IMPORT` inclui `import(…)`); o `no-restricted-imports` builtin **não** |
| AST alcança **aritmética de caminho** | o gate já alcança (`saiDoModulo` conta profundidade); o builtin **não** |
| AST resolve **alias** | **nenhum dos dois** — e o template não configura `paths` nem `baseUrl` em binding algum |
| eslint flat **cascateia** | **não** (provado em v9.39.5). No v10 a config mais próxima vence **por inteiro**, sem merge |
| config por módulo é inerte até a extração | **falso para o ruff**: ele já substitui a config da raiz numa rodada da raiz — provado, `PLR0913` desaparece |

**E o quinto achado, que é defeito real:** `importesDe` lê `arquivo.conteudo`, então **o gate acusa
import escrito em comentário** — falso positivo, a direção que o §7.2 proíbe. Era o último ganho
honesto que sobrava para a A.3, e o conserto é uma linha **no gate**. Virou o Bloco J.

**Dois riscos que ela trazia**, e que o cancelamento evita: `eslint-plugin-import` + resolver como
devDependency permanente em todo projeto gerado, por um recurso que ninguém usa; e uma `.ruff.toml`
por módulo que precisa nascer completa e **permanecer** completa para sempre, senão os limiares
voltam ao default do ruff dentro dos módulos.

**O que sobrava de valor, registrado como decisão sua e não como pendência:**
- [ ] **feedback no editor** para violação de fronteira enquanto se digita — real, mas em v9 o editor
      lê o config da **raiz**, então exigiria os blocos `files:` lá, derivados de todos os manifestos
- [ ] **janela do extraído** — módulo copiado fica sem config de linter até ser religado. O **piso do
      gate já cobre os limiares** lá, então o que se perde é a verificação profunda, não o piso

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

### B.3 — `sql-concatenado`  ↪ movido para o Bloco I · **vetor residual fechado em F.0** ✅
Onde a query é montada é no **adapter**, que vive fora de `modulos/` — o módulo não pode nem ter
driver (`sdk-fornecedor`) nem importar adapter (`import-adapter`). A regra pertence ao escopo `raiz`.

O vetor residual **existia**, e foi medido em F.0: a superfície canônica de `packages/portas/` é
tipada por operação e nenhuma porta aceita comando — mas o `core/portas/` do **módulo** é escrito
pelo autor dele e nada compara as duas formas. Declarar `executarConsulta(sql: string)` ali é legal
aos olhos do gate, e a partir daí a concatenação mora no módulo e a execução na raiz. A mesma linha:
acusada em `adapters/`, calada em `modulos/`. Virou a regra **`sql-no-modulo`** (escopo `modulo`),
gêmea de `sql-concatenado`, com o **mesmo** discriminador (`ehSqlInjetado`) e coleção disjunta.

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

## Bloco J — Falso positivo do extrator de import  ✅ **CONCLUÍDO** *(J.1 e J.2)*

> Achado da investigação da A.3. `importesDe` (`regras/isolamento.mjs:109`) lê `arquivo.conteudo` —
> texto cru —, então import escrito em **comentário** é acusado:
>
> ```
> // import { X } from '@acme/fin';
> x [import-lateral] core/dominio/doc.ts: importa o modulo "fin" ("@acme/fin")
> ```
>
> Falso positivo, e o §7.2 declara que é a direção que o gate não aceita.

- [x] `textoDeCodigo(arquivo)` extraída e exportada; `importesDe` e mais cinco leituras a consomem.
      **7 regras** corrigidas de uma vez: `import-lateral`, `import-adapter`, `sdk-fornecedor`,
      `ui-kit`, `portas-pura`, `adapter-isolado`, `composicao-descoberta` — mais `gateway-http`,
      `env-declarado`, `env-raiz-declarado`, `env-fora-do-carregador` e `tabela-alheia`
- [x] **Trava por máquina** em três casos (`log`, `gateway-declarado`, `fallback-raiz`), no padrão da
      I.2. Revertendo o conserto: **85/88, 3 casos reprovados, 8 ids não declarados**
- [x] Limite residual no §7.2: string literal continua sendo vista — é código de verdade, e separar
      literal de instrução exigiria AST

### J.2 — os dois extratores posicionais  ✅
- [x] `contrato.mjs:76` (registro de rota) e `:233` (`regioesDeProjecao`) tinham o mesmo falso
      positivo, com raio de **4 regras** (`contrato-sincronizado`, `projecao-contrato`,
      `payload-camelcase`, `sensivel-em-saida`). Os dois leem `textoDeCodigo`. O comentário que
      DOCUMENTA a lei — *"`paraContrato` nunca deve projetar `{ cpf }`"* — deixou de ser a violação
      que ele proíbe
- [x] **`textoDeCodigo` subiu para `ferramentas/gate/texto.mjs`** — cinco famílias a consomem, e
      enquanto morava em `regras/isolamento.mjs` a chegada de `operacao.mjs` fechava um **ciclo** que
      funcionava por içamento. Precedente do `spec.mjs`, com argumento mais forte
- [x] **Travado por máquina, e é a primeira vez neste arco.** A técnica: chamariz num caso cuja regra
      esperada é OUTRA — o harness compara conjunto de ids (`executar.mjs:277-279`), então chamariz no
      caso da própria regra não trava nada. Revertendo os extratores: `id NAO declarado:
      contrato-sincronizado, projecao-contrato, payload-camelcase, sensivel-em-saida`, nos três bindings
- [x] Dois consertos que não estavam no plano e se justificaram: `FIM_DE_CONSTRUCAO` (sítio de
      referência lido como definição — FP sobre código correto, com trava própria) e dedup por
      (arquivo, campo). Mais `rota-publica-autenticada` lendo `textoDeCodigo` — falso negativo que
      **aprovava em silêncio**, classe diferente do `config-morta`, que só deixa de avisar
- [x] O limite maior do extrator ficou **declarado, não consertado**: `{` na assinatura desvia a
      leitura (8 formas medidas de 18, três guardas testadas e falsificadas). Bloco H

### Duas leituras cruas de direção OPOSTA — decisão, não conserto
- [ ] `config-morta` e `rota-publica-autenticada` ficam mais **frouxas** ao ler cru: chave citada em
      comentário conta como "lida", `rotasPublicas` em comentário satisfaz a cláusula. Torná-las
      estritas é **mudança de comportamento**, e cada uma precisaria do caso que prova a acusação nova

**Armadilha:** `dados.mjs:73` (`migrations`) procura `-- rollback`, que **é** comentário SQL de
propósito. Trocar por `linhasCodigo` ali quebraria a regra.

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
- [ ] **`dependencia-fixada` é etapa de CI, não regra de gate** — decidido e medido em F.0, registrado
      no §7.1 ("Deixaram de ser regra"). O passo é `npm ci`, que **falha sozinho** sem lockfile, com
      mensagem melhor que a do gate. Motivo: lockfile é produto do `npm install`, e o gate promete
      rodar **sem instalar nada** — é o que o faz viajar dentro do módulo extraído. Medido: projeto
      recém-criado não tem lockfile em nenhum dos três bindings, e no Python o template não declara
      arquivo de trava nenhum. Como regra, reprovaria todo projeto no minuto em que nasce
- [ ] Passo de build — TS/JS não têm script `build`; `tsc --noEmit` não produz artefato
- [ ] Migrations executáveis — sobem e descem contra banco efêmero
- [ ] Estágio 0: `gitleaks` + `git ls-files` procurando `.env` versionado — **fail-closed**
- [ ] Audit de dependência — fail-open, severidade vinda da política

---

## Bloco G — Política dos hooks  ✅ **CONCLUÍDO** *(reformulado: a metade "copiar arquivos" foi cancelada)*

> **A premissa da plan original era falsa.** `hooks/hooks.json` diz *"Wiring NATIVO … **Ativo por
> padrão ao instalar**"*, e `CLAUDE.md:33` confirma: com o plugin `sarak` instalado, o agente já roda
> os cinco hooks em **qualquer** projeto, inclusive nos gerados. Copiar os arquivos para dentro do
> projeto resolve um problema que não existe.
>
> **O que falta é a política ser lida do projeto** — e um defeito pior, achado na investigação.

### G.1 — política resolvida por contexto, e o hook parando de injetar  ✅
- [x] `loadConfig()` procura `<projeto>/config/verificacao.json` e só cai em `__dirname/config.json`
      quando não achar. `projectRoot()` busca **o próprio arquivo de política**, não um marcador
      indireto: `CLAUDE_PROJECT_DIR` primeiro, depois subindo do `cwd`
- [x] `verificacao.json` + schema ganham `qualidade.modo` e `formatacao.ativo`
- [x] **`padrao-limiares.js` deixou de INJETAR os números.** Roda o linter do projeto com a config do
      projeto — sem `--no-eslintrc`, sem `--rule`, sem `--config`
- [x] O `40` **saiu do hook**: zero em `hooks/**.js` e `**.json`; só prosa apontando para `limiares.mjs`
- [x] Hook e `npm run lint` concordam **por construção** — provado palavra por palavra em `max-params`
      e em `no-console`

### G.1b — `proibir` fora, pelo mesmo argumento do `limiares`
- [x] **`qualidade.proibir` NÃO entra.** A G.1 o promoveu a `required` no schema e isso reintroduzia o
      defeito com o sinal trocado: `gerar-config-lint.mjs` emite `no-console`/`no-empty`/`T20`/`E`
      **incondicionalmente**, sem ler política, então o campo nunca acrescentava cobertura — só
      escondia do agente um erro que o `npm run lint` acusava. Reproduzido em modo `block`: lint
      reprovava, hook calava
- [x] `qualidade` ficou com `modo` e nada mais. `additionalProperties: false` barra `limiares` **e**
      `proibir` pelo mesmo mecanismo
- [x] A mensagem "sem config de linter" nomeia só caminho que existe, nos três casos (projeto do
      template · a base · repositório fora do template)

### G.2 — copiar os hooks para o projeto  ❌ **CANCELADA**

O plugin já os entrega. As três saídas medidas, e por que nenhuma se paga:

| Saída | Custo medido |
|---|---|
| (a) hooks dentro do template | **~620 linhas** de código executável em duas **variantes** (precisam divergir, porque leem política de lugares diferentes), e nada no escopo consegue verificar que não divergem além do previsto |
| (b) `criar-projeto.mjs` sobe 3 níveis até a base | quebra o invariante verificado: **toda** referência sai de `RAIZ_TEMPLATE = join(AQUI, '..')`, nenhuma sobe. Template copiado para outro lugar deixaria de funcionar |
| (c) hooks só no template, plugin reaponta | a mais limpa, mas toca **dois** FORA: `hooks/hooks.json` e `plugin/sync_ide.py:65,89`, que espelha `hooks` como diretório de topo |

**A promessa, delimitada:** hook é guarda do **agente** — intercepta chamada de ferramenta do Claude
Code. Quem clona o repositório sem Claude Code não ganha nada com ele. Quem protege o repositório
independente de quem edita é o **CI** (Bloco F). Instalar hook não substitui pipeline: antecipa
feedback.

---
## Bloco H — Dívidas registradas

- [ ] **`{` na assinatura desvia o extrator de projeção inteiro** (medido na J.2, declarado no §7.2).
      `regioesDeProjecao` abre na PRIMEIRA `{` depois do nome, não na do corpo: tipo de retorno inline,
      tipo de parâmetro inline, `Array<{…}>`, genérico com objeto e default `= {}` fazem a região ser a
      ANOTAÇÃO — nome de tipo acusado como campo publicado (**FP**) e o campo real sem verificação
      nenhuma (**FN**: um `cpf` publicado escapa de `sensivel-em-saida`). **8 formas medidas de 18**;
      molde imune (`): Record<string, unknown> {`), Python só pelo default mutável — que o `B006` do
      ruff já proíbe. **Não tem guarda barata**: das três testadas, parêntese cega a arrow (`=> ({…})`)
      e o objeto aninhado, olhar adiante da região cobre 2 de 8, e o lookahead de assinatura cai em dois
      parâmetros com tipo inline. O conserto é a região passar a ser o **objeto literal em posição de
      retorno** — redesenho com casos próprios, e mata junto o FP do objeto intermediário. Atenção para
      quem pegar: `FIM_DE_CONSTRUCAO` é medido do NOME até a abertura, então qualquer pulo o dispara —
      ele tem de valer só para o primeiro candidato
- [ ] **`rota-publica-autenticada` foi endurecido sem caso** (J.2). A cláusula de origem passou a ler
      `textoDeCodigo`, fechando um falso negativo que aprovava em silêncio. Travá-la exige um caso que
      apague a leitura real de `rotasPublicas` da `api/`, e o arquivo difere por binding — a operação
      portável é um ALVO lógico novo em `executar.mjs`. A direção perigosa (falso positivo) está coberta
      pelos três moldes verdes; a nova estritura, não
- [ ] **A base perdeu a cobrança de limiar sobre si mesma** (custo aceito na G.1, declarado no
      `hooks/README.md`). `knowledge-agentics` não tem config de linter na raiz, então `padrao-limiares`
      avisa e segue. Fechar exige gerar uma config na base — decisão à parte, e ela usa eslint 8
- [ ] `cobertura.modo` e `dependencias.modo` ainda vêm da base. `cobertura.minima` e
      `dependencias.severidadeMinima` já vêm do projeto; o **modo** dos dois, não. Uma linha em cada
- [ ] `criar-modulo.mjs --sem-artefato` remove `core/motor` e deixa `tests/dominio` importando dele
      — módulo nasce com teste quebrado. O caso análogo `--sem-web` é tratado corretamente
- [ ] Caso 2 do autoteste: `schema-manifesto` × `manifesto` acusam o mesmo `papel` inválido.
      Declarado como par, não resolvido — decidir qual cala é definir a fronteira das duas
- [ ] §7.2 — acrescentar *"ou rota obrigatória ausente"* ao parágrafo da exceção de silêncio
- [x] ~~**`bindings/python/_template/tests/` não tem `__init__.py`**~~ — **resolvido**, com UM arquivo,
      e a dívida estava certa **pelo motivo errado**. Sem `__init__.py`, `tests/` é *namespace package*
      (PEP 420), e a regra de import do Python é que **qualquer pacote REGULAR chamado `tests` em
      qualquer lugar do `sys.path` vence a porção de namespace local** — mesmo com o `cwd` primeiro.
      Diagnosticado na revisão: nesta máquina existe
      `…/Python314/site-packages/tests/__init__.py` (biblioteca que publicou a própria pasta de teste
      por acidente de empacotamento — bug comum), e ele sequestra `from tests.fixtures import …`:
      `no tests collected, 2 errors`. Ambiente limpo não reproduz, e o executor não conseguiu — mas
      um template replicado N vezes não pode depender de nenhum consumidor ter esse pacote instalado.
      **Conserto:** `tests/__init__.py` com o comentário que explica por que ele não é sobra. Um só —
      medido: uma vez que `tests` é pacote regular, `tests.contrato` e `tests.dominio` são procurados
      apenas dentro do `tests.__path__` já fixado, e nunca mais varrem o `sys.path`. Provado contra o
      sequestrador **real** desta máquina, sem cenário simulado: `19 passed`, `tests.__path__` na pasta
      local. TS/JS não têm análogo — importam fixture por caminho relativo, e Node não tem `sys.path`
      para uma lib sequestrar por nome
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
- [x] ~~**`import-adapter` não pega a forma pontilhada do Python**~~ — **resolvido**. `formaDeCaminho`
      (uma normalização, compartilhada com `areaDoImport`) traz `adapters.memoria` para a forma com
      barra, e `importaAdapter` decide a POSIÇÃO pelo tipo de import: **não relativo** só casa no
      primeiro segmento — é o que faz `adapters.memoria` apontar para a pasta de topo que
      `pythonpath=["."]` expõe **e** salva `opentelemetry.adapters.wsgi` (pacote externo com submódulo
      `adapters`, falso positivo que a primeira tentativa introduziu); **relativo** casa em qualquer
      segmento, porque `../../adapters/memoria` é posição de arquivo e não há pacote externo para
      colidir. Travado por máquina nos dois sentidos: caso próprio para a detecção, chamariz em caso
      de outra regra para as não-acusações
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
                                             (73 depois da F.0 — ver abaixo)

           A.3  lint por módulo        ❌ CANCELADA — premissa falsa, 5 achados

           J.1  falso positivo do extrator  7 regras + 5 leituras, travado por máquina

           G.1  política dos hooks     hook e lint concordam por construção
           G.1b `proibir` fora         G.2 (copiar arquivos) CANCELADA — o plugin já os entrega

           J.2  os dois extratores posicionais  4 regras, travado por máquina — Bloco J fechado

           F.0  fechar o catálogo     B.3 virou regra (73) · `dependencia-fixada` virou CI

AGORA      F.1  `afetados.mjs`         o único insumo de CI que não é pipeline
           F.2  o pipeline             build, migrations, gitleaks, audit, breaking-change
           H    dívidas                a qualquer momento
```

**O que resta.** F.1 é insumo; F.2 é o pipeline; H é dívida. **Nenhuma pergunta de verificação está
aberta** — a F.0 fechou as duas últimas, uma virando regra e a outra virando etapa de CI, e o número
73 agora fecha por três caminhos independentes (objetos, ids distintos, regras com caso).
J fechou: os extratores de import e de contrato leem `textoDeCodigo`, e o falso positivo do
comentário está travado por máquina nos três bindings.
G fechou: o hook deixou de carregar número próprio, e agora hook e `npm run lint` cobram a mesma
config — que é derivada de `limiares.mjs`. A meta de "~70 regras, todas com caso" foi cumprida com
**73** — e o catálogo não cresce mais por este plano: a F.0 era a última pergunta que podia acrescentar
uma regra, e ela acrescentou uma e recusou outra.

**A ordem mudou três vezes, e as três estão registradas:**

1. **A.3 saiu da frente do Bloco B** — entrega precisão sobre regras que já funcionam, enquanto B
   entrega cobertura que não existe. *(seção da A.3)*
2. **O Bloco I entrou na frente de C e D** — o escopo `raiz` estava descoberto por inteiro, e é
   onde a arquitetura concentra o risco de propósito. *(seção do Bloco I)*
3. **A A.3 foi cancelada e virou o Bloco J** — o Passo 0 dela mediu que a premissa era falsa, e a
   investigação revelou um falso positivo real no gate. *(seção da A.3)*

---

## Fora deste plano

- **Pipeline CI/CD** — montado depois, quando todos os insumos existirem
- **Ambiente por estágio** — decidido: **não se modela no template**. `envRequerido` é o contrato,
  `.env.example` a forma versionada, e o ambiente real injeta por processo, que já está no topo da
  cascata da ADR-004. `fallback-silencioso` garante que chave faltando derruba o boot
- **Cobertura de teste como gate de merge** — critério de CI, nunca regra do catálogo (§1, lei 2)
