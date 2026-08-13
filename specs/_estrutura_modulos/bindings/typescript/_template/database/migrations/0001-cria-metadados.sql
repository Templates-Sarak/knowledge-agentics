-- Primeira migration do modulo <modulo>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §6.3.
--
-- Regras materializadas aqui:
--   - schema DECLARADO em module.json:dados.schema. NUNCA "public".
--   - toda tabela prefixada <modulo>_ e declarada no manifesto.
--   - toda tabela com id, hash, created_at, updated_at.
--   - RLS ligada: defesa em profundidade (o controle primario e a autorizacao na api/).
--   - trilha append-only de verdade: o REVOKE e o que torna real a promessa do codigo.
--   - migration publicada NAO se edita — corrige-se com outra.
--   - <modulo>_migrations e a tabela de CONTROLE do runner (scripts/migrations.{mjs,py}): registra
--     o que ja foi aplicado, para "up" pular o que ja rodou e "down" saber qual foi o ultimo.

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

create index "<modulo>_metadados_status_idx" on "<escopo>"."<modulo>_metadados" (status);

alter table "<escopo>"."<modulo>_metadados" enable row level security;

-- Trilha de auditoria: guarda o NOME dos campos alterados, nunca o valor (specs/arquitetura/02-contrato-e-dados.md §6.4).
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

create index "<modulo>_auditoria_hash_idx" on "<escopo>"."<modulo>_auditoria" (hash);

alter table "<escopo>"."<modulo>_auditoria" enable row level security;

revoke update, delete on "<escopo>"."<modulo>_auditoria" from public;

-- rollback
-- drop table if exists "<escopo>"."<modulo>_auditoria";
-- drop table if exists "<escopo>"."<modulo>_metadados";
-- drop table if exists "<escopo>"."<modulo>_migrations";
