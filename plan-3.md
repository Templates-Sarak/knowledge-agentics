# Plano 3 — o idioma do template

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **A pergunta que o abriu.** *"O correto, segundo as boas práticas, não seria em inglês?"* — feita
> depois do teste de execução real, olhando `api/src/routes` e `api/src/mapeadores` na mesma pasta.
>
> **A resposta, medida.** A boa prática não é *"tudo em inglês"*: é **vocabulário técnico em inglês,
> vocabulário de domínio no idioma do negócio**. O `04-regras.md` §3 já enuncia exatamente isso — e o
> template **não cumpre a própria regra**: usa português em `modulos`, `ferramentas`, `portas`,
> `mapeadores`, `gerados`, `dominio`, que são vocabulário **estrutural**, e onde nada impõe português.
>
> **O recorte decidido pelo dono:** código e estrutura de pastas em **inglês**; comentários e
> documentação **permanecem em português**. Nenhuma tradução — só rename.

**Regras herdadas, e continuam valendo:**
- **Regra permanente do `plan-2`:** todo bloco que toca esqueleto ou ferramenta só fecha com o **Bloco K
  verde nos três bindings**.
- **Regra permanente do `plan.md`:** regra nova exige caso próprio em `casos.mjs` e linha no catálogo
  (§4.x), mais o limite no §7.2.
- **Quem marca ITEM é o executor; quem marca BLOCO é o revisor.**
- **Citação é por `§`, nunca por número de linha.**

> **Este documento é executável de ponta a ponta.** A fronteira — o que vira inglês e o que fica em
> português — está **decidida item a item no Bloco AC**. Se o executor discordar de uma linha da
> fronteira, **para e pergunta**; não escolhe sozinho e não estende a fronteira por analogia.

---

## Estado — medido antes de decidir

| Métrica | Valor | Como |
|---|---|---|
| Pastas estruturais em português | **9** (~26 diretórios físicos nos 3 bindings) | `modulos ferramentas dominio portas motor contrato gerados mapeadores` |
| Ocorrências como **caminho** | **960** — das quais 215 são `specs/arquitetura/` (documentação, **fica**) | varredura em `.mjs .ts .js .py .json .md .yaml .sql .toml` |
| Funções do **esqueleto** com nome PT | **248 distintas · 409 ocorrências** | `bindings/**` |
| Funções das **ferramentas** com nome PT | **343 distintas · 433 ocorrências** | `ferramentas/**` |
| Citações do vocabulário **em forma de código** | doutrina **330** · comentários **488** | dentro de crase ou com barra |
| Citações **como palavra solta em português** | doutrina **284** · comentários **1.150** | **NÃO se toca** — é português correto |

**A medição que define a estratégia:** nos comentários, **70% das ocorrências são a palavra usada como
conceito**, não como identificador. O perigo desta campanha não é traduzir mal — é **substituir demais**.
A operação segura é a estreita, e o default (não mexer) é o correto.

---

## Bloco AB — o verificador de citação  *(pré-requisito, executado à parte)*

> **O único ponto cego.** Nada confere que um caminho ou identificador citado em TEXTO existe no disco.
> A doutrina pode passar a descrever `core/dominio/` num template que só tem `core/domain/` e tudo fica
> verde — e a doutrina é **copiada para dentro de cada projeto**.

- [x] `specs/_estrutura_modulos/testes/verificar-citacoes.mjs`, no contrato dos irmãos
      (`--antes` · `--depois` · `--autoteste` · exit 0/1 · núcleo puro · zero dependência) — **contrato
      equivalente, forma diferente da prevista** (nota abaixo)
- [x] ~~Três classes: A caminho · B vocabulário fechado · C identificador livre~~ — **pivô registrado no
      cabeçalho do próprio arquivo**: essa classificação por FORMA foi tentada numa rodada anterior e
      mediu **360 achados numa base conforme, todos falso-positivo**. Substituída por **inventário
      fechado** (`rename-inventory.json`, `{antigo, novo, tipo, fase}`, populado pelo Bloco AC/AD):
      `--antes` prova que todo nome antigo listado é citado hoje e resolve; `--depois` prova zero
      ocorrência do nome antigo e que todo nome novo citado resolve
- [x] **LINHA DE BASE antes de qualquer rename** — é o `--antes`
- [x] ~~`npm run verificar:citacoes` na base~~ — CLI é `node testes/verificar-citacoes.mjs --antes|--depois|--autoteste`,
      fora de `ferramentas/` de propósito. **Não** entra no Bloco K por binding

### AB.1 — o corpus não cobre config, e é onde o pior modo de falha mora  *(achado na revisão do AC)*

> **Medido pelo revisor.** As extensões presentes nos 2.392 achados do `--depois` são
> `.mjs · .md · .py · .ts · .js · .tsx · .jsx` — **nenhum `.json`, `.yaml`, `.toml` nem dotfile.** Só nos
> cinco nomes amostrados (`memoria modulos ferramentas portas gerados`) são **122 ocorrências fora do
> corpus**, e as duas mais críticas são exatamente as que a simplificação do AC apostou em cobrir:
>
> ```
> bindings/typescript/_template/config/portas.json:3   "repositorio": "memoria"
> bindings/typescript/raiz/package.json:9              "modulos/[a-z]*"
> ```
>
> **E um dos dois falha em SILÊNCIO.** `"repositorio": "memoria"` não renomeado derruba
> `resolverDependencias` e os testes de contrato pegam. Já `"modulos/[a-z]*"` no `workspaces`: o glob
> deixa de casar, `npm install` **não erra**, e `npm run test --workspaces` roda **zero testes e sai 0** —
> `verificar` verde sem ter testado nada. É o modo de falha que este template inteiro existe para não ter.

- [x] **Acrescentar `.json`, `.yaml`, `.toml`, `.sql` e os dotfiles (`.gitignore`, `.githooks/*`) ao
      corpus.**
- [x] Depois do conserto: `--antes` continua **43/43 limpo**, e `--depois` passa a acusar as 122+
- [x] **A simplificação do AC fica APROVADA com isso** — reusar `tipo: simbolo` para `modulos` e
      `memoria` é semanticamente correto; o defeito era o corpus, não o tipo. Nenhum tipo novo é preciso

**Por que antes:** escrito depois, ele é escrito contra a realidade já renomeada — reporta verde e não
consegue achar o que nunca viu quebrado. Escrito antes, produz a **lista de citações que resolvem hoje**,
e depois da campanha a mesma lista tem de resolver de novo. Isso é um *diff*, não uma opinião.

---

## Bloco AC — a fronteira, e ela vira ADR

> *"Código em inglês, documentação em português"* parece uma linha nítida. Ela **atravessa onze
> artefatos** que não são claramente nem um nem outro, e cada um precisa de decisão explícita — senão a
> fronteira volta a ser arbitrária, que é o defeito que esta campanha existe para consertar.

- [x] **ADR novo no template** (`doutrina/adr/decisoes.md`, **ADR-009**) — refeito com **o princípio que
      fecha a fronteira numa frase**: *a árvore de arquivos é inglês, o conteúdo dela é português.*
      `doutrina/`/`specs/arquitetura/` é a **única exceção**
- [x] **Correção contra o disco:** a varredura completa achou **12** pastas estruturais em português, não
      8 — a lista original não contava `ferramentas/gate/regras/`, `testes/` (dois lugares) e
      `adapters/memoria/`, e citava `modulos` como se fosse pasta física da base quando só existe no
      **projeto gerado**

| # | Artefato | Decisão | Motivo |
|---|---|---|---|
| 1 | Pastas estruturais (**12**) | **inglês** — `ferramentas→tools` `dominio→domain` `portas→ports` `motor→engine` `contrato→contract` `gerados→generated` `mapeadores→mappers` `modulos→modules` `raiz→root` `regras→rules` `testes→tests` `memoria→memory` | é a árvore — o que se lê em cada import |
| 2 | `doutrina/` / `specs/arquitetura/` | **português — única exceção ao princípio** | é a **documentação**, não conteúdo de módulo; o nome é vocabulário do fluxo SDD, compartilhado com `_estrutura_base` — renomear sai do template |
| 3 | Funções do **esqueleto** | **inglês** | é o código que o dev escreve todo dia |
| 4 | **Símbolos** dentro de `ferramentas/` (→ `tools/`) | **português** | *"ferramental vendorizado — o dono é outro repositório"*, e por isso já é **isento do linter** no projeto gerado. Vale só para o símbolo — o **arquivo** que o contém segue a linha 5 |
| 5 | Nomes de arquivo dentro de `ferramentas/`, os **~29 `.mjs`** | **inglês** — `criar-projeto→create-project` `validar→validate` `sincronizar-env→sync-env` `escrita→writing` `isolamento→isolation` `contexto→context` … | é a árvore, não o conteúdo. É a superfície de CLI que o dev digita |
| 6 | **Ids das 74 regras** | **português** | id de regra é **nome de artigo de lei**, e a lei é portuguesa. É citado muito mais em prosa (§4.x e §7.2) que em código, e a mensagem que o acompanha fica em português — `[raw-output] devolve registro cru` seria a mistura que estamos removendo |
| 7 | **Mensagens** do gate e erros de runtime | **português** | documentação entregue por código; é a UX do template |
| 8 | **Chaves do manifesto** e nome do arquivo | **inglês** — `module.json`, `name` `data` `ports` `requiredEnv` `basePath` … | é config lida por código — árvore, não conteúdo. **É o item que mais pesa** — e o mais bem guardado: JSON Schema + ~40 regras com caso |
| 9 | Chaves de ambiente | **inglês** — `ROOT_API_PORT`, `<MODULE>_DB_URL` | convenção universal de env |
| 10 | Rotas (`/registros`) e banco (`titulo`, `<mod>_metadados`) | **português** | o §3 já decide: domínio e dados — conteúdo, não árvore. É a boa prática de DDD, não a exceção |
| 11 | Nomes de **skill** (`code-modulo`, `cyber-segredos`) | **fora do escopo** | é convenção de toda a base Sarak, não do template |

- [x] **O §3 do `04-regras.md` é reescrito para descrever a fronteira acima** — doze pastas, princípio
      árvore/conteúdo

---

## Bloco AD — a campanha

> **Atômica POR FASE**, não como bloco. Cada fase (`AD.1`, `AD.2`, `AD.3`) tem de cair de uma vez nos
> três bindings, no gate, nos casos e nas citações — dentro dela não dá para parcelar, o autoteste ou
> está verde ou não está. Mas as fases **não** caem juntas: o enunciado original dizia que sim, e três
> tentativas do AD.1 mostraram o contrário. Uma fase, um relatório, uma aprovação.

### AD.1 — pastas ✅ **FECHADO** *(commit `b8d48a7`, revisado e reproduzido)*
- [x] Os **39 diretórios** nos três bindings, `_template` e `_adapter`, por `git mv` — o histórico
      importa mais aqui do que em qualquer outro bloco desta família.
      **Correção contra o disco:** este item dizia **26**, número herdado da contagem de 8 pastas que o
      AC já corrigira para 12. Doze *nomes* de pasta rendem **39 diretórios físicos** (`ports` 6 ·
      `domain` 6 · `contract` 6 · `tests` 5 · `root` 3 · `memory` 3 · `generated` 3 · `engine` 3 ·
      `mappers` 2 · `tools` 1 · `rules` 1), porque a maioria aparece uma vez por binding e mais uma em
      `_template`. **123 renomeações `R` no commit**, nenhum `delete`+`add`
- [x] As **constantes de caminho do gate**: `ENTRADAS_PERMITIDAS`, `PASTAS_DE_ARTEFATO` (as **duas**
      cópias — `create-module.mjs` e `structure.mjs`), `NAO_PERCORRER`,
      `CONTEUDO_IGNORADO_MAS_ENTRADA`, o filtro `/mapeador/i`→`/mapper/i` de `chavesDaProjecao` (nos
      **dois** pontos: `chavesDaProjecao` e `temMapeador`), `areaDoImport`, `saiDoModulo`, `temArquivoEm`
- [x] As **ferramentas**: `criar-projeto` `criar-modulo` `criar-adapter` `empacotar` `afetados`
      `sincronizar-env` `verificar-commit` `ci-*` `gerar-*` — mais o núcleo do gate e os arquivos de
      regra, **55 itens de arquivo no inventário**
- [x] Config derivada e ignorada: `IGNORADOS` do `gerar-config-lint`, `.gitignore` (`**/generated/*` +
      `!**/generated/.gitkeep`), `tsconfig` (`exclude: ["…","modules"]`), `vitest.config`, `pyproject`
      (`exclude = ["^modules/"]`), `workspaces` (`modules/[a-z]*`)
- [x] `casos.mjs` — os **alvos lógicos** por nome de pasta (`ALVOS.mapeadores` → `ALVOS.mappers`, com os
      `acrescentarEm`/`substituirEm` correspondentes; sem isso **7 casos ficavam SEM COBERTURA em
      silêncio**, e foi assim que o defeito apareceu)

**Prova de fechamento — medida pelo revisor, não relatada:**

| Verificação | Resultado |
|---|---|
| `apply-rename --autoteste` | **37/37** |
| `verify-citations` · `verify-map` · `affected` | 31/31 · 9/9 · 19/19 |
| Resíduos tipo `arquivo`, fronteira frouxa (sem `.`) | **0** |
| Diferencial independente do revisor contra `5a4083a` | **0 prosa corrompida** |
| Gate self-test, árvore LF | **122/122 · 122/122 · 119/119** |
| Bloco K | **13/13 nos três bindings** |
| Blobs commitados | **215/215 em LF** |

> **Duas coisas que este bloco custou três tentativas para aprender, e que valem para o AD.2/AD.3:**
>
> 1. **O campo `fase` protege contra vazamento de ITEM, não contra colisão de LITERAL.** `dominio` é item
>    legítimo do AD.1 (a pasta) e mesmo assim renomeou `papel: "dominio"` — valor de manifesto, que
>    nenhuma fase toca. A generalização é a lista de **literais protegidos**, e ela é do mesmo tipo de
>    mecanismo dos outros: fechada, explícita, cresce por decisão.
> 2. **`--diferencial` e `verify-citations --depois` cobrem falso POSITIVO, não falso NEGATIVO.** Uma
>    referência estrutural que *deveria* ter mudado e não mudou não aparece em diff de linha alterada.
>    Foi assim que `create-module.mjs:162` (`'from core.motor import gerar_artefato\n'`) sobreviveu a
>    duas redes e só caiu no Bloco K. **Antes do AD.2, ver o item de método no fim deste plano.**

### AD.2 — funções do esqueleto
- [ ] As **248** dos `bindings/**`, incluindo a fiação de `FABRICAS` e os entrypoints
- [ ] **Os seis âncoras de regra, e eles NÃO são rename — são regra alterada:**
      `paraContrato`/`paraColecao`/`paraMeta` × `linhaParaDominio`/`dominioParaLinha` (o **discriminador
      de direção** de três regras; em inglês a propriedade sobrevive — `toContract` começa com `to`,
      `rowToDomain` não —, mas exige casos novos) · `exigirPermissao` (lido por `permissao-literal`) ·
      `envObrigatoria` e `carregarConfiguracao` (lidos por `env-fora-do-carregador`)
- [ ] **MÉTODO OBRIGATÓRIO nos seis:** trocar o **âncora** e as **fixtures** em passos separados, e
      **provar o estado intermediário vermelho**. Ali o objeto testado e o teste mudam juntos — é o
      cenário clássico em que uma suíte passa sem provar nada

### AD.3 — as chaves do manifesto  *(o item que mais pesa, e o único que faltava ter seção)*

> **Levantado pelo executor ao tocar o schema.** O item 8 da fronteira estava no AC como uma menção —
> *"é o que mais pesa"* — e sem seção própria. Ele é, sozinho, **um JSON Schema inteiro + ~40 casos de
> regra**, porque quase toda regra do gate lê do manifesto. Merecia estar escrito.

- [ ] **`modulo.json` → `module.json`** e as **19 chaves**: `nome→name` · `versao→version` ·
      `descricao→description` · `papel→role` · `rotaBase→basePath` · `rotaWeb→webPath` · `dados→data`
      (`schema` · `prefixo→prefix` · `tabelas→tables`) · `envRequerido→requiredEnv` · `portas→ports` ·
      `consome→consumes` (`modulo→module` · `contrato→contract` · `porQue→why`) ·
      `permissoes→permissions` · `rotasPublicas→publicRoutes` · `camposSensiveis→sensitiveFields` ·
      `navegacao→navigation` (`label` · `icone→icon` · `ordem→order`) · `exportaResumo→exportsSummary` ·
      `geraArtefato→generatesArtifact`. `id` e `binding` já são inglês
- [ ] **`projeto.json` → `project.json`** e `envRequerido→requiredEnv` — o schema da raiz tem
      `additionalProperties: false`, então ele reprova sozinho se a chave nova não for declarada. **Use
      isso como trava:** renomear o schema antes do manifesto faz o gate acusar, e é a contraprova barata
- [ ] **Os dois schemas** (`modulo.schema.json`, `projeto.schema.json`) e todo `$comentario` que os cita
- [ ] **As ~40 regras que leem manifesto** — `ctx.manifesto.<chave>` em `estrutura.mjs`,
      `configuracao.mjs`, `contrato.mjs`, `dados.mjs`, `isolamento.mjs`, `operacao.mjs`
- [ ] **`casos.mjs`** — todo caso que muta manifesto (`m.manifesto.<chave>`), que é a maioria
- [ ] **As ferramentas que escrevem ou leem manifesto:** `criar-modulo` (escreve), `sincronizar-env`
      (lê `envRequerido`), `afetados` (lê `consome`), `composicao.*` (lê `portas`, `rotaBase`,
      `envRequerido`), `empacotar`, `contrato-compativel`, `criar-adapter`
- [ ] **A tabela campo-a-campo do `01-modulo.md` §3.1** e o §5.2 do `funcionamento-esperado.md`
- [ ] **O que NÃO muda, e a fronteira precisa estar clara no diff:** `dados.schema` continua com valor
      em português (nome de schema é **dado**, decisão 10), e `permissoes` continua com valores
      `<id>:<verbo>` em português (`catalogo:ler`) — **a chave vira inglês, o valor não**

**Trava específica deste bloco:** o **JSON Schema é o verificador mais barato que existe aqui.** Renomeie
a chave no schema **antes** de renomeá-la no molde e nos leitores: o gate passa a reprovar todo módulo
com `schema-manifesto`, e isso prova que a mudança está sendo vista. Verde no meio do caminho é sinal de
que o schema não está sendo lido.

### AD.4 — as citações em texto
- [ ] **Só as ~818 em forma de código** (dentro de crase ou com barra/ponto). As **1.434 como palavra
      solta ficam intactas** — são português correto, e substituí-las é o defeito desta campanha
- [ ] A substituição é **escopada por construção**: o script só troca dentro de crase e em token com
      barra ou extensão. Nada de `sed` no arquivo inteiro
- [ ] `verificar-citacoes` verde ao final, contra a linha de base do Bloco AB

### AD.5 — o que fica declarado FORA, com motivo
- [ ] **As 343 funções de `ferramentas/`** — decisão 4 da fronteira. 433 ocorrências de nomes internos
      que ninguém que usa o template lê, por ganho ~zero
- [ ] **Os planos** (`plan.md`, `plan-2*`, `plan-3*`) — registro histórico. Citam nomes que existiam
      quando foram escritos, e é isso que um registro deve fazer. **Não migram**, e o
      `verificar-citacoes` os ignora por lista explícita, não por acidente
- [ ] **Comentários e doutrina** — permanecem em português. Só as citações mudam

**Critério de aceite da campanha:** autoteste `122/122 · 122/122 · 119/119` · Bloco K **13/13 nos três
bindings** · `verificar-citacoes` verde · `verificar-mapa` verde · e um projeto gerado do zero passando
`verificar` → `build` → `lint` → **primeiro commit**.

---

## Bloco AE — CRLF/`autocrlf` ✅ **FECHADO** *(commit `671cbf7`, revisado e reproduzido)*

> **O que este bloco entregou, e é a propriedade que o template anuncia.** Um clone limpo, em Windows,
> com `core.autocrlf=true`, passa no próprio gate **sem nenhuma intervenção manual**. Antes desta
> rodada o mesmo clone lia `1/122 · 1/122 · 1/119`.
>
> **E os três fracassos que este projeto carregou por vários planos como *"pré-existentes de regra"* —
> `contrato-sincronizado`, `resumo-exportado` e `projecao-contrato` (molde Python) — eram UM defeito de
> bancada.** Nenhuma regra foi tocada.

| Verificação — clone feito **a partir do commit**, zero `sed` | Resultado |
|---|---|
| Arquivos em CRLF no working tree | **0** |
| Autoteste do gate | **122/122 · 122/122 · 119/119** |
| Bloco K, sem `--binding` | **3/3 VERDE**, 13/13 passos em cada |
| Árvore CRLF, só a defesa em profundidade | **120/122 · 120/122 · 116/119**, roda até o fim |
| As 3 falhas nessa árvore | cada uma com *"o arquivo esta em CRLF e a agulha em LF; renormalize"* |
| Contraprova, agulha ausente por motivo **não**-EOL | **121/122** — 1 reprova, 121 medidos, **sem** o palpite |

> **A decisão semântica que não era óbvia:** `MUTACAO_INVALIDA` devolve `{ ok: false }` — **reprova**;
> `SEM_COBERTURA` devolve `{ pulado: true }`. Se a mutação inválida tivesse virado "pulado" por simetria
> de forma, o resultado seria **verde falso** — exatamente o que este bloco existe para eliminar.

> **Achado na rodada AD.1 — REFAZER.** Reproduzido em clone pristino de `5a4083a`, sem nenhuma
> mudança desta campanha: `core.autocrlf=true` (padrão em checkout Windows) entrega
> `eslint.config.js`/`.ruff.toml` em CRLF; `tools/generate-lint-config.mjs` sempre gera LF puro;
> `lint-derivado` compara byte a byte. Resultado: **121 dos 122 casos do autoteste caem por
> co-achado `lint-derivado`**, mascarando qualquer outro resultado do Bloco K neste ambiente —
> corrigido apenas como diagnóstico (`sed`, não commitado como parte de AD.1) para medir os blocos
> AD.1-AD.5 sem esse ruído.

- [x] `.gitattributes` de cada binding hoje só força `text eol=lf` em `.githooks/*`. Decidir —
      e testar — quais outros caminhos GERADOS (`eslint.config.js`, `.ruff.toml`, os dois
      `config-*.schema.json` derivados, outros?) precisam da mesma regra — **decidido: `* text=auto
      eol=lf` amplo (relatório do executor tem o porquê e o custo)**
- [x] Contraprova: aplicar a regra, `git add --renormalize .`, reproduzir o clone pristino de novo,
      confirmar Bloco K sem o co-achado `lint-derivado` SEM o `sed` manual
- [x] Decidir se `tools/generate-lint-config.mjs` deveria detectar e respeitar o EOL do arquivo
      existente em vez de sempre emitir LF, como camada extra (o `.gitattributes` é a correção
      estrutural; isso seria defesa em profundidade) — **decidido: NÃO (relatório do executor tem o
      porquê)**

> **A revisão do AD.1 mediu o alcance real, e ele é maior que o diagnóstico acima.** São **três
> sintomas de uma raiz**, e o terceiro ninguém tinha visto:

- [x] **`gerar-schemas-portas --conferir` tem o mesmo defeito do `lint-derivado`** —
      `conteudoConfigPortas()` junta com `\n` e compara byte a byte contra um
      `config-ports.schema.json` que o checkout entrega em CRLF. Reprova o passo `verificar` do Bloco K
- [x] **`substituir` em `tools/gate/tests/run.mjs` FALHA ABERTO, e é o mais grave dos três.**
      `String.replace(agulha)` que não acha devolve a string igual, **em silêncio**. Das 13 mutações de
      `cases.mjs`, **3 contêm `\n`** e portanto nunca aplicam em árvore CRLF: o gate não acha nada e o
      caso reporta `FALHA — nenhum achado`, mandando quem investiga olhar a **regra** quando o defeito
      está na **mutação**. Tem de **lançar** quando o texto procurado não existe.
      **Contraprova:** trocar o texto de uma mutação por algo ausente e exigir que o autoteste morra
      nomeando a mutação, não a regra
- [x] **Reclassificar:** os três fracassos que este plano vinha carregando como *"pré-existentes de
      regra"* — `contrato-sincronizado`, `resumo-exportado` e `projecao-contrato` (molde Python) — são
      **UM defeito de bancada, não três de regra**. Medido: convertendo os 39 arquivos ainda em CRLF, o
      autoteste vai a **122/122 · 122/122 · 119/119** sem tocar em regra nenhuma
- [x] Varrer **todo `String.replace(<literal>)`** das ferramentas e decidir a política. O mesmo padrão
      causou o único defeito real do AD.1 (`create-module.mjs:162`, `'from core.motor import …'`) —
      **22 chamadas achadas em `tools/`, categorizadas no relatório; `create-module.mjs` (o mesmo
      padrão citado aqui) e `run.mjs:substituir` endurecidos, o resto já era seguro ou é cosmético**

> **Medição que dimensiona a urgência.** Clone limpo de `b8d48a7` em Windows com `core.autocrlf=true`:
> **209 arquivos em CRLF**, e o autoteste lê **1/122 · 1/122 · 1/119**. A propriedade que este template
> anuncia é auto-verificação, e no estado commitado ela é **falsa para o caso de uso mais comum**.
> Enquanto isto durar, todo relatório de rodada precisa dizer *"verde neste worktree"* — uma frase que
> este ecossistema não deveria precisar escrever. **Por isso o AE vem antes do AD.2:** o AD.2 vai
> precisar acreditar no gate, e hoje "vermelho" é ambíguo.

---

## Bloco AI — a rede do outro lado ✅ **FECHADO** *(commit `b43094b`, revisado e reproduzido)*

> **O que fechou.** O defeito que sobreviveu a DUAS redes no AD.1 e só caiu no Bloco K três passos
> adiante, disfarçado de `ModuleNotFoundError`, **agora cai num comando, nomeando arquivo e linha**.

| Verificação — clone feito **a partir do commit** | Resultado |
|---|---|
| `--relatorio --fase AD.1` | **exit 0** · 0 pendências · 0 recusas novas |
| **Idempotência** — `--aplicar` em árvore já renomeada | **`git diff` vazio, 0 arquivos** |
| Contraprova: `core.motor` reinjetado em `create-module.mjs` | **exit 1** — `create-module.mjs:184 [motor] (identificador)` |
| Contraprova de prosa, refeita pelo revisor em outra linha | **exit 1**, recusa nova com arquivo e linha |
| `apply-rename` · `verify-citations` · `verify-map` · `affected` · `contract-compatible` | 45/45 · 31/31 · 9/9 · 19/19 · 12/12 |
| Gate · Bloco K | 122/122 · 122/122 · 119/119 · **3/3 VERDE** |

> **Auditoria das 24 recusas `RECUSADO-LITERAL-PROTEGIDO`, uma a uma** (proteção nova é falso negativo
> em potencial, que é o que este bloco caça): 5 valores de manifesto (`papel: 'dominio'`), 3 chaves de
> manifesto (`"portas"`), **7 ids de regra** (`id:`/`regra:` `'contrato'`/`'testes'` e
> `REGRAS_DE_EXTRACAO` — decisão 6 do AC), 7 na documentação da chave em `generate-port-schemas.mjs`.
> **Nenhuma é referência de pasta recusada por engano** — a pasta sempre aparece com barra
> (`packages/portas`), que `pareceCaminho` resolve antes da proteção nu.

> *(`AF`, `AG` e `AH` já são do `plan-3.1.md` — a família 3 compartilha a sequência de letras.)*

> **O buraco, e ele é do revisor.** As duas redes desta campanha — o `--diferencial` do
> `apply-rename.mjs` e o `verify-citations --depois` — cobrem **falso positivo**: prosa portuguesa que
> virou inglês por engano. **Nenhuma das duas cobre falso negativo**: referência estrutural que *deveria*
> ter mudado e não mudou. E não cobre por construção, não por descuido — o diferencial só olha linha que
> **mudou**, e uma linha esquecida não muda.
>
> Foi exatamente assim que `create-module.mjs:162` sobreviveu às duas e só caiu no Bloco K, três passos
> adiante, disfarçado de `ModuleNotFoundError`. **O AD.2 e o AD.3 têm a mesma exposição em escala
> maior** — o AD.3 mexe em ~40 regras com caso.

- [x] **A lista de RECUSAS vira ARTEFATO, não saída de console.** `--relatorio` grava as recusas em
      arquivo versionado (`tests/rename-refusals.json` ou similar), com arquivo, linha e o token recusado
- [x] **A rodada seguinte só aceita recusa que já estava lá.** Recusa **nova** é revisão obrigatória — e
      é uma lista curta, porque o inventário é fechado. É a mesma disciplina de `conformidade.json`:
      começa vazia, cresce por decisão explícita, nunca por heurística
- [x] **Fronteira com o que já existe:** o `--diferencial` continua sendo o aceite de *não corrompeu*;
      este é o aceite de *não esqueceu*. São perguntas diferentes e precisam de artefatos diferentes —
      juntá-los num relatório só foi o que permitiu ao AD.1 declarar "0 suspeitas" com um defeito dentro
- [x] **Contraprova:** remover à mão uma substituição legítima já feita (voltar um `tools/` para
      `ferramentas/` numa linha), rodar, e exigir que apareça como recusa NOVA — nomeando arquivo e linha

### AI.4 — a invariante que faltava *(achada testando o AI contra o defeito histórico)*

> **O AI foi construído para fechar o buraco de falso negativo, e a primeira coisa medida com ele foi o
> defeito histórico — que ele deixou passar.** Reinjetando `'from core.motor import gerar_artefato\n'`
> em `create-module.mjs`, o `--relatorio` sai **exit 0, "0 recusas novas"**. A ferramenta *vê* (aparece
> como `identificador: 1` nos totais), mas **não lista as pendências e não olha para elas no exit**.
>
> **A lição:** *"não esqueceu de revisar"* e *"não sobrou nada por fazer"* são **duas perguntas**. O
> artefato de recusas responde a primeira. A segunda é uma linha de código, e é a que teria pegado o
> `create-module.mjs:162` na hora.

- [x] **Para uma fase FECHADA, substituição pendente tem de ser ZERO.** Listar cada pendência
      (`arquivo:linha`, classe, contexto — no mesmo formato das recusas) e **sair 1** se houver qualquer
      uma. Hoje as pendências só existem como número agregado em *"totais por classificacao"*
- [x] Contraprova nos dois sentidos: **(a)** reinjetar o defeito histórico → sai **1** nomeando
      `create-module.mjs` e a linha *(hoje sai 0)*; **(b)** estado limpo → **0 pendências, exit 0**

### AI.5 — a não-idempotência *(defeito de origem do AD.1, e a origem é do revisor)*

> **`--aplicar --fase AD.1` na árvore APROVADA — Bloco K verde — corrompe 14 pontos.** Todos são chave
> de manifesto (AD.3) ou **id de regra**, que a decisão 6 do Bloco AC manda ficar em português. Medido
> pelo revisor rodando `--aplicar` numa cópia e lendo o `git diff`:
>
> | Onde | O quê |
> |---|---|
> | `modulo.json` × 3 bindings | `"portas"` → `"ports"`, com o schema (excluído) ainda em `portas` |
> | `tools/gate/engine.mjs` §`REGRAS_DE_EXTRACAO` | `'contrato'` — **id de regra**, quebraria o registro |
> | `tools/gate/rules/structure.mjs` §`CAMPOS_OBRIGATORIOS` | `'portas'` — chave de manifesto |
> | `tools/generate-port-schemas.mjs` | 6, inclusive a regex `/"portas":\s*\{…/` **e o comentário que diz que `"portas"` ali é chave de manifesto da fase AD.3 e nunca é renomeada** |
> | `composicao.py`, `test_config.py` | leitura de `modulo["portas"]` |
>
> **Causa, e ela é do revisor.** No reescrever do AD.1 a exclusão `/(^|[\/])modulo\.json$/` saiu de
> `CAMINHOS_EXCLUIDOS` com a justificativa *"não cita a si mesmo por nome"*. Isso responde a uma
> pergunta **diferente**: a exclusão nunca foi sobre autocitação — era contra **literal de pasta do AD.1
> colidindo com chave de manifesto do AD.3**. O revisor aprovou esse raciocínio.

- [x] **Estender LITERAIS PROTEGIDOS para chave de manifesto e id de regra em ARRAY DE STRING NU.** Hoje
      o padrão-de-linha exige `id:`/`regra:`/`papel:` na mesma linha, e `REGRAS_DE_EXTRACAO` /
      `CAMPOS_OBRIGATORIOS` são listas nuas. Precisa de reconhecedor pelo **nome da constante** (a linha
      `const X = [` / `new Set([` que abre o bloco), não por marcador na mesma linha.
      *(Devolver só a exclusão de `modulo.json` resolve 3 dos 14 — não basta.)*
- [x] **Aceite operacional de idempotência:** `--aplicar --fase AD.1` numa árvore já renomeada produz
      **`git diff` VAZIO**. Colar o `git diff --stat` provando

---

## Ordem de dependência

```
AB   o verificador de citação    PRÉ-REQUISITO — e com LINHA DE BASE, senão não serve
                                 (executado à parte, antes de tudo)

AC   a fronteira em ADR          antes de tocar arquivo: é ela que impede a fronteira
                                 arbitrária de voltar por analogia

AD   a campanha                  AD.1 ✅ FECHADO (b8d48a7). AD.2 tem método próprio
                                 nos 6 âncoras

AE   o CRLF, e os 3 sintomas     ✅ FECHADO (671cbf7). Clone limpo em Windows passa
                                 no próprio gate sem intervenção manual

AI   a rede do outro lado        ✅ FECHADO (b43094b). Falso negativo agora tem rede,
                                 e o codemod é idempotente

────────────────────────────────────────────────────────────────────────────────
PRÓXIMO: AD.2 — os dois pré-requisitos (AE, AI) estão fechados.
────────────────────────────────────────────────────────────────────────────────

═══ meta: `core/domain/` e `toContract` num template cuja lei e cujos comentários
    seguem em português, e cuja fronteira está escrita num ADR ═══
```

> **A campanha deixou de ser atômica, e isso foi medido, não escolhido.** O enunciado original do AD
> dizia *"tem de cair de uma vez"*. Três tentativas mostraram que não: o AD.1 sozinho consumiu duas
> reversões completas, e o que o tornou fechável foi justamente ter sido isolado — uma fase, um
> relatório, uma aprovação. O AD.2 e o AD.3 seguem a mesma disciplina.

---

## Fora deste plano

- **Traduzir comentários e documentação** — recusado pelo dono, e é a decisão certa: são **4.767 linhas
  de argumento** (26% do código), com medição dentro. Traduzir isso é **autoria**, sem verificação
  possível, e o que se perde não é a palavra — é a ênfase que impede alguém de desfazer um conserto.
- **Nomes de skill do ecossistema** — decisão 11 da fronteira.
- **A verificação prática pendente** (skill real, migrations em JS/Python contra Postgres, a regra da
  convenção de nome do mapeador) — está no **`plan-3.1.md`**, e ela roda **depois** da campanha, porque
  a convenção que a regra vai cobrar muda de `para*` para `to*` aqui.
