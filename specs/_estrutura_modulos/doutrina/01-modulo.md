---
tipo: "doutrina"
titulo: "O Módulo — Anatomia, Manifesto, Configuração, Portas e Gateways"
status: "🟢 Vigente"
tags: ["modulo", "template", "manifesto", "configuracao", "portas", "gateways"]
relacionados: ["[[00-arquitetura]]", "[[02-contrato-e-dados]]", "[[03-operacao]]", "[[04-regras]]"]
---

# 1. Propósito

O módulo é a unidade de trabalho do sistema. Esta lei descreve **o que ele é por dentro**, **como se declara**,
**de onde tira configuração** e **como fala com o mundo** — infraestrutura e outros módulos.

Quem lê esta lei inteira escreve um módulo conforme sem abrir outro documento, exceto para consultar a regra
exata em [[04-regras]].

# 2. A árvore única

Todo módulo tem exatamente esta forma. Divergir dela exige decisão registrada em [[decisoes]], não improviso.

```
modules/<modulo>/
├── module.json          identidade + contrato — o sistema DESCOBRE o módulo por aqui
├── package.json         @<escopo>/<modulo>        (pyproject.toml no binding Python)
├── .env                 ENV_RAIZ + overrides — NÃO versionado, criado pelo scaffold
├── .env.example         GERADO de module.json:requiredEnv — nunca editado à mão
├── README.md
│
├── contract/
│   └── openapi.yaml     a fonte do contrato. O código segue, nunca o inverso
│
├── config/              toda configuração, um arquivo por assunto
│   ├── api.json         paginação, timeout, limite de corpo, nível de log
│   ├── domain.json     parâmetros de negócio (status válidos, moedas, limites)
│   ├── seguranca.json   rate limit, CORS, headers
│   ├── ports.json      qual adapter atende cada porta
│   └── textos.json      rótulos e mensagens exibidos ao usuário
│
├── core/                engine interna, sem deploy, sem I/O direto
│   ├── domain/         tipos + validação
│   ├── ports/          o que preciso de INFRAESTRUTURA
│   ├── gateways/        o que preciso de OUTRO MÓDULO — exclusivamente HTTP
│   ├── engine/           geração determinística do artefato   (só se generatesArtifact)
│   └── templates/       base + blocos                        (só se generatesArtifact)
│
├── api/                 a ÚNICA superfície pública
│   └── src/
│       ├── index.ts     bootstrap — RECEBE os adapters, nunca os cria
│       ├── config.ts    carregador único; o único arquivo que toca env
│       ├── routes/      rotas + /health, /meta, /resumo obrigatórios
│       ├── middlewares/ requestId, headers, CORS, rate limit, auth, erro
│       ├── mappers/  snake↔camel + projeção de saída por allowlist
│       └── logger.ts    logger estruturado com redação de campo sensível
│
├── web/                 front — consome só /api/v1/<modulo>, por caminho relativo
│   ├── index.html       entrada standalone (fina, opcional)
│   └── src/
│       ├── index.ts     exporta as páginas — é assim que um shell consome o módulo
│       ├── main.tsx     monta a raiz exportada
│       ├── pages/  components/  hooks/  api-client/
│
├── database/            só tabelas <modulo>_*
│   ├── schema.sql       estado alvo depois da última migration
│   └── migrations/      NNNN-verbo-objeto.sql, cada uma com -- rollback
│
├── tests/               tudo roda com adapters de memória — sem rede, sem banco
│   ├── domain/  contract/  web/  fixtures/
│
└── generated/             saída publicável                     (só se generatesArtifact)
```

**Descartar é permitido; renomear, não.** Módulo sem artefato descarta `core/engine`, `core/templates`,
`database/` e `generated/`. Módulo sem tela descarta `web/`. A árvore é **fechada**: entrada não prevista na raiz
do módulo reprova no gate.

Dependência interna: `web/` depende só do próprio `api-client/`; `api/` depende de `core/`; `core/` não depende
de ninguém. `core/` é compartilhamento **dentro** do módulo — nunca entre módulos.

# 3. O manifesto — `module.json`

O sistema **descobre** os módulos, não os conhece. O manifesto é o que torna isso possível.

## 3.1 Campos

| Campo | Tipo | Papel |
|---|---|---|
| `id` | kebab-case | identificador único; **igual** à pasta, ao package, à rota e ao prefixo de tabela |
| `name` | string | rótulo humano |
| `version` | semver | versão do módulo |
| `description` | string | uma linha sobre o domínio |
| `role` | enum | `domain` \| `gateway` \| `connector` — ver [[00-arquitetura]] §3.1 |
| `binding` | enum | `typescript` \| `javascript` \| `python` — define o molde e as regras de linguagem |
| `basePath` | string | prefixo da API — sempre `/api/v1/<id>` |
| `webPath` | string \| null | prefixo do front; `null` = módulo sem tela |
| `data.schema` | string | schema do banco — **nunca** `public` |
| `data.prefix` | string | sempre `<id>_` |
| `data.tables` | string[] | tabelas **possuídas**; toda começa com o prefixo |
| `requiredEnv` | string[] | chaves `<ID>_*` que o módulo consome |
| `ports` | string[] | portas de infraestrutura que exige (§5) |
| `consumes` | objeto[] | contratos de **outros módulos** dos quais depende (§6) |
| `ui.modo` | enum | `proprio` \| `kit` — de onde vêm os componentes visuais (§7) |
| `permissions` | string[] | permissões que a API exige (`<id>:ler`, `<id>:escrever`) |
| `publicRoutes` | string[] | rotas sem autenticação, no formato `"MÉTODO /caminho"` — **opt-in explícito** |
| `sensitiveFields` | string[] | campos que nunca saem em resposta, log ou OpenAPI |
| `navigation` | objeto \| null | `{ label, icon, order }` — o que o conector monta no menu |
| `exportsSummary` | boolean | se entra no dashboard cross-módulo. `true` **obriga** o schema `200` de `GET /resumo` a declarar `total` (inteiro) — a forma mínima que o agregador lê sem conhecer o módulo ([[02-contrato-e-dados]] §2) |
| `generatesArtifact` | boolean | se possui `core/engine`, `core/templates` e `generated/` |

## 3.2 O que o manifesto habilita

- **Composição sem lista fixa:** a raiz de composição varre `modules/*/module.json` e monta cada `api/` sob a
  sua `basePath`. **Acrescentar um módulo não pode exigir editar código compartilhado.**
- **Navegação declarada:** o conector monta o menu a partir de `navigation`.
- **Grafo de dependências mecânico:** `consumes` permite detectar ciclo e calcular a ordem de extração.
- **Auditoria automática:** tabela sem prefixo, env não declarada, rota fora da `basePath`, campo sensível em
  resposta — tudo vira erro mecânico.

## 3.3 Regras

- **Não declarado, não existe.** Módulo sem `module.json` válido não é montado.
- O manifesto é **contrato, não configuração**: não muda em runtime e não guarda tunable — esses vão para `config/`.
- Um módulo declara **só o que possui**: não lista tabela, env ou permissão de outro módulo.
- Alterar `data`, `basePath` ou `permissions` é mudança de contrato ([[02-contrato-e-dados]] §5).

# 4. Configuração e ambiente

"Zero hardcoded" só vale se houver **mecanismo**, não declaração. Este é o mecanismo.

## 4.1 Onde cada valor mora

| Tipo de valor | Lugar | Exemplo |
|---|---|---|
| Segredo, credencial, URL de infraestrutura, valor por ambiente | `.env`, prefixado `<MODULO>_` | `CATALOGO_DB_URL` |
| Tunable não-secreto: paginação, timeout, limite de corpo, nível de log | `config/api.json` | `"paginaTamanhoMaximo": 100` |
| Parâmetro de negócio: status válidos, moedas, percentuais | `config/domain.json` | `"moedasAceitas": ["BRL"]` |
| Rate limit, CORS, headers | `config/seguranca.json` | `"limiteEscrita": 20` |
| Qual adapter atende cada porta | `config/ports.json` | `"repositorio": "postgres"` |
| Rótulo e mensagem exibidos ao usuário | `config/textos.json` | `"listaVazia": "Nada por aqui."` |
| Identidade e contrato do módulo | `module.json` | §3 |

## 4.2 O `.env` em cascata

O `.env` **real e único** de segredo fica na **raiz do projeto**. Cada módulo tem um `.env` próprio que
**aponta** para ele:

```bash
# modules/catalogo/.env   (não versionado; criado pelo scaffold)
ENV_RAIZ=../../.env

# Override local (dev). Vazio no monorepo; preenchido quando o módulo for extraído.
```

Precedência, do mais forte ao mais fraco:

```
variável do processo  >  .env do módulo  >  .env apontado por ENV_RAIZ  >  default de tunable em config/
```

**Por que assim.** Hoje, um lugar só tem segredo — zero duplicação e zero chance de divergir. No dia da
extração, você apaga a linha `ENV_RAIZ` e preenche os valores localmente: **nenhuma linha de código muda**,
porque o carregador simplesmente não acha o ponteiro e usa o que está local. A fronteira fica declarada por
escrito dentro do módulo.

**Regras:** o `.env` do módulo só aceita `ENV_RAIZ` e chaves `<MODULO>_*` — chave de outro módulo ali é erro.
O `.env.example` é **gerado** de `requiredEnv`; ninguém o edita à mão, então ele nunca mente sobre o que o
módulo exige.

## 4.3 Falha rápida, nunca fallback silencioso

O carregador roda **uma vez, no boot**: lê o manifesto, resolve o `.env`, confere que toda chave de
`requiredEnv` existe e lê os cinco `config/*.json`. Qualquer falta **derruba o processo** com mensagem
acionável.

Fica proibido o padrão `process.env['X'] ?? 'http://localhost:3000'`: um default de infraestrutura embutido faz
o sistema subir apontando para o lugar errado em vez de falhar. Default só é legítimo para tunable, nunca para
endereço, credencial ou identidade.

```
boot → lê module.json → resolve .env → confere requiredEnv → lê config/*.json
     → resolve portas → injeta adapters → sobe a api
                      ↘ qualquer etapa falha → o processo morre com erro nomeado
```

Como o carregador resolve o `.env` sozinho, a `api/` de um módulo **roda isolada**, sem depender da raiz de
composição — que é a condição prática de "pronto para extração".

## 4.4 Regras

- Nenhum literal de URL, porta, timeout, limite, percentual ou rótulo no código — **inclusive na config de build**.
- Nenhum módulo lê chave de outro módulo (`<OUTRO>_*`).
- `config/*` é versionado e vale para todos os ambientes. Valor que muda por ambiente é `.env`, por definição.
- **Nada é enfeite:** chave declarada em `config/*.json` e nunca lida pelo código é peso morto e reprova.

# 5. Portas — toda infraestrutura desacoplada

O módulo declara **o que precisa**; **quem fornece** é decidido fora dele. As quatro camadas estão em
[[00-arquitetura]] §4.2.

## 5.1 Catálogo de portas

| Porta | Responsabilidade |
|---|---|
| `repositorio` | buscar, listar, inserir, atualizar, contar |
| `auditoria` | gravar a trilha append-only do módulo |
| `relogio` | `now()` |
| `geradorId` | identificadores e hash |
| `storage` | gravar/ler arquivo |
| `verificadorDeToken` | verificar token e devolver claims |
| `notificador` | e-mail / mensagem |

`relogio` e `geradorId` não são preciosismo: são o que torna o `core/` determinístico e testável. Sem elas,
`new Date()` e `Math.random()` voltam para dentro do domínio e o motor deixa de ser reproduzível.

Fonte NORMATIVA do vocabulário: `tools/gate/ports-vocabulary.mjs`, na base — os dois schemas do
gate são GERADOS dela, e cada `packages/ports/index.*` por binding a espelha à mão.
A decisão foi **impedir a divergência em vez de acusá-la** — nenhuma regra de raiz compara os três
lugares; quem impede é `tools/generate-port-schemas.mjs --conferir`, que roda dentro do `verificar`
de cada binding (script `validar:schemas`, logo depois de `validar:env`) e do `pre-commit`
(`tools/verify-commit.mjs`) — o mesmo lugar e a mesma forma de
`sync-env.mjs --conferir`, o precedente que este mecanismo segue. `fila` SAIU do catálogo: arrasta
retry, *dead-letter*, idempotência e ordem de entrega — desenho de TOPOLOGIA, que [[00-arquitetura]] §5
diz que o template não escolhe. Volta no dia em que houver um projeto com a decisão tomada, e volta como
ADR.

## 5.2 Regras

- **O módulo nunca importa um adapter.** Recebe-o por parâmetro no bootstrap.
- **O módulo nunca importa SDK de fornecedor.** O SDK só existe dentro do adapter.
- **`memory` é obrigatório para toda porta.** Os testes do módulo rodam inteiros sem infraestrutura; se não
  rodam, o desacoplamento é ficção.
- **O adapter não conhece domínio.** Não existe `if (module === 'catalogo')` dentro de adapter.
- **Erro de fornecedor não vaza.** O adapter traduz a falha para a taxonomia fechada antes de devolver.
- **Trocar de fornecedor é editar `config/ports.json`.** Se for preciso mais que isso, a porta está mal desenhada.
- **Adapter novo nasce por `create-adapter.mjs <porta> <provedor>`**, nunca à mão — mesma forma do
  `create-module.mjs`: copia o molde (`adapters/_template`), substitui marcadores, registra a fábrica em
  `src/composicao.*` e roda o gate antes de devolver o controle.
- **`postgres` (`repositorio`/`auditoria`) já vem PRONTO, ao lado de `memory`** — não nasce
  por `create-adapter.mjs`, porque já existe: materializa a forma que
  `create-module.mjs` já cria (`<prefix>metadados`/`<prefix>auditoria`). `memory` continua o
  DEFAULT de todo módulo; trocar é a mesma linha de `config/ports.json`, agora verdadeira nos dois
  sentidos. A fábrica recebe o **manifesto do módulo** (`ManifestoDescoberto`/`dict`), não zero
  argumentos — é o que permite um adapter genérico saber `data.schema`/`data.prefix`/`<MODULO>_DB_URL`
  de quem o está chamando; `memory` ignora o argumento.

# 6. Gateways — todo módulo alheio desacoplado

Porta é infraestrutura. **Gateway é outro módulo.** São fronteiras de risco diferentes e ficam em pastas
diferentes, para que a diferença seja visível e verificável.

```jsonc
"consumes": [
  { "module": "catalogo", "contract": "GET /aliquotas/vigente", "why": "alíquota do mês na conciliação" }
]
```

## 6.1 Regras

- **Arquivo em `core/gateways/` fala exclusivamente HTTP.** Nenhum SQL, nenhuma conexão, nenhum acesso a
  tabela — nem à própria.
- **Todo gateway tem entrada em `consumes`.** Dependência não declarada não existe, e o gate reprova.
- **Sem ciclo.** `A` consome `B` e `B` consome `A` é erro — resolva a direção ou extraia o conceito comum
  para um terceiro módulo.
- **O consumidor projeta a fatia mínima.** O contrato do dono devolve o recurso inteiro; o consumidor guarda
  só os campos que declarou precisar, no tipo do próprio `core/domain`.
- **A URL base vem de `.env`**, nunca literal.

## 6.2 Comunicação assíncrona

A comunicação entre módulos é HTTP síncrona pelo contrato. Quando um barramento de eventos entrar, **entra
como porta** (`fila`), com adapter próprio — nunca como import e nunca como tabela compartilhada. Registrado
aqui para que a próxima fase não improvise.

# 7. Interface

`ui.modo` declara de onde vêm os componentes visuais:

| modo | O que significa | O que o gate cobra |
|---|---|---|
| `proprio` | o módulo define suas primitivas em `web/src/components/` | proibido importar componente de **outro módulo** — é a regra `import-lateral`, que já cobra isto para o módulo inteiro; não há regra específica de `ui` neste modo |
| `kit` | a renderização vem de `packages/ui-kit` (nome canônico; `ui.pacote` declara outro) | `ui-kit` (erro): nenhum arquivo importa a biblioteca de UI bruta, e algo em `web/` importa o kit — kit declarado e nunca importado é declaração sem consequência. `ui-token` (aviso): zero literal de cor ou fonte em declaração de estilo |

Módulo sem `web/` silencia nos dois modos: descartar a tela é permitido (§2).

Nos dois modos a estrutura de pastas é idêntica, e um módulo migra de `proprio` para `kit` sem mover arquivo.

O `web/` é sempre um **pacote que exporta suas páginas** (`web/src/index.ts`), mais uma **entrada standalone
fina e opcional** (`index.html` + `main.tsx`) que só monta a raiz já exportada. Com isso, tanto um shell único
que importa todos os módulos quanto um SPA por módulo funcionam sem estrutura diferente.

# 8. Criar um módulo novo

```
node tools/create-module.mjs <id> --binding <b> --role <p> [--sem-artefato]
```

O script copia o molde do binding, substitui os marcadores (`<modulo>` → id, `<MODULO>` → id em maiúscula,
`<Modulo>` → rótulo), ajusta o manifesto, cria o `.env` com o ponteiro e roda o gate ao final.

**Ninguém cria módulo à mão.** Módulo manual nasce com nome divergente e sem manifesto — as duas coisas que
quebram o gate e que o gate não consegue consertar sozinho.

Depois do scaffold, a ordem de preenchimento é: `contract/openapi.yaml` → `core/domain` → `api/src/routes` →
`api/src/mappers` → `database/` → `web/src/pages` → `tests/`. O contrato antes do código é deliberado: é a
**fronteira que outros consomem** (`module.json:consumes`), o gate cobra rota do código × rota da spec **nos
dois sentidos** (`contrato-sincronizado`), e `contract-compatible.mjs` compara o contrato contra o baseline
git. Escrever código primeiro faz a spec ser redigida **para descrever o código** — e aí a fonte de verdade
inverte sem ninguém decidir isso.

**Recusada, com o motivo:** domínio primeiro. O argumento — *"a regra de negócio não deve ser moldada pelo
transporte"* — é real, e continua valendo **dentro** do passo: `core/domain` não importa nada da `api/`, e
o gate cobra isso. O que esta ordem fixa é a **ordem de escrita**, não a direção da dependência, que é
domínio ← borda.

A skill **`code-modulo`** do ecossistema Sarak conduz esse fluxo com HITL. Sem o plugin `sarak` (repositório
gerado, sem a skill), a ordem acima e as sete sub-seções de alteração em §9 bastam — `code-modulo` só
acrescenta o HITL.

# 9. Alterar um módulo existente

Criar módulo é o caso raro; alterar é o diário. Cada tipo de mudança tem uma ordem obrigatória — seguir a ordem
evita o erro clássico: mexer no banco e esquecer a borda, ou publicar campo que ninguém decidiu publicar.

## 9.1 Campo novo no contrato

| # | Arquivo | O que fazer |
|---|---|---|
| 1 | `database/migrations/NNNN-adiciona-<campo>.sql` | migration nova, com `-- rollback`. Migration publicada não se edita |
| 2 | `database/schema.sql` | refletir o estado alvo |
| 3 | `core/domain/` | campo no tipo + validação |
| 4 | `config/domain.json` | o vocabulário, se houver — nunca literal no código |
| 5 | `api/src/mappers/` | as duas direções **e** a projeção de saída |
| 6 | `contract/openapi.yaml` | schema do recurso |
| 7 | `web/src/api-client/` | tipo do cliente |
| 8 | `tests/` | caso novo em `domain/` e no teste de contrato |

**A regra que atravessa tudo:** o campo só existe para fora quando alguém o acrescenta **deliberadamente** à
projeção. Schema não publica nada sozinho.

**Se o campo for PII:** declare em `sensitiveFields`, mantenha-o fora da projeção (ou publique mascarado) e
nunca o cite em schema de resposta.

## 9.2 Rota nova

1. `contract/openapi.yaml` **primeiro** — o contrato é a fonte, o código segue.
2. `api/src/routes/`: valide a entrada na borda, exija permissão, monte a resposta pelo mapeador, lance o erro
   da taxonomia fechada — nunca `status(...)` ad hoc.
3. Se a rota for pública, declare `"MÉTODO /caminho"` em `publicRoutes`. O método faz parte da declaração:
   abrir a leitura nunca pode abrir a escrita do mesmo caminho por descuido.
4. Teste de contrato cobrindo o sucesso e o erro esperado.

## 9.3 Infraestrutura nova

1. `module.json:ports` — declare a porta.
2. `core/ports/` — estenda a interface canônica.
3. `config/ports.json` — escolha o adapter.
4. `api/src/index` — receba por parâmetro. Nunca importe adapter nem SDK.
5. Raiz de composição — resolva e injete.
6. Garanta que existe a variante `memory`, senão os testes deixam de rodar sem rede.

## 9.4 Dependência de outro módulo

1. `module.json:consumes` — declare módulo, contrato e motivo.
2. `core/gateways/<outro>.ts` — o cliente HTTP, projetando a fatia mínima.
3. `module.json:requiredEnv` — a URL base do outro módulo.
4. Verifique que não criou ciclo.

## 9.5 Variável de ambiente

1. `module.json:requiredEnv`.
2. `node tools/sync-env.mjs` — regenera os `.env.example`. **Não edite esses arquivos à mão.**
3. Preencha o valor no `.env` da raiz.
4. Leia só pelo carregador. Ausência derruba o boot — nunca use `?? 'valor'`.

## 9.6 Tabela nova

1. `module.json:data.tables`, com o prefixo `<modulo>_`.
2. Migration + `schema.sql`.
3. Acesso pela porta `repositorio`; nada de SQL de fornecedor dentro do módulo.
4. **Nunca** referencie tabela de outro módulo — o dado alheio vem pela `api/` dele.

**Nada a fazer por conta do controle de estado.** `<modulo>_migrations` (§2, criada pela migration
`0001` do molde) registra sozinha o que já rodou — `scripts/migrations.{mjs,py} up` aplica só as
migrations pendentes, `down` reverte só a última aplicada. Uma migration nova não pede nenhum passo
a mais aqui: ela só precisa existir em `database/migrations/`, na ordem (`NNNN-verbo-objeto.sql`),
como qualquer outra ([[02-contrato-e-dados]] §6.3).

## 9.7 Tela nova

1. `web/src/pages/` — a tela, com os três estados (`loading`, `empty`, `error`).
2. `web/src/hooks/` — o estado; `web/src/api-client/` — o acesso, sempre por caminho relativo.
3. `module.json:webPath` e `navigation`.
4. Teste cobrindo os três estados.
