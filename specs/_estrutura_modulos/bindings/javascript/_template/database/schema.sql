-- Estado ALVO do schema do modulo <module>, depois da ultima migration.
-- Este arquivo e um espelho, nao a fonte: a fonte sao as migrations em database/migrations/.
-- Alterar schema em ambiente com dado real e HITL (specs/arquitetura/02-contrato-e-dados.md §6.3).

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

alter table "<scope>"."<module_snake>_metadata" enable row level security;

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

alter table "<scope>"."<module_snake>_audit" enable row level security;
