# Migrations Seguras

Princípio: **versionada, reversível, sem perder dado, sem downtime**. Migration aplicada é **imutável** — corrija com uma nova.

## Ferramentas por stack
| Stack | Ferramenta |
|---|---|
| Python | Alembic (SQLAlchemy) |
| Node/TS | Prisma Migrate, Knex, TypeORM |
| Multi/SQL | Flyway, Liquibase |

Toda migration tem **`up`** (aplica) e **`down`** (reverte). Uma mudança coesa por migration.

## Expand-contract (mudança destrutiva sem downtime)
Nunca renomeie/remova/aperte coluna num passo só com app rodando. Faça em fases:
1. **Expand** — adicione o novo (coluna/tabela nullable, novo índice) sem quebrar o velho.
2. **Migrar dados** — backfill em lote; app passa a escrever nos dois.
3. **Trocar leitura** — app lê do novo; valida.
4. **Contract** — remova o velho **numa migration posterior**, depois de tudo estável.

Exemplos:
- Renomear coluna → adicionar nova + copiar + trocar código + remover depois (não `RENAME` direto).
- `NOT NULL` em coluna existente → adicionar com default/nullable → backfill → impor `NOT NULL` depois.
- Trocar tipo → nova coluna + conversão + troca.

## Tabelas grandes (lock/tempo)
- `ALTER`/`CREATE INDEX` pode **travar** a tabela. Em Postgres use `CREATE INDEX CONCURRENTLY`; backfill **em lotes**.
- Avalie a janela e o tempo estimado antes de aplicar; em produção, prefira online/by-batch.

## Antes de aplicar (HITL)
- **Backup**/snapshot do banco.
- **`down` testado** em ambiente seguro (sobe e desce limpo).
- Plano de **rollback** claro; impacto (lock/tempo) documentado.
