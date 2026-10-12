#!/usr/bin/env node
/**
 * docker-up.mjs — sobe, para e acompanha o compose local do projeto. Multiplataforma, zero
 * dependência. FINO de propósito: checa o ambiente e delega tudo ao `docker compose`.
 * Lei dona: specs/arquitetura/03-operacao.md §9.5
 *
 *   node tools/docker-up.mjs up      checa Docker, os dois .env, o deploy em dia e as portas; builda e
 *                                    sobe o profile `app` com `--wait`; imprime a URL
 *   node tools/docker-up.mjs stop    derruba os serviços (os volumes ficam)
 *   node tools/docker-up.mjs logs    acompanha os logs
 *
 * Dois arquivos de ambiente, nesta ordem (o segundo vence em conflito):
 *   .env           da RAIZ — ROOT_API_PORT e as chaves <MODULE>_* (o `sync-env` é o dono dele)
 *   deploy/.env    do DEPLOY — as chaves DEPLOY_* que só o compose lê (ADR-022)
 *
 * Opções (todas com padrão em DEFAULTS): --compose-file, --root-env, --deploy-env, --profile.
 * As chaves de porta a checar e a URL a imprimir saem do próprio compose.yml (`${DEPLOY_*_PORT`),
 * então o mesmo script serve ao binding com front e ao que não tem.
 *
 * Exit: 0 ok · 1 ambiente ou compose falhou · 2 uso.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..');
const DEFAULTS = {
  composeFile: join(PROJECT_ROOT, 'compose.yml'),
  rootEnv: join(PROJECT_ROOT, '.env'),
  deployEnv: join(PROJECT_ROOT, 'deploy', '.env'),
  profile: 'app',
  loopback: '127.0.0.1',
  minCompose: [2, 23, 0],
  // O ponto de entrada na ordem de preferência: o front (origem única), senão a própria API.
  urlKeys: ['DEPLOY_FRONT_PORT', 'DEPLOY_APP_PORT'],
};
const COMMANDS = ['up', 'stop', 'logs'];
const FLAGS = {
  '--compose-file': 'composeFile',
  '--root-env': 'rootEnv',
  '--deploy-env': 'deployEnv',
  '--profile': 'profile',
};
const PORT_KEY_PATTERN = /\$\{(DEPLOY_[A-Z0-9_]*PORT)\b/g;
const RESERVED_RANGE_HINT = 'netsh interface ipv4 show excludedportrange protocol=tcp';

function fail(message) {
  process.stderr.write(`[docker-up] ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { ...DEFAULTS };
  for (let i = 0; i < rest.length; i += 2) {
    const target = FLAGS[rest[i]];
    if (target === undefined || rest[i + 1] === undefined) return { command: undefined, options };
    options[target] = rest[i + 1];
  }
  return { command, options };
}

/** Pares CHAVE=valor de um .env, ignorando comentário e linha vazia. */
function readEnvPairs(text) {
  const pairs = {};
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    const cut = line.indexOf('=');
    if (line === '' || line.startsWith('#') || cut < 1) continue;
    pairs[line.slice(0, cut).trim()] = line.slice(cut + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return pairs;
}

function compose(options, args, capture = false) {
  const base = ['compose', '-f', options.composeFile, '--env-file', options.rootEnv, '--env-file', options.deployEnv];
  return spawnSync('docker', [...base, '--profile', options.profile, ...args], {
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
}

function isOlder(found, minimum) {
  for (let i = 0; i < minimum.length; i += 1) {
    if (found[i] !== minimum[i]) return found[i] < minimum[i];
  }
  return false;
}

function requireDocker(options) {
  const probe = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'pipe' });
  if (probe.status !== 0) fail('Docker não está ativo. Abra o Docker e aguarde o Engine iniciar.');
  const version = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8' });
  const shown = String(version.stdout).trim();
  const parts = shown.replace(/^v/, '').split('.').map(Number);
  if (version.status !== 0 || parts.some(Number.isNaN) || isOlder(parts, options.minCompose)) {
    fail(`Docker Compose ${options.minCompose.join('.')}+ é exigido (vários --env-file e extends). Encontrado: ${shown || 'ausente'}.`);
  }
}

/** Lê os dois .env, exigindo que ambos existam; o do deploy vence o da raiz. */
function readEnvironment(options) {
  const missing = [options.rootEnv, options.deployEnv].filter((file) => !existsSync(file));
  if (missing.length > 0) {
    fail(`Arquivo(s) de ambiente ausente(s): ${missing.join(', ')}. Crie-os a partir dos .env.example (node tools/sync-env.mjs gera o da raiz; deploy/.env.example é o do deploy).`);
  }
  return { ...readEnvPairs(readFileSync(options.rootEnv, 'utf8')), ...readEnvPairs(readFileSync(options.deployEnv, 'utf8')) };
}

/** O deploy gerado tem de refletir os manifestos: o compose subiria rotas e URLs de um estado velho. */
function requireDeployInSync() {
  const check = spawnSync(process.execPath, [join(HERE, 'sync-deploy.mjs'), '--check'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  if (check.status === 0) return;
  fail(`${String(check.stdout).trim() || String(check.stderr).trim()}`);
}

/** Chaves de porta publicada no host, lidas do próprio compose — o arquivo é a fonte, não esta lista. */
function portKeysOf(composeFile) {
  const text = readFileSync(composeFile, 'utf8');
  return [...new Set([...text.matchAll(PORT_KEY_PATTERN)].map((match) => match[1]))];
}

/** Tenta ocupar a porta em loopback. Devolve 'free' ou o código do erro (EADDRINUSE, EACCES…). */
function probePort(port, host) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', (error) => done(/** @type {NodeJS.ErrnoException} */ (error).code ?? 'UNKNOWN'));
    probe.listen(port, host, () => probe.close(() => done('free')));
  });
}

function portProblem(code, port, key) {
  if (code === 'EACCES') {
    return `A porta ${port} (${key}) é proibida pelo sistema (EACCES). No Windows costuma ser faixa reservada `
      + `pelo Hyper-V/WinNAT — confira com: ${RESERVED_RANGE_HINT} — e escolha uma porta fora das faixas.`;
  }
  if (code === 'EADDRINUSE') return `A porta ${port} (${key}) já está ocupada. Libere-a e tente de novo.`;
  return `A porta ${port} (${key}) não pôde ser verificada (${code}).`;
}

function alreadyRunning(options) {
  const listing = compose(options, ['ps', '--status', 'running', '--services'], true);
  return listing.status === 0 && listing.stdout.trim() !== '';
}

async function checkPorts(options, env, keys) {
  if (alreadyRunning(options)) return;
  for (const key of keys) {
    const port = Number(env[key]);
    if (!Number.isInteger(port) || port <= 0) fail(`${key} ausente ou inválida nos arquivos de ambiente.`);
    const code = await probePort(port, options.loopback);
    if (code !== 'free') fail(portProblem(code, port, key));
  }
}

async function up(options) {
  requireDocker(options);
  requireDeployInSync();
  const env = readEnvironment(options);
  const keys = portKeysOf(options.composeFile);
  await checkPorts(options, env, keys);
  const run = compose(options, ['up', '--build', '--detach', '--wait']);
  if (run.status !== 0) fail('A subida falhou. Os containers ficaram para inspeção: node tools/docker-up.mjs logs');
  const urlKey = options.urlKeys.find((key) => keys.includes(key));
  if (urlKey !== undefined) process.stdout.write(`Disponível em http://${options.loopback}:${env[urlKey]}\n`);
}

function passthrough(options, args) {
  requireDocker(options);
  readEnvironment(options);
  process.exit(compose(options, args).status ?? 1);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!COMMANDS.includes(command)) {
    process.stderr.write(`Uso: node tools/docker-up.mjs <${COMMANDS.join('|')}> [opções]\n`);
    process.exit(2);
  }
  for (const key of ['composeFile', 'rootEnv', 'deployEnv']) options[key] = resolve(options[key]);
  if (command === 'up') await up(options);
  else passthrough(options, command === 'stop' ? ['down'] : ['logs', '--follow']);
}

main();
