---
tipo: "doutrina"
titulo: "Arquitetura — Doutrina, Peças e Fronteiras"
status: "🟢 Vigente"
tags: ["arquitetura", "modulos", "doutrina", "hub"]
relacionados: ["[[01-modulo]]", "[[02-contrato-e-dados]]", "[[03-operacao]]", "[[04-regras]]", "[[decisoes]]"]
---

# 1. Propósito

Esta é a primeira lei a ler. Ela responde **o que o sistema é, de que peças é feito e onde estão as
fronteiras** — e roteia para a lei dona de cada assunto.

Um sistema construído sobre este template é uma **federação de módulos autossuficientes**. Cada módulo é uma
fatia vertical completa de um domínio de negócio: dono do próprio front, da própria API, do próprio motor e da
própria fatia de banco. Nenhum depende de código de outro.

Essa independência não é estética. Ela existe para que **qualquer módulo possa ser extraído para
infraestrutura própria sem refactor**: a fronteira física de pastas **é** a fronteira de dependência. Extrair
um módulo é copiar uma pasta e recortar as chaves `<MODULO>_*` do `.env` — não reescrever import.

# 2. As camadas do template

O template tem três camadas, e confundi-las gera duplicação.

| Camada | O que é | Muda por linguagem? |
|---|---|---|
| **0 — Doutrina** | estas leis (`specs/arquitetura/`): anatomia, manifesto, contrato, nomenclatura, catálogo de regras | **Não** |
| **1 — Binding** | `bindings/<linguagem>/` — como a Camada 0 se materializa numa stack | Sim |
| **2 — Referência** | `bindings/<linguagem>/exemplo/` — um módulo que roda e passa no gate | Sim |

A lei é agnóstica de linguagem; a prova é concreta. Regra que só faz sentido numa linguagem **não pertence à
Camada 0** — desce para o binding.

# 3. As quatro peças

Confundir estas peças é a forma mais rápida de destruir a extraibilidade.

## 3.1 Módulo — a fatia vertical

`modules/<modulo>/` contém tudo que o domínio precisa: `contract/`, `config/`, `core/`, `api/`, `web/`,
`database/`, `tests/` e o manifesto `module.json`. A anatomia completa está em [[01-modulo]].

Um módulo tem um **papel**, declarado no manifesto:

| Papel | O que é | Restrição |
|---|---|---|
| `domain` | um domínio de negócio | não pode declarar credencial de serviço externo pago |
| `gateway` | fronteira única de serviços externos pagos | é o **único** que pode declarar essas credenciais |
| `connector` | casca, navegação e agregação cross-módulo | não guarda schema nem regra de negócio de ninguém |

**Critério de admissão do gateway.** Um serviço externo passa pelo módulo `gateway` quando tem **qualquer uma**
destas três propriedades:

1. **Credencial** que não pode ser conhecida por um módulo de domínio;
2. **Custo por chamada** — fatura que cresce com uso;
3. **Limite** (rate limit, cota, teto de tokens) que precisa de um lugar só para ser respeitado.

Serviço sem nenhuma das três — um CEP público, por exemplo — não precisa passar pelo gateway. Projeto sem
serviço pago simplesmente não instancia um módulo `gateway`.

## 3.2 Adapters — as implementações das portas

`adapters/<tecnologia>/` guarda o código que fala com Postgres, Supabase, S3, Firebase, Oracle, um provedor de
e-mail ou um LLM. Fica **fora** do módulo, e por dois motivos:

- **Adapter é código de fornecedor, sem uma linha de domínio.** Duplicá-lo por módulo significa N lugares para
  corrigir a mesma falha no dia da CVE do driver.
- **Ele viaja na extração.** Extrair um módulo é copiar `modules/<modulo>/` **mais** os adapters que ele declara.

`adapters/memory/` é **obrigatório** em todo projeto: é ele que permite os testes rodarem sem rede. Sem
variante de memória para cada porta, o desacoplamento não é verificável — e o que não é verificável é folclore.

`adapters/postgres/` também vem pronto (plan-2.2.md Bloco Z), para as portas `repositorio` e `auditoria` —
`memory` continua sendo o que `config/ports.json` escolhe por padrão. Cobre a forma que `create-module.mjs`
já cria (`<prefix>metadados`/`<prefix>auditoria`); módulo com tabela de outra forma escreve o próprio
adapter, do mesmo jeito que sempre escreveu para qualquer outro fornecedor (01-modulo.md §5.2).

## 3.3 Packages — a exceção mínima

`packages/` só aceita o que é **interface, contrato ou design, sem lógica de negócio**:

| Package | Papel |
|---|---|
| `ports/` | interfaces canônicas das portas + taxonomia fechada de erro |
| `ui-kit/` | ponto único de contato com a biblioteca de UI — só em projeto com `ui.modo: "kit"` |

Regra de negócio **nunca** entra aqui. Se dois módulos precisam da mesma regra, **duplica-se**.

## 3.4 Raiz de composição — o wiring, e nada além

`src/` é um entrypoint fino que **não é módulo**. Ele descobre os módulos lendo `modules/*/module.json`,
resolve as portas de cada um a partir do `config/ports.json` dele, **injeta** os adapters, monta cada `api/`
sob a `basePath` do manifesto e **sobe** — um processo, uma porta (§5) — servindo os módulos já montados.

É só fiação. Nenhuma regra de negócio vive aqui, nenhum módulo importa daqui, e o front de nenhum módulo é
servido por aqui: `web/` é build estático do próprio módulo, publicado por fora deste processo (§4.4).

# 4. As fronteiras

Quatro fronteiras sustentam a doutrina. Cada uma é verificada por uma regra do catálogo ([[04-regras]]).

## 4.1 Fronteira de código — zero import lateral

Nenhum `web/`, `api/` ou `core/` de um módulo importa código de outro módulo, nem por caminho relativo, nem
por package.

- **`core/` é interno ao módulo.** Reaproveitado pela `api/` e por uma CLI do **mesmo** módulo, nunca entre módulos.
- **Lógica de negócio nunca é compartilhada.** A independência vale mais que o DRY *entre* módulos; dentro do
  módulo, DRY normal continua valendo.

## 4.2 Fronteira de infraestrutura — o módulo nunca conhece o fornecedor

O módulo declara **o que precisa**; **quem fornece** é decidido fora dele. Quatro camadas:

| Camada | Onde vive | Viaja na extração? |
|---|---|---|
| Interface (`Repositorio`, `Auth`, `Storage`) | `packages/ports/` | sim |
| Uso pelo domínio (`DependenciasDoModulo`) | `modules/<m>/core/ports/` | sim, é do módulo |
| Escolha do provedor | `modules/<m>/config/ports.json` | sim |
| Implementação (fala Supabase, S3, …) | `adapters/<tecnologia>/` | sim, copia-se junto |
| Fiação (instancia e injeta) | `src/` | não |

**A consequência que torna o desacoplamento real:** o nome do provedor não aparece em lugar nenhum do módulo,
**exceto** em `config/ports.json`. Trocar de fornecedor é editar uma linha de JSON. Se for preciso mais que
isso, a porta está mal desenhada.

## 4.3 Fronteira de dados — só o dono toca a sua fatia

- Schema **nunca** `public`. Um schema por módulo ou schema único é decisão do projeto, declarada em
  `module.json:data.schema`.
- Toda tabela é prefixada `<modulo>_` **nas duas topologias**. Redundante quando há schema dedicado, e é
  justamente aí que vale mais: no dia de consolidar ou separar, nada precisa ser renomeado.
- **Proibido JOIN, view ou foreign key cruzando módulos.** O dado de outro módulo chega pelo contrato da `api/`
  dele. A referência cruzada é um **valor** (um hash), não uma dependência.

## 4.4 Fronteira de rede — cada front fala só com a sua API

O `web/` de um módulo consome **exclusivamente** `/api/v1/<modulo>`, por caminho relativo. Nunca o banco,
nunca a API de outro módulo.

Caminho relativo exige mesma origem — e a raiz de composição (§3.4) **não é** essa origem: ela só sobe a
API (um processo, uma porta), nunca o build estático de `web/`. Quem publica o front sob a mesma origem da
API é decisão de **deploy** (reverse proxy, host estático na frente, CDN com regra de rota), e deploy não é
assunto desta doutrina (§5: *"modularidade não é topologia de deploy"*).

Quando um módulo precisa de dado de outro, o acesso vive em `core/gateways/`, fala **exclusivamente HTTP**, e
a dependência é declarada em `module.json:consumes`. A pasta separada não é cosmética: *"falo com meu banco"* e
*"falo com outro módulo"* são riscos diferentes, e precisam ser distinguíveis por `grep`.

# 5. Modularidade não é topologia de deploy

A independência que importa é a de **código**, não a de deploy. Um sistema pode rodar como monólito modular —
um processo, uma porta, um `.env` — sem afrouxar nenhuma regra deste documento. O dia em que um módulo precisar
de infraestrutura própria, a mudança é de operação, não de código.

# 6. Onde cada assunto vive

Nenhuma regra é duplicada entre as leis. Se você encontrar a mesma regra escrita em dois lugares, uma das duas
está errada — reporte.

| Pergunta | Lei |
|---|---|
| Como um módulo é por dentro? Como crio um? Como altero? | [[01-modulo]] |
| Qual a forma da API, do erro, do schema, da migration? | [[02-contrato-e-dados]] |
| Como trato segurança, log, erro, teste e extração? | [[03-operacao]] |
| **Qual é a regra, e o que a verifica?** | [[04-regras]] |
| Por que foi decidido assim? | [[decisoes]] |

**[[04-regras]] é a única fonte normativa da arquitetura de módulos.** As demais leis explicam e apontam para
ela. Essa assimetria é deliberada: enquanto a regra vive junto da explicação, o gate e a lei divergem sem que
ninguém perceba.

**O que estas leis NÃO governam.** Escrita de código (SRP, limiares, zero hardcoded, segredos, log, nomes) é
da skill **`padrao-escrita`** do ecossistema Sarak; idiomas de linguagem, da **`padrao-<linguagem>`**. Elas são
o piso de qualquer código deste projeto e **não são repetidas aqui** — ver [[04-regras]] §1.1.
