---
tipo: "adr"
titulo: "Decisões de Arquitetura"
status: "🟢 Vigente"
tags: ["adr", "decisoes"]
relacionados: ["[[00-arquitetura]]", "[[01-modulo]]", "[[04-regras]]"]
---

# Como usar este arquivo

Uma decisão por seção, numerada e **imutável depois de aceita**. Mudar de ideia não é editar a decisão antiga
— é escrever uma nova que a substitui, marcando a anterior como `🔴 Substituída`.

Toda exceção registrada em `config/conformidade.json` precisa apontar para uma decisão daqui. Sem o link, o
gate rejeita a própria exceção.

Decisões **do projeto** (escopo, idioma das pastas, schema de banco) entram aqui quando o template for
instanciado. As decisões abaixo são as do **template** e explicam por que ele é como é.

---

## ADR-001 — A fronteira física de pastas é a fronteira de dependência

**Status:** 🟢 Aceito

**Contexto.** Módulos que "conversam por import" ficam impossíveis de separar depois: no dia da extração, cada
import é um refactor, e a estimativa explode. Ao mesmo tempo, monorepo com módulos é o formato produtivo hoje.

**Decisão.** A pasta do módulo é a unidade de dependência. Nada dentro dela importa nada fora dela, exceto
`packages/` (interface, contrato, design — sem negócio) e os adapters que ela declara. Extrair um módulo é
copiar uma pasta e recortar chaves de `.env`, nunca reescrever import.

**Consequências.** Duplicação de regra entre módulos é **aceita de propósito** — a independência vale mais que
o DRY entre módulos. Em troca, a extração deixa de ser projeto e vira operação.

---

## ADR-002 — Porta e gateway são conceitos distintos, em pastas distintas

**Status:** 🟢 Aceito

**Contexto.** Um módulo depende de duas coisas muito diferentes: infraestrutura (banco, storage, auth) e
outros módulos. Quando as duas moram na mesma pasta, o `grep` não distingue *"falo com meu banco"* de *"falo
com o financeiro"* — e foi assim que, num sistema real, um cliente HTTP de outro módulo passou a morar numa
pasta chamada `database/`, ao lado de um adapter que fazia `SELECT` direto em tabela alheia.

**Decisão.** `core/ports/` é infraestrutura; `core/gateways/` é outro módulo, exclusivamente HTTP, sempre
declarado em `module.json:consumes`.

**Consequências.** O gate consegue cobrar regras diferentes para riscos diferentes: gateway com SQL reprova, e
gateway sem declaração reprova. O grafo de dependências entre módulos passa a ser mecânico — dá para detectar
ciclo e calcular ordem de extração sem arqueologia.

---

## ADR-003 — Adapters ficam fora do módulo, e viajam na extração

**Status:** 🟢 Aceito

**Contexto.** Duas opções: duplicar o adapter dentro de cada módulo (isolamento máximo) ou compartilhá-lo na
raiz. Duplicar significa N lugares para corrigir a mesma falha no dia da CVE do driver.

**Decisão.** `adapters/<tecnologia>/` na raiz, fora de `packages/` porque adapter é fornecedor e merece
separação visível. Extrair um módulo copia a pasta dele **mais** os adapters que ele declara.

**Consequências.** Compartilhar adapter não fere o isolamento porque adapter não tem domínio — o que feriria
seria compartilhar regra de negócio. Contrapartida obrigatória: **toda porta tem variante `memory`**, senão os
testes precisam de rede e o desacoplamento deixa de ser verificável.

---

## ADR-004 — O `.env` real é único, e o do módulo aponta para ele

**Status:** 🟢 Aceito

**Contexto.** Dois arquivos reais de segredo é uma chance a mais de divergir e de vazar. Mas o módulo precisa
declarar sua fronteira de configuração por escrito, e precisa funcionar isolado no dia da extração.

**Decisão.** O `.env` real e único fica na raiz. Cada módulo tem um `.env` próprio contendo o ponteiro
`ENV_RAIZ=../../.env` e, opcionalmente, overrides locais. Precedência: processo > `.env` do módulo > `.env`
apontado > default de tunable.

**Alternativas descartadas.** *Symlink* — quebra no Windows sem privilégio. *Só o `.env` da raiz, sem arquivo
no módulo* — não declara a fronteira, e o módulo extraído precisaria de mudança no carregador.

**Consequências.** Na extração, apagar a linha `ENV_RAIZ` e preencher os valores é suficiente: **nenhuma linha
de código muda**. Em troca, o gate precisa cobrar que o `.env` do módulo não vire um segundo depósito de
segredo (regra `env-modulo`).

---

## ADR-005 — O gate mora no template, não no pipeline

**Status:** 🟢 Aceito

**Contexto.** Uma regra estrutural pode ser cobrada localmente ou só na entrega. Config de CI é específica de
provedor; num sistema real, a CI existia e **não rodava**, e o que segurou a conformidade foi o verificador
local.

**Decisão.** O verificador é uma ferramenta agnóstica, versionada com o template, que **recebe o caminho de um
módulo**. O template **não** traz pipeline de CI/CD — traz o contrato de acoplamento (argumentos, exit 0/1,
saída JSON) para que qualquer executor o chame em uma linha.

**Consequências.** A regra sobrevive à troca de provedor e viaja com o módulo extraído. O que roda onde passa a
ser decisão de **custo** (milissegundos localmente, segundos na entrega), não de importância.

---

## ADR-006 — O `_template` de cada binding é validado como módulo real

**Status:** 🟢 Aceito

**Contexto.** Num sistema real, o molde era a única pasta que o validador pulava. Ele apodreceu sem ninguém
notar — faltavam arquivos de build — e todo módulo criado a partir dele **passava no validador e não
compilava**.

**Decisão.** O molde entra no gate como qualquer módulo. Além disso, o ciclo completo — criar um módulo a
partir do molde, validar, buildar, testar, descartar — é a prova de vida do template.

**Consequências.** Um molde quebrado reprova antes de contaminar o primeiro módulo. Custo: os marcadores
(`<modulo>`, `<MODULO>`) precisam ser válidos o bastante para não reprovar por si só.

---

## ADR-007 — Um template por linguagem, um modelo de UI para os dois casos

**Status:** 🟢 Aceito

**Contexto.** Dois sistemas reais divergiam no front: um terceiriza a renderização a uma biblioteca de UI e
escreve componentes simples; o outro constrói o front inteiro dentro do módulo. A pergunta era se isso exigia
dois templates.

**Decisão.** Um template. A diferença é de **dependência**, não de anatomia: em ambos os casos a árvore é
`web/src/{pages, components, hooks, api-client}`. O manifesto declara `ui.modo` (`kit` ou `proprio`), e o gate
cobra regras diferentes para cada modo. O `web/` é sempre um pacote que exporta suas páginas, mais uma entrada
standalone fina e opcional.

**Consequências.** Um shell único que importa todos os módulos e um SPA por módulo funcionam sobre a mesma
estrutura, e um módulo migra de `proprio` para `kit` sem mover arquivo. Custo: um `main.tsx` de poucas linhas
por módulo, que só monta a raiz já exportada.

---

## ADR-008 — A cadeia de ferramentas do template é fixa, e quem a envelhece é o próprio template

**Status:** 🟢 Aceito

**Contexto.** Um projeto gerado *hoje* precisa nascer com a mesma cadeia de dependências que um gerado
*daqui a seis meses*, ou dois times não conseguem comparar builds. Ao mesmo tempo, `^` (caret) deixa a versão
resolvida depender do **relógio** do `npm install`: o mesmo `package.json`, instalado em datas diferentes, gera
árvores diferentes — e uma delas pode trazer CVE nova sem ninguém ter decidido nada (medido: `vitest`/`vite`
presos a `^2`/`^5` chegaram a nascer com 1 critical + 1 high + 3 moderate, exigindo salto de major para
sair — `npm audit fix` sozinho não resolve breaking change).

**Decisão.** Toda dependência do esqueleto (`package.json` da raiz e do `_template`, `pyproject.toml`) é
**pinada exata** — sem `^`, sem `>=`. A versão é decisão do padrão, tomada e datada, nunca do relógio.
Quem sobe a versão é o **template**, nunca o projeto gerado: `tools/generate-port-schemas.mjs` já
estabeleceu o precedente de "gerado, não escrito à mão" para config mecânica; aqui a mesma disciplina vale
para número de versão. O sensor de envelhecimento é `ci:dependencias`/`verificar.py --dependencias`, que
roda **dentro do autoteste do template** (entrou depois desta decisão fechar a cadeia, para o autoteste não
nascer vermelho por CVE de terceiro): CVE nova em qualquer binding derruba o `knowledge-agentics` na sua
própria agenda, nunca o projeto de quem já gerou o dele. A cadência é *quando o autoteste acender*, não
calendário — uma CVE que não afeta versão nenhuma do pin atual não exige nada.

**O procedimento do bump**, sempre nesta ordem — no repositório do **template**, nunca no projeto gerado
(§ acima: quem sobe a versão é o template): `npm outdated`/`npm audit`/`pip-audit` apontam o alvo →
sobe a versão fixada nos `package.json`/`pyproject.toml` do esqueleto → `npm run autoteste:template` (ou
`node specs/_estrutura_modulos/tests/template-self-test.mjs`, caminho do repositório do template) nos três
bindings → **verde** vira commit datado aqui; **vermelho** e a versão não entra, com o motivo escrito na
tentativa. É o que torna o salto de major barato o bastante para acontecer: sem essa contraprova, a única
atualização segura seria nenhuma.

**Dois limites, declarados:** pin exato prende o **topo** da árvore, não os transitivos (`esbuild` chega
pelo `vite`, e uma CVE ali só é vista quando `npm audit` a relaciona a um pacote de topo) — quem prende
transitivo é o **lockfile do projeto gerado**, e é por isso que ele é do projeto, não do template (sem
`workspaces` resolvidos no momento da cópia, um lock copiado descreveria uma árvore que não
é a do destino). E **o template nunca empurra atualização para projeto já criado**: a promessa é *"projeto
novo nasce limpo"*, não *"projeto antigo se mantém limpo"* — a segunda exigiria o template ser dependência
instalada, e ele é cópia por decisão de arquitetura (ADR-005).

**Alternativa descartada.** Manter `^` e versionar lockfile no template. Cai no mesmo problema dos
`workspaces` já registrado acima para o lockfile do projeto: o lock do template nasceria descrevendo
uma árvore que ainda não existe no destino, e devolveria ao relógio uma decisão que é do padrão.

**Consequências.** Dois projetos gerados com meses de distância recebem a mesma cadeia — e quando divergirem
foi porque alguém decidiu e datou, não porque o `npm install` de terça foi diferente do de quinta. O custo:
subir de major é trabalho de verdade (medido: `vitest` 2→4 exigiu trocar `environmentMatchGlobs`,
removido no Vitest 3+, pela forma `// @vitest-environment jsdom` por arquivo — API antiga, config morta,
sem aviso), mas é trabalho pago **uma vez**, pelo template, sob o autoteste — nunca por cada projeto gerado
separadamente. O `pip` que `python -m venv` instala fica de fora deste pin (não é dependência declarada, é o
gerenciador que cria o ambiente): o conserto é `pip install --upgrade pip` como primeiro passo depois de criar
o venv, documentado nos "próximos passos" que `create-project.mjs` imprime.

**Pendência registrada:** `typescript`, `express`, `eslint` e `react` têm majors mais
novos que o pin atual (medido: ts 5→7, express 4→5, eslint 9→10, react 18→19), nenhum deles com CVE aberta —
só `vitest`/`vite`/`@vitest/coverage-v8`/`@vitejs/plugin-react` tinham. Subir os quatro sem CVE é trabalho de
compatibilização real (majors desse tamanho costumam trazer breaking change de verdade), não conserto de
segurança, e fica para um esforço dedicado — subir todos de uma vez só porque "dá para" contradiz o próprio
critério de cadência deste ADR ("quando o autoteste acender", não "porque o registry tem versão nova").

---

## ADR-009 — O idioma do template: vocabulário técnico em inglês, vocabulário de domínio em português

**Status:** 🟢 Aceito

**Contexto.** Uma árvore que mistura os dois vocabulários sem critério deixa a fronteira implícita — e por
isso arbitrária: `api/src/routes` e `api/src/mappers` lado a lado com pasta em português, na mesma árvore,
não diz por si só onde termina o vocabulário técnico e começa o de domínio.

**A boa prática não é "tudo em inglês".** É a distinção clássica: **vocabulário técnico em inglês,
vocabulário de domínio no idioma do negócio**. Português na árvore não é o erro — usá-lo sem critério,
deixando a fronteira implícita, é.

**Decisão — o princípio que resolve a fronteira inteira, numa frase:** **a árvore de arquivos é inglês; o
conteúdo dela é português.** "Árvore" é pasta, nome de arquivo, chave de manifesto/config, símbolo do
esqueleto — tudo que é **estrutura** que o padrão Sarak impõe. "Conteúdo" é o que um módulo real guarda
dentro dessa estrutura — texto de negócio, nome de tabela, rota, mensagem ao usuário. `doutrina/`/
`specs/arquitetura/` é a **única exceção** ao princípio (linha 2 da tabela): não é conteúdo de módulo, é
documentação do próprio padrão, mas o nome é vocabulário do fluxo SDD compartilhado com `_estrutura_base`
— fora do escopo deste template mudar.

**A fronteira, artefato por artefato** — onze categorias, cada uma com decisão explícita para que nenhuma
fique arbitrária por analogia:

| # | Artefato | Decisão | Motivo |
|---|---|---|---|
| 1 | Pastas estruturais (12) — `tools`, `domain`, `ports`, `engine`, `contract`, `generated`, `mappers`, `modules`, `root`, `rules`, `tests`, `memory` | **inglês** | é a árvore — o que se lê em cada import |
| 2 | `doutrina/` / `specs/arquitetura/` | **português** — **única exceção ao princípio** | é a **documentação**, não conteúdo de módulo nem árvore de código; o nome é vocabulário do fluxo SDD, compartilhado com `_estrutura_base` |
| 3 | Funções do **esqueleto** (`bindings/**`) | **inglês** | é o código que o dev escreve todo dia |
| 4 | Símbolos (funções/variáveis) **dentro de** `tools/` | **português** | ferramental vendorizado — o dono é outro repositório. Por isso já é **isento do linter** no projeto gerado: a porta em inglês, a sala em português, e a sala é declarada como não-sua. Vale só para o SÍMBOLO — o arquivo que o contém segue a linha 5 |
| 5 | Nomes de arquivo dentro de `tools/` | **inglês** | é a árvore (linha 1 do princípio), não o conteúdo — a mesma pasta não pode ficar meio inglês, meio português um nível abaixo do que a linha 1 já resolveu. É a superfície de CLI que o dev digita |
| 6 | Ids das 76 regras do catálogo | **português** | id de regra é nome de artigo de lei, e a lei é portuguesa — citado muito mais em prosa (§4.x, §7.2) que em código |
| 7 | Mensagens do gate e erros de runtime | **português** | documentação entregue por código; é a UX do template |
| 8 | Chaves do manifesto (`module.json`, `project.json`) e nome do arquivo | **inglês** — `name` `data` `ports` `requiredEnv` `basePath` … | é config lida por código — árvore, não conteúdo. Enum de valor estrutural (como `role: domain\|gateway\|connector`) segue a mesma tradução da pasta homônima (linha 1) — é o mesmo conceito, não uma exceção |
| 9 | Chaves de ambiente | **inglês** — `ROOT_API_PORT`, `<MODULE>_DB_URL` | convenção universal de env |
| 10 | Rotas (`/registros`) e banco (`titulo`, `<mod>_metadados`) | **português** | domínio e dados — conteúdo, não árvore. É a boa prática de DDD, não a exceção |
| 11 | Nomes de skill (`code-modulo`, `cyber-segredos`) | **fora de escopo** | convenção de toda a base Sarak, não do template |

**A régua que decide os casos não listados aqui:** se o nome descreve **como o padrão Sarak é construído**
(pasta, arquivo, chave de config, símbolo de código — a **árvore**), é técnico — inglês. Se o nome descreve
**o que o negócio do módulo gerado é** (rota, coluna, tabela, texto de erro voltado ao usuário final — o
**conteúdo**), é domínio — português. Ids de regra e mensagens de gate (6, 7) são o caso que parece árvore e
é conteúdo: citam-se majoritariamente em prosa portuguesa, e mudar o idioma deles trocaria a UX do template
sem ganho de leitura de código — por isso ficam de fora, com o motivo escrito, não por omissão.

**Consequências.** A fronteira é lei citável (`04-regras.md` §3). `tools/` (linha 4, só o símbolo) e os
ids de regra (linha 6) são as duas exceções deliberadas dentro de um template majoritariamente inglês na
camada técnica — registradas aqui para que uma futura "limpeza de consistência" não as trate como
esquecimento.

**Alternativa descartada.** Tudo em inglês, inclusive domínio/dados/rotas. Contradiz a lei de nomes já
vigente (§3: "português no domínio, nas rotas e nos dados") e o próprio ADR-001 — regra de negócio duplicada
por módulo já é português por natureza; traduzir a camada de domínio traduziria o conteúdo do negócio, não
ajustaria a árvore — muda o que o módulo significa, não como ele é organizado.

---

## ADR-010 — A porta `auth` virou `verificadorDeToken`

**Status:** 🔴 Substituída — o nome escolhido (`verificadorDeToken`) é traduzido para `tokenVerifier` pelo
`ADR-013`; o raciocínio abaixo continua valendo e é carregado adiante lá.

**Contexto.** A porta `auth` existia desde o início do vocabulário (`tools/gate/ports-vocabulary.mjs`), mas
a interface que ela nomeia tem **um único método**: `verify(token) → claims | null`. "Auth" é um
guarda-chuva maior do que isso — acomoda também *"gerenciar usuários"* (cadastro, senha, sessão), que na
arquitetura Sarak **não é porta**: é módulo à parte, alcançado por gateway, nunca injetado como
infraestrutura (ADR-002, "porta e gateway são conceitos distintos"). O nome também colidia, por
coincidência de rótulo, com a auth **única** do sistema — a interface homônima de
`_template/api/src/middlewares/index.ts` (e o equivalente Python, `_template/core/ports/__init__.py`),
injetada em todo `createApp` via `resolveAuth()`/`resolve_auth()`. As duas são estruturalmente idênticas
hoje (mesmo método `verify`), mas são declarações **independentes** com papéis diferentes: uma é a porta
**plugável** (escolhida por `config/ports.json`, como qualquer outra), a outra é o contrato **fixo** que
todo módulo usa, sempre a mesma implementação, nunca escolhida por módulo. Dois `Auth` na mesma árvore,
com origens diferentes, é o tipo de ambiguidade que o vocabulário existe para evitar.

**Decisão.** Renomear a porta e a interface para `verificadorDeToken`/`VerificadorDeToken` — o nome
descreve exatamente o que o método único faz. Não muda comportamento nenhum: nenhum provedor de `auth`
existia em `FABRICAS` antes desta decisão (era a única porta do vocabulário sem entrada — o "LIMITE
CONHECIDO" que `create-adapter.mjs` já documentava), e a auth da fiação (`resolveAuth()`,
`createDenyingAuth()`, o middleware `authentication`) fica exatamente como estava — só a **anotação de
tipo** que referenciava a porta (`import type { Auth } from '../packages/ports/index.js'`, em
`composicao.ts` e `adapters/memory/index.ts`) segue o nome novo, porque a interface que ela aponta mudou
de nome, não porque a fiação mudou de comportamento.

**Alternativas descartadas.**
- **Remover `auth`/`verificadorDeToken` do vocabulário.** Ao contrário de `fila` (que arrasta decisão de
  topologia sem interface pronta), esta porta TEM interface completa e caso de uso claro — verificar
  token contra um provedor (JWT local, OAuth, serviço externo). Remover perderia capacidade real sem
  ganho nenhum.
- **Manter `auth` e só documentar a ambiguidade.** Documentar uma colisão de nome não a desfaz: o próximo
  autor ainda escreve `import { Auth } from 'packages/ports'` esperando a porta e tropeça na auth da
  fiação, ou o inverso. O nome errado continua induzindo o erro errado — só que agora com uma nota ao
  lado dizendo que é sabido.

**Consequências.** O vocabulário de portas (`tools/gate/ports-vocabulary.mjs`, os dois schemas gerados, e
os três `packages/ports/index.*`) usa `verificadorDeToken`; `PORTAS_CONHECIDAS` continua com **sete**
entradas — renomeação, não remoção nem adição. `create-adapter.mjs <porta> <provedor>` aceita
`verificadorDeToken` em vez de `auth`; registrar um provedor novo em `FABRICAS` sem nada consultá-lo hoje
continua sendo característica, não bug — o mesmo "LIMITE CONHECIDO" de antes, só com o nome novo. **O
precedente que importa:** como `fila` já registrava, vocabulário de porta só muda por decisão **escrita**
— nunca por edição silenciosa de um dos cinco lugares que o repetem, e é o que `tests/verify-catalog.mjs
--conferir-vocabulario` passa a cobrar por máquina.

## ADR-011 — Provedor kebab-case com hífen: identidade fixa, pasta/import Python convertidos

**Status:** 🟢 Aceito

**Contexto.** `create-adapter.mjs <porta> <provedor>` aceita provedor kebab-case com hífen
(`validarOpcoes`, `/^[a-z][a-z0-9-]*$/`, e a própria mensagem de erro recomenda esse formato) mas o
código que ele GERA quebrava com hífen nos três bindings, sempre saindo 0: em TS/JS, a chave de
objeto que ele escreve na âncora "porta existente" nunca era citada
(`storage: { memoria: ..., disco-frio: () => criarDiscoFrio() }` — `-` fora de string é erro de
sintaxe). Em Python, o import que ele registra usa o provedor cru no caminho pontilhado
(`from adapters.disco-frio import DiscoFrio`) — `-` não é caractere válido de identificador, e
Python não tem alternativa: nome de módulo/pacote com hífen é impossível de importar, regra da
linguagem, não deste gerador.

**Decisão.** Consertar os dois lados sem tocar a identidade do provedor:
- **TS/JS** — citar a chave (`'${provedor}': () => ${simbolo}()`) nas duas âncoras
  ("porta existente" e "porta nova") de `registrarFabricaTs`/`registrarFabricaJs`. Citar um
  identificador que já era válido continua legal em JS/TS — provedor sem hífen não regride.
- **Python** — a pasta do adapter e o caminho de `import` convertem hífen pra underscore
  (`pastaAdapter`: `disco-frio` → pasta `adapters/disco_frio/`, `from adapters.disco_frio import
  DiscoFrio`), mas a chave em `FABRICAS` continua kebab (`"disco-frio": DiscoFrio`) — é uma
  **string**, não um identificador, então não carrega a mesma restrição do `import`. O TODO gerado
  (`NotImplementedError`) usa um marcador separado (`<provedor-pasta>`) pra apontar pro caminho
  físico real, nunca pra identidade — evita o TODO apontando pra uma pasta que não existe.

**Alternativas descartadas.**
- **Proibir hífen em provedor, nos três bindings.** Mais simples — rejeita na validação, acaba o
  defeito. Descartada porque contradiz a própria mensagem de erro de `validarOpcoes`
  ("use kebab-case minusculo"; kebab-case é, por definição, hifenizado) — corrigir só o Python
  proibindo hífen também nos outros dois jogaria fora a correção de TS/JS pra evitar um problema
  que só existe em Python.
- **Não converter a pasta Python, exigir provedor sem hífen só pra esse binding.** Rejeitada pelo
  mesmo motivo: aceitar hífen em TS/JS e rejeitar em Python pro MESMO parâmetro (`<provedor>` da
  mesma CLI) é a inconsistência que este ADR existe pra evitar — identidade de provedor precisa
  significar a mesma coisa nos três bindings.

**Consequências.** `pastaAdapter(binding, provedor)` é a única função nova — kebab intacto em
TS/JS, hífen→underscore só em Python. `template-self-test.mjs` (`provedorDoIndice`) passou a
gerar provedor com hífen (`prov-<letra>`, todo o vocabulário) pra exercitar o caminho consertado —
antes disso a rede evitava hífen de propósito, o que escondia o próprio achado ①. Sweeping o
vocabulário inteiro com provedor mais longo (hífen incluso) expôs um segundo achado, menor e
independente: `registrarFabricaPy`/`Ts`/`Js` escrevem tudo numa linha só, sem quebra automática, e
isso já estourava os 110 caracteres do `ruff` em Python pra porta com dois provedores — sem folga
nenhuma mesmo antes do hífen. Python ganhou o mesmo passo de formatação que TS/JS já tinha
(`prettier --write` → `ruff format`), fechado na mesma rodada, documentado em 04-regras.md §7.2.

---

## ADR-012 — Ambiente e unidade de release ficam fora do template

**Status:** 🟢 Aceito

**Contexto.** Duas ausências do template são levantadas com frequência como lacuna, e as duas são decisão. Um
revisor que as encontre sem este registro vai "consertar" o que foi deliberadamente deixado de fora — e o
conserto custa mais que a ausência. Ausência declarada é decisão; ausência silenciosa é defeito.

**Decisão — o template NÃO modela ambientes.** Nada de `staging`/`produção`, nenhum arquivo por ambiente,
nenhum segredo de produção guardado. Existe **um** `.env` real por projeto (ADR-004), fora do versionamento,
e o `.env.example` versionado que só carrega as CHAVES. Modelagem de ambiente é decisão de operação, muda por
provedor e por empresa, e não sobrevive à troca de nenhum dos dois — pelo mesmo argumento do ADR-005 sobre
pipeline de CI.

**Decisão — a unidade de release é pergunta ABERTA, e é do projeto.** O template não publica e não traz CD,
porque antes do CD existe uma pergunta que ele não pode responder no lugar de ninguém: **o que se versiona e
se entrega — o repositório inteiro, ou cada módulo?** As duas respostas são legítimas e levam a pipelines
incompatíveis. Um monólito modular entrega o repositório; um módulo extraído para infraestrutura própria
(ADR-001) entrega a si mesmo. Como o template existe justamente para permitir os dois, fixar um seria
escolher pelo projeto. Quem publica são as skills `deploy-vercel` e `deploy-docker`.

**Consequências.** O template entrega o **contrato de acoplamento** (exit code e relatório legível por
máquina, ADR-005) e para aí. Quando o projeto decidir a unidade de release, a decisão entra como ADR **dele**,
em `specs/adr/`, ao lado desta. E `web/dist/` continua sendo bundle a publicar — pôr front e API na mesma
origem é deploy, não arquitetura.

**Alternativa rejeitada.** *Entregar um `.env.staging`/`.env.production` de exemplo e um pipeline mínimo.*
Rejeitada porque um pipeline mínimo é um pipeline errado para quase todo projeto, e um arquivo de ambiente de
exemplo convida a versionar o real — o defeito exato que o ADR-004 fecha.

---

## ADR-013 — O idioma do template passa a ser cobrado: a implementação se alinha ao ADR-009

**Status:** 🟢 Aceito

**Contexto.** O `ADR-009` decide o princípio — *"a árvore de arquivos é inglês; o conteúdo dela é
português"* — e a régua final do `04-regras.md` §3 o repete. **A implementação inteira contradiz os dois, e
o próprio texto normativo se contradiz.** `ADR-009` linha 9 já escreve o exemplo `ROOT_API_PORT` para chave
de ambiente da raiz, mas os três bindings, `sync-env.mjs`, `create-project.mjs`, `project.schema.json`,
duas regras do gate e a **tabela §3.1 do próprio `04-regras.md`** usam `RAIZ_` — medido: 105 ocorrências em
19 arquivos —, e há `ENV_RAIZ` no mesmo caso (13 arquivos). `ADR-009` linha 8 e a régua final põem nome de
arquivo e chave de config em inglês, mas o template entrega `config/seguranca.json`, `textos.json`,
`conformidade.json`, `verificacao.json` e `src/composicao.ts` — 392 ocorrências —, e a **tabela canônica do
§3.1 usava `config/seguranca.json` como exemplo normativo** da linha "Arquivo de config", contradizendo o
parágrafo duas seções acima. O vocabulário de portas (`repositorio`, `auditoria`, `relogio`, `geradorId`,
`verificadorDeToken`, `notificador` — 352 ocorrências) é chave de `config/ports.json` **e** símbolo de
`packages/ports/`: árvore pelos dois critérios da régua. As chaves **dentro** dos `config/*.json`
(`excecoes`, `excecoesCve`, `dependencias.severidadeMinima`, `rateLimit.janelaSegundos`,
`paginaTamanhoMaximo`, …) estão no mesmo caso — a régua as chama de árvore, e nada as trata assim hoje.

O que faz isto valer um ADR, e não um conserto silencioso de nomenclatura: **cada repositório que adota o
template descobre a contradição sozinho e "corrige" para o lado errado**, achando que está **desviando** do
padrão quando está **implementando-o**. Medido num alvo real, que foi para `security.json`/`texts.json` e
para `repository`/`audit`/`clock`/`idGenerator` por conta própria, sem ADR nenhum — exatamente o cenário que
o `04-regras.md` §3 trata como divergência de doutrina, não como acerto silencioso.

**Decisão.** A implementação se alinha ao `ADR-009`. A tabela abaixo é o contrato das três ondas que a
executam — cada linha, uma renomeação, nenhuma delas aplicada nesta conversa:

| Português (hoje) | Inglês (alvo) | Natureza |
|---|---|---|
| `RAIZ_<ASSUNTO>` | `ROOT_<ASSUNTO>` | chave de ambiente (`ADR-009` linha 9 já escreve `ROOT_API_PORT`) |
| `ENV_RAIZ` | `ENV_ROOT` | idem — o ponteiro de cascata do `ADR-004` |
| `config/seguranca.json` | `config/security.json` | nome de arquivo de config |
| `config/textos.json` | `config/texts.json` | idem |
| `config/conformidade.json` (+ `conformidade.schema.json`) | `config/compliance.json` | idem |
| `config/verificacao.json` (+ `verificacao.schema.json`) | `config/verification.json` | idem |
| `src/composicao.{ts,js,py}` | `src/composition.*` | nome de arquivo do esqueleto |
| porta `repositorio` | `repository` | chave de config + símbolo do esqueleto |
| porta `auditoria` | `audit` | idem |
| porta `relogio` | `clock` | idem |
| porta `geradorId` | `idGenerator` | idem |
| porta `verificadorDeToken` | `tokenVerifier` | idem — **supersede o `ADR-010`**, ver abaixo |
| porta `notificador` | `notifier` | idem |
| porta `storage` | `storage` | já em inglês, nada muda |

**Superseding o `ADR-010`.** A porta que lá virou `verificadorDeToken` aqui vira `tokenVerifier` — tradução
pura do mesmo nome, pela régua deste ADR, não uma nova decisão de nomenclatura. O raciocínio do `ADR-010`
continua sendo lei e não pode ficar órfão dentro de um ADR marcado `🔴 Substituída`, então ele é carregado
adiante, com as mesmas palavras: `auth` era largo demais porque a interface tem **um método**,
`verify(token) → claims | null`, e "auth" também acomodava *"gerenciar usuários"* (cadastro, senha, sessão)
— que na arquitetura Sarak não é porta, é módulo à parte, alcançado por gateway, nunca injetado como
infraestrutura (`ADR-002`). E o precedente que o `ADR-010` registrava, o mesmo que `ports-vocabulary.mjs`
repete a respeito de `fila`: **vocabulário de porta só muda por decisão escrita**, nunca por edição
silenciosa de um dos lugares que o repetem. Este `ADR-013` **é** essa decisão escrita para a Onda 3 — ele não
só cita o precedente, ele o exerce.

**As chaves dentro dos `config/*.json` — decidido: entram.** O `ADR-009` põe chave de config na coluna
inglês (linha 8 da tabela artefato-por-artefato), e a decisão é aplicá-lo até o fim: `excecoes`,
`excecoesCve`, `qualidade`/`qualidade.modo`, `formatacao`/`formatacao.ativo`, `cobertura`/`cobertura.minima`,
`dependencias.severidadeMinima`, `linguagens`, `rateLimit`/`janelaSegundos`/`limiteLeitura`/`limiteEscrita`,
`cors`/`origensPermitidas`/`metodos`, `headers`/`hsts`/`noSniff`/`frameDeny`/`referrerPolicy`,
`paginaTamanhoPadrao`/`paginaTamanhoMaximo`/`corpoMaximoKb`/`nivelLog`, e as chaves
`_comentario`/`_doc`/`_exemplo`/`_exemploCve` entram no escopo — a lista acima veio da leitura dos
`config/*.json` do binding typescript nesta conversa, **não é exaustiva por origem**: **a lista completa é
levantada na Onda 2 e conferida contra os schemas de `tools/gate/schemas/`**, não inventada aqui.

**A fronteira que este ADR é obrigado a escrever, porque a mecânica sozinha erra aqui.** Dois arquivos têm
chave de config cujo **valor** é conteúdo de domínio, não estrutura:
- `config/textos.json` — `titulo`, `carregando`, `listaVazia`, `erroGenerico`;
- `config/domain.json` — `statusValidos`.

A régua do `ADR-009` se aplica sem exceção: **a chave é o slot — árvore, inglês; o valor é o conteúdo —
domínio, português.** `texts.json` passa a ter as chaves `title`/`loading`/`emptyList`/`genericError`, com
os mesmos textos em português como valor (`"Carregando..."`, `"Nenhum registro ainda."`, …). `domain.json`
passa a ter a chave `validStatuses`, com os mesmos valores de domínio dentro (`"rascunho"`, `"ativo"`,
`"encerrado"`). É a aplicação consistente do princípio — não uma exceção a ele. Sem esta frase escrita, a
Onda 2 traduziria o valor junto com a chave, que é exatamente o que a linha 10 da tabela do `ADR-009`
proíbe.

**O que NÃO muda, e este ADR precisa dizer para não parecer esquecimento** — é a coluna português do
`ADR-009`, inteira:
- ids das 76 regras do catálogo e mensagens do gate (`ADR-009` linhas 6 e 7);
- símbolos dentro de `tools/` (linha 4);
- domínio, rotas de negócio, nome de tabela/coluna/schema (linha 10) — inclusive `module.json:data` →
  `<modulo_snake>_metadados`, que **já está correto**;
- os **valores** de `texts.json` e `domain.json`, pela fronteira acima;
- `doutrina/` e `specs/arquitetura/` (linha 2, a única exceção ao princípio inteiro).

**Consequências.**
1. **Quebra todo projeto já instanciado do template.** O que se oferece a eles: a ordem das três ondas
   abaixo serve de roteiro de migração, e cada onda é um **eixo independente** — um projeto pode aplicar só
   a Onda 1 (variável de ambiente) sem tocar nome de arquivo de config ou vocabulário de porta, e
   vice-versa. Nenhuma onda depende de as outras já terem rodado no alvo.
2. **~849 ocorrências no template + ~50 arquivos na base fora dele** (skills e hooks que citam esses nomes),
   mais as chaves internas que a Onda 2 vai levantar. Skill que aponta para `config/seguranca.json` depois
   da Onda 2 vira ponteiro órfão, e `meta-verificacao-base` vai acusar — é a rede funcionando, não um
   problema a temer.
3. **A verificação existe e é barata:** `node tools/gate/tests/run.mjs` (128/128 por binding, 76 regras) e
   `node tests/run-all-selftests.mjs` (25/25). **Toda onda entrega os dois verdes** — é a definição de
   pronto de cada onda, e é o que impede a campanha de virar *sed* cego.

**As três ondas** (este ADR fixa a ordem; ele não as executa):
- **Onda 1** — chaves de ambiente (`RAIZ_*` → `ROOT_*`, `ENV_RAIZ` → `ENV_ROOT`). Eixo mais isolado, e o
  que o `ADR-009` já nomeia literalmente.
- **Onda 2** — nomes de arquivo de config, `composicao.*` **e as chaves internas** (com a fronteira
  chave×valor acima). É a maior das três.
- **Onda 3** — vocabulário de portas. **Depende** da seção "Superseding o `ADR-010`" acima e dos três
  lugares que `ports-vocabulary.mjs` obriga a concordar (dois gerados por `generate-port-schemas.mjs
  --conferir`, o terceiro — `packages/ports/index.{ts,js,py}` — mantido à mão nos três bindings).

---

## ADR-014 — O contrato de renomeação do ADR-013 fica completo: árvore em português que a tabela não listava

**Status:** 🟢 Aceito

**Contexto.** O `ADR-013` entregou uma tabela de 14 linhas e a chamou de **contrato** das três ondas.
Medindo a Onda 2 antes de escrevê-la, apareceram artefatos de **árvore em português que a tabela não
lista** — mesma natureza das linhas que ela já tem, mesma régua do `ADR-009`, ausentes por omissão, não por
decisão. O `ADR-013` está `🟢 Aceito`, e a regra deste arquivo é literal: *"imutável depois de aceita.
Mudar de ideia não é editar a decisão antiga — é escrever uma nova que a substitui."* Isto não é mudar de
ideia: é **completar**. O `ADR-013` **não** é marcado `🔴 Substituída` — ele estava incompleto, não errado,
e este ADR diz onde.

**Decisão.**

**1. As linhas que entram no contrato.** Varredura desta conversa (`find bindings -type f -printf "%f\n" |
sort -u`; `ls tools tools/gate`; `find tools -type f -printf "%f\n" | sort -u`) contra as 14 linhas do
`ADR-013`. Cinco entram — três previstas, duas achadas na varredura de `tools/gate/schemas/`:

| Português (hoje) | Inglês (alvo) | Onda | Por quê |
|---|---|---|---|
| `api/src/erros.{ts,js,py}` | `errors.*` | 2a | nome de arquivo do esqueleto — mesma régua de `composicao.*` → `composition.*` |
| `api/src/rotas.py` | `routes.py` | 2a | **o template já se contradiz consigo mesmo**: TypeScript e JavaScript já entregam `api/src/routes/` em inglês; só o binding Python ficou com o nome em português para o mesmo conceito |
| `root/verificar.py` | `verify.py` | 2a | idem: o `package.json` de TS/JS já chama o comando `"verify"` (script npm, `bindings/typescript/root/package.json`); Python, sem esse mecanismo, materializou o arquivo com o nome em português |
| `tools/gate/schemas/config-seguranca.schema.json` | `config-security.schema.json` | 2a | schema de `config/seguranca.json` — a tabela do `ADR-013` renomeia o JSON de config mas não cita o par `config-<assunto>.schema.json` que o valida |
| `tools/gate/schemas/config-textos.schema.json` | `config-texts.schema.json` | 2a | idem, par de `config/textos.json` |

As duas últimas **não** estavam previstas no prompt desta conversa — vieram da varredura de
`tools/gate/schemas/`, que o `ADR-013` só cobre para `conformidade`/`verificacao` (entre parênteses na
tabela) e nunca para as cinco de `config-<assunto>.schema.json` (`CONFIGS = ['api', 'domain', 'seguranca',
'ports', 'textos']`, replicada em três arquivos — ver item 3).

O resto da árvore foi conferido e **não** entra:
- `database/migrations/0001-cria-metadados.sql` — migration nomeia mudança de **dados**; `04-regras.md`
  §3.1 fixa `NNNN-verbo-objeto.sql` com exemplo em português. É conteúdo (`ADR-009` linha 10), não árvore.
- os ~29 `.mjs` de `tools/` já estão em inglês; os **símbolos** dentro deles ficam em português (linha 4) —
  inclusive `RAIZ_TEMPLATE`/`RAIZ_FERRAMENTA`/`RAIZ_BASE`, que a Onda 1 deliberadamente não tocou.
- `config-api.schema.json`, `config-domain.schema.json`, `config-ports.schema.json` — já inglês.
- `mappers.py`, `middlewares.py`, `logger.{ts,js,py}`, `migrations.{mjs,py}` e o resto do esqueleto
  (`config.*`, `README.md`, `module.json`, `project.json`, `openapi.yaml`, `.env.example`, testes, front) —
  já inglês.

**2. Os três ids de regra que a Onda 2 não pode tocar.** `verificacao-declarada`, `composicao-descoberta`,
`conformidade-declarada` — ids do catálogo, português por `ADR-009` linha 6, apontados por exceções de
`config/conformidade.json`. Renomear o id quebra a exceção: o gate rejeita exceção cujo `regra` não existe.
Só a **descrição** deles (o texto que cita `config/seguranca.json` etc.) muda.

O confound gêmeo, medido: `tools/gate/validate.mjs:90` — `const rotulo = opcoes.extracao ? 'extracao' :
'conformidade'` — é **rótulo de saída do gate**, português por `ADR-009` linha 7, na mesma palavra que, dez
linhas acima na tabela deste contrato, nomeia um arquivo (`conformidade.json` → `compliance.json`). A Onda 2
classifica **ocorrência a ocorrência**, nunca por palavra — a mesma disciplina que a Onda 1 já seguiu para
separar `RAIZ_TEMPLATE` (símbolo) de `RAIZ_API_PORT` (chave) dentro do mesmo arquivo.

**3. Referências por basename que o rename de arquivo não alcança.**
- `['api', 'domain', 'seguranca', 'ports', 'textos']` — literal em `tools/gate/context.mjs:155`,
  `tools/gate/rules/configuration.mjs:31` e `tools/gate/rules/structure.mjs:44`;
- `carregarEsquema('verificacao')` e `carregarEsquema('conformidade')` —
  `tools/gate/rules/configuration.mjs:457,478`;
- `m.config('seguranca', …)` — fixtures de `tools/gate/tests/cases.mjs`.

Arquivo renomeado sem essas três listas atualizadas é gate que não acha a própria config — `config-valida`/
`schema-config` reprovariam um projeto conforme. Os gate tests acusam isso, que é a rede fazendo o trabalho
dela; a Onda 2a evita nascer vermelha sabendo disso de antemão.

**4. A Onda 2 se parte em duas.** Mudança de plano em relação ao `ADR-013`, com o motivo medido: os tokens
da Onda 2 são **substantivos comuns do português** (`seguranca`, `textos`, `conformidade`, `verificacao`,
`composicao`, `erros`, `rotas`, `verificar`) — ao contrário de `RAIZ_`/`ENV_RAIZ`, que não colidiam com
nenhuma outra palavra do vocabulário —, e os confounds (item 2) moram **dentro dos mesmos arquivos** que os
renomeios tocam. Duas conversas, dois eixos independentes:
- **Onda 2a** — nomes de arquivo (`security.json`, `texts.json`, `compliance.json`, `verification.json`, os
  dois `*.schema.json` deste ADR, `composition.*`, mais as três linhas novas do item 1) e toda referência a
  eles, **inclusive por basename** (item 3).
- **Onda 2b** — chaves **dentro** dos JSONs, com a fronteira chave×valor que o `ADR-013` já fixou
  (`texts.json`/`domain.json`: chave inglês, valor português).

O repositório fica **coerente entre as duas**: um arquivo chamado `security.json` cujas chaves ainda estão
em português não quebra nada — só ainda não terminou. Definição de pronto de cada uma continua a do
`ADR-013`: gate tests e self-tests verdes.

**5. O que fica de fora, e por quê.**

**O marcador `<modulo>`/`<MODULO>`/`<Modulo>`/`<modulo_snake>` — adiado, deliberadamente.** Não é um
artefato, é um **eixo transversal**: aparece em nome de pasta, nome de package, código, config e
`.env.example`, e `tools/gate/context.mjs` o substitui **em memória** por um id sintético para validar o
molde como módulo real (`ADR-006`). Mexer nele dentro de qualquer onda contamina o isolamento de eixo que
faz cada onda ser migrável isoladamente por um alvo — a consequência nº 1 do `ADR-013`. Ele volta como onda
própria ou ADR próprio, com decisão escrita; enquanto isso, a divergência entre o exemplo do `ADR-009`
linha 9 (`<MODULE>_DB_URL`) e o marcador do template (`<MODULO>_`) fica **declarada aqui**, não escondida.

**`tools/sync-env.mjs:56`** — `SECAO_DA_RAIZ = '# --- RAIZ: a fiacao …'`. O **símbolo** fica (linha 4, é
ferramental de `tools/`), mas o **valor** é o cabeçalho escrito no `.env`/`.env.example` gerado — texto de
saída, português por `ADR-009` linha 7. Depois da Onda 1, ele já exibe "RAIZ:" acima de chaves `ROOT_*`: o
rótulo perdeu o referente. Fica para a **Onda 2a** corrigir o valor da string — não é rename de arquivo nem
de chave, é o mesmo tipo de ajuste que a Onda 1 já fez em comentários e mensagens.

**Consequências.**
1. **O contrato de renomeação passa a ser `ADR-013` + `ADR-014` lidos juntos** — quem executar uma onda lê
   os dois, e nenhuma onda renomeia o que não estiver num deles. É o que impede a próxima onda de
   "descobrir" mais um arquivo e decidir sozinha.
2. **A Onda 2 do `ADR-013` vira Onda 2a + Onda 2b**, cada uma com sua própria definição de pronto (gate
   tests + self-tests verdes), sem alterar a Onda 1 (já executada) nem a Onda 3.
3. **Os três ids do item 2 não mudam de nome** — qualquer exceção nominal já registrada em
   `config/conformidade.json` contra eles continua válida depois das Ondas 2a/2b.

---

## ADR-015 — As chaves de config vão para o inglês: a tabela que a Onda 2b aplica

**Status:** 🟢 Aceito

**Contexto.** O `ADR-013` decidiu que as chaves **dentro** dos `config/*.json` entram no escopo do `ADR-009`
e escreveu, textualmente, que *"a lista completa é levantada na Onda 2 e conferida contra os schemas de
`tools/gate/schemas/`, não inventada aqui"*. O `ADR-014` fixou a regra que torna essa lista obrigatória
antes de qualquer rename: **nada se renomeia que não esteja num ADR do contrato**. Este ADR é essa lista —
o contrato passa a ser `ADR-013` + `ADR-014` + `ADR-015`, lidos juntos. Nenhuma linha aqui é aplicada nesta
conversa; a Onda 2b é quem aplica.

O `ADR-013` não é marcado `🔴 Substituída`, pelo mesmo motivo que o `ADR-014` não marcou o `ADR-013`:
não é mudar de ideia, é completar uma tabela que o próprio texto já previa como incompleta.

**Régua de tradução**, decidida antes da tabela e aplicada a cada linha dela:
- **camelCase se mantém** — `04-regras.md` §3.1 já fixa a forma (`Chave de config | camelCase |
  maxPageSize`); o que muda é o idioma, não a caixa.
- **Tradução direta, sem inventar abreviação.** `paginaTamanhoMaximo` → `maxPageSize` é o exemplo que a
  própria §3.1 já traz (Onda 0); toda linha abaixo segue a mesma disciplina — nunca `maxPgSz`.
- **Chave que já é inglês não muda.** `rateLimit`, `cors`, `headers`, `hsts`, `noSniff`, `frameDeny`,
  `referrerPolicy`, `id`, `linter`, `typescript`/`javascript`/`python` e `_doc` já estão na forma-alvo —
  entram na tabela para que a varredura fique completa, marcadas como tal, não por omissão.
- **Chaves com prefixo `_`** (`_comentario`, `_exemplo`, `_exemploCve`) são estrutura, e entram:
  `_comentario` → `_comment`, `_exemplo` → `_example`. **Nota de varredura:** o `ADR-013` citava
  `_modo_doc` como exemplo de chave `_`; nenhum dos seis `config/*.json` nem seus schemas têm essa chave —
  era ilustrativo, não uma chave real, e não entra na tabela por não existir.
- **A fronteira chave×valor do `ADR-013` vale integralmente, escrita de novo aqui** porque é a linha que a
  Onda 2b mais arrisca atravessar: em `texts.json` a **chave** vai para o inglês e o **valor** continua em
  português — `titulo` → `title` com `"<Modulo>"` dentro (o marcador do molde, não texto real), `carregando`
  → `loading` com `"Carregando..."` dentro. Em `domain.json`, `statusValidos` → `validStatuses` com
  `"rascunho"`/`"ativo"`/`"encerrado"` dentro, intocados. A régua se estende, por analogia direta, aos
  campos de `compliance.json`: `regra` → `rule` é a CHAVE que muda; o **valor** dela (um id do catálogo de
  76 regras, ex. `"estrutura-estrita"`) fica português para sempre — não pela fronteira chave×valor, mas
  porque id de regra é conteúdo por `ADR-009` linha 6, e a exceção só existe apontando para um id que o
  gate reconhece.

**Confound × leitor — a distinção que a coluna 4 não pode confundir consigo mesma.** Um **leitor** é código
que acessa a chave PELO MESMO NOME, do MESMO conceito — quando a Onda 2b renomear a chave, o leitor tem de
acompanhar, e isso é trabalho previsto, não risco escondido (`cors.origensPermitidas` lido por
`cors-aberto` é leitor). Um **confound** é a mesma grafia usada por um símbolo **de outro conceito**, que
**não muda** — e é aí que um `sed` cego causa dano: renomear por palavra em vez de por ocorrência atinge o
confound junto. A coluna abaixo registra os dois tipos com o rótulo explícito, e `—` quando a busca não
achou nenhum dos dois.

### 1. A tabela — o entregável

| Arquivo | Chave (hoje) | Chave (alvo) | Confound conhecido |
|---|---|---|---|
| `_template/config/api.json` (3 bindings, idênticos) | `_comentario` | `_comment` | — |
| `_template/config/api.json` | `paginaTamanhoPadrao` | `defaultPageSize` | — |
| `_template/config/api.json` | `paginaTamanhoMaximo` | `maxPageSize` | já é o exemplo canônico de `04-regras.md` §3.1 (Onda 0) |
| `_template/config/api.json` | `corpoMaximoKb` | `maxBodyKb` | — |
| `_template/config/api.json` | `nivelLog` | `logLevel` | leitor (não confound): fixture `tools/gate/tests/cases.mjs:728-729` muta esta chave por nome literal |
| `_template/config/domain.json` (3 bindings, idênticos; schema `{"type":"object"}`, sem `properties` — ver item "divergências" abaixo) | `_comentario` | `_comment` | — |
| `_template/config/domain.json` | `statusValidos` | `validStatuses` | fronteira chave×valor: valor `["rascunho","ativo","encerrado"]` continua português |
| `_template/config/security.json` (3 bindings, idênticos) | `_comentario` | `_comment` | — |
| `_template/config/security.json` | `rateLimit` | `rateLimit` (já inglês) | — |
| `_template/config/security.json` | `rateLimit.janelaSegundos` | `rateLimit.windowSeconds` | — |
| `_template/config/security.json` | `rateLimit.limiteLeitura` | `rateLimit.readLimit` | — |
| `_template/config/security.json` | `rateLimit.limiteEscrita` | `rateLimit.writeLimit` | — |
| `_template/config/security.json` | `rateLimit.limiteGeracao` (só no schema, ver divergência abaixo) | `rateLimit.generateLimit` | — |
| `_template/config/security.json` | `cors` | `cors` (já inglês) | — |
| `_template/config/security.json` | `cors.origensPermitidas` | `cors.allowedOrigins` | leitor (não confound): `tools/gate/rules/configuration.mjs:248,251` (`cors-aberto`) lê esta chave pelo nome |
| `_template/config/security.json` | `cors.metodos` | `cors.methods` | — |
| `_template/config/security.json` | `headers` | `headers` (já inglês) | — |
| `_template/config/security.json` | `headers.hsts` | `headers.hsts` (já inglês) | — |
| `_template/config/security.json` | `headers.noSniff` | `headers.noSniff` (já inglês) | — |
| `_template/config/security.json` | `headers.frameDeny` | `headers.frameDeny` (já inglês) | — |
| `_template/config/security.json` | `headers.referrerPolicy` | `headers.referrerPolicy` (já inglês) | — |
| `_template/config/texts.json` (TypeScript/JavaScript, idênticos) | `_comentario` | `_comment` | — |
| `_template/config/texts.json` (TS/JS) | `titulo` | `title` | confound: `tools/ci-dependencies.mjs:78,97` (`titulo: via.title`, título de achado de CVE) e `tools/contract-compatible.mjs:468,471,473` (`titulo` de schema OpenAPI) — mesma grafia, dois arquivos sem relação com texto de tela |
| `_template/config/texts.json` (TS/JS) | `carregando` | `loading` | leitor forçado (não confound): `tools/create-module.mjs:156` — `TEXTOS_SO_DA_TELA = ['carregando','listaVazia','erroGenerico']`, array literal que poda estas chaves ao gerar módulo sem `web/` |
| `_template/config/texts.json` (TS/JS) | `listaVazia` | `emptyList` | mesmo array de `create-module.mjs:156` acima |
| `_template/config/texts.json` (TS/JS) | `erroGenerico` | `genericError` | mesmo array de `create-module.mjs:156` acima |
| `_template/config/texts.json` (Python — diverge: só duas chaves, sem `carregando`/`listaVazia`; `_comentario` próprio explica "módulo Python é backend") | `_comentario` | `_comment` | — |
| `_template/config/texts.json` (Python) | `titulo` | `title` | mesmo confound de `ci-dependencies.mjs`/`contract-compatible.mjs` acima |
| `_template/config/texts.json` (Python) | `erroGenerico` | `genericError` | mesmo array de `create-module.mjs:156` — mas Python nunca tem `carregando`/`listaVazia` para podar |
| `root/config/compliance.json` (3 bindings, idênticos) | `_comentario` | `_comment` | — |
| `root/config/compliance.json` | `_exemplo` | `_example` | — |
| `root/config/compliance.json` | `_exemplo.modulo` | `_example.module` | espelha o confound de `excecoes[].modulo` abaixo |
| `root/config/compliance.json` | `_exemplo.regra` | `_example.rule` | espelha o confound de `excecoes[].regra` abaixo |
| `root/config/compliance.json` | `_exemplo.motivo` | `_example.reason` | espelha o confound de `excecoes[].motivo` abaixo |
| `root/config/compliance.json` | `_exemplo.decisao` | `_example.decision` | — |
| `root/config/compliance.json` | `excecoes` | `exceptions` | — |
| `root/config/compliance.json` | `excecoes[].modulo` | `exceptions[].module` | **o confound mais grave deste ADR**: `tools/gate/validate.mjs:24` (`aplicarExcecoes`) compara `e.modulo === a.modulo` — `e` vem desta chave (muda), `a` é o achado do PRÓPRIO gate (`tools/gate/engine.mjs:34,43,54,76,88,94`, propriedade interna, símbolo de `tools/`, `ADR-009` linha 4, NUNCA muda). Renomear só o lado esquerdo quebra a comparação para sempre — toda exceção nominal para de perdoar achado, e nenhum teste do template acusa isso como erro de sintaxe |
| `root/config/compliance.json` | `excecoes[].regra` | `exceptions[].rule` | mesmo confound acima — `e.regra === a.regra` em `validate.mjs:24`, e `a.regra`/`item.regra` também em `validate.mjs:33,39` e `engine.mjs:43,54,76` |
| `root/config/compliance.json` | `excecoes[].motivo` | `exceptions[].reason` | confound: `tools/affected.mjs:154,162,191,196,227` usa `motivo` como campo de retorno PRÓPRIO do script (por que rodar "tudo"), sem relação com exceção nominal — símbolo de `tools/`, fica |
| `root/config/compliance.json` | `excecoes[].decisao` | `exceptions[].decision` | leitor (não confound): `tools/gate/context.mjs:355-360,373` (`porqueInvalida`) resolve esta chave contra `specs/adr/*.md` |
| `root/config/compliance.json` | `_exemploCve` | `_exampleCve` | — |
| `root/config/compliance.json` | `_exemploCve.id` | `_exampleCve.id` (já inglês) | — |
| `root/config/compliance.json` | `_exemploCve.motivo` | `_exampleCve.reason` | mesmo confound de `excecoes[].motivo` (`tools/affected.mjs`) |
| `root/config/compliance.json` | `_exemploCve.decisao` | `_exampleCve.decision` | — |
| `root/config/compliance.json` | `_exemploCve.expira` | `_exampleCve.expires` | — |
| `root/config/compliance.json` | `excecoesCve` | `exceptionsCve` | — |
| `root/config/compliance.json` | `excecoesCve[].id` | `exceptionsCve[].id` (já inglês) | — |
| `root/config/compliance.json` | `excecoesCve[].motivo` | `exceptionsCve[].reason` | mesmo confound de `excecoes[].motivo` (`tools/affected.mjs`) |
| `root/config/compliance.json` | `excecoesCve[].decisao` | `exceptionsCve[].decision` | leitor (não confound): `tools/ci-dependencies.mjs:130-132,392-394` (`excecao.decisao`) |
| `root/config/compliance.json` | `excecoesCve[].expira` | `exceptionsCve[].expires` | leitor (não confound): `tools/ci-dependencies.mjs:131-132` (`excecao.expira`) |
| `root/config/verification.json` (3 bindings; só `linguagens.<binding>` diverge por binding) | `_doc` (todos os níveis) | `_doc` (já inglês) | — |
| `root/config/verification.json` | `qualidade` | `quality` | — |
| `root/config/verification.json` | `qualidade.modo` | `quality.mode` | **confound duplo**: `bindings/python/root/verify.py:250-277` (`_despachar_modo`/`modo`, o MODO DE DESPACHO da CLI — `--cobertura`/`--dependencias`/cadeia inteira, sem relação com política) e `tools/gate/rules/isolation.mjs:289,436,446,552` (`ctx.manifesto?.ui?.modo`, chave `ui.modo` de `module.json`, valores `"proprio"`/`"kit"`) |
| `root/config/verification.json` | `formatacao` | `formatting` | — |
| `root/config/verification.json` | `formatacao.ativo` | `formatting.active` | — |
| `root/config/verification.json` | `cobertura` | `coverage` | — |
| `root/config/verification.json` | `cobertura.minima` | `coverage.minimum` | quase-confound, registrado pelo risco: `tools/ci-dependencies.mjs:106,109,140,144` usa parâmetro `minima`, mas ele é sempre alimentado por `severidadeMinima()` (linha abaixo) — NÃO é esta chave, e a semelhança do nome curto é o próprio perigo |
| `root/config/verification.json` | `dependencias` | `dependencies` | — |
| `root/config/verification.json` | `dependencias.severidadeMinima` | `dependencies.minimumSeverity` | o confound medido no prompt desta conversa: `tools/ci-dependencies.mjs:267` (função `severidadeMinima()`, símbolo, fica) × `:271` (a chave lida, muda) |
| `root/config/verification.json` | `dependencias.modo` (só no schema, ausente nos três JSONs — ver divergência abaixo) | `dependencies.mode` | mesma família de confound de `qualidade.modo` acima |
| `root/config/verification.json` | `linguagens` | `languages` | — |
| `root/config/verification.json` | `linguagens.typescript`/`.javascript`/`.python` (uma chave por binding) | `languages.typescript`/`.javascript`/`.python` (já inglês) | — |
| `root/config/verification.json` | `linguagens.<binding>.linter` | `languages.<binding>.linter` (já inglês) | — |
| `root/config/verification.json` | `linguagens.<binding>.formatador` | `languages.<binding>.formatter` | **é o ponto cego do item 4 abaixo**: `hooks/_lib.js:120,122` já faz a tradução no momento da leitura (`formatter: doJs.formatador`) — depois da 2b vira leitura direta (`formatter: doJs.formatter`), e nenhum teste do template acusa se isso não acompanhar |

**Divergências achadas entre schema e JSON, conferidas linha a linha** (exigência do `ADR-013`):
1. `config-security.schema.json` declara `rateLimit.limiteGeracao` (opcional) — **nenhum** dos três
   `security.json` o instancia. Schema mais permissivo que a realidade; não é erro, mas a Onda 2b decide se
   traduz uma chave que hoje não existe em nenhum arquivo real.
2. `verification.schema.json` declara `dependencias.modo` e `cobertura.modo` como opcionais — nenhum dos
   três `verification.json` os declara (só `qualidade.modo`, que é obrigatório, está presente nos três).
   Mesma observação: a Onda 2b decide se traduz chave sem instância hoje.
3. `config-domain.schema.json` e `config-texts.schema.json` são `{"type": "object"}`, sem `properties` —
   **não há o que divergir**: nenhuma chave de `domain.json`/`texts.json` é validada por schema, só pela
   regra genérica `config-morta` (chave declarada e nunca lida no código). A tabela acima usa o conteúdo
   real dos três `domain.json`/`texts.json` como única fonte, não o schema.
4. Nenhuma outra divergência: `config-api.schema.json` e `compliance.schema.json` batem exatamente com o
   conteúdo dos JSONs (chaves `_`-prefixadas ficam fora da checagem de `additionalProperties: false` por
   `tools/gate/schema.mjs:82`, `if (chave.startsWith('_')) continue` — por isso `_comentario`/`_exemplo`/
   `_exemploCve` não aparecem nas `properties` de `compliance.schema.json` e mesmo assim não reprovam).

### 2. `config/ports.json` fica de fora — e por quê

As chaves de `ports.json` (`repositorio`, `auditoria`, `relogio`, `geradorId`, `notificador`, `storage`) são
os **nomes de porta**, e já estão na tabela de 14 linhas do `ADR-013` como **Onda 3** — eixo próprio, com
três lugares que têm de concordar (`ports-vocabulary.mjs`, `config-ports.schema.json` e o `ports.items.enum`
de `module.schema.json`, os dois últimos **gerados** por `generate-port-schemas.mjs`). Traduzi-las na 2b
quebraria o isolamento de eixo que o `ADR-013` consequência nº1 promete, e atropelaria a geração de schema.

`tools/gate/schemas/config-ports.schema.json` — o **arquivo** — já está em inglês e não foi tocado pela
Onda 2a; o que muda nele são as `properties` (`repositorio` → `repository` etc.), e isso é trabalho da
Onda 3, não desta.

**Confirmado nesta varredura:** `bindings/**/root/src/composition.*` **lê** `config/ports.json` (a escolha
de provedor por porta, em `resolveDependencies()`), não `security.json`/`texts.json`/`compliance.json`/
`verification.json`. `composition.*` não é leitor de nenhuma chave desta tabela — só do vocabulário de
porta (Onda 3). O prompt desta conversa listava `composition.*` entre os leitores a acompanhar; a varredura
corrige essa premissa. O confound achado em `composition.*` é outro: a variável local `dependencias`
(`typescript/root/src/composition.ts:85,95,97`, `javascript/.../composition.js:74,84,86`,
`python/.../composition.py:84,95,96`) guarda o MAPA DE PROVEDORES RESOLVIDOS por injeção de dependência —
sem relação nenhuma com `verification.json:dependencias` (a política de auditoria). Símbolo de `tools/`/
esqueleto, grafia idêntica, conceito oposto — registrado aqui porque nenhuma chave desta tabela o alcança
diretamente, mas um `sed` por palavra o atingiria.

### 3. A coluna *Confound conhecido* — por que este ADR existe

Medido nesta conversa, o padrão da Onda 2a se repetiu e se agravou: a Onda 2a tinha confound entre palavra
comum e nome de ARQUIVO, com grafias que já divergiam antes de qualquer rename (`conformidade.json` ×
`rotulo = '...: 'conformidade''`). Aqui a chave de config e o símbolo interno de `tools/` têm, com
frequência, **a mesma grafia, no mesmo arquivo, nas mesmas linhas** — o confound de `modulo`/`regra` em
`validate.mjs:24` é o caso limite: os dois lados da comparação (`e.modulo`/`a.modulo`) têm hoje a MESMA
palavra por acidente, um vindo do JSON (muda) e o outro do próprio gate (fica), e só divergem em
comportamento no dia em que um dos dois mudar sem o outro. A tabela acima documenta cada confound achado
com `arquivo:linha`; onde a busca não achou nenhum, a coluna diz `—` — ausência de resposta não é célula
vazia.

### 4. Os leitores que a Onda 2b terá de acompanhar

- `tools/gate/context.mjs:154-234` — `lerConfigs()` (monta `ctx.configs.<assunto>`, consumido por toda
  regra de módulo) e `lerProjeto()` (`ctx.projeto.verificacao`/`.conformidade`, os símbolos ficam por
  `ADR-009` linha 4, mas os **valores** que eles guardam são os JSONs desta tabela).
- `tools/gate/rules/configuration.mjs` — `cors-aberto` (linha 248/251, único lugar do catálogo que lê
  campo nomeado de config); `config-morta` (linha 262-269) é genérico (`Object.keys(valor)`) e **não**
  precisa acompanhar — nenhuma chave hardcoded ali.
- `tools/gate/validate.mjs:23-39` e `tools/gate/engine.mjs:34-94` — `aplicarExcecoes`, o confound mais
  grave do item 1; leitor de `excecoes[].modulo`/`.regra`/`.decisao`.
- `tools/gate/context.mjs:340-381` — `carregarExcecoes`/`porqueInvalida`, leitor de `excecoes[].decisao`.
- `tools/ci-dependencies.mjs` — `severidadeMinima()` (:267,271), `excecoesCve()` (:280,284),
  `statusDaExcecao` (:130-132, `.decisao`/`.expira`).
- `tools/create-module.mjs:156` — `TEXTOS_SO_DA_TELA`, array literal de chaves de `texts.json`.
- `bindings/python/root/verify.py:119` — `json.loads(...).get("cobertura", {}).get("minima")`, leitor
  direto de `cobertura.minima`.
- Os **schemas** (`tools/gate/schemas/config-*.schema.json`, `compliance.schema.json`,
  `verification.schema.json`) — as `properties` deles são a própria lista; a Onda 2b os atualiza junto.
  **Achado à parte:** o `$comentario` de `compliance.schema.json` hoje diz, textualmente, que *"chave em
  inglês ('module'/'rule') ... reprova aqui por `additionalProperties: false`"* — depois da 2b essa frase
  vira o oposto do comportamento real (inglês passa a ser exigido), e o texto do `$comentario` precisa
  mudar junto com as `properties`, não é só find-and-replace de chave.
- **`hooks/_lib.js:117-129`** (`politicaDoProjeto`) — lê `bruto.qualidade`, `.formatacao`, `.cobertura`,
  `.dependencias`, `.linguagens.{typescript,javascript,python}.{linter,formatador}` de
  `config/verification.json`. **É o único consumidor da config do template que mora fora do template, na
  base.** Se a Onda 2b renomear qualquer uma dessas chaves sem tocar este arquivo, o hook de qualidade para
  de achar a política em todo projeto gerado — e **nenhum teste do template acusa**, porque `hooks/_lib.js`
  não é do template; só `run-all-selftests.mjs` (que roda o `--autoteste` do próprio `hooks/_lib.js`, sem
  tocar num `verification.json` real) e uma checagem manual pegam isso. É o ponto cego da onda.
- **Verificado e descartado nesta varredura:** `tools/ci-security.mjs` **não** lê nenhum `config/*.json`
  desta tabela (só `skills/cyber-segredos/scripts/config.json`, fora do template) — o prompt desta conversa
  o listava como candidato a leitor; não é. `bindings/**/root/src/composition.*` também não (item 2 acima).

### 5. Consequências

1. **O contrato de renomeação passa a ser `ADR-013` + `ADR-014` + `ADR-015` lidos juntos.** Nenhuma onda
   renomeia chave que não esteja nesta tabela; chave nova achada na Onda 2b vira ADR-016, pela mesma
   disciplina que o `ADR-014` completou o `ADR-013`.
2. **Todo projeto já instanciado do template tem os seis `config/*.json` reescritos, chave por chave** — é
   a onda de maior impacto no arquivo que o operador do projeto edita à mão, porque ao contrário de nome de
   arquivo (Onda 2a, um `git mv` resolve), aqui o **conteúdo** de um arquivo que o time já pode ter
   calibrado (`cobertura.minima: 92` em vez do default 80, por exemplo) precisa ser fundido, não
   sobrescrito. O que se oferece como roteiro: a tabela acima é o de-para completo; um script de migração
   (fora do escopo desta conversa) pode aplicá-la preservando valor, só trocando chave.
3. **A definição de pronto continua a do `ADR-013`**: `node tools/gate/tests/run.mjs` (128/128 por binding)
   e `node tests/run-all-selftests.mjs` (25/25) verdes. **Mais, aqui, um item que os testes não cobrem**:
   `hooks/_lib.js` conferido À MÃO contra o `verification.json` novo — nenhum teste do template ou da base
   cruza os dois hoje (item 4 acima), e é o único ponto da campanha inteira com essa lacuna.

---

## ADR-016 — O vocabulário de portas: a tabela derivada que a Onda 3 aplica

**Status:** 🟢 Aceito

**Contexto.** O `ADR-013` já decidiu a Onda 3 em uma linha por porta — *"chave de config + símbolo do
esqueleto"* — e listou as sete: `repositorio`→`repository`, `auditoria`→`audit`, `relogio`→`clock`,
`geradorId`→`idGenerator`, `verificadorDeToken`→`tokenVerifier` (supersedendo o `ADR-010`),
`notificador`→`notifier`, `storage` (já inglês). O que essa linha não itemiza é o que o `ADR-014` já
provou ser necessário itemizar para `RAIZ_*`/nome de arquivo: as **interfaces** do esqueleto que carregam
esses nomes (`Repositorio`, `NomeDePorta`, …) e as **implementações derivadas** que os adapters declaram
(`RepositorioEmMemoria`, `AuditoriaPostgres`, `RelogioFixo`, …), mais o identificador `PORTAS_CONHECIDAS`,
que existe em nove arquivos e não muda do mesmo jeito nos nove. Sem esta tabela, a Onda 3 repete o erro que
o `ADR-014` já corrigiu uma vez: renomear por analogia em vez de por decisão escrita — e aqui o risco é
maior, porque a varredura desta conversa (leitura direta dos três `packages/ports/index.*` e dos seis
arquivos de `adapters/{memory,postgres}/`) achou os bindings **divergentes entre si** em pontos que uma
tabela genérica esconderia.

Contagem de rastro, por arquivo (não por ocorrência — o `ADR-013` mediu ocorrência; aqui a unidade que
importa é "arquivo que a Onda 3 toca", porque é isso que orienta a varredura de conferência): 55 arquivos
citam algum nome minúsculo de porta fora de `doutrina/`, 16 citam alguma interface do bloco (b), 7 citam
algum nome de implementação derivada do bloco (c), e 9 citam `PORTAS_CONHECIDAS`. A ordem de grandeza bate
com o "maior das quatro ondas" já apontado na abertura desta campanha; o que esta conversa muda é a
**composição** do bloco (c) — ver item 1.3.

### 1. A tabela — três blocos, um por natureza

**1.1 Nomes de porta** (chave de `config/ports.json`, item de `module.json:ports`, propriedade de
`config-ports.schema.json`, item do enum de `module.schema.json:ports.items.enum`) — já no `ADR-013`,
transcrito aqui para o ADR ficar autossuficiente:

| Português (hoje) | Inglês (alvo) |
|---|---|
| `repositorio` | `repository` |
| `auditoria` | `audit` |
| `relogio` | `clock` |
| `geradorId` | `idGenerator` |
| `verificadorDeToken` | `tokenVerifier` |
| `notificador` | `notifier` |
| `storage` | `storage` (já inglês) |

**Leitores concretos, achados na varredura — o `ADR-013` fala em "chave de config + símbolo do esqueleto"
em abstrato; estes são os arquivos físicos onde isso mora**, e a Onda 3 precisa dos sete pares
(21 arquivos, 3 bindings × 7): `bindings/*/root/config/ports.json` (as chaves), `bindings/*/_template/module.json`
(o array `ports: [...]`, valores literais) e `bindings/*/root/src/composition.*` (o objeto `FABRICAS`, cujas
chaves de primeiro nível **são** os nomes de porta — confirmado lendo os três: `{ repositorio: {...},
auditoria: {...}, relogio: {...}, geradorId: {...}, storage: {...}, notificador: {...} }`; nenhum dos três
tem entrada para `verificadorDeToken`, o "LIMITE CONHECIDO" que o `ADR-010` já registrava — nenhum provedor
foi cadastrado para essa porta, então não há chave para renomear, só a ausência dela permanece).

**1.2 Interfaces do esqueleto** (`packages/ports/`) — **conferidas contra os três arquivos reais, e eles
divergem**, exatamente como o prompt que abriu esta conversa já avisava que poderiam divergir:

| Português (hoje) | Inglês (alvo) | TS | JS | Python |
|---|---|---|---|---|
| `Repositorio<T>` | `Repository<T>` | interface genérica | `@typedef` JSDoc genérico | `Protocol` |
| `Auditoria` | `Audit` | interface | `@typedef` JSDoc | `Protocol` |
| `EventoDeAuditoria` | `AuditEvent` | interface | `@typedef` JSDoc | **ausente** — `record()` toma `dict[str, object]` cru, sem tipo nomeado |
| `Relogio` | `Clock` | interface | `@typedef` JSDoc | `Protocol` |
| `GeradorId` | `IdGenerator` | interface | `@typedef` JSDoc | `Protocol` |
| `VerificadorDeToken` | `TokenVerifier` | interface | `@typedef` JSDoc | `Protocol` |
| `Storage` | `Storage` (já inglês) | interface | `@typedef` JSDoc | `Protocol` |
| `Notificador` | `Notifier` | interface | `@typedef` JSDoc | `Protocol` |
| `PORTAS_CONHECIDAS` | `KNOWN_PORTS` | `const ... as const` | `const` (array simples) | tupla `PORTAS_CONHECIDAS: tuple` |
| `NomeDePorta` | `PortName` | `type` derivado de `PORTAS_CONHECIDAS` | **ausente** — nenhum typedef equivalente | **ausente** — nenhum type alias; a tupla não tem tipo próprio |

Duas divergências que a tabela genérica do `ADR-013` não previa e que a Onda 3 não pode fechar por
analogia: `EventoDeAuditoria` **não existe em Python** (o binding usa `dict[str, object]` diretamente na
assinatura de `Auditoria.record`), e `NomeDePorta`/`PortName` **só existe em TypeScript** (JS não declarou
o typedef equivalente; Python não declarou `Literal`/`Enum` para a tupla). Onda 3 traduz
`NomeDePorta`→`PortName` só no `index.ts`; nos outros dois bindings não há símbolo para tocar — silêncio
correto, não lacuna.

**1.3 Implementações derivadas** (`adapters/memory/`, `adapters/postgres/`) — **este é o bloco onde a
varredura mais diverge do que se presumia ao abrir esta conversa.** A suposição inicial era de nomes como
`RepositorioEmMemoria` e `RepositorioPostgres` simetricamente nos três bindings. A leitura dos seis
arquivos reais mostra que **só o binding Python deriva nome de classe do vocabulário de porta** —
TypeScript e JavaScript já escrevem `adapters/{memory,postgres}/index.*` com **funções fábrica em inglês
desde sempre** (`createRepository`, `createAuditLog`, `createClock`, `createFixedClock`,
`createIdGenerator`, `createSequentialGenerator`, `createInMemoryStorage`, `createInMemoryNotifier`,
`createPostgresRepository`, `createPostgresAudit`) — nenhuma delas deriva de
`Repositorio`/`Auditoria`/`Relogio`/`GeradorId`/`Storage`/`Notificador` por concatenação; são nomes
próprios, já na forma-alvo, e a Onda 3 **não toca nelas** — só nos `import type { Repositorio, ... }` que
apontam para o bloco 1.2.

As dez que **de fato** derivam mecanicamente de um nome de porta, todas em
`bindings/python/root/adapters/{memory,postgres}/__init__.py`:

| Classe (hoje) | Deriva de | Classe (alvo) |
|---|---|---|
| `RepositorioEmMemoria` | `Repositorio` + `EmMemoria` | `InMemoryRepository` |
| `AuditoriaEmMemoria` | `Auditoria` + `EmMemoria` | `InMemoryAudit` |
| `RelogioDoSistema` | `Relogio` + `DoSistema` | `SystemClock` |
| `RelogioFixo` | `Relogio` + `Fixo` | `FixedClock` |
| `GeradorPadrao` | `Gerador` (raiz truncada de `GeradorId`) + `Padrao` | `DefaultIdGenerator` |
| `GeradorSequencial` | `Gerador` (idem) + `Sequencial` | `SequentialIdGenerator` |
| `StorageEmMemoria` | `Storage` + `EmMemoria` | `InMemoryStorage` |
| `NotificadorEmMemoria` | `Notificador` + `EmMemoria` | `InMemoryNotifier` |
| `RepositorioPostgres` | `Repositorio` + `Postgres` | `PostgresRepository` |
| `AuditoriaPostgres` | `Auditoria` + `Postgres` | `PostgresAudit` |

Nota de tradução: `GeradorPadrao`/`GeradorSequencial` derivam da raiz `Gerador`, não de `GeradorId` por
inteiro — o qualificador `Id` só aparece no nome da PORTA, não nos nomes das classes que a implementam
hoje. O alvo em inglês segue a mesma economia (`DefaultIdGenerator`, não `DefaultGeneratorId`) porque
`IdGenerator` já é o substantivo — a ordem das palavras no composto muda com o idioma, não é regra nova,
é gramática.

**Achado fora da tabela, registrado para não ser confundido com omissão:** `AuthQueNega`
(`adapters/memory/__init__.py`) — e seu equivalente `createDenyingAuth()` nos três bindings — **não deriva**
de `VerificadorDeToken`, deriva do nome antigo `auth`, anterior ao `ADR-010`. É o mesmo tipo de "ponto
cego" que `hooks/_lib.js` foi para a Onda 2b (`ADR-015` item 4): nenhum teste do template acusa o nome
desatualizado, porque `AuthQueNega`/`createDenyingAuth` continuam implementando `VerificadorDeToken`
corretamente — só o NOME não acompanhou a troca de vocabulário que o `ADR-010` já fez, faz duas ondas. Pela
régua deste ADR (item 3, "nome que não deriva de porta não entra"), **não entra na tabela de renomeação
mecânica** — mas fica **registrado aqui**, nominalmente, para a Onda 3 decidir se aproveita a passagem pelo
arquivo para consertar um desalinhamento antigo (`DenyAllTokenVerifier`/`createDenyingTokenVerifier`) ou se
deixa para um ADR próprio; esta conversa não decide, só evita que o achado desapareça.

Duas dataclasses privadas do adapter Postgres, `_RegistroDoMolde`/`_PaginaDoMolde` (Python) e o par
`RegistroDoMolde`/`toRecord` (TS/JS), **também não entram**: não derivam de nome de porta, derivam de
"registro" + "molde" (a forma física que a migration cria) — mesma família do `Pagina` do item 3 abaixo,
4º eixo.

### 2. `PORTAS_CONHECIDAS` — o mesmo identificador, dois destinos

Este é o item que justifica o ADR sozinho. O identificador vive em **nove** arquivos — confirmado por
varredura (`grep -rl PORTAS_CONHECIDAS`) —, e a pasta decide:

| Onde | Regra | Ação |
|---|---|---|
| `tools/gate/ports-vocabulary.mjs` (a **fonte**) | ADR-009 linha 4 — ferramental vendorizado | símbolo fica `PORTAS_CONHECIDAS`; o **conteúdo** do array vira `['repository', 'audit', 'clock', 'idGenerator', 'storage', 'tokenVerifier', 'notifier']` |
| `tools/generate-port-schemas.mjs` | idem | símbolo fica (é o `import { PORTAS_CONHECIDAS }`); consome o conteúdo já traduzido da fonte, nada a editar aqui além do import continuar batendo |
| `tools/create-adapter.mjs` | idem | símbolo fica; toda leitura de `PORTAS_CONHECIDAS` passa a devolver os nomes ingleses — o parâmetro `<porta>` da CLI passa a aceitar `repository`, não `repositorio` |
| `tests/template-self-test.mjs` | idem | símbolo fica; o vocabulário que ele varre (para gerar provedor de teste por porta) já vem em inglês da fonte |
| `tests/verify-catalog.mjs` | idem | símbolo fica; é quem cobra `--conferir-vocabulario` — a comparação passa a ser contra os nomes ingleses |
| `tests/verify-routine.mjs` | idem | símbolo fica |
| `bindings/typescript/root/packages/ports/index.ts` | ADR-009 linha 3 — esqueleto | nome vira `KNOWN_PORTS`; conteúdo em inglês |
| `bindings/javascript/root/packages/ports/index.js` | idem | nome vira `KNOWN_PORTS`; conteúdo em inglês |
| `bindings/python/root/packages/ports/__init__.py` | idem | nome vira `KNOWN_PORTS`; conteúdo em inglês |

A frase que resume: **o nome fica, o conteúdo vai — exceto onde o próprio nome é esqueleto.** É a terceira
vez que esta forma aparece na campanha (`RAIZ_TEMPLATE` ficou símbolo na Onda 1 enquanto `RAIZ_API_PORT`
virava `ROOT_API_PORT`; `severidadeMinima()` ficou função em `tools/ci-dependencies.mjs` na Onda 2b enquanto
a chave `dependencias.severidadeMinima` virava `dependencies.minimumSeverity`); registre-a como precedente
para que a Onda 3 a reconheça de saída, sem precisar redescobrir o raciocínio.

### 3. O que NÃO entra, e por quê

- **Ids de regra** — `porta-declarada` e `portas-pura` são os únicos dois ids do catálogo com "porta" no
  nome (varredura confirmou: nenhum `porta-nao-usada` existe — os "demais" da suposição inicial são
  `adapter-isolado` e `composicao-descoberta`, que não têm "porta" no id e não citam nome de porta
  específico no corpo). Os dois ficam em português por `ADR-009` linha 6. As duas verificações
  (`configuration.mjs:217`, `isolation.mjs:461`) já compõem a mensagem a partir de `ctx.manifesto.ports`/
  `config/ports.json` em runtime — **nenhuma tem nome de porta hardcoded**, então nem a descrição precisa
  de edição manual: o texto já muda sozinho quando os valores mudam.
- **Símbolos de `packages/ports/` que não derivam de porta** — `ErroPorta`, `CodigoErro`,
  `CODIGOS_DE_ERRO`, `Pagina` (e, no Postgres, `RegistroDoMolde`/`_RegistroDoMolde`,
  `_PaginaDoMolde`, `ModuloParaAdapter`, `DadosDoManifesto`, `ContextoDeTabela`). São esqueleto em
  português, sim, mas pertencem ao **4º eixo** (símbolos estruturais), que **nenhum ADR do contrato
  autoriza**. Listados nominalmente para a Onda 3 não os arrastar por analogia — `ErroPorta` em particular
  é tentador por conter a palavra "porta", mas o "Porta" ali é o SUBSTANTIVO GERAL (falha de qualquer
  porta), não uma referência a um nome específico do catálogo.
- **Símbolos internos de `tools/`** homônimos de porta — a varredura não achou nenhum além dos já listados
  no item 2 (fonte e consumidores de `PORTAS_CONHECIDAS`) e nas duas regras acima.
- **`AuthQueNega`/`createDenyingAuth`** — ver item 1.3: não deriva do nome de porta atual, é achado
  registrado, não item da tabela.

### 4. O mecanismo de geração — e o que ele impõe à ordem da onda

`config-ports.schema.json` é **inteiro derivado** e `module.schema.json:ports.items.enum` é **parcialmente**
derivado, os dois por `generate-port-schemas.mjs`, com `--conferir` para detectar edição manual. A
consequência operacional: a Onda 3 edita **só** `tools/gate/ports-vocabulary.mjs` (o array
`PORTAS_CONHECIDAS`, conteúdo — item 2) e depois roda `node tools/generate-port-schemas.mjs` para
regenerar os dois schemas — nunca edita `config-ports.schema.json` nem o trecho `enum` de
`module.schema.json` à mão. `--conferir` (`node tools/generate-port-schemas.mjs --conferir`) é o
verificador que prova que foi feito assim, e entra na definição de pronto (item 6). Ordem dentro da onda:
(1) `ports-vocabulary.mjs`; (2) `generate-port-schemas.mjs` sem flag, para escrever os dois schemas; (3) os
`config/ports.json` e `_template/module.json` dos três bindings (item 1.1); (4) os três
`packages/ports/index.*` (itens 1.2 e 2, à mão); (5) os seis `adapters/{memory,postgres}/index.*`
(imports do bloco 1.2, e as dez classes Python do item 1.3); (6) `src/composition.*` — os imports de tipo
e as chaves do `FABRICAS` (item 1.1); (7) `--conferir` + os dois gates de teste.

Registre também que `packages/ports/index.{ts,js,py}` **não é gerado** (a docstring do
`ports-vocabulary.mjs` explica: são interfaces de linguagem de verdade, três sintaxes) e continua mantido à
mão — é o lugar onde a onda pode divergir em silêncio, e é também o lugar com a divergência estrutural já
documentada no item 1.2 (`EventoDeAuditoria` ausente em Python, `NomeDePorta` só em TS): a Onda 3 mantém
essas ausências como estão — não é ocasião para simetrizar os três bindings, só para traduzir o que existe
em cada um.

**Achado adicional de escopo:** `doutrina/01-modulo.md §5.1` cita as sete portas pelo nome português atual
na sua tabela normativa (`repositorio`, `auditoria`, `relogio`, `geradorId`, `storage`,
`verificadorDeToken`, `notificador`) — o mesmo padrão que o `ADR-013` já flagrou para a tabela §3.1 de
`04-regras.md` citando `config/seguranca.json` como exemplo desatualizado. `doutrina/` é a exceção de
**idioma da árvore** (`ADR-009` linha 2), não uma licença para citar um identificador que já não existe no
código — a Onda 3 atualiza a coluna de nomes dessa tabela para o alvo em inglês, no MESMO espírito que
`04-regras.md §3.1` já foi corrigido, e isso não é "traduzir doutrina", é manter uma citação de identificador
correta. Fora do escopo desta conversa (que só toca `decisoes.md`) — registrado para a Onda 3 não descobrir
sozinha.

### 5. As três questões abertas da campanha

Estado, não decisão:
- **`$comentario` como chave** nos 9 `tools/gate/schemas/*.json` (`compliance.schema.json`,
  `config-api.schema.json`, `config-domain.schema.json`, `config-ports.schema.json`,
  `config-security.schema.json`, `config-texts.schema.json`, `module.schema.json`, `project.schema.json`,
  `verification.schema.json` — os nove confirmados por varredura): é chave de JSON (→ inglês,
  `$comment`) ou arquivo de `tools/` isento (linha 4)? Os valores dela já foram atualizados nas Ondas 2a/2b
  onde aplicável; **a chave, não** — inclusive em `config-ports.schema.json`, que este ADR toca via
  `generate-port-schemas.mjs` (a constante `COMENTARIO_CONFIG_PORTAS`): o texto do comentário já está
  correto em português e não cita nome de porta específico, então nada nele muda com a Onda 3 além do
  conteúdo do array `properties` que o cerca — a chave `$comentario` em si segue indefinida, mesma questão
  aberta do `ADR-015`.
- **O 4º eixo** — símbolos estruturais do esqueleto em português (`ConfigSeguranca`, `ConfiguracaoModulo`,
  `DependenciasModulo`, `ContextoDaBorda`, `ErroApi`, `CODIGOS_DE_ERRO`, `ManifestoDescoberto`, `ErroPorta`,
  `Pagina`, `CodigoErro`, e os locais de adapter listados no item 3). `ADR-009` linha 3 os manda para o
  inglês; nenhum ADR os lista. A lista definitiva só se fecha **depois** da Onda 3, porque os derivados de
  porta (que compartilhariam análise com alguns destes) já saíram dela por este ADR.
- **O marcador `<MODULO>`** — já registrado no `ADR-014` §5; aponte para lá, não repita.

### 6. Consequências

1. **O contrato final é `ADR-013` + `014` + `015` + `016` lidos juntos.** A Onda 3 é a última onda do
   contrato de idioma; o que sobrar depois dela são as três questões do item 5, não dívida escondida.
2. **A composição do bloco (c) muda em relação ao que se presumia antes da varredura**: não há simetria de
   três bindings — só Python deriva nome de implementação do vocabulário de porta (dez classes); TS/JS já
   nasceram com fábricas em inglês e não precisam de rename nesse eixo, só de atualizar os `import type`
   que apontam para o bloco (b). Uma onda que tratasse os três bindings como espelhos exatos erraria por
   excesso (tentando renomear função já correta) ou por falta (perdendo `AuthQueNega`, que não é da tabela
   mas é achado real).
3. **A definição de pronto ganha um item além dos testes de gate/selftest**:
   `node tools/generate-port-schemas.mjs --conferir` sai 0 — é a prova de que os dois schemas derivados
   foram gerados, não editados à mão, depois da tradução do array-fonte.

---

## ADR-017 — O marcador de módulo vai para o inglês: o eixo que o ADR-014 adiou

**Status:** 🟢 Aceito

**Contexto.** O `ADR-014` §5 adiou este eixo **deliberadamente**, com dois motivos técnicos, não por
esquecimento: o marcador `<modulo>`/`<MODULO>`/`<Modulo>`/`<modulo_snake>` é um **eixo transversal** —
aparece em nome de pasta, nome de package, código, config e `.env.example`, atravessando toda a árvore do
molde de uma vez — e `tools/gate/context.mjs` o substitui **em memória** por um id sintético para validar o
molde como módulo real (`ADR-006`); mexer nele durante qualquer uma das ondas de vocabulário contaminaria o
isolamento de eixo que garante que cada onda seja migrável isoladamente por um alvo (`ADR-013`, consequência
nº 1). O `ADR-014` foi explícito: *"Ele volta como onda própria ou ADR próprio, com decisão escrita."* Este
é esse ADR.

Medido nesta conversa (`grep -rIo` das quatro formas sobre `specs skills hooks agents commands plugin
README.md`): **450 ocorrências em 152 arquivos** — `<modulo>` 254, `<modulo_snake>` 100, `<MODULO>` 66,
`<Modulo>` 30. É o maior número bruto da campanha, mas — como a seção seguinte explica — é também o eixo de
**menor risco por ocorrência** dela inteira.

**Decisão.** As quatro formas, tradução literal, sem inventar abreviação — a mesma disciplina do `ADR-015`:

| Português (hoje) | Inglês (alvo) |
|---|---|
| `<modulo>` | `<module>` |
| `<MODULO>` | `<MODULE>` |
| `<Modulo>` | `<Module>` |
| `<modulo_snake>` | `<module_snake>` |

Fundamento: `ADR-009` linha 9 já escreve o alvo literalmente (`<MODULE>_DB_URL`, citado desde a redação
original da linha) — este ADR não inventa a forma, fecha a divergência que o `ADR-014` §5 já tinha
**declarado, não escondido**, entre esse exemplo e o marcador real do template (`<MODULO>_`). O marcador é
**andaime**: nome que o padrão Sarak impõe sobre a árvore, não conteúdo do módulo gerado — por isso segue a
régua da árvore (`ADR-009` linha 1/3/9), não a do domínio. O **valor** que ele substitui continua sendo
decisão de quem cria o módulo e continua em português (o `id`: `catalogo`, `propostas`) — este ADR traduz o
molde do carimbo, nunca o carimbo em si.

**Por que o eixo é seguro apesar do tamanho.** As quatro formas vêm **sempre** entre `<` e `>`. Isso as
desambigua de todo o resto da árvore de um jeito que nenhuma onda anterior teve: a Onda 2a tinha confound
entre palavra comum e nome de arquivo (`conformidade.json` × `rótulo = '...: conformidade'`); a Onda 3 tinha
confound entre chave de config e símbolo interno na MESMA grafia (`e.modulo === a.modulo` em
`validate.mjs:24`). Aqui não há grafia compartilhada: `<modulo>` (com delimitador) e `modulo`/`módulo`/
`Modulo` (sem delimitador, palavra corrente da prosa e de símbolos como `listarModulos`,
`caminhoModulo`) são strings **literalmente diferentes** — um `grep -F '<modulo>'` nunca casa a palavra
solta, e vice-versa. É esse fato, medido e não presumido, que justifica ADR e aplicação na **mesma
conversa**: a régua da campanha (`ADR-016`, "nada se renomeia que não esteja num ADR do contrato") continua
valendo — a tabela acima é a decisão escrita —, mas a via seguinte (varredura → classificação → edição) não
precisa de uma segunda conversa para conferir um risco que o delimitador já eliminou. Registrar isto aqui
existe para que a exceção fique como raciocínio, não como atalho: se um eixo futuro não tiver delimitador
igualmente inequívoco, ele volta a exigir duas conversas.

**Os dois substituidores.** Só dois lugares **interpretam** o marcador — leem a string e decidem algo a
partir dela; todo o resto da tabela de 152 arquivos apenas **carrega** o marcador como texto, sem lógica
em cima:

- **`tools/gate/context.mjs:74-83`** (`trocarMarcadores`) — substitui as quatro formas **em memória**, nunca
  grava em disco, para o molde (`_template`) passar pelas mesmas 76 regras que um módulo real (`ADR-006`).
  A ordem hoje é `<modulo_snake>` → `<MODULO>` → `<Modulo>` → `<modulo>` → `<escopo>`.
- **`tools/create-module.mjs:104-117`** (`substituir` + `aplicarMarcadores`) — o scaffold de verdade: grava
  o texto substituído em disco, e a linha 132 (`if (nome.includes('<modulo>')) renameSync(...)`) trata
  **nome de arquivo** como um segundo alvo, separado do conteúdo — hoje sem efeito prático (nenhum arquivo
  do molde tem o marcador no próprio nome, `find bindings -iname "*modulo*"` não devolve nada), mas a
  lógica precisa continuar reconhecendo a forma nova, porque um nome de arquivo com marcador é uma
  possibilidade real do template, só não uma que exista hoje.

**A ordem dos `replaceAll` não importa, e isto é prova, não suposição.** Nenhuma das quatro formas é
substring de outra — `<modulo_snake>` não contém `<modulo>` como substring porque depois de "modulo" vem
`_snake>`, nunca `>` sozinho; `<MODULO>`/`<Modulo>`/`<modulo>` divergem por maiúscula/minúscula, e string
literal em JS é case-sensitive. Verificado nesta conversa com um script que aplica as quatro substituições
em três ordens diferentes (incluindo a canônica) sobre um texto sintético com as quatro formas coladas
umas nas outras — pior caso possível para colisão — e compara os três resultados byte a byte: **idênticos
nas três ordens**. `create-adapter.mjs` **não é um terceiro substituidor** — tem uma única citação em
comentário (`Mesmo uso de \`<Modulo>\` em criar-modulo`, linha 96), texto que acompanha o rename como
qualquer outra prosa, mas nenhuma lógica de substituição de marcador de módulo mora ali (a substituição que
esse arquivo faz é de outro marcador, `<porta>`/`<provedor>`, família diferente).

**`<module_snake>` existe por causa do banco, não por redundância.** `<MODULO>` já cobria a necessidade de
maiúscula (chave de ambiente); `<modulo_snake>` nasceu depois, e o comentário de `create-module.mjs:106-111`
explica por quê: identificador SQL não aceita hífen sem aspas, e a regra `schema-manifesto` cobra
`^[a-z][a-z0-9_]*$` em `data.tables[]`. Sem essa quarta forma, todo `id` kebab-case com hífen
(`nota-fiscal`) nascia com manifesto **impossível de validar** — `tabela-prefixo` exigia `nota-fiscal_` e o
schema proibia o hífen na tabela derivada dele, duas regras do mesmo gate pedindo formas incompatíveis. A
forma alvo (`<module_snake>`) preserva esse motivo: é tradução de idioma sobre um marcador que resolve um
problema real de charset, não ornamento.

**O que fica de fora, nominalmente — para não ser arrastado por analogia:**
- **A palavra `modulo`/`módulo`/`Modulo` sem `<>`** — português corrente na prosa e nos símbolos internos
  de `tools/` (`listarModulos`, `idDaPasta`, `caminhoModulo`, `MARCADORES_GERACAO_ANTIGA`), por `ADR-009`
  linha 4/7. Nenhuma ocorrência sem delimitador entra nesta tabela.
- **`modulos` (sem `<>`) em `skills/meta-adequacao-modular/scripts/diagnosticar_terreno.py`** — nome de
  pasta de uma **geração antiga do template**, vocabulário fechado de `MARCADORES_GERACAO_ANTIGA` e de
  `raizes_de_modulos`/`ler_pastas_de_modulos`. Confundi-lo com o marcador quebraria o diagnóstico da skill
  contra repositórios legados — é detecção de uma convenção que já não existe, não o marcador vigente.
- **`ID_SINTETICO_DO_MOLDE = 'molde'`** e o literal `'Molde'` de `context.mjs:80` — são o **valor** que
  substitui o marcador durante a validação em memória (símbolo e string internos de `tools/`, português por
  `ADR-009` linha 4), não o marcador em si. O que muda em `context.mjs` é a string **procurada**
  (`'<modulo>'` → `'<module>'`, …), nunca a string **usada como substituto**.

**Consequências.**
1. **O contrato final é `ADR-013` + `014` + `015` + `016` + `017` lidos juntos.** Este é o último eixo que
   o `ADR-014` §5 tinha deixado nomeado e pendente; não sobra nenhum eixo de idioma adiado com decisão já
   escrita esperando aplicação.
2. **O que continua aberto depois desta onda, registrado como estado, não como decisão:**
   - **O 4º eixo** — símbolos estruturais do esqueleto em português que não derivam de porta nem de
     marcador (`ConfigSeguranca`, `ConfiguracaoModulo`, `DependenciasModulo`, `ContextoDaBorda`, `ErroApi`,
     `CODIGOS_DE_ERRO`, `ManifestoDescoberto`, `ErroPorta`, `Pagina`, `CodigoErro`, `RegistroDoMolde`,
     `ModuloParaAdapter`, `DadosDoManifesto`, `ContextoDeTabela`, …) — ordem de grandeza ~33 símbolos,
     ~389 ocorrências (treze símbolos já nomeados pelo `ADR-016` somam 171 ocorrências medidas nesta
     conversa; a lista completa seguiria a mesma disciplina de varredura das ondas anteriores, não medida
     exaustivamente aqui). Nenhum ADR do contrato os lista.
   - **Os valores de `ports.json`** (`"sistema"`, `"padrao"`) e as chaves de provedor correspondentes em
     `FABRICAS` — são ids de adapter, não vocabulário de porta nem marcador; nenhum ADR os lista (`ADR-016`
     já registrou o mesmo para os nomes de porta).
   - **`$comentario` como chave** nos `tools/gate/schemas/*.json` — questão aberta desde o `ADR-015`,
     carregada adiante sem solução aqui.
   - **~22 nomes de função/símbolo em Python que incorporam "modulo" sem `<>`** — candidatos ao 4º eixo se
     ele um dia abrir (`raizes_de_modulos`, `criar_modulos`, `avaliar_id_modulo`, … — a varredura desta
     conversa achou dez definições de função nessa forma; o número maior citado na abertura desta conversa
     não foi reproduzido de forma exaustiva aqui e fica para quem abrir esse eixo confirmar por conta
     própria, mesma disciplina de não inventar contagem que as ondas anteriores já seguem).
3. **A definição de pronto** é a mesma das ondas anteriores — gate tests + self-tests verdes —, **mais o
   smoke test end-to-end** (`create-project.mjs` → `create-module.mjs` → grep de resíduo `<module` no
   destino → `validate.mjs --todos`) como prova de que os dois substituidores continuam produzindo módulo
   sem marcador residual, porque é o único dos cinco ADRs desta campanha cujo mecanismo central roda em
   memória, não é conferível só lendo arquivo.

---

## ADR-018 — Os símbolos estruturais do esqueleto: o eixo que fecha a campanha de idioma

**Status:** 🟢 Aceito

**Contexto.** `ADR-009` linha 3 manda todo símbolo do esqueleto (`bindings/**`) para o inglês; linha 4 isenta
só o que mora **dentro de** `tools/`/`tests/`; linha 6 isenta ids de regra; linha 10 protege o domínio do
módulo de exemplo. `ADR-016` item 3 já batizou este conjunto de **4º eixo** ao excluir `ErroPorta`/`Pagina`/
`CodigoErro` da Onda 3, e `ADR-017` consequência nº 2 o deixou nomeado e pendente. Este ADR fecha a
campanha de idioma: depois dele não sobra eixo com decisão escrita esperando aplicação.

**A régua, e por que ela é mais arriscada que as seis anteriores.** Nas ondas de porta e de marcador, um
delimitador (`<>`) ou uma fonte única (`ports-vocabulary.mjs`) faziam a classificação quase mecânica. Aqui
não há delimitador: o que decide se um símbolo entra é a **raiz do nome**, julgada caso a caso.

| Raiz | Natureza | Ação |
|---|---|---|
| `Registro`, `Pagina`, `Colecao`, `Situacao` | domínio do módulo de exemplo (`ADR-009` linha 10) | **fica em português** — e tudo que os contém: `NovoRegistro`, `LinhaRegistro`, `RegistroDoMolde`, `_RegistroDoMolde`, `_PaginaDoMolde` |
| `Configuracao`, `Dependencias`, `Opcoes`, `Contexto`, `Manifesto`, `Erro`, `Codigo`, `Nivel`, `Raiz`, `Adapter` | estrutural — o esqueleto (`ADR-009` linha 3) | **vai para o inglês** |

Contagem de rastro nos seis símbolos de domínio, medida nesta conversa (`grep -rIo -w`, fora de
`decisoes.md`) — **baseline que a aplicação não pode mudar**: `Registro` 86/33, `Pagina` 27/12,
`NovoRegistro` 13/7, `Colecao` 4/2, `Situacao` 7/5, `LinhaRegistro` 3/1 (ocorrências/arquivos); mais
`RegistroDoMolde` 9/2, `_RegistroDoMolde` 9/2, `_PaginaDoMolde` 7/2. Os números do prompt que abriu esta
conversa eram o ponto de partida, não a verdade — a varredura vale mais que a estimativa, mesma disciplina
de todas as ondas anteriores.

### 1. A tabela — 24 símbolos renomeados, 4 excluídos por decisão fundamentada

**Forma de tradução: preservar a posição das partes, não normalizar para ordem inglesa idiomática —
com uma exceção grafada abaixo.** `ConfigSeguranca` vira `ConfigSecurity`, não `SecurityConfig`: o prefixo
`Config` já é compartilhado com `ConfigApi`, símbolo irmão que **já está em inglês** e que nenhum ADR
autoriza tocar — normalizar a ordem só de `ConfigSeguranca` quebraria o agrupamento visual que os dois
nomes formam hoje (`ConfigApi`, `ConfigSecurity`, ambos localizáveis pelo mesmo prefixo). A mesma lógica
não se estende a compostos que não compartilham essa família de prefixo com nada existente: onde a ordem
portuguesa produziria inglês agramatical (`ManifestoDescoberto` → `ManifestDiscovered` não é inglês;
`AdapterPendente` → `AdapterPending` também soa estranho como nome de classe), o alvo usa a ordem
gramaticalmente correta (`DiscoveredManifest`, `PendingAdapter`) — uma tradução que produz inglês quebrado
não preserva nada, só transporta o erro. E para as classes que **estendem `Error`/`Exception`**, o alvo
segue a convenção universal da própria linguagem (sufixo `Error`: `ApiError`, `ValidationError`), pela
mesma razão que `<modulo_snake>` (`ADR-017`) seguiu a convenção do SQL — não é estilo, é o formato que a
linguagem-alvo exige para o tipo de símbolo que é.

**Erros:**

| Símbolo | Ocorrências medidas | Alvo |
|---|---|---|
| `ErroApi` | 27 | `ApiError` |
| `ErroDeValidacao` | 9 | `ValidationError` |
| `ErroDeGateway` | 5 (+2 citação) | `GatewayError` |
| `ErroPorta` | 3 | `PortError` |
| `CodigoErro` | 2 | `ErrorCode` |
| `CODIGOS_DE_ERRO` | 3 | `ERROR_CODES` |
| `CODIGOS` | 3 | `CODES` |
| `Nivel` | 3 | `Level` |

**Config e manifesto:**

| Símbolo | Ocorrências medidas | Alvo |
|---|---|---|
| `Manifesto` | 8 reais (TS só — JS/Python usam `dict`/objeto solto, sem tipo nomeado) | `Manifest` |
| `DependenciasModulo` | 11 arquivos | `ModuleDependencies` |
| `ManifestoDescoberto` | TS só (composition.ts) + 2 citações (doutrina, `tools/create-adapter.mjs`) | `DiscoveredManifest` |
| `ConfiguracaoModulo` | TS + Python (JS não tem) | `ModuleConfiguration` |
| `ModuloParaAdapter` | TS só (adapter Postgres) | `ModuleForAdapter` |
| `ConfigSeguranca` | TS só | `ConfigSecurity` |
| `ContextoDaBorda` | Python só | `EdgeContext` |
| `RaizAsgi` | Python só | `AsgiRoot` |
| `OpcoesModulo` | TS só | `ModuleOptions` |
| `AdapterPendente` | Python (`_adapter/__init__.py`) + valor de `NOME_GENERICO.python` em `tools/create-adapter.mjs` | `PendingAdapter` |

**A dívida do `ADR-010` — corrigida, não copiada do prompt que abriu esta conversa.** O prompt listava sete
símbolos como "a dívida" (`createDenyingAuth`, `AuthQueNega`, `resolveAuth`, `authentication`, `createAuth`,
`resolve_auth`, `AuthDeTeste`). A leitura de `ADR-010` (linhas 269-275, carregadas adiante pelo `ADR-013`)
diz, textualmente, que existem **duas declarações independentes**: a porta plugável (hoje `tokenVerifier`) e
*"a auth da fiação... injetada em todo `createApp` via `resolveAuth()`"* — a interface fixa de
`api/src/middlewares/index.ts` (TS/JS) e de `core/ports/__init__.py` (Python), **sempre a mesma
implementação, nunca escolhida por módulo**, que o próprio `ADR-010` deixou **de fora** da renomeação de
propósito. Conferido símbolo a símbolo contra o código real:

| Símbolo | O que retorna/consome | É a porta (`TokenVerifier`)? | Ação |
|---|---|---|---|
| `createDenyingAuth` | `TokenVerifier` (adapters/memory, TS/JS) | sim | renomeia → `createDenyingTokenVerifier` |
| `AuthQueNega` | `TokenVerifier` (adapters/memory, Python) | sim | renomeia → `DenyingTokenVerifier` |
| `resolveAuth` | `TokenVerifier` (composition.ts/js) | sim | renomeia → `resolveTokenVerifier` |
| `resolve_auth` | `TokenVerifier` (composition.py, via `AuthQueNega`) | sim | renomeia → `resolve_token_verifier` |
| `authentication` | recebe `Auth` (a interface FIXA de middlewares) | não | **fica** |
| `createAuth` | devolve `Auth` (fixture de teste de contrato, TS/JS) | não | **fica** |
| `AuthDeTeste` | implementa `Auth` (fixture de teste de contrato, Python) | não | **fica** |
| `Auth` (interface/Protocol) | a auth fixa em si — nunca foi `verificadorDeToken`/`tokenVerifier` | não | **fica** |

Renomear os quatro de baixo colapsaria a distinção que o `ADR-010` existe para proteger — os dois lados têm
o mesmo método (`verify(token)`) por coincidência estrutural, e é exatamente essa coincidência que o
`ADR-010` avisa para não confundir. Alinhar `authentication`/`createAuth`/`AuthDeTeste`/`Auth` ao nome da
porta seria repetir, em sentido inverso, o próprio erro que motivou aquele ADR.

**Privados Python** (`bindings/python/root/verify.py`, esqueleto — `ADR-009` linha 3, não `tools/`):

| Símbolo | Alvo |
|---|---|
| `_despachar_modo` | `_dispatch_mode` |
| `_recusar_desconhecidas` | `_reject_unknown` |

**O que fica de fora desta tabela, nominalmente:**
- **`DadosDoManifesto`, `ContextoDeTabela`** (adapter Postgres, TS) — claramente estruturais pela régua, mas
  **não estavam na lista que abriu esta conversa**; nenhum ADR os comissiona. Registrados aqui para a
  próxima onda não os redescobrir do zero, não renomeados nesta.
- **Chaves de `CODIGOS`/`CODIGOS_DE_ERRO`** (`VALIDACAO`, `NAO_AUTENTICADO`, …) — os CONTÊINERES mudam de
  nome, as chaves não: não estavam na lista, e mensagem/vocabulário de erro tem argumento próprio para
  ficar português (`ADR-009` linha 7) que este ADR não reabre.
- **`NIVEIS`, `OpcoesLogger`** (logger.ts) — vizinhos de `Nivel`, fora da lista comissionada.

### 2. Os três itens miúdos do `ADR-016` item 5

**Valores de `ports.json` e chaves de provedor em `FABRICAS`.** **Entram**, só os dois que a Onda 3 deixou
pendurados: `"sistema"` → `"system"`, `"padrao"` → `"default"`, nos três `config/ports.json` e nas chaves
correspondentes de `FABRICAS` em `composition.*`. Seleciona exatamente as fábricas que a Onda 3 renomeou
(`SystemClock`, `DefaultIdGenerator`) — hoje o arquivo mais lido de todo módulo tem a chave em português
apontando para uma classe em inglês. **Não entram** (não comissionados, mesma disciplina): os provedores
`memoria`/`memory`/`postgres` — inclusive a divergência TS/JS (`memoria`) × Python (`memory`) já registrada
na Onda 3, que continua sendo achado, não decisão desta conversa.

**`$comentario` como chave, nos 9 `tools/gate/schemas/*.json`.** **Entra**, vira `$comment`. Conferido
`tools/gate/schema.mjs:80-85`: o validador só pula chave **`_`-prefixada** (`chave.startsWith('_')`) ao
checar `additionalProperties` do **dado validado** — `$comentario` mora no **próprio arquivo de schema**,
nunca no dado, e o leitor de schema (`schema.mjs`) só lê palavras-chave nomeadas (`type`, `properties`,
`required`, `additionalProperties`, …) por acesso direto de propriedade; uma chave extra no documento de
schema, com qualquer nome, é inerte para ele. Renomear é seguro por construção, não por sorte. O argumento
que decide é `$comment` ser a **palavra-chave padrão do próprio JSON Schema** — mais forte que qualquer lado
do `ADR-009` em disputa, porque não é escolha de vocabulário Sarak, é o nome que o formato já usa.
`tools/generate-port-schemas.mjs:47` (que GERA `config-ports.schema.json`) muda junto — o símbolo
`COMENTARIO_CONFIG_PORTAS` fica (é `tools/`), só a chave que ele escreve vira `$comment`.

**~22 nomes de função de teste em Python que incorporam "modulo"/domínio como identificador.** **Ficam em
português.** São descrição de comportamento que a sintaxe do Python força a virar símbolo
(`test_recusa_titulo_vazio`); os equivalentes em TS/JS são strings dentro de `it('recusa título vazio')`,
prosa livre pela mesma régua que já protege mensagem e erro de runtime (`ADR-009` linha 7). Traduzir só o
lado que a linguagem obrigou a virar identificador inverteria o critério — o TS/JS continuaria narrando o
comportamento em português, e só o Python passaria a fazê-lo em inglês, pelo acidente de sintaxe, não por
decisão. Registrado como decisão, para não reabrir a cada leitura futura.

### 3. Consequências

1. **O contrato final da campanha de idioma é `ADR-013` a `018`, lidos juntos.** Não sobra eixo nomeado e
   pendente — o que sobrar depois desta onda (item 4 abaixo) é fronteira nova, não dívida represada.
2. **A campanha de idioma fecha aqui.** As seis ondas (`013`–`018`) tratam o mesmo objeto — o vocabulário do
   template — sob o mesmo princípio (`ADR-009`: árvore em inglês, conteúdo em português) e a mesma
   disciplina (nada se renomeia sem ADR do contrato, medição antes de aplicação, texto que cita acompanha o
   rename). Trabalho de nomenclatura depois disto é eixo **novo**, com ADR **próprio**.
3. **Aberto, registrado como estado:** `DadosDoManifesto`/`ContextoDeTabela` (achado, item 1); os
   provedores `memoria`/`memory`/`postgres` de `ports.json` (achado da Onda 3, ainda parado); e qualquer
   símbolo estrutural fora da lista comissionada que uma varredura futura, dedicada, venha a achar — este
   ADR não afirma exaustividade sobre o 4º eixo inteiro, só sobre os 24 símbolos que decidiu.

---

## ADR-019 — O encerramento da campanha de idioma: o que fica em português, e por quê

**Status:** 🟢 Aceito

**Contexto.** Sete eixos aplicados (`ADR-013` a `018`), ~2.000 ocorrências, gate verde em todas as ondas.
Ao varrer o fim da campanha apareceram dois conjuntos que **não** entraram em nenhum dos sete: os
identificadores locais dentro de `bindings/**` (item 3.1) e as chaves de npm script dos `package.json` de
TS/JS (item 3.2). Este ADR existe para que os dois sejam **decisão registrada**, não resto — para que a
próxima leitura não os confunda com esquecimento. Fecha também o único item que o `ADR-018` deixou aberto
por não comissionamento: `DadosDoManifesto`→`ManifestData` e `ContextoDeTabela`→`TableContext`
(`bindings/typescript/root/adapters/postgres/index.ts`), estruturais pela mesma régua do `ADR-018`
(raiz `Dados`/`Contexto`), aplicados nesta conversa.

### 3.1 Identificadores locais dentro de `bindings/**` — **fechado: ficam em português**

`caminho`, `manifesto`, `modulo`, `resposta`, `pagina`, `valor`, `linha`, `texto`, `entrada`, `saida`,
`limite`, `prefixo`, … Medido nesta conversa (`grep -rIo -w`, sobre `specs/_estrutura_modulos/bindings/`,
doze identificadores amostrados): **1.591 ocorrências**; `modulo` sozinho, **550**. O eixo inteiro passa
dos milhares — mais que toda a campanha somada (`ADR-013` a `018` juntos mediram, ao longo das sete
ondas, pouco acima de 2.000 ocorrências no total).

Três motivos, em ordem de força:

1. **Não é árvore.** `ADR-009` linha 3 fala em *"**funções** do esqueleto"*, e as funções **já estão em
   inglês**: `createRepository`, `discoverModules`, `readData`, `tableContext`, `verifyRoutesUnique`, e as
   24 do `ADR-018`. O que sobrou é o **corpo** das funções — os nomes de parâmetro e de variável local — e
   o princípio do `ADR-009` é literal: *"a árvore de arquivos é inglês; o conteúdo dela é português"*. Um
   parâmetro chamado `modulo` dentro de uma função chamada `discoverModules` não é meio-traduzido: é a
   fronteira exata que o princípio desenha, aplicada até o fim.
2. **Nada depende disso.** Nenhuma regra do gate lê nome de variável local — as 76 regras leem estrutura de
   arquivo, forma de import, padrão de texto, nunca identificador de escopo de função. Nenhum grep de
   isolamento (`portas-pura`, `adapter-isolado`, `sdk-fornecedor`) depende de nome de parâmetro. A extração
   de módulo (`ADR-001`) não muda uma vírgula: o que viaja na extração é arquivo e import, nunca o nome que
   uma variável tem dentro de uma função.
3. **O custo é maior que o da campanha inteira, e o benefício é estético.** As sete ondas já fechadas
   somaram ~2.000 ocorrências e cada uma tinha um motivo funcional escrito — vocabulário de porta lido por
   `config/ports.json`, marcador interpretado por dois substituidores, símbolo estrutural citado em prosa.
   Este eixo sozinho é maior que a soma das sete, e nenhuma ocorrência dele é lida por máquina nenhuma. É o
   inverso exato do critério que abriu a campanha.

**O que isto NÃO autoriza.** Nome de função, tipo, classe, constante exportada e chave de config
**continuam** em inglês — são os `ADR-013` a `018`, e nenhum deles é revisto aqui. A fronteira é
**corpo × superfície**, não "português onde der": um identificador que a régua da campanha já mandou para
o inglês (porque é lido por regra, ou porque é nome de função/tipo/constante exportada) permanece em
inglês mesmo que pareça "só uma variável a mais" — a régua é a natureza do símbolo, nunca a impressão de
quem lê.

### 3.2 Chaves de npm script — **aberto, com o enquadramento**

`validar`, `validar:env`, `validar:schemas`, `criar-modulo`, `tipos`, `formato`, `ci:cobertura`,
`ci:seguranca`, `ci:dependencias`, `start:autoteste` — nos `package.json` de TypeScript e JavaScript.

**A favor de traduzir:**
- É a **superfície de CLI que o dev digita** (`npm run validar`) — exatamente o argumento que `ADR-009`
  linha 5 já usa para os nomes de arquivo de `tools/`: é "o que o dev digita todo dia", não conteúdo.
- **O template já se contradiz consigo mesmo.** `verify`/`start` (raiz, script `verify.py`/binário `node`)
  convivem com `validar`/`criar-modulo` no mesmo `package.json`; `ci:seguranca` chama `ci-security.mjs`
  (arquivo em inglês, chave em português, mesmo padrão de confound que a Onda 2a já corrigiu uma vez para
  nome de arquivo).

**Contra:**
- Não está em nenhuma das onze linhas da tabela do `ADR-009` — a régua nomeia "nome de arquivo dentro de
  `tools/`" (linha 5) e "chaves do manifesto" (linha 8), nunca "chave de `scripts` de `package.json`". Um
  ADR que decidisse aqui estaria estendendo a régua por analogia, não aplicando uma linha existente.
- O raio medido nesta conversa **não é um `package.json`**: `tools/verify-commit.mjs` (o motor de
  `.githooks/pre-commit`/`pre-push`) chama `npm run formato`/`npm run tipos` por **string literal**;
  `doutrina/03-operacao.md` cita os comandos em prosa; `config/verification.json` e o schema que o valida
  carregam o vocabulário de política (`ci:cobertura` etc.); `tests/template-self-test.mjs` monta o pipeline
  de CI do autoteste em cima dos mesmos nomes. Medido: ~32 arquivos citam pelo menos uma das dez chaves,
  entre `tools/`, doutrina e os `package.json` dos dois bindings — não é edição de um arquivo, é reabrir
  uma onda.

**A decisão é do dono, como foi a do marcador** (`ADR-014` §5): registrado aqui para não desaparecer, sem
decisão fingida nenhuma dos dois lados.

### 3.3 Consequências

1. **A campanha de idioma está encerrada.** Contrato final: `ADR-013` a `019`, lidos juntos.
2. **O que ficar em português a partir daqui está declarado em 3.1, ou aberto em 3.2 — nada mais.** Um
   símbolo em português achado fora dessas duas listas, depois deste ADR, é achado novo — não presuma que
   já foi decidido aqui.
3. **A régua para quem chegar depois, numa frase:** superfície em inglês, corpo em português — e
   "superfície" é o que o `ADR-009` **enumera**, não o que parece técnico. `modulo` como nome de parâmetro
   parece técnico e fica português; `criar-modulo` como chave de `scripts` parece prosa e é candidato a
   ir — a aparência engana nos dois sentidos, só a enumeração do `ADR-009` decide.

---

## ADR-020 — A superfície de CLI do template vai para o inglês: o §3.2 do ADR-019, decidido

**Status:** 🟢 Aceito

**Contexto.** `ADR-019` §3.2 registrou as chaves de npm script como **aberto**, com os dois lados escritos
e nenhuma decisão tomada. Este ADR é essa decisão — a última da campanha de idioma. Junto com ela, duas
descobertas da varredura desta conversa que também são superfície de CLI e nenhum ADR anterior cobriu:
as **flags** das ferramentas do template (dezessete candidatas, quinze efetivamente do template) e
`module.json:ui.modo`, chave de manifesto que `ADR-009` linha 8 já manda para o inglês e que escapou de
todas as oito ondas anteriores porque a régua descrevia o alvo e ninguém conferiu o estado real da árvore.

**Escopo, por decisão do dono:** só `specs/_estrutura_modulos/`. `skills/`, `agents/`, `commands/`,
`hooks/`, `README.md`, `CLAUDE.md`, `.github/` ficam de fora — mesmo onde citam a CLI que este ADR renomeia.
A consequência dessa fronteira está no item 4, com número.

### 1. Chaves de npm script

| `scripts` da raiz (PT) | Alvo | `scripts` do módulo (PT) | Alvo |
|---|---|---|---|
| `validar` | `validate` | `validar` | `validate` |
| `validar:env` | `validate:env` | `validar:extracao` | `validate:extraction` |
| `validar:schemas` | `validate:schemas` | `tipos` | `typecheck` |
| `criar-modulo` | `create-module` | `cobertura` | `coverage` |
| `tipos` | `typecheck` | `cobertura:conferir` | `coverage:check` |
| `formato` | `format` | `test:observar` | `test:watch` |
| `ci:cobertura` | `ci:coverage` | | |
| `ci:seguranca` | `ci:security` | | |
| `ci:dependencias` | `ci:dependencies` | | |
| `start:autoteste` | `start:selftest` | | |

Conferido contra os quatro `package.json` (`bindings/{typescript,javascript}/{root,_template}/`): as dez
chaves da raiz e as seis do módulo existem exatamente como acima, mais as chaves-comentário que as
documentam (`"//tipos"`, `"//ci:cobertura"`, `"//ci:seguranca"`, `"//formato"`, `"//start:autoteste"`,
`"//cobertura"` — a convenção `//<chave>` do template) e a cadeia `"verify": "npm run validar && npm run
validar:env && npm run validar:schemas && npm run formato && npm run lint && npm run tipos && npm test"`,
que cita quatro das dez por nome dentro do próprio valor. `criar-modulo`/`cobertura`/`cobertura:conferir`
seguem para inglês pela mesma decisão — não são chaves diferentes, são a mesma superfície.

**O argumento que decide, e é o mais forte:** o template já se contradiz consigo mesmo. `verify`/`start`/
`test`/`build`/`lint`/`migrations` estão em inglês no mesmo `package.json` que `validar`/`criar-modulo`;
`ci:contract`/`ci:lint` convivem com `ci:seguranca`, que chama `ci-security.mjs` — arquivo que a Onda 2a já
traduziu, deixando a chave para trás. Um `package.json` bilíngue por acidente é exatamente a "fronteira
implícita" que o `ADR-009` abre dizendo que existe para evitar.

### 2. Flags de CLI das ferramentas

Levantadas em `specs/_estrutura_modulos/` inteiro (tools, tests, `verify.py`) e conferidas quanto a quem
de fato **define** cada uma — mais de uma flag tem definição **independente** em ferramentas diferentes, e
duas das dezessete propostas não pertencem ao template:

| Flag (PT) | Alvo | Definida em | Nota |
|---|---|---|---|
| `--todos` | `--all` | `validate.mjs` | |
| `--conferir` | `--check` | `sync-env.mjs`, `generate-lint-config.mjs`, `generate-port-schemas.mjs`, `verify-map.mjs`, `verify-catalog.mjs` | **cinco** definições independentes, mesma flag |
| `--conferir-vocabulario` | `--check-vocabulary` | `verify-catalog.mjs` | |
| `--extracao` | `--extraction` | `validate.mjs` | |
| `--forcar` | `--force` | `create-project.mjs` | ver item 4 — quebra downstream real, não só citação |
| `--sem-web` | `--no-web` | `create-module.mjs` | |
| `--sem-artefato` | `--no-artifact` | `create-module.mjs` | |
| `--rapido` | `--fast` | `template-self-test.mjs`, `verify.py` | duas definições independentes |
| `--escopo` | `--scope` | `create-project.mjs` | |
| `--raiz` | `--root` | `affected.mjs` | **não** confundir com `resultado.raiz`/`raiz` local (booleano "toca a raiz", sem relação) — fica intocado |
| `--seguranca` | `--security` | `verify.py` | |
| `--cobertura` | `--coverage` | `verify.py` | |
| `--dependencias` | `--dependencies` | `verify.py` | |
| `--desde` | `--since` | `ci-security.mjs`, `contract-compatible.mjs`, `affected.mjs` | três definições independentes |
| `--manter` | `--keep` | `template-self-test.mjs` | |
| `--destino` | `--target` | `generate-lint-config.mjs` | **não** confundir com `destino`/`opcoes.destino` de `create-project.mjs` — ali é posicional, nunca veio de `--destino`; fica intocado |

**`--modulos` fica fora da tabela — não é flag do template.** Nenhuma ferramenta de
`specs/_estrutura_modulos/` a define; ela pertence a `skills/meta-iniciar-repositorio/scripts/init_repo.py`
e a `skills/meta-adequacao-modular/scripts/diagnosticar_terreno.py`, os dois fora de escopo. As duas
citações que a varredura achou dentro do template (`tools/create-module.mjs`, comentário citando o
vocabulário de `init_repo.py`; `tests/verify-routine.mjs`, teste que invoca `init_repo.py` de propósito
para testar rejeição) são sobre o script **externo** — tocá-las quebraria a citação, não a corrigiria.

Flags já em inglês (`--json`, `--role`, `--binding`, `--redact`, `--migrations`, `--check`, `--version`) e
flags **de terceiros** (`--if-present`, `--no-fund`, `--cov-fail-under`, `--name-only`, `--abbrev-ref`, …)
não entram — as últimas nem são nossas para renomear.

### 3. `--autoteste` — fica, e o motivo é mecânico, não estético

`tests/run-all-selftests.mjs` **descobre** os arquivos verificáveis varrendo por essa flag literal. Dos 25
que ele encontra hoje, quatro são scripts de **skill**, fora do template
(`diagnosticar_terreno.py`, `audit_base.py`, `scan_segredos.py`, `validate.py` de `padrao-python`) — a
linha 11 do `ADR-009` já classifica nome de skill como fora de escopo, e o mesmo vale para a **convenção**
que os liga ao descobridor. Renomear `--autoteste` só no template quebraria a descoberta desses quatro
(o descobridor buscaria uma string que eles não têm); renomeá-la também nas skills sairia do escopo desta
conversa. Fica em português nos dois lados — é a mesma disciplina do `ADR-009` linha 4, aplicada a uma
convenção de descoberta em vez de um símbolo.

### 4. `module.json:ui.modo` — a chave de manifesto que escapou

`ADR-009` linha 8 põe toda chave de manifesto em inglês; as outras dezoito (`basePath`, `requiredEnv`,
`generatesArtifact`, `data.prefix`, `navigation.icon`, …) já estavam. `ui.modo` não — a régua descrevia o
alvo, e nenhuma das oito ondas conferiu essa chave especificamente contra a árvore real.

**Decisão, com os valores:** `ui.modo` → `ui.mode`. Os dois valores do enum são vocabulário estrutural, e
`ADR-009` linha 8 já resolveu esta classe: *"enum de valor estrutural... segue a mesma tradução da pasta
homônima — é o mesmo conceito, não uma exceção"* (o precedente é `role: domain|gateway|connector`). Decidido
símbolo a símbolo: `"proprio"` → `"own"`; `"kit"` fica — já é inglês (é literalmente "kit de UI").

Alcança: os três `_template/module.json` (`"ui": {"modo": "proprio"}`), `module.schema.json`
(`required: ["modo"]` + `properties.modo.enum`), as cinco linhas de `tools/gate/rules/isolation.mjs` que
citam `ui.modo` em comentário ou mensagem de achado (13, 82, 436, 446 — que também cita `"proprio"` no
texto —, 552; a **leitura de propriedade** de verdade é só `ctx.manifesto?.ui?.modo` na linha 289), e a
doutrina (`00-arquitetura.md`, `01-modulo.md` §7, `04-regras.md` — catálogo e §7.2).

**`ui.pacote` fica de fora, nominalmente.** Mesma classe de chave, mesma régua — mas não foi comissionada
nesta conversa. Registrado para a próxima varredura não o redescobrir do zero, não renomeado aqui.

### 5. O custo desta decisão de escopo — a dívida, com números

O dono decidiu corrigir **só o template**. Medido nesta conversa (`grep -rIo` em `skills/`, `agents/`,
`commands/`, `README.md`, sete termos amostrados): **57 citações** ficam obsoletas — `--todos` 20,
`--forcar` 16, `--extracao` 8, `--conferir` 5, `--sem-artefato` 4, `criar-modulo` 4, `--rapido` 0 (a única
das sete sem citação fora do template). O número do prompt que abriu esta conversa (~59) era estimativa; a
varredura vale mais.

**Um achado mais sério que citação obsoleta, e o mais importante deste item:**
`skills/meta-iniciar-repositorio/scripts/init_repo.py:301` faz `comando.append("--forcar")` para repassar a
flag a `create-project.mjs` quando o usuário autoriza sobrescrever. `create-project.mjs` lê a flag por
`brutos.includes('--forcar')` — depois desta onda, `'--forcar'` nunca mais aparece em `brutos`, e a
checagem **falha para `false` em silêncio**, nunca lança erro. `meta-iniciar-repositorio` continua rodando,
sem avisar, e o `--forcar` que o usuário autorizou deixa de sobrescrever qualquer coisa — exatamente o
"verde indistinguível de não verificou" que `04-regras.md` §7 existe para proibir, só que na direção
inversa (silêncio onde devia haver ação). **Não é corrigível nesta conversa** (o arquivo é de skill, fora
do escopo) — fica registrado para quem reabrir `meta-iniciar-repositorio` coordenar as duas pontas.

**Duas convenções de CLI passam a coexistir no ecossistema**: o template dirá `--all`/`--check`/`--force`;
`diagnosticar_terreno.py`, `audit_base.py` e as demais skills continuam dizendo `--todos`/`--conferir`/
`--forcar`. Nenhum verificador pega a divergência — `ponteiros.py` (`meta-verificacao-base`) resolve
**caminho de arquivo**, nunca flag de CLI dentro de um comando citado em prosa.

### 6. Consequências

1. **A campanha de idioma se encerra aqui.** Com esta onda, **toda linha da coluna inglês da tabela do
   `ADR-009` está satisfeita** — as onze categorias, conferidas: 1/3/5/8/9 (árvore/função/arquivo de
   `tools/`/manifesto/env) em inglês de fato; 2/4/6/7/10 (doutrina, símbolo de `tools/`, id de regra,
   mensagem, domínio/dados) em português por decisão escrita; 11 fora de escopo. O que restar em português
   depois desta onda está na coluna portuguesa do `ADR-009`, fechado no `ADR-019` §3.1, ou nominalmente
   registrado como aberto (`ui.pacote`, item 4; provedores de `ports.json`, `ADR-016`/`018`; `$comentario`
   já fechado no `ADR-018`).
2. **`ADR-019` §3.2 deixa de estar aberto.** A tabela do item 1 é a decisão que faltava.
3. **A dívida do item 5 é declarada, não escondida** — em particular a quebra funcional de
   `init_repo.py:301`, que precisa de coordenação (não conserto silencioso) no dia em que
   `meta-iniciar-repositorio` for revisitada.
