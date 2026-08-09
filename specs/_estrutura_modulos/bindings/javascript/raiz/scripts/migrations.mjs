#!/usr/bin/env node
// Runner de migrations — aplica e reverte database/migrations/*.sql de um modulo contra Postgres.
// Lei dona: specs/arquitetura/02-contrato-e-dados.md §6.3.
//
//   node scripts/migrations.mjs up <modulo>       aplica em ordem, sobre banco vazio ou existente
//   node scripts/migrations.mjs down <modulo>     reverte em ordem INVERSA (bloco "-- rollback")
//   node scripts/migrations.mjs ciclo <modulo>    up -> down -> up — prova que o rollback fecha
//   node scripts/migrations.mjs --autoteste       prova interna (parser, ordem, chave de ambiente)
//
// NAO MORA em ferramentas/ (zero dependencia externa, lei 3 da base) — precisa de driver de
// Postgres, e ferramentas/ so usa node:*. `pg` e devDependency do PROJETO (mesmo precedente de
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
// LIMITE DECLARADO (specs/arquitetura/04-regras.md §7.2): sem controle de versao de migration
// (tabela `schema_migrations` e afins) — o bloco e "o rollback funciona", nao "um framework de
// migracao". `up`/`down` aplicam TODOS os arquivos em ordem, sempre; rodar `up` duas vezes sobre um
// banco ja migrado falha (tabela ja existe) POR DESENHO — e o proprio sinal de "banco nao esta
// vazio", nao um bug a esconder.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// `pg` e LAZY, de proposito — mesma forma do `psycopg` em migrations.py (importado dentro da funcao
// que conecta, nunca no topo). O nucleo puro (separarUpDown, ordenarMigrations, chaveDeAmbiente) e o
// que `--autoteste` prova, e ele nunca toca banco: um import de topo faria um teste que nao usa
// banco nenhum exigir o driver instalado, e `--autoteste` deixaria de rodar "de qualquer lugar"
// (medido: sem isto, `node migrations.mjs --autoteste` rodado da BASE do template — sem `npm
// install` — falha com ERR_MODULE_NOT_FOUND antes de chegar no nucleo puro). Medido tambem (nao
// presumido) o formato do `await import('pg')`: o pacote e CJS, mas expoe `Client` como export
// NOMEADO tambem (alem de `.default.Client`) — desestruturar direto do resultado do import
// dinamico funciona, sem precisar de `.default`.
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');

// ================================================================================================
// NUCLEO PURO — nunca toca disco nem rede. E a metade que `--autoteste` prova.
// ================================================================================================

/** `<modulo>` valido — kebab-case minusculo, a MESMA forma que `criar-modulo.mjs` exige ao nascer.
 * Serve DUAS funcoes: e o formato certo, E recusa de saida qualquer metacaractere de shell (`;`,
 * `$()`, `&`, espaco) — nenhuma entrada adversarial passa daqui para caminho de arquivo nem para
 * chave de ambiente. */
const ID_DE_MODULO_VALIDO = /^[a-z][a-z0-9-]*$/;

const VERBOS_DE_REVERSAO = /^(drop|alter|delete|truncate|revoke|grant|create|insert|update)\b/i;

/**
 * Separa o UP do DOWN de uma migration. O marcador e uma LINHA so com "-- rollback" — nao uma
 * ocorrencia em qualquer lugar do texto (diferente do regex de deteccao do gate, `dados.mjs`, que
 * so precisa saber SE existe bloco, nunca onde ele comeca).
 */
export function separarUpDown(conteudo) {
  const linhas = conteudo.split(/\r?\n/);
  const indiceMarcador = linhas.findIndex((linha) => /^\s*--\s*rollback\s*$/i.test(linha));
  if (indiceMarcador === -1) return { up: conteudo.trim(), down: '' };

  const up = linhas.slice(0, indiceMarcador).join('\n').trim();
  const down = descomentarRollback(linhas.slice(indiceMarcador + 1));
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
function descomentarRollback(linhas) {
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
function prefixoDe(nomeDeArquivo) {
  const casado = nomeDeArquivo.match(/^(\d{4})-/);
  return casado === null ? null : casado[1];
}

/** UP em ordem crescente (prefixo NNNN); DOWN e o INVERSO — reverte o que aplicou por ultimo primeiro. */
export function ordenarMigrations(nomes, direcao) {
  const ordenados = [...nomes].sort((a, b) => (prefixoDe(a) ?? a).localeCompare(prefixoDe(b) ?? b));
  return direcao === 'down' ? ordenados.reverse() : ordenados;
}

/** `<modulo>` -> `<MODULO>_DB_URL` — a MESMA convencao de `modulo.json:envRequerido`. */
export function chaveDeAmbiente(idDoModulo) {
  return `${idDoModulo.toUpperCase().replace(/-/g, '_')}_DB_URL`;
}

// ================================================================================================
// CASCA — todo I/O nomeado e isolado aqui. Nucleo puro acima nunca e chamado por ela sem passar
// pelos pontos nomeados (leitura de arquivo, rede) explicitamente.
// ================================================================================================

function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

/** Pares chave=valor de um `.env` — mesma leitura de `src/composicao.ts:lerParesEnv`. */
function lerParesEnv(caminho) {
  return lerTexto(caminho)
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#') && linha.includes('='))
    .map((linha) => {
      const igual = linha.indexOf('=');
      return [linha.slice(0, igual).trim(), linha.slice(igual + 1).trim()];
    });
}

/** Carrega o `.env` UNICO da raiz no processo, sem sobrescrever o que ja veio de fora — mesma
 * precedencia de `src/composicao.ts:carregarEnvDaRaiz` (ADR-004). */
function carregarEnvDaRaiz() {
  const caminho = join(RAIZ, '.env');
  if (!existsSync(caminho)) return;
  for (const [chave, valor] of lerParesEnv(caminho)) {
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

/** `<modulo>` valido E dentro de `modulos/` — nunca escapa por `..` nem separador. Falha nomeando
 * a entrada recusada, nunca silenciosa. */
function pastaDoModulo(idDoModulo) {
  if (!ID_DE_MODULO_VALIDO.test(idDoModulo)) {
    throw new Error(`[migrations] "${idDoModulo}" nao e um id de modulo valido (kebab-case minusculo)`);
  }
  const base = join(RAIZ, 'modulos');
  const pasta = join(base, idDoModulo);
  if (!pasta.startsWith(base + sep)) {
    throw new Error(`[migrations] "${idDoModulo}" resolve para fora de modulos/ — recusado`);
  }
  if (!existsSync(join(pasta, 'modulo.json'))) {
    throw new Error(`[migrations] modulo "${idDoModulo}" nao encontrado em modulos/`);
  }
  return pasta;
}

function listarMigrations(pastaModulo) {
  const base = join(pastaModulo, 'database', 'migrations');
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((nome) => nome.endsWith('.sql'));
}

/** Le uma variavel obrigatoria. Ausente = falha nomeando a chave (lei 7 do catalogo, mesmo padrao
 * de `api/src/config.ts:envObrigatoria`). */
function urlObrigatoria(idDoModulo) {
  const chave = chaveDeAmbiente(idDoModulo);
  const valor = process.env[chave];
  if (valor === undefined || valor === '') {
    throw new Error(`[migrations] variavel obrigatoria ausente: ${chave} (declare em modulo.json:envRequerido e no .env da raiz)`);
  }
  return valor;
}

async function conectar(url) {
  const { Client } = await import('pg');
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  return cliente;
}

async function aplicar(cliente, pastaModulo, direcao) {
  const nomes = ordenarMigrations(listarMigrations(pastaModulo), direcao);
  for (const nome of nomes) {
    const conteudo = lerTexto(join(pastaModulo, 'database', 'migrations', nome));
    const { up, down } = separarUpDown(conteudo);
    const sql = direcao === 'down' ? down : up;
    if (sql === '') {
      process.stdout.write(`  ${nome}: nada a ${direcao === 'down' ? 'reverter' : 'aplicar'}\n`);
      continue;
    }
    process.stdout.write(`  ${direcao} ${nome}...\n`);
    await cliente.query(sql);
  }
}

async function rodarUp(idDoModulo) {
  const pastaModulo = pastaDoModulo(idDoModulo);
  const url = urlObrigatoria(idDoModulo);
  const cliente = await conectar(url);
  try {
    await aplicar(cliente, pastaModulo, 'up');
  } finally {
    await cliente.end();
  }
}

async function rodarDown(idDoModulo) {
  const pastaModulo = pastaDoModulo(idDoModulo);
  const url = urlObrigatoria(idDoModulo);
  const cliente = await conectar(url);
  try {
    await aplicar(cliente, pastaModulo, 'down');
  } finally {
    await cliente.end();
  }
}

async function rodarCiclo(idDoModulo) {
  process.stdout.write(`[migrations] ${idDoModulo}: up\n`);
  await rodarUp(idDoModulo);
  process.stdout.write(`[migrations] ${idDoModulo}: down\n`);
  await rodarDown(idDoModulo);
  process.stdout.write(`[migrations] ${idDoModulo}: up (de novo — prova que o rollback fechou o ciclo)\n`);
  await rodarUp(idDoModulo);
  process.stdout.write(`[migrations] ${idDoModulo}: ciclo up -> down -> up OK\n`);
}

// ================================================================================================
// AUTOTESTE — so o nucleo puro. up/down/ciclo sao I/O de verdade, provados pelo ciclo real contra
// Postgres (relatorio do bloco), nao por fixture em memoria.
// ================================================================================================

function casosDeSepararUpDown() {
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

function casosDeOrdenacao() {
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

function casosDeChaveDeAmbiente() {
  return [
    { nome: 'simples', id: 'catalogo', esperado: 'CATALOGO_DB_URL' },
    { nome: 'com hifen', id: 'linha-de-producao', esperado: 'LINHA_DE_PRODUCAO_DB_URL' },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  let total = 0;

  for (const caso of casosDeSepararUpDown()) {
    total += 1;
    const obtido = separarUpDown(caso.entrada);
    const ok = obtido.up === caso.esperado.up && obtido.down === caso.esperado.down;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} separarUpDown: ${caso.nome}\n`);
    if (!ok) {
      falhas += 1;
      process.stdout.write(`       esperado: ${JSON.stringify(caso.esperado)}\n`);
      process.stdout.write(`       obtido:   ${JSON.stringify(obtido)}\n`);
    }
  }

  for (const caso of casosDeOrdenacao()) {
    total += 1;
    const obtido = ordenarMigrations(caso.nomes, caso.direcao);
    const ok = JSON.stringify(obtido) === JSON.stringify(caso.esperado);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ordenarMigrations: ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }

  for (const caso of casosDeChaveDeAmbiente()) {
    total += 1;
    const obtido = chaveDeAmbiente(caso.id);
    const ok = obtido === caso.esperado;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} chaveDeAmbiente: ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }

  process.stdout.write(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

async function principal() {
  const [comando, alvo] = process.argv.slice(2);
  if (comando === '--autoteste') return rodarAutoteste();

  if (!['up', 'down', 'ciclo'].includes(comando) || alvo === undefined) {
    process.stderr.write(
      'uso: node scripts/migrations.mjs up|down|ciclo <modulo>\n'
      + '     node scripts/migrations.mjs --autoteste\n',
    );
    return 1;
  }

  carregarEnvDaRaiz();
  try {
    if (comando === 'up') await rodarUp(alvo);
    else if (comando === 'down') await rodarDown(alvo);
    else await rodarCiclo(alvo);
    return 0;
  } catch (causa) {
    process.stderr.write(`${causa instanceof Error ? causa.message : String(causa)}\n`);
    return 1;
  }
}

principal().then((codigo) => { process.exitCode = codigo; });
