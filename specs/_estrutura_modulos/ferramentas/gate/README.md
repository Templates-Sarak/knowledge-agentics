# Gate — contrato de acoplamento

O gate é uma **ferramenta agnóstica de provedor**. Ele não conhece CI, não conhece Git e não conhece IDE.
Quem o executa é decisão sua; o que ele promete está aqui.

> Lei dona das regras: `specs/arquitetura/04-regras.md`.
> Por que ele mora no template e não no pipeline: ADR-005 (`specs/adr/000-decisoes-do-template.md`).

## Interface

```
node ferramentas/gate/validar.mjs <caminho-do-modulo>   valida UM módulo
node ferramentas/gate/validar.mjs --todos               todos + as 3 regras globais
node ferramentas/gate/validar.mjs --extracao <caminho>  vira microsserviço hoje?
node ferramentas/gate/validar.mjs --json <caminho>      saída estruturada
```

O `<caminho-do-modulo>` aceita caminho relativo, absoluto ou **só o id** (`catalogo` resolve para
`modulos/catalogo`).

| Contrato | Garantia |
|---|---|
| **Exit code** | `0` = nenhum erro. `1` = ao menos um erro, ou uso inválido |
| **Aviso** | reportado, **não** reprova — nunca muda o exit code |
| **stdout** | relatório legível; com `--json`, `{ achados: [...], erros: N }` |
| **stderr** | só uso inválido e falha de leitura |
| **Efeito colateral** | **nenhum.** O gate nunca escreve, nunca corrige, nunca commita |

Formato de cada achado no `--json`:

```json
{ "modulo": "catalogo", "regra": "import-lateral", "nivel": "erro", "mensagem": "core/x.ts: importa o modulo \"contratos\"" }
```

## Por que a unidade é o módulo

Se o verificador só funcionasse no repositório inteiro, o módulo extraído perderia o verificador junto — a
conformidade morreria exatamente no momento em que a arquitetura foi cobrada. Verificar o repositório é um
**laço** sobre `modulos/*`, não uma capacidade separada.

Só **quatro** regras precisam de visão global e por isso rodam apenas no `--todos`: `import-lateral`,
`tabela-alheia`, `consome-ciclo` e `consome-contrato`.

Regra sobre o **projeto** não é global: ela tem escopo `raiz`, recebe `ctx.projeto` em vez de um contexto de
módulo e roda **uma vez** por invocação — o fato é um só, e emiti-lo por módulo daria dez mensagens idênticas
num repositório com dez módulos. O achado sai sob o alvo `(raiz)`. Quais são elas está no catálogo
(`specs/arquitetura/04-regras.md`), na coluna **escopo** — enumerá-las aqui é uma lista que envelhece.
Global só quem compara módulos entre si.

## Plugar num executor

O template **não** traz pipeline, de propósito (ADR-005 (`specs/adr/000-decisoes-do-template.md`)). Plugá-lo é uma linha.

**Hook de pre-commit e pre-push** (`.githooks/pre-commit`, `.githooks/pre-push`) — o template **entrega os
dois, prontos**, em `bindings/<binding>/raiz/.githooks/`. Cada um é duas linhas, idênticas nos três
bindings, e delegam para `ferramentas/verificar-commit.mjs` — que roda o gate só nos módulos
**afetados** pelo staged (`pre-commit`) ou pelo delta desde o upstream (`pre-push`), calculado por
`ferramentas/afetados.mjs`. Ver `specs/arquitetura/03-operacao.md` §7.1 para a fiação completa das três
camadas de custo, e a regra `pre-commit-instalado` (§4.4 do catálogo) para o que fica cobrado por
máquina — o artefato existir e referenciar a cadeia, nunca a ativação:

```sh
#!/bin/sh
node ferramentas/verificar-commit.mjs pre-commit || exit 1
```

Ative com `git config core.hooksPath .githooks` — é config **local**, não vem no `clone`: cada clone
ativa o próprio. `--no-verify` fura o hook, por desenho do git; quem cobra sem esse furo é o CI, nunca
o hook local (03-operacao.md §7.1).

**Bit de execução, medido:** em Windows com `core.filemode=false` (comum), `git add` grava o hook
**sem** o bit de execução — e um hook não-executável é **pulado em silêncio** por git no Linux/macOS,
sem erro nenhum. No primeiro commit do projeto, rode `git update-index --chmod=+x .githooks/pre-commit
.githooks/pre-push` uma vez (`criar-projeto.mjs` já imprime isso nos "próximos passos").

**Qualquer CI** — o passo é o mesmo em qualquer provedor:

```yaml
- run: node ferramentas/gate/validar.mjs --todos
- run: node ferramentas/sincronizar-env.mjs --conferir
```

**Divisão por custo**, não por importância:

| Custo | O que | Onde |
|---|---|---|
| ms (lê arquivo) | este gate | toda invocação — local e CI |
| segundos | build, testes, tipos | local sob demanda; obrigatório na entrega |
| dezenas de segundos | integração, scan de dependência | só na entrega |

## O que o gate NÃO responde: mudei o contrato, quebrei alguém?

O gate compara **um** estado — não pode dizer se a mudança de agora quebra quem consome (isso exige
ler o `contrato/openapi.yaml` de ANTES, via git, e o gate não roda git de propósito). Quem responde é
`ferramentas/contrato-compativel.mjs`, ferramenta separada (não regra, não conta para o catálogo):

```
node ferramentas/contrato-compativel.mjs [--desde <ref>] [<modulo>] [--json]
```

Sem argumento, compara com `HEAD~1` e descobre sozinho quais `contrato/openapi.yaml` mudaram. Acha
incompatibilidade → nomeia **quem consome** o módulo (`modulo.json:consome`, um salto só, igual
`consome-contrato`). É passo de **CI**, não de `pre-commit`/`verificar` local (custa git + comparação
de dois estados). O que ele cobra e o que fica de fora: `specs/arquitetura/04-regras.md` §7.2, logo
depois da tabela de precisão dos verificadores.

## Escrever uma regra nova

1. **Escreva-a primeiro em `specs/arquitetura/04-regras.md`.** Regra que não está no catálogo não é regra.
2. Acrescente o objeto ao arquivo da família em `regras/`:

```js
{
  id: 'minha-regra',          // igual ao id no catálogo
  nivel: 'erro',              // 'erro' reprova; 'aviso' só reporta
  escopo: 'modulo',           // 'modulo' recebe um ctx; 'global' recebe todos; 'raiz' recebe ctx.projeto
  verificar(ctx) {
    return ['mensagem acionável'];   // array vazio = conforme
  },
}
```

3. Regra de escopo `global` devolve `{ modulo, mensagem }` em vez de string, porque precisa dizer de quem é o
   achado. Regra de escopo `raiz` devolve string: o alvo dela é sempre `(raiz)`.
4. **Nenhuma regra lê disco.** Tudo vem do contexto (`ferramentas/gate/contexto.mjs`) — é o que as mantém
   rápidas e testáveis. O que é do **projeto**, e não do módulo, chega em `ctx.projeto`
   (`carregarProjeto`): a política de `config/verificacao.json` e a config do linter em disco. É lido uma vez
   por raiz e memoizado — dez módulos não custam dez leituras —, e `ctx.projeto.ehProjeto` diz se a raiz é
   mesmo um projeto (tem `modulos/`) ou um módulo solto, caso em que regra de projeto silencia. O **código**
   da raiz (`adapters/`, `src/`, `packages/`) chega em `ctx.projeto.codigo`, e NUNCA em `ctx.arquivos` ou
   `ctx.codigo`: essas duas são o material das regras de módulo, cujos textos dizem "no código do módulo".
5. **Leitura de `contrato/openapi.yaml` já existe** em `ferramentas/gate/spec.mjs` (`specDe`,
   `rotasDaSpec`, `operacoesDaSpec`, `normalizar`). Importe de lá — duas famílias a usam, e um segundo
   parser divergiria do primeiro sem ninguém notar.
6. **Regra que julga CÓDIGO lê `textoDeCodigo`** (`ferramentas/gate/texto.mjs`), nunca
   `arquivo.conteudo`: comentário e docstring não são código, e a lei escrita num comentário viraria
   violação dela mesma (`04-regras.md` §7.2). `conteudo` é para quem julga texto que **não** é código —
   `-- rollback` numa migration, `.env.example`, o próprio `openapi.yaml`.

## O molde também é validado

Pasta iniciada por `_` (o `_template` de cada binding) é tratada como **molde**: o contexto substitui os
marcadores `<modulo>`, `<MODULO>` e `<Modulo>` **em memória** por um id sintético, e o molde passa pelas mesmas
regras que um módulo real. Nada é escrito de volta.

Isso não é preciosismo. Num sistema real, o molde era a única pasta que o validador pulava — apodreceu sem
ninguém notar, e todo módulo criado a partir dele nascia quebrado (ADR-006 (`specs/adr/000-decisoes-do-template.md`)).

## Exceções

Exceção nominal vive em `config/conformidade.json` na raiz do projeto e **exige** o campo `decisao`
apontando para um ADR. Sem ele, o gate reporta a própria exceção como inválida e não a aplica.
