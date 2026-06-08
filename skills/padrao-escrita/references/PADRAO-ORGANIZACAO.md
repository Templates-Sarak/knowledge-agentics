# Padrão de Organização (Nível 1) — Microservice-Ready

Detalhamento da organização de projeto. Leia sob demanda; o resumo dos inegociáveis está no `SKILL.md`.
Princípio-mestre: **cada módulo é uma fatia vertical autossuficiente, desacoplada o suficiente para
virar um microsserviço sem reescrever quem o consome.**

---

## 1. Árvore-padrão

```
repo/
├── backend/
│   ├── orders/                  # módulo = domínio
│   │   ├── config.json          # tunables não-secretos DO módulo
│   │   ├── api/                 # CONTRATO PÚBLICO — única porta de entrada do módulo
│   │   │   ├── routes.*         # rotas REST
│   │   │   └── adapter.*        # adaptador p/ outros módulos consumirem (ver §4)
│   │   ├── domain/              # regra de negócio (privado)
│   │   ├── data/                # persistência própria (privado) — tabelas orders_*
│   │   └── tests/
│   └── users/                   # mesma forma
├── frontend/
│   ├── orders/                  # MESMO nome do módulo backend
│   │   ├── config.json
│   │   ├── components/
│   │   └── api-client/          # fala só com backend/orders/api (contrato)
│   ├── users/
│   └── app-shell/               # cross-cutting do front: routing, layout, design system
├── shared/                      # SÓ contratos/tipos (DTOs) — zero lógica (ver §6)
├── scripts/                     # automação de repo (build, deploy, validação)
├── docs/
├── .env.example                 # versionado — chaves vazias, vars prefixadas por módulo
└── .gitignore                   # inclui .env
```

Cada módulo "viaja junto": para extrair `orders` como microsserviço, leva-se `backend/orders/`,
suas tabelas `orders_*`, suas vars `ORDERS_*` e o `frontend/orders/` aponta o `api-client` para a nova URL.

---

## 2. Módulo = domínio (fatia vertical)

- Um módulo resolve **um domínio** de negócio (orders, users, billing). Nome = substantivo de domínio em
  **kebab-case**, idêntico em `backend/` e `frontend/`.
- Tudo do domínio mora dentro da pasta: rotas, regra, dados, testes, config. Nada espalhado por camadas
  técnicas globais (`controllers/`, `services/` no topo são **proibidos** — isso quebra a fatia vertical).

**❌ Por camada (espalha o domínio):**
```
backend/controllers/orders.py
backend/services/orders.py
backend/models/orders.py
```
**✅ Por domínio (fatia coesa):**
```
backend/orders/api/routes.py
backend/orders/domain/order_service.py
backend/orders/data/order_repository.py
```

---

## 3. Encapsulamento — só o `api/` é público

- A pasta `api/` é a **única** porta de entrada do módulo. `domain/` e `data/` são privados.
- **Nenhum** módulo importa `domain/` ou `data/` de outro. Quem precisa de algo de `orders` chama o
  contrato exposto em `orders/api/`.

**❌ Vazando internals:**
```python
# em backend/billing/domain/invoice_service.py
from orders.data.order_repository import OrderRepository   # acopla billing ao schema de orders
```
**✅ Pelo contrato:**
```python
from orders.api.adapter import OrdersApi                   # depende só do contrato público
order = OrdersApi.get_order(order_id)
```

---

## 4. Comunicação — contrato + adaptador

Módulos conversam por um **adaptador** que implementa o contrato público. Hoje o adaptador faz uma
chamada local; ao virar microsserviço, troca-se a implementação por HTTP/fila **sem tocar nos consumidores**.

```python
# orders/api/adapter.py  — contrato estável que o resto do sistema enxerga
class OrdersApi:
    @staticmethod
    def get_order(order_id: str) -> OrderDTO:
        # HOJE (monólito): chama o domínio local
        return order_service.get(order_id)
        # AMANHÃ (microsserviço): return http_client.get(f"{ORDERS_BASE_URL}/api/v1/orders/{order_id}")
```

O consumidor só conhece `OrdersApi.get_order(...)` → a migração local→rede é transparente para ele.

---

## 5. Dados — banco compartilhado disciplinado

- Banco único, mas **cada módulo é dono das suas tabelas**, e **toda tabela é prefixada pelo módulo**:
  `orders_orders`, `orders_items`, `users_users`, `users_sessions`.
- **Proibido** ler ou dar JOIN em tabela de outro módulo. Precisa de dado de `users` dentro de `orders`?
  Chame `UsersApi.get_user(...)` (§4), não `SELECT ... FROM users_users`.
- O prefixo torna a posse explícita e a extração trivial: as tabelas `orders_*` migram junto com o módulo.

**❌ Acoplamento escondido:** `SELECT * FROM users_users JOIN orders_orders ...` dentro de `orders`.
**✅** `orders` pega o usuário por `UsersApi.get_user(userId)` e cruza em memória, se precisar.

---

## 6. `shared/` — só contratos/tipos

- Contém apenas **DTOs e definições de contrato** (os tipos trocados entre módulos). **Zero** lógica de
  negócio, zero estado, zero utilitário "geral".
- Lógica comum **não** vai para `shared/` — se dois módulos parecem precisar da mesma regra, provavelmente
  ela pertence ao domínio de um deles (que a expõe via `api/`), ou é genuína duplicação aceitável.

---

## 7. Config e segredos

- **`config.json` por módulo** (co-localizado em `backend/<modulo>/` e `frontend/<modulo>/`): tunables
  não-secretos. Some/move junto com o módulo.
- **`.env` único na raiz**, variáveis **prefixadas pelo módulo** dono: `ORDERS_DB_URL`, `USERS_JWT_SECRET`.
  No `.gitignore`; `.env.example` versionado com as chaves e valores vazios/fake.
- Código lê config/env **na borda** (carregamento/bootstrap), nunca espalha `process.env`/`os.getenv`
  pelo `domain/`.

---

## 8. Contrato de API (REST)

- Prefixo de versão: **`/api/v1/`**.
- Recursos no **plural, kebab-case**: `/api/v1/orders`, `/api/v1/payment-methods`.
- **Sem verbos** no path — a ação é o método HTTP: `POST /api/v1/orders` (cria), `GET /api/v1/orders/{id}`,
  `DELETE /api/v1/orders/{id}`. Subcoleções: `GET /api/v1/orders/{id}/items`.
- **Filtros, ordenação e paginação via query string**: `GET /api/v1/orders?status=open&page=2`.
- **Casing do contrato = camelCase** (corpo JSON e chaves de query): `{ "orderId": "...", "createdAt": "..." }`.
  O backend converte `snake_case` interno ↔ `camelCase` do contrato **na camada de serialização** (borda),
  mantendo o código interno idiomático sem vazar casing para fora.
- **Validação e segurança acontecem na borda `api/`**, antes de chamar o `domain/`: todo input externo é
  validado/sanitizado ali; o `domain/` assume entrada já confiável. **Queries sempre parametrizadas**
  (nunca concatenar string com input). O `api/` também é **documentado** (o que cada rota/contrato recebe
  e devolve) — é o material de referência de quem consome o módulo.

---

## 9. Testes

- **Localização:** `backend/<modulo>/tests/` (e equivalente no front) — os testes viajam junto com o módulo.
- **Quando:** toda nova funcionalidade entra **com seus testes na mesma entrega**. Não há TDD obrigatório;
  o que não se admite é funcionalidade entregue sem testes.
- **O que cobrir:** os **caminhos críticos** do comportamento são obrigatórios (caminho feliz + erros/limites
  relevantes). Teste pela **borda pública** (`api/`/funções públicas), não pelos internals.
- **Cobertura:** **meta de ~80%** por módulo como **sinal de saúde**, não gate dogmático — cobertura alta com
  testes vazios não vale; preferir poucos testes significativos a muitos triviais para "bater o número".
- **Legado:** quando não há testes, a adequação cria **testes de caracterização** (congela o comportamento
  atual) antes de refatorar — ver skill `code-adequacao`.

---

## 10. Nomenclatura

- **Pastas e módulos**: kebab-case, iguais em `backend/` e `frontend/` (`payment-methods`).
- **Arquivos**: idiomáticos da linguagem — `snake_case.py` em Python, `PascalCase.tsx` para componentes,
  `camelCase.ts` para módulos JS utilitários.
- **Tabelas**: `<modulo>_<entidade>` em snake_case (`orders_items`).
- **Variáveis de ambiente**: `<MODULO>_<NOME>` em SCREAMING_SNAKE_CASE (`ORDERS_DB_URL`).
