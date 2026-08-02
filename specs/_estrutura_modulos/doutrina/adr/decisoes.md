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
