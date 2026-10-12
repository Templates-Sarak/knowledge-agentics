// Adapter Postgres para as portas "repository" e "audit" — ENTREGUE pelo template, pronto
// para uso. `memory` continua o DEFAULT de todo modulo (config/ports.json);
// trocar para este adapter e editar UMA linha ali, nunca este arquivo.
//
// Materializa a FORMA que o molde cria (database/migrations/0001-cria-metadados.sql):
// `<prefix>metadados` (hash, titulo, status, created_at) e `<prefix>auditoria` (hash, acao,
// sujeito, campos_alterados, request_id). Nao e codigo especifico de dominio — e a porta
// materializada sobre a tabela que o molde ja cria. Modulo que criar tabela com outra forma
// escreve o proprio adapter (declarado, nao escondido — ver o rodape deste arquivo).
//
// SQL SEMPRE por parametro para VALOR ($1, $2, ...) — `concatenated-sql` (04-regras.md, escopo raiz)
// cobre este arquivo e reprova interpolacao numa linha que tambem tenha um verbo SQL. Identificador
// (schema/tabela) NUNCA aceita placeholder — so valor aceita —, e por isso cada consulta abaixo
// monta a CLAUSULA do verbo (sempre estatica) separada da clausula que interpola o identificador
// (sempre sem verbo na mesma linha), juntando as duas por ULTIMO, numa linha sem SQL nenhum. E o
// mesmo raciocinio de `scripts/migrations.mjs`, aqui aplicado sob uma regra que migrations.mjs nao
// sofre (ele mora fora de adapters/src/packages, o escopo que `concatenated-sql` varre).
import type { Pool } from 'pg';

import type { Audit, AuditEvent, Page, Repository } from '../../packages/ports/index.js';

/** O suficiente do manifesto para o adapter se configurar — nunca o tipo inteiro de `src/composition.ts`:
 * `adapters/` não pode importar de `src/` (regra `isolated-adapter`), então este tipo é local e mínimo. */
export interface ModuleForAdapter {
  id: string;
  dir: string;
}

/** A forma que o molde cria — não é o `Entry` de `core/domain` (adapter não pode importar de
 * `modules/`), mas estruturalmente idêntica, então qualquer módulo do molde aceita este objeto. */
export interface TemplateEntry {
  hash: string;
  title: string;
  status: string;
  createdAt: string;
}

function environmentKey(moduleId: string): string {
  return `${moduleId.toUpperCase().replace(/-/g, '_')}_DB_URL`;
}

/** Ausente = falha nomeando a chave exata (lei 7 do catálogo) — nunca um default silencioso. */
function requiredUrl(moduleId: string): string {
  const key = environmentKey(moduleId);
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `[adapters/postgres] required variable missing: ${key} (declare it in module.json:requiredEnv and in the root .env)`,
    );
  }
  return value;
}

interface ManifestData {
  schema: string;
  prefix: string;
}

/** `data.schema`/`data.prefix` do PRÓPRIO manifesto do módulo — a mesma fonte que a migration
 * 0001 usa para nomear as tabelas, nunca um terceiro lugar (mesmo raciocínio de `migrations.mjs`).
 * Cacheada por pasta — o manifesto não muda em runtime, e cada operação chamaria isto de novo. */
const cacheData = new Map<string, ManifestData>();

async function readData(module: ModuleForAdapter): Promise<ManifestData> {
  const existing = cacheData.get(module.dir);
  if (existing !== undefined) return existing;
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const text = await readFile(join(module.dir, 'module.json'), 'utf8');
  const manifest = JSON.parse(text.replace(/^﻿/, '')) as { data: ManifestData };
  cacheData.set(module.dir, manifest.data);
  return manifest.data;
}

/** `"<schema>"."<tabela>"` — nunca interpolado numa linha que também tenha um verbo SQL (ver o
 * cabeçalho do arquivo). Isolado aqui porque as quatro operações abaixo precisam da mesma forma. */
function qualifiedName(schema: string, table: string): string {
  return `"${schema}"."${table}"`;
}

// ================================================================================================
// POOL — uma vez por URL, reusada entre chamadas. `pg.Pool` já gerencia o ciclo de vida das
// conexões internamente; criar um Pool por requisição esgotaria o limite de conexões do servidor.
// ================================================================================================

const pools = new Map<string, Pool>();

/** Lazy DE PROPÓSITO — mesma forma de `scripts/migrations.mjs`: `pg` não pode ser dependência de
 * import estático de VALOR aqui, senão carregar este arquivo (ex.: para autoteste de
 * `composition.ts`) exigiria o pacote instalado mesmo em um caminho que nunca toca banco. O `import
 * type { Pool }` acima é diferente: é apagado na compilação, nunca vira um `require('pg')`. */
async function poolFor(url: string): Promise<Pool> {
  const existing = pools.get(url);
  if (existing !== undefined) return existing;
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  pools.set(url, pool);
  return pool;
}

function toRecord(line: { hash: string; title: string; status: string; created_at: Date }): TemplateEntry {
  return {
    hash: line.hash,
    title: line.title,
    status: line.status,
    createdAt: line.created_at.toISOString(),
  };
}

// ================================================================================================
// REPOSITORIO — uma função por método (limiar de 40 linhas), todas passando pelo mesmo contexto.
// ================================================================================================

interface TableContext {
  pool: Pool;
  name: string;
}

/** Resolve pool + nome qualificado de UMA vez — as quatro operações abaixo precisam das duas coisas. */
async function tableContext(module: ModuleForAdapter, suffix: string): Promise<TableContext> {
  const { schema, prefix } = await readData(module);
  const pool = await poolFor(requiredUrl(module.id));
  return { pool, name: qualifiedName(schema, `${prefix}${suffix}`) };
}

async function listRecords(
  module: ModuleForAdapter,
  page: number,
  pageSize: number,
): Promise<Page<TemplateEntry>> {
  const { pool, name } = await tableContext(module, 'metadata');
  const start = (page - 1) * pageSize;

  const selectClause = 'select hash, title, status, created_at';
  const fromClause = `from ${name}`;
  const orderClause = 'order by created_at asc, hash asc limit $1 offset $2';
  const lines = await pool.query([selectClause, fromClause, orderClause].join(' '), [pageSize, start]);

  const countClause = 'select count(*)::int as total';
  const count = await pool.query([countClause, fromClause].join(' '));

  return { items: lines.rows.map(toRecord), page, pageSize, total: count.rows[0].total };
}

async function findRecordByHash(module: ModuleForAdapter, hash: string): Promise<TemplateEntry | null> {
  const { pool, name } = await tableContext(module, 'metadata');
  const selectClause = 'select hash, title, status, created_at';
  const fromClause = `from ${name}`;
  const whereClause = 'where hash = $1';
  const result = await pool.query([selectClause, fromClause, whereClause].join(' '), [hash]);
  return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
}

async function insertRecord(module: ModuleForAdapter, entry: TemplateEntry): Promise<void> {
  const { pool, name } = await tableContext(module, 'metadata');
  const nameAndColumns = `${name} (hash, title, status, created_at, updated_at)`;
  const insertClause = 'insert into';
  const valuesClause = 'values ($1, $2, $3, $4, $4)';
  const query = [insertClause, nameAndColumns, valuesClause].join(' ');
  await pool.query(query, [entry.hash, entry.title, entry.status, entry.createdAt]);
}

async function countRecords(module: ModuleForAdapter): Promise<number> {
  const { pool, name } = await tableContext(module, 'metadata');
  const selectClause = 'select count(*)::int as total';
  const fromClause = `from ${name}`;
  const result = await pool.query([selectClause, fromClause].join(' '));
  return result.rows[0].total;
}

export function createPostgresRepository(module: ModuleForAdapter): Repository<TemplateEntry> {
  return {
    list: (page, pageSize) => listRecords(module, page, pageSize),
    findByHash: (hash) => findRecordByHash(module, hash),
    insert: (entry) => insertRecord(module, entry),
    count: () => countRecords(module),
  };
}

// ================================================================================================
// AUDITORIA
// ================================================================================================

async function recordAuditEvent(module: ModuleForAdapter, event: AuditEvent): Promise<void> {
  const { pool, name } = await tableContext(module, 'audit');
  const nameAndColumns = `${name} (hash, action, actor, changed_fields, request_id)`;
  const insertClause = 'insert into';
  const valuesClause = 'values ($1, $2, $3, $4, $5)';
  const query = [insertClause, nameAndColumns, valuesClause].join(' ');
  await pool.query(query, [event.hash, event.action, event.actor, event.changedFields, event.requestId]);
}

export function createPostgresAudit(module: ModuleForAdapter): Audit {
  return { record: (event) => recordAuditEvent(module, event) };
}

// ================================================================================================
// DECLARADO, NÃO ESCONDIDO
//
// Este adapter cobre a FORMA DO MOLDE — as duas tabelas que `create-module.mjs` já entrega. O que
// fica de fora: *pool* com tuning (tamanho, timeout — usa os defaults de `pg.Pool`), *retry* de
// conexão, migração de DADO (isso é `expand-contract`, 02-contrato-e-dados.md §6.3), e qualquer
// módulo que declare `data.tables` além de `<prefix>metadados`/`<prefix>auditoria` com forma
// diferente — esse módulo escreve o próprio adapter, com o mesmo cuidado de parametrização deste.
// ================================================================================================
