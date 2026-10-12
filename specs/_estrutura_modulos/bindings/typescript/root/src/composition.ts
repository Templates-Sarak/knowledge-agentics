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
import type { Server } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import express, { type Express } from 'express';

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
import type { TokenVerifier } from '../packages/ports/index.js';

export interface DiscoveredManifest {
  id: string;
  name: string;
  basePath: string;
  role: string;
  ports: string[];
  dir: string;
}

/**
 * Fabrica de adapter por (porta, provedor). Acrescentar provedor e acrescentar linha AQUI, so.
 *
 * Recebe o `DiscoveredManifest` do modulo que esta compondo — `memory` ignora (nao precisa saber
 * QUEM a chamou), `postgres` usa (`module.id` para a chave de ambiente, `module.pasta` para ler
 * `data.schema`/`data.prefix` do proprio manifesto). Sem isto, um adapter que precisa de contexto
 * por-modulo nao teria como sabe-lo.
 */
const FACTORIES: Record<string, Record<string, (module: DiscoveredManifest) => unknown>> = {
  repository: { memory: () => createRepository(), postgres: (module) => createPostgresRepository(module) },
  audit: { memory: () => createAuditLog(), postgres: (module) => createPostgresAudit(module) },
  clock: { system: () => createClock() },
  idGenerator: { default: () => createIdGenerator() },
  storage: { memory: () => createInMemoryStorage() },
  notifier: { memory: () => createInMemoryNotifier() },
};

/** Le todos os manifestos. E a DESCOBERTA: o sistema conhece os modulos por declaracao, nao por import. */
export function discoverModules(root: string): DiscoveredManifest[] {
  const base = join(root, 'modules');
  if (!existsSync(base)) return [];

  return readdirSync(base)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => existsSync(join(base, name, 'module.json')))
    .map((name) => {
      const dir = join(base, name);
      const manifest = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8')) as DiscoveredManifest;
      return { ...manifest, dir };
    });
}

/**
 * Resolve as portas declaradas por um modulo, lendo a ESCOLHA em config/ports.json dele.
 * Porta declarada sem provedor conhecido derruba o boot — melhor falhar aqui que servir errado.
 */
export function resolveDependencies(module: DiscoveredManifest): Record<string, unknown> {
  const choices = JSON.parse(readFileSync(join(module.dir, 'config', 'ports.json'), 'utf8')) as Record<
    string,
    string
  >;
  const dependencies: Record<string, unknown> = {};

  for (const port of module.ports) {
    const provider = choices[port];
    const factory = FACTORIES[port]?.[provider ?? ''];
    if (factory === undefined) {
      throw new Error(
        `[composition] ${module.id}: port "${port}" with provider "${provider}" without a registered factory`,
      );
    }
    dependencies[port] = factory(module);
  }
  return dependencies;
}

/**
 * Auth do sistema. Enquanto nao houver login, NEGA tudo — as rotas que precisam funcionar sem
 * token estao declaradas em `publicRoutes` de cada modulo, e so elas passam.
 */
export function resolveTokenVerifier(): TokenVerifier {
  return createDenyingTokenVerifier();
}

/**
 * Nenhum par de modulos pode reivindicar a mesma rotaBase: o segundo simplesmente nunca seria
 * alcancado (o Express do primeiro responde por ele antes), e o defeito ficaria mudo ate alguem
 * notar uma rota "sumida". PURO — dado o array de manifestos, so decide; nao toca disco nem rede.
 */
export function verifyRoutesUnique(modules: DiscoveredManifest[]): void {
  const byRoute = new Map<string, string[]>();
  for (const module of modules) {
    byRoute.set(module.basePath, [...(byRoute.get(module.basePath) ?? []), module.id]);
  }
  const collisions = [...byRoute.entries()].filter(([, ids]) => ids.length > 1);
  if (collisions.length === 0) return;

  const detail = collisions.map(([route, ids]) => `"${route}" (${ids.join(', ')})`).join('; ');
  throw new Error(`[composition] baseRoute colliding across modules: ${detail}`);
}

/** O que se espera de `api/src/index.*` de um modulo — o mesmo `createApp` que os testes de contrato usam. */
interface ModuleApi {
  createApp(options: { deps: Record<string, unknown>; auth: TokenVerifier; root: string }): Express;
}

/**
 * Escolhe qual entrypoint do modulo importar — PURO, dado que o EMITIDO existe ou nao (quem checa
 * o disco e o chamador). "Convencao de caminho", nao variavel de ambiente nem tentativa-e-erro:
 * prefere `dist/api/src/index.js` (emitido por `tsc -p tsconfig.build.json`) quando ele esta la, e
 * cai para a fonte (`api/src/index.ts`, resolvida por `tsx` em dev) quando nao esta. Preco: um
 * `dist/` desatualizado (fonte mudou, build nao rodou de novo) e servido sem aviso — mitigado por
 * `tools/package.mjs` sempre recompilar do zero antes de copiar, nunca reusar `dist/` velho.
 */
export function chooseModuleEntrypoint(moduleDir: string, emittedExists: boolean): string {
  return emittedExists
    ? join(moduleDir, 'dist', 'api', 'src', 'index.js')
    : join(moduleDir, 'api', 'src', 'index.ts');
}

/** Import dinamico do modulo, pelo CAMINHO — a mesma descoberta por declaracao, nunca por lista fixa. */
async function importApi(module: DiscoveredManifest): Promise<ModuleApi> {
  const emitted = join(module.dir, 'dist', 'api', 'src', 'index.js');
  const path = chooseModuleEntrypoint(module.dir, existsSync(emitted));
  return (await import(pathToFileURL(path).href)) as ModuleApi;
}

/** Pares chave=valor de um `.env`, ignorando comentario e linha vazia — mesma leitura do carregador de modulo. */
function readPairsEnv(path: string): Array<[string, string]> {
  return readFileSync(path, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const equalsIndex = line.indexOf('=');
      return [line.slice(0, equalsIndex).trim(), line.slice(equalsIndex + 1).trim()] as [string, string];
    });
}

/**
 * Carrega o `.env` UNICO da raiz (specs/arquitetura/00-arquitetura.md §5) no processo, sem
 * sobrescrever o que ja veio de fora (mesma precedencia de ADR-004). E o unico lugar que toca este
 * arquivo: cada modulo, chamado daqui, ainda resolve o proprio `.env`/`ENV_ROOT`, mas a essa altura
 * o processo ja tem tudo — a leitura dele so confirma o que ja esta la.
 */
function loadEnvRoot(root: string): void {
  const path = join(root, '.env');
  if (!existsSync(path)) return;
  for (const [key, value] of readPairsEnv(path)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Monta o app do PROCESSO: um Express por modulo, cada um montado sob a PROPRIA `basePath` — nunca
 * em "/". `createApp`, quando composto (recebe `root`), ja sabe que o Express externo tira o prefixo
 * antes de entregar a requisicao a ele; aqui so se ESCOLHE onde montar, nenhuma rota e remontada.
 */
export async function buildSystem(root: string): Promise<Express> {
  const modules = discoverModules(root);
  verifyRoutesUnique(modules);

  const auth = resolveTokenVerifier();
  const app = express();

  for (const module of modules) {
    const deps = resolveDependencies(module);
    const api = await importApi(module);
    // MONTADO na propria rotaBase — nunca em "/". Middleware de modulo (auth INCLUSIVE, que NEGA
    // por padrao) roda para QUALQUER requisicao que alcance o app dele; montado em "/", o app do
    // PRIMEIRO modulo responderia (errado) por caminho de OUTRO modulo antes de "no match" —
    // medido: 401 na rota publica de um segundo modulo, negada pela auth do primeiro. Montando na
    // rotaBase, o Express so entrega ao app do modulo a requisicao que ja e dele.
    app.use(module.basePath, api.createApp({ deps, auth, root: module.dir }));
  }
  return app;
}

/** Le uma variavel obrigatoria da RAIZ. Ausente = boot morre com mensagem acionavel. */
function envRequiredRoot(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `[composition] required variable missing: ${key} (declare it in project.json:requiredEnv)`,
    );
  }
  return value;
}

/** Log ESTRUTURADO da raiz de composicao — uma linha JSON, a mesma forma `{ nivel, modulo, mensagem }` dos modulos. */
function logComposition(
  level: 'info' | 'error',
  message: string,
  fields: Record<string, unknown> = {},
): void {
  process.stdout.write(`${JSON.stringify({ level, module: 'composition', message, ...fields })}\n`);
}

/** Tunables nao-secretos do processo composto (`config/runtime.json`, versionado, na raiz). */
export interface RuntimeConfig {
  shutdown: { drainTimeoutMs: number };
}

/**
 * PURA — valida o TEXTO de `config/runtime.json`. Falha nomeando a chave: tunable ausente ou invalido
 * DERRUBA o boot, nunca vira um default embutido (mesma lei de `ROOT_API_PORT`).
 */
export function parseRuntimeConfig(text: string): RuntimeConfig {
  let raw: { shutdown?: { drainTimeoutMs?: unknown } };
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, '')) as typeof raw;
  } catch (cause) {
    throw new Error(`[composition] config/runtime.json is not valid JSON: ${String(cause)}`);
  }
  const cap = raw?.shutdown?.drainTimeoutMs;
  if (typeof cap !== 'number' || !Number.isInteger(cap) || cap <= 0) {
    throw new Error(
      '[composition] config/runtime.json: shutdown.drainTimeoutMs must be an integer > 0 (milliseconds)',
    );
  }
  return { shutdown: { drainTimeoutMs: cap } };
}

function loadRuntimeConfig(root: string): RuntimeConfig {
  const path = join(root, 'config', 'runtime.json');
  if (!existsSync(path)) {
    throw new Error(`[composition] ${path} missing — the root declares the graceful-shutdown cap here`);
  }
  return parseRuntimeConfig(readFileSync(path, 'utf8'));
}

export type ShutdownOutcome = 'drained' | 'timeout' | 'error';

/** PURA — o codigo de saida do desligamento: so "drenou dentro do teto" sai 0. */
export function shutdownExitCode(result: ShutdownOutcome): number {
  return result === 'drained' ? 0 : 1;
}

/**
 * Para de aceitar conexoes e espera as requisicoes em voo ate `drainTimeoutMs`. Conexao ociosa
 * (keep-alive) e fechada na hora — nao ha requisicao a drenar nela. Resolve `timeout` se o teto
 * estourar (as conexoes restantes sao derrubadas) e `error` se o `close` falhar.
 */
export function drainServer(server: Server, drainTimeoutMs: number): Promise<ShutdownOutcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      server.closeAllConnections();
      resolve('timeout');
    }, drainTimeoutMs);
    server.close((error) => {
      clearTimeout(timer);
      resolve(error === undefined ? 'drained' : 'error');
    });
    server.closeIdleConnections();
  });
}

/**
 * PURA — os sinais que disparam o desligamento. SIGTERM (orquestrador) e SIGINT (Ctrl+C). No Windows
 * nao ha SIGTERM entregavel a um processo Node (`process.kill` o derruba na hora), e o sinal gracioso
 * que chega de verdade e o CTRL_BREAK do console, que o Node expoe como SIGBREAK.
 */
export function shutdownSignals(platform: string): NodeJS.Signals[] {
  return platform === 'win32' ? ['SIGTERM', 'SIGINT', 'SIGBREAK'] : ['SIGTERM', 'SIGINT'];
}

/** SIGTERM e SIGINT: desliga gracioso, loga o resultado e sai com `shutdownExitCode`. Um 2o sinal e ignorado. */
function installShutdown(server: Server, drainTimeoutMs: number): void {
  let shuttingDown = false;
  const shutDown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logComposition('info', 'shutdown started', { signal, drainTimeoutMs });
    void drainServer(server, drainTimeoutMs).then((result) => {
      const level = result === 'drained' ? 'info' : 'error';
      logComposition(level, 'shutdown completed', { result, code: shutdownExitCode(result) });
      process.exit(shutdownExitCode(result));
    });
  };
  for (const signal of shutdownSignals(process.platform)) process.on(signal, () => shutDown(signal));
}

/**
 * Sobe o processo: um Express, uma porta (specs/arquitetura/00-arquitetura.md §5). Porta e host vem
 * do ambiente — nenhum literal aqui — e a falta de qualquer um DERRUBA o boot, nomeando a chave.
 * O host e `ROOT_API_HOST` (dev = loopback, container = 0.0.0.0): sem ele o Express escutaria em
 * TODAS as interfaces, o que em dev expoe o servico na rede local sem ninguem ter pedido.
 * Depois de no ar, SIGTERM/SIGINT desligam gracioso, dentro do teto de `config/runtime.json`.
 */
export async function startSystem(root: string): Promise<Server> {
  loadEnvRoot(root);
  const port = Number(envRequiredRoot('ROOT_API_PORT'));
  const host = envRequiredRoot('ROOT_API_HOST');
  const runtime = loadRuntimeConfig(root);
  const app = await buildSystem(root);

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      logComposition('info', `system up on port ${port}`, { host, port });
      installShutdown(server, runtime.shutdown.drainTimeoutMs);
      resolve(server);
    });
  });
}

// ================================================================================================
// AUTOTESTE — so a parte PURA (`verifyRoutesUnique`): descoberta, DI e boot sao I/O de verdade,
// provados pela subida real de processo (relatorio do bloco), nao por fixture em memoria.
// ================================================================================================

function testManifest(id: string, basePath: string): DiscoveredManifest {
  return { id, name: id, basePath, role: 'domain', ports: [], dir: `/fake/${id}` };
}

function uniqueRoutesCases(): Array<{ name: string; modules: DiscoveredManifest[]; expectsError: boolean }> {
  return [
    { name: 'empty list', modules: [], expectsError: false },
    { name: 'a single module', modules: [testManifest('a', '/api/v1/a')], expectsError: false },
    {
      name: 'distinct routes',
      modules: [testManifest('a', '/api/v1/a'), testManifest('b', '/api/v1/b')],
      expectsError: false,
    },
    {
      name: 'colliding routes',
      modules: [testManifest('a', '/api/v1/a'), testManifest('a2', '/api/v1/a')],
      expectsError: true,
    },
    {
      name: 'three modules, two colliding',
      modules: [
        testManifest('a', '/api/v1/a'),
        testManifest('b', '/api/v1/b'),
        testManifest('b2', '/api/v1/b'),
      ],
      expectsError: true,
    },
  ];
}

function entrypointCases(): Array<{
  name: string;
  dir: string;
  emittedExists: boolean;
  expected: string;
}> {
  return [
    {
      name: 'emitted exists: uses dist/api/src/index.js',
      dir: '/proj/modules/catalog',
      emittedExists: true,
      expected: join('/proj/modules/catalog', 'dist', 'api', 'src', 'index.js'),
    },
    {
      name: 'emitted missing: falls back to the source api/src/index.ts',
      dir: '/proj/modules/catalog',
      emittedExists: false,
      expected: join('/proj/modules/catalog', 'api', 'src', 'index.ts'),
    },
  ];
}

function runtimeCases(): Array<{ name: string; ok: () => boolean }> {
  const throws = (text: string): boolean => {
    try {
      parseRuntimeConfig(text);
      return false;
    } catch {
      return true;
    }
  };
  return [
    {
      name: 'parseRuntimeConfig: accepts an integer cap > 0',
      ok: () => parseRuntimeConfig('{"shutdown":{"drainTimeoutMs":5000}}').shutdown.drainTimeoutMs === 5000,
    },
    {
      name: 'parseRuntimeConfig: a BOM is tolerated',
      ok: () => parseRuntimeConfig('\uFEFF{"shutdown":{"drainTimeoutMs":1}}').shutdown.drainTimeoutMs === 1,
    },
    { name: 'parseRuntimeConfig: a missing key fails', ok: () => throws('{}') },
    {
      name: 'parseRuntimeConfig: zero, negative, fractional and text fail',
      ok: () => ['0', '-5', '1.5', '"10"'].every((v) => throws(`{"shutdown":{"drainTimeoutMs":${v}}}`)),
    },
    { name: 'parseRuntimeConfig: broken JSON fails', ok: () => throws('{') },
    {
      name: 'shutdownSignals: SIGTERM+SIGINT everywhere; SIGBREAK only on Windows',
      ok: () =>
        shutdownSignals('linux').join() === 'SIGTERM,SIGINT' && shutdownSignals('win32').includes('SIGBREAK'),
    },
    {
      name: 'shutdownExitCode: only drained exits 0',
      ok: () =>
        shutdownExitCode('drained') === 0 &&
        shutdownExitCode('timeout') !== 0 &&
        shutdownExitCode('error') !== 0,
    },
  ];
}

function runSelftest(): number {
  let failures = 0;
  const testCases = uniqueRoutesCases();

  for (const testCase of testCases) {
    let threw = false;
    try {
      verifyRoutesUnique(testCase.modules);
    } catch {
      threw = true;
    }
    const ok = threw === testCase.expectsError;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} verifyRoutesUnique: ${testCase.name}\n`);
    if (!ok) failures += 1;
  }

  const entrypointTestCases = entrypointCases();
  for (const testCase of entrypointTestCases) {
    const obtained = chooseModuleEntrypoint(testCase.dir, testCase.emittedExists);
    const ok = obtained === testCase.expected;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} chooseModuleEntrypoint: ${testCase.name}\n`);
    if (!ok) {
      failures += 1;
      process.stdout.write(`       expected: ${testCase.expected} obtained: ${obtained}\n`);
    }
  }

  const runtime = runtimeCases();
  for (const testCase of runtime) {
    const ok = testCase.ok();
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  const total = testCases.length + entrypointTestCases.length + runtime.length;
  process.stdout.write(`
selftest: ${total - failures}/${total} ok\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI — so quando executado diretamente (`tsx src/composition.ts`), nunca quando importado por teste.
// ================================================================================================

const isDirectRun = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  if (process.argv.includes('--selftest')) {
    process.exit(runSelftest());
  } else {
    startSystem(process.cwd()).catch((cause: unknown) => {
      process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
      process.exitCode = 1;
    });
  }
}
