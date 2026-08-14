# Ler o `contract/openapi.yaml` — o que o gate já garante nele

**A spec de referência é a do molde, e não uma cópia:**

```
specs/_estrutura_modulos/bindings/<binding>/_template/contract/openapi.yaml
```

Num projeto instanciado, o contrato de cada módulo mora em `modules/<modulo>/contract/openapi.yaml` —
**não** em `api/`. `api/` é quem implementa; `core/` é interno e nunca aparece no contrato.

Este documento não é template copiável. Ele diz **o que já está garantido** por máquina, para você não
gastar teste com isso, e **o que precisa de leitura humana**.

## O que o gate garante, sem executar nada

Norma dona: `specs/arquitetura/04-regras.md` §4.5 (na base, `specs/_estrutura_modulos/doutrina/04-regras.md`).

| Já é cobrado | Regra |
|---|---|
| `/health`, `/meta` e `/resumo` declarados | `contrato` |
| a spec é legível pelo leitor de bloco do gate | `contrato` |
| `servers[0].url` igual ao `basePath` do `module.json` | `rota-nomenclatura` |
| nenhum segmento de path carrega verbo (PT ou EN) | `rota-nomenclatura` |
| segmento em kebab-case; parâmetro de caminho em camelCase | `rota-nomenclatura` |
| rotas do código e do `paths:` coincidem nos dois sentidos | `contrato-sincronizado` |
| todo campo projetado pelo mapeador está num schema de resposta | `projecao-contrato` |
| propriedade de resposta em camelCase | `payload-camelcase` |

**Plural de recurso é convenção, não regra** (§3.1): escreva `/registros`, mas nenhum verificador o cobra —
e as três rotas obrigatórias são singulares por desenho.

## As formas que o contrato usa de verdade

**Prefixo em `servers`, path relativo.** O prefixo do módulo não se repete em cada rota:

```yaml
servers:
  - url: /api/v1/<modulo>
paths:
  /registros:
  /registros/{hash}:
```

Escrever `/api/v1/<modulo>/registros` dentro de `paths:` é erro — `rota-nomenclatura` compara
`servers[0].url` com o `basePath`, e o path sai relativo dali.

**Bloco, nunca flow style.** O leitor do gate é linha a linha, sem dependência externa — é o que permite o
gate viajar junto do módulo extraído. `paths: {"/x": {...}}` numa linha é reprovado como ilegível, e o recuo
tem de ser **exatamente** 2 na rota e 4 no método.

**Identificador é o hash universal**, nunca o id interno do banco (`02-contrato-e-dados.md` §4):
`/registros/{hash}`.

**Erro tem taxonomia fechada.** O schema chama-se `Erro`, e o envelope é `{ erro: { codigo, mensagem,
requestId } }`, com `codigo` num enum fechado (`VALIDACAO`, `NAO_AUTENTICADO`, `NAO_AUTORIZADO`,
`NAO_ENCONTRADO`, `CONFLITO`, `LIMITE_EXCEDIDO`, `DEPENDENCIA_EXTERNA`, `INTERNO`). A taxonomia vive em
`packages/portas` e está em `02-contrato-e-dados.md` §3.1 — não invente código novo, e não use um schema
`Error` com `{ code, message }`.

**Coleção tem envelope único**: `{ itens, pagina, tamanho, total }`.

**Idioma**: domínio, rotas e dados em português (§3.1). O molde usa `registros`, `titulo`, `criadoEm` —
não `orders`, `unitPrice`, `createdAt`.

## O que continua sendo leitura humana

Nada disto o gate vê, e é onde a `test-api-contrato` trabalha:

- **A resposta real bate com o schema?** O gate lê o texto da spec, não a saída do app.
- **O schema mudou de forma?** Tipo alterado, campo que virou obrigatório, enum que perdeu valor, campo
  removido — todos **breaking**, e `consome-contrato` não os enxerga (§7.2).
- **A descrição diz a verdade?** `summary` e `description` errados passam por qualquer verificador.

## Versão e evolução

`v1` é estável (`02-contrato-e-dados.md` §5). Acrescentar campo **opcional** ou rota nova é compatível;
remover ou renomear campo, mudar tipo, apertar validação ou mudar semântica **não é** — exige `/api/v2/`
convivendo com `v1` por uma janela de depreciação anunciada no próprio `openapi.yaml`.
