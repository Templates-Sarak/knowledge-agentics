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

## 4.5 Contrato

| id | nível | verifica | escopo |
|---|---|---|---|
| `contrato` | erro | `contrato/openapi.yaml` existe e declara `/health`, `/meta` e `/resumo` | módulo |
| `rota-nomenclatura` | erro | `servers[0].url` é igual ao `rotaBase` do manifesto; nenhum segmento de path carrega verbo (vocabulário fechado, PT e EN, comparado token a token do kebab); todo segmento é kebab-case minúsculo e todo parâmetro de caminho é camelCase. Se nenhum path puder ser extraído, a regra **diz que não verificou** em vez de passar calada | módulo |
| `contrato-sincronizado` | erro | as rotas registradas no código e as declaradas em `paths:` coincidem **nos dois sentidos** (parâmetro de caminho normalizado). Se nenhuma rota puder ser extraída do código, a regra **diz que não verificou** em vez de passar calada | módulo |
| `payload-camelcase` | erro | toda chave da projeção de saída é camelCase, e nenhuma propriedade de schema de **resposta** no OpenAPI usa `snake_case` | módulo |
| `saida-sensivel` | erro | nenhum campo de `camposSensiveis` aparece em schema de **resposta** do `openapi.yaml` | módulo |
| `sensivel-em-saida` | erro | nenhum campo de `camposSensiveis` entra na projeção de saída nem é citado em chamada de log — citá-lo direto burla a redação automática do logger | módulo |
| `saida-crua` | erro | nenhuma resposta devolve o registro cru (`json(registro)`, `json(linha)`, `json(row)`, `json(dados)`, `return linha`) | módulo |

## 4.6 Operação

| id | nível | verifica | escopo |
|---|---|---|---|
| `log` | erro | nenhum `console.*` (ou `print(`, no Python) no código do módulo, fora de teste | módulo |
| `determinismo` | erro | nenhum `Math.random()`/`new Date()` (ou `random.`/`datetime.now`) dentro de `core/` — use as portas `geradorId` e `relogio` | módulo |
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
fronteira do que um verificador estático consegue afirmar, e duas coisas que **deixaram de ser regra** por
não serem verificáveis mecanicamente (§1, lei 2).

## 7.1 Deixaram de ser regra

| Antiga regra | Por quê saiu | Onde vive agora |
|---|---|---|
| **Cobertura de teste ~80%** | exige executar os testes; o gate é estático e sem efeito colateral | alvo descrito em [[03-operacao]] §5, explicitamente **não é regra** |
| **`--extracao` prova que os testes passam sem rede** | idem — o comando verifica a *estrutura* da extraibilidade, não executa nada | [[03-operacao]] §6 descreve o que ele realmente checa |

Rodar teste é do comando `verificar` do projeto, não do gate. Essa separação é o que mantém o gate rápido,
puro e chamável de qualquer lugar — inclusive de dentro de um hook.

## 7.2 Precisão dos verificadores heurísticos

Seis regras leem estrutura de bloco, não AST. São **conservadoras**: na dúvida, não acusam. Onde o gate e o
linter discordarem, o linter tem razão.

| Regra | Limite conhecido |
|---|---|
| `limiar-funcao`, `limiar-aninhamento`, `limiar-parametros` | assinatura fora do padrão comum pode não ser medida; nenhum falso positivo esperado, falso negativo é possível |
| `hardcode-numero` | pega literal atribuído a nome de infraestrutura; número mágico com nome de negócio passa (e deve — o lugar dele é `config/dominio.json`) |
| `contrato-sincronizado` | reconhece registro de rota em Express/FastAPI. Framework diferente faz a regra **declarar que não verificou**, em vez de passar calada |
| `sensivel-em-saida` | cobre projeção e chamada de log; um campo sensível montado por indireção (spread, `Object.assign`) escapa |
| `rota-nomenclatura` | lê `servers:` e `paths:` linha a linha — contrato em *flow style* (`paths: {"/x": …}`) faz a regra **declarar que não verificou**. O verbo sai de vocabulário fechado (PT e EN): verbo fora da lista passa, e substantivo homógrafo de verbo acusa. **Plural não é verificado** (§3.1) |
| `consome-contrato` | compara **rota**: pega renome, remoção e troca de método. Mudança de forma **dentro** do schema (tipo alterado, campo que virou opcional, enum que perdeu valor) passa — a regra lê o caminho e o método, nunca o corpo. Contrato compatível na rota e incompatível no payload continua sendo trabalho de revisão |

## 7.3 O gate se testa

`ferramentas/gate/testes/` mantém um módulo-fixture conforme e um fixture por regra violada. Regra nova sem
teste não entra, e regressão no gate reprova sozinha — a mesma disciplina que o gate exige dos módulos.
