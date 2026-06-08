# Modelagem de Dados (padrao-escrita §5)

Banco **compartilhado, mas disciplinado**: cada módulo é dono das suas tabelas.

## Regras
- **Prefixo do módulo** em toda tabela: `orders_orders`, `orders_items`, `users_users`, `users_sessions`.
  Torna a posse explícita e a extração (microsserviço) trivial — as `orders_*` viajam com o módulo.
- **Posse única**: cada tabela pertence a **um** módulo. Só ele escreve/lê diretamente.
- **Sem JOIN/FK cross-módulo**: proibido `SELECT ... FROM users_users JOIN orders_orders` dentro de `orders`,
  e proibido FK de `orders_*` → `users_*`. Precisa do usuário? `UsersApi.get_user(userId)` e cruze em memória.
- **Chaves**: PK estável (UUID ou serial); guarde o **id** do recurso de outro módulo como valor simples (sem FK).

## Boas práticas de schema
- Tipos corretos (não `text` para tudo); `NOT NULL` + default onde faz sentido; `CHECK`/`UNIQUE` para invariantes.
- Índices nas colunas de busca/filtro/junção interna (detalhe de **performance** fica com `otimizacao-nivel-1` backend).
- Timestamps `created_at`/`updated_at`; soft-delete só se o domínio exige.
- Nomes em snake_case; tabela no plural prefixado (`orders_items`).

## ❌ vs ✅
```
❌ FK orders_items.user_id -> users_users.id        (acopla orders ao schema de users)
✅ orders_items.user_id  (apenas o id; o usuário vem por UsersApi.get_user(user_id))
```
