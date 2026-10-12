#!/usr/bin/env node
/**
 * package.mjs — compila o backend TS (tsc), constroi o front onde existe (`web/`, vite), e
 * opcionalmente empacota um artefato AUTOSSUFICIENTE (sem a arvore de fonte) num diretorio novo.
 * Lei dona: specs/arquitetura/03-operacao.md §9 (build por binding).
 *
 *   node tools/package.mjs                compila backend + front, em arvore (npm run build)
 *   node tools/package.mjs --backend-only [<destino>] compila backend sem construir o front
 *   node tools/package.mjs <destino>       idem, MAIS empacota o artefato backend em <destino>
 *   node tools/package.mjs --selftest     prova interna (mergeDependencies)
 *
 * SO TYPESCRIPT EMITE. Um module/root sem `tsconfig.build.json` e pulado em silencio informativo —
 * JavaScript ja E o artefato (o fonte roda direto), Python roda o fonte por natureza (specs/arquitetura/
 * 03-operacao.md §9). Nao ha "build vazio" aqui: o que nao emite, o script DIZ que nao emite, e
 * segue — nunca finge um passo que nao faz nada (lei 10 do catalogo, mesma raiz do defeito).
 *
 * O ARTEFATO, por binding: TypeScript empacota o `dist/` emitido; JavaScript copia o que o processo
 * le em runtime (`src/` da raiz de composicao, `adapters/`, `packages/` e, por modulo, `module.json`,
 * `config/`, `api/`, `core/`) — o fonte E o artefato. Python NAO tem passo de empacotamento
 * (03-operacao.md §9.1): este script recusa o binding Python com mensagem, nunca finge empacotar.
 *
 * DEPENDENCIA DE ADAPTER VIAJA COM O ADAPTER E SO ENTRA SE ELE E ESCOLHIDO: `adapters/<provedor>/
 * package.json` declara o driver (`pg`), e o artefato so o carrega se algum modulo escolhe aquele
 * provedor em `config/ports.json`. Projeto que fica em `memory` nao paga o driver.
 *
 * LOCKFILE: o artefato sai com `package-lock.json` gerado do lock da RAIZ
 * (`npm install --package-lock-only`, que reaproveita as versoes ja travadas) — a instalacao de
 * producao (`npm ci --omit=dev`) fica reprodutivel, inclusive nas dependencias transitivas.
 *
 * ZERO SHELL, mesma tecnica de `verify-commit.mjs` (ver o cabecalho de la para o porque —
 * `shell: true` concatena args numa string sem citacao, e um id de modulo vindo de pasta vira
 * injecao). `tsc`/`vite` sao resolvidos pelo campo `bin` do `package.json` deles e rodados com
 * `process.execPath` direto no `.js`, sem passar pelo shim `.cmd`/`.sh` nenhuma vez. Copiada aqui,
 * nao importada: `packageEntrypoint` já existe em `verify-commit.mjs`, mas essa ferramenta está
 * fora do escopo deste bloco (aprovada, não se reabre) — duas cópias pequenas divergem menos do
 * que uma dependência entre ferramentas que não precisavam se conhecer.
 *
 * ATIVOS COPIADOS POR CONVENCAO, NUNCA POR LISTA DE NOMES — e o que faz a lista nao envelhecer:
 *   - `module.json`: o UNICO nome fixo, porque e o manifesto canonico (um por modulo, sempre).
 *   - `config/*.json`: TODO arquivo `.json` sob `config/` do modulo, mecanicamente — uma chave nova
 *     amanha entra sozinha, sem tocar este arquivo (medido contra o runtime: config.ts:128-141 le
 *     exatamente os `.json` de `config/`, nunca por nome fora dali).
 *   - `dist/`: o que `tsc` emitiu — a lista de ARQUIVOS .ts vira lista de ATIVOS de graca, porque e
 *     o tsconfig.build.json (include) que decide o que compila, nao este script.
 *   - `contract/openapi.yaml`, `core/templates/*.html`, `database/**`: medido (grep no runtime nao-
 *     teste) que NADA disso e lido pelo processo — ficam de fora, de proposito, para o artefato nao
 *     inchar com o que ninguem le rodando.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

function findProjectRoot(start) {
  let current = start;
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(HERE, '..');
}

/** Le removendo o BOM: editor e shell do Windows gravam por padrao, e `JSON.parse` rejeita. */
function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

function readJsonIfExists(path) {
  return existsSync(path) ? JSON.parse(readText(path)) : null;
}

/**
 * O entrypoint JS de um pacote instalado em `<raizNode>/node_modules/<pastaPacote>`, pelo campo
 * `bin` do manifesto dele. Mesma tecnica de `hooks/padrao-limiares.js:entrypointDoProjeto` e de
 * `verify-commit.mjs:packageEntrypoint` — nao importada de nenhum dos dois (ver cabecalho).
 */
function packageEntrypoint(nodeRoot, packageDir, binKey = packageDir) {
  const dir = join(nodeRoot, 'node_modules', packageDir);
  try {
    const { bin } = JSON.parse(readText(join(dir, 'package.json')));
    const relPath = typeof bin === 'string' ? bin : bin?.[binKey];
    if (!relPath) return null;
    const target = join(dir, relPath);
    return existsSync(target) ? target : null;
  } catch {
    return null;
  }
}

/** O entrypoint JS do `npm`, ao lado do `node` atual — nunca pelo `PATH` (mesma tecnica de `create-module.mjs`). */
function npmEntrypoint() {
  const nodeRoot = dirname(NODE);
  for (const candidate of [nodeRoot, join(nodeRoot, '..', 'lib')]) {
    const target = packageEntrypoint(candidate, 'npm');
    if (target !== null) return target;
  }
  return null;
}

function run(label, executable, args, cwd) {
  process.stdout.write(`  Building: ${label}\n`);
  execFileSync(executable, args, { cwd, stdio: 'inherit' });
}

function listRealModules(projectRoot) {
  const base = join(projectRoot, 'modules');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => existsSync(join(base, name, 'module.json')))
    .map((name) => join(base, name));
}

function listAdapters(projectRoot) {
  const base = join(projectRoot, 'adapters');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => join(base, name))
    .filter((dir) => existsSync(join(dir, 'package.json')));
}

// ================================================================================================
// COMPILACAO — so quando ha `tsconfig.build.json`. Ausencia NAO e erro: e o binding dizendo "nao
// emito" (JS/Python), e o script informa e segue.
// ================================================================================================

function compileBackendRoot(projectRoot) {
  const configBuild = join(projectRoot, 'tsconfig.build.json');
  if (!existsSync(configBuild)) {
    process.stdout.write('Root backend has no tsconfig.build.json; this binding does not emit (JavaScript is already the artifact; Python runs from source).\n');
    return;
  }
  const tsc = packageEntrypoint(projectRoot, 'typescript', 'tsc');
  if (tsc === null) throw new Error('typescript is missing from node_modules — run "npm install" before compiling');
  run('root backend (tsc -p tsconfig.build.json)', NODE, [tsc, '-p', 'tsconfig.build.json'], projectRoot);
}

function compileModuleBackend(projectRoot, moduleDir) {
  const configBuild = join(moduleDir, 'tsconfig.build.json');
  if (!existsSync(configBuild)) {
    process.stdout.write(`Backend for ${basename(moduleDir)} has no tsconfig.build.json; nothing to emit.\n`);
    return;
  }
  const tsc = packageEntrypoint(projectRoot, 'typescript', 'tsc');
  if (tsc === null) throw new Error('typescript is missing from node_modules — run "npm install" before compiling');
  run(`backend for ${basename(moduleDir)} (tsc -p tsconfig.build.json)`, NODE, [tsc, '-p', 'tsconfig.build.json'], moduleDir);
}

function buildModuleWeb(projectRoot, moduleDir) {
  const configVite = ['vite.config.ts', 'vite.config.js']
    .map((name) => join(moduleDir, 'web', name))
    .find((path) => existsSync(path));
  if (configVite === undefined) {
    process.stdout.write(`Web for ${basename(moduleDir)} has no web/ directory; nothing to build.\n`);
    return;
  }
  const vite = packageEntrypoint(projectRoot, 'vite');
  if (vite === null) throw new Error('vite is missing from node_modules — run "npm install" before building the frontend');
  run(`frontend for ${basename(moduleDir)} (vite build)`, NODE, [vite, 'build', '--config', configVite], moduleDir);
}

// ================================================================================================
// EMPACOTAMENTO — copia SO o que o artefato precisa para um diretorio novo. Ver o cabecalho para a
// convencao (extensao/pasta, nunca lista de nomes).
// ================================================================================================

/** Copia so os `.json` de uma pasta — mecanico, nunca por nome. */
function copyJsonOf(origin, destination) {
  if (!existsSync(origin)) return;
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(origin)) {
    if (name.endsWith('.json')) cpSync(join(origin, name), join(destination, name));
  }
}

function packModule(moduleDir, modulesDestination) {
  const id = basename(moduleDir);
  const destination = join(modulesDestination, id);
  mkdirSync(destination, { recursive: true });
  cpSync(join(moduleDir, 'module.json'), join(destination, 'module.json'));
  copyJsonOf(join(moduleDir, 'config'), join(destination, 'config'));

  const dist = join(moduleDir, 'dist');
  if (existsSync(dist)) {
    // TypeScript: o artefato E o `dist/` compilado — nenhuma fonte `.ts` viaja.
    cpSync(dist, join(destination, 'dist'), { recursive: true });
    return;
  }
  // JavaScript: ja e o proprio artefato — `api/` e `core/` SAO o codigo que roda, sem etapa nenhuma.
  for (const dir of ['api', 'core']) {
    if (existsSync(join(moduleDir, dir))) cpSync(join(moduleDir, dir), join(destination, dir), { recursive: true });
  }
}

/**
 * PURA — mescla `dependencies` de varios `package.json` (raiz, modulos, adapters), MECANICAMENTE:
 * uniao de chaves, a ULTIMA entrada com o mesmo nome vence. Nao envelhece: uma dependencia nova
 * entra sozinha porque a fonte e sempre o campo `dependencies` de quem a declara — nunca uma lista
 * escrita a mao neste arquivo.
 */
export function mergeDependencies(dependencyList) {
  const result = {};
  for (const dependencies of dependencyList) {
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      result[name] = version;
    }
  }
  return result;
}

/** Recusa um destino perigoso ANTES do `rmSync` — nunca apaga a propria raiz nem uma ancestral dela. */
function validateDestination(projectRoot, destination) {
  if (destination === projectRoot || projectRoot.startsWith(destination + sep)) {
    throw new Error(`destination "${destination}" contains the project root — rejected`);
  }
  const segments = destination.split(/[\\/]/).filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`destination "${destination}" looks like a disk root — rejected for safety`);
  }
}

/**
 * PURA — os provedores que ALGUM modulo escolhe: a uniao dos valores string de cada `config/ports.json`.
 * E o que decide quais `adapters/<provedor>/` contribuem com `dependencies` ao artefato (o nome da
 * pasta do adapter e o nome do provedor — a convencao de `create-adapter.mjs`).
 */
export function chosenProviders(portList) {
  const chosen = new Set();
  for (const ports of portList) {
    for (const provider of Object.values(ports ?? {})) {
      if (typeof provider === 'string') chosen.add(provider);
    }
  }
  return chosen;
}

/** PURA — qual forma de artefato o projeto tem: `ts` (dist/ emitido), `js` (fonte e artefato) ou `null`. */
export function artifactShape({ hasDistInRoot, hasCompositionJs }) {
  if (hasDistInRoot) return 'ts';
  if (hasCompositionJs) return 'js';
  return null;
}

/** `adapters/*` com `package.json` cujo nome de pasta (= provedor) algum modulo escolheu. */
function adaptersInUsage(projectRoot, modules) {
  const ports = modules.map((m) => readJsonIfExists(join(m, 'config', 'ports.json')));
  const chosen = chosenProviders(ports);
  return listAdapters(projectRoot).filter((dir) => chosen.has(basename(dir)));
}

/** Copia a arvore de runtime do JS: raiz de composicao, adapters (sem o molde `_*`) e packages. */
function copySourceJs(projectRoot, destination) {
  cpSync(join(projectRoot, 'src'), join(destination, 'src'), { recursive: true });
  cpSync(join(projectRoot, 'packages'), join(destination, 'packages'), { recursive: true });
  cpSync(join(projectRoot, 'adapters'), join(destination, 'adapters'), {
    recursive: true,
    filter: (origin) => !basename(origin).startsWith('_'),
  });
}

/** Copia a raiz do artefato e devolve o comando de `start` dele. */
function copyArtifactRoot(projectRoot, destination) {
  const shape = artifactShape({
    hasDistInRoot: existsSync(join(projectRoot, 'dist')),
    hasCompositionJs: existsSync(join(projectRoot, 'src', 'composition.js')),
  });
  if (shape === null) {
    throw new Error('This binding has no packaging step (Python runs from source and installs with `pip install`'
      + ' — 03-operacao.md §9.1); there is no dist/ or src/composition.js to package');
  }
  if (shape === 'ts') {
    cpSync(join(projectRoot, 'dist'), join(destination, 'dist'), { recursive: true });
    return 'node dist/src/composition.js';
  }
  copySourceJs(projectRoot, destination);
  return 'node src/composition.js';
}

/**
 * `config/runtime.json` da RAIZ — o unico arquivo de `config/` da raiz que o processo le em runtime
 * (o teto do desligamento gracioso; `verification.json`/`compliance.json` sao politica de CI, nao
 * runtime). Nome fixo pelo mesmo motivo de `module.json`: e o contrato da raiz de composicao.
 */
function copyRootRuntimeConfig(projectRoot, destination) {
  const origin = join(projectRoot, 'config', 'runtime.json');
  if (!existsSync(origin)) {
    throw new Error('Root config/runtime.json is missing — the composed process requires it at startup (shutdown timeout)');
  }
  mkdirSync(join(destination, 'config'), { recursive: true });
  cpSync(origin, join(destination, 'config', 'runtime.json'));
}

/**
 * Gera o `package-lock.json` do artefato a partir do lock da raiz: copia-o e deixa o npm podar para o
 * `package.json` novo, reaproveitando as versoes ja travadas. Sem lock na raiz, falha: artefato sem
 * lock nao e reprodutivel.
 */
function generateArtifactLock(projectRoot, destination) {
  const lockRoot = join(projectRoot, 'package-lock.json');
  if (!existsSync(lockRoot)) {
    throw new Error('Root package-lock.json is missing — run "npm install" at the root before packaging (an artifact without a lockfile is not reproducible)');
  }
  cpSync(lockRoot, join(destination, 'package-lock.json'));
  const npm = npmEntrypoint();
  if (npm === null) throw new Error('npm is missing next to the current Node.js executable — the artifact lockfile could not be generated');
  run('artifact lockfile (npm install --package-lock-only)', NODE,
    [npm, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], destination);
}

function packBackend(projectRoot, destination) {
  validateDestination(projectRoot, destination);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  const startCommand = copyArtifactRoot(projectRoot, destination);
  copyRootRuntimeConfig(projectRoot, destination);

  const modules = listRealModules(projectRoot);
  const modulesDestination = join(destination, 'modules');
  for (const moduleDir of modules) packModule(moduleDir, modulesDestination);

  const dependencySources = [
    readJsonIfExists(join(projectRoot, 'package.json'))?.dependencies,
    ...modules.map((m) => readJsonIfExists(join(m, 'package.json'))?.dependencies),
    ...adaptersInUsage(projectRoot, modules).map((a) => readJsonIfExists(join(a, 'package.json'))?.dependencies),
  ];
  const pkg = {
    name: 'artefato-backend',
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { start: startCommand },
    dependencies: mergeDependencies(dependencySources),
  };
  writeFileSync(join(destination, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  generateArtifactLock(projectRoot, destination);

  // `.env.example` DOCUMENTA as chaves; o `.env` REAL nunca e copiado — segredo e por ambiente de
  // implantacao, nao um artefato de build (specs/arquitetura/00-arquitetura.md §5).
  const example = join(projectRoot, '.env.example');
  if (existsSync(example)) cpSync(example, join(destination, '.env.example'));

  process.stdout.write(`\nBackend artifact packaged at ${destination}\n`);
  process.stdout.write('  Next: provide .env values (the file is not copied; secrets are environment-specific) and run "npm ci --omit=dev".\n');
}

// ================================================================================================
// AUTOTESTE — so a decisao PURA (`mergeDependencies`): compilar/empacotar sao I/O de verdade,
// provados pela empacotagem real (relatorio do bloco), nao por fixture em memoria.
// ================================================================================================

function dependenciesMergeCases() {
  return [
    { name: 'empty list', inputs: [], expected: {} },
    { name: 'simple union', inputs: [{ a: '1.0.0' }, { b: '2.0.0' }], expected: { a: '1.0.0', b: '2.0.0' } },
    { name: 'undefined and null entries are ignored', inputs: [undefined, { a: '1.0.0' }, null], expected: { a: '1.0.0' } },
    { name: 'version conflict: the last entry wins', inputs: [{ a: '1.0.0' }, { a: '2.0.0' }], expected: { a: '2.0.0' } },
    {
      name: 'three sources without a conflict',
      inputs: [{ express: '^4.19.2' }, { express: '^4.19.2', react: '^18.3.1' }, { pg: '^8.11.0' }],
      expected: { express: '^4.19.2', react: '^18.3.1', pg: '^8.11.0' },
    },
  ];
}

function providersAndShapeCases() {
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return [
    { name: 'chosenProviders: unions values from several ports.json files', fn: () => equal(
      [...chosenProviders([{ repository: 'postgres', clock: 'system' }, { repository: 'memory' }])].sort(),
      ['memory', 'postgres', 'system'],
    ) },
    { name: 'chosenProviders: ignores null, undefined, and non-string values', fn: () => equal(
      [...chosenProviders([null, undefined, { a: 1, b: 'memory' }])], ['memory'],
    ) },
    { name: 'chosenProviders: Postgres is excluded when every provider is memory', fn: () => (
      chosenProviders([{ repository: 'memory', audit: 'memory' }]).has('postgres') === false
    ) },
    { name: 'artifactShape: dist means TypeScript; composition.js only means JavaScript; no files means Python', fn: () => (
      artifactShape({ hasDistInRoot: true, hasCompositionJs: false }) === 'ts'
      && artifactShape({ hasDistInRoot: false, hasCompositionJs: true }) === 'js'
      && artifactShape({ hasDistInRoot: false, hasCompositionJs: false }) === null
    ) },
  ];
}

function runSelfTest() {
  let failures = 0;
  const cases = dependenciesMergeCases();
  for (const testCase of providersAndShapeCases()) {
    const ok = testCase.fn() === true;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }

  for (const testCase of cases) {
    const obtained = mergeDependencies(testCase.inputs);
    const ok = JSON.stringify(obtained) === JSON.stringify(testCase.expected);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} mergeDependencies: ${testCase.name}\n`);
    if (!ok) {
      failures += 1;
      process.stdout.write(`       expected: ${JSON.stringify(testCase.expected)}\n`);
      process.stdout.write(`       received: ${JSON.stringify(obtained)}\n`);
    }
  }

  const total = cases.length + providersAndShapeCases().length;
  process.stdout.write(`\nself-test: ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function main() {
  if (process.argv.includes('--selftest')) return runSelfTest();

  const projectRoot = findProjectRoot(process.cwd());
  const rawArgs = process.argv.slice(2);
  const backendOnly = rawArgs.includes('--backend-only');
  const rawDestination = rawArgs.find((argument) => !argument.startsWith('--'));
  const destination = rawDestination === undefined ? null : resolve(process.cwd(), rawDestination);

  compileBackendRoot(projectRoot);
  for (const moduleDir of listRealModules(projectRoot)) {
    compileModuleBackend(projectRoot, moduleDir);
    if (!backendOnly) buildModuleWeb(projectRoot, moduleDir);
  }

  if (destination !== null) packBackend(projectRoot, destination);
  return 0;
}

process.exit(main());
