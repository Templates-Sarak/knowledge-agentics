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

> **Atômica.** Tem de cair de uma vez nos três bindings, no gate, nos casos e nas citações. Não dá para
> parcelar: o autoteste ou está verde ou não está.

### AD.1 — pastas *(o maior retorno por unidade de trabalho)*
- [ ] Os **26 diretórios** nos três bindings, `_template` e `_adapter`, por `git mv` — o histórico
      importa mais aqui do que em qualquer outro bloco desta família
- [ ] As **constantes de caminho do gate**: `ENTRADAS_PERMITIDAS`, `PASTAS_DE_ARTEFATO`, `NAO_PERCORRER`,
      `CONTEUDO_IGNORADO_MAS_ENTRADA`, o filtro `/mapeador/i` de `chavesDaProjecao`, `areaDoImport`,
      `saiDoModulo`, `temArquivoEm`
- [ ] As **ferramentas**: `criar-projeto` `criar-modulo` `criar-adapter` `empacotar` `afetados`
      `sincronizar-env` `verificar-commit` `ci-*` `gerar-*`
- [ ] Config derivada e ignorada: `IGNORADOS` do `gerar-config-lint`, `.gitignore` (`**/generated/*`),
      `tsconfig`, `vitest.config`, `pyproject`, `workspaces` do `package.json`
- [ ] `casos.mjs` — os **alvos lógicos** por nome de pasta

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

## Bloco AE — CRLF/`autocrlf` mascarando `lint-derivado` *(defeito real do template, não da campanha)*

> **Achado na rodada AD.1 — REFAZER.** Reproduzido em clone pristino de `5a4083a`, sem nenhuma
> mudança desta campanha: `core.autocrlf=true` (padrão em checkout Windows) entrega
> `eslint.config.js`/`.ruff.toml` em CRLF; `tools/generate-lint-config.mjs` sempre gera LF puro;
> `lint-derivado` compara byte a byte. Resultado: **121 dos 122 casos do autoteste caem por
> co-achado `lint-derivado`**, mascarando qualquer outro resultado do Bloco K neste ambiente —
> corrigido apenas como diagnóstico (`sed`, não commitado como parte de AD.1) para medir os blocos
> AD.1-AD.5 sem esse ruído.

- [ ] `.gitattributes` de cada binding hoje só força `text eol=lf` em `.githooks/*`. Decidir —
      e testar — quais outros caminhos GERADOS (`eslint.config.js`, `.ruff.toml`, os dois
      `config-*.schema.json` derivados, outros?) precisam da mesma regra
- [ ] Contraprova: aplicar a regra, `git add --renormalize .`, reproduzir o clone pristino de novo,
      confirmar Bloco K sem o co-achado `lint-derivado` SEM o `sed` manual
- [ ] Decidir se `tools/generate-lint-config.mjs` deveria detectar e respeitar o EOL do arquivo
      existente em vez de sempre emitir LF, como camada extra (o `.gitattributes` é a correção
      estrutural; isso seria defesa em profundidade)

---

## Ordem de dependência

```
AB   o verificador de citação    PRÉ-REQUISITO — e com LINHA DE BASE, senão não serve
                                 (executado à parte, antes de tudo)

AC   a fronteira em ADR          antes de tocar arquivo: é ela que impede a fronteira
                                 arbitrária de voltar por analogia

AD   a campanha                  ATÔMICA — pastas + funções do esqueleto + citações,
                                 num movimento. AD.2 tem método próprio nos 6 âncoras

═══ meta: `core/domain/` e `toContract` num template cuja lei e cujos comentários
    seguem em português, e cuja fronteira está escrita num ADR ═══
```

---

## Fora deste plano

- **Traduzir comentários e documentação** — recusado pelo dono, e é a decisão certa: são **4.767 linhas
  de argumento** (26% do código), com medição dentro. Traduzir isso é **autoria**, sem verificação
  possível, e o que se perde não é a palavra — é a ênfase que impede alguém de desfazer um conserto.
- **Nomes de skill do ecossistema** — decisão 11 da fronteira.
- **A verificação prática pendente** (skill real, migrations em JS/Python contra Postgres, a regra da
  convenção de nome do mapeador) — está no **`plan-3.1.md`**, e ela roda **depois** da campanha, porque
  a convenção que a regra vai cobrar muda de `para*` para `to*` aqui.
