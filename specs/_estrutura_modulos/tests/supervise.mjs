#!/usr/bin/env node
/**
 * supervisionar.mjs — roda UM comando sob teto de tempo e, em qualquer desfecho, encerra a ÁRVORE
 * inteira de processos dele. É a casca de processo do `template-self-test.mjs`.
 *
 *   node supervisionar.mjs --teto-ms N -- <comando> [args...]
 *   node supervisionar.mjs --teto-ms N --ate-url URL --intervalo-ms M --linhas-cauda K -- <comando> [args...]
 *   node supervisionar.mjs --porta-livre
 *   node supervisionar.mjs --autoteste
 *
 * POR QUE EXISTE: `spawnSync` com `timeout` mata só o filho DIRETO. O `pytest` órfão que pendurou
 * uma rodada por 57 minutos era neto (`npm run` -> `sh` -> `pytest`), e no Windows matar o PID do
 * `npm`/`tsx` deixa o filho vivo. Aqui o `spawn` é assíncrono, e o encerramento resolve a árvore:
 * `taskkill /T /F` no Windows; grupo de processos (`detached` + `kill(-pid)`) nos demais.
 *
 * DOIS MODOS, UM CONCEITO ("supervisionar um processo"):
 *   - espera a SAÍDA: o código de saída do filho é o do supervisor; estourar o teto sai 124.
 *   - `--ate-url`: o filho é um SERVIDOR. Sonda a URL até 200, então encerra a árvore e sai 0. Sai
 *     não-zero (mensagem + cauda do stdout/stderr do filho em stderr) se o filho sai antes, a URL
 *     responde diferente de 200, ou o teto estoura.
 *
 * Fora de `tools/` DE PROPÓSITO, ao lado do autoteste do template: é ferramenta de quem MANTÉM o
 * template; `create-project.mjs` copia `tools/` inteiro e isto viajaria como peso morto.
 *
 * `--porta-livre`: imprime uma porta TCP livre em loopback (escolhida pelo SO, nunca um número fixo).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer as criarServidorTcp } from 'node:net';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

// ================================================================================================
// NÚCLEO — puro.
// ================================================================================================

/** Convenção do `timeout(1)` do GNU: o supervisor matou o filho por estouro do teto. */
export const SAIDA_TETO = 124;

const STATUS_OK = 200;
const STATUS_NAO_ENCONTRADO = 404;
/** Últimas linhas do processo que entram na mensagem de falha, se `--linhas-cauda` não vier. */
const LINHAS_DE_CAUDA_PADRAO = 20;
/** Pausa entre verificações do filho no modo "espera a saída". */
const PASSO_DE_ESPERA_MS = 50;
/** Teto do `spawnSync` que cerca o supervisor DENTRO do autoteste: cada caso real dura segundos. */
const TETO_DO_CASO_DE_TESTE_MS = 30000;
/** Teto dado ao supervisor nos casos reais do autoteste que esperam o estouro. */
const TETO_CURTO_DE_TESTE_MS = 1500;
const TETO_DE_SONDA_DE_TESTE_MS = 10000;
const INTERVALO_DE_TESTE_MS = 100;
const ESPERA_DA_MORTE_DE_TESTE_MS = 5000;

const OPCOES_COM_VALOR = {
  '--teto-ms': 'tetoMs',
  '--ate-url': 'ateUrl',
  '--intervalo-ms': 'intervaloMs',
  '--linhas-cauda': 'linhasCauda',
};
const OPCOES_NUMERICAS = new Set(['tetoMs', 'intervaloMs', 'linhasCauda']);

/** Lê o valor numérico/texto de UMA opção nomeada. `{ erro }` se faltar valor ou não for inteiro > 0. */
function lerValor(nome, chave, bruto) {
  if (bruto === undefined) return { erro: `${nome} exige um valor` };
  if (!OPCOES_NUMERICAS.has(chave)) return { valor: bruto };
  const numero = Number(bruto);
  if (!Number.isInteger(numero) || numero <= 0) return { erro: `${nome} exige um inteiro > 0 (veio "${bruto}")` };
  return { valor: numero };
}

/** Confere o que a CLI exige depois de lidas as opções. */
function validarOpcoes(opcoes) {
  if (opcoes.tetoMs === null) return { erro: '--teto-ms e obrigatorio' };
  if (opcoes.comando.length === 0) return { erro: 'faltou o comando depois de "--"' };
  if (opcoes.ateUrl !== null && opcoes.intervaloMs === null) return { erro: '--ate-url exige --intervalo-ms' };
  return { opcoes };
}

/** argv -> `{ opcoes }` ou `{ erro }`. Argumento desconhecido REPROVA (nunca é ignorado). */
export function lerArgumentos(argv) {
  const opcoes = { tetoMs: null, ateUrl: null, intervaloMs: null, linhasCauda: LINHAS_DE_CAUDA_PADRAO, comando: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      opcoes.comando = argv.slice(i + 1);
      break;
    }
    const chave = OPCOES_COM_VALOR[arg];
    if (chave === undefined) return { erro: `argumento desconhecido "${arg}"` };
    const { valor, erro } = lerValor(arg, chave, argv[i + 1]);
    if (erro !== undefined) return { erro };
    opcoes[chave] = valor;
    i += 1;
  }
  return validarOpcoes(opcoes);
}

/**
 * A decisão de UMA volta de sondagem. Ordem importa: uma resposta HTTP vence "processo saiu" (o
 * servidor pode responder e cair logo depois) e "teto" (resposta na última volta ainda vale).
 * `status === null` = a conexão não abriu ainda (recusada/timeout) — segue sondando.
 */
export function decidirSondagem({ status, saiu, estourou }) {
  if (status === STATUS_OK) return { fim: true, ok: true, motivo: null };
  if (status !== null && status !== undefined) {
    return { fim: true, ok: false, motivo: `health respondeu ${status} (esperado 200)` };
  }
  if (saiu !== null && saiu !== undefined) {
    return { fim: true, ok: false, motivo: `processo saiu antes do health responder (${saiu})` };
  }
  if (estourou) return { fim: true, ok: false, motivo: 'teto estourado antes do health responder', teto: true };
  return { fim: false, ok: false, motivo: null };
}

/** As últimas `n` linhas não vazias de `texto`. */
export function caudaDe(texto, n) {
  return texto.split(/\r?\n/).filter((linha) => linha.trim() !== '').slice(-n);
}

// ================================================================================================
// CASCA — processo, rede, relógio.
// ================================================================================================

/** Encerra o filho E os descendentes dele. Só é chamado com o filho ainda vivo (PID não reciclado). */
function encerrarArvore(pid) {
  if (pid === undefined) return;
  if (platform() === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  matarPosix(-pid) || matarPosix(pid);
}

/** `kill -9` num PID/grupo. `true` se alcançou o alvo; `false` se ele não existe mais (ESRCH). */
function matarPosix(alvo) {
  try {
    process.kill(alvo, 'SIGKILL');
    return true;
  } catch (causa) {
    if (causa.code !== 'ESRCH') process.stderr.write(`[supervisionar] kill ${alvo}: ${causa.message}
`);
    return false;
  }
}

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** O filho, com o estado de saída observável por `estado.saiu`. */
function iniciarFilho(comando, sondando, estado) {
  const [executavel, ...args] = comando;
  const filho = spawn(executavel, args, {
    stdio: sondando ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    detached: platform() !== 'win32',
    windowsHide: true,
    shell: false,
  });
  filho.on('error', (causa) => {
    process.stderr.write(`[supervisionar] erro ao executar: ${causa.message}
`);
    estado.saiu = `erro ao executar: ${causa.message}`;
    estado.codigo = 1;
  });
  filho.on('exit', (codigo, sinal) => {
    estado.saiu = sinal === null ? `codigo ${codigo}` : `sinal ${sinal}`;
    estado.codigo = codigo ?? 1;
  });
  return filho;
}

function acumularCauda(filho, estado) {
  const guardar = (pedaco) => {
    estado.saida += pedaco.toString('utf8');
  };
  filho.stdout?.on('data', guardar);
  filho.stderr?.on('data', guardar);
}

/** Modo "espera a saída": devolve o código de saída do supervisor. */
async function aguardarSaida(estado, limite) {
  while (estado.saiu === null) {
    if (Date.now() >= limite) return SAIDA_TETO;
    await aguardar(PASSO_DE_ESPERA_MS);
  }
  return estado.codigo;
}

/** UMA sonda HTTP: o status, ou `null` se a conexão não abriu. */
async function sondarUmaVez(url, intervaloMs) {
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(intervaloMs) });
    return resposta.status;
  } catch {
    return null;
  }
}

/** Modo `--ate-url`: devolve `{ codigo, motivo }`. */
async function aguardarHealth(estado, limite, opcoes) {
  for (;;) {
    const status = await sondarUmaVez(opcoes.ateUrl, opcoes.intervaloMs);
    const decisao = decidirSondagem({ status, saiu: estado.saiu, estourou: Date.now() >= limite });
    if (decisao.fim) return { codigo: decisao.ok ? 0 : 1, motivo: decisao.motivo, estourou: decisao.teto === true };
    await aguardar(opcoes.intervaloMs);
  }
}

function relatarFalha(motivo, estado, opcoes) {
  const linhas = caudaDe(estado.saida, opcoes.linhasCauda);
  process.stderr.write(`[supervisionar] ${motivo}\n`);
  if (linhas.length > 0) process.stderr.write(`[supervisionar] ultimas linhas do processo:\n${linhas.map((l) => `  | ${l}`).join('\n')}\n`);
}

async function supervisionar(opcoes) {
  const estado = { saiu: null, codigo: null, saida: '' };
  const sondando = opcoes.ateUrl !== null;
  const filho = iniciarFilho(opcoes.comando, sondando, estado);
  if (sondando) acumularCauda(filho, estado);
  const limite = Date.now() + opcoes.tetoMs;

  try {
    if (!sondando) {
      const codigo = await aguardarSaida(estado, limite);
      if (codigo === SAIDA_TETO) process.stderr.write(`[supervisionar] estourou o teto de ${opcoes.tetoMs / 1000} s\n`);
      return codigo;
    }
    const { codigo, motivo, estourou } = await aguardarHealth(estado, limite, opcoes);
    if (codigo === 0) return 0;
    relatarFalha(motivo, estado, opcoes);
    return estourou ? SAIDA_TETO : codigo;
  } finally {
    if (estado.saiu === null) encerrarArvore(filho.pid);
  }
}

/** Uma porta TCP livre em loopback: o SO escolhe, o servidor temporário fecha logo em seguida. */
function descobrirPortaLivre() {
  return new Promise((resolve, reject) => {
    const servidor = criarServidorTcp();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

// ================================================================================================
// AUTOTESTE — o núcleo puro e a casca REAL (processo de verdade, curto), porque "a árvore morre" é
// uma propriedade de processo e não se prova em memória.
// ================================================================================================

const ESTE_ARQUIVO = fileURLToPath(import.meta.url);

/** Roda o supervisor como o `template-self-test.mjs` o roda: `spawnSync`, captura tudo. */
function rodarSupervisor(args) {
  return spawnSync(process.execPath, [ESTE_ARQUIVO, ...args], { encoding: 'utf8', shell: false, timeout: TETO_DO_CASO_DE_TESTE_MS });
}

function processoVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function morreuEm(pid, esperaMs) {
  const limite = Date.now() + esperaMs;
  while (Date.now() < limite) {
    if (!processoVivo(pid)) return true;
    await aguardar(100);
  }
  return !processoVivo(pid);
}

const NETO_PARADO = "setInterval(() => {}, 1000)";
/** Filho que cria um NETO e imprime o PID dele — o formato exato do `pytest` órfão. */
const FILHO_COM_NETO = `
const { spawn } = require('node:child_process');
const neto = spawn(process.execPath, ['-e', ${JSON.stringify(NETO_PARADO)}], { stdio: 'ignore' });
console.log(neto.pid);
${NETO_PARADO};`;

function servidorEm(porta, status) {
  return `require('node:http').createServer((q, r) => { r.statusCode = ${status}; r.end('x'); }).listen(${porta}, '127.0.0.1');`;
}

function casosPuros() {
  return [
    { nome: 'decidirSondagem: 200 -> fim ok', fn: () => {
      const d = decidirSondagem({ status: STATUS_OK, saiu: null, estourou: false });
      return d.fim && d.ok;
    } },
    { nome: 'decidirSondagem: 404 -> fim reprovado nomeando o status', fn: () => {
      const d = decidirSondagem({ status: STATUS_NAO_ENCONTRADO, saiu: null, estourou: false });
      return d.fim && !d.ok && d.motivo.includes(String(STATUS_NAO_ENCONTRADO));
    } },
    { nome: 'decidirSondagem: sem resposta e processo saiu -> fim reprovado', fn: () => {
      const d = decidirSondagem({ status: null, saiu: 'codigo 1', estourou: false });
      return d.fim && !d.ok && d.motivo.includes('saiu');
    } },
    { nome: 'decidirSondagem: sem resposta e teto estourado -> fim reprovado', fn: () => {
      const d = decidirSondagem({ status: null, saiu: null, estourou: true });
      return d.fim && !d.ok && d.motivo.includes('teto');
    } },
    { nome: 'decidirSondagem: sem resposta, vivo, dentro do teto -> segue sondando', fn: () => (
      decidirSondagem({ status: null, saiu: null, estourou: false }).fim === false
    ) },
    { nome: 'decidirSondagem: resposta 200 na ultima volta vence o teto', fn: () => (
      decidirSondagem({ status: STATUS_OK, saiu: null, estourou: true }).ok === true
    ) },
    { nome: 'caudaDe: ultimas n linhas nao vazias', fn: () => (
      JSON.stringify(caudaDe('a\n\nb\r\nc\n', 2)) === JSON.stringify(['b', 'c'])
    ) },
    { nome: 'lerArgumentos: forma completa', fn: () => {
      const { opcoes } = lerArgumentos(['--teto-ms', '1000', '--ate-url', 'http://x/', '--intervalo-ms', '50', '--', 'node', '-v']);
      return opcoes.tetoMs === 1000 && opcoes.ateUrl === 'http://x/' && opcoes.comando.join(' ') === 'node -v';
    } },
    { nome: 'lerArgumentos: desconhecido, teto ausente, comando ausente, valor invalido -> erro', fn: () => (
      ['--rapido', '--', 'x'].map((a) => lerArgumentos([a])).every((r) => r.erro !== undefined)
      && lerArgumentos(['--', 'node']).erro !== undefined
      && lerArgumentos(['--teto-ms', '5']).erro !== undefined
      && lerArgumentos(['--teto-ms', 'abc', '--', 'node']).erro !== undefined
    ) },
  ];
}

async function casoTetoMataArvore() {
  const r = rodarSupervisor(['--teto-ms', String(TETO_CURTO_DE_TESTE_MS), '--', process.execPath, '-e', FILHO_COM_NETO]);
  const pidNeto = Number(r.stdout.trim().split(/\s+/)[0]);
  if (r.status !== SAIDA_TETO || !r.stderr.includes(`estourou o teto de ${TETO_CURTO_DE_TESTE_MS / 1000} s`) || !Number.isInteger(pidNeto)) return false;
  return morreuEm(pidNeto, ESPERA_DA_MORTE_DE_TESTE_MS);
}

async function casoSondaOkEncerraServidor() {
  const porta = await descobrirPortaLivre();
  const r = rodarSupervisor([
    '--teto-ms', String(TETO_DE_SONDA_DE_TESTE_MS), '--ate-url', `http://127.0.0.1:${porta}/`, '--intervalo-ms', String(INTERVALO_DE_TESTE_MS),
    '--', process.execPath, '-e', servidorEm(porta, STATUS_OK),
  ]);
  if (r.status !== 0) return false;
  await aguardar(INTERVALO_DE_TESTE_MS * 3);
  return (await sondarUmaVez(`http://127.0.0.1:${porta}/`, INTERVALO_DE_TESTE_MS * 3)) === null;
}

async function casoSondaStatusErrado() {
  const porta = await descobrirPortaLivre();
  const r = rodarSupervisor([
    '--teto-ms', String(TETO_DE_SONDA_DE_TESTE_MS), '--ate-url', `http://127.0.0.1:${porta}/`, '--intervalo-ms', String(INTERVALO_DE_TESTE_MS),
    '--', process.execPath, '-e', servidorEm(porta, STATUS_NAO_ENCONTRADO),
  ]);
  return r.status === 1 && r.stderr.includes(String(STATUS_NAO_ENCONTRADO));
}

async function casoSondaProcessoSaiu() {
  const r = rodarSupervisor([
    '--teto-ms', String(TETO_DE_SONDA_DE_TESTE_MS), '--ate-url', 'http://127.0.0.1:9/', '--intervalo-ms', String(INTERVALO_DE_TESTE_MS),
    '--', process.execPath, '-e', "console.error('boom: sem fabrica registrada'); process.exit(3)",
  ]);
  return r.status === 1 && r.stderr.includes('saiu antes do health') && r.stderr.includes('sem fabrica registrada');
}

async function casoSondaTeto() {
  const r = rodarSupervisor([
    '--teto-ms', String(TETO_CURTO_DE_TESTE_MS), '--ate-url', 'http://127.0.0.1:9/', '--intervalo-ms', String(INTERVALO_DE_TESTE_MS),
    '--', process.execPath, '-e', NETO_PARADO,
  ]);
  return r.status === SAIDA_TETO && r.stderr.includes('teto');
}

async function casoAutotesteDoComandoNaoESeu() {
  const script = "console.log(process.argv.slice(1).join(' '))";
  const r = rodarSupervisor(['--teto-ms', String(ESPERA_DA_MORTE_DE_TESTE_MS), '--', process.execPath, '-e', script, '--', '--autoteste']);
  return r.status === 0 && r.stdout.trim() === '--autoteste' && !r.stdout.includes('autoteste (supervisionar)');
}

async function casoSaidaDoFilho() {
  const r = rodarSupervisor(['--teto-ms', String(ESPERA_DA_MORTE_DE_TESTE_MS), '--', process.execPath, '-e', 'process.exit(7)']);
  return r.status === 7;
}

function casosDeProcesso() {
  return [
    { nome: 'processo real: estouro do teto sai 124 e o NETO morre junto', fn: casoTetoMataArvore },
    { nome: 'processo real: o codigo de saida do filho e o do supervisor', fn: casoSaidaDoFilho },
    { nome: 'processo real: `--autoteste` DEPOIS do `--` e do comando, nao do supervisor', fn: casoAutotesteDoComandoNaoESeu },
    { nome: 'processo real: --ate-url 200 -> sai 0 e o servidor e encerrado', fn: casoSondaOkEncerraServidor },
    { nome: 'processo real: --ate-url 404 -> reprova nomeando o status', fn: casoSondaStatusErrado },
    { nome: 'processo real: --ate-url, filho sai antes -> reprova com a cauda do processo', fn: casoSondaProcessoSaiu },
    { nome: 'processo real: --ate-url, nada responde -> teto 124', fn: casoSondaTeto },
  ];
}

async function rodarAutoteste() {
  const casos = [...casosPuros(), ...casosDeProcesso()];
  let falhas = 0;
  for (const caso of casos) {
    let ok;
    try {
      ok = (await caso.fn()) === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  process.stdout.write(`\nautoteste (supervisionar): ${casos.length - falhas}/${casos.length} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

async function principal(argv) {
  // So as flags ANTES do `--`: depois dele e o comando supervisionado, e `--autoteste` ali (o do
  // `composition.*` do projeto gerado) e dele, nao do supervisor — antes, este `includes` engolia o
  // `--autoteste` do comando e rodava o autoteste do supervisor no lugar.
  const antesDoComando = argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv;
  if (antesDoComando.includes('--autoteste')) return rodarAutoteste();
  if (antesDoComando.includes('--porta-livre')) {
    process.stdout.write(`${await descobrirPortaLivre()}\n`);
    return 0;
  }
  const { opcoes, erro } = lerArgumentos(argv);
  if (erro !== undefined) {
    process.stderr.write(`[supervisionar] erro: ${erro}\n`);
    return 2;
  }
  return supervisionar(opcoes);
}

if (process.argv[1] !== undefined && process.argv[1] === ESTE_ARQUIVO) {
  principal(process.argv.slice(2)).then((codigo) => process.exit(codigo));
}
