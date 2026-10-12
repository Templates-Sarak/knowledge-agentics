#!/usr/bin/env node
/**
 * create-module.mjs — scaffold determinístico de módulo. Lei dona: specs/arquitetura/01-modulo.md §8
 *
 *   node tools/create-module.mjs <id> --role domain|gateway|connector
 *                                     [--binding typescript] [--scope acme]
 *                                     [--no-artifact] [--no-web]
 *   node tools/create-module.mjs --selftest
 *
 * `--binding` e a SOBRESCRITA explicita: sem ela, o binding e o que o `project.json` da raiz declara
 * (`binding`) — o projeto sabe de que linguagem e, e adivinhar `typescript` num projeto JS gerava um
 * modulo que o gate reprovava ("tsconfig.json ausente"). Valor que o projeto nao declara (nem tem
 * molde `modules/_template-<binding>` para ele) reprova, nomeando o que o projeto aceita.
 *
 * `--role` e OBRIGATORIO e usa o vocabulario do manifesto (ingles), o mesmo de `init_repo.py`.
 *
 * Ninguém cria módulo à mão: módulo manual nasce sem manifesto e com nome divergente — as duas
 * coisas que quebram o gate e que o gate não consegue consertar sozinho.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = join(HERE, '..');
const ARTIFACT_DIRS = ['core/engine', 'core/templates', 'database', 'generated'];
const BINDINGS = ['typescript', 'javascript', 'python'];
// UM vocabulario so, ingles — o mesmo que sai gravado no manifesto e o mesmo que `init_repo.py`
// exige em `--modules <id>:<role>`. A ADR-009 decisao 8 e explicita: enum de valor estrutural
// "segue a mesma traducao da pasta homonima — e o mesmo conceito, nao uma excecao".
//
// Ate aqui esta CLI pedia `dominio|gateway|conector` (PT) e a `init_repo.py` pedia
// `domain|gateway|connector` (EN): duas portas do MESMO produto, cada uma recusando o vocabulario
// da outra, com o valor traduzido EN->PT so para ser traduzido PT->EN de volta na escrita do
// manifesto. Quem aprendia uma errava na outra. A forma PT e recusada com a correta na mensagem.
const ROLES = ['domain', 'gateway', 'connector'];
const PT_LEGACY_ROLE = { 'dominio': 'domain', 'conector': 'connector' };
/** Binding assumido quando nem a CLI nem o `project.json` declaram um (projeto legado, sem o campo). */
const DEFAULT_BINDING = 'typescript';

function abort(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

/**
 * Le removendo o BOM (editor e shell do Windows gravam por padrao, e `JSON.parse` rejeita) e
 * normalizando CRLF para LF — defesa em profundidade, mesma de `tools/gate/context.mjs:readText`.
 * O molde é copiado de disco, não de um clone git (`core.autocrlf` não protege aqui), e
 * `pruneArtifactTestPy` casa texto por `\n` literal: sem isto, um molde ainda em CRLF faz o
 * `.replace()` de lá virar noop silencioso.
 */
function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

function readOptions() {
  const rawArgs = process.argv.slice(2);
  const flagValue = (name, defaultValue) => {
    const index = rawArgs.indexOf(`--${name}`);
    return index === -1 ? defaultValue : rawArgs[index + 1];
  };
  return {
    id: rawArgs.find((a) => !a.startsWith('--') && rawArgs[rawArgs.indexOf(a) - 1]?.startsWith('--') !== true) ?? rawArgs[0],
    binding: flagValue('binding', null),
    role: flagValue('role', undefined),
    scope: flagValue('scope', null),
    withoutArtifact: rawArgs.includes('--no-artifact'),
    withoutWeb: rawArgs.includes('--no-web'),
  };
}

/** Sobe até achar a raiz do projeto (a que tem `modules/`). Cai na raiz da ferramenta se não achar. */
function findProjectRoot() {
  let current = process.cwd();
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return TOOL_ROOT;
}

/**
 * Acha o molde, na ordem: molde por binding no projeto, molde único do projeto,
 * molde do próprio template. É o que faz o comando funcionar dentro e fora do repo do template.
 */
function findTemplate(projectRoot, binding) {
  const candidates = [
    join(projectRoot, 'modules', `_template-${binding}`),
    join(projectRoot, 'modules', '_template'),
    join(TOOL_ROOT, 'bindings', binding, '_template'),
  ];
  return candidates.find((path) => existsSync(join(path, 'module.json'))) ?? null;
}

/** O `binding` que o `project.json` da raiz declara, ou `null` (projeto legado sem o campo). */
function readProjectBinding(projectRoot) {
  const path = join(projectRoot, 'project.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readText(path)).binding ?? null;
  } catch {
    return null;
  }
}

/** Bindings que o projeto tem molde proprio para (`modules/_template-<binding>`) — projeto multi-binding. */
function bindingsWithOwnTemplate(projectRoot) {
  return BINDINGS.filter((b) => existsSync(join(projectRoot, 'modules', `_template-${b}`, 'module.json')));
}

/**
 * PURA — qual binding o modulo novo usa. Explicito vence, mas so entre os que o projeto aceita: o
 * declarado no `project.json` mais os que tem molde proprio. Sem declaracao no projeto, qualquer
 * binding do vocabulario e aceito (projeto legado) e o padrao e `DEFAULT_BINDING`.
 * Devolve `{ binding }` ou `{ erro }`.
 */
export function resolveBinding({ explicit, declared, withTemplate }) {
  if (explicit !== null && !BINDINGS.includes(explicit)) {
    return { error: `binding "${explicit}" is invalid — choose from ${BINDINGS.join(', ')}` };
  }
  const accepted = [...new Set([declared, ...withTemplate].filter((b) => b !== null && b !== undefined))];
  if (explicit === null) return { binding: declared ?? DEFAULT_BINDING };
  if (accepted.length > 0 && !accepted.includes(explicit)) {
    return { error: `binding "${explicit}" is not declared by this project (project.json declares: ${accepted.join(', ')}) — `
      + 'the module would use another language\'s template and fail the gate' };
  }
  return { binding: explicit };
}

/** Escopo dos packages: flag, senão o nome do package da raiz, senão o nome da pasta. */
function resolveScope(projectRoot, given) {
  if (given !== null) return given;
  const path = join(projectRoot, 'package.json');
  if (existsSync(path)) {
    const { name = '' } = JSON.parse(readText(path));
    const matched = name.match(/^@([^/]+)\//);
    if (matched !== null) return matched[1];
    if (name !== '') return name;
  }
  return projectRoot.split(/[\\/]/).pop().toLowerCase();
}

function substitute(text, id, scope) {
  return text
    // `<module_snake>` e o id em snake_case, e existe para o BANCO: identificador SQL nao aceita
    // hifen sem aspas, e `manifest-schema` cobra `^[a-z][a-z0-9_]*$` em `data.tables[]`. Sem ele,
    // todo id kebab-case com hifen (`nota-fiscal`) nascia REPROVADO — `table-prefix` exigia
    // `nota-fiscal_` e o schema proibia o hifen na tabela derivada dele: duas regras do mesmo gate
    // pedindo coisas incompativeis, sem manifesto valido possivel. Mesma conversao que `<MODULE>`
    // ja fazia para chave de ambiente — a diferenca era so o banco nao ter recebido a dela.
    .replaceAll('<module_snake>', id.replace(/-/g, '_'))
    .replaceAll('<MODULE>', id.toUpperCase().replace(/-/g, '_'))
    .replaceAll('<Module>', id.charAt(0).toUpperCase() + id.slice(1))
    .replaceAll('<module>', id)
    .replaceAll('<scope>', scope);
}

function walk(dir, accumulated = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, accumulated);
    else accumulated.push(path);
  }
  return accumulated;
}

function applyMarkers(destination, id, scope) {
  for (const file of walk(destination)) {
    writeFileSync(file, substitute(readText(file), id, scope), 'utf8');
    const name = file.split(/[\\/]/).pop();
    if (name.includes('<module>')) renameSync(file, join(dirname(file), substitute(name, id, scope)));
  }
}

function adjustManifest(destination, options) {
  const path = join(destination, 'module.json');
  const manifest = JSON.parse(readText(path));
  manifest.role = options.role;
  manifest.binding = options.binding;
  if (options.withoutArtifact) {
    manifest.generatesArtifact = false;
    manifest.data.tables = [];
  }
  if (options.withoutWeb) {
    // As DUAS juntas — nao so `webPath`. `navigation` sozinha, sem `webPath`,
    // e uma entrada de menu apontando para o nada: `navigation-declared` reprova, e reprova com
    // razao (o modulo pediu tela removida e deixou o menu para tras).
    manifest.webPath = null;
    manifest.navigation = null;
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/** Config de texto que so a tela usa. Sem `web/`, ela viraria config morta — e o gate avisa. */
const SCREEN_ONLY_TEXTS = ['loading', 'emptyList', 'genericError', 'statusLabels', 'errorLabels'];

/**
 * `title` e lido so por `web/` em TS/JS — config morta sem ele (o gate avisa) — mas em PYTHON e o
 * `title` do app FastAPI (`api/src/__init__.py`), lido pelo backend mesmo sem tela: podar quebra o boot.
 */
function screenOnlyTexts(binding) {
  return binding === 'python' ? SCREEN_ONLY_TEXTS : ['title', ...SCREEN_ONLY_TEXTS];
}

function pruneScreenTexts(destination, binding) {
  const path = join(destination, 'config', 'texts.json');
  const texts = JSON.parse(readText(path));
  for (const key of screenOnlyTexts(binding)) delete texts[key];
  writeFileSync(path, `${JSON.stringify(texts, null, 2)}\n`, 'utf8');
}

/**
 * Remove `agulha` de `texto` (regex ou string) e EXIGE que algo tenha mudado. Sem isto,
 * `String.replace()`/`RegExp.replace()` que não casam devolvem o texto igual em silêncio — a poda
 * vira noop, o import órfão sobra no arquivo, e só o `tsc`/`ruff` do autoteste do template acusa,
 * passos adiante.
 */
function pruneOrFail(text, needle, context) {
  const pruned = text.replace(needle, '');
  if (pruned === text) {
    throw new Error(`pruneArtifactTest: "${needle}" was not found in ${context}; the template changed and pruning is obsolete`);
  }
  return pruned;
}

/**
 * O teste de domínio importa `core/engine` para exercitar `generateArtifact`.
 * `--no-artifact` apaga a PASTA e deixa o teste importando o nada — `tsc`/`import` reprova antes
 * mesmo do `vitest` rodar. Poda o import E o bloco de teste, por binding; o teste de domínio
 * (`buildRecord`/`build_record`) fica intacto, porque não depende do motor.
 */
function pruneArtifactTestTsJs(path) {
  const content = readText(path);
  const withoutImportEngine = pruneOrFail(
    content, /^import \{ generateArtifact \} from '\.\.\/\.\.\/core\/engine\/index\.js';\n/m, path,
  );
  // `recordExample` so serve o bloco `generateArtifact` — sem ele, o import fica sem leitor e
  // `tsc --noEmit` reprova com TS6133 ("declared but its value is never read").
  const withoutImports = pruneOrFail(
    withoutImportEngine, /^import \{ recordExample \} from '\.\.\/fixtures\/index\.js';\n/m, path,
  );
  const index = withoutImports.indexOf("describe('generateArtifact'");
  if (index === -1) return;
  const blockStart = withoutImports.lastIndexOf('\n\n', index) + 1;
  writeFileSync(path, `${withoutImports.slice(0, blockStart).trimEnd()}\n`, 'utf8');
}

function pruneArtifactTestPy(path) {
  const content = readText(path);
  const withoutImportEngine = pruneOrFail(content, 'from core.engine import generate_artifact\n', path);
  // Mesmo motivo do lado TS/JS: `record_example` sem leitor e F401 (ruff) reprova.
  const withoutImports = pruneOrFail(
    withoutImportEngine, 'from tests.fixtures import record_example\n', path,
  );
  const index = withoutImports.indexOf('TEMPLATE = ');
  if (index === -1) return;
  const blockStart = withoutImports.lastIndexOf('\n\n', index) + 1;
  writeFileSync(path, `${withoutImports.slice(0, blockStart).trimEnd()}\n`, 'utf8');
}

function pruneArtifactTest(destination, binding) {
  if (binding === 'python') {
    pruneArtifactTestPy(join(destination, 'tests', 'domain', 'test_domain.py'));
    return;
  }
  const name = binding === 'typescript' ? 'domain.test.ts' : 'domain.test.js';
  pruneArtifactTestTsJs(join(destination, 'tests', 'domain', name));
}

/** O `.env` do módulo só aponta para a raiz (ADR-004). Segredo real mora num lugar só. */
function createLocalEnv(destination, id) {
  const content = [
    `# .env do modulo ${id} — NAO versionado (ADR-004).`,
    '# Este arquivo APONTA para o .env da raiz; o segredo real mora la, num lugar so.',
    '# Na extracao: apague a linha ENV_ROOT e preencha os valores aqui. Nenhum codigo muda.',
    '',
    'ENV_ROOT=../../.env',
    '',
    `# Override local (dev). So chaves ${id.toUpperCase().replace(/-/g, '_')}_*.`,
    '',
  ].join('\n');
  writeFileSync(join(destination, '.env'), content, 'utf8');
}

function run(script, args, projectRoot) {
  return execFileSync(process.execPath, [join(TOOL_ROOT, 'tools', script), ...args], {
    encoding: 'utf8',
    cwd: projectRoot,
  });
}

/**
 * O entrypoint JS do `npm` pelo campo `bin` de `node_modules/npm/package.json`, ao lado do `node`
 * atual — nunca pelo `PATH`. Mesma técnica de `ci-dependencies.mjs:npmEntrypoint` (que por sua vez
 * cita `verify-commit.mjs:npmEntrypoint`); copiada, não importada — cada ferramenta de
 * `tools/` roda isolada, e um `import` cruzado entre elas viraria dependência que a árvore
 * vendorizada num projeto gerado não garante resolver na mesma ordem.
 */
function npmEntrypoint() {
  const nodeRoot = dirname(process.execPath);
  for (const candidate of [nodeRoot, join(nodeRoot, '..', 'lib')]) {
    const dir = join(candidate, 'node_modules', 'npm');
    try {
      const { bin } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const relPath = typeof bin === 'string' ? bin : bin?.npm;
      const target = relPath && join(dir, relPath);
      if (target && existsSync(target)) return target;
    } catch {
      // candidato seguinte
    }
  }
  return null;
}

/**
 * `npm install` de novo, DEPOIS do módulo entrar no workspace. Sem isto, as dependências que o
 * `package.json` do módulo novo declara (`react`, `@testing-library/react`, `@vitejs/plugin-react`,
 * ...) nunca são baixadas — `npm install` só liga membro de workspace na hora em que roda, e o único
 * install documentado (`create-project.mjs`, passo 1) acontece ANTES do primeiro módulo existir.
 * Medido: `npm run verify` de um módulo recém-criado reprovava `tipos` com ~20 erros TS2307
 * ("Cannot find module 'react'") seguindo exatamente os passos que `create-project.mjs` imprime.
 * Só TS/JS: o binding Python não tem manifesto de dependência por módulo (venv único da raiz).
 */
function installDependencies(projectRoot, binding) {
  if (binding === 'python') return;
  const entry = npmEntrypoint();
  if (entry === null) abort('npm was not found next to the current Node.js executable; the new module dependencies could not be installed');
  process.stdout.write(execFileSync(process.execPath, [entry, 'install', '--prefer-offline', '--no-audit', '--no-fund'], {
    encoding: 'utf8',
    cwd: projectRoot,
  }));
}

function validateOptions(options) {
  if (options.id === undefined) abort('Usage: create-module.mjs <id> --role domain|gateway|connector [--binding b] [--no-artifact] [--no-web]');
  if (!/^[a-z][a-z0-9-]*$/.test(options.id)) abort(`id "${options.id}" is invalid — use lowercase kebab-case`);
  // Sem default: papel adivinhado e escolha feita por quem nao estava la. `init_repo.py` ja recusa
  // o id sem sufixo de papel pelo mesmo motivo — as duas portas cobram a mesma declaracao.
  if (options.role === undefined) {
    abort(`--role is required — choose ${ROLES.join(' | ')}. The role determines the module architecture`
      + ' (gateway and connector roles never generate artifacts); inferring a role from the id is not supported');
  }
  if (PT_LEGACY_ROLE[options.role] !== undefined) {
    abort(`role "${options.role}" is the legacy Portuguese form — use "${PT_LEGACY_ROLE[options.role]}",`
      + ' which matches the vocabulary in the manifest and init_repo.py --modules');
  }
  if (!ROLES.includes(options.role)) abort(`role "${options.role}" is invalid — choose from ${ROLES.join(', ')}`);
}

function main() {
  const options = readOptions();
  validateOptions(options);

  const projectRoot = findProjectRoot();
  const decision = resolveBinding({
    explicit: options.binding,
    declared: readProjectBinding(projectRoot),
    withTemplate: bindingsWithOwnTemplate(projectRoot),
  });
  if (decision.error !== undefined) abort(decision.error);
  options.binding = decision.binding;
  const template = findTemplate(projectRoot, options.binding);
  if (template === null) abort(`No template found for binding "${options.binding}"`);

  const destination = join(projectRoot, 'modules', options.id);
  if (existsSync(destination)) abort(`Module "${options.id}" already exists at ${destination}`);

  mkdirSync(join(projectRoot, 'modules'), { recursive: true });
  cpSync(template, destination, { recursive: true });

  if (options.withoutArtifact) {
    for (const relPath of ARTIFACT_DIRS) rmSync(join(destination, relPath), { recursive: true, force: true });
    pruneArtifactTest(destination, options.binding);
  }
  if (options.withoutWeb) {
    rmSync(join(destination, 'web'), { recursive: true, force: true });
    rmSync(join(destination, 'tests', 'web'), { recursive: true, force: true });
  }

  applyMarkers(destination, options.id, resolveScope(projectRoot, options.scope));
  adjustManifest(destination, options);
  if (options.withoutWeb) pruneScreenTexts(destination, options.binding);
  createLocalEnv(destination, options.id);

  process.stdout.write(`Module "${options.id}" created at modules/${options.id}\n`);
  finalize(options, projectRoot);
}

function finalize(options, projectRoot) {
  // `sync-env.mjs` (sem `--check`) MESCLA o `.env` real com as chaves de TODOS os
  // manifestos, inclusive as deste modulo novo — nao so o `.env.example`. Ele nunca sobrescreve
  // valor ja preenchido, entao chamar em todo `criar-modulo` (nao so no primeiro) e seguro; e o
  // que faz o `.env` real acompanhar o segundo modulo em diante, o que uma criacao unica (so no
  // primeiro modulo, com early-return se o arquivo ja existisse) nao faria — medido: chave do
  // segundo modulo nunca chega ao `.env` real por esse caminho.
  process.stdout.write(run('sync-env.mjs', [], projectRoot));
  // O mesmo vale para o que o container deriva dos manifestos: a `location` do front (webPath) e a URL
  // do banco do modulo novo (`sync-deploy.mjs`). Idempotente, e o `verify` o confere (`--check`).
  // Projeto que ainda nao adotou o container (sem config/deploy.json) nao e quebrado aqui: quem o
  // cobra e a regra `container-present` do gate, com a mensagem de quem falta.
  if (existsSync(join(projectRoot, 'config', 'deploy.json'))) {
    process.stdout.write(run('sync-deploy.mjs', [], projectRoot));
  }
  process.stdout.write('Installing dependencies for the new module...\n');
  installDependencies(projectRoot, options.binding);
  process.stdout.write('Validating...\n');
  try {
    process.stdout.write(run('gate/validate.mjs', [join('modules', options.id)], projectRoot));
  } catch (cause) {
    process.stdout.write(cause.stdout ?? '');
    process.stderr.write('\nThe module was created, but the gate reported issues above; resolve them before committing.\n');
    process.exit(1);
  }
  process.stdout.write('\nNext: contract/openapi.yaml, then core/domain and api/src/routes.\n');
}

function runSelfTest() {
  const template = ['python'];
  const cases = [
    { name: 'without a flag, selects the JavaScript binding declared by the project', input: { explicit: null, declared: 'javascript', withTemplate: [] }, expected: 'javascript' },
    { name: 'without a flag or declaration, defaults to TypeScript for legacy projects', input: { explicit: null, declared: null, withTemplate: [] }, expected: 'typescript' },
    { name: 'binding flag matching the declaration is accepted', input: { explicit: 'python', declared: 'python', withTemplate: [] }, expected: 'python' },
    { name: 'binding flag conflicting with the declaration returns an error', input: { explicit: 'typescript', declared: 'javascript', withTemplate: [] }, expected: null },
    { name: 'binding flag with its own template is accepted', input: { explicit: 'python', declared: 'javascript', withTemplate: template }, expected: 'python' },
    { name: 'binding flag outside the vocabulary returns an error', input: { explicit: 'ruby', declared: 'javascript', withTemplate: [] }, expected: null },
    { name: 'binding flag is accepted for a legacy project without a declaration', input: { explicit: 'python', declared: null, withTemplate: [] }, expected: 'python' },
  ];
  let failures = 0;
  for (const testCase of cases) {
    const r = resolveBinding(testCase.input);
    const ok = testCase.expected === null ? r.error !== undefined : r.binding === testCase.expected;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} resolveBinding: ${testCase.name}
`);
    if (!ok) failures += 1;
  }
  process.stdout.write(`
self-test: ${cases.length - failures}/${cases.length} passed
`);
  return failures === 0 ? 0 : 1;
}

if (process.argv.includes('--selftest')) process.exit(runSelfTest());
else main();
