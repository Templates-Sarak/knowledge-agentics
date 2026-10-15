# Migrations — classificar, provar paridade, nunca alterar o banco

Premissa: o **arquivo de schema** é o que recria o banco. A cadeia de migrations serve para **atualizar
bancos que já existem**. Regra do marco-0: *o banco não muda*.

## 1. Classificar (HITL do dev)

| Classe | Fato | Tratamento |
|---|---|---|
| **Aplicada** | consta no histórico de algum ambiente | **Mantém.** Apagar quebra ferramentas que validam histórico (Flyway `validate`, Alembic, knex). |
| **Nunca aplicada** | rascunho, órfã, duplicada, abandonada | **Removível** — `Grep` + HITL. |
| **Net-zero** | cria e descarta o mesmo objeto, ambas aplicadas | Mantém; candidata a *squash* futuro, fora do marco-0. |

A lista de ambientes e do que foi aplicado em cada um **vem do dev** (a skill não conecta em banco vivo).
Sem a lista, tudo é tratado como *Aplicada*.

## 2. Provar a paridade

```
python scripts/schema_parity.py --schema-file <schema.sql> --migrations-dir <dir> [--profile postgres-docker] --json
```

Sobe um banco **efêmero**, aplica o schema e dumpa; reinicia, aplica a cadeia e dumpa; compara os dumps
normalizados.

| veredito | exit | significado | ação |
|---|---|---|---|
| `proven` | 0 | idênticos | segue |
| `divergent` | 1 | schema ≠ cadeia (`diff_preview`) | **PARE**; corrija a divergência (schema ou migration) |
| `not-proven` | 2 | não deu para provar (Docker ausente, passo falhou) | **avise o usuário e exija a correção** antes de prosseguir |

`not-proven` **não é verde**. Perfis e comandos ficam em `scripts/config.json` (`parity_profiles`); para
outra stack/ferramenta acrescente um perfil — não edite o script. Ferramenta gerenciada (Prisma, Alembic…)
usa o passo `apply_migrations` do perfil com o comando de deploy dela.

## 3. O que a skill NUNCA faz

- Conectar em banco de ambiente, aplicar migration, ou alterar a tabela de histórico.
- "Carimbar" baseline: se o dev optar por *squash*, o carimbo por ambiente é do operador, via
  `assets/runbook-operador.md`.
- Apagar `down`/rollback de migration aplicada.

## 4. Segurança de mudança

Qualquer ajuste de schema que a divergência peça segue a `db-migrations` (expand-contract, backup,
rollback sob HITL) — fora do escopo de "limpeza".
