# OpenAPI mínimo (alinhado ao padrão Sarak)

A spec é o **contrato** do módulo: mora em `backend/<modulo>/api/openapi.yaml`, versionada junto do código.
Descreve só a **superfície pública** (o `api/`) — nunca internals. Nomenclatura segue `PADRAO-ORGANIZACAO.md`.

## Regras de nomenclatura (verificáveis)
- **Prefixo** `/api/v1/` em toda rota. Breaking change → `/api/v2/` (a v1 em uso não quebra).
- **Recurso no plural, kebab-case**: `/api/v1/order-items`, não `/api/v1/orderItem` nem `/api/v1/order_items`.
- **Sem verbo no path**: o método HTTP é o verbo. `GET /orders`, não `/getOrders` nem `/orders/list`.
- **Filtros via query**: `GET /api/v1/orders?status=open&page=2` — não rota dedicada por filtro.
- **Path param** entre chaves e em camelCase: `/api/v1/orders/{orderId}`.
- **Schemas em camelCase**: `unitPrice`, `createdAt` (o backend converte snake↔camel na borda).
- **Erros tipados**: cada resposta de erro tem código HTTP e um shape consistente (ex.: `{ code, message }`).

## Esqueleto mínimo
```yaml
openapi: 3.1.0
info:
  title: orders — contrato público
  version: 1.0.0
servers:
  - url: /api/v1
paths:
  /orders:
    get:
      summary: Lista pedidos
      parameters:
        - { name: status, in: query, schema: { type: string } }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { type: array, items: { $ref: "#/components/schemas/Order" } }
    post:
      summary: Cria pedido
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/OrderInput" }
      responses:
        "201": { description: criado, content: { application/json: { schema: { $ref: "#/components/schemas/Order" } } } }
        "400": { description: inválido, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
  /orders/{orderId}:
    get:
      summary: Detalha um pedido
      parameters:
        - { name: orderId, in: path, required: true, schema: { type: string } }
      responses:
        "200": { description: ok, content: { application/json: { schema: { $ref: "#/components/schemas/Order" } } } }
        "404": { description: não encontrado, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
components:
  schemas:
    Order:
      type: object
      properties:
        orderId: { type: string }
        unitPrice: { type: number }
        createdAt: { type: string, format: date-time }
      required: [orderId, unitPrice]
    OrderInput:
      type: object
      properties:
        unitPrice: { type: number }
      required: [unitPrice]
    Error:
      type: object
      properties:
        code: { type: string }
        message: { type: string }
      required: [code, message]
```

## Versão e evolução
- **Aditivo é seguro**: adicionar campo opcional ou rota nova não quebra consumidor → fica na v1.
- **Breaking** (remover/renomear campo, mudar tipo, tornar obrigatório): nova versão de caminho (`/api/v2/`)
  ou novo campo opcional — nunca alterar o significado de algo em uso.
