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
| **escopo** | `módulo` roda por módulo; `global` exige ver todos (só no `--todos`) |

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
| Variável exposta ao browser | prefixo do build + `<MODULO>_` | `VITE_CATALOGO_API_BASE_URL` |
| Arquivo de config | kebab-case, um assunto por arquivo | `config/seguranca.json` |
| Chave de config | camelCase | `paginaTamanhoMaximo` |
| Permissão | `<modulo>:<acao>` | `catalogo:escrever` |
| Código de erro | SCREAMING_SNAKE da taxonomia fechada | `NAO_ENCONTRADO` |

**Um nome, um lugar.** O identificador do módulo é o mesmo na pasta, no package, na rota, no prefixo de tabela,
no prefixo de env e no `modulo.json`. Divergência é erro de gate, não estilo.

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
| `artefato-declarado` | erro | o `geraArtefato` do manifesto e a árvore concordam, **nos dois sentidos**: `true` exige `core/motor/`, `core/templates/` e `gerados/`; `false` proíbe as três. `database/` **não** entra — quem declara banco é `dados.tabelas` (§7.2) | módulo |
| `testes` | erro | `tests/dominio/` não-vazio; `tests/contrato/` não-vazio em módulo com rota | módulo |

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

## 4.3 Dados

| id | nível | verifica | escopo |
|---|---|---|---|
| `schema-nao-public` | erro | `dados.schema` presente e diferente de `public` | módulo |
| `tabela-prefixo` | erro | toda tabela em `dados.tabelas` começa com `dados.prefixo` (= `<id>_`) | módulo |
| `tabela-alheia` | erro | nenhum identificador `<outro-modulo>_<algo>` aparece no código ou no SQL do módulo | global |
| `migrations` | erro | nome no padrão `NNNN-verbo-objeto.sql`; toda migration tem bloco `-- rollback` | módulo |
| `rls` | aviso | toda tabela declarada tem `ENABLE ROW LEVEL SECURITY` no SQL do módulo | módulo |

## 4.4 Configuração e ambiente

| id | nível | verifica | escopo |
|---|---|---|---|
| `config-valida` | erro | os cinco `config/*.json` existem e são JSON válido | módulo |
| `schema-config` | erro | cada `config/*.json` conforma ao seu JSON Schema em `ferramentas/gate/schemas/`. `api`, `seguranca` e `portas` têm forma fechada (campo não previsto reprova); `dominio` e `textos` são livres por definição | módulo |
| `cors-aberto` | erro | `seguranca.cors.origensPermitidas` não contém `*` — origem é **declarada**, uma a uma | módulo |
| `config-morta` | aviso | nenhuma chave de primeiro nível em `config/*.json` declarada e nunca lida pelo código | módulo |
| `hardcode-url` | erro | nenhuma URL literal (`http://`, `https://`) no código do módulo, fora de teste e de comentário | módulo |
| `hardcode-numero` | erro | nenhum literal numérico (≥ 2 dígitos) atribuído a identificador de infraestrutura (`porta`, `timeout`, `limite`, `max*`, `ttl`, `janela`, `intervalo`, `tentativas`) fora de `config/` e de teste | módulo |
| `fallback-silencioso` | erro | nenhum `process.env[...] ?? '<literal>'` (nem `or`/`getenv(..., '<literal>')` no Python) | módulo |
| `env-declarado` | erro | toda chave `<MODULO>_*` usada no código está em `modulo.json:envRequerido` | módulo |
| `env-exemplo` | erro | o `.env.example` do módulo e o `envRequerido` do manifesto coincidem exatamente, nos dois sentidos | módulo |
| `env-modulo` | erro | o `.env` do módulo só contém `ENV_RAIZ` e chaves `<MODULO>_*` — nunca chave de outro módulo | módulo |
| `env-fora-do-carregador` | aviso | `process.env` lido fora do carregador de config e da config de build | módulo |
| `gitignore-segredo` | erro | o `.gitignore` da raiz ignora `.env` **e** `modulos/*/.env` — o `.env.example` segue versionado. Verifica o arquivo de ignore, **não** o que já está versionado: isso exigiria `git ls-files`, e o gate não roda git (§7.2) | módulo |
| `segredo-em-publico` | erro | nenhuma chave com prefixo **público** de bundler (`VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, `REACT_APP_`, `NUXT_PUBLIC_`, `EXPO_PUBLIC_`, `GATSBY_`) tem nome de credencial — o bundler injeta esse valor no bundle do front, onde qualquer visitante o lê. Olha o `envRequerido` **e** o código. Sem isenção por `papel`: nem o gateway publica a credencial dele | módulo |
| `verificacao-declarada` | erro | a raiz do projeto tem `config/verificacao.json`, JSON válido e conforme ao schema (`ferramentas/gate/schemas/verificacao.schema.json`) — cobertura mínima, severidade de dependência e ferramenta por linguagem. **Não** guarda limiar: 40/3/4 são lei (§4.7). Módulo solto, fora de projeto, silencia (§7.2) | módulo |
| `lint-derivado` | erro | a config do linter na raiz (`eslint.config.js` ou `.ruff.toml`) é **byte a byte** o que `ferramentas/gerar-config-lint.mjs` produziria a partir de `ferramentas/gate/limiares.mjs`. Editar a config à mão faz o linter e o gate cobrarem limiares diferentes — e o §7.2 manda o linter vencer, o que tornaria a divergência invisível | módulo |

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
| `saida-crua` | erro | nenhuma resposta devolve o registro cru (`json(registro)`, `json(linha)`, `json(row)`, `json(dados)`, `return linha`) | módulo |

## 4.6 Operação

| id | nível | verifica | escopo |
|---|---|---|---|
| `log` | erro | nenhum `console.*` (ou `print(`, no Python) no código do módulo, fora de teste | módulo |
| `determinismo` | erro | nenhum `Math.random()`/`new Date()` (ou `random.`/`datetime.now`) dentro de `core/` — use as portas `geradorId` e `relogio` | módulo |
| `random-inseguro` | erro | nenhum token, segredo ou id de sessão gerado com RNG **não-criptográfico** (`Math.random`, módulo `random` do Python) **fora** de `core/` — use CSPRNG. Dentro de `core/` quem cobra é `determinismo`, e as duas nunca acusam a mesma linha (§7.2) | módulo |
| `gateway-credencial` | erro | módulo com `papel` diferente de `gateway` não declara credencial de serviço externo (`*_API_KEY`, `*_SECRET`, `*_TOKEN`) | módulo |

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
| `random-inseguro` × `determinismo` | **fronteira explícita, e nenhuma linha cai nas duas.** `determinismo` é dono de `core/` e acusa RNG fraco ali por REPRODUTIBILIDADE, qualquer que seja o uso; `random-inseguro` cala dentro de `core/` e cobre todo o resto do módulo, por SEGURANÇA, e só quando o valor gerado é credencial. O conserto em `core/` (receber a porta `geradorId`) já resolve os dois lados, então acusar duas vezes daria duas mensagens para um conserto só. Limite de `random-inseguro`: exige a palavra de contexto (`token`, `senha`, `session`, …, vocabulário fechado) na MESMA linha do gerador, ou na assinatura imediatamente acima quando a linha é um `return` — é a forma canônica. Contexto mais distante **escapa** (falso negativo), e é o preço de não acusar `const jitter = Math.random()` só porque a função fala de token. `hash` fica fora do vocabulário: aqui ele é o identificador público do registro, não segredo |
| `gitignore-segredo` | lê o **arquivo de ignore**, e só ele. Não afirma que o `.env` está versionado — isso exigiria `git ls-files`, e o gate não roda git de propósito (é o que o mantém puro e chamável de dentro de um hook). O `.env` que **já foi commitado** é do passo de CI, fail-closed, e do hook `cyber-git-seguro` na fronteira do git. O casador entende um subconjunto do gitignore — padrão sem barra casa o nome em qualquer profundidade, com barra casa o caminho a partir da raiz, `*` não atravessa `/`, e vence o último padrão que casa (inclusive `!`). Forma exótica que ele não alcance faz a regra **acusar**, não calar |
| `segredo-em-publico` | vocabulário fechado nos dois eixos — prefixo público de bundler e sufixo de credencial, este ÚLTIMO compartilhado com `gateway-credencial` (uma lista só). Bundler novo ou sufixo fora da lista passa: falso negativo assumido, nenhum falso positivo esperado. **Não** julga o VALOR, só o nome: uma chave pública com nome de credencial e valor inócuo é acusada do mesmo jeito — e deve ser, porque o nome é o contrato que o próximo leitor vai acreditar. Chave sem prefixo público usada no front **não** é defeito e não entra aqui: o bundler não a injeta, e ela chega `undefined` |
| `verificacao-declarada`, `lint-derivado` | são as duas únicas regras sobre o **projeto**, e silenciam quando a raiz não tem `modulos/` — módulo extraído e ainda não religado a um esqueleto não é projeto, e cobrar política de projeto dele seria falso positivo garantido. Essa é a mesma janela do `.ruff.toml`: enquanto ela dura, quem cobra os limiares é o gate, que viaja dentro do módulo. Dentro de um projeto de verdade não há silêncio — arquivo ausente **reprova**, porque "nenhuma política declarada" não pode ser indistinguível de "política conforme". `lint-derivado` compara byte a byte: qualquer edição manual acusa, não só a troca de um número, e é de propósito — a config é gerada, e um arquivo gerado não tem edição legítima |
| `ui-kit` | **não** verifica que `packages/ui-kit` existe no projeto, e isso é decisão, não lacuna: a unidade de verificação é o **módulo**, e o módulo extraído não enxerga a raiz do repositório de onde saiu (§1.1). O que ela cobra é a dependência **declarada de dentro do módulo** — o import. Vocabulário de biblioteca bruta é **fechado**, como o do `sdk-fornecedor`: biblioteca fora da lista passa (falso negativo assumido), e nenhum falso positivo é esperado. `react`/`vue` estão fora de propósito — são o framework em que o kit é escrito, não a biblioteca que ele envolve |
| `ui-token` | é **aviso**, e a única cláusula heurística das três de `ui`. O recorte exige `propriedade **:** valor`, que é a forma de toda declaração de estilo, e deixa de fora `atributo **=** "valor"` — por isso o ícone SVG inline com `fill="#000"` **não** é acusado: fica fora por forma, não por lista de exceção. Lê **código e folha de estilo** (`.css`, `.scss`, `.sass`, `.less`) dentro de `web/` — a folha entra porque em `ui.modo: "kit"` ela é onde a cor literal mais vive, e restringir a regra a arquivo de código a deixava limpa justamente ali. Em folha de estilo a fonte usa outro discriminador, porque CSS não usa aspas: `font-family:` é literal a menos que o valor seja `var(…)` ou palavra-chave da linguagem. O que ainda escapa: cor montada por indireção (concatenação, `template literal` com variável) — falso negativo; regra CSS escrita numa linha só e iniciada por seletor de **id** (`#cabecalho { color: #fff; }`), que o extrator de linhas descarta por confundir o `#` inicial com comentário — falso negativo; e cor dentro de um objeto de props espalhado em elemento SVG (`{...{fill: '#000'}}`) — falso positivo residual, e a razão de o nível ser aviso e não erro |
| `artefato-declarado` | verifica **presença**, nunca conteúdo: motor que não gera nada e template vazio passam. As duas pastas de fonte (`core/motor/`, `core/templates/`) são provadas por **arquivo** — pasta vazia conta como ausente, e deve. `gerados/` é provada pela **entrada da raiz**, porque o conteúdo dela é saída de máquina e fica fora da varredura de propósito (varrê-lo faria `hardcode-url`, `limiar-funcao` e `log` julgarem HTML gerado); a assimetria é deliberada — `gerados/` nasce vazia e só se enche em build. `database/` fica **fora**: o `criar-modulo.mjs --sem-artefato` também a descarta, mas quem declara banco é `dados.tabelas`, e cobrá-la aqui daria falso positivo garantido no módulo de domínio sem artefato e com tabela própria — o caso ordinário |
| `resumo-exportado` | lê o bloco **daquela rota** dentro de `paths:` e segue o `$ref` até `components.schemas` — leitor por rota, não do arquivo inteiro, senão `total` declarado em `/registros` aprovaria `/resumo` por acidente. Verifica a **declaração do nome**, não o tipo: `total: { type: string }` passa, e essa metade é do teste de contrato, que exercita a resposta de verdade. **Uma direção só**: `exportaResumo: false` não proíbe nada. `/resumo` ausente é do `contrato`, e contrato ilegível também — nos dois casos ela silencia |
| `hardcode-numero` | pega literal atribuído a nome de infraestrutura; número mágico com nome de negócio passa (e deve — o lugar dele é `config/dominio.json`) |
| `contrato` | **dona** de "spec ilegível": o leitor é de bloco, sem dependência externa — é o que permite o gate viajar com o módulo extraído e rodar sem instalar nada. Detecta pelo **resultado** da leitura, nunca pela causa: *flow style* (`paths: {"/x": …}`) é a mais comum, mas `paths:` indentado com 4 espaços é bloco válido e cai pelo mesmo caminho — o leitor exige recuo **exatamente** 2 na rota e 4 no método. A mensagem nomeia **qual** seção falhou (`paths:`, `servers:` ou as duas) e a forma que o leitor aceita — nunca "a rota não existe". `servers:` ilegível não cega a checagem de nome das rotas, que só depende de `paths:` |
| `contrato-sincronizado` | reconhece registro de rota em Express/FastAPI. Framework diferente faz a regra **declarar que não verificou**, em vez de passar calada. Do lado da spec ela silencia: contrato ilegível é do `contrato` |
| `sensivel-em-saida` | cobre projeção e chamada de log, com precisão diferente em cada metade. Na **chamada de log**, heurística de bloco conservadora: campo sensível montado por indireção (spread, `Object.assign`) escapa — falso negativo. Na **projeção**, usa o extrator de `projecao-contrato` e herda os dois limites dele, inclusive o falso positivo: campo sensível citado num objeto intermediário **dentro** da função de projeção é acusado como se fosse publicado |
| `projecao-contrato` | **uma direção só**, de propósito: pega campo projetado e não declarado. A inversa (propriedade declarada e nunca projetada) **não** é cobrada — `/health`, `/meta` e `/resumo` são montadas pela própria `api/` e o schema `Erro` pelo tratador de erro, nenhum deles passa pelo mapeador, então cobrá-la seria falso positivo garantido. O extrator delimita a projeção **balanceando chaves** a partir de `paraContrato`/`para_contrato`, e por isso não atravessa a função seguinte, qualquer que seja a quebra de linha. Restam dois limites reais: projeção montada por indireção (spread, `Object.assign`, dicionário construído em laço) **escapa** — falso negativo; e objeto intermediário declarado **dentro** da própria função de projeção (`const interno = { … }`) entra na conta como se fosse publicado — **o falso positivo conhecido**, evitável montando a saída num `return` só. Chave fora de camelCase é do `payload-camelcase` e não é acusada aqui |
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
