-- Estado ALVO do schema do modulo <modulo>, depois da ultima migration.
-- Este arquivo e um espelho, nao a fonte: a fonte sao as migrations em database/migrations/.
-- Alterar schema em ambiente com dado real e HITL (specs/arquitetura/02-contrato-e-dados.md §6.3).

create schema if not exists "<escopo>";

create table "<escopo>"."<modulo>_migrations" (
  arquivo      text        primary key,
  aplicada_em  timestamptz not null default now()
);

alter table "<escopo>"."<modulo>_migrations" enable row level security;

create table "<escopo>"."<modulo>_metadados" (
  id          uuid primary key default gen_random_uuid(),
  hash        text        not null unique,
  titulo      text        not null,
  status      text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table "<escopo>"."<modulo>_metadados" enable row level security;

create table "<escopo>"."<modulo>_auditoria" (
  id               uuid primary key default gen_random_uuid(),
  hash             text        not null,
  acao             text        not null,
  sujeito          text        not null,
  campos_alterados text[]      not null default '{}',
  request_id       text        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table "<escopo>"."<modulo>_auditoria" enable row level security;
