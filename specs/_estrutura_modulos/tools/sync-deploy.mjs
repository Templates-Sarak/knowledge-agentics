#!/usr/bin/env node
/**
 * sync-deploy.mjs — gera, dos MANIFESTOS, o que o container deriva dos módulos.
 * Lei dona: specs/arquitetura/03-operacao.md §9.5
 *
 *   node tools/sync-deploy.mjs             regrava deploy/nginx.modules.conf e deploy/compose.modules.yml
 *   node tools/sync-deploy.mjs --check     só confere (para o `verify`): reprova se divergirem
 *
 * Duas saídas, as duas GERADAS (nunca editadas à mão) e INCLUÍDAS por arquivos estáticos que o
 * projeto pode ajustar sem perder o ajuste na regeneração:
 *
 *   deploy/nginx.modules.conf   a `location` de cada `module.json:webPath` não-nulo + os tunables do
 *                               proxy (corpo máximo, timeout). `deploy/nginx.conf` o inclui. SÓ existe
 *                               onde o projeto tem front (`deploy/nginx.conf`) — o binding Python não.
 *   deploy/compose.modules.yml  o fragmento do serviço `app` que muda com os módulos: a URL do banco
 *                               de cada `<MODULE>_DB_URL` (dentro do container o banco é o serviço
 *                               `db`, não 127.0.0.1) e o `stop_grace_period`. `compose.yml` o estende.
 *
 * Fontes, todas versionadas: `modules/<id>/module.json` (webPath, requiredEnv),
 * `config/runtime.json:shutdown.drainTimeoutMs` e `config/deploy.json` (os tunables que só o deploy
 * lê — fora do `runtime.json`, que o processo lê e o artefato carrega).
 *
 * Mesmo modelo de `sync-env.mjs --check`: `create-module` regenera, `verify` confere. Zero dependência.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const TARGETS = {
  nginx: join('deploy', 'nginx.modules.conf'),
  compose: join('deploy', 'compose.modules.yml'),
};
/** O projeto declara que tem front por ter `deploy/nginx.conf` — o binding Python nasce sem ele. */
const FRONT_MARKER = join('deploy', 'nginx.conf');
const WEB_PATH_PATTERN = /^\/[a-z][a-z0-9-]*$/;
const DB_URL_KEY_PATTERN = /_DB_URL$/;
const BODY_SIZE_PATTERN = /^\d+[kKmMgG]?$/;
const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;
const ASSET_EXTENSIONS = 'js|css|woff2?|png|jpe?g|webp|svg|ico';

function findProjectRoot() {
  let current = process.cwd();
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(HERE, '..');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

/** Módulos reais (os moldes `_*` não são publicados), em ordem de id — a saída é determinística. */
function listModules(root) {
  const base = join(root, 'modules');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => statSync(join(base, name)).isDirectory())
    .filter((name) => existsSync(join(base, name, 'module.json')))
    .sort()
    .map((name) => ({ dir: name, manifest: readJson(join(base, name, 'module.json')) }));
}

/** Devolve a lista de problemas da config de deploy — vazia quando está íntegra. */
function validateDeployConfig(config, withFront) {
  const problems = [];
  const { front, shutdown, database } = config ?? {};
  if (withFront && !BODY_SIZE_PATTERN.test(String(front?.maxBodySize ?? ''))) {
    problems.push('front.maxBodySize must be an nginx size (for example, \"5m\")');
  }
  if (withFront && (!Number.isInteger(front?.proxyReadTimeoutSeconds) || front.proxyReadTimeoutSeconds <= 0)) {
    problems.push('front.proxyReadTimeoutSeconds must be a positive integer');
  }
  if (!Number.isInteger(shutdown?.graceMarginMs) || shutdown.graceMarginMs < 0) {
    problems.push('shutdown.graceMarginMs must be an integer greater than or equal to 0');
  }
  if (!SERVICE_NAME_PATTERN.test(String(database?.service ?? ''))) {
    problems.push('database.service must name the database service in compose (for example, \"db\")');
  }
  if (!Number.isInteger(database?.port) || database.port < 1 || database.port > 65535) {
    problems.push('database.port must be a TCP port');
  }
  return problems;
}

function readInputs(root) {
  const deployPath = join(root, 'config', 'deploy.json');
  const runtimePath = join(root, 'config', 'runtime.json');
  if (!existsSync(deployPath)) throw new Error('config/deploy.json is missing; it contains deployment tunables (body limit, timeout, shutdown margin)');
  if (!existsSync(runtimePath)) throw new Error('config/runtime.json is missing; the shutdown timeout (shutdown.drainTimeoutMs) is defined there');
  const deploy = readJson(deployPath);
  const withFront = existsSync(join(root, FRONT_MARKER));
  const problems = validateDeployConfig(deploy, withFront);
  if (problems.length > 0) throw new Error(`config/deploy.json is invalid: ${problems.join('; ')}`);
  const drainTimeoutMs = readJson(runtimePath).shutdown?.drainTimeoutMs;
  if (!Number.isInteger(drainTimeoutMs) || drainTimeoutMs <= 0) {
    throw new Error('config/runtime.json must define a positive integer shutdown.drainTimeoutMs');
  }
  return { deploy, drainTimeoutMs, withFront, modules: listModules(root) };
}

function webPathsOf(modules) {
  const paths = [];
  for (const { dir, manifest } of modules) {
    const webPath = manifest.webPath;
    if (webPath === null || webPath === undefined) continue;
    if (typeof webPath !== 'string' || !WEB_PATH_PATTERN.test(webPath)) {
      throw new Error(`modules/${dir}/module.json: webPath "${webPath}" does not match ${WEB_PATH_PATTERN}; it cannot become an nginx location`);
    }
    paths.push(webPath);
  }
  return paths;
}

function locationsFor(webPath) {
  return [
    `# ${webPath}`,
    `location = ${webPath} {`,
    `    return 301 ${webPath}/;`,
    '}',
    `location ${webPath}/ {`,
    `    try_files $uri $uri/ ${webPath}/index.html;   # fallback de SPA, só dentro do módulo`,
    '    expires -1;                                   # a entrada HTML nunca é cacheada',
    '}',
    `location ~* ^${webPath}/assets/.+\\.(${ASSET_EXTENSIONS})$ {`,
    '    expires 1y;                                   # arquivo com hash no nome',
    '    access_log off;',
    '}',
    '',
  ];
}

export function buildNginx({ deploy, modules }) {
  const lines = [
    '# GERADO por `node tools/sync-deploy.mjs` — NÃO edite à mão. Fontes: modules/*/module.json:webPath',
    '# e config/deploy.json. Incluído por deploy/nginx.conf (dentro do bloco `server`).',
    '',
    '# Tunables do proxy da API (config/deploy.json:front).',
    `client_max_body_size ${deploy.front.maxBodySize};`,
    `proxy_read_timeout ${deploy.front.proxyReadTimeoutSeconds}s;`,
    '',
  ];
  for (const webPath of webPathsOf(modules)) lines.push(...locationsFor(webPath));
  return lines.join('\n');
}

/** As chaves `DEPLOY_*` de que a URL do banco é feita, na ordem da URL: quem, a credencial, qual banco. */
const DATABASE_URL_KEYS = ['DEPLOY_DB_USER', 'DEPLOY_DB_PASSWORD', 'DEPLOY_DB_NAME'];

/** `${CHAVE:?mensagem}` do compose: exigida, nunca com valor padrão embutido (zero hardcoded). */
function required(name) {
  return '${' + name + ':?required}';
}

/**
 * A linha da URL do banco de UM `<MODULE>_DB_URL`, apontando para o serviço do compose.
 *
 * O scanner reconhece essa forma como segura quando usuário e senha vêm ambos de variáveis de ambiente.
 * O compose exige as chaves sem valor padrão. A URL é montada por partes, sem credenciais literais.
 */
function databaseUrlLine(key, database) {
  const [user, secret, name] = DATABASE_URL_KEYS.map(required);
  const authority = `${user}:${secret}`;
  const location = `${database.service}:${database.port}`;
  return `      ${key}: "postgres://${authority}@${location}/${name}"`;
}

export function buildCompose({ deploy, drainTimeoutMs, modules }) {
  const seconds = Math.ceil((drainTimeoutMs + deploy.shutdown.graceMarginMs) / 1000);
  const keys = [...new Set(modules.flatMap(({ manifest }) => manifest.requiredEnv ?? []))]
    .filter((key) => DB_URL_KEY_PATTERN.test(key))
    .sort();
  const lines = [
    '# GERADO por `node tools/sync-deploy.mjs` — NÃO edite à mão. Fontes: modules/*/module.json:requiredEnv,',
    '# config/runtime.json:shutdown.drainTimeoutMs e config/deploy.json. Estendido por compose.yml (`extends`).',
    '#',
    '# Dentro do container o banco é o serviço do compose, não o 127.0.0.1 do .env de dev: a URL é sobrescrita',
    '# aqui, a partir das chaves DEPLOY_* de deploy/.env (que só o compose lê — ADR-022).',
    'services:',
    '  app:',
    `    # Teto de desligamento (${drainTimeoutMs} ms) + folga (${deploy.shutdown.graceMarginMs} ms), arredondado para cima.`,
    `    stop_grace_period: ${seconds}s`,
  ];
  if (keys.length > 0) {
    lines.push('    environment:', ...keys.map((key) => databaseUrlLine(key, deploy.database)));
  }
  lines.push('');
  return lines.join('\n');
}

function plannedFiles(root) {
  const inputs = readInputs(root);
  const files = [{ path: join(root, TARGETS.compose), rel: TARGETS.compose, content: buildCompose(inputs) }];
  if (inputs.withFront) files.unshift({ path: join(root, TARGETS.nginx), rel: TARGETS.nginx, content: buildNginx(inputs) });
  return files;
}

function currentContent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null;
}

function run(check) {
  const root = findProjectRoot();
  const files = plannedFiles(root);
  const stale = files.filter(({ path, content }) => currentContent(path) !== content);
  if (check) {
    if (stale.length === 0) {
      process.stdout.write('Deployment files match the manifests.\n');
      return 0;
    }
    process.stdout.write(`Deployment files differ from the manifests:\n${stale.map(({ rel }) => `  ${rel}`).join('\n')}\n`);
    process.stdout.write('Regenerate with: node tools/sync-deploy.mjs\n');
    return 1;
  }
  for (const { path, rel, content } of stale) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
    process.stdout.write(`Updated: ${rel}\n`);
  }
  return 0;
}

/** Os casos do `--selftest`: o núcleo puro (`buildNginx`, `buildCompose`, a validação) sem disco. */
function selfTestCases() {
  const deploy = {
    front: { maxBodySize: '5m', proxyReadTimeoutSeconds: 65 },
    shutdown: { graceMarginMs: 2000 },
    database: { service: 'db', port: 5432 },
  };
  const modules = [
    { dir: 'a', manifest: { id: 'a', webPath: '/a', requiredEnv: ['A_API_PORT', 'A_DB_URL'] } },
    { dir: 'b', manifest: { id: 'b', webPath: null, requiredEnv: ['B_API_PORT'] } },
  ];
  const nginx = buildNginx({ deploy, modules });
  const compose = buildCompose({ deploy, drainTimeoutMs: 8000, modules });
  /** @type {Array<[string, () => boolean]>} */
  const cases = [
    ['nginx: generates a location for webPath and none for a module without a page', () => (
      nginx.includes('location /a/ {') && !nginx.includes('/b/') && nginx.includes('location = /a {'))],
    ['nginx: deployment tunables from config/deploy.json are included', () => (
      nginx.includes('client_max_body_size 5m;') && nginx.includes('proxy_read_timeout 65s;'))],
    ['compose: stop_grace_period equals timeout plus margin, rounded up to seconds', () => (
      compose.includes('stop_grace_period: 10s')
      && buildCompose({ deploy, drainTimeoutMs: 8001, modules }).includes('stop_grace_period: 11s'))],
    ['compose: one URL per *_DB_URL key for the database service, with no default', () => (
      compose.includes('A_DB_URL: "postgres://${DEPLOY_DB_USER:?') && compose.includes('@db:5432/')
      && compose.includes('${DEPLOY_DB_USER:?required}:${DEPLOY_DB_PASSWORD:?required}@')
      && !compose.includes('B_API_PORT') && !compose.includes(':-'))],
    ['compose: without a *_DB_URL key there is no environment block', () => (
      !buildCompose({ deploy, drainTimeoutMs: 8000, modules: [modules[1]] }).includes('environment:'))],
    ['webPath must match its pattern to become an nginx location (throws)', () => {
      try {
        buildNginx({ deploy, modules: [{ dir: 'x', manifest: { webPath: '/x; return 200' } }] });
        return false;
      } catch {
        return true;
      }
    }],
    ['config: invalid sizes and integers fail; front settings are optional without a frontend', () => (
      validateDeployConfig({ ...deploy, front: { maxBodySize: 'x', proxyReadTimeoutSeconds: 0 } }, true).length === 2
      && validateDeployConfig({ shutdown: deploy.shutdown, database: deploy.database }, false).length === 0)],
  ];
  return cases;
}

function runSelfTest() {
  const cases = selfTestCases();
  let failures = 0;
  for (const [name, check] of cases) {
    const ok = check() === true;
    if (!ok) failures += 1;
      process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${name}\n`);
  }
  process.stdout.write(`\nself-test: ${cases.length - failures}/${cases.length} passed\n`);
  return failures === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes('--selftest')) return runSelfTest();
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    process.stderr.write(`Error: unknown argument "${unknown[0]}" — usage: sync-deploy.mjs [--check|--selftest]\n`);
    return 2;
  }
  try {
    return run(process.argv.includes('--check'));
  } catch (cause) {
    process.stderr.write(`Error: ${cause.message}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
