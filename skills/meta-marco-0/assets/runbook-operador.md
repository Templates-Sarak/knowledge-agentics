# Runbook do operador — passos que a skill NÃO executa

A skill nunca toca em banco de ambiente nem em credencial. Estes passos são seus, no seu tempo.

## 1. Squash de migrations (somente se você optar por ele)

Padrão do marco-0: **nenhuma migration aplicada é apagada** — nada a fazer aqui. Se decidir consolidar:

1. Confirme `schema_parity.py` = `proven` para a baseline candidata.
2. Faça backup do banco do ambiente.
3. Por ambiente, na ferramenta de migration: marque a baseline como aplicada **sem executá-la**
   (Flyway `baseline`, Alembic `stamp`, Prisma `migrate resolve --applied`, knex: insert na tabela de
   histórico). Isso altera só a tabela de histórico, nunca o schema.
4. Só então remova do repositório as migrations substituídas.
5. Valide: a ferramenta deve reportar "nada pendente" em cada ambiente.

## 2. Rotação de credenciais (propostas do relatório)

Para cada credencial listada: gere a nova, atualize o gerenciador de segredos do ambiente, reinicie o
serviço, revogue a antiga. O `.env` local não é alterado pelo marco-0.

## 3. Depois da tag

- Comunique o time: trabalho novo nasce na `develop`; `main` só recebe PR.
- Atualize pipelines de deploy para apontar para `main`/`v1.0.0` conforme o seu processo.
