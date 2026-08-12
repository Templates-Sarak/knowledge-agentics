# Template de módulos Sarak — funcionamento esperado

> **O que este arquivo é:** a visão de conjunto que faltava. O que o template é, o que ele garante,
> como se usa e como se cria módulo. A **lei** não mora aqui — ela mora no
> `specs/_estrutura_modulos/doutrina/04-regras.md`, e este documento **aponta** para ela em vez de
> reproduzi-la. Regra que não está lá não é regra.

---

## 1. O que é

Um **esqueleto de sistema modular que se verifica sozinho**. Vive em `specs/_estrutura_modulos/` e é
**copiado** para dentro de cada projeto novo — não é biblioteca nem dependência: é um repositório
inicial completo, com o verificador viajando dentro dele.

A ideia central, do `CLAUDE.md`:

> **A fronteira física de pastas É a fronteira de dependência.** Extrair um módulo é copiar uma pasta e
> recortar chaves `<MODULO>_*` do `.env` — nunca reescrever import.

Três bindings: `typescript`, `javascript`, `python`. Um projeto adota **um**.

### Onde cada coisa mora

| Na base (`knowledge-agentics`) | No projeto gerado |
|---|---|
| `specs/_estrutura_modulos/doutrina/` | `specs/arquitetura/` |
| `specs/_estrutura_modulos/tools/` | `tools/` |
| `specs/_estrutura_modulos/bindings/<b>/root/` | a raiz do projeto |
| `specs/_estrutura_modulos/bindings/<b>/_template/` | `modules/_template/` (o molde) |

É a mesma confusão que todo mundo tem uma vez: **na base a lei se chama `doutrina/`; no projeto ela se
chama `specs/arquitetura/`.** É o mesmo arquivo, instalado.

---

## 2. Anatomia

### O projeto

```
<projeto>/
  modules/<id>/      as fatias verticais do sistema
  packages/ports/   as interfaces puras — o único package que o template entrega
  adapters/          as implementações das portas — memoria, e o que vier
  src/composicao.*   descobre os módulos, injeta os adapters, sobe UM processo
  config/            verificacao.json (política) · conformidade.json (exceções)
  tools/       o gate e as ferramentas de CI
  .githooks/         pre-commit · pre-push
  specs/arquitetura/ a lei instalada
  projeto.json       o manifesto da raiz
  .env               segredo real (nunca versionado) · .env.example versionado
```

A direção da dependência é hexagonal, e o gate a cobra:

```
modules/  ──→  packages/ports/  ←──  adapters/
                      ↑
                 src/ compõe
```

### O módulo — uma fatia vertical

```
modules/<id>/
  modulo.json      O MANIFESTO — a fonte de verdade sobre o módulo
  contract/        openapi.yaml — o contrato da API
  api/src/         a borda HTTP: rotas, mapeadores, middlewares, logger, erros
  core/
    domain/       a regra de negócio
    engine/         geração de artefato (quando geraArtefato)
    ports/        as interfaces que o módulo exige
    gateways/      fala com OUTRO módulo, exclusivamente HTTP
    templates/     modelos do artefato
  config/          api · dominio · seguranca · portas · textos  (zero hardcoded)
  database/        migrations/NNNN-verbo-objeto.sql + schema.sql
  tests/           dominio · contrato · web · fixtures
  web/             o front do módulo
  generated/         saída de máquina — fora da varredura de propósito
```

**A árvore é fechada.** Entrada não prevista na raiz do módulo reprova (`estrutura-estrita`).

### As três leis que valem sempre

1. **Módulo não importa módulo.** Vizinho só por HTTP, declarado em `modulo.json:consome`.
2. **Módulo não importa adapter.** O adapter é **injetado** pela composição.
3. **Módulo não toca a fatia de dados alheia.** Cada um tem `schema` e `prefixo` próprios.

---

## 3. Como o funcionamento é garantido

Não por convenção — por máquina, em camadas. Nenhum número abaixo precisa de fé: ao lado de cada um
está o comando que o imprime.

| Camada | O que faz | Confira com |
|---|---|---|
| **Gate** | **74 regras**, escopos `modulo` · `global` · `root`, 7 famílias. Estático, zero dependência, **nunca executa** — por isso viaja dentro do módulo extraído | `node tools/gate/validate.mjs --todos` |
| **Autoteste do gate** | prova o verificador: o molde conforme dá **zero** erro, e cada mutação produz **exatamente** o id esperado. Id extra reprova | `node tools/gate/tests/run.mjs --binding <b>` |
| **Coerência do gerado** | `.env.example` × manifestos; schemas de portas; config do linter derivada de `thresholds.mjs`, byte a byte | `--conferir` nas três ferramentas |
| **Linguagem** | formatador · linter (config **gerada** da lei) · tipos · testes por módulo | `npm run verify` |
| **A cadeia** | gate → env → schemas → formato → lint → tipos → testes. **Ferramenta ausente REPROVA** | idem |
| **Seleção** | o que mudou → quais módulos reverificar. **Erra para mais, nunca para menos** | `node tools/affected.mjs` |
| **Hooks de git** | `pre-commit` (segundos) · `pre-push` (dezenas de segundos) | `git config core.hooksPath .githooks` |
| **Hooks do agente** | cinco, entregues pelo plugin `sarak`, guardando o Claude Code | `hooks/README.md` |

### As três camadas de custo

O `03-operacao.md` §7 divide por **custo**, não por importância:

```
pre-commit   segundos      gate nos módulos AFETADOS + env + formato + lint
pre-push     dezenas       tipos + testes dos afetados
CI           minutos       tudo em tudo + contrato + cobertura + segurança + deps + build + migrations
```

### O que sustenta tudo

- **A lei mora num lugar só** — `specs/arquitetura/04-regras.md`. Regra que não está lá não é regra;
  regra que não pode ser cobrada por máquina não entra lá.
- **Falso positivo é a direção proibida.** Falso negativo é tolerado **se declarado** no §7.2.
- **Lacuna conhecida é aceitável; lacuna escondida não.** O §7.2 lista, regra por regra, o que cada uma
  deixa passar e por quê.
- **Verde tem de significar "verificou".** Ferramenta ausente reprova; relatório vazio não é "limpo".

---

## 4. Como usar

### 4.1 Nascer

O caminho completo, com specs, primeiros módulos e gate verde ao final:

```
/sarak:meta-iniciar-repositorio
```

Direto pelas ferramentas, se preferir:

```sh
node tools/create-project.mjs <destino> --binding typescript --escopo acme
cd <destino>
node tools/create-module.mjs catalogo

# preencher os VALORES no .env  (as CHAVES já chegaram sozinhas)
npm install                      # ou:  pip install -e ".[dev]"
git config core.hooksPath .githooks

# so no PRIMEIRO commit: sem isto, git em Linux/macOS PULA o hook em silencio quando o
# clone vem de Windows com "core.filemode=false" (o default comum) — "git add" grava o
# hook SEM o bit de execucao
git update-index --chmod=+x .githooks/pre-commit .githooks/pre-push
```

> **Sobre o `.env`:** as **chaves** são geradas e mescladas por `sync-env.mjs` a partir dos
> manifestos; os **valores** são preenchidos à mão — é o único jeito de um segredo real nunca virar
> texto versionado. O script nunca sobrescreve valor preenchido e nunca apaga chave em silêncio: chave
> que nenhum manifesto exige mais vai para a seção `ORFAS`, comentada.

### 4.2 O dia a dia

```sh
npm run verify         # a cadeia inteira, local
npm run start          # sobe o sistema: um processo, uma porta
npm test               # testes, por módulo
```

No Python o equivalente é `python verificar.py` (com `--rapido`, `--todos`).

Ao **commitar**, o `pre-commit` roda o gate só nos módulos afetados, mais env, formato e lint. Ao
**empurrar**, o `pre-push` roda tipos e testes dos afetados. Quando cai em "tudo", ele **diz por quê**.

### 4.3 A entrega

```sh
npm run build           # emite o backend (TS) e constrói o front de cada módulo com web/
npm run start:prod      # roda o artefato — node puro, sem tsx
npm run migrations      # aplica e reverte as migrations
```

O artefato é **autossuficiente**: sobe sem a árvore de fonte, sem `tools/`, sem `tests/`.

| binding | backend | front |
|---|---|---|
| `typescript` | emite (`tsc -p tsconfig.build.json`) | `vite build` por módulo com `web/` |
| `javascript` | nada — já é o artefato | idem |
| `python` | nada — roda o fonte | não tem `web/` |

### 4.4 O CI — e aqui está a liberdade

**O template não traz pipeline** (ADR-005), de propósito: config de CI é específica de provedor, e a
regra não pode morar num lugar que se perde ao trocar de provedor. O que ele traz é o **contrato de
acoplamento** — *exit code* e *relatório legível por máquina*:

```sh
npm run validar · validar:env · validar:schemas · formato · lint · tipos · test
node tools/affected.mjs        # seleção do que reverificar
npm run ci:contract                  # breaking change vs baseline git
npm run ci:cobertura                 # lcov + JUnit
npm run ci:lint                      # JSON  (SARIF, no ruff do Python)
npm run ci:seguranca                 # estágio 0, fail-closed
npm run ci:dependencias              # audit, com exceção nominal e datada
npm run build  ·  npm run migrations
```

No Python, por flag: `python verificar.py --todos | --cobertura | --seguranca | --dependencias |
--migrations | --lint-relatorio`.

**Actions, GitLab, Jenkins** consomem o *exit code*. **SonarQube** consome o *relatório* — ele não roda
o comando, ele lê a saída. Com os dois, o template nunca precisa saber o nome de provedor nenhum. Há um
exemplo de fiação no `03-operacao.md` §7.4, rotulado como de um provedor — **documentação, nunca
artefato instalado**.

---

## 5. Como criar um novo módulo

```sh
node tools/create-module.mjs <id> [--papel dominio|gateway|conector] [--sem-artefato] [--sem-web]
```

O `id` é `kebab-case` e **tem de bater com o nome da pasta** — o gate cobra.

O que o comando faz: copia o molde, substitui os marcadores (`<modulo>`, `<MODULO>`, `<escopo>`),
escreve o manifesto, sincroniza `.env`/`.env.example` e **roda o gate no módulo novo**.

### 5.1 Depois de criar — a ordem que funciona

1. **Preencher os valores** das chaves novas no `.env` (`<MODULO>_API_PORT`, `<MODULO>_DB_URL`).
2. **Ajustar o manifesto** — é a fonte de verdade, e quase toda regra do gate lê dele (§5.2).
3. **Escrever o contrato antes do código.** `contract/openapi.yaml` é a fonte; o gate cobra que rota do
   código e rota da spec coincidam **nos dois sentidos**.
4. **Domínio primeiro, borda depois.** `core/domain/` não faz I/O; o que precisa de fora vira **porta**
   em `core/ports/`, declarada em `modulo.json:portas` e escolhida em `config/ports.json`.
5. **Migrations** em `database/migrations/NNNN-verbo-objeto.sql`, com o bloco `-- rollback` — e ele é
   **executado** por `npm run migrations`, não é enfeite.
6. **Testes** em `tests/`, com dublês em `tests/fixtures/`. Nada de rede nem banco: se um teste do
   módulo precisa de infraestrutura, a porta está mal desenhada.
7. `npm run verify` — e não entregue com o gate vermelho.

### 5.2 O manifesto, campo a campo

Todos os 19 são obrigatórios, e **cada um tem verificador**.

| Campo | O que é | Cuidado |
|---|---|---|
| `id` | kebab-case, igual ao nome da pasta | o gate compara |
| `nome` · `versao` · `descricao` | identificação | — |
| `papel` | `dominio` · `gateway` · `conector` | fecha o vocabulário |
| `binding` | a linguagem do módulo | um projeto, um binding |
| `rotaBase` | `/api/v1/<id>` | tem de bater com `servers[0].url` do contrato |
| `rotaWeb` | `/<id>` | a rota do front |
| `dados` | `schema` · `prefixo` · `tabelas` | **nunca** `public`; toda tabela prefixada e declarada |
| `envRequerido` | as chaves de ambiente | ausente **derruba o boot** — nunca default silencioso |
| `portas` | as interfaces que o módulo exige | cada uma precisa de provedor em `config/ports.json` |
| `consome` | `{modulo, contract, porQue}` | a rota e o método têm de existir no dono |
| `ui` | `modo: proprio \| kit` | em `kit`, nada de biblioteca de UI bruta — e o `packages/ui-kit` é convenção **do projeto**, o template não o entrega |
| `permissoes` | `<id>:<verbo>` | vêm do manifesto, nunca de literal no código |
| `rotasPublicas` | as que passam sem token | tudo o mais é negado por padrão |
| `camposSensiveis` | nomes que não podem vazar | nem em resposta, nem em log |
| `navegacao` | `label` · `icone` · `ordem` | obrigatório quando há `rotaWeb` |
| `exportaResumo` | entra no dashboard cross-módulo | se `true`, `GET /resumo` declara `total` |
| `geraArtefato` | tem `core/engine`, `core/templates`, `generated/` | bidirecional: `false` proíbe as três |

Três rotas são **obrigatórias em todo módulo**: `GET /health`, `GET /meta`, `GET /resumo`.

### 5.3 Os erros que o gate mais pega em módulo novo

- importar outro módulo, ou um adapter — use `consome` (HTTP) ou uma **porta**;
- porta, permissão ou tabela usada e **não declarada** no manifesto — ou o inverso, declarada e sem uso;
- rota no código e não no contrato, ou no contrato e não no código;
- `process.env` fora do carregador de config, ou default silencioso (`?? 3000`);
- campo projetado na resposta que nenhum schema do contrato declara;
- SQL montado por concatenação — no módulo **e** na fiação;
- `console.log` no lugar do logger; função acima de 40 linhas, aninhamento acima de 3, mais de 4
  parâmetros.

Mensagem do gate sempre nomeia **o arquivo, a linha e o conserto**. Se alguma não nomear, é defeito dela.

### 5.4 Extrair um módulo para serviço próprio

```sh
node tools/gate/validate.mjs --extracao modules/<id>   # está pronto?
```

Pronto significa: copiar a pasta, recortar as chaves `<MODULO>_*` do `.env` e **apagar a linha
`ENV_RAIZ=` do `.env` do módulo extraído**, preenchendo os valores que ela apontava direto ali. Sem
este passo o módulo morre no boot com `[config] ENV_RAIZ aponta para "…\.env", que nao existe` —
medido; o comentário do próprio `.env` avisa (ADR-004), mas o passo tem que estar aqui também.
**Nenhum import muda.** O gate viaja junto; o esqueleto novo repõe `tools/`, `adapters/`,
`packages/` e `src/`.

---

## 6. O que o template deliberadamente **não** faz

- **Não escolhe topologia de deploy.** *"Modularidade não é topologia de deploy"* — o sistema roda como
  monólito modular, e o dia em que um módulo precisar de infra própria a mudança é de operação, não de
  código.
- **Não modela ambientes** (staging/produção) nem guarda segredo de produção.
- **Não publica.** CD tem uma pergunta aberta antes de existir: **qual é a unidade de release — o
  repositório ou o módulo?** A resposta é por projeto; respondê-la aqui seria escolher a topologia que
  o template não escolhe. Quem publica são as skills `deploy-vercel` e `deploy-docker`.
- **Não serve o front pelo processo.** `web/dist/` é bundle a publicar; quem põe front e API na mesma
  origem é deploy (reverse proxy, host estático na frente).
- **Não traz YAML de provedor.** Ver §4.4.

---

## 7. Dois limites que você precisa saber antes de confiar

**O hook de git é opt-in por clone** — `core.hooksPath` é config local, não vem no `git clone` — e
**`git commit --no-verify` fura**, por desenho do git. Pre-commit é **feedback rápido**; **CI é a única
cobrança que não se fura**.

**Os limites são declarados, não escondidos.** O §7.2 do `04-regras.md` lista, regra por regra, o que
cada uma deixa passar e por quê — de `{` na assinatura desviando o extrator de projeção até o
`schema.sql` que não é comparado com o resultado real das migrations. É o contrato: **uma lei que
esconde a própria lacuna é pior que uma lacuna conhecida.**

---

## 8. Onde ler mais

| Pergunta | Documento |
|---|---|
| **O mapa — qual seção responde a qual pergunta, sem abrir a lei inteira** | `doutrina/README.md` |
| Como um módulo é por dentro? Como crio? Como altero? | `doutrina/01-modulo.md` |
| Qual a forma da API, do erro, do schema, da migration? | `doutrina/02-contrato-e-dados.md` |
| Segurança, log, erro, teste, extração, camadas de custo | `doutrina/03-operacao.md` |
| **O catálogo de regras e os limites de cada uma** | `doutrina/04-regras.md` |
| As quatro peças e as fronteiras | `doutrina/00-arquitetura.md` |
| Por que o gate mora no template e não no pipeline | `doutrina/adr/decisoes.md` — ADR-005 |
| O contrato do gate (argumentos, exit code, `--json`) | `tools/gate/README.md` |
| Os hooks do agente e a política deles | `hooks/README.md` (na base) |

No projeto gerado, tudo de `doutrina/` está em `specs/arquitetura/` — inclusive o mapa (`README.md`).
