-- Primeira migration do modulo <module>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §6.3.
--
-- Regras materializadas aqui:
--   - schema DECLARADO em module.json:data.schema. NUNCA "public".
--   - toda tabela prefixada <module_snake>_ e declarada no manifesto.
--   - toda tabela com id, hash, created_at, updated_at.
--   - RLS ligada: defesa em profundidade (o controle primario e a autorizacao na api/).
--   - trilha append-only de verdade: o REVOKE e o que torna real a promessa do codigo.
--   - migration publicada NAO se edita — corrige-se com outra.
--   - <module_snake>_migrations e a tabela de CONTROLE do runner (scripts/migrations.{mjs,py}): registra
--     o que ja foi aplicado, para "up" pular o que ja rodou e "down" saber qual foi o ultimo.

create schema if not exists "<scope>";

create table "<scope>"."<module_snake>_migrations" (
  file_name    text        primary key,
  applied_at   timestamptz not null default now()
);

alter table "<scope>"."<module_snake>_migrations" enable row level security;

create table "<scope>"."<module_snake>_metadata" (
  id          uuid primary key default gen_random_uuid(),
  hash        text        not null unique,
  title       text        not null,
  status      text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index "<module_snake>_metadata_status_idx" on "<scope>"."<module_snake>_metadata" (status);

alter table "<scope>"."<module_snake>_metadata" enable row level security;

-- Trilha de auditoria: guarda o NOME dos campos alterados, nunca o valor (specs/arquitetura/02-contrato-e-dados.md §6.4).
create table "<scope>"."<module_snake>_audit" (
  id               uuid primary key default gen_random_uuid(),
  hash             text        not null,
  action           text        not null,
  actor            text        not null,
  changed_fields   text[]      not null default '{}',
  request_id       text        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index "<module_snake>_audit_hash_idx" on "<scope>"."<module_snake>_audit" (hash);

alter table "<scope>"."<module_snake>_audit" enable row level security;

revoke update, delete on "<scope>"."<module_snake>_audit" from public;

-- rollback
-- drop table if exists "<scope>"."<module_snake>_audit";
-- drop table if exists "<scope>"."<module_snake>_metadata";
-- drop table if exists "<scope>"."<module_snake>_migrations";
