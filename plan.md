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
| Regras no catálogo | **74** |
| Regras com caso de teste próprio | **74** — cobertura total |
| Bindings | `typescript` · `javascript` · `python` — gate verde nos três |
| Escopos do gate | `modulo` · `global` · **`raiz`** (13 regras) |
| Autoteste | `92/92` (TS) · `92/92` (JS) · `88/88` (PY) |
| Ferramentas com autoteste próprio | `afetados.mjs` 19/19 · `verificar-commit.mjs` 6/6 · `contrato-compativel.mjs` 12/12 |
| Fiação local | `.githooks/pre-commit` + `pre-push`, donos do template, cobrados pela regra 74 |
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
- [x] **Resolvido pela metade que importava:** `rota-publica-autenticada` passou a ler `textoDeCodigo`
      na J.2 (era falso negativo que APROVAVA em silêncio); `config-morta` fica cru por decisão — é
      `aviso`, e ali o falso negativo só deixa de avisar. Detalhe original abaixo
- [x] `config-morta` e `rota-publica-autenticada` ficavam mais **frouxas** ao ler cru: chave citada em
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
- [x] `portas` — **tem**: a regra `porta-declarada` (`configuracao.mjs:205`, escopo `modulo`), mais o
      `resolverDependencias` do entrypoint, que derruba o boot se a porta declarada não tem fábrica
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

### O desenho, decidido — e a ADR-005 **não** muda

A **ADR-005** não proíbe conteúdo de CI no template; ela proíbe **config de provedor**, e manda o
template trazer *"o contrato de acoplamento (argumentos, exit 0/1, saída JSON) para que qualquer
executor o chame em uma linha"*. Hoje esse contrato existe para **um** dos seis verificadores — o gate.
A lacuna real não é "falta pipeline": é **falta o contrato de acoplamento de cinco deles**.

`.githooks/pre-commit` **é git, não é provedor** — não se perde ao trocar de CI. Entregá-lo é entregar
contrato de acoplamento, exatamente o que a ADR pede. E o argumento empírico dela (*"num sistema real,
a CI existia e não rodava, e o que segurou a conformidade foi o verificador local"*) empurra **para** o
hook de git.

O `03-operacao.md` §7 já prescreve três camadas de custo (milissegundos · segundos · dezenas de
segundos) e o template não implementa a fiação de nenhuma. A F.2 é a doutrina saindo do papel:

```
pre-commit  (segundos)   gate nos módulos AFETADOS + env + formato + lint
pre-push    (dezenas)    tipos + testes nos módulos afetados
CI          (minutos)    tudo em tudo + os cinco comandos novos
```

**O `afetados.mjs` foi construído para o CI e o consumidor de maior valor dele é o hook de git** — sem
seleção, `tsc` × N + `vitest` × N no pre-commit é hook desativado em duas semanas.

**Liberdade de ferramenta = exit code + relatório legível por máquina.** Actions/GitLab/Jenkins querem
exit code; SonarQube quer lcov, JUnit XML, SARIF/JSON — ele não roda o comando, ele **lê a saída**.
Com os dois, o template nunca precisa saber nome de provedor nenhum.

**Quatro decisões tomadas:** (a) **template dono** do `.githooks/`, a `meta-iniciar-repositorio` só
instala e ativa · (b) **três camadas** · (c) **sim à regra 74** que verifica que o hook está no lugar ·
(d) **relatório legível por máquina já agora**.

**Limite a declarar, não esconder:** o hook de git é **opt-in por clone** (`core.hooksPath` é config
local, não vem no `git clone`) e **`--no-verify` fura**. Pre-commit é feedback rápido; **CI é a única
cobrança que não se fura** — a mesma frase que já está no `hooks/README.md` para os hooks do agente.

### O defeito de coerência que a F.2 conserta

Existem **dois `pre-commit` documentados em dois lugares, e nenhum roda a verificação**:

| Onde | O que faz |
|---|---|
| `gate/README.md:54-61` | só `validar.mjs --todos` — e **o template não entrega o arquivo** |
| `meta-iniciar-repositorio`, passo 6 | *"gate de segredos + auto-índice"* — não roda o gate nem a cadeia |

E os configs de lint dos três bindings **já ignoram `.githooks/**`**: o template antecipa a pasta e não
a entrega. Dependência documentada sem artefato — a família de defeito que este plano matou 4 vezes.

- [x] ~~`ferramentas/afetados.mjs`~~ — **feito**. Caminhos alterados → módulos a reverificar, `(raiz)`,
      ou `(tudo)`. **Princípio: erra para mais, nunca para menos** — caminho não reconhecido, módulo
      apagado e `modulo.json` ilegível resolvem em `(tudo)`, porque selecionar de menos deixa código
      não verificado passar com o pipeline verde. Cálculo **puro** (`calcularAfetados`,
      `normalizarCaminho`) separado da única função que toca disco (`montarGrafo`), no precedente do
      `spec.mjs` — é o que permite o `--autoteste` embutido provar 19 casos com fixture em memória.
      `execFileSync` isolado em `caminhosAlteradosDesde` (o `--desde`), o único ponto que executa
      comando. A propagação anda **ao contrário** de `consome`: se A consome B, mudança em B afeta A
- [ ] **Revisitar o alcance de `adapters/` quando a F.2 entrar.** Hoje `adapters/x.ts` afeta só
      `(raiz)` — correto para o gate (adapter é injetado, módulo não o importa, e o escopo `raiz`
      cobre `adapter-isolado`). Mas quando o pipeline ganhar migrations contra banco efêmero e teste
      de integração pela composição real, mudança em adapter passa a afetar quem exercita aquele
      caminho, e o recorte precisa de outra resposta
### F.2a — a escada  ✅ **CONCLUÍDO**
- [x] `.githooks/pre-commit` e `.githooks/pre-push` nos três esqueletos, **byte a byte idênticos** —
      blobs `d740deb5…` e `3b8f50bd…` iguais nos três, modo `100755`. Duas linhas de shell cada,
      delegando a **`ferramentas/verificar-commit.mjs`**, que detecta o binding sozinho
      (`package.json` × `pyproject.toml`). **Uma variante replicada, não três que precisam concordar** —
      é a G.2 evitada em vez de repetida
- [x] `.gitattributes` (`.githooks/* text eol=lf`) em cada esqueleto — sem ele, `core.autocrlf=true`
      num clone Windows entrega hook em CRLF, que **não executa** (`bad interpreter`). Provado: num
      `git add` de 170 arquivos, os `.githooks/*` foram os **únicos** sem aviso de conversão
- [x] `pre-commit` alimenta o `afetados.mjs` com `git diff --cached`; `(tudo)` roda tudo **e imprime o
      motivo**. `pre-push` usa `@{u}`; sem upstream, verifica tudo
- [x] **Regra 74 — `pre-commit-instalado`** (escopo `raiz`, em `configuracao.mjs`): o arquivo existe e
      referencia a cadeia. **Não afirma ativação** — `core.hooksPath` é config local e o gate não roda
      git de propósito, o mesmo limite literal de `gitignore-segredo`. Guarda `ehProjeto` copiada de
      `verificacao-declarada`. Não exige `pre-push`: as três camadas são desenho, não obrigação
- [x] `03-operacao.md` §7.1 com a fiação, ligada à tabela de custo que já existia · `04-regras.md` com
      a 74 e o limite no §7.2 · a frase *"o template não traz pipeline de CI/CD"* **intacta**
- [x] `meta-iniciar-repositorio` instala e ativa o do template
- [x] **`contexto.mjs` e `executar.mjs` autorizados retroativamente** (+7 e +4 linhas): regra de escopo
      `raiz` só lê por `ctx.projeto`, e o fixture do autoteste tem de ser projeto completo. A
      alternativa — `readFileSync` dentro da regra — quebraria "regra nenhuma toca disco"

### F.2a.1 — o `shell: true` que a F.2a introduziu  ✅ **CONCLUÍDO**
- [x] **Injeção de comando por nome de pasta, reproduzida.** `spawnSync(…, { shell: true })` concatena
      `args` numa string sem citação, e o id do módulo vem de `readdirSync`. Uma pasta
      `modulos/x&echo INJETADO/` executava o `echo` — **e o passo reportava `ok`**, porque com shell o
      status é o do último comando da cadeia. "Verde indistinguível de não verificou", dentro do hook
      que existe para cobrar isso
- [x] Conserto: **a técnica que a G.1 já tinha inventado** — resolver o entrypoint JS pelo campo `bin`
      do manifesto e rodar com `process.execPath` (`npm`, `tsc`), e `<python> -m <ferramenta>` para
      `ruff`/`mypy`/`pytest`. Zero `shell: true`
- [x] `rodar()` partido em `executar()` + `avaliarResultado()` (pura) + `reportar()`. As três formas de
      "não rodou" — `error`, `status === null`, `status !== 0` — **reprovam**, nenhuma vira `ok`
- [x] **Travado por máquina**, e a trava anda no mesmo `executar()` da produção: `--autoteste` 6/6, com
      dois casos de payload adversarial. Revertendo para `shell: true`: **4/6**, exatamente os dois
- [x] Lição de método registrada: **onde há concatenação, o caso de teste precisa de nome adversarial.**
      A prova com nomes bem-comportados passava verde nos dois lados

### F.2b — `contrato-compativel.mjs`  ✅ **CONCLUÍDO**
> *"Mudança de contrato afeta quem declarou `consome` do seu módulo — **consulte o grafo antes**, não
> depois"* ([[02-contrato-e-dados]] §5). A saída não é "há breaking change": é **"há breaking change, e
> estes módulos consomem você"**.

- [x] O item que o gate **não pode** cobrar — o §7.2 já declarava por quê na linha do `consome-contrato`
      (*"a regra lê o caminho e o método, nunca o corpo"*). O gate compara **um** estado; isto compara
      **dois**, e precisa de baseline git — que o gate não roda de propósito
- [x] **Núcleo puro** (`compararContratos` e as quatro comparações) separado da casca; **um** ponto
      executa git, `execFileSync` com array, **zero `shell: true`**. Zero dependência externa
- [x] Reusa `gate/spec.mjs` em vez de criar um segundo parser — e o estendeu com `statusDaOperacao` e
      `obrigatoriosDaRequisicao`, ambos puros
- [x] **A direção invertida entre requisição e resposta, provada nos quatro sentidos**: campo de
      resposta removido = breaking, acrescentado = compatível; campo de requisição que virou
      obrigatório = breaking, que deixou de ser = compatível. Era o erro mais provável do bloco
- [x] **Cegueira ≠ compatibilidade**: spec ilegível de qualquer lado devolve
      `[ilegivel] … nao da para afirmar compatibilidade` e **exit 1**, nunca "compatível"
- [x] Ref adversarial (`HEAD; echo X`, `$(echo X)`, `HEAD & echo X`) recusada **antes** de qualquer
      comparação, sem efeito. Caminho com espaço provado (`/c/tmp/rev c`)
- [x] `--json` no mesmo contrato do gate · `exit 0/1` · **12/12** no `--autoteste`, e invertendo a
      direção de `compararRotas`: **9/12**, exatamente os três casos de rota
- [x] É passo de **CI** (`ci:contrato` no `package.json` de TS/JS): não entra em `pre-commit` nem no
      `verificar` local, pela tabela de custo do §7

**Cobre 5 famílias de cláusula do §5** — rota, método, campo de resposta, campo obrigatório de
requisição, `servers[0].url`. **Declara como limite no §7.2** — tipo alterado, validação apertada, enum
que perdeu valor, semântica: o leitor de spec é *ciente de NOME*, não *ciente de FORMA* (sabe se a
propriedade existe e se está em `required`, não o `type`/`enum`/`pattern`). Estendê-lo é redesenho do
extrator. **Cinco provadas e quatro escritas, em vez de nove alegadas.**

### F.2c — cobertura real + relatório de máquina  ✅ **CONCLUÍDO**
> O bloco não era "emitir lcov". Era: **`cobertura.minima: 80` era declaração sem verificador** — o
> `vitest.config` do molde declarava um bloco `coverage` sem o provider instalado, o molde Python não
> tinha `pytest-cov`, e o `_doc` do campo dizia que quem media era o `verificar`, **que não media**.
> Lei 9 quebrada dentro do arquivo de política do próprio template.

- [x] **A cobertura passou a ser instalável e medida**: `@vitest/coverage-v8` (TS/JS) e `pytest-cov`
      (Python, no molde **e** na raiz — `verificar.py --cobertura` roda no interpretador compartilhado)
- [x] **O `_doc` deixou de mentir**, nos três `verificacao.json` e no schema: diz que nem o gate nem o
      `verificar` medem, e nomeia quem mede
- [x] **Decisão (b) — CI-only, decidida por medição**: `npm run cobertura` num módulo recém-gerado levou
      **23,36s**, dos quais ~17s são piso de ambiente (jsdom + instrumentação v8) e ~0,3s são o teste.
      Mesmo módulo trivial paga o piso, e isso estoura a promessa de "segundos" do `verificar` e das
      "dezenas" do `pre-push` — cai na linha que o §7 já reservava para o executor de entrega
- [x] **Formatos entregues**: lcov e JUnit nos dois ecossistemas · JSON de lint (eslint) · SARIF de lint
      (ruff, nativo na versão pinada). **Não entregue e declarado no §7.2**: SARIF do ESLint — exigiria
      `@microsoft/eslint-formatter-sarif`, dependência nova para um formato que o mesmo consumidor já lê
      em JSON
- [x] **Threshold pelas próprias ferramentas** (`coverage.thresholds` e `--cov-fail-under`), sem
      reimplementar leitura de lcov. Com `minima: 95` contra 81,5% / 87,2% medidos, os dois reprovam
- [x] **Relatório degenerado não conta como sucesso** — a lei 7 aplicada à camada de saída, que era o
      defeito mais provável do bloco. Verifiquei os quatro caminhos: ausente · vazio sem `SF:` ·
      `tests="0"` · sem `<testsuite`. Cada um reprova com mensagem própria e exit 1
- [x] **`relatorios/` e `.coverage` tolerados em `estrutura-estrita`** — a armadilha que eu havia previsto
      (a árvore do módulo é fechada e não tinha entrada para relatório). Gate segue `0/0` com
      `relatorios/cobertura/lcov.info`, `relatorios/junit.xml` e `.coverage` presentes num módulo
- [x] Achado de execução: o reporter `'lcov'` do vitest grava também `lcov-report/` com JS de navegação,
      que `log`/`limiar-funcao` acusavam como código do autor. Trocado para **`'lcovonly'`** — resolveu
      sem precisar tocar `contexto.mjs`

**Nota de acoplamento, para quem pegar a F.2d/e:** a tolerância de `.coverage` em `estrutura-estrita` é
**global aos três bindings**, mas o `.gitignore` que o cobre é só o do esqueleto **Python** — onde o
`coverage.py` de fato roda. Um `.coverage` num projeto TS passaria no gate e seria versionável; é
inalcançável hoje (um projeto tem um binding só), e some de vez se algum dia o `[tool.coverage.run]
data_file` apontar para dentro de `relatorios/`, o que retiraria a entrada da árvore fechada.

### F.2d — `ci:seguranca` + `ci:dependencias`  ✅ **CONCLUÍDO**

**Decisão do usuário: ferramenta que falta, se instala — ela é parte do pacote.** Isso resolve a
política de ausência e mata o motivo do "fail-open". Duas consequências, uma limpa e uma medida:

- `pip-audit` entra em `optional-dependencies` como o `pytest-cov` da F.2c; `npm audit` é embutido.
  Nada a decidir.
- **`gitleaks` NÃO entra como dependência**, e o motivo é a doutrina batendo em si mesma: é binário Go,
  os wrappers npm/pip **baixam release do GitHub num `postinstall`**, e a descrição da skill
  `cyber-dependencias` lista exatamente *"typosquatting e **scripts de instalação**"* entre o que ela
  audita. O portão estágio 0 seria instalado pelo padrão que a skill de segurança sinaliza.

**O estágio 0 é ferramenta própria, e o template já tem metade dela:**
- `operacao.mjs:25` exporta `PADRAO_CREDENCIAL` — vocabulário **fechado** de sufixo de credencial, já
  base de `gateway-credencial` e `segredo-em-publico`. Uma lista, não duas;
- o gate **não pode** fazer isto e a doutrina diz por quê — `gitignore-segredo` e `pre-commit-instalado`
  compartilham a linha *"o gate não roda git de propósito — é o que o mantém puro e chamável de dentro
  do próprio hook"* —, e a mesma linha já delega: *"o `.env` que já foi commitado é do passo de CI,
  fail-closed"*. Então é **ferramenta**, como o `contrato-compativel`;
- `gitleaks` presente no ambiente vale como **segunda opinião**, nunca como dependência.

**E a contradição herdada não era o que parecia.** "Audit fail-open" escondia dois casos:

| Situação | O que é | Resposta |
|---|---|---|
| ferramenta ausente | não verificou | **REPROVA** (lei 7) — e a decisão do usuário elimina o caso |
| **CVE novo sem correção disponível** | verificou, e o mundo mudou | válvula **nominal e datada** |

O segundo deixa vermelho o build que estava verde ontem **sem ninguém tocar em código**. Fail-open é
interruptor; a resposta certa é o padrão que o template já tem — `03-operacao.md` §8: exceção nominal com
`decisao` apontando ADR, *"sem esse link, o gate rejeita a própria exceção"*, lista começando **vazia**.
Verificado que o mecanismo é real: `carregarExcecoes` (`contexto.mjs:314`) separa válidas de inválidas
por presença de `decisao`, e `validar.mjs:23-30` perdoa as válidas e denuncia as inválidas. **Acrescentar
`expira`** é o que falta: "sem patch hoje" tem prazo, "aceito para sempre" é outra frase.

- [x] **`ferramentas/ci-seguranca.mjs`** — estágio 0 fail-closed. `.env` versionado (`git ls-files`) +
      segredo no delta, com **dois** vocabulários fechados: `PADRAO_CREDENCIAL` reusado do gate (uma
      lista, não duas) e 9 formas de valor com prefixo inequívoco, copiadas de
      `skills/cyber-segredos` com a origem citada (skill não viaja para o projeto gerado).
      **Sem heurística de entropia** — declarado no §7.2 como falso negativo assumido, porque entropia é
      onde vive o falso positivo (hash de teste, UUID de fixture, base64 inline) e a lei 1 não o aceita
- [x] **As três situações do fail-closed distintas na saída**: git mudo reprova · delta vazio passa com
      linha própria (*"nada mudou"*, que não é *"não verifiquei"*) · `gitleaks` ausente **não** reprova,
      é segunda opinião. E quando ele está presente, confirma de forma independente
- [x] Achado **mascarado** (`AKIA...EY`), nunca o segredo inteiro no log de CI — o próprio autoteste o
      travava
- [x] **`ferramentas/ci-dependencias.mjs`** — `npm audit --json` / `pip-audit --format=json` contra
      `dependencias.severidadeMinima`, sem chave nova. **Lei 10 provada**: sem lockfile o npm devolve
      JSON bem-formado (`{"error":{"code":"ENOLOCK"}}`) e o passo **reprova** — "zero vulnerabilidade" e
      "não auditei" não são a mesma saída
- [x] **Exceção de CVE nominal + datada** em `config/conformidade.json:excecoesCve` — mesmo arquivo,
      porque a disciplina do `decisao` já mora e já é testada ali. Quatro estados: sem `decisao` reprova ·
      `expira` futuro perdoa · passado reprova como `expirada` · malformado reprova como
      `expira-malformada` (não vira "válida para sempre")
- [x] **`hojeISO` entra por parâmetro** no núcleo (`statusDaExcecao`, `avaliar`) — a casca consulta o
      relógio. Sem isso o caso "expirada" passaria hoje e quebraria sozinho no calendário
- [x] Delta **reusado**, não inventado: a mesma forma de `contrato-compativel.mjs`
- [x] **Premissa derrubada pela medição:** `pip-audit` não reporta severidade/CVSS, então o piso só
      filtra o npm — do lado pip todo achado conta. Declarado no §7.2, não escondido

### F.2d.1 — o scanner acusava o próprio pacote  ✅ **CONCLUÍDO**
- [x] **Falso positivo sobre o template conforme, achado na revisão.** As fixtures do `--autoteste` do
      `ci-seguranca` eram literais no arquivo (`"AKIAIOSFODNN7EXAMPLE"`, `const STRIPE_API_KEY = …`), e
      `criar-projeto.mjs:92` copia `ferramentas/` inteiro para dentro do projeto — então **todo projeto
      gerado nascia com `ci:seguranca` vermelho**, apontando um arquivo que o template instalou. A
      medição original tinha varrido só `bindings/**`; `ferramentas/` também viaja
- [x] Conserto: fixtures montadas em tempo de execução (`montar('AKIA', 'IOSFODNN7', 'EXAMPLE')`) — o
      literal deixa de existir no fonte e **`ferramentas/` continua sendo varrido**. A alternativa
      (excluir `ferramentas/`, com o precedente do lint) foi recusada com o argumento certo: ponto cego
      num **linter** é tolerável, num **scanner de segredo** é o defeito que ele existe para não ter
- [x] Provado nos três bindings com delta = template inteiro (134 · 134 · 112 arquivos): **zero
      achados, exit 0**. E o segredo real continua pego, mascarado, com `gitleaks` confirmando
      independentemente

### F.2e — o entrypoint: fazer a §3.4 ser verdade  ✅ **CONCLUÍDO**

> **O defeito, e era da lei 9 no nível da arquitetura.** `00-arquitetura.md` §3.4 dizia que `src/` é um
> *entrypoint* que *"descobre … resolve … injeta … e **monta cada `api/` sob a `rotaBase`**"*. O código
> fazia os três primeiros e **não o quarto**: `composicao.ts`/`.py` exportavam
> `descobrirModulos`/`resolverDependencias`/`resolverAuth` e nada mais — não montavam app, não escutavam,
> **ninguém as importava**, e não existia script `start`. O template tinha 74 regras, cinco ferramentas e
> três autotestes verdes — e **nunca havia sido iniciado como processo**.

- [x] `montarSistema`/`iniciarSistema` (e os equivalentes Python) **em cima** do que já existia — as três
      funções foram reusadas, não reescritas. Um processo, uma porta (§5), `RAIZ_API_PORT` declarada em
      `projeto.json:envRequerido` e sem default: a falta derruba o boot
- [x] **Quatro defeitos reais que nenhuma varredura estática acharia**, e os quatro só apareceram porque
      algo finalmente rodou:
      **(1)** montar cada app em `"/"` fazia o middleware de auth do primeiro módulo **negar as rotas
      públicas do segundo** — consertado montando cada um na própria `rotaBase`;
      **(2)** no Python, `Mount` do Starlette **stripa** o prefixo antes de repassar e cada `criar_app`
      já embute a própria `rotaBase` → 404 em cascata; resolvido com dispatcher ASGI que escolhe por
      prefixo e repassa o `scope` intacto;
      **(3)** `core.*`/`api.*` são pacotes com o **mesmo nome** em cada módulo — compor dois no mesmo
      processo colide em `sys.modules`; resolvido isolando `sys.path`/cache por importação. É limite do
      binding Python que TS/JS não têm (ESM resolve por caminho, não por nome);
      **(4)** `resolver_dependencias` devolvia `dict` e `criar_app` esperava o dataclass
      `DependenciasModulo` — nunca exercitados juntos até existir um entrypoint
- [x] **O entrypoint NÃO serve o front.** O `vite.config` do molde afirmava que a raiz de composição
      serve front+API na mesma origem; o §4.4 nunca disse isso. Corrigido nos dois lados: o §4.4 agora
      diz que caminho relativo exige mesma origem **mas quem publica os dois juntos é decisão de deploy**
      (§5, fora desta doutrina), e o comentário do molde deixou de afirmar o falso
- [x] §3.4 e o código **concordam**: o quarto verbo entrou na doutrina e o entrypoint passou a cumpri-lo
- [x] Puro + autoteste: `verificarRotasUnicas` 5/5 (TS/JS) · `verificar_rotas_unicas` +
      `escolher_rota_base` 8/8 (Python). Descoberta, DI e boot são I/O — provados subindo o processo

### F.2e.1 — o caminho documentado não subia  ✅ **CONCLUÍDO**
- [x] **Projeto com dois módulos não subia pelo caminho documentado**, e a instrução do próprio arquivo
      não consertava. `criar-modulo.mjs:garantirEnvDaRaiz` era `if (existsSync('.env')) return` — o `.env`
      nascia no **primeiro** módulo e do segundo em diante as chaves nunca chegavam nele. O boot morria
      em `variaveis ausentes: PEDIDOS_API_PORT, PEDIDOS_DB_URL`, e o cabeçalho do `.env` mandava rodar
      `sincronizar-env.mjs`, que **só escreve `.env.example`** — mais uma declaração sem verificador
- [x] Conserto **(b)**: o script passou a **mesclar** o `.env` real, e `garantirEnvDaRaiz` foi removida —
      duas fontes para criar o mesmo arquivo, uma delas morta, é o que o resto da base evita
- [x] **Nunca sobrescreve valor preenchido** (provado com `.env` populado + módulo novo) e **nunca apaga
      chave em silêncio**: chave órfã vai para uma seção `ORFAS` **comentada**, valor preservado — some do
      `process.env` sem sumir do arquivo, que é o recorte certo para credencial
- [x] Os dois cabeçalhos deixaram de ser um só: o `.env.example` mantém *"NAO edite a mao"* (verdade, ele
      nunca tem valor) e o `.env` real passou a dizer **chaves geradas, valores à mão**
- [x] Provado nos três bindings, do zero, sem passo manual além de preencher valores: as três rotas
      obrigatórias × dois módulos, `401` na não pública dos dois, `404` fora

> **Nota de método, para todos os blocos seguintes.** Este bloco produziu **cinco** defeitos reais e
> nenhum era alcançável por análise estática — todos apareceram porque algo executou. E o executor mediu
> um risco de ambiente que vale vigiar: **editar arquivo pré-existente neste ambiente gerou CRLF**, onde
> criar arquivo novo não. Confira bytes em arquivo **editado**, não só em arquivo criado.

### F.2f — a emissão: o artefato existe  ✅ **CONCLUÍDO**

> **O fato que decidiu:** o fonte já estava escrito como se houvesse build — todo import relativo
> carrega `.js` (convenção NodeNext: a extensão do arquivo **emitido**), e o Node não resolve isso a
> partir do fonte (`ERR_MODULE_NOT_FOUND`, medido em 24.10). O `tsx` cobria o buraco em dev. Emitir fez
> o `.js` desses imports virar verdade.

- [x] **Só o TypeScript emite** (`tsc -p tsconfig.build.json`, raiz + cada módulo, `outDir: dist`
      espelhando a árvore 1:1 — imports relativos batem sem reescrita). JavaScript **já é** o artefato;
      Python roda o fonte. **Nenhum `build` vazio por simetria** — comando que devolve 0 sem fazer nada
      é a lei 10 com outra roupa
- [x] **`tsc` emite código, não o projeto.** `ferramentas/empacotar.mjs` leva os ativos que o runtime lê
      — medido por varredura: só `modulo.json` e `config/**/*.json`; `contrato/openapi.yaml`,
      `core/templates/` e `database/` **não** são lidos em runtime e ficam fora de propósito. Cópia por
      **convenção** (todo `.json` da pasta, `dependencies` unidas mecanicamente), nunca lista de nomes —
      é o que impede a lista de envelhecer
- [x] **O artefato sobe sem a árvore de fonte** — o teste que dava sentido à palavra: zero `.ts`, sem
      `ferramentas/`, sem `tests/`, **sem `tsx`**, 73 pacotes contra 464, `node dist/src/composicao.js`.
      Três rotas × dois módulos 200, 401 na não pública, 404 fora
- [x] Os **dois** caminhos exercitados (lei 11): dev via `tsx` do fonte, produção via `node` do emitido,
      a mesma `composicao.ts` nos dois. `escolherEntrypointDoModulo` é puro e prefere `dist/` quando
      existe — com o preço declarado: `dist/` velho é servido sem aviso, mitigado por recompilar do zero
- [x] Módulo **continua compilando isolado** (`tsc --noEmit` dentro dele) — a propriedade que sustenta a
      extração não se perdeu. Gate `0/0` no projeto gerado **depois** do build; nada do artefato versionável
- [x] Achado que só compilar de verdade acharia: `allowImportingTsExtensions: true`, herdado do tsconfig
      de tipos, quebra a emissão com **TS5096**

### F.2f.1 — travar as tolerâncias, e uma entrada morta  ✅ **CONCLUÍDO**
- [x] **A premissa do revisor caiu, e a medição é melhor que ela.** Eu disse que `dist` estava
      "destravado"; ele está **inalcançável**: `contexto.mjs:NAO_PERCORRER` já contém `'dist'`, e a única
      exceção de `CONTEUDO_IGNORADO_MAS_ENTRADA` é `'gerados'` — `dist` nunca chega a `ctx.entradasRaiz`.
      A entrada `'dist'` em `ENTRADAS_PERMITIDAS` é **morta**: removê-la não muda nada (93/93 · 93/93 ·
      89/89). Nenhum caso em `casos.mjs` poderia travá-la, e o executor **reportou em vez de fingir**
- [x] `relatorios` e `.coverage` (débito da F.2c) **travados** por chamariz num caso de OUTRA regra
      (`schema-manifesto`) — a técnica da J.2/F.2a/F.2d. Removendo qualquer um:
      `id NAO declarado: estrutura-estrita`, 92/93. Um caso trava os dois
- [ ] **Sobrou uma linha:** apagar `'dist'` de `ENTRADAS_PERMITIDAS`. É o precedente da H1, onde
      `'gerados'` foi achado morto na mesma lista — lá a saída foi torná-lo alcançável, porque uma regra
      precisava; aqui nada precisa, então a entrada sai. Lista normativa com item inalcançável é
      declaração sem efeito

### F.2g — migrations contra banco efêmero + exemplo de CI documentado
- [ ] **`build` é decisão de arquitetura antes de ser script.** Medido: o `tsconfig.json` da raiz tem
      `"noEmit": true`, não há bundler para a `api/`, e `dist/` está no `.gitignore` sem que nada
      escreva nele — **o template não tem alvo de artefato desenhado**. O que é "o artefato" de um
      monólito modular (um bundle por módulo? um `dist/` único? nada, e o deploy roda o fonte?) é
      pergunta de arquitetura. **Conversar antes de escrever**
- [ ] Migrations executáveis — sobem e descem contra banco efêmero. O único item onde o provedor
      realmente entra (service container), e onde a fronteira da ADR-005 volta a ser testada
- [ ] Exemplo de fiação de CI **como documentação** no `03-operacao.md`, nunca como artefato de provedor
- [x] **`dependencia-fixada` é etapa de CI, não regra de gate** — decidido e medido em F.0, registrado
      no §7.1 ("Deixaram de ser regra"). O passo é `npm ci`, que **falha sozinho** sem lockfile, com
      mensagem melhor que a do gate. Motivo: lockfile é produto do `npm install`, e o gate promete
      rodar **sem instalar nada** — é o que o faz viajar dentro do módulo extraído. Medido: projeto
      recém-criado não tem lockfile em nenhum dos três bindings, e no Python o template não declara
      arquivo de trava nenhum. Como regra, reprovaria todo projeto no minuto em que nasce
- [x] ~~Estágio 0 fail-closed~~ e ~~audit de dependência~~ — **feitos na F.2d**, e o "fail-open" do audit
      foi revertido ali (ferramenta ausente REPROVA; a válvula é exceção nominal e datada)

> **Três dos cinco são precondição de CD, não CI por esporte:** sem **build** não há artefato para
> publicar (e o `package.json` da raiz TS/JS **não tem** `build` — só o módulo tem `build:web`); sem
> **migration executável nos dois sentidos** o `-- rollback` que a regra `migrations` já exige nunca
> foi rodado, e rollback nunca executado é rollback que não existe; sem **detector de breaking change**
> não se sabe se o deploy pode ser rolling ou precisa de `/api/v2/` convivendo com a v1
> ([[02-contrato-e-dados]] §5). Os outros dois são o portão fail-closed antes de algo sair.

---

## Bloco CD — fora deste plano, e o motivo está na doutrina

`00-arquitetura.md` §5: *"**Modularidade não é topologia de deploy.** A independência que importa é a de
**código**, não a de deploy […] O dia em que um módulo precisar de infraestrutura própria, a mudança é
de operação, não de código."*

As três camadas da F.2 respondem *"isto está correto?"* — idempotentes e reversíveis. CD responde
*"ponha isto na frente de gente"* — nem uma nem outra. Não é o quarto degrau: é o que **consome** a
escada, e a costura é o **exit code** do CI.

**O template já cobra propriedade de CD onde CD é código**, e vale ver quanto: `/health` e `/meta` são
rotas **obrigatórias** (regra `contrato`) — são as probes que qualquer orquestrador chama; `fallback-raiz`,
`fallback-silencioso` e `env-declarado` proíbem o default silencioso porque ele *"vira o valor de
produção no dia em que a chave falta"* (§7.2); e `gate --extracao` responde literalmente *"este módulo
está pronto para virar serviço?"*.

**O que o template não pode possuir, com o motivo já registrado:** ambientes (o §5 acima, mais a decisão
já tomada de **não** modelar estágio) · segredos de produção · gatilho e estratégia de release · o alvo
(as skills `deploy-vercel` e `deploy-docker` são as donas, HITL porque publicar é externo e irreversível).

- [ ] **A pergunta que precede qualquer pipeline de CD: qual é a unidade de release?** O repositório
      inteiro, ou o módulo? O template deixa as duas possíveis de propósito — é o sentido do
      `--extracao`. A resposta é **por projeto**, não por template: responder aqui seria escolher a
      topologia que o §5 diz que o template não escolhe
- [ ] Se algum dia CD entrar no template, a forma honesta é a mesma combinada para o CI:
      **ADR novo + exemplo documentado**, nunca artefato de provedor

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

           F.1  `afetados.mjs`         grafo reverso de `consome`, erra para mais — 19 casos próprios

           F.2a a escada             `.githooks/` dono do template + 3 camadas + regra 74 (74 regras)
           F.2a.1 sem `shell: true`  injeção por nome de pasta, travada com payload adversarial

           F.2b `contrato-compativel`  5 cláusulas provadas, 4 declaradas como limite

           F.2c cobertura real        `cobertura.minima` deixou de ser ficção · lcov · JUnit · SARIF

           F.2d segurança + deps      scanner próprio, exceção de CVE datada · F.2d.1 tirou o
                                      falso positivo sobre o próprio pacote

           F.2e o entrypoint         a §3.4 virou verdade · 5 defeitos que só a execução revelou
           F.2e.1 o `.env` de todo módulo, não só do primeiro

           F.2f a emissão            o artefato sobe sem a árvore de fonte, com `node` puro
           F.2f.1 tolerâncias travadas · `'dist'` em ENTRADAS_PERMITIDAS é entrada MORTA

AGORA      F.2g migrations contra banco efêmero + exemplo de CI documentado — **última do Bloco F**
           H    dívidas              a qualquer momento
           CD   fora do plano        falta responder a unidade de release — é por projeto
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
