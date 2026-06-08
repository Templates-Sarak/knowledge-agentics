# Exemplos: padrao-escrita

Leia quando estiver em dúvida sobre como aplicar o padrão. O bom mostra um módulo desacoplado e
extraível; o ruim mostra os acoplamentos que impedem a futura separação.

---

## Exemplo bom — módulo `orders` autossuficiente

### Estrutura
```
backend/orders/
├── config.json                 # { "pageSize": 50, "maxItemsPerOrder": 100 }
├── api/
│   ├── routes.py               # GET /api/v1/orders, POST /api/v1/orders, ...
│   └── adapter.py              # OrdersApi.get_order(orderId) -> OrderDTO
├── domain/order_service.py
├── data/order_repository.py    # tabelas orders_orders, orders_items
└── tests/
```

### Como consome outro módulo (users)
```python
# orders/domain/order_service.py
from users.api.adapter import UsersApi          # ✅ só o contrato público

def create_order(user_id: str, items: list) -> Order:
    if not items:                                # ✅ guard clause (aninhamento baixo)
        raise EmptyOrderError("pedido sem itens")
    user = UsersApi.get_user(user_id)            # ✅ dado de outro módulo via contrato
    return repository.save(Order(user_id=user.id, items=items))
```

### Contrato REST exposto
```
POST   /api/v1/orders            body: { "userId": "u_1", "items": [...] }   # ✅ camelCase, plural, sem verbo
GET    /api/v1/orders/{id}/items
GET    /api/v1/orders?status=open&page=2                                     # ✅ filtro/paginação via query
```

### Config e segredos
```
config.json → { "pageSize": 50 }                # ✅ tunable não-secreto, por módulo
.env        → ORDERS_DB_URL=...                  # ✅ segredo, prefixado pelo módulo, gitignored
```

**Por que está conforme:** depende só de `UsersApi` (não do schema de users), tabelas prefixadas
`orders_*`, contrato REST camelCase versionado, config/segredos fora do código e prefixados. Para virar
microsserviço, troca-se só o corpo de `UsersApi`/`OrdersApi.adapter` por HTTP — nenhum consumidor muda.

---

## Exemplo ruim — módulo `orders` acoplado

### Estado incorreto
```python
# orders/order_service.py  (sem separação api/domain/data)
from users.data.user_table import UserTable      # importa internals de outro módulo
import os

def createOrderAndNotifyAndLog(user_id, items):  # faz 3 coisas (viola SRP)
    db = connect(os.getenv("DATABASE_URL"))       # segredo lido no meio da lógica, sem prefixo
    rows = db.query(
        "SELECT * FROM users JOIN orders ON ...")  # JOIN cross-módulo em tabelas sem prefixo
    if user_id:
        if items:
            if len(items) < 100:                  # 3+ níveis de aninhamento, número mágico
                ...                                # função longa, múltiplas responsabilidades
```
Rota: `POST /api/createOrder` → `{ "user_id": "...", "order_items": [...] }`

**Por que é ruim:**
| Violação | Impacto |
|----------|---------|
| `from users.data...` | Acopla `orders` ao schema interno de `users`; mudar `users` quebra `orders`. |
| `JOIN users ... orders` | Banco vira acoplamento escondido; impossível separar os módulos. |
| Tabelas sem prefixo | Não dá pra saber quem é dono; extração ambígua. |
| `os.getenv` no meio da lógica | Segredo espalhado, sem prefixo de módulo, difícil de auditar. |
| `createOrderAndNotifyAndLog` | Viola SRP; nome com "And" denuncia 3 responsabilidades. |
| `if/if/if` + `100` mágico | Aninhamento > 3, número hardcoded (deveria estar em `config.json`). |
| `POST /api/createOrder` | Verbo no path, sem versão; corpo em `snake_case` (contrato deveria ser camelCase). |

**Consequência:** o módulo não pode ser extraído sem reescrever quem o consome — exatamente o que o
padrão microservice-ready existe para evitar.
