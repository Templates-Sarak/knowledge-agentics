#!/usr/bin/env node
/**
 * verify-commit.mjs — a lógica por trás dos hooks de git do template.
 * Lei dona: nenhuma — ferramenta, como `affected.mjs` e `sync-env.mjs`: não é regra de gate,
 * não tem id, não conta para as regras com caso do catálogo.
 *
 *   node tools/verify-commit.mjs pre-commit   camada de SEGUNDOS (03-operacao.md §7):
 *                                                       gate nos módulos AFETADOS pelo staged + env +
 *                                                       formato + lint
 *   node tools/verify-commit.mjs pre-push     camada de DEZENAS DE SEGUNDOS: tipos e testes
 *                                                       dos módulos afetados desde o upstream
 *   node tools/verify-commit.mjs --selftest  a prova por máquina deste arquivo (§ZERO SHELL)
 *
 * ============================================================================================
 * UMA IMPLEMENTAÇÃO PARA OS TRÊS BINDINGS, DE PROPÓSITO.
 *
 * `.githooks/pre-commit` e `.githooks/pre-push` são o MESMO arquivo, byte a byte, nos três bindings
 * — prova em `gate/tests/cases.mjs`. Cada um só delega para cá com duas linhas de shell. Detectar o
 * binding (package.json × pyproject.toml) e decidir os comandos é trabalho DESTE script, não do
 * hook: a alternativa — três pares de hook com lógica própria — tem um custo medido que a descarta
 * (seis arquivos que precisam concordar, nada verificando que concordam). Aqui há uma
 * fonte só, e os hooks não podem divergir porque não carregam lógica nenhuma para divergir.
 * ============================================================================================
 *
 * ZERO SHELL, DE PROPÓSITO — a tentação óbvia é `spawnSync(comando, args, { shell: true })`, porque
 * sem shell `npm` no Windows dá `ENOENT` (resolve para `.cmd`, que `spawnSync` sem shell não
 * encontra). Mas `shell: true` concatena `args` numa STRING ÚNICA sem citação, e o id do módulo —
 * nome de PASTA, vindo de `readdirSync` via `listModules`, nunca validado antes de virar
 * argumento — entraria ali inteiro. Uma pasta `modules/x&echo INJECTED/` bastaria para rodar `echo
 * INJETADO` como comando separado, E o resultado ainda sairia "ok" — porque com shell o `status` é
 * do ÚLTIMO comando da cadeia (`echo`, que sempre sai 0), não do `validate.mjs` que já teria
 * falhado. Ferramenta ausente/comando errado virando "ok" quebraria a lei 7 do gate por dentro do
 * hook que existe para cobri-la.
 *
 * O conserto: NUNCA shell. `npm`/`npx`/`tsc` são scripts Node — resolvidos pelo campo `bin` do
 * `package.json` deles e rodados com `process.execPath` direto no arquivo `.js`, sem passar pelo shim
 * `.cmd`/`.sh` nenhuma vez (a mesma técnica de `hooks/padrao-limiares.js:entrypointDoProjeto` — não
 * importada de lá porque `hooks/` é do agente Claude Code e nunca viaja para o projeto gerado; o
 * raciocínio é o mesmo, a cópia é porque a fonte não pode ser dependência de `tools/`).
 * `ruff`/`mypy`/`pytest` não são scripts Node — rodam via `<python> -m <ferramenta>`, a MESMA forma
 * que `verify.py` já usa pelo motivo que ele já documenta (`_resolver`: "ferramenta Python roda
 * pelo interpretador ATUAL, nunca pelo PATH — `shutil.which` não enxerga um venv não ativado"). Medi
 * a alternativa (achar `ruff.exe`/`mypy.exe`/`pytest.exe` em `Scripts/`) e descartei: exigiria saber
 * ONDE fica o venv, que este script não tem como inferir sem inventar convenção nova; `-m` funciona
 * com qualquer interpretador já resolvido, do mesmo jeito nos dois SO. Em nenhum dos dois casos um
 * argumento de usuário (id de módulo, caminho) passa por um interpretador de shell — nunca há `&`,
 * `;`, `|` para interpretar, porque não há shell nenhum lendo a linha de comando.
 *
 * STAGED × WORKING TREE — decisão tomada e declarada aqui, não escondida.
 *
 * `pre-commit` decide O QUE verificar a partir do staged (`git diff --cached --name-only`), mas o
 * GATE em si (`validate.mjs`) lê a ÁRVORE DE TRABALHO, não o índice. Um arquivo com alteração
 * NÃO-staged no meio do caminho pode fazer o veredito não ser exatamente sobre o que será commitado.
 * A forma rigorosa — índice temporário (`git stash --keep-index`) ou checkout do blob staged para
 * uma pasta paralela — é lenta e arriscada para um hook de SEGUNDOS, e arriscar corromper o working
 * tree do autor por um hook é pior que o limite que ele evita. A escolha pragmática: verificar a
 * árvore, e declarar o limite aqui e em `tools/gate/README.md` — nunca escondê-lo. Quem precisa
 * do veredito exato sobre o staged sozinho roda `git stash -k -u` manualmente antes de verificar.
 *
 * `--no-verify` FURA este hook, por desenho do próprio git — não há como um hook impedir isso. É o
 * limite declarado: quem cobra SEM esse furo é o CI, nunca o hook local (03-operacao.md §7, mesma
 * frase de `hooks/README.md` na base: "Quem protege o repositório independente de quem edita é o CI").
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { findProjectRoot, listModules } from './gate/context.mjs';
import { computeAffected, buildGraph, normalizePath } from './affected.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = findProjectRoot(HERE);
/** O MESMO Node que roda este script — nunca a string `'node'` resolvida de novo por PATH. */
const NODE = process.execPath;

function writeOut(text) {
  process.stdout.write(text);
}

/** Comando de git que não pode derrubar o hook por si só — falha vira lista vazia, nunca exceção. */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
}

function lines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() !== '');
}

function stagedPaths() {
  return lines(git(['diff', '--cached', '--name-only']));
}

/** `null` quando não há upstream (primeiro push do branch) — o chamador então verifica TUDO. */
function upstreamRef() {
  try {
    execFileSync('git', ['rev-parse', '--abbrev-ref', '@{u}'], { cwd: ROOT, encoding: 'utf8' });
    return '@{u}';
  } catch {
    return null;
  }
}

function computeAffectedOf(rawPaths) {
  const graph = buildGraph(ROOT);
  const normalized = rawPaths.map((raw) => normalizePath(raw, ROOT));
  return computeAffected(graph, normalized);
}

/** Binding do projeto pelo manifesto de pacote presente na raiz — a mesma pergunta de `verify.py`. */
function binding() {
  if (existsSync(join(ROOT, 'package.json'))) return 'node';
  if (existsSync(join(ROOT, 'pyproject.toml'))) return 'python';
  return null;
}

// ================================================================================================
// EXECUÇÃO — o único ponto que toca `spawnSync`, sempre sem shell. `--selftest` exercita ESTE ponto
// (não uma cópia), então uma regressão para `shell: true` aqui derruba produção E o autoteste juntos.
// ================================================================================================

function execute(executable, args, extraOptions = {}) {
  return spawnSync(executable, args, { cwd: ROOT, stdio: 'inherit', shell: false, ...extraOptions });
}

/**
 * PURA: decide se um resultado de `spawnSync` conta como "ok". Separada de `executar`/`rodar` para o
 * `--selftest` provar as três formas de "não rodou" com fixtures sintéticas — sem matar processo de
 * verdade nem depender de SO (o mesmo raciocínio de `affected.mjs`: metade que toca processo, metade
 * pura que o autoteste alcança sem I/O). Lei 7 do gate: ferramenta ausente REPROVA, nunca "ok".
 */
function evaluateResult(result) {
  if (result.error !== undefined) {
    return { ok: false, reason: `tool is missing or not executable — ${result.error.code ?? result.error.message}` };
  }
  if (result.status === null) {
    return { ok: false, reason: `process terminated by signal ${result.signal ?? '?'} — it did not finish` };
  }
  return { ok: result.status === 0, reason: result.status === 0 ? null : `exited with code ${result.status}` };
}

function report(label, ok, reason) {
  if (!ok && reason !== null) writeOut(`  ! ${label}: ${reason}\n`);
  writeOut(`${ok ? '  ok   ' : '  FAIL'} ${label}\n`);
  return ok;
}

/** Roda um passo já resolvido para um executável real (nunca um nome que precise de PATH+shell). */
function run(label, executable, args, cwd = ROOT) {
  const { ok, reason } = evaluateResult(execute(executable, args, { cwd }));
  return report(label, ok, reason);
}

function missingTool(label, missing) {
  return report(label, false, `tool is missing — ${missing}`);
}

// ================================================================================================
// RESOLUÇÃO DE FERRAMENTA — sempre um ARQUIVO/EXECUTÁVEL real, nunca uma string que dependa de PATH
// resolvido por shell. Ver o cabeçalho do arquivo para o porquê.
// ================================================================================================

/**
 * O entrypoint JS de um pacote instalado em `<raizNode>/node_modules/<pastaPacote>`, pelo campo `bin`
 * do manifesto dele. Técnica de `hooks/padrao-limiares.js:entrypointDoProjeto` (comentário no topo do
 * arquivo explica por que a função é copiada, não importada). `chaveBin` existe porque `bin` é um MAPA
 * por comando, e a chave pode divergir do nome da pasta (`typescript` publica o comando `tsc`).
 */
function packageEntrypoint(nodeRoot, packageDir, binKey = packageDir) {
  const dir = join(nodeRoot, 'node_modules', packageDir);
  try {
    const { bin } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const relPath = typeof bin === 'string' ? bin : bin?.[binKey];
    if (!relPath) return null;
    const target = join(dir, relPath);
    return existsSync(target) ? target : null;
  } catch {
    return null;
  }
}

/**
 * `npm`/`npx` não são dependência do PROJETO — vêm empacotados ao lado do próprio binário `node`.
 * Dois layouts candidatos: Windows (irmão do `node.exe`) e POSIX (`lib/node_modules`, um nível acima
 * do `bin/`). O primeiro que existir vence; nenhum shell nem `.cmd` envolvido.
 */
function npmEntrypoint(pkg) {
  const nodeRoot = dirname(NODE);
  for (const candidate of [nodeRoot, join(nodeRoot, '..', 'lib')]) {
    const finding = packageEntrypoint(candidate, pkg);
    if (finding !== null) return finding;
  }
  return null;
}

function runNpm(label, args, cwd = ROOT) {
  const entry = npmEntrypoint('npm');
  if (entry === null) return missingTool(label, 'npm (Node.js bundled node_modules/npm — corrupted installation?)');
  return run(label, NODE, [entry, ...args], cwd);
}

function runTsc(label, args, cwd = ROOT) {
  const entry = packageEntrypoint(ROOT, 'typescript', 'tsc');
  if (entry === null) return missingTool(label, 'typescript (node_modules/typescript is missing — run "npm install"?)');
  return run(label, NODE, [entry, ...args], cwd);
}

/**
 * O interpretador Python, memoizado por processo. `SARAK_PYTHON` sobrepõe (mesmo vocabulário de
 * `SARAK_NODE` em `verify.py`); senão tenta `python` e `python3`, na ordem — sem shell, então um
 * nome que não exista devolve `ENOENT`/status≠0 aqui, nunca dispara um resolvedor de PATH de shell.
 */
let resolvedPython;
function resolvePython() {
  if (resolvedPython !== undefined) return resolvedPython;
  const candidates = [process.env.SARAK_PYTHON, 'python', 'python3'].filter((c) => Boolean(c));
  resolvedPython = candidates.find((c) => execute(c, ['--version'], { stdio: 'ignore' }).status === 0) ?? null;
  return resolvedPython;
}

function runPython(label, module, args, cwd = ROOT) {
  const python = resolvePython();
  if (python === null) return missingTool(label, 'python (neither "python" nor "python3" is on PATH; or set SARAK_PYTHON)');
  return run(label, python, ['-m', module, ...args], cwd);
}

// ================================================================================================
// OS PASSOS
// ================================================================================================

function firstModuleId() {
  const dirs = listModules(ROOT);
  return dirs.length > 0 ? basename(dirs[0]) : null;
}

function moduleIds() {
  return listModules(ROOT).map((dir) => basename(dir));
}

/**
 * O gate propriamente dito, escopado pelo resultado de `affected.mjs`.
 *
 * `(all)` roda tudo e IMPRIME O MOTIVO — hook que fica lento em silêncio é hook que o time desativa
 * sem saber por quê. `(root)` sem módulo nenhum ainda precisa cobrar as regras de escopo raiz: elas
 * rodam em QUALQUER invocação de `validate.mjs` com ao menos um módulo no projeto
 * (`engine.mjs:runRootRules` usa `contextos[0].projeto`, não o alvo pedido) — por isso basta
 * passar UM módulo qualquer como referência, não `--all`.
 */
function runGate(result) {
  const validate = join('tools', 'gate', 'validate.mjs');
  if (result.all) {
    writeOut(`  (all) — ${result.reason}\n`);
    return run('gate (--all)', NODE, [validate, '--all']);
  }

  const targets = [...result.modules];
  if (targets.length === 0 && result.root) {
    const reference = firstModuleId();
    if (reference !== null) targets.push(reference);
    else writeOut('  (root) — project has no modules yet; root rules remain pending until the first module\n');
  }
  if (targets.length === 0) {
    writeOut('  gate: no module or root checks are affected in this area\n');
    return true;
  }

  writeOut(`  affected module(s): ${targets.join(', ')}${result.root ? ' + (root)' : ''}\n`);
  return targets.every((id) => run(`gate: ${id}`, NODE, [validate, id]));
}

function formatAndLint() {
  const bind = binding();
  if (bind === 'node') {
    return [
      () => runNpm('format (prettier --check)', ['run', 'format']),
      () => runNpm('lint (eslint)', ['run', 'lint']),
    ];
  }
  if (bind === 'python') {
    return [
      () => runPython('format (ruff format --check)', 'ruff', ['format', '--check', '.']),
      () => runPython('thresholds (ruff check)', 'ruff', ['check', '.']),
    ];
  }
  return [() => { writeOut('  ! no root package.json or pyproject.toml — format/lint skipped\n'); return true; }];
}

function preCommit() {
  const result = computeAffectedOf(stagedPaths());
  writeOut('[pre-commit] gate for affected modules\n');
  const steps = [() => runGate(result), () => runEnvSync(), () => runPortSchemas()];
  steps.push(...formatAndLint());
  return conclude(steps);
}

/** `sync-env.mjs` é sempre Node, nos dois bindings — não passa por `formatAndLint`. */
function runEnvSync() {
  return run('environment (.env.example)', NODE, [join('tools', 'sync-env.mjs'), '--check']);
}

/** `generate-port-schemas.mjs` é sempre Node, nos dois bindings — mesma forma de `runEnvSync`,
 * não passa por `formatAndLint`. */
function runPortSchemas() {
  return run('port schemas', NODE, [join('tools', 'generate-port-schemas.mjs'), '--check']);
}

/** Tipos e testes de UM módulo Node, escopados pelo workspace — nunca o repositório inteiro. */
function nodeModuleTypesAndTests(id) {
  const target = `--workspace=modules/${id}`;
  return [
    () => runNpm(`types: ${id}`, ['run', 'typecheck', target, '--if-present']),
    () => runNpm(`tests: ${id}`, ['test', target, '--if-present']),
  ];
}

/** Tipos e testes de UM módulo Python — de dentro da pasta dele, a mesma condição de `verify.py`. */
function pythonModuleTypesAndTests(id) {
  const dir = join(ROOT, 'modules', id);
  return [
    () => runPython(`types: ${id}`, 'mypy', ['.'], dir),
    () => runPython(`tests: ${id}`, 'pytest', ['-q'], dir),
  ];
}

function prePush() {
  const ref = upstreamRef();
  const result = ref === null
    ? { all: true, reason: 'no upstream (@{u}) — first push of this branch; checking all modules' }
    : computeAffectedOf(lines(git(['diff', '--name-only', '--no-renames', ref])));

  writeOut('[pre-push] types and tests for affected modules\n');
  const bind = binding();
  if (bind === null) {
    writeOut('  ! no root package.json or pyproject.toml — types/tests skipped\n');
    return conclude([]);
  }

  // `_template` fica de fora: não é workspace npm ("workspaces": ["modules/[a-z]*", ...] — o
  // padrão já exclui o molde DE PROPÓSITO, package.json:"//workspaces" explica o motivo), então
  // `npm run typecheck --workspace=modules/_template` sempre falha com "No workspaces found", mesmo
  // sem nada errado no molde. `create-module.mjs`/`create-project.mjs` já tratam `_template` como não
  // sendo um pacote publicável pelo mesmo motivo — aqui é a mesma exclusão, não uma nova regra.
  const withoutTemplate = (id) => !id.startsWith('_');
  const targets = (result.all ? moduleIds() : [...result.modules]).filter(withoutTemplate);
  const coversRoot = result.all || result.root;
  if (result.all) writeOut(`  (all) — ${result.reason}\n`);
  else writeOut(`  affected module(s): ${targets.join(', ') || '(none)'}${coversRoot ? ' + (root)' : ''}\n`);

  const steps = [];
  if (coversRoot) {
    steps.push(bind === 'node'
      ? () => runTsc('types: root', ['--noEmit'])
      : () => runPython('types: root', 'mypy', ['.']));
  }
  for (const id of targets) {
    steps.push(...(bind === 'node' ? nodeModuleTypesAndTests(id) : pythonModuleTypesAndTests(id)));
  }
  if (steps.length === 0) writeOut('  no module or root checks are affected in this area\n');
  return conclude(steps);
}

function conclude(steps) {
  const results = steps.map((step) => step());
  const failures = results.filter((ok) => !ok).length;
  writeOut(`\nverify-commit: ${failures === 0 ? 'OK' : `FAILED — ${failures} step(s)`}\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — a prova por máquina de que NENHUM argumento passa por shell (lei 6: sem prova, não
// entra). Não spawna o gate nem toca em módulo real: prova o PONTO ÚNICO (`executar`/`evaluateResult`)
// que produção usa, o mesmo raciocínio de `affected.mjs --selftest` para a metade pura dele.
// ================================================================================================

/** Fixtures sintéticas de `spawnSync` — nenhuma toca processo de verdade. Prova as 3 formas de "não rodou". */
function evaluateResultCases() {
  return [
    { name: 'status 0 is successful', result: { status: 0, error: undefined, signal: null }, expected: true },
    { name: 'nonzero status fails', result: { status: 1, error: undefined, signal: null }, expected: false },
    { name: 'spawn error (ENOENT) fails, never "ok"', result: { status: null, error: { code: 'ENOENT' }, signal: null }, expected: false },
    { name: 'null status without error (killed by signal) fails', result: { status: null, error: undefined, signal: 'SIGKILL' }, expected: false },
  ];
}

/**
 * O alvo hostil do relatório de segurança: nome de PASTA com `&` — o separador de comando que
 * `shell: true` respeitava. Roda pelo MESMO `executar()` de produção, capturando stdio (produção usa
 * `inherit`) só para o autoteste conseguir inspecionar o que o processo filho recebeu.
 *
 * O discriminador é IGUALDADE EXATA, não "contém INJETADO" — "INJETADO" é substring do PRÓPRIO
 * payload hostil (`echo INJETADO`), então ele aparece na saída também no caso SEGURO, onde o processo
 * filho ecoa `process.argv[1]` literal. O que muda com `shell: true` é a IGUALDADE: o `&` vira
 * separador de comando, o `node -e` recebe só `"x"` como argumento, e `echo INJETADO` roda como
 * comando SEPARADO — a saída deixa de ser exatamente o payload original. Medido: revertendo `shell:
 * false` para `true` em `executar()`, este caso passa a FALHAR (ver relatório da correção).
 */
function hostileTargetCase() {
  const hostile = 'x&echo INJECTED';
  const result = execute(NODE, ['-e', 'process.stdout.write(process.argv[1] ?? "")', hostile], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return String(result.stdout ?? '') === hostile;
}

/** O caso sem má-fé nenhuma: nome de módulo com espaço não pode virar dois argumentos. */
function nameCaseWithSpace() {
  const name = 'my module';
  const result = execute(NODE, ['-e', 'process.stdout.write(process.argv[1] ?? "")', name], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return String(result.stdout ?? '') === name;
}

function runSelfTest() {
  let failures = 0;
  const register = (name, ok) => {
    writeOut(`  ${ok ? 'ok   ' : 'FAIL'} ${name}\n`);
    if (!ok) failures += 1;
  };

  for (const testCase of evaluateResultCases()) {
    register(testCase.name, evaluateResult(testCase.result).ok === testCase.expected);
  }
  register('hostile target ("x&echo INJECTED"): passed literally, no injection, no shell', hostileTargetCase());
  register('name with a space ("my module"): passed as ONE argument', nameCaseWithSpace());

  const total = evaluateResultCases().length + 2;
  writeOut(`\nself-test: ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function main() {
  const mode = process.argv[2];
  if (mode === '--selftest') return runSelfTest();
  if (mode === 'pre-commit') return preCommit();
  if (mode === 'pre-push') return prePush();
  process.stderr.write('Usage: node tools/verify-commit.mjs pre-commit | pre-push | --selftest\n');
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
