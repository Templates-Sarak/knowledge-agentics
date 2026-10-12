#!/usr/bin/env node
/**
 * supervise.mjs — roda UM comando sob teto de tempo e, em qualquer desfecho, encerra a ÁRVORE
 * inteira de processos dele. É a casca de processo do `template-self-test.mjs`.
 *
 *   node supervise.mjs --timeout-ms N -- <comando> [args...]
 *   node supervise.mjs --timeout-ms N --until-url URL --interval-ms M --tail-lines K -- <comando> [args...]
 *   node supervise.mjs --free-port
 *   node supervise.mjs --selftest
 *
 * POR QUE EXISTE: `spawnSync` com `timeout` mata só o filho DIRETO. O `pytest` órfão que pendurou
 * uma rodada por 57 minutos era neto (`npm run` -> `sh` -> `pytest`), e no Windows matar o PID do
 * `npm`/`tsx` deixa o filho vivo. Aqui o `spawn` é assíncrono, e o encerramento resolve a árvore:
 * `taskkill /T /F` no Windows; grupo de processos (`detached` + `kill(-pid)`) nos demais.
 *
 * DOIS MODOS, UM CONCEITO ("supervisionar um processo"):
 *   - espera a SAÍDA: o código de saída do filho é o do supervisor; estourar o teto sai 124.
 *   - `--until-url`: o filho é um SERVIDOR. Sonda a URL até 200, então encerra a árvore e sai 0. Sai
 *     não-zero (mensagem + cauda do stdout/stderr do filho em stderr) se o filho sai antes, a URL
 *     responde diferente de 200, ou o teto estoura.
 *
 * Fora de `tools/` DE PROPÓSITO, ao lado do autoteste do template: é ferramenta de quem MANTÉM o
 * template; `create-project.mjs` copia `tools/` inteiro e isto viajaria como peso morto.
 *
 * `--free-port`: imprime uma porta TCP livre em loopback (escolhida pelo SO, nunca um número fixo).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

// ================================================================================================
// NÚCLEO — puro.
// ================================================================================================

/** Convenção do `timeout(1)` do GNU: o supervisor matou o filho por estouro do teto. */
export const EXIT_CAP = 124;

const STATUS_OK = 200;
const STATUS_NOT_FOUND = 404;
/** Últimas linhas do processo que entram na mensagem de falha, se `--tail-lines` não vier. */
const DEFAULT_TAIL_LINES = 20;
/** Pausa entre verificações do filho no modo "espera a saída". */
const WAIT_STEP_MS = 50;
/** Teto do `spawnSync` que cerca o supervisor DENTRO do autoteste: cada caso real dura segundos. */
const TEST_CASE_CAP_MS = 30000;
/** Teto dado ao supervisor nos casos reais do autoteste que esperam o estouro. */
const TEST_SHORT_CAP_MS = 1500;
const TEST_PROBE_CAP_MS = 10000;
const TEST_INTERVAL_MS = 100;
const TEST_DEATH_WAIT_MS = 5000;

const OPTIONS_WITH_VALUE = {
  '--timeout-ms': 'capMs',
  '--until-url': 'untilUrl',
  '--interval-ms': 'intervalMs',
  '--tail-lines': 'tailLines',
};
const NUMERIC_OPTIONS = new Set(['capMs', 'intervalMs', 'tailLines']);

/** Lê o valor numérico/texto de UMA opção nomeada. `{ erro }` se faltar valor ou não for inteiro > 0. */
function readValue(name, key, raw) {
  if (raw === undefined) return { error: `${name} requires a value` };
  if (!NUMERIC_OPTIONS.has(key)) return { value: raw };
  const number = Number(raw);
  if (!Number.isInteger(number) || number <= 0) return { error: `${name} requires an integer > 0 (received "${raw}")` };
  return { value: number };
}

/** Confere o que a CLI exige depois de lidas as opções. */
function validateOptions(options) {
  if (options.capMs === null) return { error: '--timeout-ms is required' };
  if (options.command.length === 0) return { error: 'missing command after "--"' };
  if (options.untilUrl !== null && options.intervalMs === null) return { error: '--until-url requires --interval-ms' };
  return { options };
}

/** argv -> `{ opcoes }` ou `{ erro }`. Argumento desconhecido REPROVA (nunca é ignorado). */
export function readArguments(argv) {
  const options = { capMs: null, untilUrl: null, intervalMs: null, tailLines: DEFAULT_TAIL_LINES, command: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      options.command = argv.slice(i + 1);
      break;
    }
    const key = OPTIONS_WITH_VALUE[arg];
    if (key === undefined) return { error: `unknown argument "${arg}"` };
    const { value, error } = readValue(arg, key, argv[i + 1]);
    if (error !== undefined) return { error };
    options[key] = value;
    i += 1;
  }
  return validateOptions(options);
}

/**
 * A decisão de UMA volta de sondagem. Ordem importa: uma resposta HTTP vence "processo saiu" (o
 * servidor pode responder e cair logo depois) e "teto" (resposta na última volta ainda vale).
 * `status === null` = a conexão não abriu ainda (recusada/timeout) — segue sondando.
 */
export function decideProbing({ status, exited, overflowed }) {
  if (status === STATUS_OK) return { end: true, ok: true, motivo: null };
  if (status !== null && status !== undefined) {
    return { end: true, ok: false, motivo: `health returned ${status} (expected 200)` };
  }
  if (exited !== null && exited !== undefined) {
    return { end: true, ok: false, motivo: `process exited before health responded (${exited})` };
  }
  if (overflowed) return { end: true, ok: false, motivo: 'timeout expired before health responded', cap: true };
  return { end: false, ok: false, motivo: null };
}

/** As últimas `n` linhas não vazias de `texto`. */
export function tailOf(text, n) {
  return text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-n);
}

// ================================================================================================
// CASCA — processo, rede, relógio.
// ================================================================================================

/** Encerra o filho E os descendentes dele. Só é chamado com o filho ainda vivo (PID não reciclado). */
function endTree(pid) {
  if (pid === undefined) return;
  if (platform() === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  killPosix(-pid) || killPosix(pid);
}

/** `kill -9` num PID/grupo. `true` se alcançou o alvo; `false` se ele não existe mais (ESRCH). */
function killPosix(target) {
  try {
    process.kill(target, 'SIGKILL');
    return true;
  } catch (cause) {
    if (cause.code !== 'ESRCH') process.stderr.write(`[supervise] kill ${target}: ${cause.message}
`);
    return false;
  }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** O filho, com o estado de saída observável por `estado.saiu`. */
function startChild(command, probing, state) {
  const [executable, ...args] = command;
  const child = spawn(executable, args, {
    stdio: probing ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    detached: platform() !== 'win32',
    windowsHide: true,
    shell: false,
  });
  child.on('error', (cause) => {
    process.stderr.write(`[supervise] execution failed: ${cause.message}
`);
    state.exited = `execution failed: ${cause.message}`;
    state.code = 1;
  });
  child.on('exit', (code, signal) => {
    state.exited = signal === null ? `exit code ${code}` : `signal ${signal}`;
    state.code = code ?? 1;
  });
  return child;
}

function accumulateTail(child, state) {
  const store = (chunk) => {
    state.saida += chunk.toString('utf8');
  };
  child.stdout?.on('data', store);
  child.stderr?.on('data', store);
}

/** Modo "espera a saída": devolve o código de saída do supervisor. */
async function waitForOutput(state, limit) {
  while (state.exited === null) {
    if (Date.now() >= limit) return EXIT_CAP;
    await waitFor(WAIT_STEP_MS);
  }
  return state.code;
}

/** UMA sonda HTTP: o status, ou `null` se a conexão não abriu. */
async function probeOnce(url, intervalMs) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(intervalMs) });
    return response.status;
  } catch {
    return null;
  }
}

/** Modo `--until-url`: devolve `{ codigo, motivo }`. */
async function waitForHealth(state, limit, options) {
  for (;;) {
    const status = await probeOnce(options.untilUrl, options.intervalMs);
    const decision = decideProbing({ status, exited: state.exited, overflowed: Date.now() >= limit });
    if (decision.end) return { code: decision.ok ? 0 : 1, motivo: decision.motivo, overflowed: decision.cap === true };
    await waitFor(options.intervalMs);
  }
}

function reportFailure(reason, state, options) {
  const lines = tailOf(state.saida, options.tailLines);
  process.stderr.write(`[supervise] ${reason}\n`);
  if (lines.length > 0) process.stderr.write(`[supervise] last process lines:\n${lines.map((l) => `  | ${l}`).join('\n')}\n`);
}

async function supervise(options) {
  const state = { exited: null, code: null, saida: '' };
  const probing = options.untilUrl !== null;
  const child = startChild(options.command, probing, state);
  if (probing) accumulateTail(child, state);
  const limit = Date.now() + options.capMs;

  try {
    if (!probing) {
      const code = await waitForOutput(state, limit);
      if (code === EXIT_CAP) process.stderr.write(`[supervise] timeout expired after ${options.capMs / 1000} s\n`);
      return code;
    }
    const { code, motivo: reason, overflowed } = await waitForHealth(state, limit, options);
    if (code === 0) return 0;
    reportFailure(reason, state, options);
    return overflowed ? EXIT_CAP : code;
  } finally {
    if (state.exited === null) endTree(child.pid);
  }
}

/** Uma porta TCP livre em loopback: o SO escolhe, o servidor temporário fecha logo em seguida. */
function discoverFreePort() {
  return new Promise((resolve, reject) => {
    const server = createTcpServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// ================================================================================================
// AUTOTESTE — o núcleo puro e a casca REAL (processo de verdade, curto), porque "a árvore morre" é
// uma propriedade de processo e não se prova em memória.
// ================================================================================================

const THIS_FILE = fileURLToPath(import.meta.url);

/** Roda o supervisor como o `template-self-test.mjs` o roda: `spawnSync`, captura tudo. */
function runSupervisor(args) {
  return spawnSync(process.execPath, [THIS_FILE, ...args], { encoding: 'utf8', shell: false, timeout: TEST_CASE_CAP_MS });
}

function liveProcess(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function diedIn(pid, waitMs) {
  const limit = Date.now() + waitMs;
  while (Date.now() < limit) {
    if (!liveProcess(pid)) return true;
    await waitFor(100);
  }
  return !liveProcess(pid);
}

const STOPPED_GRANDCHILD = "setInterval(() => {}, 1000)";
/** Filho que cria um NETO e imprime o PID dele — o formato exato do `pytest` órfão. */
const CHILD_WITH_GRANDCHILD = `
const { spawn } = require('node:child_process');
const neto = spawn(process.execPath, ['-e', ${JSON.stringify(STOPPED_GRANDCHILD)}], { stdio: 'ignore' });
console.log(neto.pid);
${STOPPED_GRANDCHILD};`;

function serverIn(port, status) {
  return `require('node:http').createServer((q, r) => { r.statusCode = ${status}; r.end('x'); }).listen(${port}, '127.0.0.1');`;
}

function pureCases() {
  return [
    { name: 'decideProbing: 200 -> fim ok', fn: () => {
      const d = decideProbing({ status: STATUS_OK, exited: null, overflowed: false });
      return d.end && d.ok;
    } },
    { name: 'decideProbing: 404 ends with failure naming the status', fn: () => {
      const d = decideProbing({ status: STATUS_NOT_FOUND, exited: null, overflowed: false });
      return d.end && !d.ok && d.motivo.includes(String(STATUS_NOT_FOUND));
    } },
    { name: 'decideProbing: no response and exited process ends with failure', fn: () => {
      const d = decideProbing({ status: null, exited: 'exit code 1', overflowed: false });
      return d.end && !d.ok && d.motivo.includes('exited');
    } },
    { name: 'decideProbing: no response and expired timeout ends with failure', fn: () => {
      const d = decideProbing({ status: null, exited: null, overflowed: true });
      return d.end && !d.ok && d.motivo.includes('timeout');
    } },
    { name: 'decideProbing: no response while alive and within the limit keeps probing', fn: () => (
      decideProbing({ status: null, exited: null, overflowed: false }).end === false
    ) },
    { name: 'decideProbing: a 200 response on the last attempt takes precedence over the limit', fn: () => (
      decideProbing({ status: STATUS_OK, exited: null, overflowed: true }).ok === true
    ) },
    { name: 'tailOf: last n nonempty lines', fn: () => (
      JSON.stringify(tailOf('a\n\nb\r\nc\n', 2)) === JSON.stringify(['b', 'c'])
    ) },
    { name: 'readArguments: full option set', fn: () => {
      const { options } = readArguments(['--timeout-ms', '1000', '--until-url', 'http://x/', '--interval-ms', '50', '--', 'node', '-v']);
      return options.capMs === 1000 && options.untilUrl === 'http://x/' && options.command.join(' ') === 'node -v';
    } },
    { name: 'readArguments: unknown flag, missing timeout, missing command, and invalid value return errors', fn: () => (
      ['--quick', '--', 'x'].map((a) => readArguments([a])).every((r) => r.error !== undefined)
      && readArguments(['--', 'node']).error !== undefined
      && readArguments(['--timeout-ms', '5']).error !== undefined
      && readArguments(['--timeout-ms', 'abc', '--', 'node']).error !== undefined
    ) },
  ];
}

async function capKillsTreeCase() {
  const r = runSupervisor(['--timeout-ms', String(TEST_SHORT_CAP_MS), '--', process.execPath, '-e', CHILD_WITH_GRANDCHILD]);
  const pidGrandchild = Number(r.stdout.trim().split(/\s+/)[0]);
  if (r.status !== EXIT_CAP || !r.stderr.includes(`timeout expired after ${TEST_SHORT_CAP_MS / 1000} s`) || !Number.isInteger(pidGrandchild)) return false;
  return diedIn(pidGrandchild, TEST_DEATH_WAIT_MS);
}

async function probeOkEndsServerCase() {
  const port = await discoverFreePort();
  const r = runSupervisor([
    '--timeout-ms', String(TEST_PROBE_CAP_MS), '--until-url', `http://127.0.0.1:${port}/`, '--interval-ms', String(TEST_INTERVAL_MS),
    '--', process.execPath, '-e', serverIn(port, STATUS_OK),
  ]);
  if (r.status !== 0) return false;
  await waitFor(TEST_INTERVAL_MS * 3);
  return (await probeOnce(`http://127.0.0.1:${port}/`, TEST_INTERVAL_MS * 3)) === null;
}

async function probeWrongStatusCase() {
  const port = await discoverFreePort();
  const r = runSupervisor([
    '--timeout-ms', String(TEST_PROBE_CAP_MS), '--until-url', `http://127.0.0.1:${port}/`, '--interval-ms', String(TEST_INTERVAL_MS),
    '--', process.execPath, '-e', serverIn(port, STATUS_NOT_FOUND),
  ]);
  return r.status === 1 && r.stderr.includes(String(STATUS_NOT_FOUND));
}

async function probeProcessExitedCase() {
  const r = runSupervisor([
    '--timeout-ms', String(TEST_PROBE_CAP_MS), '--until-url', 'http://127.0.0.1:9/', '--interval-ms', String(TEST_INTERVAL_MS),
    '--', process.execPath, '-e', "console.error('boom: factory not registered'); process.exit(3)",
  ]);
  return r.status === 1 && r.stderr.includes('exited before health') && r.stderr.includes('factory not registered');
}

async function probeCapCase() {
  const r = runSupervisor([
    '--timeout-ms', String(TEST_SHORT_CAP_MS), '--until-url', 'http://127.0.0.1:9/', '--interval-ms', String(TEST_INTERVAL_MS),
    '--', process.execPath, '-e', STOPPED_GRANDCHILD,
  ]);
  return r.status === EXIT_CAP && r.stderr.includes('timeout expired');
}

async function notOwnCommandSelfTestCase() {
  const script = "console.log(process.argv.slice(1).join(' '))";
  const r = runSupervisor(['--timeout-ms', String(TEST_DEATH_WAIT_MS), '--', process.execPath, '-e', script, '--', '--selftest']);
  return r.status === 0 && r.stdout.trim() === '--selftest' && !r.stdout.includes('autoteste (supervise)');
}

async function childOutputCase() {
  const r = runSupervisor(['--timeout-ms', String(TEST_DEATH_WAIT_MS), '--', process.execPath, '-e', 'process.exit(7)']);
  return r.status === 7;
}

function processCases() {
  return [
    { name: 'real process: timeout exits 124 and the grandchild is killed too', fn: capKillsTreeCase },
    { name: 'real process: child exit code is returned by the supervisor', fn: childOutputCase },
    { name: 'real process: `--selftest` after `--` belongs to the child, not the supervisor', fn: notOwnCommandSelfTestCase },
    { name: 'real process: --until-url 200 exits 0 and stops the server', fn: probeOkEndsServerCase },
    { name: 'real process: --until-url 404 fails and reports the status', fn: probeWrongStatusCase },
    { name: 'real process: --until-url fails when the child exits and prints its tail', fn: probeProcessExitedCase },
    { name: 'real process: --until-url times out when nothing responds', fn: probeCapCase },
  ];
}

async function runSelfTest() {
  const cases = [...pureCases(), ...processCases()];
  let failures = 0;
  for (const testCase of cases) {
    let ok;
    try {
      ok = (await testCase.fn()) === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  process.stdout.write(`\nself-test (supervise): ${cases.length - failures}/${cases.length} passed\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

async function main(argv) {
  // So as flags ANTES do `--`: depois dele e o comando supervisionado, e `--selftest` ali (o do
  // `composition.*` do projeto gerado) e dele, nao do supervisor — antes, este `includes` engolia o
  // `--selftest` do comando e rodava o autoteste do supervisor no lugar.
  const beforeCommand = argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv;
  if (beforeCommand.includes('--selftest')) return runSelfTest();
  if (beforeCommand.includes('--free-port')) {
    process.stdout.write(`${await discoverFreePort()}\n`);
    return 0;
  }
  const { options, error } = readArguments(argv);
  if (error !== undefined) {
    process.stderr.write(`[supervise] Error: ${error}\n`);
    return 2;
  }
  return supervise(options);
}

if (process.argv[1] !== undefined && process.argv[1] === THIS_FILE) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
