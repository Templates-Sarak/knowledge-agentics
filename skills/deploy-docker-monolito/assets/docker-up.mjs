#!/usr/bin/env node
/**
 * docker-up.mjs — sobe, para e acompanha o compose local do monólito. Multiplataforma, zero
 * dependência. FINO de propósito: checa o ambiente e delega tudo ao `docker compose`.
 * Copie para <INFRA_DIR>/docker-up.mjs e rode da RAIZ do projeto.
 *
 *   node <INFRA_DIR>/docker-up.mjs up      checa Docker, os dois .env e as portas; builda e sobe com
 *                                           `--wait`; imprime a URL
 *   node <INFRA_DIR>/docker-up.mjs stop    derruba os serviços (os volumes ficam)
 *   node <INFRA_DIR>/docker-up.mjs logs    acompanha os logs
 *
 * Dois arquivos de ambiente, nesta ordem (o segundo vence em conflito):
 *   .env                 da RAIZ — ROOT_API_PORT e as chaves <MODULE>_* (fonte do sync-env)
 *   <INFRA_DIR>/.env     do DEPLOY — as chaves DEPLOY_* que só o compose lê (ao lado deste script)
 *
 * Opções (todas com padrão em DEFAULTS):
 *   --compose-file <arquivo>   --root-env <arquivo>   --deploy-env <arquivo>   --profile <nome>
 *   --port-key <CHAVE>         (repetível) chave com porta publicada no host
 *   --url-key <CHAVE>          chave cuja porta compõe a URL impressa
 *
 * Exit: 0 ok · 1 ambiente ou compose falhou · 2 uso.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULTS = {
  composeFile: 'compose.yml',
  rootEnv: '.env',
  deployEnv: join(HERE, '.env'),
  profile: 'app',
  portKeys: ['DEPLOY_DB_PORT', 'DEPLOY_FRONT_PORT'],
  urlKey: 'DEPLOY_FRONT_PORT',
  loopback: '127.0.0.1',
  minCompose: [2, 23, 0],
};
const COMMANDS = ['up', 'stop', 'logs'];
const RESERVED_RANGE_HINT = 'netsh interface ipv4 show excludedportrange protocol=tcp';

function fail(message) {
  process.stderr.write(`[docker-up] ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { ...DEFAULTS, portKeys: [] };
  const flags = {
    '--compose-file': 'composeFile',
    '--root-env': 'rootEnv',
    '--deploy-env': 'deployEnv',
    '--profile': 'profile',
    '--url-key': 'urlKey',
  };
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === '--port-key') options.portKeys.push(rest[i + 1]);
    else if (flags[rest[i]] !== undefined && rest[i + 1] !== undefined) options[flags[rest[i]]] = rest[i + 1];
    else return { command: undefined, options };
  }
  if (options.portKeys.length === 0) options.portKeys = [...DEFAULTS.portKeys];
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
  const base = ['compose', '-f', options.composeFile];
  base.push('--env-file', options.rootEnv, '--env-file', options.deployEnv, '--profile', options.profile);
  return spawnSync('docker', [...base, ...args], { stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
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
    fail(`Docker Compose ${options.minCompose.join('.')}+ é exigido (vários --env-file). Encontrado: ${shown || 'ausente'}.`);
  }
}

/** Lê os dois .env, exigindo que ambos existam; o do deploy vence o da raiz. */
function readEnvironment(options) {
  const missing = [options.rootEnv, options.deployEnv].filter((file) => !existsSync(file));
  if (missing.length > 0) {
    fail(`Arquivo(s) de ambiente ausente(s): ${missing.join(', ')}. Crie-os a partir dos .env.example.`);
  }
  return { ...readEnvPairs(readFileSync(options.rootEnv, 'utf8')), ...readEnvPairs(readFileSync(options.deployEnv, 'utf8')) };
}

/** Tenta ocupar a porta em loopback. Devolve 'free' ou o código do erro (EADDRINUSE, EACCES…). */
function probePort(port, host) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', (error) => done(error.code ?? 'UNKNOWN'));
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

async function checkPorts(options, env) {
  if (alreadyRunning(options)) return;
  for (const key of options.portKeys) {
    const port = Number(env[key]);
    if (!Number.isInteger(port) || port <= 0) fail(`${key} ausente ou inválida nos arquivos de ambiente.`);
    const code = await probePort(port, options.loopback);
    if (code !== 'free') fail(portProblem(code, port, key));
  }
}

async function up(options) {
  requireDocker(options);
  const env = readEnvironment(options);
  await checkPorts(options, env);
  const run = compose(options, ['up', '--build', '--detach', '--wait']);
  if (run.status !== 0) fail('A subida falhou. Os containers ficaram para inspeção: node docker-up.mjs logs');
  process.stdout.write(`Disponível em http://${options.loopback}:${env[options.urlKey]}\n`);
}

function passthrough(options, args) {
  requireDocker(options);
  readEnvironment(options);
  process.exit(compose(options, args).status ?? 1);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!COMMANDS.includes(command)) {
    process.stderr.write(`Uso: node docker-up.mjs <${COMMANDS.join('|')}> [opções]\n`);
    process.exit(2);
  }
  for (const key of ['composeFile', 'rootEnv', 'deployEnv']) options[key] = resolve(options[key]);
  if (command === 'up') await up(options);
  else passthrough(options, command === 'stop' ? ['down'] : ['logs', '--follow']);
}

main();
