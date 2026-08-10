#!/usr/bin/env node
/**
 * autoteste-template.mjs — prova que o TEMPLATE gera projeto que passa na própria cadeia que ele
 * prescreve. Lei dona: plan-2.md, Bloco K.
 *
 *   node autoteste-template.mjs [--binding typescript] [--manter] [--autoteste]
 *
 * Fora de `ferramentas/` DE PROPÓSITO (plan-2.md D3): este script é consumido por quem MANTÉM o
 * template, nunca por um projeto gerado — `criar-projeto.mjs` copia `ferramentas/` inteiro para o
 * destino (foi assim que a F.2d.1 aconteceu: fixture de ferramenta viajando e nascendo vermelha em
 * todo projeto novo). Um projeto gerado não gera projetos; este script ali seria peso sem consumidor.
 *
 * ESCOPO DESTA VERSÃO (decidido com o usuário ao abrir o Bloco K): só o módulo PADRÃO, sem flags.
 * `--sem-artefato`/`--sem-web` são bugs do Bloco O (a ferramenta de entrada, não o esqueleto) — se
 * este script já cobrasse as 4 combinações, corrigir só o Bloco L nunca deixaria o K verde, e K.0
 * promete exatamente isso: "consertar o L vira o K verde, sem tocar no K". A cobertura das 4
 * combinações é ACRESCENTADA a este arquivo dentro do próprio Bloco O — ele já anuncia isso
 * ("é a razão de o K criar módulos com combinações diferentes, e não iguais").
 *
 * NÚCLEO × CASCA, precedente de `ferramentas/afetados.mjs`/`ci-dependencias.mjs`/`ci-seguranca.mjs`:
 * `passosDoBinding` (que passos rodam, em que ordem) e `classificarPasso` (como um resultado de
 * processo vira ok/reprovado) são puros — nenhuma linha toca `fs`, `child_process` ou o relógio. A
 * casca executa CADA passo por um único despachante (`executarPasso`) e nunca usa `shell: true`.
 *
 * TRÊS FORMAS DE "NÃO RODOU", NENHUMA VIRA "ok" (lei 7 aplicada ao próprio K): `error` (o executável
 * não resolveu — ENOENT), `status === null` (matado por sinal/timeout, nunca terminou) e
 * `status !== 0` (rodou e reprovou). As três passam por `classificarPasso` e as três reprovam.
 *
 * LIMPEZA: a pasta temporária de cada binding é removida no `finally`, e uma falha de limpeza NUNCA
 * troca o exit code da verificação pelo da faxina (ela só avisa em stderr e seque adiante).
 *
 * `clone-simulado` (M.1, plan-2.md) — o passo que prova a outra metade da promessa. Até aqui o K só
 * media "o projeto NASCE verde"; nunca "o projeto CONTINUA verde depois de CLONADO", porque este
 * script gera, verifica e apaga — nunca clona. O revisor mediu o furo: `gerados/` entrou no
 * `.gitignore` da raiz (Bloco M) do jeito que anula o `.gitkeep` do molde, e um projeto clonado de
 * verdade nasce SEM a pasta que `artefato-declarado` exige. Sem rede nem remoto (o script não pode
 * depender de nenhum dos dois): `git init` + `git add -A` + `git ls-files` na própria pasta
 * temporária, e então apaga do disco, DENTRO de `modulos/`, tudo que não ficou rastreado — é a
 * simulação mínima de "o que sobrevive a um clone", sem virar um projeto git de verdade. O passo
 * `verificar`, que já vem a seguir no pipeline, é quem lê o resultado: se o `.gitignore` comeu
 * estrutura, ele reprova ali, não aqui.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process` ou o relógio.
// ================================================================================================

export const BINDINGS = ['typescript', 'javascript', 'python'];
const ID_MODULO_SONDA = 'sonda';

/**
 * Os passos de UM binding, em ordem — a decisão de "o que rodar" separada de "como rodar".
 *
 * `verificar` ANTES de `build`, `build` ANTES de `lint` NÃO É ARBITRÁRIO: é o próprio furo do
 * Bloco L.2 (`npm run build` quebra `npm run lint` porque o bundle minificado em `dist/` passa a
 * ser lintado). Trocar a ordem faria o K deixar de medir esse defeito.
 *
 * Python não tem passo `build`/`lint` separado: o binding não empacota front-end (sem `web/` nos
 * módulos Python — medido, `bindings/python/_template` não tem pasta `web`), e `verificar.py` já
 * cobre forma + limiares + tipos + testes num só passo, como o `npm run verificar` do lado Node.
 */
export function passosDoBinding(binding) {
  const gerarProjeto = { nome: 'gerar-projeto', tipo: 'gerar-projeto' };
  const criarModulo = { nome: 'criar-modulo', tipo: 'criar-modulo' };
  // Depois de `criar-modulo`, antes de `verificar` (M.1): o passo em si só poda o disco — quem lê o
  // resultado é o `verificar` que já vem a seguir no pipeline, nos dois bindings.
  const cloneSimulado = { nome: 'clone-simulado', tipo: 'clone-simulado' };

  if (binding === 'python') {
    return [
      gerarProjeto,
      { nome: 'venv', tipo: 'venv' },
      { nome: 'instalar', tipo: 'pip-install' },
      criarModulo,
      cloneSimulado,
      { nome: 'verificar', tipo: 'verificar-py' },
    ];
  }
  return [
    gerarProjeto,
    { nome: 'instalar', tipo: 'npm-install' },
    criarModulo,
    cloneSimulado,
    { nome: 'verificar', tipo: 'npm-script', script: 'verificar' },
    { nome: 'build', tipo: 'npm-script', script: 'build' },
    { nome: 'lint', tipo: 'npm-script', script: 'lint' },
  ];
}

/**
 * Um resultado bruto de `spawnSync` vira `{ ok, motivo }`. As três formas de "não rodou" — `error`,
 * `status` nulo/indefinido, `status` não-zero — caem em `ok: false`. Nenhuma vira `ok: true`.
 */
export function classificarPasso(resultado) {
  if (resultado === null || resultado === undefined) {
    return { ok: false, motivo: 'nenhum resultado — passo nao foi executado' };
  }
  if (resultado.error !== undefined && resultado.error !== null) {
    return { ok: false, motivo: `erro ao executar: ${resultado.error.message ?? String(resultado.error)}` };
  }
  if (resultado.status === null || resultado.status === undefined) {
    return { ok: false, motivo: 'processo nao terminou (sem status — sinal ou timeout)' };
  }
  if (resultado.status !== 0) {
    return { ok: false, motivo: `saida ${resultado.status}` };
  }
  return { ok: true, motivo: null };
}

/**
 * Varre os resultados de um binding e para no PRIMEIRO passo que falhar (mesmo raciocínio do `&&`
 * dentro de `npm run verificar`): passo que depende do anterior rodar sobre um estado que já não é
 * o que o passo espera não mede nada de novo, só duplica o mesmo defeito com outro nome.
 */
export function primeiroFalho(resultadosClassificados) {
  return resultadosClassificados.find((r) => !r.ok) ?? null;
}

// ================================================================================================
// CASCA — toca disco, `child_process` e ambiente. Cada acesso externo isolado num ponto nomeado.
// ================================================================================================

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_TEMPLATE = join(AQUI, '..');
const CRIAR_PROJETO = join(RAIZ_TEMPLATE, 'ferramentas', 'criar-projeto.mjs');
const CRIAR_MODULO = join(RAIZ_TEMPLATE, 'ferramentas', 'criar-modulo.mjs');
const NODE = process.execPath;

/** ÚNICO ponto que roda um script Node de verdade. Array de argumentos, NUNCA `shell: true`. */
function rodarNode(args, cwd) {
  return spawnSync(NODE, args, { cwd, encoding: 'utf8', shell: false });
}

/**
 * O entrypoint JS do `npm` pelo campo `bin` de `node_modules/npm/package.json`, ao lado do `node`
 * atual — nunca pelo `PATH`. Copiado de `ferramentas/ci-dependencias.mjs:entrypointDoNpm`
 * (que por sua vez cita `verificar-commit.mjs:entrypointDoNpm`) porque este script mora fora de
 * `ferramentas/` (D3) e não pode importar de lá — o gate `sql-no-modulo`/isolamento aplicado ao
 * próprio template.
 */
function entrypointDoPacote(raizNode, pastaPacote, chaveBin = pastaPacote) {
  const pasta = join(raizNode, 'node_modules', pastaPacote);
  try {
    const { bin } = JSON.parse(readFileSync(join(pasta, 'package.json'), 'utf8'));
    const relativo = typeof bin === 'string' ? bin : bin?.[chaveBin];
    if (!relativo) return null;
    const alvo = join(pasta, relativo);
    return existsSync(alvo) ? alvo : null;
  } catch {
    return null;
  }
}

function entrypointDoNpm() {
  const raizNode = dirname(NODE);
  for (const candidato of [raizNode, join(raizNode, '..', 'lib')]) {
    const achado = entrypointDoPacote(candidato, 'npm');
    if (achado !== null) return achado;
  }
  return null;
}

/** ÚNICO ponto que roda `npm` de verdade — sempre via entrypoint resolvido, nunca `shell: true`. */
function rodarNpm(args, cwd) {
  const entrada = entrypointDoNpm();
  if (entrada === null) return { error: new Error('npm nao encontrado ao lado do node atual'), status: null };
  return spawnSync(NODE, [entrada, ...args], { cwd, encoding: 'utf8', shell: false });
}

/** `SARAK_PYTHON` (caminho do binário) sobrepõe; senão, `python`/`python3` no PATH — mesma técnica
 * de `ci-dependencias.mjs:resolverPython`, copiada pelo mesmo motivo de fronteira (D3). */
function resolverPythonBase() {
  const candidatos = [process.env.SARAK_PYTHON, 'python', 'python3'].filter(Boolean);
  return candidatos.find((c) => spawnSync(c, ['--version'], { shell: false }).status === 0) ?? null;
}

function caminhoPythonDoVenv(venvDir) {
  return platform() === 'win32' ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python');
}

/** ÚNICO ponto que roda um interpretador Python de verdade — nunca `shell: true`. */
function rodarPython(executavel, args, cwd, envExtra = {}) {
  if (executavel === null) return { error: new Error('interpretador python nao resolvido'), status: null };
  return spawnSync(executavel, args, { cwd, encoding: 'utf8', shell: false, env: { ...process.env, ...envExtra } });
}

/** ÚNICO ponto que roda `git` de verdade — resolvido do PATH, nunca `shell: true`. Ausência de git
 * vira `error` no resultado, e `classificarPasso` já reprova isso (lei 7 — não pula). */
function rodarGit(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
}

/** Caminho de `absoluto` relativo a `raiz`, na forma que `git ls-files` usa (barra, sempre). */
function caminhoNoFormatoGit(absoluto, raiz) {
  return relative(raiz, absoluto).split(sep).join('/');
}

/**
 * Apaga, recursivamente, todo ARQUIVO sob `pasta` cujo caminho (relativo a `raizProjeto`, no
 * formato do git) não está em `rastreados` — e, na volta da recursão (pós-ordem), remove a própria
 * pasta se ela ficou vazia.
 *
 * A remoção da pasta vazia NÃO é cosmética — é a correção de uma primeira versão que a deixava no
 * disco e por isso não pegava nada: `artefato-declarado` (`temPastaDeArtefato`, para `gerados/`)
 * julga a ENTRADA da raiz (`ctx.entradasRaiz`, um `readdirSync` que lista nome de pasta, vazia ou
 * não), não o conteúdo. Medido revertendo o `.gitignore` para o `gerados/` antigo (a contraprova
 * deste item): com a pasta vazia sobrevivendo no disco, o K continuava VERDE — a poda tinha comido
 * o `.gitkeep`, mas `gerados` ainda aparecia como entrada, e a regra nunca via a ausência. Git, num
 * clone de verdade, não materializa diretório sem arquivo rastreado dentro — é essa ausência que
 * precisa ser reproduzida, não só a do arquivo.
 */
function podarNaoRastreado(pasta, raizProjeto, rastreados) {
  if (!existsSync(pasta)) return;
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      podarNaoRastreado(caminho, raizProjeto, rastreados);
      continue;
    }
    if (!rastreados.has(caminhoNoFormatoGit(caminho, raizProjeto))) rmSync(caminho, { force: true });
  }
  if (readdirSync(pasta).length === 0) rmSync(pasta, { recursive: true, force: true });
}

/**
 * `git init` + `git add -A` + `git ls-files`, e então poda `modulos/` do que não ficou rastreado —
 * a simulação mínima de "sobreviveu a um clone" (M.1, plan-2.md). Cada comando git que falhar
 * devolve o resultado dele mesmo, sem seguir adiante — é o `classificarPasso` de quem chamou que
 * decide se aquilo é falha (e decide que sim: `error`/`status` não-zero nunca vira `ok`).
 */
function simularClone(destino) {
  const init = rodarGit(['init', '-q'], destino);
  if (classificarPasso(init).ok !== true) return init;

  const add = rodarGit(['add', '-A'], destino);
  if (classificarPasso(add).ok !== true) return add;

  const lsFiles = rodarGit(['ls-files'], destino);
  if (classificarPasso(lsFiles).ok !== true) return lsFiles;

  const rastreados = new Set(lsFiles.stdout.split(/\r?\n/).filter((linha) => linha !== ''));
  podarNaoRastreado(join(destino, 'modulos'), destino, rastreados);

  return { error: null, status: 0, stdout: '', stderr: '' };
}

/** Despacha UM passo para a execução real. Único ponto que sabe mapear `tipo` -> processo. */
function executarPasso(passo, ctx) {
  switch (passo.tipo) {
    case 'gerar-projeto':
      return rodarNode([CRIAR_PROJETO, ctx.destino, '--binding', ctx.binding], RAIZ_TEMPLATE);
    case 'npm-install':
      return rodarNpm(['install', '--prefer-offline', '--no-audit', '--no-fund'], ctx.destino);
    case 'criar-modulo':
      return rodarNode([CRIAR_MODULO, ID_MODULO_SONDA, '--binding', ctx.binding], ctx.destino);
    case 'clone-simulado':
      return simularClone(ctx.destino);
    case 'npm-script':
      return rodarNpm(['run', passo.script], ctx.destino);
    case 'venv':
      return rodarPython(ctx.pythonBase, ['-m', 'venv', ctx.venvDir], ctx.destino);
    case 'pip-install':
      return rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['-m', 'pip', 'install', '-e', '.[dev]'], ctx.destino);
    case 'verificar-py':
      return rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['verificar.py'], ctx.destino, { SARAK_NODE: NODE });
    default:
      throw new Error(`passo desconhecido: ${passo.tipo}`);
  }
}

/**
 * Roda a cadeia inteira de UM binding numa pasta temporária própria. Para no primeiro passo que
 * falhar (`primeiroFalho`). A pasta é sempre removida no `finally` — a MENOS que `--manter` peça
 * para preservar (uso: depurar um binding específico sem recriar o projeto do zero).
 */
function executarBinding(binding, { manter }) {
  const destino = mkdtempSync(join(tmpdir(), `sarak-autoteste-template-${binding}-`));
  const ctx = { binding, destino, pythonBase: null, venvDir: join(destino, '.venv') };
  const passos = passosDoBinding(binding);
  const executados = [];

  try {
    if (binding === 'python') ctx.pythonBase = resolverPythonBase();

    for (const passo of passos) {
      if (binding === 'python' && passo.tipo === 'venv' && ctx.pythonBase === null) {
        executados.push({ passo, classificado: { ok: false, motivo: 'nenhum interpretador python resolvido (SARAK_PYTHON/python/python3)' }, saida: null });
        break;
      }
      const resultado = executarPasso(passo, ctx);
      const classificado = classificarPasso(resultado);
      executados.push({ passo, classificado, saida: resultado });
      if (!classificado.ok) break;
    }

    return { binding, ok: primeiroFalho(executados.map((e) => e.classificado)) === null, executados };
  } finally {
    if (!manter) {
      try {
        rmSync(destino, { recursive: true, force: true });
      } catch (causa) {
        process.stderr.write(`aviso: falha ao limpar ${destino}: ${causa.message} (nao afeta o resultado)\n`);
      }
    }
  }
}

// ================================================================================================
// SAÍDA
// ================================================================================================

function imprimirBinding(resultado) {
  process.stdout.write(`\nbinding ${resultado.binding}:\n`);
  for (const { passo, classificado } of resultado.executados) {
    process.stdout.write(`  ${classificado.ok ? 'ok   ' : 'FALHA'} ${passo.nome}\n`);
    if (!classificado.ok) {
      process.stdout.write(`       ${classificado.motivo}\n`);
      const saida = resultado.executados.find((e) => e.passo === passo).saida;
      const texto = [saida?.stdout, saida?.stderr].filter(Boolean).join('\n').trim();
      if (texto !== '') {
        for (const linha of texto.split('\n')) process.stdout.write(`       | ${linha}\n`);
      }
    }
  }
  const total = resultado.executados.length;
  const okCount = resultado.executados.filter((e) => e.classificado.ok).length;
  process.stdout.write(`  binding ${resultado.binding}: ${resultado.ok ? 'VERDE' : 'VERMELHO'} (${okCount}/${total} passos rodados chegaram a ok)\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

function lerOpcoes(argv) {
  const indiceBinding = argv.indexOf('--binding');
  return {
    binding: indiceBinding === -1 ? null : argv[indiceBinding + 1],
    manter: argv.includes('--manter'),
    autoteste: argv.includes('--autoteste'),
    rapido: argv.includes('--rapido'),
  };
}

/**
 * `--rapido`: só os bindings Node (typescript, javascript) — medido em K.1, o binding python sozinho
 * leva ~2m40s (venv + pip install do zero), acima do teto de ~2min que a plan-2.md (K.1) fixa para
 * caber em pre-commit. Uso pretendido: pre-commit da base roda `--rapido`; a agenda (workflow) roda
 * sem essa flag, cobrindo os três — é o consumidor que paga o custo do Python.
 */
function bindingsAlvo(opcoes) {
  if (opcoes.binding !== null) return [opcoes.binding];
  if (opcoes.rapido) return BINDINGS.filter((b) => b !== 'python');
  return BINDINGS;
}

function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  if (opcoes.autoteste) return rodarAutoteste();

  if (opcoes.binding !== null && !BINDINGS.includes(opcoes.binding)) {
    process.stderr.write(`erro: binding "${opcoes.binding}" invalido — use ${BINDINGS.join(', ')}\n`);
    return 1;
  }

  const alvo = bindingsAlvo(opcoes);
  const pulados = BINDINGS.filter((b) => !alvo.includes(b));
  if (pulados.length > 0) {
    process.stdout.write(`aviso: pulando ${pulados.join(', ')} (${opcoes.binding !== null ? '--binding' : '--rapido'}) — NAO foram medidos nesta rodada.\n`);
  }

  const resultados = alvo.map((binding) => executarBinding(binding, { manter: opcoes.manter }));
  for (const resultado of resultados) imprimirBinding(resultado);

  const falhos = resultados.filter((r) => !r.ok);
  process.stdout.write(`\nautoteste-template: ${resultados.length - falhos.length}/${resultados.length} bindings verdes\n`);
  if (falhos.length > 0) {
    process.stdout.write(`REPROVADO: ${falhos.map((r) => r.binding).join(', ')}\n`);
  }
  return falhos.length > 0 ? 1 : 0;
}

// ================================================================================================
// AUTOTESTE — o núcleo puro contra casos em memória. Rápido, sem processo, sem disco.
// ================================================================================================

function casosDeAutoteste() {
  return [
    { nome: 'passosDoBinding(typescript): termina em build, depois lint (furo do L.2)', fn: () => {
      const nomes = passosDoBinding('typescript').map((p) => p.nome);
      return nomes.at(-2) === 'build' && nomes.at(-1) === 'lint';
    } },
    { nome: 'passosDoBinding(javascript): mesma forma do typescript', fn: () => {
      const nomes = passosDoBinding('javascript').map((p) => p.nome);
      return nomes.at(-2) === 'build' && nomes.at(-1) === 'lint';
    } },
    { nome: 'passosDoBinding(python): sem build/lint separado (sem web/ nos modulos python)', fn: () => {
      const nomes = passosDoBinding('python').map((p) => p.nome);
      return !nomes.includes('build') && !nomes.includes('lint') && nomes.at(-1) === 'verificar';
    } },
    { nome: 'passosDoBinding(python): venv e instalar ANTES de criar-modulo', fn: () => {
      const nomes = passosDoBinding('python').map((p) => p.nome);
      return nomes.indexOf('venv') < nomes.indexOf('criar-modulo') && nomes.indexOf('instalar') < nomes.indexOf('criar-modulo');
    } },
    { nome: 'passosDoBinding: clone-simulado entre criar-modulo e verificar, nos tres bindings (M.1)', fn: () => (
      BINDINGS.every((binding) => {
        const nomes = passosDoBinding(binding).map((p) => p.nome);
        const iClone = nomes.indexOf('clone-simulado');
        return iClone !== -1 && iClone === nomes.indexOf('criar-modulo') + 1 && iClone === nomes.indexOf('verificar') - 1;
      })
    ) },
    { nome: 'classificarPasso: status 0 e sem error -> ok', fn: () => classificarPasso({ error: undefined, status: 0 }).ok === true },
    { nome: 'classificarPasso: error definido -> nao ok, mesmo com status 0', fn: () => classificarPasso({ error: new Error('ENOENT'), status: 0 }).ok === false },
    { nome: 'classificarPasso: status null (matado por sinal) -> nao ok', fn: () => classificarPasso({ error: undefined, status: null }).ok === false },
    { nome: 'classificarPasso: status !== 0 -> nao ok', fn: () => classificarPasso({ error: undefined, status: 1 }).ok === false },
    { nome: 'classificarPasso: resultado ausente (nao rodou) -> nao ok, nunca ok por omissao', fn: () => classificarPasso(undefined).ok === false },
    { nome: 'primeiroFalho: lista toda ok -> null', fn: () => primeiroFalho([{ ok: true }, { ok: true }]) === null },
    { nome: 'primeiroFalho: para no PRIMEIRO que falha, ignora os depois', fn: () => {
      const r = primeiroFalho([{ ok: true }, { ok: false, motivo: 'x' }, { ok: false, motivo: 'y' }]);
      return r !== null && r.motivo === 'x';
    } },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  for (const caso of casosDeAutoteste()) {
    let ok;
    try {
      ok = caso.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  const total = casosDeAutoteste().length;
  process.stdout.write(`\nautoteste (nucleo puro): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
