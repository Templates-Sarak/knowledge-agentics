# FE — Sistema Modular Sarak

> **O que este documento é.** A descrição **exata e conferível** do que o sistema modular faz, de como
> ele se verifica e de como se encaixa no resto do repositório. Cada afirmação aqui é **medível**: existe
> um comando, um arquivo ou uma contagem que a confirma ou a derruba.
>
> **Para que serve.** Referência de verificação. Um agente que confira o repositório contra este
> documento deve conseguir, para cada seção, **rodar algo e comparar**. Divergência entre este documento
> e o repositório é **defeito de um dos dois** — e a regra de desempate é: **o repositório é a verdade,
> este documento é a expectativa.** Achou divergência? Reporte os dois lados, não conserte em silêncio.
>
> **O que este documento NÃO é.** Não é a lei. A lei é o `specs/_estrutura_modulos/doutrina/04-regras.md`
> — **regra que não está lá não é regra**. Aqui se descreve o funcionamento; lá se define o que é
> obrigatório.

---

# 1. O que é

Um **esqueleto de sistema modular que se verifica sozinho**. Vive em `specs/_estrutura_modulos/` e é
**copiado** para dentro de cada projeto novo — não é biblioteca nem dependência: é um repositório
inicial completo, **com o verificador viajando dentro dele**.

**O princípio único, do qual tudo o mais decorre:**

> **A fronteira física de pastas É a fronteira de dependência.**
> Extrair um módulo para infraestrutura própria é **copiar uma pasta e recortar as chaves `<MODULO>_*` do
> `.env`** — nunca reescrever import.

Um **módulo** é uma **fatia vertical**: dono do próprio front, da própria API, do próprio motor e da
própria fatia de banco. Três bindings — `typescript`, `javascript`, `python` — e **um projeto adota um**.

## 1.1 As três leis que valem sempre

1. **Módulo não importa módulo.** Vizinho só por HTTP, declarado em `module.json:consumes`.
2. **Módulo não importa adapter.** O adapter é **injetado** pela composição.
3. **Módulo não toca a fatia de dados alheia.** Cada um tem `schema` e `prefix` próprios.

## 1.2 As três camadas

| Camada | Onde, na base | Muda por linguagem? |
|---|---|---|
| **0 — Doutrina** | `specs/_estrutura_modulos/doutrina/` | **Não** |
| **1 — Binding** | `specs/_estrutura_modulos/bindings/<linguagem>/` | Sim |
| **2 — Ferramentas** | `specs/_estrutura_modulos/tools/` | Não |

A lei é agnóstica de linguagem; a prova é concreta.

## 1.3 O mapa base → projeto gerado

| Na base | No projeto gerado |
|---|---|
| `specs/_estrutura_modulos/doutrina/*.md` | `specs/arquitetura/` |
| `specs/_estrutura_modulos/doutrina/adr/decisoes.md` | `specs/adr/000-decisoes-do-template.md` |
| `specs/_estrutura_modulos/tools/` | `tools/` (copiado inteiro) |
| `specs/_estrutura_modulos/bindings/<b>/root/` | a raiz do projeto |
| `specs/_estrutura_modulos/bindings/<b>/_template/` | `modules/_template/` (o molde) |
| `specs/_bases_arquiteturais/00-base-<b>.md` | `specs/arquitetura/00-base-<b>.md` |
| `specs/_estrutura_base/` | `specs/` (o fluxo SDD do projeto) |

**É a confusão que todo mundo tem uma vez: na base a lei se chama `doutrina/`; no projeto ela se chama
`specs/arquitetura/`. É o mesmo arquivo, instalado.**

**`specs/_estrutura_modulos/tests/` NÃO viaja.** É ferramental de manutenção do template.

**Verificação:** gere um projeto e confira que cada destino existe e que **nenhum arquivo do projeto cita
um caminho `specs/_estrutura_modulos/`** — exceto onde o texto declara explicitamente que fala da base
(hoje: a tabela de `specs/arquitetura/00-base-<b>.md`, com o cabeçalho *"Onde, na base"*, e uma linha do
`specs/adr/000-decisoes-do-template.md` rotulada *"caminho do repositório do template"*).

---

# 2. Estrutura do módulo

Todo módulo vive em `modules/<id>/` e tem **exatamente** esta árvore. É **fechada**: entrada não prevista
reprova pela regra `estrutura-estrita`.

```
modules/<id>/
├── module.json              O MANIFESTO — a fonte de verdade sobre o módulo
├── README.md
├── contract/openapi.yaml    o contrato da API — escrito ANTES do código
├── api/src/                 a borda HTTP: routes, mappers, middlewares, logger, erros
├── core/
│   ├── domain/              a regra de negócio — não conhece HTTP nem banco
│   ├── ports/               as interfaces de infraestrutura que o módulo exige
│   ├── gateways/            fala com OUTRO módulo, exclusivamente HTTP
│   ├── engine/              geração de artefato       (só com generatesArtifact)
│   └── templates/           moldes do artefato        (só com generatesArtifact)
├── config/                  api · domain · ports · seguranca · textos  (zero hardcoded)
├── database/migrations/     NNNN-verbo-objeto.sql + schema.sql
├── tests/{contract,domain,fixtures,web}/
├── web/src/{pages,components,hooks,api-client}/   (só com webPath não-nulo)
└── generated/               saída de máquina — fora da varredura, entrada declarada
```

**Porta × Gateway é a distinção que mais se erra:** *porta* é **infraestrutura** (banco, fila, storage);
*gateway* é **outro módulo**. São fronteiras de risco diferentes e por isso ficam em pastas diferentes.

**Três rotas são obrigatórias em todo módulo:** `GET /health`, `GET /meta`, `GET /resumo`.
*(Conferível: `const OBRIGATORIAS` em `tools/gate/rules/contract.mjs`.)*

## 2.1 O manifesto `module.json` — campo a campo

**19 campos obrigatórios, todos com verificador, e campo não previsto REPROVA**
(`additionalProperties: false`).

| Campo | O que é | Cuidado |
|---|---|---|
| `id` | kebab-case | **tem de bater com o nome da pasta** — o gate compara |
| `name` · `version` · `description` | identificação | `version` é `^\d+\.\d+\.\d+$` |
| `role` | `domain` · `gateway` · `connector` | **inglês no manifesto**; o `--role` da CLI aceita `dominio`/`gateway`/`conector` e grava a forma inglesa |
| `binding` | a linguagem do módulo | um projeto, um binding |
| `basePath` | `^/api/v1/[a-z][a-z0-9-]*$` | tem de bater com `servers[0].url` do contrato |
| `webPath` | `/<id>` ou **`null`** | `null` = módulo backend-only |
| `data` | `schema` · `prefix` · `tables` | **nunca** `public`; `prefix` é `^[a-z][a-z0-9-]*_$`; toda tabela declarada |
| `requiredEnv` | chaves de ambiente, `^[A-Z][A-Z0-9_]*$` | ausente **derruba o boot** — nunca default silencioso |
| `ports` | as interfaces que o módulo exige | cada uma precisa de provedor em `config/ports.json` |
| `consumes` | `{ module, contract, why }` | a rota e o método têm de existir no dono |
| `ui` | `modo: proprio \| kit` | em `kit`, nada de biblioteca de UI bruta — e `packages/ui-kit` é convenção **do projeto**, o template não o entrega |
| `permissions` | `<id>:<verbo>` | vêm do manifesto, nunca de literal no código |
| `publicRoutes` | as que passam sem token | tudo o mais é negado por padrão |
| `sensitiveFields` | nomes que não podem vazar | nem em resposta, nem em log |
| `navigation` | `label` · `icon` · `order` | obrigatório quando há `webPath` |
| `exportsSummary` | entra no dashboard cross-módulo | se `true`, `GET /resumo` declara `total` |
| `generatesArtifact` | tem `core/engine`, `core/templates`, `generated/` | **bidirecional**: `false` proíbe as três |

**O manifesto da raiz, `project.json`, é MÍNIMO de propósito:** um único campo obrigatório,
`requiredEnv`, com prefixo **`RAIZ_`** reservado. *Campo só entra ali junto com a regra que o cobra* —
declarar campo sem verificador é o vício que o template existe para não repetir.

## 2.2 Os três papéis

| `role` | O que faz | Gera artefato? |
|---|---|---|
| `domain` | dono de uma fatia do negócio | opcional (`generatesArtifact`) |
| `gateway` | traduz um serviço externo | **não, por arquitetura** |
| `connector` | **agrega** o que os outros publicam | **não, por arquitetura** |

O `connector` consome **apenas** `/health`, `/meta` e `/resumo` dos demais — nunca endpoint específico.
Quem agrega não publica. O id sugerido para ele é **`hub`**.

---

# 3. Estrutura da raiz

A raiz é **fiação**, não negócio. Ela compõe os módulos e escolhe os provedores.

```
<projeto>/
├── project.json             manifesto da raiz (requiredEnv, prefixo RAIZ_)
├── modules/                 os módulos + _template (o molde)
├── packages/ports/          as interfaces puras — o ÚNICO package que o template entrega
├── adapters/
│   ├── memory/              OBRIGATÓRIO — é o que permite testar sem rede
│   └── postgres/
├── src/composicao.*         descobre os módulos, injeta os adapters, sobe UM processo
├── tools/                   o gate e as ferramentas — copiados do template
├── config/                  verificacao.json (política) · conformidade.json (exceções)
├── scripts/migrations.*     runner de migration por módulo
├── specs/{arquitetura,adr}/ a lei instalada
├── .githooks/               pre-commit · pre-push
└── .env                     segredo real (nunca versionado) · .env.example versionado
```

**A direção da dependência é hexagonal, e o gate a cobra:**

```
modules/  ──→  packages/ports/  ←──  adapters/
                      ↑
                 src/ compõe
```

**O adapter de memória é obrigatório** porque é ele que torna o teste de domínio executável sem banco e
sem rede — a condição prática de "pronto para extração".

---

# 4. Auto-verificação

É a propriedade central: **"verde" tem de significar que verificou.** Falso positivo é a direção
proibida; falso negativo é tolerável **apenas se declarado** no `04-regras.md` §7.2.

## 4.1 As quatro camadas, e o que cada uma prova

| Camada | Comando | O que prova | Números esperados |
|---|---|---|---|
| **1. O gate** | `node tools/gate/validate.mjs --todos` | o projeto obedece à lei | 0 erros |
| **2. O gate se testa** | `node tools/gate/tests/run.mjs --binding <b>` | cada regra sabe ficar vermelha | **128/128 · 128/128 · 124/124** |
| **3. O template se testa** | `npm run autoteste:template` | o template gera projeto que passa na própria cadeia | **3/3 bindings VERDE, 13/13 passos** |
| **4. Toda ferramenta se testa** | `npm run autoteste:tudo` | nenhum `--autoteste` órfão | **17/17** |

**De onde cada uma roda, porque as duas árvores se parecem:** a camada 1 roda **dentro de um projeto
gerado** (é lá que existe `tools/` na raiz); as camadas 3 e 4 são scripts **da base** e não viajam
(§4.6); a camada 2 roda nas duas — na base, o caminho é `specs/_estrutura_modulos/tools/gate/tests/`.
Confundir as duas é o erro mais fácil de cometer, e o sintoma é `Cannot find module`. O §11.2 marca
cada comando com `[base]` ou `[projeto]`.

**A camada 2 é a que importa mais.** Ela não confere que o molde passa — confere que **cada mutação de
`cases.mjs` produz exatamente o id de regra esperado**. Id extra reprova. Sem isso, "verde" é
indistinguível de "não verificou". Caso que não se aplica a um binding aparece como `SEM COBERTURA`,
**nunca como `ok`**.

**A camada 4 tem catraca:** arquivo com `--autoteste` que não está no `REGISTRO` do
`run-all-selftests.mjs` é `ÓRFÃO` e **reprova sozinho**, antes de qualquer teste rodar. Exclusão exige
entrada escrita em `DECLARADOS_FORA`.

## 4.2 O catálogo de regras

**76 regras**, em sete famílias, com três escopos:

| Família | Regras | Família | Regras |
|---|---|---|---|
| `configuration` | 21 | `contract` | 11 |
| `isolation` | 12 | `operation` | 11 |
| `structure` | 11 | `data` | 6 |
| `writing` | 4 | | |

| Escopo | Regras | Roda sobre |
|---|---|---|
| `module` | 58 | cada módulo, uma vez por módulo |
| `root` | 14 | o projeto, **uma vez só** |
| `global` | 4 | o conjunto (ciclos, colisões) |

**O gate tem zero dependência, nunca executa o código que julga, e viaja dentro do módulo extraído** —
se o verificador só rodasse no repositório inteiro, o módulo extraído perderia a conformidade exatamente
quando ela passa a importar.

**Regra que julga CÓDIGO lê `textoDeCodigo`, não o texto cru:** comentário e docstring são removidos
antes. Sem isso, a chave citada num comentário (*"nunca leia `MODULO_SEGREDO` aqui"*) vira uso de
verdade.

## 4.3 A coerência do que é gerado

Três ferramentas com `--conferir`, e todas **reprovam a divergência** em vez de deixá-la acumular:

| Ferramenta | Compara |
|---|---|
| `sync-env.mjs --conferir` | `.env.example` × as chaves `requiredEnv` dos manifestos |
| `generate-port-schemas.mjs --conferir` | os schemas de porta × o que os manifestos declaram |
| `generate-lint-config.mjs --conferir` | a config do linter × `tools/gate/thresholds.mjs`, **byte a byte** |

**A config do linter é GERADA da lei, não escrita à mão.** Editá-la à mão é fazer a regra e o gerador
divergirem — o defeito que o gerador existe para eliminar.

## 4.4 A cadeia de verificação do projeto

`npm run verify` (TS/JS) ou `python verificar.py` (Python), nesta ordem:

```
validar          gate --todos
validar:env      sync-env --conferir
validar:schemas  generate-port-schemas --conferir
formato          prettier --check         (ACUSA; só o hook escreve)
lint             eslint .                 (config GERADA de tools/gate/thresholds.mjs)
tipos            tsc --noEmit + por módulo
test             npm run test --workspaces
```

**A ordem é barato-primeiro. Ferramenta ausente REPROVA** — "não verificado" nunca é reportado como
`ok`. E `tipos` roda **por módulo, pelo tsconfig próprio de cada um** — módulo que só compila junto do
resto não está pronto para extração.

## 4.5 As três camadas de custo

O `03-operacao.md` §7 divide por **custo**, não por importância:

```
pre-commit   segundos      gate nos módulos AFETADOS + env + formato + lint
pre-push     dezenas       tipos + testes dos afetados
CI           minutos       tudo em tudo + contrato + cobertura + segurança + deps + build + migrations
```

Quem decide "o que reverificar" é **`node tools/affected.mjs`**, e o princípio dele é explícito no
cabeçalho do arquivo: **ERRA PARA MAIS, NUNCA PARA MENOS.** Selecionar demais custa minutos de CI;
selecionar de menos deixa código **não verificado** passar. Quando ele cai em "tudo", **diz por quê**.

`.githooks/pre-commit` e `.githooks/pre-push` são **idênticos byte a byte nos três bindings** —
`tools/verify-commit.mjs` detecta o binding sozinho.

## 4.6 Ferramentas de manutenção do template *(não viajam)*

Vivem em `specs/_estrutura_modulos/tests/` — **exatamente cinco arquivos**:

| Arquivo | O que faz |
|---|---|
| `template-self-test.mjs` | a camada 3: gera projeto, cria módulos, roda a cadeia inteira |
| `run-all-selftests.mjs` | a camada 4: descobre e roda todo `--autoteste`, com catraca de órfão |
| `verify-map.mjs` | prova que todo `§` citado no mapa instalado resolve a um título real |
| `verify-catalog.mjs` | a catraca lei ↔ código: os ids do `engine.mjs` contra as linhas de tabela do `04-regras.md`, e (opcional) nenhuma contagem defasada em `tools/**` |
| `verify-routine.mjs` | o roteiro do §11.2 inteiro, como um comando — cada `# esperado` do roteiro virou comparação de verdade |

**Um sexto arquivo aqui é achado, não normalidade.**

---

# 5. Inicialização completa via skill

A porta prática é a skill **`meta-iniciar-repositorio`**, que chama
`skills/meta-iniciar-repositorio/scripts/init_repo.py`.

```
python init_repo.py --target <caminho> [--binding typescript] [--escopo acme]
                    [--modulos <id>:<role>[:artefato] ...] [--git-init]
```

**Sete passos, nesta ordem:**

1. `git init` *(opcional, `--git-init`)*
2. projeto modular: `tools/`, `packages/`, `adapters/`, `src/`, `modules/_template`
3. `specs/` do fluxo SDD (`00-*`, `_templates/`, `plan/`, `adr/`)
4. a base da linguagem em `specs/arquitetura/00-base-<binding>.md`
5. os primeiros módulos *(só com `--modulos`)*
6. `.agents/` + gerador de índice + hook de `pre-commit`
7. verificação: `gate --todos`

## 5.1 A declaração de módulo — sem inferência

**`--modulos <id>:<role>[:artefato]`, e o sufixo de papel é OBRIGATÓRIO.**

```
node init_repo.py --modulos catalogo:domain hub:connector pagamentos:gateway
```

Comportamento **exigido**, e cada linha é um teste:

| Entrada | Resultado esperado |
|---|---|
| `catalogo` *(sem sufixo)* | **ERRO**, com a forma correta na mensagem — nunca default silencioso |
| `hub:connector:artefato` | **ERRO** — `connector` e `gateway` não geram artefato por arquitetura |
| `catalogo:domain` | módulo **sem** `core/engine`, `core/templates`, `database/` |
| `catalogo:domain:artefato` | módulo **com** o esqueleto de artefato |
| `hub:connector` no meio da lista | **criado por último** — o agregador depende dos agregados |

**A ordem é pelo PAPEL declarado, nunca pelo nome do id.** E o instalador **não cria** módulo agregador
por conta própria: quem quiser um declara `<id>:connector`.

*Default documentado ainda é escolha feita por quem não estava lá; a diferença entre chute e declaração é
quem digitou.*

## 5.2 O caminho manual, se preferir

```sh
# [base] o create-project mora no TEMPLATE, não na raiz da base — não existe `tools/` ali
node specs/_estrutura_modulos/tools/create-project.mjs <destino> --binding typescript --escopo acme

cd <destino>
# [projeto] daqui em diante `tools/` é o do projeto, copiado inteiro do template
node tools/create-module.mjs catalogo --role dominio

# preencher os VALORES no .env  (as CHAVES já chegaram sozinhas)
npm install                      # ou:  pip install -e ".[dev]"
git config core.hooksPath .githooks
git update-index --chmod=+x .githooks/pre-commit .githooks/pre-push
```

**Sobre o `.env`:** as **chaves** são geradas e mescladas por `sync-env.mjs` a partir dos manifestos; os
**valores** são preenchidos à mão — é o único jeito de um segredo real nunca virar texto versionado. O
script **nunca sobrescreve valor preenchido e nunca apaga chave em silêncio**: chave que nenhum
manifesto exige mais vai para a seção `ORFAS`, comentada.

## 5.3 Onde a skill para

A `meta-iniciar-repositorio` vai até o **hook composto instalado e o gate verde**. Ela **não commita** —
o primeiro commit é da skill `git-commit-inicial`.

## 5.4 O hook de pre-commit é COMPOSTO

Dois gates independentes na mesma execução: **segredo no staged** (`.githooks/verificar_commit.py`, da
base) e **conformidade do template** (`node tools/verify-commit.mjs pre-commit`). A composição é
idempotente e cobre os quatro estados (nenhum hook / só o nosso / só o do template / os dois).

⚠️ **Em Windows com `core.filemode=false`, o hook é gravado sem o bit de execução** e o git no
Linux/macOS o **pula em silêncio**. Por isso o passo 6 do instalador manda rodar, uma vez,
`git update-index --chmod=+x .githooks/pre-commit .githooks/pre-push`.

---

# 6. O ciclo de vida do projeto

## 6.1 O dia a dia

```sh
npm run verify         # a cadeia inteira, local
npm run start          # sobe o sistema: um processo, uma porta
npm test               # testes, por módulo
```

No Python o equivalente é `python verificar.py` (com `--rapido`, `--todos`).

Ao **commitar**, o `pre-commit` roda o gate só nos módulos afetados, mais env, formato e lint. Ao
**empurrar**, o `pre-push` roda tipos e testes dos afetados.

## 6.2 A entrega

```sh
npm run build           # emite o backend e constrói o front de cada módulo com web/
npm run start:prod      # roda o artefato — node puro, sem tsx
npm run migrations      # aplica e reverte as migrations
```

**O artefato é autossuficiente:** sobe sem a árvore de fonte, sem `tools/`, sem `tests/`.

| binding | backend | front |
|---|---|---|
| `typescript` | emite (`tsc -p tsconfig.build.json`) | `vite build` por módulo com `web/` |
| `javascript` | nada — já é o artefato | idem |
| `python` | nada — roda o fonte | não tem `web/` |

## 6.3 O CI — e aqui está a liberdade

**O template não traz pipeline** (ADR-005), de propósito: config de CI é específica de provedor, e a
regra não pode morar num lugar que se perde ao trocar de provedor. O que ele traz é o **contrato de
acoplamento** — *exit code* e *relatório legível por máquina*:

```sh
npm run ci:contract        # breaking change vs baseline git
npm run ci:cobertura       # lcov + JUnit
npm run ci:lint            # JSON
npm run ci:seguranca       # estágio 0, fail-closed
npm run ci:dependencias    # audit, com exceção nominal e datada
npm run build  ·  npm run migrations
node tools/affected.mjs    # seleção do que reverificar
```

No Python, por flag: `python verificar.py --todos | --cobertura | --seguranca | --dependencias |
--migrations | --lint-relatorio`.

**Actions, GitLab, Jenkins** consomem o *exit code*. **SonarQube** consome o *relatório* — ele não roda o
comando, lê a saída. Com os dois, o template nunca precisa saber o nome de provedor nenhum.

---

# 7. Criar e extrair um módulo

```sh
node tools/create-module.mjs <id> [--role dominio|gateway|conector] [--sem-artefato] [--sem-web]
```

O comando copia o molde, substitui os marcadores (`<modulo>`, `<MODULO>`, `<escopo>`), escreve o
manifesto, sincroniza `.env`/`.env.example` e **roda o gate no módulo novo**.

## 7.1 Depois de criar — a ordem que funciona

1. **Preencher os valores** das chaves novas no `.env` (`<MODULO>_API_PORT`, `<MODULO>_DB_URL`).
2. **Ajustar o manifesto** — é a fonte de verdade, e quase toda regra do gate lê dele (§2.1).
3. **Escrever o contrato antes do código.** O gate cobra que rota do código e rota da spec coincidam
   **nos dois sentidos**.
4. **Domínio primeiro, borda depois.** `core/domain/` não faz I/O; o que precisa de fora vira **porta**
   em `core/ports/`, declarada em `module.json:ports` e escolhida em `config/ports.json`.
5. **Migrations** em `database/migrations/NNNN-verbo-objeto.sql`, com o bloco `-- rollback` — e ele é
   **executado** por `npm run migrations`, não é enfeite.
6. **Testes** em `tests/`, com dublês em `tests/fixtures/`. Nada de rede nem banco: se um teste do módulo
   precisa de infraestrutura, **a porta está mal desenhada**.
7. `npm run verify` — e não entregue com o gate vermelho.

## 7.2 Os erros que o gate mais pega em módulo novo

- importar outro módulo, ou um adapter — use `consumes` (HTTP) ou uma **porta**;
- porta, permissão ou tabela usada e **não declarada** no manifesto — ou o inverso, declarada e sem uso;
- rota no código e não no contrato, ou no contrato e não no código;
- `process.env` fora do carregador de config, ou default silencioso (`?? 3000`);
- campo projetado na resposta que nenhum schema do contrato declara;
- SQL montado por concatenação — no módulo **e** na fiação;
- `console.log` no lugar do logger; função acima de 40 linhas, aninhamento acima de 3, mais de 4
  parâmetros.

**A mensagem do gate sempre nomeia o arquivo, a linha e o conserto.** Se alguma não nomear, é defeito
dela.

## 7.3 Extrair um módulo para serviço próprio

```sh
node tools/gate/validate.mjs --extracao modules/<id>   # está pronto?
```

Pronto significa: copiar a pasta, recortar as chaves `<MODULO>_*` do `.env` e **apagar a linha
`ENV_RAIZ=` do `.env` do módulo extraído**, preenchendo ali os valores para os quais ela apontava.

⚠️ **Sem esse passo o módulo morre no boot** com `[config] ENV_RAIZ aponta para "…\.env", que nao
existe` — é a cascata do ADR-004 (processo > `.env` do módulo > `.env` apontado por `ENV_RAIZ` > default
de tunable). **Nenhum import muda.** O gate viaja junto; o esqueleto novo repõe `tools/`, `adapters/`,
`packages/` e `src/`.

---

# 8. O que o template deliberadamente NÃO faz

> Esta seção existe para **evitar falso achado**. Ausência aqui é decisão registrada, não lacuna.

- **Não escolhe topologia de deploy.** *"Modularidade não é topologia de deploy"* — o sistema roda como
  monólito modular, e o dia em que um módulo precisar de infra própria a mudança é de operação, não de
  código.
- **Não modela ambientes** (staging/produção) nem guarda segredo de produção.
- **Não publica.** CD tem uma pergunta aberta antes de existir: **qual é a unidade de release — o
  repositório ou o módulo?** A resposta é por projeto. Quem publica são as skills `deploy-vercel` e
  `deploy-docker`.
- **Não serve o front pelo processo.** `web/dist/` é bundle a publicar; quem põe front e API na mesma
  origem é deploy.
- **Não traz YAML de provedor de CI.** Ver §6.3.
- **Não entrega `packages/ui-kit`.** É convenção **do projeto**; o template entrega só `packages/ports`.

---

# 9. Os dois limites que é preciso saber antes de confiar

**O hook de git é opt-in por clone** — `core.hooksPath` é config local, não vem no `git clone` — e
**`git commit --no-verify` fura**, por desenho do git. Pre-commit é **feedback rápido**; **CI é a única
cobrança que não se fura.** O lado verificável sem rodar git é coberto pela regra
`pre-commit-instalado`.

**Os limites são declarados, não escondidos.** O §7.2 do `04-regras.md` lista, **regra por regra**, o que
cada uma deixa passar e por quê — de `{` na assinatura desviando o extrator de projeção até o
`schema.sql` que não é comparado com o resultado real das migrations.

> **Lacuna conhecida é aceitável; lacuna escondida não.** Uma lei que esconde a própria lacuna é pior
> que uma lacuna conhecida.

---

# 10. Relação com os outros artefatos do repositório

`knowledge-agentics` é a **base de inteligência Sarak**, distribuída como plugin `sarak`. O sistema
modular é **um** dos artefatos dela.

| Artefato | Papel | Relação com o sistema modular |
|---|---|---|
| `CLAUDE.md` | gancho sempre-ativo | enuncia os inegociáveis e **aponta** para o `04-regras.md`. **Não reproduz a lei** |
| `skills/code-modulo` | criar módulo ou sistema, com HITL | conduz o fluxo; a lei fica na doutrina |
| `skills/meta-iniciar-repositorio` | inicializar repositório completo | chama `init_repo.py` (§5) |
| `skills/padrao-escrita` | Nível 0 (qualquer linguagem) | limiares: **≤40 linhas, ≤3 aninhamento, ≤4 parâmetros** |
| `skills/test-api-contrato` | contract testing | consome `contract/openapi.yaml` |
| `skills/deploy-vercel` · `deploy-docker` | publicação | o que o template não faz (§8) |
| `specs/_estrutura_base/` | o fluxo SDD | **instalado no projeto** como `specs/` |
| `specs/_bases_arquiteturais/` | base por linguagem | **instalado** como `specs/arquitetura/00-base-<b>.md` |
| `hooks/` | ganchos de sessão (cinco, pelo plugin) | `padrao-limiares` cobra o Nível 0 |
| `commands/` | `/code1-auditar` … | adequação de legado ao padrão |

## 10.1 Os dois níveis, e por que não se misturam

- **Nível 0** — SRP, limiares, zero hardcoded, segredo em `.env`. Vale para **qualquer** projeto.
- **Nível 1** — arquitetura de módulos. Vale **só** para projeto que adotou o template.

**Sem o template, vale o Nível 0 mais a `padrao-<linguagem>` — não se improvisa meia estrutura modular.**

## 10.2 A regra de citação, que vale para todo artefato

Skill, command e agent **referenciam** a lei; **nunca a duplicam**. Regra escrita em dois lugares é a
garantia de que os dois vão divergir — e é o defeito que este template existe para evitar.

## 10.3 Onde ler mais

| Pergunta | Documento |
|---|---|
| **O mapa — qual seção responde a quê** | `doutrina/README.md` |
| As quatro peças e as fronteiras | `doutrina/00-arquitetura.md` |
| Como um módulo é por dentro, como crio, como altero | `doutrina/01-modulo.md` |
| A forma da API, do erro, do schema, da migration | `doutrina/02-contrato-e-dados.md` |
| Segurança, log, teste, extração, camadas de custo | `doutrina/03-operacao.md` |
| **O catálogo de regras e o limite de cada uma** | `doutrina/04-regras.md` |
| Por que o gate mora no template e não no pipeline | `doutrina/adr/decisoes.md` — ADR-005 |
| O contrato do gate (argumentos, exit code, `--json`) | `tools/gate/README.md` |

No projeto gerado, tudo de `doutrina/` está em `specs/arquitetura/`, inclusive o mapa.

## 10.4 O cache do plugin *(pendência operacional conhecida)*

As skills são carregadas de `~/.claude/plugins/cache/knowledge-agentics/sarak/<versão>/`, **não** do
repositório. Conserto no repositório **não chega ao usuário** até o cache sincronizar. Verificação
qualquer que instale "pela skill" precisa **confirmar a sincronização antes**, ou estará testando o
passado.

---

# 11. Como verificar este documento

O roteiro do §11.2 é **completo e reexecutável**: confere toda afirmação medível deste documento, diz
de onde cada comando roda, qual *exit code* esperar, e apaga o que cria. Rodá-lo inteiro é a prova de
que este documento e o repositório ainda dizem a mesma coisa.

## 11.1 Pré-requisitos, custo e os dois contextos

| O que | Por quê |
|---|---|
| **Node 24+** e **Python 3.11+** | são as versões que a agenda de `.github/workflows/autoteste-template.yml` exercita |
| `npm install` na raiz da base | sem isso todo `npm run …` falha **antes** de verificar coisa alguma |
| ~5 minutos | a camada 3 domina: ela gera projeto e roda a cadeia inteira nos três bindings, e o Python sozinho mede ~2m40s |

**Cada comando é marcado `[base]` ou `[projeto]`, e confundi-los é o erro mais fácil deste roteiro.**
`[base]` roda na raiz do `knowledge-agentics`; `[projeto]` roda dentro de um projeto gerado. Os dois
têm um `tools/`, e **não é o mesmo**: na base ele vive em `specs/_estrutura_modulos/tools/`, e só no
projeto gerado existe `tools/` na raiz. O sintoma de trocar um pelo outro é `Cannot find module`.

## 11.2 O roteiro

**Automatizado.** `node specs/_estrutura_modulos/tests/verify-routine.mjs` roda A–G inteiro como um
comando só — cada `# esperado` abaixo virou uma comparação de verdade, incluindo a catraca que
faltava em `gate/tests/run.mjs`: "N regras com caso de teste" agora reprova se divergir de
`REGRAS.length`, não só aparece menor em silêncio. Registrado em `run-all-selftests.mjs` (camada 4)
com `--autoteste` provando o núcleo; a corrida real (~5 min) é este comando, não a camada 4. O que
segue é a MESMA sequência, em prosa — use para depurar um passo específico ou para conferir que o
script não se desviou do que este documento promete.

```bash
# ── preparo ───────────────────────────────────────────────────────────────
cd <raiz do knowledge-agentics>
rm -rf /tmp/fe-p /tmp/fe-t1 /tmp/fe-t2      # reexecutável: os alvos não podem preexistir

# ── A. as quatro camadas de auto-verificação (§4.1) ───────────────────────
# [base] camada 2 — cada regra sabe ficar vermelha
for b in typescript javascript python; do
  node specs/_estrutura_modulos/tools/gate/tests/run.mjs --binding $b      # exit 0
done
# esperado: 128/128 · 128/128 · 124/124, 76 regras com caso

npm run autoteste:tudo        # [base] camada 4 — exit 0, "17/17", zero ÓRFÃO
npm run autoteste:template    # [base] camada 3 — exit 0, "3/3 bindings verdes", 13/13 passos
npm run typecheck:tools       # [base] exit 0, o tsc sem diagnóstico algum
                              #        (o npm imprime 2 linhas de preâmbulo — não são saída do tsc)

# ── B. o catálogo de regras (§4.2) ────────────────────────────────────────
# [base] as três contagens de uma vez, pela única fonte que fecha
node -e "import('./specs/_estrutura_modulos/tools/gate/engine.mjs').then(m=>{ \
  const R=m.REGRAS, por=k=>R.reduce((a,r)=>(a[r[k]]=(a[r[k]]||0)+1,a),{}); \
  console.log('regras:',R.length,'| escopo:',JSON.stringify(por('escopo')), \
              '| nivel:',JSON.stringify(por('nivel'))); })"
# esperado: regras: 76 | escopo: {"module":58,"root":14,"global":4} | nivel: {"erro":72,"aviso":4}

# [base] as sete famílias — aqui o grep FECHA, porque conta id, não escopo
for f in specs/_estrutura_modulos/tools/gate/rules/*.mjs; do
  printf "%s=%s " "$(basename $f .mjs)" "$(grep -c "id: '" $f)"
done; echo
# esperado: configuration=21 contract=11 data=6 isolation=12 operation=11 structure=11 writing=4

# [base] a catraca lei ↔ código — os 76 ids do engine.mjs contra as 76 linhas de tabela do 04-regras.md,
# e (terceiro argumento) nenhuma citação de contagem defasada em tools/** ("N regras com caso"/"N
# regras suas" — nunca em .md, limite declarado em 04-regras.md §7.2)
node specs/_estrutura_modulos/tests/verify-catalog.mjs --conferir \
  specs/_estrutura_modulos/doutrina/04-regras.md specs/_estrutura_modulos/tools/gate/engine.mjs \
  specs/_estrutura_modulos/tools
echo "exit=$?"     # esperado: 0, "catalogo: OK — 76 ids, lei e codigo batem"
```

⚠️ **Não conte escopo por `grep`.** `grep -ho "escopo: '…'" rules/*.mjs | wc -l` devolve **78**, não
76 — ele captura `escopo:` citado em **comentário**. A lista real de regras é o `engine.mjs`, e é por
isso que o comando acima importa o motor em vez de varrer texto. Medido: quem contar por `grep`
reporta uma divergência que não existe.

```bash
# ── C. os dois manifestos (§2.1) ──────────────────────────────────────────
# [base]
node -e "const s=require('./specs/_estrutura_modulos/tools/gate/schemas/module.schema.json'), \
              p=require('./specs/_estrutura_modulos/tools/gate/schemas/project.schema.json'); \
  console.log('module :',s.required.length,'obrigatorios | additionalProperties',s.additionalProperties); \
  console.log('project:',JSON.stringify(p.required),'| additionalProperties',p.additionalProperties)"
# esperado: module : 19 obrigatorios | additionalProperties false
#           project: ["requiredEnv"] | additionalProperties false

# ── D. rotas obrigatórias (§2) e o que não viaja (§4.6) ───────────────────
# [base]
grep -n "const OBRIGATORIAS" specs/_estrutura_modulos/tools/gate/rules/contract.mjs  # /health /meta /resumo
ls -1 specs/_estrutura_modulos/tests/*.mjs | wc -l                                   # esperado: 5

# ── E. a declaração de módulo (§5.1) ──────────────────────────────────────
# [base] as duas formas que TÊM de ser recusadas — exit 1, e nada é criado
python skills/meta-iniciar-repositorio/scripts/init_repo.py --target /tmp/fe-t1 --modulos catalogo
echo "exit=$?"     # esperado: 1, com a forma exigida na mensagem
python skills/meta-iniciar-repositorio/scripts/init_repo.py --target /tmp/fe-t2 --modulos hub:connector:artefato
echo "exit=$?"     # esperado: 1
ls -d /tmp/fe-t1 /tmp/fe-t2 2>/dev/null || echo "nenhum alvo criado — correto"

# ── F. o que viaja para o projeto gerado (§1.3) ───────────────────────────
# [base]
node specs/_estrutura_modulos/tools/create-project.mjs /tmp/fe-p --binding typescript --escopo acme  # exit 0
node specs/_estrutura_modulos/tests/verify-map.mjs --conferir /tmp/fe-p/specs/arquitetura            # exit 0, "mapa: OK"
( cd /tmp/fe-p && grep -rl "_estrutura_modulos" . )
# esperado: SÓ ./specs/adr/000-decisoes-do-template.md — a linha rotulada
#           "caminho do repositório do template". Qualquer outro arquivo é vazamento da base.

# ── G. a camada 1 e a coerência do que é gerado (§4.1, §4.3) ──────────────
cd /tmp/fe-p
node tools/create-module.mjs catalogo --role dominio  # [projeto] exit 0
node tools/gate/validate.mjs --todos                  # [projeto] camada 1 — exit 0, "conformidade: OK"
node tools/sync-env.mjs --conferir                    # [projeto] exit 0
node tools/generate-port-schemas.mjs --conferir       # [projeto] exit 0
node tools/generate-lint-config.mjs --conferir        # [projeto] exit 0

# ── limpeza ───────────────────────────────────────────────────────────────
cd -; rm -rf /tmp/fe-p /tmp/fe-t1 /tmp/fe-t2
```

**Por que o passo G cria um módulo antes de conferir.** Os três `--conferir` rodam **sem
`npm install`** — `tools/` tem zero dependência, que é o que permite o gate viajar dentro do módulo
extraído. Mas eles exigem **um módulo real**: projeto recém-criado não tem `.env.example`, porque quem
o escreve é o `create-module`, e `sync-env --conferir` sai **1** ali com *".env.example divergente do
manifesto"*. Não é defeito — é a ordem que o próprio `create-project` imprime nos próximos passos
(criar módulo **antes** de `npm run verify`).

**Divergência encontrada → reporte os dois lados.** O repositório é a verdade; este documento é a
expectativa. Consertar em silêncio destrói a informação de que houve divergência.
