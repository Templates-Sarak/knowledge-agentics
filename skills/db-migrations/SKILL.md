---
name: db-migrations
description: Modelagem de banco e migrations seguras — schema conforme padrao-escrita §5 e mudanças versionadas, reversíveis e expand-contract (zero-downtime), com backup e rollback sob HITL. Use ao criar/alterar schema ou escrever migrations. NÃO acione proativamente.
---

# Skill: Banco de Dados — Modelagem & Migrations

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Dona da **camada de dados** que `git`/`cyber` não cobrem: modelar o schema de um módulo e **mudar o schema
com segurança** (versionado, reversível, sem downtime). Mutativa e arriscada (toca dados de produção) →
**HITL com backup e rollback**.

> Disciplina de dados (tabelas prefixadas, posse por módulo, **sem JOIN/FK cross-módulo** — dado de outro
> módulo vem pelo `api/`) é norma `padrao-escrita` §5 — aqui se **aplica**. Performance de query (índices/N+1)
> é da `otimizacao-nivel-1` (backend). Segredo na connection string → `cyber-segredos`. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao criar/alterar schema, escrever uma migration, ou modelar os dados de um módulo.
- Mutativa (altera schema/dados) → HITL obrigatório antes de aplicar; **backup antes**.

## Workflow
Trate **uma mudança por vez**. Modelagem em `references/modelagem.md`; segurança em `references/migrations-seguras.md`.

1. **Modelar conforme §5** — tabelas **prefixadas pelo módulo** dono (`orders_items`); a tabela pertence a **um** módulo; **sem FK/JOIN para tabela de outro módulo** (o dado vem pelo contrato `api/`). Tipos/constraints/índices definidos com a mudança.
2. **Escrever a migration versionada** — pela ferramenta da stack (Alembic/Prisma/Knex/Flyway): **up** + **down** (reversível); uma mudança coesa por migration; nunca editar migration já aplicada.
3. **Avaliar segurança** — operação **destrutiva** (drop/rename de coluna, not-null sem default, mudança de tipo)? Use **expand-contract** (adicionar → migrar dados → trocar leitura → remover depois), não big-bang. Ver `references/migrations-seguras.md`.
4. **HITL — plano** — apresente: o que muda, **destrutivo?**, plano de **rollback** (down testado), **backup** feito, e impacto (lock/tempo em tabela grande). → "⚠️ Confirma a migration?". **Aguarde.**
5. **Aplicar + verificar** — backup → aplicar `up` → rodar testes/app → **testar o `down`** em ambiente seguro. Tabela grande: avaliar online/by-batch.
6. **Reportar** — versão da migration, mudanças, rollback disponível.

## Regras e limites
- **NUNCA** aplique migration destrutiva sem **backup** e **HITL** — perda de dado é irreversível.
- **NUNCA** edite uma migration **já aplicada** (em outro ambiente) — crie uma nova; o histórico é imutável.
- **NUNCA** crie FK/JOIN para tabela de **outro módulo** (§5) — o dado vem pelo `api/` do dono; tabelas prefixadas pelo módulo.
- **NÃO** faça mudança destrutiva big-bang em tabela com dados/produção — use **expand-contract** (adicionar antes, remover depois).
- **NÃO** entregue migration sem o `down` (reversível) testado.
- **NÃO** saia do escopo: índice por **performance** de query/N+1 → `otimizacao-nivel-1` (backend); segredo na conexão → `cyber-segredos`.

## Checklist "pronta"
- [ ] Schema conforme §5 (tabela prefixada, posse de um módulo, sem FK/JOIN cross-módulo)?
- [ ] Migration versionada com `up` **e** `down` (reversível); mudança coesa?
- [ ] Operação destrutiva tratada por expand-contract (não big-bang)?
- [ ] Backup feito; HITL aprovado; impacto (lock/tempo) avaliado?
- [ ] Aplicada, app/testes verdes, e `down` testado em ambiente seguro?

## Referências (Camada 3 — leia sob demanda)
- `references/modelagem.md` — regras de modelagem do `padrao-escrita` §5 (prefixo, posse, sem cross-módulo) com exemplos.
- `references/migrations-seguras.md` — expand-contract, reversibilidade, mudanças destrutivas, tabelas grandes, por stack.
