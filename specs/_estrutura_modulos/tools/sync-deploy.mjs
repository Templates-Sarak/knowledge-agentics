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
    problems.push('front.maxBodySize deve ser um tamanho do nginx (ex.: "5m")');
  }
  if (withFront && (!Number.isInteger(front?.proxyReadTimeoutSeconds) || front.proxyReadTimeoutSeconds <= 0)) {
    problems.push('front.proxyReadTimeoutSeconds deve ser um inteiro positivo');
  }
  if (!Number.isInteger(shutdown?.graceMarginMs) || shutdown.graceMarginMs < 0) {
    problems.push('shutdown.graceMarginMs deve ser um inteiro >= 0');
  }
  if (!SERVICE_NAME_PATTERN.test(String(database?.service ?? ''))) {
    problems.push('database.service deve ser o nome do serviço do banco no compose (ex.: "db")');
  }
  if (!Number.isInteger(database?.port) || database.port < 1 || database.port > 65535) {
    problems.push('database.port deve ser uma porta TCP');
  }
  return problems;
}

function readInputs(root) {
  const deployPath = join(root, 'config', 'deploy.json');
  const runtimePath = join(root, 'config', 'runtime.json');
  if (!existsSync(deployPath)) throw new Error('config/deploy.json ausente — são os tunables do deploy (corpo máximo, timeout, folga de desligamento)');
  if (!existsSync(runtimePath)) throw new Error('config/runtime.json ausente — o teto de desligamento (shutdown.drainTimeoutMs) vem dele');
  const deploy = readJson(deployPath);
  const withFront = existsSync(join(root, FRONT_MARKER));
  const problems = validateDeployConfig(deploy, withFront);
  if (problems.length > 0) throw new Error(`config/deploy.json inválido: ${problems.join('; ')}`);
  const drainTimeoutMs = readJson(runtimePath).shutdown?.drainTimeoutMs;
  if (!Number.isInteger(drainTimeoutMs) || drainTimeoutMs <= 0) {
    throw new Error('config/runtime.json sem shutdown.drainTimeoutMs inteiro positivo');
  }
  return { deploy, drainTimeoutMs, withFront, modules: listModules(root) };
}

function webPathsOf(modules) {
  const paths = [];
  for (const { dir, manifest } of modules) {
    const webPath = manifest.webPath;
    if (webPath === null || webPath === undefined) continue;
    if (typeof webPath !== 'string' || !WEB_PATH_PATTERN.test(webPath)) {
      throw new Error(`modules/${dir}/module.json: webPath "${webPath}" fora de ${WEB_PATH_PATTERN} — não vira location do nginx`);
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
  return '${' + name + ':?defina ' + name + ' no deploy/.env}';
}

/**
 * A linha da URL do banco de UM `<MODULE>_DB_URL`, apontando para o serviço do compose.
 *
 * A mensagem do `:?` carrega espaços de propósito: sem eles, `${A:?}:${B:?}@host` é lido pelo gate de
 * segredos do commit como uma string de conexão com credencial — e o projeto gerado não nasceria
 * commitável. A URL é montada por partes (nada de `senha: '…'` nem `scheme://usuario:senha@` literais).
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
      process.stdout.write('deploy em dia com os manifestos.\n');
      return 0;
    }
    process.stdout.write(`deploy divergente dos manifestos:\n${stale.map(({ rel }) => `  ${rel}`).join('\n')}\n`);
    process.stdout.write('corrija com: node tools/sync-deploy.mjs\n');
    return 1;
  }
  for (const { path, rel, content } of stale) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
    process.stdout.write(`atualizado: ${rel}\n`);
  }
  return 0;
}

/** Os casos do `--autoteste`: o núcleo puro (`buildNginx`, `buildCompose`, a validação) sem disco. */
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
    ['nginx: location para o webPath, nenhuma para o módulo sem tela', () => (
      nginx.includes('location /a/ {') && !nginx.includes('/b/') && nginx.includes('location = /a {'))],
    ['nginx: os tunables de config/deploy.json entram no arquivo', () => (
      nginx.includes('client_max_body_size 5m;') && nginx.includes('proxy_read_timeout 65s;'))],
    ['compose: stop_grace_period = teto + folga, em segundos, arredondado para cima', () => (
      compose.includes('stop_grace_period: 10s')
      && buildCompose({ deploy, drainTimeoutMs: 8001, modules }).includes('stop_grace_period: 11s'))],
    ['compose: uma URL por chave *_DB_URL, para o serviço do banco, sem valor padrão', () => (
      compose.includes('A_DB_URL: "postgres://${DEPLOY_DB_USER:?') && compose.includes('@db:5432/')
      && !compose.includes('B_API_PORT') && !compose.includes(':-'))],
    ['compose: sem chave *_DB_URL, sem bloco environment', () => (
      !buildCompose({ deploy, drainTimeoutMs: 8000, modules: [modules[1]] }).includes('environment:'))],
    ['webPath fora do padrão não vira location (lança)', () => {
      try {
        buildNginx({ deploy, modules: [{ dir: 'x', manifest: { webPath: '/x; return 200' } }] });
        return false;
      } catch {
        return true;
      }
    }],
    ['config: tamanho e inteiros inválidos reprovam; sem front, a chave front não é exigida', () => (
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
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${name}\n`);
  }
  process.stdout.write(`\nautoteste: ${cases.length - failures}/${cases.length} ok\n`);
  return failures === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes('--autoteste')) return runSelfTest();
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    process.stderr.write(`erro: argumento desconhecido "${unknown[0]}" — uso: sync-deploy.mjs [--check|--autoteste]\n`);
    return 2;
  }
  try {
    return run(process.argv.includes('--check'));
  } catch (cause) {
    process.stderr.write(`erro: ${cause.message}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
