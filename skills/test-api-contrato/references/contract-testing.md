# Contract testing (provider × consumer)

O contrato só vale se **as duas pontas o respeitam**: o **provider** (dono do módulo) entrega o que a spec
promete; o **consumer** depende só do contrato, não da implementação. Os dois testes pegam quebras que um
teste unitário comum não vê — divergência entre o que um módulo promete e o que o outro espera.

## As duas direções

| Direção | Pergunta | Como testar | Pega |
|---|---|---|---|
| **Provider** | a implementação conforma à spec? | validar respostas reais contra o OpenAPI | resposta fora do schema/código declarado |
| **Consumer** | o consumidor casa com o contrato? | mock derivado **do contrato** (não da impl.) | consumidor assumindo campo/shape que o contrato não garante |

## Provider — conformidade com a spec
- **Schema validation nos testes**: cada teste de endpoint valida a resposta contra o schema do OpenAPI
  (a resposta `200` casa com `#/components/schemas/Order`, os códigos de erro existem na spec).
- **Property-based (próprio app)**: `schemathesis run api/openapi.yaml --base-url http://localhost:PORT`
  gera requisições a partir da spec e acusa respostas que a violam. Só contra o **próprio app/staging**.
- Divergência → conserte **o lado errado**: se o código mudou de propósito, atualize a spec; se a spec está
  certa, conserte o código. Nunca silencie.

## Consumer — dependência só do contrato
- O consumidor consome o **`api/`** do provider (contrato + adaptador), nunca `domain/`/`data/` dele.
- **Mock derivado do contrato**: o test double do provider, no teste do consumidor, é gerado/baseado na spec
  OpenAPI — não copiado da implementação. Assim, se o provider mudar de forma incompatível, o contrato (e o
  teste) acusa antes de quebrar em produção.
- Em arquitetura distribuída, **Pact** (consumer-driven contracts) formaliza isso: o consumidor publica o que
  espera; o provider verifica que cumpre. Localmente, o contrato OpenAPI compartilhado já cumpre o papel.

## Ferramentas por stack
| Stack | Provider (conformidade) | Consumer (mock do contrato) |
|---|---|---|
| Python | `schemathesis`, `openapi-core` | `pact-python`, mock a partir do schema |
| Node/TS | `jest-openapi`, `express-openapi-validator` | `pact-js`, `msw` com handlers do schema |
| Go | `kin-openapi` (validação contra a spec) | `pact-go` |
| Java | `rest-assured` + validador OpenAPI | `pact-jvm`, Spring Cloud Contract |

## Limite
- Contract testing valida **forma e conformidade**, não **segurança** nem **regra de negócio**: authz/IDOR/rate
  limit é da `cyber-api`; lógica de domínio é dos testes da `test-unitario`.
