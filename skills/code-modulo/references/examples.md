# Exemplos: code-modulo

Os dois exemplos usam um par de módulos neutro — `catalogo` (dono dos itens) e `pedidos` (consome o
catálogo) — para ilustrar a fronteira entre módulos sem descrever nenhum sistema em particular.

## Exemplo bom

### Cenário
Criar o módulo `catalogo` num projeto que já adota o template. Ele é dono dos itens vendáveis, publica o
preço vigente de cada item para outros módulos e tem tela própria. Não gera artefato publicável.

### Como foi feito

1. **Terreno confirmado** — `tools/` e `modules/` presentes; `specs/arquitetura/01-modulo.md` lido.
2. **Identidade coletada e aprovada no HITL** — `id: catalogo`, `role: dominio`, `binding: typescript`,
   `webPath: /catalogo`, `ui.modo: kit`, `generatesArtifact: false`.
3. **Scaffold** — `node tools/create-module.mjs catalogo --binding typescript --role dominio --sem-artefato`.
4. **Contrato escrito antes do código**, com `/itens/{hash}/preco-vigente` — o endpoint que outros módulos
   vão consumir.
5. **Código preenchido na ordem**, com a regra de preço resolvida no `core/domain` do dono do dado.

### Resultado

```
modules/catalogo/
├── module.json          role domain · schema "<escopo>" · prefixo catalogo_
├── contract/openapi.yaml   /health /meta /resumo /itens /itens/{hash}/preco-vigente
├── config/              api, domain, seguranca, ports, textos
├── core/
│   ├── domain/          regra do preco vigente (vigencia por data, sem valor default)
│   └── ports/           repositorio, auditoria, relogio, geradorId
├── api/src/             routes, mappers, middlewares, config.ts, logger.ts
├── web/src/pages/       tela com loading, empty e error
├── database/            schema.sql + 0001-cria-itens.sql (com -- rollback, RLS)
└── tests/               domain/, contract/, web/ — verdes sem rede
```

```
$ node tools/gate/validate.mjs modules/catalogo
catalogo: 0 erro(s), 0 aviso(s)
$ node tools/gate/validate.mjs --extracao modules/catalogo
extracao: OK — 1 modulo(s), 0 erro(s)
```

**Por que é bom:** o módulo é dono da regra de preço e a publica pelo contrato. Quando `pedidos` precisar
dela, consome `GET /api/v1/catalogo/itens/{hash}/preco-vigente` e declara `consumes` — sem uma linha duplicada
e sem um `SELECT` em tabela alheia.

---

## Exemplo ruim

### Estado incorreto

O módulo `pedidos` precisou do preço vigente. Em vez de consumir o contrato, foi criado assim:

```
modules/pedidos/
├── config.json                       ← config única, sem separação por assunto
├── database/
│   └── adaptador/
│       ├── adaptadorPostgres.ts      ← SDK de fornecedor DENTRO do módulo
│       └── adaptadorCatalogo.ts      ← cliente de OUTRO módulo, numa pasta chamada "database"
├── api/src/
│   └── routes/                       ← rotas escritas antes de existir contrato
└── (sem module.json, sem contract/, sem tests/)
```

```ts
// modules/pedidos/database/adaptador/adaptadorCatalogo.ts
const { rows } = await pool.query('SELECT preco FROM catalogo_precos ORDER BY vigencia DESC LIMIT 1')
```

**Por que é ruim:**

| Problema | Impacto |
|---|---|
| Sem `module.json` | o sistema não descobre o módulo; o gate não tem o que auditar; nada é declarado, então nada é verificável |
| `SELECT` em tabela de outro módulo | fronteira de dados furada. O dono muda a coluna e quebra um módulo que ele não sabe que existe |
| SDK de fornecedor dentro do módulo | trocar de banco passa a exigir refactor; a promessa de desacoplamento vira ficção |
| Cliente de outro módulo em `database/` | o nome mente sobre a fronteira. "Falo com meu banco" e "falo com outro módulo" são riscos diferentes e ficam indistinguíveis ao `grep` |
| Rotas antes do contrato | não há fonte da verdade; consumidor nenhum consegue depender do módulo sem ler o código dele |
| `config.json` único | tunable de negócio, segurança e escolha de provedor no mesmo arquivo — ninguém sabe o que pode mudar por ambiente |
| Sem `tests/` | não há prova de que o módulo roda sem rede, logo não há prova de que é extraível |

### Como corrigir

1. Rodar o `create-module.mjs` para gerar a árvore correta e o manifesto.
2. Mover `adaptadorPostgres.ts` para `adapters/postgres/` na raiz, atrás da porta `repositorio`.
3. Reescrever `adaptadorCatalogo.ts` como `core/gateways/catalogo.ts`, consumindo o contrato público,
   e declarar em `consumes`.
4. Escrever `contract/openapi.yaml` e alinhar as rotas existentes a ele.
5. Quebrar `config.json` nos cinco arquivos de `config/`.
6. Criar `tests/` com dublês de porta em memória até o gate ficar verde.

> Este padrão de erro é o que aparece quando um módulo é criado **copiando a pasta do molde à mão** em vez
> de usar o `create-module.mjs`, e ninguém roda o gate depois. É exatamente o que o passo 4 do workflow existe
> para impedir.
