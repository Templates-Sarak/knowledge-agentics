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

**Decisão.** `core/portas/` é infraestrutura; `core/gateways/` é outro módulo, exclusivamente HTTP, sempre
declarado em `modulo.json:consome`.

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
seria compartilhar regra de negócio. Contrapartida obrigatória: **toda porta tem variante `memoria`**, senão os
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
Quem sobe a versão é o **template**, nunca o projeto gerado: `ferramentas/gerar-schemas-portas.mjs` já
estabeleceu o precedente de "gerado, não escrito à mão" para config mecânica; aqui a mesma disciplina vale
para número de versão. O sensor de envelhecimento é `ci:dependencias`/`verificar.py --dependencias`, que
agora roda **dentro do Bloco K** (D2, plan-2.md — só entrou depois que este ADR fechou a cadeia, para o K não
nascer vermelho por CVE de terceiro): CVE nova em qualquer binding derruba o `knowledge-agentics` na sua
própria agenda, nunca o projeto de quem já gerou o dele. A cadência é *quando o K acender*, não calendário —
uma CVE que não afeta versão nenhuma do pin atual não exige nada.

**O procedimento do bump**, sempre nesta ordem: `npm outdated`/`npm audit`/`pip-audit` apontam o alvo →
sobe a versão fixada nos `package.json`/`pyproject.toml` do esqueleto → `npm run autoteste:template` (ou
`node specs/_estrutura_modulos/testes/autoteste-template.mjs`) nos três bindings → **verde** vira commit datado
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
o venv, documentado nos "próximos passos" que `criar-projeto.mjs` imprime.

**Pendência registrada, fora desta rodada:** `typescript`, `express`, `eslint` e `react` têm majors mais
novos que o pin atual (medido: ts 5→7, express 4→5, eslint 9→10, react 18→19), nenhum deles com CVE aberta —
só `vitest`/`vite`/`@vitest/coverage-v8`/`@vitejs/plugin-react` tinham. Subir os quatro sem CVE é trabalho de
compatibilização real (majors desse tamanho costumam trazer breaking change de verdade), não conserto de
segurança, e fica para uma rodada dedicada — subir todos de uma vez só porque "dá para" contradiz o próprio
critério de cadência deste ADR ("quando o K acender", não "porque o registry tem versão nova").
