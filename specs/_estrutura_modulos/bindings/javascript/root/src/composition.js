// Raiz de composicao — o WIRING, e nada alem. Lei dona: specs/arquitetura/00-arquitetura.md §3.4.
//
// O que este arquivo faz:
//   1. DESCOBRE os modulos lendo modules/*/module.json — nao existe lista fixa de modulos no codigo;
//   2. resolve as portas de cada um a partir do config/ports.json DELE;
//   3. INJETA os adapters e MONTA cada api/ sob a rotaBase do manifesto — um Express por modulo,
//      pendurado no Express raiz sob a propria rotaBase (nunca em "/": middleware de modulo roda
//      para QUALQUER requisicao que alcance o app dele, e a auth nega por padrao — montado sem
//      prefixo, o primeiro modulo responderia, errado, pelas rotas do segundo);
//   4. sobe UM processo, UMA porta (specs/arquitetura/00-arquitetura.md §5).
//
// O que ele NAO faz: regra de negocio, nem servir front (specs/arquitetura/00-arquitetura.md §4.4:
// cada `web/` e build estatico do PROPRIO modulo, publicado por fora deste processo). Nenhum modulo
// importa daqui, e nada aqui conhece o dominio de modulo nenhum. Acrescentar um modulo nao pode
// exigir editar este arquivo.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import express from 'express';

import {
  createAuditLog,
  createDenyingTokenVerifier,
  createIdGenerator,
  createInMemoryNotifier,
  createClock,
  createRepository,
  createInMemoryStorage,
} from '../adapters/memory/index.js';
import { createPostgresAudit, createPostgresRepository } from '../adapters/postgres/index.js';

/**
 * Fabrica de adapter por (porta, provedor). Acrescentar provedor e acrescentar linha AQUI, so.
 *
 * Recebe o manifesto do modulo que esta compondo — `memory` ignora (nao precisa saber QUEM a
 * chamou), `postgres` usa (`module.id` para a chave de ambiente, `module.pasta` para ler
 * `data.schema`/`data.prefix` do proprio manifesto). Sem isto, um adapter que precisa de
 * contexto por-modulo nao teria como sabe-lo.
 */
const FABRICAS = {
  repository: { memory: () => createRepository(), postgres: (modulo) => createPostgresRepository(modulo) },
  audit: { memory: () => createAuditLog(), postgres: (modulo) => createPostgresAudit(modulo) },
  clock: { system: () => createClock() },
  idGenerator: { default: () => createIdGenerator() },
  storage: { memory: () => createInMemoryStorage() },
  notifier: { memory: () => createInMemoryNotifier() },
};

function readJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8').replace(/^﻿/, ''));
}

/**
 * Le todos os manifestos. E a DESCOBERTA: o sistema conhece os modulos por declaracao, nao por
 * import. Molde (`_*`) fica de fora — ele e material do scaffold, nao um modulo do sistema.
 */
export function discoverModules(raiz) {
  const base = join(raiz, 'modules');
  if (!existsSync(base)) return [];

  return readdirSync(base)
    .filter((nome) => !nome.startsWith('_'))
    .filter((nome) => existsSync(join(base, nome, 'module.json')))
    .map((nome) => ({ ...readJson(join(base, nome, 'module.json')), pasta: join(base, nome) }));
}

/**
 * Resolve as portas declaradas por um modulo, lendo a ESCOLHA em config/ports.json dele.
 * Porta declarada sem provedor conhecido derruba o boot — melhor falhar aqui que servir errado.
 */
export function resolveDependencies(modulo) {
  const escolhas = readJson(join(modulo.pasta, 'config', 'ports.json'));
  const dependencias = {};

  for (const porta of modulo.ports) {
    const provedor = escolhas[porta];
    const fabrica = FABRICAS[porta]?.[provedor ?? ''];
    if (fabrica === undefined) {
      throw new Error(
        `[composition] ${modulo.id}: porta "${porta}" com provedor "${provedor}" sem fabrica registrada`,
      );
    }
    dependencias[porta] = fabrica(modulo);
  }
  return dependencias;
}

/**
 * Auth do sistema. Enquanto nao houver login, NEGA tudo — as rotas que precisam funcionar sem
 * token estao declaradas em `publicRoutes` de cada modulo, e so elas passam.
 */
export function resolveTokenVerifier() {
  return createDenyingTokenVerifier();
}

/**
 * Nenhum par de modulos pode reivindicar a mesma rotaBase: o segundo simplesmente nunca seria
 * alcancado (o Express do primeiro responde por ele antes), e o defeito ficaria mudo ate alguem
 * notar uma rota "sumida". PURO — dado o array de manifestos, so decide; nao toca disco nem rede.
 */
export function verifyRoutesUnique(modulos) {
  const porRota = new Map();
  for (const modulo of modulos) {
    porRota.set(modulo.basePath, [...(porRota.get(modulo.basePath) ?? []), modulo.id]);
  }
  const colisoes = [...porRota.entries()].filter(([, ids]) => ids.length > 1);
  if (colisoes.length === 0) return;

  const detalhe = colisoes.map(([rota, ids]) => `"${rota}" (${ids.join(', ')})`).join('; ');
  throw new Error(`[composition] rotaBase colidindo entre modulos: ${detalhe}`);
}

/** Import dinamico do modulo, pelo CAMINHO — a mesma descoberta por declaracao, nunca por lista fixa. */
async function importApi(modulo) {
  const caminho = join(modulo.pasta, 'api', 'src', 'index.js');
  return import(pathToFileURL(caminho).href);
}

/** Pares chave=valor de um `.env`, ignorando comentario e linha vazia — mesma leitura do carregador de modulo. */
function readPairsEnv(caminho) {
  return readFileSync(caminho, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#') && linha.includes('='))
    .map((linha) => {
      const igual = linha.indexOf('=');
      return [linha.slice(0, igual).trim(), linha.slice(igual + 1).trim()];
    });
}

/**
 * Carrega o `.env` UNICO da raiz (specs/arquitetura/00-arquitetura.md §5) no processo, sem
 * sobrescrever o que ja veio de fora (mesma precedencia de ADR-004). E o unico lugar que toca este
 * arquivo: cada modulo, chamado daqui, ainda resolve o proprio `.env`/`ENV_ROOT`, mas a essa altura
 * o processo ja tem tudo — a leitura dele so confirma o que ja esta la.
 */
function loadEnvRoot(raiz) {
  const caminho = join(raiz, '.env');
  if (!existsSync(caminho)) return;
  for (const [chave, valor] of readPairsEnv(caminho)) {
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

/**
 * Monta o app do PROCESSO: um Express por modulo, cada um montado sob a PROPRIA `basePath` — nunca
 * em "/". `createApp`, quando composto (recebe `root`), ja sabe que o Express externo tira o prefixo
 * antes de entregar a requisicao a ele; aqui so se ESCOLHE onde montar, nenhuma rota e remontada.
 */
export async function buildSystem(raiz) {
  const modulos = discoverModules(raiz);
  verifyRoutesUnique(modulos);

  const auth = resolveTokenVerifier();
  const app = express();

  for (const modulo of modulos) {
    const deps = resolveDependencies(modulo);
    const api = await importApi(modulo);
    // MONTADO na propria rotaBase — nunca em "/". Middleware de modulo (auth INCLUSIVE, que NEGA
    // por padrao) roda para QUALQUER requisicao que alcance o app dele; montado em "/", o app do
    // PRIMEIRO modulo responderia (errado) por caminho de OUTRO modulo antes de "no match" —
    // medido: 401 na rota publica de um segundo modulo, negada pela auth do primeiro. Montando na
    // rotaBase, o Express so entrega ao app do modulo a requisicao que ja e dele.
    app.use(modulo.basePath, api.createApp({ deps, auth, raiz: modulo.pasta }));
  }
  return app;
}

/** Le uma variavel obrigatoria da RAIZ. Ausente = boot morre com mensagem acionavel. */
function envRequiredRoot(chave) {
  const valor = process.env[chave];
  if (valor === undefined || valor === '') {
    throw new Error(
      `[composition] variavel obrigatoria ausente: ${chave} (declare em project.json:requiredEnv)`,
    );
  }
  return valor;
}

/** Log ESTRUTURADO da raiz de composicao — uma linha JSON, a mesma forma `{ nivel, modulo, mensagem }` dos modulos. */
function logComposition(nivel, mensagem, campos = {}) {
  process.stdout.write(`${JSON.stringify({ nivel, modulo: 'composition', mensagem, ...campos })}\n`);
}

/**
 * PURA — valida o TEXTO de `config/runtime.json` (tunables nao-secretos do processo composto,
 * versionado, na raiz). Falha nomeando a chave: tunable ausente ou invalido DERRUBA o boot, nunca
 * vira um default embutido (mesma lei de `ROOT_API_PORT`).
 */
export function parseRuntimeConfig(texto) {
  let bruto;
  try {
    bruto = JSON.parse(texto.replace(/^\uFEFF/, ''));
  } catch (causa) {
    throw new Error(`[composition] config/runtime.json nao e JSON valido: ${String(causa)}`);
  }
  const teto = bruto?.shutdown?.drainTimeoutMs;
  if (typeof teto !== 'number' || !Number.isInteger(teto) || teto <= 0) {
    throw new Error('[composition] config/runtime.json: shutdown.drainTimeoutMs deve ser um inteiro > 0 (milissegundos)');
  }
  return { shutdown: { drainTimeoutMs: teto } };
}

function loadRuntimeConfig(raiz) {
  const caminho = join(raiz, 'config', 'runtime.json');
  if (!existsSync(caminho)) {
    throw new Error(`[composition] ${caminho} ausente — a raiz declara aqui o teto do desligamento gracioso`);
  }
  return parseRuntimeConfig(readFileSync(caminho, 'utf8'));
}

/** PURA — o codigo de saida do desligamento: so "drained" (drenou dentro do teto) sai 0. */
export function shutdownExitCode(resultado) {
  return resultado === 'drained' ? 0 : 1;
}

/**
 * Para de aceitar conexoes e espera as requisicoes em voo ate `drainTimeoutMs`. Conexao ociosa
 * (keep-alive) e fechada na hora — nao ha requisicao a drenar nela. Resolve `timeout` se o teto
 * estourar (as conexoes restantes sao derrubadas) e `error` se o `close` falhar.
 */
export function drainServer(servidor, drainTimeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      servidor.closeAllConnections();
      resolve('timeout');
    }, drainTimeoutMs);
    servidor.close((erro) => {
      clearTimeout(timer);
      resolve(erro === undefined ? 'drained' : 'error');
    });
    servidor.closeIdleConnections();
  });
}

/**
 * PURA — os sinais que disparam o desligamento. SIGTERM (orquestrador) e SIGINT (Ctrl+C). No Windows
 * nao ha SIGTERM entregavel a um processo Node (`process.kill` o derruba na hora), e o sinal gracioso
 * que chega de verdade e o CTRL_BREAK do console, que o Node expoe como SIGBREAK.
 */
export function shutdownSignals(plataforma) {
  return plataforma === 'win32' ? ['SIGTERM', 'SIGINT', 'SIGBREAK'] : ['SIGTERM', 'SIGINT'];
}

/** SIGTERM e SIGINT: desliga gracioso, loga o resultado e sai com `shutdownExitCode`. Um 2o sinal e ignorado. */
function installShutdown(servidor, drainTimeoutMs) {
  let encerrando = false;
  const encerrar = (sinal) => {
    if (encerrando) return;
    encerrando = true;
    logComposition('info', 'desligamento iniciado', { sinal, drainTimeoutMs });
    drainServer(servidor, drainTimeoutMs).then((resultado) => {
      const nivel = resultado === 'drained' ? 'info' : 'error';
      logComposition(nivel, 'desligamento concluido', { resultado, codigo: shutdownExitCode(resultado) });
      process.exit(shutdownExitCode(resultado));
    });
  };
  for (const sinal of shutdownSignals(process.platform)) process.on(sinal, () => encerrar(sinal));
}

/**
 * Sobe o processo: um Express, uma porta (specs/arquitetura/00-arquitetura.md §5). Porta e host vem
 * do ambiente — nenhum literal aqui — e a falta de qualquer um DERRUBA o boot, nomeando a chave.
 * O host e `ROOT_API_HOST` (dev = loopback, container = 0.0.0.0): sem ele o Express escutaria em
 * TODAS as interfaces, o que em dev expoe o servico na rede local sem ninguem ter pedido.
 * Depois de no ar, SIGTERM/SIGINT desligam gracioso, dentro do teto de `config/runtime.json`.
 */
export async function startSystem(raiz) {
  loadEnvRoot(raiz);
  const porta = Number(envRequiredRoot('ROOT_API_PORT'));
  const host = envRequiredRoot('ROOT_API_HOST');
  const runtime = loadRuntimeConfig(raiz);
  const app = await buildSystem(raiz);

  return new Promise((resolve) => {
    const servidor = app.listen(porta, host, () => {
      logComposition('info', `sistema no ar na porta ${porta}`, { host, porta });
      installShutdown(servidor, runtime.shutdown.drainTimeoutMs);
      resolve(servidor);
    });
  });
}

// ================================================================================================
// AUTOTESTE — so a parte PURA (`verifyRoutesUnique`): descoberta, DI e boot sao I/O de verdade,
// provados pela subida real de processo (relatorio do bloco), nao por fixture em memoria.
// ================================================================================================

function testManifest(id, basePath) {
  return { id, name: id, basePath, role: 'domain', ports: [], pasta: `/fake/${id}` };
}

function uniqueRoutesCases() {
  return [
    { nome: 'lista vazia', modulos: [], esperaErro: false },
    { nome: 'um so modulo', modulos: [testManifest('a', '/api/v1/a')], esperaErro: false },
    {
      nome: 'rotas distintas',
      modulos: [testManifest('a', '/api/v1/a'), testManifest('b', '/api/v1/b')],
      esperaErro: false,
    },
    {
      nome: 'rotas colidindo',
      modulos: [testManifest('a', '/api/v1/a'), testManifest('a2', '/api/v1/a')],
      esperaErro: true,
    },
    {
      nome: 'tres modulos, dois colidindo',
      modulos: [
        testManifest('a', '/api/v1/a'),
        testManifest('b', '/api/v1/b'),
        testManifest('b2', '/api/v1/b'),
      ],
      esperaErro: true,
    },
  ];
}

function runtimeCases() {
  const lanca = (texto) => {
    try {
      parseRuntimeConfig(texto);
      return false;
    } catch {
      return true;
    }
  };
  return [
    { nome: 'parseRuntimeConfig: aceita o teto inteiro > 0', ok: () => parseRuntimeConfig('{"shutdown":{"drainTimeoutMs":5000}}').shutdown.drainTimeoutMs === 5000 },
    { nome: 'parseRuntimeConfig: BOM e tolerado', ok: () => parseRuntimeConfig('\uFEFF{"shutdown":{"drainTimeoutMs":1}}').shutdown.drainTimeoutMs === 1 },
    { nome: 'parseRuntimeConfig: chave ausente derruba', ok: () => lanca('{}') },
    { nome: 'parseRuntimeConfig: zero, negativo, fracionario e texto derrubam', ok: () => (
      ['0', '-5', '1.5', '"10"'].every((v) => lanca(`{"shutdown":{"drainTimeoutMs":${v}}}`))
    ) },
    { nome: 'parseRuntimeConfig: JSON quebrado derruba', ok: () => lanca('{') },
    { nome: 'shutdownSignals: SIGTERM+SIGINT em todo lugar; SIGBREAK so no Windows', ok: () => (
      shutdownSignals('linux').join() === 'SIGTERM,SIGINT' && shutdownSignals('win32').includes('SIGBREAK')
    ) },
    { nome: 'shutdownExitCode: so drained sai 0', ok: () => (
      shutdownExitCode('drained') === 0 && shutdownExitCode('timeout') !== 0 && shutdownExitCode('error') !== 0
    ) },
  ];
}

function runSelftest() {
  let falhas = 0;
  const casos = uniqueRoutesCases();

  for (const caso of casos) {
    let lancou = false;
    try {
      verifyRoutesUnique(caso.modulos);
    } catch {
      lancou = true;
    }
    const ok = lancou === caso.esperaErro;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} verifyRoutesUnique: ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }


  const runtime = runtimeCases();
  for (const caso of runtime) {
    const ok = caso.ok();
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  const total = casos.length + runtime.length;
  process.stdout.write(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI — so quando executado diretamente (`node src/composition.js`), nunca quando importado por teste.
// ================================================================================================

const ehExecucaoDireta =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (ehExecucaoDireta) {
  if (process.argv.includes('--autoteste')) {
    process.exit(runSelftest());
  } else {
    startSystem(process.cwd()).catch((causa) => {
      process.stderr.write(`${causa instanceof Error ? causa.message : String(causa)}\n`);
      process.exitCode = 1;
    });
  }
}
