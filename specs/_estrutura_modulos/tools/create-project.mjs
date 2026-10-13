#!/usr/bin/env node
/**
 * create-project.mjs — instancia um projeto novo a partir do template.
 * Lei dona: specs/arquitetura/00-arquitetura.md §2
 *
 *   node tools/create-project.mjs <destino> [--binding typescript] [--scope acme] [--force]
 *
 * O projeto nasce com a DOUTRINA e as FERRAMENTAS dentro dele — a verificabilidade viaja junto,
 * e nao depende de nenhum provedor de CI (ADR-005).
 *
 * A doutrina NAO vira arvore paralela: ela e a spec de arquitetura do projeto, e por isso e
 * instalada em `specs/arquitetura/` (as cinco leis) e `specs/adr/` (as decisoes do template).
 * Regra escrita em dois lugares e o defeito que este template existe para evitar — inclusive
 * entre a doutrina e o fluxo SDD que governa as specs.
 *
 * O projeto nasce DOCKERIZADO (ADR-022): Dockerfile, .dockerignore, compose.yml e deploy/ vêm do
 * binding, e o que muda com os módulos (rotas do front, URL do banco) é gerado por `sync-deploy.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = join(HERE, '..');
const BINDINGS = ['typescript', 'javascript', 'python'];
/** Nome da decisao do template dentro de `specs/adr/` — a ancora das excecoes do gate. */
const TEMPLATE_ADR = '000-decisoes-do-template.md';
/**
 * Pastas que delimitam a varredura de `<scope>` num destino já povoado — SEM `tools/`.
 *
 * `tools/` é vendorizado — "ninguém edita" (a mesma razão de `generate-lint-config.mjs:IGNORADOS`
 * excluir `tools/` do linter da base). `create-module.mjs` (e este próprio arquivo) têm a string
 * `<scope>` na PRÓPRIA LÓGICA de substituição, não como marcador a preencher: incluir `tools/` na
 * varredura reescreve essa lógica para o VALOR do escopo — `create-project.mjs destino --scope
 * verif`, por exemplo, deixaria a cópia de `create-module.mjs` com `.replaceAll('verif', escopo)`
 * em vez de `.replaceAll('<scope>', escopo)`, corrompendo a PRÓPRIA ferramenta: o próximo
 * `create-module.mjs <id>` rodado nesse projeto mutila qualquer `<id>` que contenha "verif" como
 * substring. Nenhum arquivo de `tools/` tem `<scope>` como marcador de verdade — só como parte da
 * lógica —, então excluí-la não perde nada.
 */
const DIRS_WITH_SCOPE_MARKER = ['modules', 'specs', 'packages', 'adapters', 'src', 'config'];

/** Marcador do nome do projeto nos arquivos de container da RAIZ (`compose.yml`) — ver `applyProjectName`. */
const PROJECT_NAME_MARKER = '<project>';

function abort(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function readOptions() {
  const rawArgs = process.argv.slice(2);
  const flagValue = (name, defaultValue) => {
    const index = rawArgs.indexOf(`--${name}`);
    return index === -1 ? defaultValue : rawArgs[index + 1];
  };
  return {
    destination: rawArgs.find((a) => !a.startsWith('--')),
    binding: flagValue('binding', 'typescript'),
    scope: flagValue('scope', null),
    force: rawArgs.includes('--force'),
  };
}

function walk(dir, accumulated = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, accumulated);
    else accumulated.push(path);
  }
  return accumulated;
}

/**
 * Só o que este script instalou e pode ter `<scope>` como marcador de verdade — nunca
 * `tools/` (ver `DIRS_WITH_SCOPE_MARKER`). Percorrer o destino inteiro seria errado num
 * repositório já existente — `node_modules` e `.git` entrariam no laço.
 */
function filesWithScopeMarker(destination) {
  const nestedFiles = DIRS_WITH_SCOPE_MARKER.map((p) => join(destination, p)).filter(existsSync).flatMap((p) => walk(p));
  const rootFiles = readdirSync(destination, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(destination, entry.name));
  return [...nestedFiles, ...rootFiles];
}

/** No esqueleto da raiz, só `<scope>` é substituído — os demais marcadores são do módulo. */
function applyScope(files, scope) {
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (!content.includes('<scope>')) continue;
    writeFileSync(file, content.replaceAll('<scope>', scope), 'utf8');
  }
}

/**
 * O escopo como nome de projeto de container: o compose só aceita `[a-z0-9_-]` começando por letra ou
 * dígito, e o escopo vem do nome da pasta (`Meu App.v2`). Minúsculo, o resto vira `-`.
 */
function toProjectSlug(scope) {
  const slug = scope.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/, '');
  return slug === '' ? 'project' : slug;
}

/**
 * Resolve `<project>` nos arquivos de container da RAIZ. Só na raiz, de propósito: a doutrina em
 * `specs/` cita o marcador em prosa e não pode ser reescrita pelo valor.
 */
function applyProjectName(destination, scope) {
  const slug = toProjectSlug(scope);
  const files = readdirSync(destination, { withFileTypes: true }).filter((entry) => entry.isFile());
  for (const entry of files) {
    const path = join(destination, entry.name);
    const content = readFileSync(path, 'utf8');
    if (!content.includes(PROJECT_NAME_MARKER)) continue;
    writeFileSync(path, content.replaceAll(PROJECT_NAME_MARKER, slug), 'utf8');
  }
}

/**
 * Gera o que o container deriva dos manifestos (`deploy/nginx.modules.conf`, `deploy/compose.modules.yml`)
 * — o projeto nasce com os arquivos de container coerentes, antes de qualquer módulo. Falha REPROVA.
 */
function generateDeploy(destination) {
  try {
    execFileSync(process.execPath, [join(destination, 'tools', 'sync-deploy.mjs')], {
      cwd: destination,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    abort(`Project created at ${destination}, but deployment files were not generated: ${String(cause.stderr ?? cause.message).trim()}`);
  }
}

/** Creates the root environment example through the same manifest-driven generator used later. */
function generateEnvironmentExample(destination) {
  try {
    execFileSync(process.execPath, [join(destination, 'tools', 'sync-env.mjs')], {
      cwd: destination,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    abort(`project created in ${destination}, but the root .env.example was not generated: ${String(cause.stderr ?? cause.message).trim()}`);
  }
}

/**
 * Comando por binding — a ÚNICA coisa que diverge no mapa (`README.md` da doutrina). Node
 * (typescript/javascript) roda pelos scripts do `package.json`; Python tem o próprio comando
 * composto (`verify.py`) e sobe pelo módulo `src.composition`.
 */
const COMMAND_MARKERS = {
  typescript: { '<verify-command>': 'npm run verify', '<start-command>': 'npm run start' },
  javascript: { '<verify-command>': 'npm run verify', '<start-command>': 'npm run start' },
  python: { '<verify-command>': 'python verify.py', '<start-command>': 'python -m src.composition' },
};

/** Substitui os marcadores de comando do mapa pelo comando real do binding — precedente de `<module>`
 * em `create-module.mjs`: uma fonte só, marcador substituído na instalação. */
function applyMapCommands(readmePath, binding) {
  if (!existsSync(readmePath)) return;
  let content = readFileSync(readmePath, 'utf8');
  for (const [marker, command] of Object.entries(COMMAND_MARKERS[binding])) {
    content = content.replaceAll(marker, command);
  }
  writeFileSync(readmePath, content, 'utf8');
}

/**
 * A doutrina entra como spec de arquitetura; as decisões do template, como o ADR 000 do projeto.
 * `README.md` (o mapa) viaja junto — é um arquivo comum dentro de `doutrina/`,
 * copiado pelo mesmo laço dos outros cinco, e só ele carrega marcador de comando por binding.
 */
function installDoctrine(destination, binding) {
  const origin = join(TEMPLATE_ROOT, 'doutrina');
  const architecture = join(destination, 'specs', 'arquitetura');
  const adr = join(destination, 'specs', 'adr');
  mkdirSync(architecture, { recursive: true });
  mkdirSync(adr, { recursive: true });
  for (const entry of readdirSync(origin, { withFileTypes: true })) {
    if (entry.isFile()) cpSync(join(origin, entry.name), join(architecture, entry.name));
  }
  cpSync(join(origin, 'adr', 'decisoes.md'), join(adr, TEMPLATE_ADR));
  applyMapCommands(join(architecture, 'README.md'), binding);
}

/**
 * Cache de ferramenta que a execução LOCAL do binding Python deixa dentro da própria árvore fonte
 * (`ruff`, `pytest`, `mypy`, o interpretador) — nunca versionado (o `.gitignore` do binding já o
 * cobre), mas o template é copiado do DISCO de quem roda `create-project.mjs`, não de um clone limpo,
 * e é ali que a garantia "projeto novo nasce limpo" tem de valer: sem este filtro, `__pycache__/`
 * viaja sem controle nenhum (medido dentro de um `_template` gerado localmente).
 */
const EXECUTION_JUNK = new Set(['__pycache__', '.ruff_cache', '.pytest_cache', '.mypy_cache']);

/** `filter` de `cpSync`: `false` pula a entrada (e, em pasta, tudo dentro dela). */
function isNotExecutionJunk(origin) {
  const name = basename(origin);
  return !EXECUTION_JUNK.has(name) && !name.endsWith('.pyc');
}

function copyTemplate(destination, binding) {
  installDoctrine(destination, binding);
  const withoutJunk = { recursive: true, filter: isNotExecutionJunk };
  cpSync(join(TEMPLATE_ROOT, 'tools'), join(destination, 'tools'), withoutJunk);
  cpSync(join(TEMPLATE_ROOT, 'bindings', binding, 'root'), destination, withoutJunk);
  cpSync(join(TEMPLATE_ROOT, 'bindings', binding, '_template'), join(destination, 'modules', '_template'), withoutJunk);
  // `adapters/_template`: o molde que `create-adapter.mjs` copia. Markers só em
  // comentário/string (nunca em posição de tipo/identificador) — o mesmo cuidado de `modules/_template`
  // —, então fica seguro parado dentro de `adapters/`, incluído por `tsconfig.json:include`.
  cpSync(join(TEMPLATE_ROOT, 'bindings', binding, '_adapter'), join(destination, 'adapters', '_template'), withoutJunk);
}

/**
 * Arquivos de raiz do binding que o destino já possui. Sobrescrever um `package.json` alheio
 * apaga trabalho sem aviso — e o destino, agora, pode ser um repositório em andamento.
 */
function rootCollisions(destination, binding) {
  return readdirSync(join(TEMPLATE_ROOT, 'bindings', binding, 'root'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(destination, name)));
}

/**
 * O entrypoint JS do `npm` pelo campo `bin` de `node_modules/npm/package.json`, ao lado do `node`
 * atual — nunca pelo `PATH`. Copiado de `create-module.mjs:npmEntrypoint` (mesma tecnica de
 * `ci-dependencies.mjs`), nao importado: cada ferramenta de `tools/` roda isolada.
 */
function npmEntrypoint() {
  const nodeRoot = dirname(process.execPath);
  for (const candidate of [nodeRoot, join(nodeRoot, '..', 'lib')]) {
    const dir = join(candidate, 'node_modules', 'npm');
    if (!existsSync(join(dir, 'package.json'))) continue;
    const { bin } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const relPath = typeof bin === 'string' ? bin : bin?.npm;
    const target = relPath && join(dir, relPath);
    if (target && existsSync(target)) return target;
  }
  return null;
}

/**
 * O projeto Node nasce COM `package-lock.json` — antes de qualquer modulo. Medido: sem isto o lock so
 * aparecia como efeito colateral do `npm install` do primeiro `create-module`, e um projeto recem-criado
 * (que o Dockerfile constroi com `npm ci`) saia sem ele. `--package-lock-only` resolve a arvore e grava
 * o lock sem baixar nem instalar nada (`--ignore-scripts`: nenhum script de terceiro roda aqui).
 * Python nao tem lock: as versoes sao exatas no `pyproject.toml` (ver 03-operacao.md §9.1).
 * Falhar (sem rede, registro fora) REPROVA — projeto sem lock nao e o que esta ferramenta promete.
 */
function generateLockfile(destination, binding) {
  if (binding === 'python') return;
  const entry = npmEntrypoint();
  if (entry === null) abort('npm was not found next to the current Node.js executable; package-lock.json could not be generated');
  try {
    execFileSync(process.execPath, [entry, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: destination,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    abort(`Project created at ${destination}, but package-lock.json was not generated: ${String(cause.stderr ?? cause.message).trim()}`);
  }
}

/** O `.gitignore` do esqueleto sobrescreve o do destino na cópia — este é o valor de antes. */
function readGitignore(destination) {
  const target = join(destination, '.gitignore');
  return existsSync(target) ? readFileSync(target, 'utf8') : null;
}

/**
 * Reinsere as linhas que o `.gitignore` do destino tinha a mais. Regra de projeto alheio não se
 * perde num scaffold: o esqueleto acrescenta o que falta, nunca apaga o que já era decisão de alguém.
 */
function mergeGitignore(destination, previous) {
  if (previous === null) return;
  const target = join(destination, '.gitignore');
  const current = readFileSync(target, 'utf8');
  const missing = previous
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '' && !current.includes(line));
  if (missing.length === 0) return;
  writeFileSync(target, `${current.trimEnd()}\n\n# --- preservado do projeto ---\n${missing.join('\n')}\n`, 'utf8');
}

/** As instruções finais impressas depois de gerar o projeto — extraído de `principal` para não
 * misturar ORQUESTRAÇÃO (validar, copiar, aplicar escopo) com RELATÓRIO (o que imprimir depois). */
function printNextSteps(destination, options, scope, collisions) {
  process.stdout.write(`Project created at ${destination} (binding ${options.binding}, scope "${scope}")\n`);
  process.stdout.write('  doctrine installed in specs/architecture/ and specs/adr/000-template-decisions.md\n');
  process.stdout.write('  container: Dockerfile, compose.yml, and deploy/ (start: node tools/docker-up.mjs up)\n');
  if (collisions.length > 0) process.stdout.write(`  WARNING: overwritten by --force: ${collisions.join(', ')}\n`);
  // O `pip` que `python -m venv` instala vem do interpretador do SISTEMA, nunca do template, e
  // pode trazer CVE propria — medido com pip 25.2 (6 CVEs): sem o upgrade, `ci:dependencias`
  // reprova mesmo com o projeto inteiro em dia. `--upgrade pip` entra no passo 1, antes do install
  // de verdade, para o projeto nao nascer vermelho num passo que nem e dependencia DELE.
  const install = options.binding === 'python'
    ? 'python -m venv .venv && .venv/Scripts/activate (or source .venv/bin/activate) && pip install --upgrade pip && pip install -e ".[dev]"'
    : 'npm install';
  const check = options.binding === 'python' ? 'python verify.py' : 'npm run verify';
  process.stdout.write('  linter and formatter installed: lint configuration is generated from'
    + ' tools/gate/thresholds.mjs (do not edit it by hand)\n');
  process.stdout.write('\nNext steps:\n');
  process.stdout.write(`  1. ${install}\n`);
  process.stdout.write('  2. node tools/create-module.mjs <id> --role domain|gateway|connector\n');
  process.stdout.write('  3. fill the root .env and deploy/.env (template: deploy/.env.example) with real values\n');
  process.stdout.write(`  4. ${check}   (gate, env, deploy, formatting, lint, types, tests)\n`);
  process.stdout.write('  5. git config core.hooksPath .githooks   (enables pre-commit and pre-push;'
    + ' this is local config, so activate it in every clone — see specs/architecture/03-operation.md §7.1)\n');
  process.stdout.write('  6. on the FIRST commit (once): git update-index --chmod=+x'
    + ' .githooks/pre-commit .githooks/pre-push\n');
  process.stdout.write('     (on Windows with "core.filemode=false", a common default, "git add" records the hook'
    + ' without its executable bit. Without it, Git on Linux and Mac silently skips the hook. Run this once'
    + ' so the commit records the correct bit)\n');
}

function main() {
  const options = readOptions();
  if (options.destination === undefined) abort('Usage: create-project.mjs <destination> [--binding b] [--scope e]');
  if (!BINDINGS.includes(options.binding)) abort(`Invalid binding "${options.binding}"; choose from ${BINDINGS.join(', ')}`);

  const destination = resolve(process.cwd(), options.destination);
  if (existsSync(join(destination, 'modules'))) abort(`A project already exists at ${destination}`);

  const template = join(TEMPLATE_ROOT, 'bindings', options.binding, '_template');
  if (!existsSync(template)) abort(`No template exists yet for binding "${options.binding}"`);

  const collisions = existsSync(destination) ? rootCollisions(destination, options.binding) : [];
  if (collisions.length > 0 && !options.force) {
    abort(`The destination already contains ${collisions.join(', ')} — move them or use --force to overwrite`);
  }

  const scope = options.scope ?? basename(destination).toLowerCase();
  mkdirSync(join(destination, 'modules'), { recursive: true });
  const previousGitignore = readGitignore(destination);
  copyTemplate(destination, options.binding);
  mergeGitignore(destination, previousGitignore);
  applyScope(filesWithScopeMarker(destination), scope);
  applyProjectName(destination, scope);
  generateDeploy(destination);
  generateEnvironmentExample(destination);
  generateLockfile(destination, options.binding);

  printNextSteps(destination, options, scope, collisions);
}

main();
