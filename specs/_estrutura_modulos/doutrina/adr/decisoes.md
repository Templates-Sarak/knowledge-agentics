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
árvores diferentes — e uma delas pode trazer CVE nova sem ninguém ter decidido nada (medido, Bloco P,
plan-2.md: `vitest`/`vite` presos a `^2`/`^5` chegaram a nascer com 1 critical + 1 high + 3 moderate, exigindo
salto de major para sair — `npm audit fix` sozinho não resolve breaking change).

**Decisão.** Toda dependência do esqueleto (`package.json` da raiz e do `_template`, `pyproject.toml`) é
**pinada exata** — sem `^`, sem `>=`. A versão é decisão do padrão, tomada e datada, nunca do relógio.
Quem sobe a versão é o **template**, nunca o projeto gerado: `tools/generate-port-schemas.mjs` já
estabeleceu o precedente de "gerado, não escrito à mão" para config mecânica; aqui a mesma disciplina vale
para número de versão. O sensor de envelhecimento é `ci:dependencias`/`verificar.py --dependencias`, que
agora roda **dentro do Bloco K** (D2, plan-2.md — só entrou depois que este ADR fechou a cadeia, para o K não
nascer vermelho por CVE de terceiro): CVE nova em qualquer binding derruba o `knowledge-agentics` na sua
própria agenda, nunca o projeto de quem já gerou o dele. A cadência é *quando o K acender*, não calendário —
uma CVE que não afeta versão nenhuma do pin atual não exige nada.

**O procedimento do bump**, sempre nesta ordem: `npm outdated`/`npm audit`/`pip-audit` apontam o alvo →
sobe a versão fixada nos `package.json`/`pyproject.toml` do esqueleto → `npm run autoteste:template` (ou
`node specs/_estrutura_modulos/tests/template-self-test.mjs`) nos três bindings → **verde** vira commit datado
aqui; **vermelho** e a versão não entra, com o motivo escrito na tentativa. É o que torna o salto de major
barato o bastante para acontecer: sem essa contraprova, a única atualização segura era nenhuma — e foi
exatamente por isso que a cadeia ficou presa a majors antigos até acumular CVE.

**Dois limites, declarados:** pin exato prende o **topo** da árvore, não os transitivos (`esbuild` chega
pelo `vite`, e uma CVE ali só é vista quando `npm audit` a relaciona a um pacote de topo) — quem prende
transitivo é o **lockfile do projeto gerado**, e é por isso que ele é do projeto, não do template (D1,
plan-2.md — sem `workspaces` resolvidos no momento da cópia, um lock copiado descreveria uma árvore que não
é a do destino). E **o template nunca empurra atualização para projeto já criado**: a promessa é *"projeto
novo nasce limpo"*, não *"projeto antigo se mantém limpo"* — a segunda exigiria o template ser dependência
instalada, e ele é cópia por decisão de arquitetura (ADR-005).

**Alternativa descartada.** Manter `^` e versionar lockfile no template. Cai no mesmo problema dos
`workspaces` que ADR-005/D1 já registraram para o lockfile do projeto: o lock do template nasceria descrevendo
uma árvore que ainda não existe no destino, e devolveria ao relógio uma decisão que é do padrão.

**Consequências.** Dois projetos gerados com meses de distância recebem a mesma cadeia — e quando divergirem
foi porque alguém decidiu e datou, não porque o `npm install` de terça foi diferente do de quinta. O custo:
subir de major é trabalho de verdade (medido, Bloco P: `vitest` 2→4 exigiu trocar `environmentMatchGlobs`,
removido no Vitest 3+, pela forma `// @vitest-environment jsdom` por arquivo — API antiga, config morta,
sem aviso), mas é trabalho pago **uma vez**, pelo template, sob o K — nunca por cada projeto gerado
separadamente. O `pip` que `python -m venv` instala fica de fora deste pin (não é dependência declarada, é o
gerenciador que cria o ambiente): o conserto é `pip install --upgrade pip` como primeiro passo depois de criar
o venv, documentado nos "próximos passos" que `create-project.mjs` imprime.

**Pendência registrada, fora desta rodada:** `typescript`, `express`, `eslint` e `react` têm majors mais
novos que o pin atual (medido: ts 5→7, express 4→5, eslint 9→10, react 18→19), nenhum deles com CVE aberta —
só `vitest`/`vite`/`@vitest/coverage-v8`/`@vitejs/plugin-react` tinham. Subir os quatro sem CVE é trabalho de
compatibilização real (majors desse tamanho costumam trazer breaking change de verdade), não conserto de
segurança, e fica para uma rodada dedicada — subir todos de uma vez só porque "dá para" contradiz o próprio
critério de cadência deste ADR ("quando o K acender", não "porque o registry tem versão nova").

---

## ADR-009 — O idioma do template: vocabulário técnico em inglês, vocabulário de domínio em português

**Status:** 🟢 Aceito

**Contexto.** O `04-regras.md` §3 já prometia "inglês onde a linguagem ou o framework impõem" — mas o
template usava português em oito pastas estruturais (`modules`, `tools`, `domain`, `ports`, `engine`,
`contract`, `generated`, `mappers`) onde nada na linguagem ou no framework impunha nada: são vocabulário
**estrutural** do próprio padrão Sarak, não do negócio. A pergunta que abriu esta decisão (plan-3.md) —
*"o correto, segundo as boas práticas, não seria em inglês?"* — nasceu olhando `api/src/routes` e
`api/src/mappers` lado a lado na mesma pasta: a mesma árvore misturando os dois vocabulários sem critério
explícito. Uma varredura completa do disco, feita ao redigir esta decisão, achou mais quatro pastas na mesma
situação que a lista inicial não citava: `tools/gate/rules/`, `tests/` (em dois lugares) e
`adapters/memory/` — a mesma categoria, só não tinham sido contadas.

**A boa prática não é "tudo em inglês".** É a distinção clássica: **vocabulário técnico em inglês,
vocabulário de domínio no idioma do negócio**. O erro do template não era usar português — era usá-lo sem
critério, deixando a fronteira implícita e por isso arbitrária.

**O princípio que resolve a fronteira inteira, numa frase:** **a árvore de arquivos é inglês; o conteúdo
dela é português.** "Árvore" é pasta, nome de arquivo, chave de manifesto/config, símbolo do esqueleto —
tudo que é **estrutura** que o padrão Sarak impõe. "Conteúdo" é o que um módulo real guarda dentro dessa
estrutura — texto de negócio, nome de tabela, rota, mensagem ao usuário. `doutrina/`/`specs/arquitetura/` é
a **única exceção** ao princípio (decisão 2 abaixo): não é conteúdo de módulo, é documentação do próprio
padrão, mas o nome é vocabulário do fluxo SDD compartilhado com `_estrutura_base` — renomear sai do escopo
deste template.

**Decisão.** A fronteira, artefato por artefato — onze categorias, cada uma com decisão explícita para que
nenhuma fique arbitrária por analogia:

| # | Artefato | Decisão | Motivo |
|---|---|---|---|
| 1 | Pastas estruturais (12) | **inglês** — `ferramentas→tools` `dominio→domain` `portas→ports` `motor→engine` `contrato→contract` `gerados→generated` `mapeadores→mappers` `modulos→modules` `raiz→root` `regras→rules` `testes→tests` `memoria→memory` | é a árvore — o que se lê em cada import. Lista fechada pela varredura completa do disco, não pelos oito exemplos originais do plan-3.md |
| 2 | `doutrina/` / `specs/arquitetura/` | **português** — **única exceção ao princípio** | é a **documentação**, não conteúdo de módulo nem árvore de código; o nome é vocabulário do fluxo SDD, compartilhado com `_estrutura_base` — renomear sai do template |
| 3 | Funções do **esqueleto** (`bindings/**`) | **inglês** | é o código que o dev escreve todo dia |
| 4 | Símbolos (funções/variáveis) **dentro de** `ferramentas/` (→ `tools/`) | **português** | ferramental vendorizado — o dono é outro repositório. Por isso já é **isento do linter** no projeto gerado: a porta em inglês, a sala em português, e a sala é declarada como não-sua. Vale só para o SÍMBOLO — o arquivo que o contém segue a linha 5 |
| 5 | Nomes de arquivo dentro de `ferramentas/` (→ `tools/`), os ~29 `.mjs` | **inglês** — `criar-projeto→create-project` `validar→validate` `sincronizar-env→sync-env` `escrita→writing` `isolamento→isolation` `contexto→context` … (lista completa no inventário) | é a árvore (linha 1 do princípio), não o conteúdo — a mesma pasta não pode ficar meio inglês, meio português um nível abaixo do que a linha 1 já resolveu. É a superfície de CLI que o dev digita |
| 6 | Ids das 74 regras do catálogo | **português** | id de regra é nome de artigo de lei, e a lei é portuguesa — citado muito mais em prosa (§4.x, §7.2) que em código |
| 7 | Mensagens do gate e erros de runtime | **português** | documentação entregue por código; é a UX do template |
| 8 | Chaves do manifesto (`module.json`, `project.json`) e nome do arquivo | **inglês** — `name` `data` `ports` `requiredEnv` `basePath` … | é config lida por código — árvore, não conteúdo. Enum de valor estrutural (`papel: dominio\|gateway\|conector` → `role: domain\|gateway\|connector`) segue a mesma tradução da pasta homônima (linha 1) — é o mesmo conceito, não uma exceção |
| 9 | Chaves de ambiente | **inglês** — `ROOT_API_PORT`, `<MODULE>_DB_URL` | convenção universal de env |
| 10 | Rotas (`/registros`) e banco (`titulo`, `<mod>_metadados`) | **português** | domínio e dados — conteúdo, não árvore. É a boa prática de DDD, não a exceção |
| 11 | Nomes de skill (`code-modulo`, `cyber-segredos`) | **fora de escopo** | convenção de toda a base Sarak, não do template |

**Dois casos que não são git mv nem rename simples de arquivo, e o inventário precisa marcá-los com um
`tipo` próprio para não confundir com pasta física:**

- **`modules` (linha 1) não é uma pasta que exista na base.** Ela só nasce dentro de um projeto **gerado**
  (`modules/<id>/`); na base, o equivalente é `bindings/<binding>/_template/`. A palavra `modules` aparece
  na base como **string literal** dentro de ferramentas (o que `create-module.mjs` escreve no projeto de
  saída) e como **caminho de exemplo em prosa** na doutrina — nenhuma das duas ocorrências é um `git mv`.
  Tipo de inventário: `simbolo`, resolvido contra o corpus de código real da base — a rodada AB.1 (achado
  do revisor) já garante que esse corpus inclui `.json`/`.yaml`/dotfile, não só `.mjs`/`.ts`/`.py`.
- **`memory` (linha 1) é duas coisas ao mesmo tempo.** É pasta física (`adapters/memoria/` → `adapters/memory/`,
  git mv normal) **e** é nome de provedor citado como **valor de string** em `config/ports.json` e nos
  `switch`/`if` de `FABRICAS` que escolhem o adapter, lado a lado com `postgres`. A pasta segue a linha 1; o
  valor de config é a mesma palavra, mesmo tipo `pasta` — resolve contra o mesmo corpus ampliado pelo AB.1.

**A régua que decide os casos não listados aqui:** se o nome descreve **como o padrão Sarak é construído**
(pasta, arquivo, chave de config, símbolo de código — a **árvore**), é técnico — inglês. Se o nome descreve
**o que o negócio do módulo gerado é** (rota, coluna, tabela, texto de erro voltado ao usuário final — o
**conteúdo**), é domínio — português. Ids de regra e mensagens de gate (6, 7) são o caso que parece árvore e
é conteúdo: citam-se majoritariamente em prosa portuguesa, e mudar o idioma deles trocaria a UX do template
sem ganho de leitura de código — por isso ficam de fora, com o motivo escrito, não por omissão.

**Consequências.** A fronteira deixa de ser arbitrária e vira lei citável (`04-regras.md` §3). O custo é a
campanha do plan-3.md Bloco AD — atômica, porque uma fronteira só decidida em parte volta a ser arbitrária
pela metade que falta. `tools/` (linha 4, só o símbolo) e os ids de regra (linha 6) são as duas
exceções deliberadas dentro de um template majoritariamente inglês na camada técnica — registradas aqui para
que uma futura "limpeza de consistência" não as trate como esquecimento.

**Alternativa descartada.** Tudo em inglês, inclusive domínio/data/rotas. Contradiz a lei de nomes já
vigente (§3: "português no domínio, nas rotas e nos dados") e o próprio ADR-001 — regra de negócio duplicada
por módulo já é português por natureza; traduzir a camada de domínio seria tradução de conteúdo, não rename,
fora do escopo que esta campanha se propôs (plan-3.md, "Fora deste plano").
