#!/usr/bin/env node
// Runner de migrations — aplica e reverte database/migrations/*.sql de um modulo contra Postgres.
// Lei dona: specs/arquitetura/02-contrato-e-dados.md §6.3.
//
//   node scripts/migrations.mjs up <module>       aplica as PENDENTES, em ordem — pula o que ja foi
//   node scripts/migrations.mjs down <module>     reverte so o ULTIMO aplicado (bloco "-- rollback")
//   node scripts/migrations.mjs ciclo <module>    up -> down -> up — prova que o rollback fecha,
//                                                  de qualquer estado inicial (vazio ou ja migrado)
//   node scripts/migrations.mjs --selftest       prova interna (parser, ordem, pending/ultimo)
//
// NAO MORA em tools/ (zero dependencia externa, lei 3 da base) — precisa de driver de
// Postgres, e tools/ so usa node:*. `pg` e devDependency do PROJETO (mesmo precedente de
// `tsx`, `@vitest/coverage-v8`): o runner VIAJA COM O PROJETO, nao com a base, e por isso mora
// aqui (scripts/) — nao em `adapters/` (adapter e para o processo composto trocar de provedor em
// RUNTIME; isto e ferramenta de operacao, nunca importada por `composition.ts`).
//
// DECISAO (a) [psql via execFileSync] x (b) [driver `pg`] — medido antes de escolher: nesta base de
// desenvolvimento `psql` nao esta disponivel (fora do PATH, e o winget so oferece SERVIDOR completo,
// nao um cliente isolado). Instalar um Postgres inteiro no sistema so para ter o CLI e acao pesada
// e dificil de reverter — desproporcional para um cliente. `pg` como devDependency e comum, escopada
// ao projeto, instalada pelo MESMO `npm install` que ja instala tudo mais, sem tocar o sistema.
//
// ESTADO POR MODULO — sem controle de versao de migration, um projeto com tres migrations e dois
// ambientes nao consegue rodar `up` a segunda vez. A tabela `<schema>.<prefix>migrations`
// (`arquivo text primary key`, `aplicada_em timestamptz`) e criada pela PRIMEIRA migration do
// molde — nao pelo runner: o runner so LE e ESCREVE nela, nunca decide a forma dela por fora do
// SQL versionado. `up` aplica só o que falta; `down` reverte só o ÚLTIMO aplicado (nunca "tudo de
// uma vez" — é o comportamento padrão de runner de migration, e o que faz `ciclo` funcionar de
// QUALQUER estado inicial, não só de banco vazio).
//
// ORDEM DENTRO DE CADA MIGRATION, POR TRANSACAO: `up` roda o SQL da migration e SÓ DEPOIS insere a
// linha de controle (a tabela pode ter acabado de nascer NAQUELE up); `down` faz o INVERSO — apaga
// a linha de controle ANTES de rodar o SQL de reversão, porque reverter a migration 0001 apaga a
// própria tabela de controle, e não dá para `DELETE` de uma tabela que acabou de sumir. As duas
// operações (bookkeeping + DDL) vivem na MESMA transação: se uma falhar, a outra não fica pela
// metade — Postgres roda DDL transacional, ao contrário de outros bancos.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// `pg` e LAZY, de proposito — mesma forma do `psycopg` em migrations.py (importado dentro da funcao
// que conecta, nunca no topo). O nucleo puro (splitUpDown, orderMigrations, environmentKey,
// pending, lastApplied) e o que `--selftest` prova, e ele nunca toca banco: um import de topo
// faria um teste que nao usa banco nenhum exigir o driver instalado, e `--selftest` deixaria de
// rodar "de qualquer lugar". Medido tambem (nao presumido) o formato do `await import('pg')`: o
// pacote e CJS, mas expoe `Client` como export NOMEADO tambem (alem de `.default.Client`) —
// desestruturar direto do resultado do import dinamico funciona, sem precisar de `.default`.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// ================================================================================================
// NUCLEO PURO — nunca toca disco nem rede. E a metade que `--selftest` prova.
// ================================================================================================

/** `<module>` valido — kebab-case minusculo, a MESMA forma que `create-module.mjs` exige ao nascer.
 * Serve DUAS funcoes: e o formato certo, E recusa de saida qualquer metacaractere de shell (`;`,
 * `$()`, `&`, espaco) — nenhuma entrada adversarial passa daqui para caminho de arquivo nem para
 * chave de ambiente. */
const VALID_MODULE_ID = /^[a-z][a-z0-9-]*$/;

const ROLLBACK_VERBS = /^(drop|alter|delete|truncate|revoke|grant|create|insert|update)\b/i;

/**
 * Separa o UP do DOWN de uma migration. O marcador e uma LINHA so com "-- rollback" — nao uma
 * ocorrencia em qualquer lugar do texto (diferente do regex de deteccao do gate, `data.mjs`, que
 * so precisa saber SE existe bloco, nunca onde ele comeca).
 */
export function splitUpDown(content) {
  const lines = content.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => /^\s*--\s*rollback\s*$/i.test(line));
  if (markerIndex === -1) return { up: content.trim(), down: '' };

  const up = lines.slice(0, markerIndex).join('\n').trim();
  const down = uncommentRollback(lines.slice(markerIndex + 1));
  return { up, down };
}

/**
 * Descomenta o bloco de rollback, linha a linha — NUNCA lanca. Linha em branco: descartada. Linha
 * comentada cujo conteudo comeca por um verbo de DDL/DML conhecido: descomentada (o "-- " sai,
 * preservando a indentacao). Qualquer outra coisa — comentario de verdade, linha ja sem "--" —
 * passa INALTERADA: e SQL valido de um jeito ou de outro (comentario sempre e; o resto so chega
 * aqui se ja nao estivesse comentado). E o que faz o parser nunca quebrar, provado por
 * `--selftest` com linha em branco, comentario que NAO e rollback, e indentacao.
 */
function uncommentRollback(lines) {
  return lines
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const matched = line.match(/^(\s*)--\s?(.*)$/);
      if (matched === null) return line;
      const [, indentation, rest] = matched;
      return ROLLBACK_VERBS.test(rest) ? `${indentation}${rest}` : line;
    })
    .join('\n')
    .trim();
}

/** Nome do arquivo -> prefixo NNNN. `null` quando foge do padrao — a regra `migrations` do gate ja
 * reprova isso; aqui so nao quebra a ordenacao. */
function prefix(fileName) {
  const matched = fileName.match(/^(\d{4})-/);
  return matched === null ? null : matched[1];
}

/** UP em ordem crescente (prefixo NNNN); DOWN e o INVERSO — reverte o que aplicou por ultimo primeiro. */
export function orderMigrations(names, direction) {
  const ordered = [...names].sort((a, b) => (prefix(a) ?? a).localeCompare(prefix(b) ?? b));
  return direction === 'down' ? ordered.reverse() : ordered;
}

/** `<module>` -> `<MODULE>_DB_URL` — a MESMA convencao de `module.json:requiredEnv`. */
export function environmentKey(moduleId) {
  return `${moduleId.toUpperCase().replace(/-/g, '_')}_DB_URL`;
}

/** Os nomes (ja ordenados por 'up') que NAO estao em `applied` — em ordem, o que falta aplicar. */
export function pending(orderedUpNames, applied) {
  return orderedUpNames.filter((name) => !applied.has(name));
}

/** O ULTIMO nome (na ordem 'up') que esta em `applied` — `null` se nenhum esta. E o alvo do `down`:
 * reverter um passo, nunca a lista inteira, e por isso `ciclo` funciona de qualquer estado. */
export function lastApplied(orderedUpNames, applied) {
  const done = orderedUpNames.filter((name) => applied.has(name));
  return done.length > 0 ? done.at(-1) : null;
}

// ================================================================================================
// CASCA — todo I/O nomeado e isolado aqui. Nucleo puro acima nunca e chamado por ela sem passar
// pelos pontos nomeados (leitura de arquivo, rede) explicitamente.
// ================================================================================================

function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

/** Pares chave=valor de um `.env` — mesma leitura de `src/composition.ts:readPairsEnv`. */
function readPairsEnv(path) {
  return readText(path)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const equalsIndex = line.indexOf('=');
      return [line.slice(0, equalsIndex).trim(), line.slice(equalsIndex + 1).trim()];
    });
}

/** Carrega o `.env` UNICO da raiz no processo, sem sobrescrever o que ja veio de fora — mesma
 * precedencia de `src/composition.ts:loadEnvRoot` (ADR-004). */
function loadEnvRoot() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const [key, value] of readPairsEnv(path)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** `<module>` valido E dentro de `modules/` — nunca escapa por `..` nem separador. Falha nomeando
 * a entrada recusada, nunca silenciosa. */
function moduleFolder(moduleId) {
  if (!VALID_MODULE_ID.test(moduleId)) {
    throw new Error(`[migrations] "${moduleId}" is not a valid module id (lowercase kebab-case)`);
  }
  const base = join(ROOT, 'modules');
  const dir = join(base, moduleId);
  if (!dir.startsWith(base + sep)) {
    throw new Error(`[migrations] "${moduleId}" resolves outside modules/ — refused`);
  }
  if (!existsSync(join(dir, 'module.json'))) {
    throw new Error(`[migrations] module "${moduleId}" not found in modules/`);
  }
  return dir;
}

function listMigrations(moduleDir) {
  const base = join(moduleDir, 'database', 'migrations');
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((name) => name.endsWith('.sql'));
}

/** `data.schema`/`data.prefix` do manifesto — a MESMA fonte que declara as tabelas do módulo,
 * nunca um terceiro lugar para o nome da tabela de controle. Devolve `{ schema, tabela, name }` —
 * `name` já qualificado (`"schema"."tabela"`), para as funções abaixo passarem UM parâmetro em vez
 * de dois (limiar de 4 parâmetros). */
function controlTable(moduleDir) {
  const manifest = JSON.parse(readText(join(moduleDir, 'module.json')));
  const schema = manifest.data.schema;
  const table = `${manifest.data.prefix}migrations`;
  return { schema, table, name: `"${schema}"."${table}"` };
}

/** Le uma variavel obrigatoria. Ausente = falha nomeando a chave (lei 7 do catalogo, mesmo padrao
 * de `api/src/config.ts:envRequired`). */
function requiredUrl(moduleId) {
  const key = environmentKey(moduleId);
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `[migrations] required variable missing: ${key} (declare it in module.json:requiredEnv and in the root .env)`,
    );
  }
  return value;
}

async function connect(url) {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** `Set` dos `file_name` já registrados — vazio (nunca erro) quando a tabela de controle ainda não
 * existe, o estado normal do PRIMEIRO `up` de um banco novo. */
async function appliedMigrations(client, schema, table) {
  const exists = await client.query(
    'select 1 from information_schema.tables where table_schema = $1 and table_name = $2',
    [schema, table],
  );
  if (exists.rowCount === 0) return new Set();
  const lines = await client.query(`select file_name from "${schema}"."${table}"`);
  return new Set(lines.rows.map((line) => line.file_name));
}

/** UMA migration, dentro de UMA transação: roda o SQL, depois grava a linha de controle — nessa
 * ordem, porque a migration 0001 CRIA a tabela de controle no próprio SQL que acabou de rodar.
 * `controlTable` já vem qualificada (`{ name }` de `controlTable`) — um parâmetro, não dois. */
async function applyOne(client, moduleDir, name, controlTable) {
  const content = readText(join(moduleDir, 'database', 'migrations', name));
  const { up } = splitUpDown(content);
  process.stdout.write(`  up ${name}...\n`);
  await client.query('begin');
  try {
    if (up !== '') await client.query(up);
    await client.query(`insert into ${controlTable} (file_name) values ($1)`, [name]);
    await client.query('commit');
  } catch (cause) {
    await client.query('rollback');
    throw cause;
  }
}

/** UMA migration revertida, dentro de UMA transação: apaga a linha de controle ANTES do SQL de
 * reversão — a ordem inversa de `applyOne`, pelo motivo simétrico: reverter 0001 apaga a própria
 * tabela de controle, e não há como `DELETE` dela depois que ela sumiu. */
async function revertOne(client, moduleDir, name, controlTable) {
  const content = readText(join(moduleDir, 'database', 'migrations', name));
  const { down } = splitUpDown(content);
  process.stdout.write(`  down ${name}...\n`);
  await client.query('begin');
  try {
    await client.query(`delete from ${controlTable} where file_name = $1`, [name]);
    if (down !== '') await client.query(down);
    await client.query('commit');
  } catch (cause) {
    await client.query('rollback');
    throw cause;
  }
}

async function applyPending(client, moduleDir) {
  const { schema, table, name: controlTable } = controlTable(moduleDir);
  const upNames = orderMigrations(listMigrations(moduleDir), 'up');
  const applied = await appliedMigrations(client, schema, table);
  const missing = pending(upNames, applied);
  if (missing.length === 0) {
    process.stdout.write('  nothing pending — every migration is already applied\n');
    return;
  }
  for (const name of missing) await applyOne(client, moduleDir, name, controlTable);
}

async function revertLast(client, moduleDir) {
  const { schema, table, name: controlTable } = controlTable(moduleDir);
  const upNames = orderMigrations(listMigrations(moduleDir), 'up');
  const applied = await appliedMigrations(client, schema, table);
  const target = lastApplied(upNames, applied);
  if (target === null) {
    process.stdout.write('  nothing applied — nothing to revert\n');
    return;
  }
  await revertOne(client, moduleDir, target, controlTable);
}

async function runUp(moduleId) {
  const moduleDir = moduleFolder(moduleId);
  const client = await connect(requiredUrl(moduleId));
  try {
    await applyPending(client, moduleDir);
  } finally {
    await client.end();
  }
}

async function runDown(moduleId) {
  const moduleDir = moduleFolder(moduleId);
  const client = await connect(requiredUrl(moduleId));
  try {
    await revertLast(client, moduleDir);
  } finally {
    await client.end();
  }
}

async function runCycle(moduleId) {
  process.stdout.write(`[migrations] ${moduleId}: up (applies pending)
`);
  await runUp(moduleId);
  process.stdout.write(`[migrations] ${moduleId}: down (reverts the last applied)
`);
  await runDown(moduleId);
  process.stdout.write(`[migrations] ${moduleId}: up (reapplies what down reverted)
`);
  await runUp(moduleId);
  process.stdout.write(`[migrations] ${moduleId}: cycle up -> down -> up OK
`);
}

// ================================================================================================
// AUTOTESTE — so o nucleo puro. up/down/ciclo sao I/O de verdade, provados pelo ciclo real contra
// Postgres (relatorio do bloco), nao por fixture em memoria.
// ================================================================================================

/** Os dois casos de bloco preenchido — a forma do molde e a adversarial (linha em branco, comentario
 * que nao e rollback, indentacao). Separado de `splitUpDownEmptyCases` so a funcao caber no
 * limiar de 40 linhas — o mesmo limiar que este arquivo existe para fazer valer no codigo do usuario. */
function splitUpDownFilledCases() {
  return [
    {
      name: 'simple block (the real template)',
      input: [
        'create table "acme"."x_metadata" (id uuid);',
        '',
        '-- rollback',
        '-- drop table if exists "acme"."x_audit";',
        '-- drop table if exists "acme"."x_metadata";',
      ].join('\n'),
      expected: {
        up: 'create table "acme"."x_metadata" (id uuid);',
        down: 'drop table if exists "acme"."x_audit";\ndrop table if exists "acme"."x_metadata";',
      },
    },
    {
      name: 'ADVERSARIAL: blank line, a comment that is NOT rollback, and indentation inside the block',
      input: [
        'create table "acme"."x" (id uuid);',
        '-- rollback',
        '  -- drop table if exists "acme"."x";',
        '',
        '-- atencao: isto e destrutivo, confirme antes de rodar em producao',
        '',
        '     -- alter table "acme"."x" disable trigger all;',
      ].join('\n'),
      expected: {
        up: 'create table "acme"."x" (id uuid);',
        down: [
          'drop table if exists "acme"."x";',
          '-- atencao: isto e destrutivo, confirme antes de rodar em producao',
          '     alter table "acme"."x" disable trigger all;',
        ].join('\n'),
      },
    },
  ];
}

/** Os dois casos SEM bloco de rollback (ausente / presente e vazio) — ver o motivo do split acima. */
function splitUpDownEmptyCases() {
  return [
    {
      name: 'no rollback block: empty down, up is the whole file',
      input: 'create table "acme"."x" (id uuid);',
      expected: { up: 'create table "acme"."x" (id uuid);', down: '' },
    },
    {
      name: 'empty rollback block (only the marker, nothing after)',
      input: 'create table "acme"."x" (id uuid);\n-- rollback\n',
      expected: { up: 'create table "acme"."x" (id uuid);', down: '' },
    },
  ];
}

function splitUpDownCases() {
  return [...splitUpDownFilledCases(), ...splitUpDownEmptyCases()];
}

function orderingCases() {
  return [
    {
      name: 'up: ascending order',
      names: ['0002-add-status.sql', '0001-create-metadata.sql'],
      direction: 'up',
      expected: ['0001-create-metadata.sql', '0002-add-status.sql'],
    },
    {
      name: 'down: REVERSE order',
      names: ['0001-create-metadata.sql', '0002-add-status.sql'],
      direction: 'down',
      expected: ['0002-add-status.sql', '0001-create-metadata.sql'],
    },
  ];
}

function environmentKeyCases() {
  return [
    { name: 'simple', id: 'catalog', expected: 'CATALOG_DB_URL' },
    { name: 'with hyphen', id: 'production-line', expected: 'PRODUCTION_LINE_DB_URL' },
  ];
}

/** `pending`/`lastApplied` contra os TRES estados que `ciclo` atravessa: banco vazio (nada
 * aplicado), banco parcialmente migrado, e banco totalmente migrado (o caso que trava `up` sem
 * este controle de estado — medido no teste real). */
function stateCases() {
  const names = ['0001-create-metadata.sql', '0002-add-status.sql', '0003-create-index.sql'];
  return [
    {
      name: 'pending: empty database -> all three, in order',
      fn: () => JSON.stringify(pending(names, new Set())) === JSON.stringify(names),
    },
    {
      name: 'pending: fully migrated database -> none (this is what used to hang)',
      fn: () => pending(names, new Set(names)).length === 0,
    },
    {
      name: 'pending: only the first applied -> the second and third remain, in order',
      fn: () => JSON.stringify(pending(names, new Set([names[0]]))) === JSON.stringify([names[1], names[2]]),
    },
    {
      name: 'lastApplied: none applied -> null (down has nothing to revert)',
      fn: () => lastApplied(names, new Set()) === null,
    },
    {
      name: 'lastApplied: all applied -> the THIRD (highest prefix), never the first',
      fn: () => lastApplied(names, new Set(names)) === names[2],
    },
    {
      name: 'lastApplied: applied out of order in the Set -> still the one with the HIGHEST prefix',
      fn: () => lastApplied(names, new Set([names[2], names[0]])) === names[2],
    },
  ];
}

/** Isolado de `runSelftest` só para a função caber no limiar de 40 linhas — o mesmo limiar que
 * este arquivo existe para fazer valer no código do usuário. */
function runStateCases() {
  let failures = 0;
  for (const testCase of stateCases()) {
    let ok;
    try {
      ok = testCase.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  return failures;
}

function runSelftest() {
  let failures = 0;
  let total = 0;

  for (const testCase of splitUpDownCases()) {
    total += 1;
    const obtained = splitUpDown(testCase.input);
    const ok = obtained.up === testCase.expected.up && obtained.down === testCase.expected.down;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} splitUpDown: ${testCase.name}\n`);
    if (!ok) {
      failures += 1;
      process.stdout.write(`       expected: ${JSON.stringify(testCase.expected)}\n`);
      process.stdout.write(`       obtained: ${JSON.stringify(obtained)}\n`);
    }
  }

  for (const testCase of orderingCases()) {
    total += 1;
    const obtained = orderMigrations(testCase.names, testCase.direction);
    const ok = JSON.stringify(obtained) === JSON.stringify(testCase.expected);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} orderMigrations: ${testCase.name}\n`);
    if (!ok) failures += 1;
  }

  for (const testCase of environmentKeyCases()) {
    total += 1;
    const obtained = environmentKey(testCase.id);
    const ok = obtained === testCase.expected;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} environmentKey: ${testCase.name}\n`);
    if (!ok) failures += 1;
  }

  total += stateCases().length;
  failures += runStateCases();

  process.stdout.write(`
selftest: ${total - failures}/${total} ok\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

async function principal() {
  const [command, target] = process.argv.slice(2);
  if (command === '--selftest') return runSelftest();

  if (!['up', 'down', 'cycle'].includes(command) || target === undefined) {
    process.stderr.write(
      'usage: node scripts/migrations.mjs up|down|cycle <module>\n' +
        '     node scripts/migrations.mjs --selftest\n',
    );
    return 1;
  }

  loadEnvRoot();
  try {
    if (command === 'up') await runUp(target);
    else if (command === 'down') await runDown(target);
    else await runCycle(target);
    return 0;
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 1;
  }
}

principal().then((code) => {
  process.exitCode = code;
});
