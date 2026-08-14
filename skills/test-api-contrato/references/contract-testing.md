# Contract testing (provider × consumer)

O contrato só vale se **as duas pontas o respeitam**: o **provider** entrega o que a spec promete; o
**consumer** depende só do contrato, não da implementação.

Estes testes **executam**. É essa a divisão de trabalho com o gate: o gate compara textos e não roda nada;
estes testes rodam o app e olham a resposta de verdade. Só entram depois de
`node tools/gate/validate.mjs <modulo>` estar verde.

## As duas direções

| Direção | Pergunta | Como testar | Pega |
|---|---|---|---|
| **Provider** | a implementação conforma à spec **em runtime**? | validar a resposta real contra o schema do `contract/openapi.yaml` | resposta fora do schema ou com código não declarado |
| **Consumer** | o consumidor casa com o contrato? | mock derivado **do contrato**, nunca da implementação | consumidor assumindo campo ou shape que o contrato não garante |

## Provider — conformidade em runtime

- **Asserção de schema no teste de endpoint**: em `tests/`, cada resposta é validada contra o schema
  declarado — a `200` casa com `#/components/schemas/Registro`, o erro casa com `Erro` e o `codigo` está no
  enum fechado.
- **Property-based contra o próprio app**: `schemathesis run contract/openapi.yaml --base-url http://localhost:PORT`
  gera requisições a partir da spec e acusa respostas que a violam. **Só** contra o próprio app ou staging autorizado.
- Divergência → conserte **o lado errado**: se o código mudou de propósito, atualize a spec; se a spec está
  certa, conserte o código. Nunca silencie.

> `contrato-sincronizado` já garante que rota do código e rota da spec coincidem. O que sobra aqui é o
> **corpo** da resposta, que o gate não lê.

## Consumer — dependência só do contrato

- O consumidor fala com o provider por `core/gateways/<provider>`, **só HTTP**, e a dependência está
  declarada em `module.json:consumes`. Nunca importa `core/` alheio nem lê tabela alheia — isso o gate já
  cobra (`import-lateral`, `gateway-http`, `gateway-declarado`, `tabela-alheia`).
- **Mock derivado do contrato**: o test double sai da spec, não da implementação. Mock copiado da
  implementação testa o acidente, não a promessa — e passa a mentir no dia em que o provider muda.
- `consome-contrato` já verifica que a rota e o método declarados existem no dono. O que sobra aqui é a
  **forma do payload**, que ele explicitamente não lê (§7.2).
- Em arquitetura distribuída, **Pact** (consumer-driven contracts) formaliza isso. Dentro de um monorepo, o
  `openapi.yaml` compartilhado já cumpre o papel.

## Ferramentas por binding

Os bindings do template são `typescript`, `javascript` e `python`.

| Binding | Provider (conformidade) | Consumer (mock do contrato) |
|---|---|---|
| `typescript` / `javascript` | `jest-openapi`, `express-openapi-validator`, Vitest + validador de schema | `msw` com handlers derivados do schema, `pact-js` |
| `python` | `schemathesis`, `openapi-core` | mock a partir do schema, `pact-python` |

## Compatibilidade entre versões

O caso que nenhum verificador estático pega, e o motivo principal desta skill existir. Comparando o schema
novo com o em uso, são **breaking**:

| Mudança | Por quê quebra |
|---|---|
| tipo alterado (`string` → `integer`) | consumidor desserializa errado |
| campo opcional que virou obrigatório | requisição válida passa a ser rejeitada |
| enum que perdeu valor | valor em uso passa a ser inválido |
| campo removido ou renomeado | consumidor lê `undefined` |

Breaking exige `/api/v2/` convivendo com `v1` por uma janela anunciada (`02-contrato-e-dados.md` §5).
Aditivo e opcional fica na `v1`.

## Limite

Contract testing valida **forma e conformidade**, não **segurança** nem **regra de negócio**: authz, IDOR,
rate limit e CORS são da `cyber-api`; lógica de domínio é da `test-unitario`. Estrutura, nomenclatura e
projeção são do gate — não as reteste aqui.
