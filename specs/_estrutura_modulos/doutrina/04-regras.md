---
tipo: "doutrina"
titulo: "Regras e Gate — o Catálogo Único, Verificado por Máquina"
status: "🟢 Vigente"
tags: ["regras", "conformidade", "gate", "validador", "nomenclatura"]
relacionados: ["[[00-arquitetura]]", "[[01-modulo]]", "[[02-contrato-e-dados]]", "[[03-operacao]]"]
---

# 1. Propósito

Regra sem verificação vira folclore. Esta lei é a **única fonte normativa da arquitetura de módulos**: toda
regra estrutural que o sistema impõe está listada aqui, com o que ela verifica e quem a cobra.

As demais leis explicam **por que** a regra existe e **como** trabalhar dentro dela. Esta diz **qual é** e
**quem cobra**. A assimetria é deliberada — enquanto cada documento era dono das próprias regras, o gate e a
lei divergiam sem que ninguém percebesse.

## 1.1 Onde esta lei começa e termina

O ecossistema Sarak tem três níveis de norma, e cada um tem **um** dono. Nenhum copia o outro:

| Nível | Assunto | Dono | Onde |
|---|---|---|---|
| **0** | escrita: SRP, limiares, zero hardcoded, segredos, erro, log, nomes | skill **`padrao-escrita`** | base Sarak |
| **1** | **arquitetura de módulos: anatomia, manifesto, contrato, dados, isolamento** | **este catálogo** | `specs/arquitetura/04-regras.md` |
| **2** | idiomas e linter de cada linguagem | skill **`padrao-<linguagem>`** | base Sarak |

Este documento é dono do Nível 1 e **de mais nada**. Os quatro limiares de escrita que o gate também cobra
(§4.7) continuam sendo **do `padrao-escrita`** — o gate os repete por necessidade operacional, não por posse,
e o valor deles muda lá, nunca aqui.

**Duas consequências que valem como lei deste documento:**

1. **Regra que não está aqui não é regra.** É recomendação, e não se cobra em revisão.
2. **Regra que não pode ser verificada mecanicamente não entra aqui.** Ou ganha um verificador, ou é descrita
   como característica do sistema numa das outras leis — nunca como regra.

# 2. Como ler o catálogo

| Coluna | Significa |
|---|---|
| **id** | o identificador que aparece na saída do gate |
| **nível** | `erro` reprova (exit 1); `aviso` reporta e deixa passar |
| **verifica** | o que exatamente é checado — não o que se gostaria de checar |
| **escopo** | `módulo` roda por módulo; `global` exige ver todos (só no `--todos`); `raiz` roda **uma vez** sobre o projeto |

**Três escopos, e o terceiro é recente.** `raiz` é a unidade que **nasce com o sistema**, existe **uma só** e não
é módulo nenhum: a fiação (`adapters/`, `src/`, `packages/`), o manifesto do projeto e a política da raiz. O
achado dela sai sob o alvo `(raiz)`, nunca sob um id de módulo — os parênteses garantem que não colida, porque
`manifesto` exige `id` casando `^[a-z][a-z0-9-]*$`.

A regra de raiz roda uma vez **porque o fato é um só**. Enquanto `verificacao-declarada` e `lint-derivado`
eram `módulo` com guarda, o resultado era certo e a saída não: um defeito de projeto emitia uma mensagem por
módulo — dez módulos, dez mensagens idênticas para um conserto só. `global` nunca serviu para isso, porque o
motor descarta achado global cujo módulo não esteja entre os selecionados, e a raiz não é módulo nenhum.

# 3. Nomes

Nome divergente não é questão de gosto: é o que quebra o *grep* que sustenta o isolamento e o que impede o
gate de auditar.

## 3.1 A tabela canônica

| Elemento | Padrão | Exemplo |
|---|---|---|
| Pasta-raiz de módulos | minúscula, plural | `modulos/` |
| Pasta de módulo | kebab-case minúsculo | `modulos/catalogo/` |
| Package do módulo | `@<escopo>/<modulo>` | `@<escopo>/catalogo` |
| Package de camada | `@<escopo>/<modulo>-<camada>` | `@<escopo>/catalogo-api` |
| Package compartilhado | `@<escopo>/<assunto>` | `@<escopo>/ui-kit`, `@<escopo>/portas` |
| Package de adapter | `@<escopo>/adapter-<tecnologia>` | `@<escopo>/adapter-postgres` |
| Componente/página | PascalCase, um por arquivo | `Lista.tsx` |
| Hook | `use` + PascalCase | `useListaDeItens.ts` |
| Demais arquivos | kebab-case | `api-client/index.ts` |
| Teste | espelha o alvo + `.test` | `motor.test.ts` |
| Rota REST | `servers[0].url` = `rotaBase`; segmentos kebab-case, **sem verbo**; parâmetro de caminho camelCase — tudo cobrado por `rota-nomenclatura`. Recurso no **plural** é convenção, sem verificador | `/api/v1/catalogo/{hash}` |
| Campo do payload | camelCase | `clienteApelido` |
| Schema do banco | declarado em `dados.schema`, **nunca** `public` | `"<escopo>"` |
| Tabela | `<modulo>_<entidade>`, snake_case | `catalogo_metadados` |
| Coluna | snake_case | `cliente_apelido` |
| Migration | `NNNN-verbo-objeto.sql`, sequencial | `0003-adiciona-comissao.sql` |
| Variável de ambiente | `<MODULO>_<ASSUNTO>`, SCREAMING_SNAKE | `CATALOGO_DB_URL` |
| Variável de ambiente **da raiz** | `RAIZ_<ASSUNTO>` — prefixo **reservado** | `RAIZ_JWT_SECRET` |
| Variável exposta ao browser | prefixo do build + `<MODULO>_` | `VITE_CATALOGO_API_BASE_URL` |
| Arquivo de config | kebab-case, um assunto por arquivo | `config/seguranca.json` |
| Chave de config | camelCase | `paginaTamanhoMaximo` |
| Permissão | `<modulo>:<acao>` | `catalogo:escrever` |
| Código de erro | SCREAMING_SNAKE da taxonomia fechada | `NAO_ENCONTRADO` |

**Um nome, um lugar.** O identificador do módulo é o mesmo na pasta, no package, na rota, no prefixo de tabela,
no prefixo de env e no `modulo.json`. Divergência é erro de gate, não estilo.

**`RAIZ_` é prefixo reservado, e a reserva é a razão de ele existir.** A chave de módulo é `<MODULO>_*`
(cobrada por `env-modulo`); sem uma convenção própria, nenhuma regra conseguiria dizer se `JWT_SECRET` é da
raiz ou de um módulo, e a chave mais sensível do sistema continuaria sem dono. O vocabulário já chamava a raiz
assim: o `.env` de cada módulo aponta para a dela por `ENV_RAIZ`. Cobrada por `env-raiz-declarado`.

**Plural de recurso é convenção, não regra.** Escreva `/registros`, não `/registro` — mas não há verificador, e
pelo §1 (lei 2) o que não tem verificador **não é regra**: não se cobra em revisão. Não é descuido, é limite
real — as três rotas obrigatórias (`/health`, `/meta`, `/resumo`) são singulares por desenho, e pluralidade em
português não é decidível por máquina. O resto da linha "Rota REST" **é** cobrado, por `rota-nomenclatura`.

**Idioma.** Português no domínio, nas rotas e nos dados; inglês onde a linguagem ou o framework impõem
(`src`, `hooks`, `pages`, `components`, `routes`, `middlewares`, `index`). A escolha entre português puro e o
misto acima é **decisão de cada projeto**, registrada em `specs/adr/` — o gate cobra
**consistência dentro do projeto**, não a escolha.

**Fronteira de caixa:** o banco fala `snake_case`, o contrato fala `camelCase`, e a conversão é explícita no mapeador.

# 4. O catálogo

## 4.1 Estrutura

| id | nível | verifica | escopo |
|---|---|---|---|
| `manifesto` | erro | `modulo.json` existe e é JSON válido; campos obrigatórios presentes; `id` igual ao nome da pasta; `rotaBase` igual a `/api/v1/<id>`; `papel` e `binding` no vocabulário | módulo |
| `schema-manifesto` | erro | `modulo.json` conforma ao JSON Schema (`ferramentas/gate/schemas/modulo.schema.json`): tipo, formato e vocabulário de cada campo, **e campo não previsto reprova** | módulo |
| `estrutura` | erro | `contrato/openapi.yaml`, `config/`, `api/` e `tests/` presentes; os cinco `config/*.json` presentes | módulo |
| `estrutura-estrita` | erro | nenhuma entrada não prevista na raiz do módulo — a árvore é fechada | módulo |
| `web-declarado` | erro | módulo que declara `rotaWeb` tem ao menos uma página real em `web/src/pages` | módulo |
| `navegacao-declarada` | erro | módulo com `navegacao` não-nula tem `rotaWeb` não-nula — o conector monta o menu a partir de `navegacao` ([[01-modulo]] §3.2), e a entrada apontaria para o nada. **Uma direção só**: `rotaWeb` sem `navegacao` é legítimo — página alcançável por URL direta, fora do menu. O `icone` não é verificado (§7.2) | módulo |
| `artefato-declarado` | erro | o `geraArtefato` do manifesto e a árvore concordam, **nos dois sentidos**: `true` exige `core/motor/`, `core/templates/` e `gerados/`; `false` proíbe as três. `database/` **não** entra — quem declara banco é `dados.tabelas` (§7.2) | módulo |
| `testes` | erro | `tests/dominio/` não-vazio; `tests/contrato/` não-vazio em módulo com rota | módulo |
| `testes-web` | erro | módulo que declara `rotaWeb` tem `tests/web/` não-vazio — a terceira camada do [[03-operacao]] §5. **Condicional**, com a mesma guarda de `web-declarado`: `rotaWeb: null` silencia, e `criar-modulo.mjs --sem-web` zera os dois de uma vez. Verifica presença, **não** os três estados que o §5 pede (§7.2) | módulo |
| `testes-gateway` | erro | todo gateway REAL de `core/gateways/` (barril `index`/`__init__` excluído) tem teste cujo nome o espelha (`<gateway>.test.*`, `test_<gateway>.*`). Fecha o triângulo `gateway ⟷ consome ⟷ teste`: `gateway-declarado` liga o arquivo ao `consome`, `consome-contrato` liga o `consome` ao contrato do dono, e esta liga o gateway ao teste. **Não** é `testes` com outro nome — aquela cobra a PASTA, esta cobra um teste POR gateway. A pasta do teste não é imposta (§7.2) | módulo |
| `manifesto-raiz` | erro | a raiz do projeto tem `projeto.json`, é JSON válido e conforma ao JSON Schema (`ferramentas/gate/schemas/projeto.schema.json`), **campo não previsto reprova**. **Um id só**, ao contrário do par `manifesto` + `schema-manifesto`: tudo que o manifesto da raiz afirma é forma, e a raiz não tem nome de pasta a casar nem rota a derivar. Módulo solto, fora de projeto, silencia (§7.2) | raiz |

## 4.2 Isolamento

| id | nível | verifica | escopo |
|---|---|---|---|
| `import-lateral` | erro | nenhum arquivo importa `@<escopo>/<outro-modulo>`; nenhum caminho relativo sai da pasta do módulo | global |
| `import-adapter` | erro | nenhum `adapters/*` importado dentro do módulo, **fora de teste** — o adapter é **injetado**. Em teste é legítimo: o teste é a raiz de composição dele mesmo | módulo |
| `sdk-fornecedor` | erro | nenhum SDK de fornecedor (`@supabase/*`, `pg`, `mysql*`, `aws-sdk`, `@aws-sdk/*`, `firebase*`, `oracledb`, `mongodb`, `openai`, `redis`) dentro do módulo | módulo |
| `gateway-http` | erro | arquivo em `core/gateways/` sem SQL, conexão ou acesso a tabela — só HTTP | módulo |
| `gateway-declarado` | erro | todo arquivo em `core/gateways/` tem módulo correspondente em `consome`, e vice-versa | módulo |
| `consome-ciclo` | erro | não há ciclo no grafo de `consome` | global |
| `ui-kit` | erro | em `ui.modo: "kit"`, nenhum arquivo importa a biblioteca de UI **bruta** (vocabulário fechado — o kit é o ponto único de contato com ela, [[00-arquitetura]] §3.3), **e** algum arquivo de `web/` importa o kit (`@<escopo>/ui-kit`, ou o que `ui.pacote` declarar) — kit declarado e nunca importado é declaração sem consequência. Modo `proprio` e módulo sem `web/` silenciam (§7.2) | módulo |
| `ui-token` | aviso | em `ui.modo: "kit"`, nenhum literal de cor ou de fonte em **declaração de estilo** (`propriedade: valor`) dentro de `web/` — em arquivo de código **e** em folha de estilo (`.css`, `.scss`, `.sass`, `.less`). Atributo de apresentação SVG (`fill="#000"`) fica de fora por forma, não por exceção (§7.2) | módulo |
| `consome-contrato` | erro | toda entrada de `consome` aponta para um módulo que existe, e o `contrato/openapi.yaml` dele declara aquele caminho **e** aquele método. Dono sem spec é achado, não silêncio. Reportado no **consumidor** | global |
| `portas-pura` | erro | nenhum arquivo de `packages/portas/` importa de `modulos/`, `adapters/` ou `src/` — a porta é a interface **canônica**, e quem implementa depende dela, nunca o contrário —, **e** nenhum importa SDK de fornecedor (mesmo vocabulário fechado do `sdk-fornecedor`, uma lista só): o driver na porta o devolveria a todo módulo de uma vez. Biblioteca-padrão da linguagem **não** conta (§7.2) | raiz |
| `adapter-isolado` | erro | nenhum arquivo de `adapters/` importa de `modulos/` nem de `src/`. Dependência **externa** é legítima aqui e não é acusada — `adapters/` é o lugar do `pg`, do `@supabase/*` e do `boto3`; `sdk-fornecedor` proíbe isso no módulo, e aqui é o contrário (§7.2) | raiz |
| `composicao-descoberta` | erro | nenhum arquivo de `src/` importa de `modulos/`. **Import é dependência; leitura de arquivo é descoberta** — a composição alcança todos os módulos lendo o `modulo.json` de cada pasta, e isso é a doutrina funcionando ([[00-arquitetura]] §3.4). Importar `adapters/` daqui é o ofício da fiação e não é acusado (§7.2) | raiz |

## 4.3 Dados

| id | nível | verifica | escopo |
|---|---|---|---|
| `schema-nao-public` | erro | `dados.schema` presente e diferente de `public` | módulo |
| `tabela-prefixo` | erro | toda tabela em `dados.tabelas` começa com `dados.prefixo` (= `<id>_`) | módulo |
| `tabela-alheia` | erro | nenhum identificador `<outro-modulo>_<algo>` aparece no código ou no SQL do módulo | global |
| `migrations` | erro | nome no padrão `NNNN-verbo-objeto.sql`; toda migration tem bloco `-- rollback` | módulo |
| `tabela-declarada` | erro | toda tabela de `dados.tabelas` tem `CREATE TABLE` no SQL do módulo. É o verificador que `artefato-declarado` pressupunha existir ao deixar `database/` de fora (*"quem declara banco é `dados.tabelas`"*) e que não existia. Módulo **sem SQL nenhum** silencia: ali o dono é `migrations` (§7.2) | módulo |
| `rls` | aviso | toda tabela **que o SQL cria** tem `ENABLE ROW LEVEL SECURITY`. Tabela declarada e inexistente é de `tabela-declarada`, e a fronteira é explícita: antes ela caía aqui com a mensagem errada — *"sem RLS"*, quando o problema é que ela não existe (§7.2) | módulo |

## 4.4 Configuração e ambiente

| id | nível | verifica | escopo |
|---|---|---|---|
| `config-valida` | erro | os cinco `config/*.json` existem e são JSON válido | módulo |
| `schema-config` | erro | cada `config/*.json` conforma ao seu JSON Schema em `ferramentas/gate/schemas/`. `api`, `seguranca` e `portas` têm forma fechada (campo não previsto reprova); `dominio` e `textos` são livres por definição | módulo |
| `porta-declarada` | erro | as chaves de `config/portas.json` e as entradas de `modulo.json:portas` coincidem **nos dois sentidos** — as duas metades de uma declaração: o manifesto diz o que o módulo EXIGE, a config diz QUEM preenche. Declarada e não configurada **derruba o boot**; configurada e não declarada é config morta. O JSON Schema não podia cobrar isto e afirmava que cobrava: `additionalProperties: false` fecha o vocabulário, não amarra ao manifesto (§7.2) | módulo |
| `cors-aberto` | erro | `seguranca.cors.origensPermitidas` não contém `*` — origem é **declarada**, uma a uma | módulo |
| `config-morta` | aviso | nenhuma chave de primeiro nível em `config/*.json` declarada e nunca lida pelo código | módulo |
| `hardcode-url` | erro | nenhuma URL literal (`http://`, `https://`) no código do módulo, fora de teste e de comentário | módulo |
| `hardcode-numero` | erro | nenhum literal numérico (≥ 2 dígitos) atribuído a identificador de infraestrutura (`porta`, `timeout`, `limite`, `max*`, `ttl`, `janela`, `intervalo`, `tentativas`) fora de `config/` e de teste | módulo |
| `fallback-silencioso` | erro | nenhum `process.env[...] ?? '<literal>'` (nem `or`/`getenv(..., '<literal>')` no Python) | módulo |
| `env-declarado` | erro | toda chave `<MODULO>_*` usada no código está em `modulo.json:envRequerido` | módulo |
| `env-exemplo` | erro | o `.env.example` do módulo e o `envRequerido` do manifesto coincidem exatamente, nos dois sentidos | módulo |
| `env-modulo` | erro | o `.env` do módulo só contém `ENV_RAIZ` e chaves `<MODULO>_*` — nunca chave de outro módulo | módulo |
| `env-fora-do-carregador` | aviso | `process.env` lido fora do carregador de config e da config de build | módulo |
| `env-raiz-declarado` | erro | toda chave `RAIZ_*` usada na **fiação** (`adapters/`, `src/`, `packages/`) está em `projeto.json:envRequerido`, **e toda declarada é usada** — o análogo de `env-declarado`, nos dois sentidos. A segunda direção entra porque a chave declarada vai para o `.env.example` e passa a exigir do operador um valor que nada lê. O `.env.example` da raiz **não** é cobrado aqui: quem o compara com os manifestos é `sincronizar-env.mjs --conferir`, dentro do `verificar` (§7.2) | raiz |
| `hardcode-url-raiz` | erro | nenhuma URL literal (`http://`, `https://`) na **fiação**, fora de teste e de comentário — o gêmeo de `hardcode-url`, com a mesma implementação. O adapter é onde o endereço do fornecedor aparece, e o endereço vem do ambiente: declare a chave em `projeto.json:envRequerido` | raiz |
| `fallback-raiz` | erro | nenhum default silencioso de env na **fiação** (`process.env.X ?? '…'`, `getenv(…, '…')`, `environ.get(…, '…')`) — o gêmeo de `fallback-silencioso`, com a mesma lista. **Não** proíbe LER o ambiente: ler é o ofício de `src/`, e a chave não declarada é de `env-raiz-declarado`. O que ela proíbe é o default, que vira o valor de produção no dia em que a chave falta (§7.2) | raiz |
| `gitignore-segredo` | erro | o `.gitignore` da raiz ignora `.env` **e** `modulos/*/.env` — o `.env.example` segue versionado. Verifica o arquivo de ignore, **não** o que já está versionado: isso exigiria `git ls-files`, e o gate não roda git (§7.2) | raiz |
| `segredo-em-publico` | erro | nenhuma chave com prefixo **público** de bundler (`VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, `REACT_APP_`, `NUXT_PUBLIC_`, `EXPO_PUBLIC_`, `GATSBY_`) tem nome de credencial — o bundler injeta esse valor no bundle do front, onde qualquer visitante o lê. Olha o `envRequerido` **e** o código. Sem isenção por `papel`: nem o gateway publica a credencial dele | módulo |
| `verificacao-declarada` | erro | a raiz do projeto tem `config/verificacao.json`, JSON válido e conforme ao schema (`ferramentas/gate/schemas/verificacao.schema.json`) — cobertura mínima, severidade de dependência e ferramenta por linguagem. **Não** guarda limiar: 40/3/4 são lei (§4.7). Módulo solto, fora de projeto, silencia (§7.2) | raiz |
| `lint-derivado` | erro | a config do linter na raiz (`eslint.config.js` ou `.ruff.toml`) é **byte a byte** o que `ferramentas/gerar-config-lint.mjs` produziria a partir de `ferramentas/gate/limiares.mjs`. Editar a config à mão faz o linter e o gate cobrarem limiares diferentes — e o §7.2 manda o linter vencer, o que tornaria a divergência invisível | raiz |

## 4.5 Contrato

| id | nível | verifica | escopo |
|---|---|---|---|
| `contrato` | erro | `contrato/openapi.yaml` existe e declara `/health`, `/meta` e `/resumo` | módulo |
| `rota-nomenclatura` | erro | `servers[0].url` é igual ao `rotaBase` do manifesto; nenhum segmento de path carrega verbo (vocabulário fechado, PT e EN, comparado token a token do kebab); todo segmento é kebab-case minúsculo e todo parâmetro de caminho é camelCase. Se nenhum path puder ser extraído, a regra **diz que não verificou** em vez de passar calada | módulo |
| `contrato-sincronizado` | erro | as rotas registradas no código e as declaradas em `paths:` coincidem **nos dois sentidos** (parâmetro de caminho normalizado). Se nenhuma rota puder ser extraída do código, a regra **diz que não verificou** em vez de passar calada | módulo |
| `projecao-contrato` | erro | toda chave que o mapeador projeta na saída aparece como propriedade em algum schema de **resposta** do `contrato/openapi.yaml` — publicar o que o contrato não promete é campo saindo sem ninguém ter decidido. **Uma direção só** (§7.2). Sem projeção ou sem schema de resposta extraível, a regra **diz que não verificou** | módulo |
| `payload-camelcase` | erro | toda chave da projeção de saída é camelCase, e nenhuma propriedade de schema de **resposta** no OpenAPI usa `snake_case` | módulo |
| `saida-sensivel` | erro | nenhum campo de `camposSensiveis` aparece em schema de **resposta** do `openapi.yaml` | módulo |
| `sensivel-em-saida` | erro | nenhum campo de `camposSensiveis` entra na projeção de saída nem é citado em chamada de log — citá-lo direto burla a redação automática do logger | módulo |
| `resumo-exportado` | erro | módulo com `exportaResumo: true` declara `total` no schema `200` de `GET /resumo` — é a forma mínima que o agregador cross-módulo lê sem conhecer o módulo ([[02-contrato-e-dados]] §2). **Uma direção só**: `false` não proíbe nada. Lê o bloco daquela ROTA, seguindo `$ref` (§7.2) | módulo |
| `entrada-allowlist` | erro | o corpo da requisição não vira entidade sem passar por allowlist — proibidos o **spread** do corpo (`{...req.body}`, `{**corpo}`), o corpo indo **direto ao repositório** e a **atribuição em massa** (`Object.assign(entidade, req.body)`). É a simétrica de `saida-crua` na direção da entrada ([[02-contrato-e-dados]] §3.2). Passar o corpo para uma função que aplica a allowlist é o caminho CERTO e não é acusado (§7.2) | módulo |
| `saida-crua` | erro | nenhuma resposta devolve o registro cru (`json(registro)`, `json(linha)`, `json(row)`, `json(dados)`, `return linha`) | módulo |

## 4.6 Operação

| id | nível | verifica | escopo |
|---|---|---|---|
| `log` | erro | nenhum `console.*` (ou `print(`, no Python) no código do módulo, fora de teste | módulo |
| `determinismo` | erro | nenhum `Math.random()`/`new Date()` (ou `random.`/`datetime.now`) dentro de `core/` — use as portas `geradorId` e `relogio` | módulo |
| `rota-publica-autenticada` | erro | a isenção de autenticação é a do manifesto e nada mais: a `api/` **lê** `modulo.json:rotasPublicas`, nenhum arquivo dela escreve rota `"MÉTODO /caminho"` como literal, e **toda** entrada de `rotasPublicas` existe no `contrato/openapi.yaml` com **aquele método** — entrada com typo não isenta nada e ninguém percebe. Verifica a origem e a realidade da lista, **não** a ordem da cadeia nem a rejeição em runtime (§7.2) | módulo |
| `permissao-literal` | erro | nenhum argumento de `exigirPermissao` na `api/` é literal — a permissão em vigor vem de `modulo.json:permissoes`, nunca do código, senão o manifesto declara uma coisa e a rota exige outra. É a simétrica da cláusula de origem do `rota-publica-autenticada`. A metade inversa (*toda permissão declarada é exigida em alguma rota*) **não** existe, e não por descuido: ela é incompatível com esta (§7.1) | módulo |
| `cookie-seguro` | erro | todo cookie de **sessão** definido pelo módulo carrega `HttpOnly`, `Secure` e `SameSite`. **Condicional**: módulo sem cookie — o caso do molde, cuja auth é `Authorization: Bearer` — não tem o que declarar e a regra silencia | módulo |
| `token-em-armazenamento` | erro | nenhum token de autenticação em `localStorage`/`sessionStorage`, que qualquer XSS na página lê. Invariante absoluto, não condicional a estilo: use cookie `HttpOnly` ou mantenha o token em memória | módulo |
| `random-inseguro` | erro | nenhum token, segredo ou id de sessão gerado com RNG **não-criptográfico** (`Math.random`, módulo `random` do Python) **fora** de `core/` — use CSPRNG. Dentro de `core/` quem cobra é `determinismo`, e as duas nunca acusam a mesma linha (§7.2) | módulo |
| `gateway-credencial` | erro | módulo com `papel` diferente de `gateway` não declara credencial de serviço externo (`*_API_KEY`, `*_SECRET`, `*_TOKEN`) | módulo |
| `sql-concatenado` | erro | nenhuma instrução SQL da **fiação** montada por concatenação ou interpolação (`+` com variável, `${…}`, f-string, `.format(`, operador `%`). Placeholder (`$1`, `?`, `:nome`, `%s`) é a forma correta e **não** é acusado. É a regra que veio da B.3: a query é montada em `adapters/`, porque o módulo não pode ter driver (`sdk-fornecedor`) nem importar adapter (`import-adapter`) (§7.2) | raiz |
| `sql-no-modulo` | erro | nenhuma instrução SQL montada por concatenação ou interpolação no código do **módulo**, fora de teste. Gêmea da anterior, com o **mesmo** discriminador e outra coleção: aquela lê a fiação (`adapters/`, `src/`, `packages/`), esta lê a pasta do módulo, e **nenhum arquivo cai nas duas**. Fecha o vetor que sobrava — a superfície canônica de `packages/portas/` é tipada por operação e não aceita comando, mas o `core/portas/` do módulo é escrito pelo autor dele e ninguém compara as duas formas (§7.2) | módulo |
| `segredo-em-log` | erro | nenhuma chave de `projeto.json:envRequerido` que case o vocabulário fechado de **sufixo de credencial** (`*_SECRET`, `*_TOKEN`, `*_API_KEY`, … — a lista de `gateway-credencial`) é citada em chamada de log na fiação. `RAIZ_JWT_SECRET` é segredo; `RAIZ_API_BASE_URL` não é, e não é acusada. A raiz **não** tem `camposSensiveis`: o sinal é a declaração que já existe (§7.2) | raiz |

## 4.7 Escrita — limiares dentro do arquivo

**Estes limiares não são desta lei — são do Nível 0** (§1.1). A skill **`padrao-escrita`** é a dona: é lá que
o valor de cada um é decidido e alterado. O gate os repete aqui porque **viaja com o módulo e roda sem
`npm install`** — delegá-los inteiramente ao linter significa que num repositório sem linter instalado eles
não são cobrados por ninguém.

> **Se este número divergir do `padrao-escrita`, o `padrao-escrita` está certo e este catálogo está
> desatualizado.** Repetir um valor é dívida assumida; disputar a posse dele seria o defeito.

| id | nível | verifica | escopo |
|---|---|---|---|
| `limiar-funcao` | erro | função com no máximo **40 linhas** de código (sem brancos, comentários e docstrings); teste fica de fora | módulo |
| `limiar-aninhamento` | erro | no máximo **3 níveis** de bloco de **controle** (`if`/`for`/`while`/`switch`/`try`). Objeto literal, JSX, callback e corpo de função **não** contam — só controle | módulo |
| `limiar-parametros` | erro | no máximo **4 parâmetros** por função (`self`/`cls` não contam) | módulo |
| `excecao-engolida` | erro | nenhum `catch {}` vazio nem `except: pass` — exceção se trata, se traduz ou sobe | módulo |

**O linter continua sendo a verificação profunda** e é onde vivem as regras que exigem AST de verdade:

| Regra | nível | Limiar | Por |
|---|---|---|---|
| complexidade ciclomática | aviso | 10 | linter |
| tipagem estrita nas fronteiras | erro | sem `any` implícito ou explícito | linter (`tsc`, `mypy`) |
| higiene (`eqeqeq`, `no-var`, `prefer-const`, `no-unused-vars`) | erro | — | linter |

Quando as duas camadas discordam, **o linter tem razão**: ele lê AST, o gate lê estrutura de bloco. O gate é
conservador de propósito — na dúvida, não acusa.

# 5. A cadeia de verificação

```
node ferramentas/gate/validar.mjs <caminho-do-modulo>    um módulo
node ferramentas/gate/validar.mjs --todos                todos + as regras globais
node ferramentas/gate/validar.mjs --extracao <caminho>   pronto para virar serviço?
node ferramentas/gate/validar.mjs --json <caminho>       saída para máquina
node ferramentas/sincronizar-env.mjs --conferir          .env.example em dia
```

**A unidade de verificação é o módulo, não o repositório.** Se o verificador só funcionasse no repositório
inteiro, o módulo extraído perderia o verificador junto — e a conformidade morreria exatamente no momento em
que a arquitetura foi cobrada. Ver [[03-operacao]] §7.

**O `_template` de cada binding é validado como um módulo real.** Ele é a única pasta que, se ficar fora do
gate, contamina todos os módulos futuros de uma vez.

# 6. Exceções

`config/conformidade.json` na raiz aceita exceção **nominal**: módulo + regra + motivo + link da decisão em
`specs/adr/000-decisoes-do-template.md` (ou num ADR de projeto em `specs/adr/`). **Sem esse link, o gate
rejeita a própria exceção.**

```jsonc
{
  "excecoes": [
    { "modulo": "legado", "regra": "estrutura-estrita", "motivo": "migração em curso", "decisao": "ADR-007" }
  ]
}
```

A lista começa vazia, e esse é o estado correto.

Achado de escopo `raiz` também se excetua por essa lista, e o `modulo` dele é o literal `"(raiz)"` — o mesmo
rótulo que aparece na saída do gate.

# 7. Limites conhecidos do gate

Esta seção é a diferença entre o que as leis afirmam e o que o gate cobra. **Manter esta seção honesta é
obrigação**: uma lei que esconde a própria lacuna é pior que uma lacuna conhecida.

**Toda regra deste catálogo tem verificador.** O que resta aqui não são regras sem verificador — são a
fronteira do que um verificador estático consegue afirmar, e o que **deixou de ser regra** por não ser
verificável mecanicamente (§1, lei 2).

## 7.1 Deixaram de ser regra

| Antiga regra | Por quê saiu | Onde vive agora |
|---|---|---|
| **Cobertura de teste ~80%** | exige executar os testes; o gate é estático e sem efeito colateral | alvo descrito em [[03-operacao]] §5, explicitamente **não é regra** |
| **`--extracao` prova que os testes passam sem rede** | idem — o comando verifica a *estrutura* da extraibilidade, não executa nada | [[03-operacao]] §6 descreve o que ele realmente checa |
| **`src/` não contém regra de negócio** | "regra de negócio" é julgamento, não forma: nenhum recorte estático separa uma fábrica de adapter de uma decisão de domínio sem acusar a fiação correta ou aprovar a errada | afirmada em [[00-arquitetura]] §3.4, e fica com a **revisão humana**. A metade verificável dela virou regra: `composicao-descoberta` |
| **Teste de integração com banco real (`tests/integracao/`)** | o [[03-operacao]] §5 fecha a questão: *"Tudo roda com adapters de memória, sem rede e sem banco… Se um teste do módulo precisa de infraestrutura, a porta está mal desenhada ou o adapter de memória está faltando"*. Uma regra exigindo a pasta cobraria do módulo exatamente o que a lei proíbe, e a tabela de camadas do §5 é **fechada** em quatro | o `tests/contrato/` já exercita a app fiada com adapters de memória; banco de verdade é do comando `verificar` e do CI (*migrations executáveis contra banco efêmero*), nunca do gate |
| **"o mock do gateway vem do contrato, não da implementação"** | é julgamento, não forma: o mesmo objeto de mock serve às duas origens, e nada no arquivo diz de qual delas ele veio | a metade verificável virou regra — `testes-gateway` afirma que o teste **existe**; a origem do mock fica com a **revisão humana** |
| **`dependencia-fixada` — "lockfile presente"** | o lockfile é **produto do `npm install`**, e o gate promete rodar **sem instalar nada** — é o que permite ele viajar dentro do módulo extraído. Uma regra que exige a saída de um install inverte o contrato do próprio verificador, e a medição mostra o efeito: projeto recém-criado pelo `criar-projeto.mjs` **não tem lockfile em nenhum dos três bindings**, então a regra reprovaria todo projeto no minuto em que ele nasce. No Python não há sequer o que exigir — o template declara `pyproject.toml` e nenhum arquivo de trava. O `package-lock.json` que `estrutura.mjs` conhece é entrada **permitida** da árvore do MÓDULO, não exigida, e não fala da raiz | etapa de CI. `npm ci` **falha sozinho** sem lockfile, com mensagem melhor que a do gate — a checagem sai de graça no passo que já roda o install (Bloco F) |
| **"toda permissão declarada é exigida em alguma rota"** | não é inverificável — é **incompatível** com `permissao-literal`. Detectá-la exigiria procurar a string `<modulo>:ler` no código, que é exatamente o que a outra regra proíbe; e o consumo real é **posicional** (`const [ler, escrever] = config.manifesto.permissoes`), então a string nunca aparece — nem deve | fica com a **revisão humana**. Permissão declarada e nunca exigida é peso morto, mas cobrá-la mecanicamente obrigaria a escrevê-la no código, que é o defeito maior |

A linha do `src/` é a mais recente, e vale registrar por que ela parou aqui em vez de virar regra. A direção de
dependência é forma — `import` está no arquivo ou não está —, e virou as três regras de §4.2. "Não contém regra de
negócio" não é forma: `FABRICAS[porta][provedor]` é fiação legítima e um `if` sobre o `papel` do módulo seria domínio
vazando, e os dois são a mesma construção da linguagem. Escrever a regra exigiria adivinhar a intenção — e uma regra
que adivinha ou acusa a composição correta, ou aprova a errada. Cobertura inventada é pior que lacuna declarada.

As duas linhas de teste acima entraram juntas, e a primeira é a mais importante de registrar: ela não saiu por
ser difícil de verificar — sair de `tests/integracao/` é trivial. Ela saiu porque **a regra contradiria a lei**.
Escrevê-la obrigaria todo módulo com tabela a manter um teste que precisa de banco, quando o §5 trata
exatamente essa necessidade como sintoma de porta mal desenhada. Gate que cobra o contrário da doutrina é pior
que gate que não cobra nada.

A linha das permissões é a única desta seção em que as duas metades se **anulam**: não descartei a inversa por ser
difícil, e sim porque cobrá-la e cobrar `permissao-literal` ao mesmo tempo seria pedir e proibir a mesma linha de
código. Quando duas cláusulas de um mesmo campo se contradizem, escrever as duas é pior que escrever uma.

Rodar teste é do comando `verificar` do projeto, não do gate. Essa separação é o que mantém o gate rápido,
puro e chamável de qualquer lugar — inclusive de dentro de um hook.

## 7.2 Precisão dos verificadores heurísticos

São **duas famílias com política oposta na dúvida**, e saber qual é qual importa mais que a tabela.

**Heurística sobre código** — `limiar-funcao`, `limiar-aninhamento`, `limiar-parametros`, `hardcode-numero`.
Lê estrutura de bloco, não AST, e é **conservadora**: na dúvida, **não acusa**. Admite falso negativo de
propósito; falso positivo, não. Onde o gate e o linter discordarem, o linter tem razão.

**Extração de texto de spec e de mapeador** — `contrato`, `contrato-sincronizado`, `rota-nomenclatura`,
`consome-contrato`, `projecao-contrato`, `resumo-exportado`. Faz o **oposto**: quando não consegue ler, **declara e reprova**.
Calar ali seria indistinguível de conformidade, que é a falha que este §7 inteiro existe para evitar.

A contrapartida, e ela é dura: **"não consegui ler" nunca pode virar "não existe"**. Afirmar ausência do que
não se leu manda o autor apagar o que está certo. Por isso `contrato/openapi.yaml` ilegível tem **um dono só**,
a regra `contrato`, e as **demais** silenciam nesse caso — um defeito, uma mensagem, um conserto.

**`sensivel-em-saida` atravessa as duas famílias**, de propósito, e por isso não está em nenhuma das listas
acima: lê a chamada de log por heurística de bloco — ali vale a política conservadora — e a projeção pelo
mesmo extrator de `projecao-contrato`, de quem herda o falso positivo. Ela não lê o `openapi.yaml`, então
não entra no silêncio de "spec ilegível" do parágrafo anterior. O falso positivo dela é o **mesmo** de
`projecao-contrato` — herdado do mesmo extrator — e está descrito nas duas linhas.

**`ui-token` é a única regra que não consegue honrar nenhuma das duas políticas**, e por isso é a única
`aviso` desta seção. Ela lê declaração de estilo linha a linha: o recorte `propriedade: valor` elimina o falso
positivo que importa — o ícone SVG inline, que usa `atributo="valor"` —, mas não elimina todos, e calar não é
opção porque literal de cor é justamente o que o modo `kit` existe para não ter. Nível `aviso` é a forma
honesta de dizer isso: reporta e deixa passar, até que exista um recorte que a promova a erro. As outras duas
regras de `ui` não são heurísticas — `ui-kit` lê import, e o modo `proprio` é `import-lateral`.

| Regra | Limite conhecido |
|---|---|
| `limiar-funcao`, `limiar-aninhamento`, `limiar-parametros` | assinatura fora do padrão comum pode não ser medida; nenhum falso positivo esperado, falso negativo é possível |
| `rota-publica-autenticada` | cobre **duas** das três coisas que a lei afirma, e a terceira fica declarada aqui em vez de fingida. Cobre: a lista de isenção vir do manifesto (a `api/` lê `rotasPublicas` e não escreve rota literal) e cada entrada apontar para caminho **e método** que o contrato tem. **Não** cobre que o middleware esteja de fato aplicado e na posição certa da cadeia: em TS/JS o wiring é `app.use(autenticacao(...))` no bootstrap, em Python ele vive dentro de `registrar_middlewares`, e não há forma portável de afirmar estaticamente "esta cadeia rejeita quem não tem token". Isso é comportamento, e quem o prova é o teste de contrato, que exercita a requisição de verdade. A cláusula do manifesto é o que sobra de verificável, e ela é o suficiente para pegar o defeito que importa: a lista em vigor ser outra que não a declarada. Spec ausente ou `paths:` ilegível é do `contrato`, e aqui a regra silencia |
| `entrada-allowlist` | cobra a **forma** do defeito, não a ausência da allowlist. Passar o corpo adiante é legítimo e é o que o molde faz — `criar(req.body, …)` chama `lerCorpo`, que rejeita campo desconhecido; proibir a passagem acusaria o código correto. Por isso a regra persegue as três formas em que o corpo vira entidade **sem passar por ninguém**: spread, repositório direto e `Object.assign`. O que escapa: allowlist escrita mas incompleta (campo novo esquecido) — o gate não sabe quais campos deviam estar lá, e essa metade é do teste de contrato. Falso negativo assumido; nenhum falso positivo esperado |
| `cookie-seguro`, `token-em-armazenamento` | **condicionais por desenho**, como `web-declarado` e `artefato-declarado`: cobram onde a superfície existe e silenciam onde não existe — o molde não tem cookie nem storage, e não há o que declarar nele. `cookie-seguro` lê a linha que define o cookie e exige as três flags ali: opções montadas num objeto de várias linhas **escapam** (falso negativo). O vocabulário de cookie de sessão é próprio e não o de `random-inseguro`, de propósito: aquele inclui `csrf`, e o cookie de CSRF no padrão double-submit **precisa** ser legível por JavaScript — exigir `HttpOnly` dele seria falso positivo sobre código correto. `token-em-armazenamento` remove o identificador `localStorage`/`sessionStorage` do texto antes de procurar o contexto secreto, senão guardar o TEMA em `sessionStorage` seria acusado como token pela palavra "session" do próprio identificador |
| `random-inseguro` × `determinismo` | **fronteira explícita, e nenhuma linha cai nas duas.** `determinismo` é dono de `core/` e acusa RNG fraco ali por REPRODUTIBILIDADE, qualquer que seja o uso; `random-inseguro` cala dentro de `core/` e cobre todo o resto do módulo, por SEGURANÇA, e só quando o valor gerado é credencial. O conserto em `core/` (receber a porta `geradorId`) já resolve os dois lados, então acusar duas vezes daria duas mensagens para um conserto só. Limite de `random-inseguro`: exige a palavra de contexto (`token`, `senha`, `session`, …, vocabulário fechado) na MESMA linha do gerador, ou na assinatura imediatamente acima quando a linha é um `return` — é a forma canônica. Contexto mais distante **escapa** (falso negativo), e é o preço de não acusar `const jitter = Math.random()` só porque a função fala de token. `hash` fica fora do vocabulário: aqui ele é o identificador público do registro, não segredo |
| `gitignore-segredo` | lê o **arquivo de ignore**, e só ele. Não afirma que o `.env` está versionado — isso exigiria `git ls-files`, e o gate não roda git de propósito (é o que o mantém puro e chamável de dentro de um hook). O `.env` que **já foi commitado** é do passo de CI, fail-closed, e do hook `cyber-git-seguro` na fronteira do git. O casador entende um subconjunto do gitignore — padrão sem barra casa o nome em qualquer profundidade, com barra casa o caminho a partir da raiz, `*` não atravessa `/`, e vence o último padrão que casa (inclusive `!`). Forma exótica que ele não alcance faz a regra **acusar**, não calar |
| `segredo-em-publico` | vocabulário fechado nos dois eixos — prefixo público de bundler e sufixo de credencial, este ÚLTIMO compartilhado com `gateway-credencial` (uma lista só). Bundler novo ou sufixo fora da lista passa: falso negativo assumido, nenhum falso positivo esperado. **Não** julga o VALOR, só o nome: uma chave pública com nome de credencial e valor inócuo é acusada do mesmo jeito — e deve ser, porque o nome é o contrato que o próximo leitor vai acreditar. Chave sem prefixo público usada no front **não** é defeito e não entra aqui: o bundler não a injeta, e ela chega `undefined` |
| `verificacao-declarada`, `lint-derivado` | são regras de escopo **`raiz`**, e silenciam quando a raiz não tem `modulos/` — módulo extraído e ainda não religado a um esqueleto não é projeto, e cobrar política de projeto dele seria falso positivo garantido. Essa é a mesma janela do `.ruff.toml`: enquanto ela dura, quem cobra os limiares é o gate, que viaja dentro do módulo. Dentro de um projeto de verdade não há silêncio — arquivo ausente **reprova**, porque "nenhuma política declarada" não pode ser indistinguível de "política conforme". `lint-derivado` compara byte a byte: qualquer edição manual acusa, não só a troca de um número, e é de propósito — a config é gerada, e um arquivo gerado não tem edição legítima |
| `manifesto-raiz` | verifica **forma**, e só ela: que `projeto.json` existe, é JSON legível e conforma ao schema. Não afirma nada sobre o que a raiz FAZ — quem cobrará a direção de dependência da fiação e a segurança dela são as regras dos blocos seguintes. O manifesto nasce **mínimo** de propósito, com `envRequerido` e mais nada, e a regra do template é dura: **campo novo só entra junto com a regra que o cobra**. `portas` (quais existem, quem implementa) fica de fora até haver verificador que o use — `ui`, `exportaResumo` e `geraArtefato` ficaram anos declarados sem um, e é o vício que o `additionalProperties: false` do schema agora impede de repetir |
| `env-raiz-declarado` | lê `adapters/`, `src/` e `packages/`, e **só**. `ferramentas/` fica fora de propósito — é o gate, que o template instala e ninguém edita —, e `modulos/` já tem as regras de escopo `modulo` inteiras. Consequência assumida: chave `RAIZ_*` consumida **fora** dessas três pastas (um `docker-compose.yml`, um script de operação) é acusada como declarada-e-sem-leitor. Não é falso positivo por acidente: env da raiz se lê na composição, que é onde a fiação mora. Como `env-declarado`, ela lê `textoDeCodigo` e não o texto cru, então chave citada **só** em comentário não conta como lida — e deve não contar: comentário não consome variável de ambiente. O prefixo `RAIZ_` é reservado por convenção (§3.1) e não por mecanismo: um módulo cujo `id` fosse literalmente `raiz` produziria chaves `RAIZ_*` indistinguíveis das da raiz. Limite conhecido, e o único caso em que as duas convenções colidem |
| `portas-pura`, `adapter-isolado`, `composicao-descoberta` | leem **forma de import** — o mesmo extrator de `import-lateral` —, e o recorte é deliberado: **import é dependência, leitura de arquivo é descoberta**. É por isso que `src/composicao`, que alcança todos os módulos por `readdirSync` mais o `modulo.json` de cada pasta, passa limpo; uma regra que procurasse a string `modulos` acusaria o próprio desenho que ela protege ([[00-arquitetura]] §3.4). O alvo é resolvido por **caminho**: import relativo resolvido contra o arquivo que o escreveu, e specifier/dotted pelo primeiro segmento (`adapters.memoria`, `modulos/x/…`). **O que escapa: a forma por nome de package** (`@<escopo>/catalogo`), e é falso negativo assumido, não descuido — a raiz não conhece o escopo do projeto nem a lista de módulos (regra de escopo `raiz` recebe `ctx.projeto`, não os contextos de módulo), e `@<escopo>/x` é indistinguível de `@aws-sdk/x` **por forma**: acusá-lo reprovaria todo adapter com SDK de escopo, que é o único lugar onde ele pertence. Quem cobre essa forma no módulo é `import-lateral`, que **tem** a lista de ids. Import relativo que sobe acima da raiz do projeto sai do alcance das três e não é acusado — ali ele deixou o projeto, e afirmar área seria inventar |
| `portas-pura` | "não depende de nada" tem um recorte, e ele é obrigatório: **biblioteca-padrão da linguagem não conta**. `packages/portas/__init__.py` importa `dataclasses`, `typing` e `__future__` — é disto que uma interface é feita, e contá-las acusaria um molde conforme. Dependência externa **em geral** também não é cobrada, e por decisão de escopo: `packages/ui-kit` existe justamente para importar a biblioteca de UI bruta ([[00-arquitetura]] §3.3), então a proibição vale só para `packages/portas/` e só para o vocabulário fechado de SDK de fornecedor — pacote externo fora dessa lista passa. Import entre packages (`portas/` → `ui-kit/`) **não** é acusado: não é inversão do diagrama, e o valor de proibi-lo não paga o falso positivo |
| `adapter-isolado` | dependência **externa** aqui é o desenho, não o defeito, e a regra não a toca: `adapters/` é onde `pg`, `@supabase/*` e `boto3` pertencem. A simétrica no módulo é `sdk-fornecedor`, e as duas nunca acusam o mesmo arquivo — nenhum arquivo é módulo e adapter ao mesmo tempo. `adapters/` importando `packages/` além de `portas/` não é acusado, pelo mesmo motivo do parágrafo acima |
| `sql-concatenado` × `sql-no-modulo` | **fronteira por coleção, e nenhum arquivo cai nas duas**: a primeira lê `ctx.projeto.codigo` (`adapters/`, `src/`, `packages/`), a segunda lê `ctx.codigo` (a pasta do módulo), e `contexto.mjs` mantém as duas disjuntas por construção — o código da raiz nunca entra em `ctx.codigo`, e `modulos/` nunca entra em `projeto.codigo`. O discriminador é **um só** (`ehSqlInjetado`), então os limites da linha abaixo valem para as duas, e nenhuma pode passar a acusar o que a outra deixa passar. Por que a segunda existe: a superfície canônica de `packages/portas/` é tipada por **operação** — `listar`, `buscarPorHash`, `inserir`, `contar`, e nenhuma porta aceita comando —, mas o `core/portas/` do MÓDULO é escrito pelo autor do módulo e **nada compara a forma dele com a canônica**. Declarar ali um `executarConsulta(sql: string)` é legal aos olhos do gate, e a partir daí a concatenação mora no módulo e a execução na raiz: a regra de raiz vê o `.query(sql)` do adapter e não vê como a string nasceu. Medido: a mesma linha, acusada em `adapters/` e calada em `modulos/`. **O que continua sem verificador é a causa**, não o sintoma — que o `core/portas/` do módulo espelhe a forma canônica. Cobri-lo exigiria o módulo enxergar `packages/`, e a unidade de verificação é o módulo (§1.1): o módulo extraído não vê a raiz de onde saiu. Falso negativo assumido, e o que sobra dele é só a porta de forma errada sem SQL injetado passando por ela |
| `sql-concatenado`, `sql-no-modulo` | pertencem à família **conservadora**: na dúvida, não acusam. Exigem as duas condições na MESMA linha — parece SQL, e o valor entra na string. Três limites reais, todos falso negativo. **(1)** Em Python, SQL escrito em string de aspas triplas escapa por inteiro: o extrator de linhas de código descarta qualquer linha que contenha `"""`/`'''` — é o mesmo extrator que impede a lei escrita num comentário de virar violação dela mesma, e essa proteção vale mais que esta metade da cobertura. **(2)** SQL quebrado em várias linhas, com o verbo numa e a interpolação noutra, escapa. **(3)** O operador `%` exige espaço depois dele (`"…" % id`), porque sem isso `where nome like '%joao%'` — um padrão LIKE correto — seria acusado pelo `%` literal. Concatenação de literal com literal (`'select a' + ' from b'` ) **não** é acusada de propósito: é feio e não é injeção. Nenhum falso positivo esperado |
| `segredo-em-log` | o sinal é a **declaração que já existe** — `projeto.json:envRequerido` filtrado pelo vocabulário fechado de sufixo de credencial —, e não um campo novo: a raiz não tem `camposSensiveis`, e o `additionalProperties: false` do schema torna acrescentá-lo uma decisão explícita, não um efeito colateral. O que escapa, e é tudo falso negativo: segredo que vive só numa variável local, sem chave declarada; credencial cujo nome está fora do vocabulário de sufixo; e o valor **copiado** para outra variável antes de ser logado — a regra procura o nome da chave na linha do log, não rastreia o valor. A lista de chamada de log é deliberadamente mais larga que a de `sensivel-em-saida`: inclui `logging`, `warning`, `critical`, `exception` e a saída direta (`console.*`, `print(`), porque na raiz não existe regra proibindo `console` — ali quem o cobra é o linter. **As duas listas divergem, e isso está registrado** como dívida: unificá-las mudaria o comportamento de `sensivel-em-saida`, que é regra de módulo e de outro bloco |
| `hardcode-url-raiz`, `fallback-raiz` | herdam **exatamente** os limites dos gêmeos de módulo, porque a implementação é a mesma (`URL_LITERAL` e `PADROES_DE_FALLBACK`, uma cópia só): URL montada por concatenação escapa da primeira, e default obtido fora das quatro formas conhecidas escapa da segunda. `fallback-raiz` **não** proíbe ler `process.env` na fiação, e a distinção importa: ler o ambiente é o ofício de `src/` — o inverso do que `env-fora-do-carregador` cobra no módulo —, e a chave usada e não declarada é de `env-raiz-declarado`. Só o DEFAULT é o defeito |
| `hardcode-numero` e `random-inseguro` **não** valem na raiz | e a ausência é decisão, não lacuna esquecida. `packages/portas/` contém a **taxonomia fechada de erro** ([[02-contrato-e-dados]] §3.1) — `VALIDACAO: 400`, `LIMITE_EXCEDIDO: 429`, … —, que é literal de dois ou mais dígitos atribuído a identificador, e `LIMITE_EXCEDIDO` contém a palavra `limite`, do vocabulário de infraestrutura do `hardcode-numero`: portá-lo faria o gate acusar o código que **é** a doutrina. `random-inseguro` também fica fora — `adapters/memoria/` gera o `hash` do registro com `Math.random()`, e `hash` está fora do vocabulário secreto justamente por ser identificador público, não segredo. Portar qualquer dos dois por simetria é mudança de escopo, e exige decidir antes o que fazer com essas duas peças |
| `testes-web`, `testes-gateway` | verificam **presença**, nunca conteúdo, e são **condicionais por desenho** como `web-declarado` e `artefato-declarado`: cobram onde a superfície existe e silenciam onde não existe. `testes-web` não checa os três estados (`loading`, `empty`, `error`) que o §5 pede — a mensagem os cita para o conserto ser o certo, mas a regra afirma só que a pasta não está vazia. `testes-gateway` casa por **convenção de nome**, liberal nas quatro formas que as três linguagens usam (`<g>.test`, `<g>.spec`, `test_<g>`, `<g>_test`): um teste que exercite o gateway sob nome que não o espelhe **escapa** — falso negativo, e o conserto é renomear, que o §3.1 já pede. Ela **não** impõe a pasta do teste, porque o §5 não tem camada `tests/gateways/`; e não olha o que o teste faz, o que está declarado no §7.1 |
| `porta-declarada` | compara **nomes**, nunca o provedor: `"repositorio": "inexistente"` passa aqui, porque saber se existe fábrica para aquele provedor exige ler `src/composicao`, que é da raiz e não viaja com o módulo. Essa metade é do boot, que falha alto e imediatamente — `resolverDependencias` lança nomeando a porta e o provedor. Chave iniciada por `_` é comentário e fica de fora, pela mesma convenção do validador de schema. Manifesto ou config ilegível silencia: são de `schema-manifesto` e `config-valida` |
| `navegacao-declarada` | **uma direção só**, e a inversa é legítima: `rotaWeb` sem `navegacao` é a página alcançável por URL direta e fora do menu — a tela de detalhe é o caso ordinário, e cobrar a inversa a proibiria. Verifica a **existência** da declaração, não a forma dela (`{label, icone, ordem}` é do `schema-manifesto`). O **`icone` não é verificado e não há como verificar**: o template não conhece conjunto de ícones nenhum — quem os resolve é o conector, que é aplicação, não template. `icone: "Inexistente"` passa, e é falso negativo assumido |
| `permissao-literal` | cobra a **forma** do defeito — literal no argumento —, e só na `api/`. O que escapa: permissão vinda de um arquivo de constantes do próprio módulo, que não é literal na linha e também não vem do manifesto. A cláusula que a pegaria (*a `api/` lê `modulo.json:permissoes`*) **não** foi escrita, e o motivo é medido: o token `permissoes` não é distintivo — ele aparece em `request.state.permissoes` e em `claims.get("permissoes")` dentro do middleware, então a checagem passaria vacuamente no molde Python. Matcher que passa e não significa nada é pior que lacuna declarada. O análogo do `rota-publica-autenticada` pôde escrever a dele porque `rotasPublicas` é um token que só existe no manifesto |
| `tabela-declarada` × `rls` | **fronteira explícita, e nenhuma tabela cai nas duas.** `tabela-declarada` é dona de "a tabela não existe no SQL"; `rls` só pergunta de tabela que o SQL cria. Antes desta fronteira a tabela ausente caía no `rls` com a mensagem errada — *"sem ENABLE ROW LEVEL SECURITY"* —, mandando acrescentar RLS a uma tabela inexistente. E há uma terceira fronteira, acima das duas: módulo que declara tabela e **não tem SQL nenhum** é do `migrations` (*"declara tabelas mas nao tem database/migrations/"*), e `tabela-declarada` silencia ali — senão um módulo sem banco receberia N+1 mensagens para um conserto só. O casador procura `CREATE TABLE` sem atravessar `;` nem entrar na lista de colunas, então `create table x (… y_id …)` não conta como criação de `y`; tabela criada por forma exótica (SQL gerado, `execute` dinâmico) **escapa** — falso negativo assumido |
| **Leitura de código: comentário não é código** | Toda regra que julga CÓDIGO lê `textoDeCodigo` — o arquivo sem comentário nem docstring —, e **nunca** o texto cru. É o que impede a própria lei escrita num comentário de virar violação dela mesma: um bloco documentando *"como NÃO fazer: `import { X } from '@acme/fin'`"* acusava `import-lateral`, `import-adapter` e `sdk-fornecedor` de uma vez, sobre código correto. Vale para as sete regras que leem import (`import-lateral`, `import-adapter`, `sdk-fornecedor`, `ui-kit`, `portas-pura`, `adapter-isolado`, `composicao-descoberta`), mais `gateway-http`, `env-declarado`, `env-raiz-declarado`, `env-fora-do-carregador`, `tabela-alheia` e os **dois extratores da família Contrato** (`rotasDoCodigo`, de `contrato-sincronizado`; `chavesDaProjecao`, de `projecao-contrato`, `payload-camelcase` e `sensivel-em-saida`) — estes últimos foram os que ficaram de fora por mais tempo, e ali o comentário produzia rota fantasma e projeção fantasma. **O recorte não é total, e o resto fica aqui — os dois são FALSO POSITIVO, e estão medidos, não supostos:** **(1)** `linhasCodigo` descarta a linha que **abre** com cerca de comentário, não o comentário **no fim** de linha de código — `export const n = 1; // router.get('/x', h);` sobrevive inteiro e é acusado; **(2)** remove comentário e docstring, **não string** — `const exemplo = "router.get('/x', h)"` também é acusado, porque é código de verdade, e separar literal de instrução exigiria AST. Os dois exigem que a forma proibida esteja na MESMA linha de código executável, o que é raro em código escrito para ser lido: a documentação de "como não fazer" vive em linha própria, e é ela que os quatro casos de comentário do autoteste travam. Declarado em vez de prometido resolvido |
| Quem lê o texto CRU, e deve | `migrations` procura `-- rollback`, que **é** um comentário SQL — ali o comentário é o dado, não ruído. Idem `lerParesEnv` sobre `.env`/`.env.example`, todos os leitores de `openapi.yaml` e o `juntarSql` de `rls`/`tabela-declarada` (o extrator de linhas não remove `--`, então em SQL ele não ajudaria). **Uma regra ainda lê cru e erra para o SILÊNCIO**, e ali é tolerado por ser a direção conservadora: `config-morta` conta uma chave citada em comentário como "lida" — falso negativo num `aviso`, e torná-la estrita seria mudança de comportamento, não conserto de falso positivo. A cláusula de origem do `rota-publica-autenticada` **era** a segunda e deixou de ser: ela afirma que a `api/` LÊ `modulo.json:rotasPublicas`, e prosa não lê nada — as três docstrings do molde que EXPLICAM `rotasPublicas` satisfaziam a checagem, então um módulo que tivesse apagado a leitura de verdade passava calado pelo comentário que a descreve. Falso negativo que APROVA em silêncio é o que este §7 existe para evitar, e é a diferença entre ele e o do `config-morta`, que só deixa de avisar |
| `ui-kit` | **não** verifica que `packages/ui-kit` existe no projeto, e isso é decisão, não lacuna: a unidade de verificação é o **módulo**, e o módulo extraído não enxerga a raiz do repositório de onde saiu (§1.1). O que ela cobra é a dependência **declarada de dentro do módulo** — o import. Vocabulário de biblioteca bruta é **fechado**, como o do `sdk-fornecedor`: biblioteca fora da lista passa (falso negativo assumido), e nenhum falso positivo é esperado. `react`/`vue` estão fora de propósito — são o framework em que o kit é escrito, não a biblioteca que ele envolve |
| `ui-token` | é **aviso**, e a única cláusula heurística das três de `ui`. O recorte exige `propriedade **:** valor`, que é a forma de toda declaração de estilo, e deixa de fora `atributo **=** "valor"` — por isso o ícone SVG inline com `fill="#000"` **não** é acusado: fica fora por forma, não por lista de exceção. Lê **código e folha de estilo** (`.css`, `.scss`, `.sass`, `.less`) dentro de `web/` — a folha entra porque em `ui.modo: "kit"` ela é onde a cor literal mais vive, e restringir a regra a arquivo de código a deixava limpa justamente ali. Em folha de estilo a fonte usa outro discriminador, porque CSS não usa aspas: `font-family:` é literal a menos que o valor seja `var(…)` ou palavra-chave da linguagem. O que ainda escapa: cor montada por indireção (concatenação, `template literal` com variável) — falso negativo; regra CSS escrita numa linha só e iniciada por seletor de **id** (`#cabecalho { color: #fff; }`), que o extrator de linhas descarta por confundir o `#` inicial com comentário — falso negativo; e cor dentro de um objeto de props espalhado em elemento SVG (`{...{fill: '#000'}}`) — falso positivo residual, e a razão de o nível ser aviso e não erro |
| `artefato-declarado` | verifica **presença**, nunca conteúdo: motor que não gera nada e template vazio passam. As duas pastas de fonte (`core/motor/`, `core/templates/`) são provadas por **arquivo** — pasta vazia conta como ausente, e deve. `gerados/` é provada pela **entrada da raiz**, porque o conteúdo dela é saída de máquina e fica fora da varredura de propósito (varrê-lo faria `hardcode-url`, `limiar-funcao` e `log` julgarem HTML gerado); a assimetria é deliberada — `gerados/` nasce vazia e só se enche em build. `database/` fica **fora**: o `criar-modulo.mjs --sem-artefato` também a descarta, mas quem declara banco é `dados.tabelas`, e cobrá-la aqui daria falso positivo garantido no módulo de domínio sem artefato e com tabela própria — o caso ordinário |
| `resumo-exportado` | lê o bloco **daquela rota** dentro de `paths:` e segue o `$ref` até `components.schemas` — leitor por rota, não do arquivo inteiro, senão `total` declarado em `/registros` aprovaria `/resumo` por acidente. Verifica a **declaração do nome**, não o tipo: `total: { type: string }` passa, e essa metade é do teste de contrato, que exercita a resposta de verdade. **Uma direção só**: `exportaResumo: false` não proíbe nada. `/resumo` ausente é do `contrato`, e contrato ilegível também — nos dois casos ela silencia |
| `hardcode-numero` | pega literal atribuído a nome de infraestrutura; número mágico com nome de negócio passa (e deve — o lugar dele é `config/dominio.json`) |
| `contrato` | **dona** de "spec ilegível": o leitor é de bloco, sem dependência externa — é o que permite o gate viajar com o módulo extraído e rodar sem instalar nada. Detecta pelo **resultado** da leitura, nunca pela causa: *flow style* (`paths: {"/x": …}`) é a mais comum, mas `paths:` indentado com 4 espaços é bloco válido e cai pelo mesmo caminho — o leitor exige recuo **exatamente** 2 na rota e 4 no método. A mensagem nomeia **qual** seção falhou (`paths:`, `servers:` ou as duas) e a forma que o leitor aceita — nunca "a rota não existe". `servers:` ilegível não cega a checagem de nome das rotas, que só depende de `paths:` |
| `contrato-sincronizado` | reconhece registro de rota em Express/FastAPI. Framework diferente faz a regra **declarar que não verificou**, em vez de passar calada. Do lado da spec ela silencia: contrato ilegível é do `contrato` |
| `sensivel-em-saida` | cobre projeção e chamada de log, com precisão diferente em cada metade. Na **chamada de log**, heurística de bloco conservadora: campo sensível montado por indireção (spread, `Object.assign`) escapa — falso negativo. Na **projeção**, usa o extrator de `projecao-contrato` e herda os limites dele — **todos**, sem exceção, e o maior deles é o mais grave aqui: `{` na assinatura desvia a leitura, e um campo sensível de fato publicado deixa de ser visto. Herda também o falso positivo: campo sensível citado num objeto intermediário **dentro** da função de projeção é acusado como se fosse publicado |
| `projecao-contrato` | **uma direção só**, de propósito: pega campo projetado e não declarado. A inversa (propriedade declarada e nunca projetada) **não** é cobrada — `/health`, `/meta` e `/resumo` são montadas pela própria `api/` e o schema `Erro` pelo tratador de erro, nenhum deles passa pelo mapeador, então cobrá-la seria falso positivo garantido. O extrator delimita a projeção **balanceando chaves** a partir de `paraContrato`/`para_contrato`, e por isso não atravessa a função seguinte, qualquer que seja a quebra de linha. Só conta **sítio de DEFINIÇÃO**: se houver `}` ou `;` entre o nome e a `{`, o nome era uma **referência** e o sítio é descartado — sem isso, `registros.map(paraContrato)` dentro de `paraColecao` não tinha `{` própria e engatava na abertura da função SEGUINTE, fazendo uma função que publica nada (um `chaveDeCache` devolvendo `{ created_at }`) ser acusada por `payload-camelcase`. Esse discriminador separa referência de definição e nada mais — ele **não** afirma que a `{` encontrada seja a do corpo, e o limite maior desta regra é justamente esse. Cada par (arquivo, campo) rende **uma** mensagem: a região não guarda número de linha, então duas projeções do mesmo campo no mesmo arquivo produziam a mesma frase duas vezes, e a segunda não dizia nada que a primeira já não dissesse. Os limites reais, do maior para o menor: **(1) `{` na ASSINATURA desvia a leitura inteira** — a abertura é a primeira `{` depois do nome, e não a do corpo, então tipo de retorno inline (`): { total: number } {`), tipo de parâmetro inline, genérico com objeto (`<T extends { … }>`), `Array<{ … }>` e valor default de parâmetro (`= {}`) fazem a região ser a ANOTAÇÃO: os nomes do tipo são acusados como se fossem campos publicados (**falso positivo**) e os campos de fato projetados não são verificados por ninguém (**falso negativo** — um `cpf` publicado escapa de `sensivel-em-saida`). Vale para toda `{` na assinatura; o molde não é atingido porque escreve `): Record<string, unknown> {`, e o Python só é atingido pelo default mutável (`opts={}`), que o próprio linter já proíbe. É **pré-existente** e não tem guarda barata: das três testadas, ignorar `{` dentro de parênteses cega a projeção em arrow (`=> ({ … })`) e o objeto aninhado; olhar adiante da região só resolve o tipo de retorno; e um *lookahead* de assinatura resolve todas menos dois parâmetros com tipo inline e tipo inline com default, e alargá-lo para essas duas degenera em "pegue a última `{`", que quebra as formas de corpo. O conserto não é uma guarda: é a região passar a ser **o objeto literal em posição de retorno**, e isso é redesenho do extrator, com casos próprios. **(2)** projeção montada por indireção (spread, `Object.assign`, dicionário construído em laço) **escapa** — falso negativo. **(3)** `}` dentro de **string** conta para o balanceamento, então `{ rotulo: '}}', campoNovo: x }` fecha a região antes do `campoNovo`, que **escapa** — falso negativo, e o preço de não ser um lexer. **(4)** objeto intermediário declarado **dentro** da própria função de projeção (`const interno = { … }`) entra na conta como se fosse publicado — falso positivo, evitável montando a saída num `return` só. Chave fora de camelCase é do `payload-camelcase` e não é acusada aqui |
| `rota-nomenclatura` | lê `servers:` e `paths:` linha a linha; contrato ilegível é do `contrato`, e aqui ela silencia. O verbo sai de vocabulário fechado (PT e EN): verbo fora da lista passa, e substantivo homógrafo de verbo acusa. **Plural não é verificado** (§3.1) |
| `consome-contrato` | compara **rota**: pega renome, remoção e troca de método. Mudança de forma **dentro** do schema (tipo alterado, campo que virou opcional, enum que perdeu valor) passa — a regra lê o caminho e o método, nunca o corpo. Contrato compatível na rota e incompatível no payload continua sendo trabalho de revisão. Spec do **dono** ilegível não acusa no consumidor: o defeito é do dono, e o `contrato` dele o reporta |

## 7.3 O gate se testa

`ferramentas/gate/testes/` mantém um módulo-fixture conforme e um fixture por regra violada. Regra nova sem
teste não entra, e regressão no gate reprova sozinha — a mesma disciplina que o gate exige dos módulos.

**Toda regra deste catálogo tem caso próprio**, e "próprio" é a palavra que importa: co-achado declarado em
`tambem` é **teto, não obrigação** — a regra que só aparecia ali podia parar de acusar sem nada falhar. Um
caso por regra é o que torna as duas coisas distinguíveis.

**O caso roda nos três bindings, não naquele em que foi escrito.** Um caso que fixasse
`api/src/routes/index.ts` provaria a regra só em TypeScript, embora ela valha nos três. Por isso o caso nomeia
um **alvo lógico** (`rotas`, `mapeadores`), que o harness resolve para o caminho de cada binding, e declara o
trecho por **família de sintaxe** — TS e JS registram rota do mesmo jeito, Python usa decorator. Resolver só o
caminho seria pior que a lacuna: o caso deixaria de pular, o trecho não casaria com a linguagem, a regra não
acharia nada e o autoteste anunciaria cobertura inexistente. Mutação agnóstica — manifesto, `config/*.json`,
`openapi.yaml`, SQL — não precisa de nenhum dos dois.

**O que não dá para portar continua aparecendo como SEM COBERTURA, com o motivo, nunca como aprovação.** Caso
que muta `web/` não roda no molde Python, que nasce sem tela por desenho; inventar cobertura ali seria pior
que declarar a ausência.
