#!/usr/bin/env node
// Runner de migrations — aplica e reverte database/migrations/*.sql de um modulo contra Postgres.
// Lei dona: specs/arquitetura/02-contrato-e-dados.md §6.3.
//
//   node scripts/migrations.mjs up <modulo>       aplica as PENDENTES, em ordem — pula o que ja foi
//   node scripts/migrations.mjs down <modulo>     reverte so o ULTIMO aplicado (bloco "-- rollback")
//   node scripts/migrations.mjs ciclo <modulo>    up -> down -> up — prova que o rollback fecha,
//                                                  de qualquer estado inicial (vazio ou ja migrado)
//   node scripts/migrations.mjs --autoteste       prova interna (parser, ordem, pending/ultimo)
//
// NAO MORA em tools/ (zero dependencia externa, lei 3 da base) — precisa de driver de
// Postgres, e tools/ so usa node:*. `pg` e devDependency do PROJETO (mesmo precedente de
// `tsx`, `@vitest/coverage-v8`): o runner VIAJA COM O PROJETO, nao com a base, e por isso mora
// aqui (scripts/) — nao em `adapters/` (adapter e para o processo composto trocar de provedor em
// RUNTIME; isto e ferramenta de operacao, nunca importada por `composicao.ts`).
//
// DECISAO (a) [psql via execFileSync] x (b) [driver `pg`] — medido antes de escolher: nesta base de
// desenvolvimento `psql` nao esta disponivel (fora do PATH, e o winget so oferece SERVIDOR completo,
// nao um cliente isolado). Instalar um Postgres inteiro no sistema so para ter o CLI e acao pesada
// e dificil de reverter — desproporcional para um cliente. `pg` como devDependency e comum, escopada
// ao projeto, instalada pelo MESMO `npm install` que ja instala tudo mais, sem tocar o sistema.
//
// ESTADO POR MODULO (plan-2.2.md Bloco Y) — o limite que o plan.md original declarava ("sem
// controle de versao de migration") mordeu em uso real: um projeto com tres migrations e dois
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
// pending, lastApplied) e o que `--autoteste` prova, e ele nunca toca banco: um import de topo
// faria um teste que nao usa banco nenhum exigir o driver instalado, e `--autoteste` deixaria de
// rodar "de qualquer lugar". Medido tambem (nao presumido) o formato do `await import('pg')`: o
// pacote e CJS, mas expoe `Client` como export NOMEADO tambem (alem de `.default.Client`) —
// desestruturar direto do resultado do import dinamico funciona, sem precisar de `.default`.
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');

// ================================================================================================
// NUCLEO PURO — nunca toca disco nem rede. E a metade que `--autoteste` prova.
// ================================================================================================

/** `<modulo>` valido — kebab-case minusculo, a MESMA forma que `create-module.mjs` exige ao nascer.
 * Serve DUAS funcoes: e o formato certo, E recusa de saida qualquer metacaractere de shell (`;`,
 * `$()`, `&`, espaco) — nenhuma entrada adversarial passa daqui para caminho de arquivo nem para
 * chave de ambiente. */
const ID_DE_MODULO_VALIDO = /^[a-z][a-z0-9-]*$/;

const VERBOS_DE_REVERSAO = /^(drop|alter|delete|truncate|revoke|grant|create|insert|update)\b/i;

/**
 * Separa o UP do DOWN de uma migration. O marcador e uma LINHA so com "-- rollback" — nao uma
 * ocorrencia em qualquer lugar do texto (diferente do regex de deteccao do gate, `data.mjs`, que
 * so precisa saber SE existe bloco, nunca onde ele comeca).
 */
export function splitUpDown(conteudo) {
  const linhas = conteudo.split(/\r?\n/);
  const indiceMarcador = linhas.findIndex((linha) => /^\s*--\s*rollback\s*$/i.test(linha));
  if (indiceMarcador === -1) return { up: conteudo.trim(), down: '' };

  const up = linhas.slice(0, indiceMarcador).join('\n').trim();
  const down = uncommentRollback(linhas.slice(indiceMarcador + 1));
  return { up, down };
}

/**
 * Descomenta o bloco de rollback, linha a linha — NUNCA lanca. Linha em branco: descartada. Linha
 * comentada cujo conteudo comeca por um verbo de DDL/DML conhecido: descomentada (o "-- " sai,
 * preservando a indentacao). Qualquer outra coisa — comentario de verdade, linha ja sem "--" —
 * passa INALTERADA: e SQL valido de um jeito ou de outro (comentario sempre e; o resto so chega
 * aqui se ja nao estivesse comentado). E o que faz o parser nunca quebrar, provado por
 * `--autoteste` com linha em branco, comentario que NAO e rollback, e indentacao.
 */
function uncommentRollback(linhas) {
  return linhas
    .filter((linha) => linha.trim() !== '')
    .map((linha) => {
      const casado = linha.match(/^(\s*)--\s?(.*)$/);
      if (casado === null) return linha;
      const [, indentacao, resto] = casado;
      return VERBOS_DE_REVERSAO.test(resto) ? `${indentacao}${resto}` : linha;
    })
    .join('\n')
    .trim();
}

/** Nome do arquivo -> prefixo NNNN. `null` quando foge do padrao — a regra `migrations` do gate ja
 * reprova isso; aqui so nao quebra a ordenacao. */
function prefix(nomeDeArquivo) {
  const casado = nomeDeArquivo.match(/^(\d{4})-/);
  return casado === null ? null : casado[1];
}

/** UP em ordem crescente (prefixo NNNN); DOWN e o INVERSO — reverte o que aplicou por ultimo primeiro. */
export function orderMigrations(nomes, direcao) {
  const ordenados = [...nomes].sort((a, b) => (prefix(a) ?? a).localeCompare(prefix(b) ?? b));
  return direcao === 'down' ? ordenados.reverse() : ordenados;
}

/** `<modulo>` -> `<MODULO>_DB_URL` — a MESMA convencao de `module.json:requiredEnv`. */
export function environmentKey(idDoModulo) {
  return `${idDoModulo.toUpperCase().replace(/-/g, '_')}_DB_URL`;
}

/** Os nomes (ja ordenados por 'up') que NAO estao em `aplicados` — em ordem, o que falta aplicar. */
export function pending(nomesOrdenadosUp, aplicados) {
  return nomesOrdenadosUp.filter((nome) => !aplicados.has(nome));
}

/** O ULTIMO nome (na ordem 'up') que esta em `aplicados` — `null` se nenhum esta. E o alvo do `down`:
 * reverter um passo, nunca a lista inteira, e por isso `ciclo` funciona de qualquer estado. */
export function lastApplied(nomesOrdenadosUp, aplicados) {
  const feitos = nomesOrdenadosUp.filter((nome) => aplicados.has(nome));
  return feitos.length > 0 ? feitos.at(-1) : null;
}

// ================================================================================================
// CASCA — todo I/O nomeado e isolado aqui. Nucleo puro acima nunca e chamado por ela sem passar
// pelos pontos nomeados (leitura de arquivo, rede) explicitamente.
// ================================================================================================

function readText(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

/** Pares chave=valor de um `.env` — mesma leitura de `src/composicao.ts:readPairsEnv`. */
function readPairsEnv(caminho) {
  return readText(caminho)
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#') && linha.includes('='))
    .map((linha) => {
      const igual = linha.indexOf('=');
      return [linha.slice(0, igual).trim(), linha.slice(igual + 1).trim()];
    });
}

/** Carrega o `.env` UNICO da raiz no processo, sem sobrescrever o que ja veio de fora — mesma
 * precedencia de `src/composicao.ts:loadEnvRoot` (ADR-004). */
function loadEnvRoot() {
  const caminho = join(RAIZ, '.env');
  if (!existsSync(caminho)) return;
  for (const [chave, valor] of readPairsEnv(caminho)) {
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

/** `<modulo>` valido E dentro de `modules/` — nunca escapa por `..` nem separador. Falha nomeando
 * a entrada recusada, nunca silenciosa. */
function moduleFolder(idDoModulo) {
  if (!ID_DE_MODULO_VALIDO.test(idDoModulo)) {
    throw new Error(`[migrations] "${idDoModulo}" nao e um id de modulo valido (kebab-case minusculo)`);
  }
  const base = join(RAIZ, 'modules');
  const pasta = join(base, idDoModulo);
  if (!pasta.startsWith(base + sep)) {
    throw new Error(`[migrations] "${idDoModulo}" resolve para fora de modules/ — recusado`);
  }
  if (!existsSync(join(pasta, 'module.json'))) {
    throw new Error(`[migrations] modulo "${idDoModulo}" nao encontrado em modules/`);
  }
  return pasta;
}

function listMigrations(pastaModulo) {
  const base = join(pastaModulo, 'database', 'migrations');
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((nome) => nome.endsWith('.sql'));
}

/** `data.schema`/`data.prefix` do manifesto — a MESMA fonte que declara as tabelas do módulo,
 * nunca um terceiro lugar para o nome da tabela de controle. Devolve `{ schema, tabela, name }` —
 * `name` já qualificado (`"schema"."tabela"`), para as funções abaixo passarem UM parâmetro em vez
 * de dois (limiar de 4 parâmetros). */
function controlTable(pastaModulo) {
  const manifesto = JSON.parse(readText(join(pastaModulo, 'module.json')));
  const schema = manifesto.data.schema;
  const tabela = `${manifesto.data.prefix}migrations`;
  return { schema, tabela, nome: `"${schema}"."${tabela}"` };
}

/** Le uma variavel obrigatoria. Ausente = falha nomeando a chave (lei 7 do catalogo, mesmo padrao
 * de `api/src/config.ts:envRequired`). */
function requiredUrl(idDoModulo) {
  const chave = environmentKey(idDoModulo);
  const valor = process.env[chave];
  if (valor === undefined || valor === '') {
    throw new Error(
      `[migrations] variavel obrigatoria ausente: ${chave} (declare em module.json:envRequerido e no .env da raiz)`,
    );
  }
  return valor;
}

async function connect(url) {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** `Set` dos `arquivo` já registrados — vazio (nunca erro) quando a tabela de controle ainda não
 * existe, o estado normal do PRIMEIRO `up` de um banco novo. */
async function appliedMigrations(client, schema, tabela) {
  const existe = await client.query(
    'select 1 from information_schema.tables where table_schema = $1 and table_name = $2',
    [schema, tabela],
  );
  if (existe.rowCount === 0) return new Set();
  const linhas = await client.query(`select arquivo from "${schema}"."${tabela}"`);
  return new Set(linhas.rows.map((linha) => linha.arquivo));
}

/** UMA migration, dentro de UMA transação: roda o SQL, depois grava a linha de controle — nessa
 * ordem, porque a migration 0001 CRIA a tabela de controle no próprio SQL que acabou de rodar.
 * `tabelaControle` já vem qualificada (`{ name }` de `controlTable`) — um parâmetro, não dois. */
async function applyOne(client, pastaModulo, nome, tabelaControle) {
  const conteudo = readText(join(pastaModulo, 'database', 'migrations', nome));
  const { up } = splitUpDown(conteudo);
  process.stdout.write(`  up ${nome}...\n`);
  await client.query('begin');
  try {
    if (up !== '') await client.query(up);
    await client.query(`insert into ${tabelaControle} (arquivo) values ($1)`, [nome]);
    await client.query('commit');
  } catch (causa) {
    await client.query('rollback');
    throw causa;
  }
}

/** UMA migration revertida, dentro de UMA transação: apaga a linha de controle ANTES do SQL de
 * reversão — a ordem inversa de `applyOne`, pelo motivo simétrico: reverter 0001 apaga a própria
 * tabela de controle, e não há como `DELETE` dela depois que ela sumiu. */
async function revertOne(client, pastaModulo, nome, tabelaControle) {
  const conteudo = readText(join(pastaModulo, 'database', 'migrations', nome));
  const { down } = splitUpDown(conteudo);
  process.stdout.write(`  down ${nome}...\n`);
  await client.query('begin');
  try {
    await client.query(`delete from ${tabelaControle} where arquivo = $1`, [nome]);
    if (down !== '') await client.query(down);
    await client.query('commit');
  } catch (causa) {
    await client.query('rollback');
    throw causa;
  }
}

async function applyPending(client, pastaModulo) {
  const { schema, tabela, nome: tabelaControle } = controlTable(pastaModulo);
  const nomesUp = orderMigrations(listMigrations(pastaModulo), 'up');
  const aplicados = await appliedMigrations(client, schema, tabela);
  const faltam = pending(nomesUp, aplicados);
  if (faltam.length === 0) {
    process.stdout.write('  nada pendente — todas as migrations ja estao aplicadas\n');
    return;
  }
  for (const nome of faltam) await applyOne(client, pastaModulo, nome, tabelaControle);
}

async function revertLast(client, pastaModulo) {
  const { schema, tabela, nome: tabelaControle } = controlTable(pastaModulo);
  const nomesUp = orderMigrations(listMigrations(pastaModulo), 'up');
  const aplicados = await appliedMigrations(client, schema, tabela);
  const alvo = lastApplied(nomesUp, aplicados);
  if (alvo === null) {
    process.stdout.write('  nada aplicado — nada a reverter\n');
    return;
  }
  await revertOne(client, pastaModulo, alvo, tabelaControle);
}

async function runUp(idDoModulo) {
  const pastaModulo = moduleFolder(idDoModulo);
  const client = await connect(requiredUrl(idDoModulo));
  try {
    await applyPending(client, pastaModulo);
  } finally {
    await client.end();
  }
}

async function runDown(idDoModulo) {
  const pastaModulo = moduleFolder(idDoModulo);
  const client = await connect(requiredUrl(idDoModulo));
  try {
    await revertLast(client, pastaModulo);
  } finally {
    await client.end();
  }
}

async function runCycle(idDoModulo) {
  process.stdout.write(`[migrations] ${idDoModulo}: up (aplica pendentes)\n`);
  await runUp(idDoModulo);
  process.stdout.write(`[migrations] ${idDoModulo}: down (reverte o ultimo aplicado)\n`);
  await runDown(idDoModulo);
  process.stdout.write(`[migrations] ${idDoModulo}: up (reaplica o que o down reverteu)\n`);
  await runUp(idDoModulo);
  process.stdout.write(`[migrations] ${idDoModulo}: ciclo up -> down -> up OK\n`);
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
      nome: 'bloco simples (o molde de verdade)',
      entrada: [
        'create table "acme"."x_metadados" (id uuid);',
        '',
        '-- rollback',
        '-- drop table if exists "acme"."x_auditoria";',
        '-- drop table if exists "acme"."x_metadados";',
      ].join('\n'),
      esperado: {
        up: 'create table "acme"."x_metadados" (id uuid);',
        down: 'drop table if exists "acme"."x_auditoria";\ndrop table if exists "acme"."x_metadados";',
      },
    },
    {
      nome: 'ADVERSARIAL: linha em branco, comentario que NAO e rollback, e indentacao dentro do bloco',
      entrada: [
        'create table "acme"."x" (id uuid);',
        '-- rollback',
        '  -- drop table if exists "acme"."x";',
        '',
        '-- atencao: isto e destrutivo, confirme antes de rodar em producao',
        '',
        '     -- alter table "acme"."x" disable trigger all;',
      ].join('\n'),
      esperado: {
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
      nome: 'sem bloco de rollback: down vazio, up e o arquivo inteiro',
      entrada: 'create table "acme"."x" (id uuid);',
      esperado: { up: 'create table "acme"."x" (id uuid);', down: '' },
    },
    {
      nome: 'bloco de rollback vazio (so a marca, nada depois)',
      entrada: 'create table "acme"."x" (id uuid);\n-- rollback\n',
      esperado: { up: 'create table "acme"."x" (id uuid);', down: '' },
    },
  ];
}

function splitUpDownCases() {
  return [...splitUpDownFilledCases(), ...splitUpDownEmptyCases()];
}

function orderingCases() {
  return [
    {
      nome: 'up: ordem crescente',
      nomes: ['0002-acrescenta-status.sql', '0001-cria-metadados.sql'],
      direcao: 'up',
      esperado: ['0001-cria-metadados.sql', '0002-acrescenta-status.sql'],
    },
    {
      nome: 'down: ordem INVERSA',
      nomes: ['0001-cria-metadados.sql', '0002-acrescenta-status.sql'],
      direcao: 'down',
      esperado: ['0002-acrescenta-status.sql', '0001-cria-metadados.sql'],
    },
  ];
}

function environmentKeyCases() {
  return [
    { nome: 'simples', id: 'catalogo', esperado: 'CATALOGO_DB_URL' },
    { nome: 'com hifen', id: 'linha-de-producao', esperado: 'LINHA_DE_PRODUCAO_DB_URL' },
  ];
}

/** `pending`/`lastApplied` contra os TRES estados que `ciclo` atravessa: banco vazio (nada
 * aplicado), banco parcialmente migrado, e banco totalmente migrado (o caso que travava `up`
 * antes deste bloco — medido no teste real, plan-2.2.md Bloco Y). */
function stateCases() {
  const nomes = ['0001-cria-metadados.sql', '0002-acrescenta-status.sql', '0003-cria-indice.sql'];
  return [
    {
      nome: 'pending: banco vazio -> as tres, em ordem',
      fn: () => JSON.stringify(pending(nomes, new Set())) === JSON.stringify(nomes),
    },
    {
      nome: 'pending: banco ja migrado por completo -> nenhuma (isto e o que travava antes)',
      fn: () => pending(nomes, new Set(nomes)).length === 0,
    },
    {
      nome: 'pending: so a primeira aplicada -> falta a segunda e a terceira, em ordem',
      fn: () => JSON.stringify(pending(nomes, new Set([nomes[0]]))) === JSON.stringify([nomes[1], nomes[2]]),
    },
    {
      nome: 'lastApplied: nenhuma aplicada -> null (down nao tem o que reverter)',
      fn: () => lastApplied(nomes, new Set()) === null,
    },
    {
      nome: 'lastApplied: todas aplicadas -> a TERCEIRA (maior prefixo), nunca a primeira',
      fn: () => lastApplied(nomes, new Set(nomes)) === nomes[2],
    },
    {
      nome: 'lastApplied: aplicadas fora de ordem no Set -> ainda assim a de MAIOR prefixo',
      fn: () => lastApplied(nomes, new Set([nomes[2], nomes[0]])) === nomes[2],
    },
  ];
}

/** Isolado de `runSelftest` só para a função caber no limiar de 40 linhas — o mesmo limiar que
 * este arquivo existe para fazer valer no código do usuário. */
function runStateCases() {
  let falhas = 0;
  for (const caso of stateCases()) {
    let ok;
    try {
      ok = caso.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  return falhas;
}

function runSelftest() {
  let falhas = 0;
  let total = 0;

  for (const caso of splitUpDownCases()) {
    total += 1;
    const obtido = splitUpDown(caso.entrada);
    const ok = obtido.up === caso.esperado.up && obtido.down === caso.esperado.down;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} splitUpDown: ${caso.nome}\n`);
    if (!ok) {
      falhas += 1;
      process.stdout.write(`       esperado: ${JSON.stringify(caso.esperado)}\n`);
      process.stdout.write(`       obtido:   ${JSON.stringify(obtido)}\n`);
    }
  }

  for (const caso of orderingCases()) {
    total += 1;
    const obtido = orderMigrations(caso.nomes, caso.direcao);
    const ok = JSON.stringify(obtido) === JSON.stringify(caso.esperado);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} orderMigrations: ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }

  for (const caso of environmentKeyCases()) {
    total += 1;
    const obtido = environmentKey(caso.id);
    const ok = obtido === caso.esperado;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} environmentKey: ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }

  total += stateCases().length;
  falhas += runStateCases();

  process.stdout.write(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

async function principal() {
  const [comando, alvo] = process.argv.slice(2);
  if (comando === '--autoteste') return runSelftest();

  if (!['up', 'down', 'ciclo'].includes(comando) || alvo === undefined) {
    process.stderr.write(
      'uso: node scripts/migrations.mjs up|down|ciclo <modulo>\n' +
        '     node scripts/migrations.mjs --autoteste\n',
    );
    return 1;
  }

  loadEnvRoot();
  try {
    if (comando === 'up') await runUp(alvo);
    else if (comando === 'down') await runDown(alvo);
    else await runCycle(alvo);
    return 0;
  } catch (causa) {
    process.stderr.write(`${causa instanceof Error ? causa.message : String(causa)}\n`);
    return 1;
  }
}

principal().then((codigo) => {
  process.exitCode = codigo;
});
