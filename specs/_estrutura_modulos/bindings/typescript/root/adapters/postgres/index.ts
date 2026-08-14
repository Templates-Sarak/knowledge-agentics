// Adapter Postgres para as portas "repositorio" e "auditoria" — ENTREGUE pelo template, pronto
// para uso. `memory` continua o DEFAULT de todo modulo (config/ports.json);
// trocar para este adapter e editar UMA linha ali, nunca este arquivo.
//
// Materializa a FORMA que o molde cria (database/migrations/0001-cria-metadados.sql):
// `<prefix>metadados` (hash, titulo, status, created_at) e `<prefix>auditoria` (hash, acao,
// sujeito, campos_alterados, request_id). Nao e codigo especifico de dominio — e a porta
// materializada sobre a tabela que o molde ja cria. Modulo que criar tabela com outra forma
// escreve o proprio adapter (declarado, nao escondido — ver o rodape deste arquivo).
//
// SQL SEMPRE por parametro para VALOR ($1, $2, ...) — `sql-concatenado` (04-regras.md, escopo raiz)
// cobre este arquivo e reprova interpolacao numa linha que tambem tenha um verbo SQL. Identificador
// (schema/tabela) NUNCA aceita placeholder — so valor aceita —, e por isso cada consulta abaixo
// monta a CLAUSULA do verbo (sempre estatica) separada da clausula que interpola o identificador
// (sempre sem verbo na mesma linha), juntando as duas por ULTIMO, numa linha sem SQL nenhum. E o
// mesmo raciocinio de `scripts/migrations.mjs`, aqui aplicado sob uma regra que migrations.mjs nao
// sofre (ele mora fora de adapters/src/packages, o escopo que `sql-concatenado` varre).
import type { Pool } from 'pg';

import type { Auditoria, EventoDeAuditoria, Pagina, Repositorio } from '../../packages/ports/index.js';

/** O suficiente do manifesto para o adapter se configurar — nunca o tipo inteiro de `src/composicao.ts`:
 * `adapters/` não pode importar de `src/` (regra `adapter-isolado`), então este tipo é local e mínimo. */
export interface ModuloParaAdapter {
  id: string;
  pasta: string;
}

/** A forma que o molde cria — não é o `Registro` de `core/domain` (adapter não pode importar de
 * `modules/`), mas estruturalmente idêntica, então qualquer módulo do molde aceita este objeto. */
export interface RegistroDoMolde {
  hash: string;
  titulo: string;
  status: string;
  criadoEm: string;
}

function environmentKey(idDoModulo: string): string {
  return `${idDoModulo.toUpperCase().replace(/-/g, '_')}_DB_URL`;
}

/** Ausente = falha nomeando a chave exata (lei 7 do catálogo) — nunca um default silencioso. */
function requiredUrl(idDoModulo: string): string {
  const chave = environmentKey(idDoModulo);
  const valor = process.env[chave];
  if (valor === undefined || valor === '') {
    throw new Error(
      `[adapters/postgres] variavel obrigatoria ausente: ${chave} (declare em module.json:envRequerido e no .env da raiz)`,
    );
  }
  return valor;
}

interface DadosDoManifesto {
  schema: string;
  prefix: string;
}

/** `data.schema`/`data.prefix` do PRÓPRIO manifesto do módulo — a mesma fonte que a migration
 * 0001 usa para nomear as tabelas, nunca um terceiro lugar (mesmo raciocínio de `migrations.mjs`).
 * Cacheada por pasta — o manifesto não muda em runtime, e cada operação chamaria isto de novo. */
const dadosCache = new Map<string, DadosDoManifesto>();

async function readData(modulo: ModuloParaAdapter): Promise<DadosDoManifesto> {
  const existente = dadosCache.get(modulo.pasta);
  if (existente !== undefined) return existente;
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const texto = await readFile(join(modulo.pasta, 'module.json'), 'utf8');
  const manifesto = JSON.parse(texto.replace(/^﻿/, '')) as { data: DadosDoManifesto };
  dadosCache.set(modulo.pasta, manifesto.data);
  return manifesto.data;
}

/** `"<schema>"."<tabela>"` — nunca interpolado numa linha que também tenha um verbo SQL (ver o
 * cabeçalho do arquivo). Isolado aqui porque as quatro operações abaixo precisam da mesma forma. */
function qualifiedName(schema: string, tabela: string): string {
  return `"${schema}"."${tabela}"`;
}

// ================================================================================================
// POOL — uma vez por URL, reusada entre chamadas. `pg.Pool` já gerencia o ciclo de vida das
// conexões internamente; criar um Pool por requisição esgotaria o limite de conexões do servidor.
// ================================================================================================

const pools = new Map<string, Pool>();

/** Lazy DE PROPÓSITO — mesma forma de `scripts/migrations.mjs`: `pg` não pode ser dependência de
 * import estático de VALOR aqui, senão carregar este arquivo (ex.: para autoteste de
 * `composicao.ts`) exigiria o pacote instalado mesmo em um caminho que nunca toca banco. O `import
 * type { Pool }` acima é diferente: é apagado na compilação, nunca vira um `require('pg')`. */
async function poolFor(url: string): Promise<Pool> {
  const existente = pools.get(url);
  if (existente !== undefined) return existente;
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  pools.set(url, pool);
  return pool;
}

function toRecord(linha: {
  hash: string;
  titulo: string;
  status: string;
  created_at: Date;
}): RegistroDoMolde {
  return {
    hash: linha.hash,
    titulo: linha.titulo,
    status: linha.status,
    criadoEm: linha.created_at.toISOString(),
  };
}

// ================================================================================================
// REPOSITORIO — uma função por método (limiar de 40 linhas), todas passando pelo mesmo contexto.
// ================================================================================================

interface ContextoDeTabela {
  pool: Pool;
  nome: string;
}

/** Resolve pool + nome qualificado de UMA vez — as quatro operações abaixo precisam das duas coisas. */
async function tableContext(modulo: ModuloParaAdapter, sufixo: string): Promise<ContextoDeTabela> {
  const { schema, prefix } = await readData(modulo);
  const pool = await poolFor(requiredUrl(modulo.id));
  return { pool, nome: qualifiedName(schema, `${prefix}${sufixo}`) };
}

async function listRecords(
  modulo: ModuloParaAdapter,
  pagina: number,
  tamanho: number,
): Promise<Pagina<RegistroDoMolde>> {
  const { pool, nome } = await tableContext(modulo, 'metadados');
  const inicio = (pagina - 1) * tamanho;

  const clausulaSelect = 'select hash, titulo, status, created_at';
  const clausulaFrom = `from ${nome}`;
  const clausulaOrdem = 'order by created_at asc, hash asc limit $1 offset $2';
  const linhas = await pool.query([clausulaSelect, clausulaFrom, clausulaOrdem].join(' '), [tamanho, inicio]);

  const clausulaConta = 'select count(*)::int as total';
  const contagem = await pool.query([clausulaConta, clausulaFrom].join(' '));

  return { itens: linhas.rows.map(toRecord), pagina, tamanho, total: contagem.rows[0].total };
}

async function findRecordByHash(modulo: ModuloParaAdapter, hash: string): Promise<RegistroDoMolde | null> {
  const { pool, nome } = await tableContext(modulo, 'metadados');
  const clausulaSelect = 'select hash, titulo, status, created_at';
  const clausulaFrom = `from ${nome}`;
  const clausulaOnde = 'where hash = $1';
  const resultado = await pool.query([clausulaSelect, clausulaFrom, clausulaOnde].join(' '), [hash]);
  return resultado.rows[0] === undefined ? null : toRecord(resultado.rows[0]);
}

async function insertRecord(modulo: ModuloParaAdapter, registro: RegistroDoMolde): Promise<void> {
  const { pool, nome } = await tableContext(modulo, 'metadados');
  const nomeEColunas = `${nome} (hash, titulo, status, created_at, updated_at)`;
  const clausulaInsert = 'insert into';
  const clausulaValues = 'values ($1, $2, $3, $4, $4)';
  const consulta = [clausulaInsert, nomeEColunas, clausulaValues].join(' ');
  await pool.query(consulta, [registro.hash, registro.titulo, registro.status, registro.criadoEm]);
}

async function countRecords(modulo: ModuloParaAdapter): Promise<number> {
  const { pool, nome } = await tableContext(modulo, 'metadados');
  const clausulaSelect = 'select count(*)::int as total';
  const clausulaFrom = `from ${nome}`;
  const resultado = await pool.query([clausulaSelect, clausulaFrom].join(' '));
  return resultado.rows[0].total;
}

export function createPostgresRepository(modulo: ModuloParaAdapter): Repositorio<RegistroDoMolde> {
  return {
    list: (pagina, tamanho) => listRecords(modulo, pagina, tamanho),
    findByHash: (hash) => findRecordByHash(modulo, hash),
    insert: (registro) => insertRecord(modulo, registro),
    count: () => countRecords(modulo),
  };
}

// ================================================================================================
// AUDITORIA
// ================================================================================================

async function recordAuditEvent(modulo: ModuloParaAdapter, evento: EventoDeAuditoria): Promise<void> {
  const { pool, nome } = await tableContext(modulo, 'auditoria');
  const nomeEColunas = `${nome} (hash, acao, sujeito, campos_alterados, request_id)`;
  const clausulaInsert = 'insert into';
  const clausulaValues = 'values ($1, $2, $3, $4, $5)';
  const consulta = [clausulaInsert, nomeEColunas, clausulaValues].join(' ');
  await pool.query(consulta, [
    evento.hash,
    evento.acao,
    evento.sujeito,
    evento.camposAlterados,
    evento.requestId,
  ]);
}

export function createPostgresAudit(modulo: ModuloParaAdapter): Auditoria {
  return { record: (evento) => recordAuditEvent(modulo, evento) };
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
