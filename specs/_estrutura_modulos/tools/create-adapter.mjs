#!/usr/bin/env node
/**
 * create-adapter.mjs — scaffold determinístico de adapter. Lei dona: specs/arquitetura/01-modulo.md
 * §5.2.
 *
 *   node tools/create-adapter.mjs <port> <provider> [--binding typescript]
 *
 * Mesma forma do `create-module.mjs`: copia o molde (`adapters/_template`, instalado por
 * `create-project.mjs`), substitui marcadores, registra a fábrica em `src/composition.*` e roda o
 * gate. `<port>` tem de estar no vocabulário conhecido (`tools/gate/ports-vocabulary.mjs`)
 * — nome fora dele é rejeitado antes de tocar disco.
 *
 * O molde é um STUB, de propósito: os MÉTODOS de cada interface variam por porta (`Repository`
 * tem quatro, `Notifier` tem um), e um gerador que tentasse produzir o corpo certo por porta
 * precisaria entender a forma de cada interface nas três linguagens — mais caro que o defeito que
 * evitaria. O molde importa nada, devolve um tipo genérico e lança "TODO: implemente" nomeando a
 * porta e o arquivo; o gate NÃO cobra método (não é AST), só isolamento e forma.
 *
 * LIMITE CONHECIDO: `tokenVerifier` é resolvida por `resolveTokenVerifier()`/`resolve_token_verifier()`, não por
 * `FACTORIES` — é a auth ÚNICA do sistema, nunca por-módulo. Registrar um adapter para a porta
 * "tokenVerifier" aqui ACRESCENTA a entrada em `FACTORIES` (coerente com o vocabulário), mas
 * nada a consulta hoje; trocar o provedor de auth continua sendo editar `resolveTokenVerifier()` à mão. Não
 * é bug deste script — é a mesma arquitetura de antes dele. Nome da porta por ADR-010
 * (`specs/adr/000-decisoes-do-template.md`) — era `auth`, e colidia com a auth da fiação.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { KNOWN_PORTS } from './gate/ports-vocabulary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = join(HERE, '..');
const BINDINGS = ['typescript', 'javascript', 'python'];

function abort(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

function readOptions() {
  const rawArgs = process.argv.slice(2);
  const positional = rawArgs.filter((a, i) => !a.startsWith('--') && rawArgs[i - 1]?.startsWith('--') !== true);
  const flagValue = (name, defaultValue) => {
    const index = rawArgs.indexOf(`--${name}`);
    return index === -1 ? defaultValue : rawArgs[index + 1];
  };
  return { port: positional[0], provider: positional[1], binding: flagValue('binding', 'typescript') };
}

function validateOptions(options) {
  if (options.port === undefined || options.provider === undefined) {
    abort('Usage: create-adapter.mjs <port> <provider> [--binding b]');
  }
  if (!KNOWN_PORTS.includes(options.port)) {
    abort(`port "${options.port}" is outside the vocabulary — choose one of: ${KNOWN_PORTS.join(', ')}`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(options.provider)) {
    abort(`provider "${options.provider}" is invalid — use lowercase kebab-case`);
  }
  if (!BINDINGS.includes(options.binding)) {
    abort(`binding "${options.binding}" is invalid — choose from ${BINDINGS.join(', ')}`);
  }
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
 * Acha o molde, no mesmo precedente de `create-module.mjs:findTemplate`: primeiro o que
 * `create-project.mjs` instalou no projeto (`adapters/_template`), depois o do próprio template —
 * o segundo é o que faz este comando funcionar rodado de DENTRO do repositório do template.
 */
function findTemplate(projectRoot, binding) {
  const candidates = [
    join(projectRoot, 'adapters', '_template'),
    join(TOOL_ROOT, 'bindings', binding, '_adapter'),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** PascalCase a partir de kebab-case — "aws-s3" -> "AwsS3". Mesmo uso de `<Module>` em criar-modulo. */
function toPascalCase(kebab) {
  return kebab.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/**
 * Nome de pasta/import do adapter — kebab-case em TS/JS (onde funciona: nome de pasta e chave de
 * objeto CITADA aceitam hífen), snake_case só em Python, onde o hífen não é uma preferência de
 * estilo e sim ilegal em `import`/nome de módulo (regra da linguagem, não deste script). A
 * IDENTIDADE do provedor (o que vai em `config/ports.json`, na chave string de `FACTORIES` e na
 * mensagem pro usuário) continua kebab-case nos três bindings — só a pasta física em disco e o
 * caminho de import Python sofrem a conversão. ADR-011.
 */
function adapterDir(binding, provider) {
  return binding === 'python' ? provider.replaceAll('-', '_') : provider;
}

/**
 * `<provider-folder>` é um marcador À PARTE de `<provider>`: identidade (nome do adapter, "Adapter
 * disco-frio para a porta...") continua kebab-case sempre, mas a referência a CAMINHO EM DISCO
 * (`adapters/<pasta>/__init__.py` no TODO do molde Python) precisa apontar pro nome de pasta real
 * — que diverge da identidade quando `adapterDir` converte pra snake_case. Sem o marcador
 * separado, o TODO gerado apontaria pra uma pasta que não existe.
 */
function replaceMarkers(text, port, provider, dir) {
  return text.replaceAll('<port>', port).replaceAll('<provider-folder>', dir).replaceAll('<provider>', provider);
}

/**
 * O nome fixo que o molde usa — nunca marcador, para o arquivo em disco continuar sintaticamente
 * válido SEMPRE, mesmo sem substituição (a mesma garantia de `modules/_template`, cujos marcadores
 * vivem só em comentário/string). Este script troca o nome pelo do provedor NA CÓPIA, não no molde.
 *
 * `createAdapter`, não `criarAdapter`: é o que os moldes `_adapter/index.{ts,js}` REALMENTE
 * exportam (medido) — o molde é a verdade (mesmo precedente das âncoras de `registerFactory*`).
 * A forma antiga (`criarAdapter`) nunca casava com `\breplaceAll\b`, e a rescrita nunca disparava:
 * TODO adapter TS/JS já criado manteve `export function createAdapter` no arquivo, enquanto
 * `composition.*` importava o nome CORRETO (`criarG`, calculado, nunca escrito) — `tsc` reprova ao
 * primeiro adapter novo, mas nada rodava `tsc` depois de `create-adapter.mjs` até esta rede existir.
 */
const GENERIC_NAME = { typescript: 'createAdapter', javascript: 'createAdapter', python: 'PendingAdapter' };

function providerName(binding, provider) {
  const pascal = toPascalCase(provider);
  return binding === 'python' ? pascal : `criar${pascal}`;
}

function copyAndAdaptTemplate(template, destination, options) {
  mkdirSync(destination, { recursive: true });
  cpSync(template, destination, { recursive: true });

  const newName = providerName(options.binding, options.provider);
  const generic = GENERIC_NAME[options.binding];
  const dir = adapterDir(options.binding, options.provider);
  for (const name of readdirSync(destination)) {
    const path = join(destination, name);
    const replaced = replaceMarkers(readText(path), options.port, options.provider, dir)
      .replaceAll(new RegExp(`\\b${generic}\\b`, 'g'), newName);
    writeFileSync(path, replaced, 'utf8');
  }
  return newName;
}

/**
 * Registra a fábrica nova em `src/composition.*`, por SUBSTITUIÇÃO DE TEXTO — mesma técnica de
 * `generate-port-schemas.mjs:withUpdatedPortsEnum`. Duas formas: a porta JÁ tem entrada
 * (acrescenta um provedor a mais na MESMA linha) ou é porta NOVA (acrescenta uma linha antes do
 * fechamento do objeto). Devolve `null` se nenhuma das duas âncoras bateu — o chamador ABORTA em
 * vez de escrever um arquivo quebrado.
 */
function registerFactoryTs(content, { port, provider, symbolName, importPath }) {
  const importLine = "} from '../adapters/memory/index.js';";
  const withImport = content.includes(importLine)
    ? content.replace(importLine, `${importLine}\nimport { ${symbolName} } from '${importPath}';`)
    : null;
  if (withImport === null) return null;

  const portLine = new RegExp(`(  ${port}: \\{ [^}]*)( \\},\\n)`);
  if (portLine.test(withImport)) {
    // Chave CITADA: `provedor` é kebab-case (validateOptions aceita hífen, e a mensagem de erro da
    // ferramenta recomenda o formato), e chave de objeto sem aspas com `-` é erro de sintaxe —
    // `storage: { memory: ..., disco-frio: ... }` nunca parseava. Citar um identificador que já
    // era válido continua legal em JS/TS, então provedores sem hífen não regridem.
    return withImport.replace(portLine, `$1, '${provider}': () => ${symbolName}()$2`);
  }
  // `[^>]*` no lugar da assinatura do parâmetro (em vez de `\(\)` fixo): o molde real declara
  // `(module: DiscoveredManifest) => unknown`, não `() => unknown` — a âncora antiga, presa à
  // forma SEM parâmetro, nunca casava contra o molde de verdade. Medido: a única porta que hoje
  // alcança este ramo (`FACTORIES` já tem as outras seis) sai com "nao encontrei onde registrar a
  // fabrica", sempre. `[^>]*` tolera qualquer assinatura de parâmetro futura sem reabrir o mesmo
  // drift — só não atravessa o `>>` de fechamento do genérico.
  const objectOpening = /(const FACTORIES: Record<string, Record<string, [^>]*=> unknown>> = \{\n)/;
  if (!objectOpening.test(withImport)) return null;
  return withImport.replace(objectOpening, `$1  ${port}: { '${provider}': () => ${symbolName}() },\n`);
}

function registerFactoryJs(content, { port, provider, symbolName, importPath }) {
  const importLine = "} from '../adapters/memory/index.js';";
  const withImport = content.includes(importLine)
    ? content.replace(importLine, `${importLine}\nimport { ${symbolName} } from '${importPath}';`)
    : null;
  if (withImport === null) return null;

  const portLine = new RegExp(`(  ${port}: \\{ [^}]*)( \\},\\n)`);
  if (portLine.test(withImport)) {
    // Mesma razão da versão TS acima: chave CITADA, porque `provedor` pode ter hífen.
    return withImport.replace(portLine, `$1, '${provider}': () => ${symbolName}()$2`);
  }
  const objectOpening = /(const FACTORIES = \{\n)/;
  if (!objectOpening.test(withImport)) return null;
  return withImport.replace(objectOpening, `$1  ${port}: { '${provider}': () => ${symbolName}() },\n`);
}

function registerFactoryPy(content, { port, provider, symbolName, importPath }) {
  // A âncora e o ULTIMO import antes do comentario, seja ele qual for — nao mais o `)` do import
  // multilinha de `adapters.memory` especificamente. O molde real ja tem uma SEGUNDA linha de
  // import entre os dois (`from adapters.postgres import ...`), e a ancora antiga, presa ao `)`,
  // nunca casava contra o molde de verdade: `create-adapter.mjs --binding python` falhava para
  // TODA porta, sempre (medido). Ancorar na linha em branco + comentario,
  // em vez do caractere que a precede, sobrevive a uma terceira linha de import que venha a existir.
  const importLine = '\n\n# Fabrica de adapter';
  const withImport = content.includes(importLine)
    ? content.replace(importLine, `\nfrom ${importPath} import ${symbolName}\n\n# Fabrica de adapter`)
    : null;
  if (withImport === null) return null;

  const portLine = new RegExp(`(    "${port}": \\{[^}]*)(\\},\\n)`);
  if (portLine.test(withImport)) {
    return withImport.replace(portLine, `$1, "${provider}": ${symbolName}$2`);
  }
  // Mesmo drift do TS (linha 147, `[^>]*`): o molde real declara
  // `Callable[[dict[str, Any]], Any]` (o adapter recebe o manifesto), nao `Callable[[], Any]`
  // (sem parametro) — a ancora antiga so casava a forma vazia. `.*` no lugar da lista de
  // parametros tolera qualquer assinatura, presente ou futura, sem reabrir o mesmo drift.
  const objectOpening = /(FACTORIES: dict\[str, dict\[str, Callable\[.*\]\]\] = \{\n)/;
  if (!objectOpening.test(withImport)) return null;
  return withImport.replace(objectOpening, `$1    "${port}": {"${provider}": ${symbolName}},\n`);
}

function compositionPath(projectRoot, binding) {
  const name = binding === 'python' ? 'composition.py' : `composition.${binding === 'typescript' ? 'ts' : 'js'}`;
  return join(projectRoot, 'src', name);
}

function registerFactory(projectRoot, options, generatedName) {
  const path = compositionPath(projectRoot, options.binding);
  const content = readText(path);

  const dir = adapterDir(options.binding, options.provider);
  const updated = options.binding === 'python'
    ? registerFactoryPy(content, {
      port: options.port, provider: options.provider, symbolName: generatedName,
      importPath: `adapters.${dir}`,
    })
    : (options.binding === 'typescript' ? registerFactoryTs : registerFactoryJs)(content, {
      port: options.port, provider: options.provider, symbolName: generatedName,
      importPath: `../adapters/${dir}/index.js`,
    });

  if (updated === null) {
    abort(
      `Could not find the factory registration point in ${path}; the expected anchors changed. `
      + 'Register the adapter import and its FACTORIES entry manually.',
    );
  }
  writeFileSync(path, updated, 'utf8');
}

function runGate(projectRoot) {
  try {
    process.stdout.write(execFileSync(
      process.execPath,
      [join(projectRoot, 'tools', 'gate', 'validate.mjs'), '--all'],
      { encoding: 'utf8', cwd: projectRoot },
    ));
  } catch (cause) {
    process.stdout.write(cause.stdout ?? '');
    process.stderr.write('\nThe adapter was created, but the gate reported issues above; resolve them before committing.\n');
    process.exit(1);
  }
}

// ================================================================================================
// AUTOTESTE — núcleo puro (toPascalCase/providerName/replaceMarkers/registerFactory{Ts,Js,Py})
// contra fixtures em memória, sem tocar disco. Precedente de `verify-map.mjs`/`verify-catalog.mjs`.
//
// As fixtures de `registerFactory*` são cópias FIÉIS do trecho real de cada `bindings/<b>/root/
// src/composition.*` — não simplificadas — porque o valor deste autoteste é justamente flagrar quando
// a ÂNCORA do regex e o arquivo real se separam. Foi rodando este autoteste contra o texto real,
// antes do refactor de §4.7 (`max-params`), que dois bugs pré-existentes apareceram — nenhum era do
// refactor, e os dois foram corrigidos na mesma rodada:
//
// (1) TS: o tipo de `FACTORIES` no molde real é `Record<string, Record<string, (modulo:
//     DiscoveredManifest) => unknown>>`, mas a âncora de "porta nova" em `registerFactoryTs`
//     esperava `() => unknown` (sem parâmetro) — drift entre o gerador e o molde. Consertado:
//     `[^>]*` no lugar da assinatura do parâmetro, tolerante à forma sem reabrir o mesmo drift.
// (2) Python: a âncora de importação em `registerFactoryPy` era `)\n\n# Fabrica de adapter`, presa
//     ao `)` do import multilinha de `adapters.memory` seguido direto de linha em branco. O molde
//     real tem uma SEGUNDA linha de import (`from adapters.postgres import ...`) entre os dois, e a
//     âncora nunca casava — `--binding python` falhava SEMPRE, para qualquer porta. Consertado:
//     âncora movida para a linha em branco + comentário, que sobrevive a uma terceira linha de
//     import que venha a existir.
// ================================================================================================

const FIXTURE_TS_TEMPLATE_REAL = [
  "import {",
  '  createRepository,',
  "} from '../adapters/memory/index.js';",
  "import { createPostgresRepository } from '../adapters/postgres/index.js';",
  '',
  'const FACTORIES: Record<string, Record<string, (module: DiscoveredManifest) => unknown>> = {',
  '  repository: { memory: () => createRepository() },',
  '};',
  '',
].join('\n');

const FIXTURE_JS_TEMPLATE_REAL = [
  "import {",
  '  createRepository,',
  "} from '../adapters/memory/index.js';",
  '',
  'const FACTORIES = {',
  '  repository: { memory: () => createRepository() },',
  '};',
  '',
].join('\n');

const FIXTURE_PY_TEMPLATE_REAL = [
  'from adapters.memory import (',
  '    InMemoryRepository,',
  ')',
  'from adapters.postgres import PostgresAudit, PostgresRepository',
  '',
  '# Fabrica de adapter por (porta, provedor).',
  'FACTORIES: dict[str, dict[str, Callable[[dict[str, Any]], Any]]] = {',
  '    "repository": {"memory": lambda modulo: InMemoryRepository()},',
  '}',
  '',
].join('\n');

// A mesma forma do molde Python, mas SEM a segunda linha de import — prova que a lógica de
// `registerFactoryPy` funciona quando a âncora bate; o que falta hoje é o molde ter se afastado
// dela, não a função estar quebrada por dentro.
const FIXTURE_PY_ISOLATED_ANCHOR = [
  'from adapters.memory import (',
  '    InMemoryRepository,',
  ')',
  '',
  '# Fabrica de adapter por (porta, provedor).',
  'FACTORIES: dict[str, dict[str, Callable[[], Any]]] = {',
  '    "repository": {"memory": lambda: InMemoryRepository()},',
  '}',
  '',
].join('\n');

/** Atalho só do autoteste — monta o objeto de parâmetros na ordem posicional antiga, para os
 * casos ficarem tão tersos quanto eram antes do refactor de §4.7 (`max-params`). */
function factoryParams(port, provider, symbolName, importPath) {
  return { port, provider, symbolName, importPath };
}

function pureCases() {
  return [
    { name: 'toPascalCase: kebab-case with a hyphen becomes PascalCase', fn: () => toPascalCase('aws-s3') === 'AwsS3' },
    { name: 'toPascalCase: a single word is capitalized', fn: () => toPascalCase('okta') === 'Okta' },
    { name: 'providerName: TypeScript adds the create prefix', fn: () => providerName('typescript', 'okta') === 'criarOkta' },
    { name: 'providerName: JavaScript adds the create prefix', fn: () => providerName('javascript', 'okta') === 'criarOkta' },
    { name: 'providerName: Python uses PascalCase without a prefix', fn: () => providerName('python', 'okta') === 'Okta' },
    { name: 'replaceMarkers: replaces <port> and <provider>', fn: () => replaceMarkers('<port> e <provider>', 'auth', 'okta', 'okta') === 'auth e okta' },
    {
      name: 'replaceMarkers: replaces <provider-folder> separately from <provider>',
      fn: () => replaceMarkers('<provider> em <provider-folder>', 'x', 'disco-frio', 'disco_frio') === 'disco-frio em disco_frio',
    },
    { name: 'adapterDir: Python converts hyphens to underscores', fn: () => adapterDir('python', 'disco-frio') === 'disco_frio' },
    { name: 'adapterDir: TypeScript and JavaScript preserve kebab-case', fn: () => adapterDir('typescript', 'disco-frio') === 'disco-frio' && adapterDir('javascript', 'disco-frio') === 'disco-frio' },
  ];
}

function registrationCasesTs() {
  return [
    {
      name: 'registerFactoryTs: an existing port gains a provider on the same line and an import',
      fn: () => {
        const r = registerFactoryTs(FIXTURE_TS_TEMPLATE_REAL, factoryParams('repository', 'dynamo', 'criarDynamo', '../adapters/dynamo/index.js'));
        return r !== null
          && r.includes("repository: { memory: () => createRepository(), 'dynamo': () => criarDynamo() },")
          && r.includes("import { criarDynamo } from '../adapters/dynamo/index.js';");
      },
    },
    {
      name: 'registerFactoryTs: a new tokenVerifier port is registered',
      fn: () => {
        const r = registerFactoryTs(FIXTURE_TS_TEMPLATE_REAL, factoryParams('tokenVerifier', 'okta', 'criarOkta', '../adapters/okta/index.js'));
        return r !== null && r.includes("tokenVerifier: { 'okta': () => criarOkta() },");
      },
    },
    {
      name: 'registerFactoryTs: returns null when the import line is missing',
      fn: () => registerFactoryTs('nada de import aqui', factoryParams('repository', 'x', 'y', 'z')) === null,
    },
    {
      name: 'registerFactoryTs: a hyphenated provider is quoted as a key',
      fn: () => {
        const r = registerFactoryTs(FIXTURE_TS_TEMPLATE_REAL, factoryParams('repository', 'disco-frio', 'criarDiscoFrio', '../adapters/disco-frio/index.js'));
        return r !== null && r.includes("repository: { memory: () => createRepository(), 'disco-frio': () => criarDiscoFrio() },");
      },
    },
  ];
}

function registrationCasesJs() {
  return [
    {
      name: 'registerFactoryJs: an existing port gains a provider and an import',
      fn: () => {
        const r = registerFactoryJs(FIXTURE_JS_TEMPLATE_REAL, factoryParams('repository', 'dynamo', 'criarDynamo', '../adapters/dynamo/index.js'));
        return r !== null
          && r.includes("repository: { memory: () => createRepository(), 'dynamo': () => criarDynamo() },")
          && r.includes("import { criarDynamo } from '../adapters/dynamo/index.js';");
      },
    },
    {
      name: 'registerFactoryJs: a new tokenVerifier port works without a type signature',
      fn: () => {
        const r = registerFactoryJs(FIXTURE_JS_TEMPLATE_REAL, factoryParams('tokenVerifier', 'okta', 'criarOkta', '../adapters/okta/index.js'));
        return r !== null && r.includes("tokenVerifier: { 'okta': () => criarOkta() },");
      },
    },
    {
      name: 'registerFactoryJs: a hyphenated provider is quoted as a key',
      fn: () => {
        const r = registerFactoryJs(FIXTURE_JS_TEMPLATE_REAL, factoryParams('repository', 'disco-frio', 'criarDiscoFrio', '../adapters/disco-frio/index.js'));
        return r !== null && r.includes("repository: { memory: () => createRepository(), 'disco-frio': () => criarDiscoFrio() },");
      },
    },
  ];
}

function registrationCasesPy() {
  return [
    {
      name: 'registerFactoryPy: current template registers an existing port',
      fn: () => {
        const r = registerFactoryPy(FIXTURE_PY_TEMPLATE_REAL, factoryParams('repository', 'dynamo', 'DynamoRepository', 'adapters.dynamo'));
        return r !== null
          && r.includes('"repository": {"memory": lambda modulo: InMemoryRepository(), "dynamo": DynamoRepository}')
          && r.includes('from adapters.dynamo import DynamoRepository');
      },
    },
    {
      name: 'registerFactoryPy: current template registers a new tokenVerifier port',
      fn: () => {
        const r = registerFactoryPy(FIXTURE_PY_TEMPLATE_REAL, factoryParams('tokenVerifier', 'okta', 'VerificadorOkta', 'adapters.okta'));
        return r !== null && r.includes('"tokenVerifier": {"okta": VerificadorOkta}');
      },
    },
    {
      name: 'registerFactoryPy: simpler template without a second import line still registers',
      fn: () => {
        const r = registerFactoryPy(FIXTURE_PY_ISOLATED_ANCHOR, factoryParams('repository', 'dynamo', 'DynamoRepository', 'adapters.dynamo'));
        return r !== null
          && r.includes('"repository": {"memory": lambda: InMemoryRepository(), "dynamo": DynamoRepository}')
          && r.includes('from adapters.dynamo import DynamoRepository');
      },
    },
  ];
}

function selfTestCases() {
  return [...pureCases(), ...registrationCasesTs(), ...registrationCasesJs(), ...registrationCasesPy()];
}

function runSelfTest() {
  let failures = 0;
  for (const testCase of selfTestCases()) {
    let ok;
    try {
      ok = testCase.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  const total = selfTestCases().length;
  process.stdout.write(`\nself-test (create-adapter): ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

function main() {
  const options = readOptions();
  validateOptions(options);

  const projectRoot = findProjectRoot();
  const template = findTemplate(projectRoot, options.binding);
  if (template === null) abort('Adapter template not found (adapters/_template is missing — run this inside a project created by create-project.mjs)');

  const dir = adapterDir(options.binding, options.provider);
  const destination = join(projectRoot, 'adapters', dir);
  if (existsSync(destination)) abort(`Adapter "${options.provider}" already exists at ${destination}`);

  const generatedName = copyAndAdaptTemplate(template, destination, options);
  registerFactory(projectRoot, options, generatedName);

  process.stdout.write(`Adapter "${options.provider}" created at adapters/${dir} (port "${options.port}")\n`);
  process.stdout.write('Validating...\n');
  runGate(projectRoot);
  process.stdout.write(
    `\nNext: implement the methods for "${options.port}" in adapters/${dir}/`
    + `${options.binding === 'python' ? '__init__.py' : 'index.' + (options.binding === 'typescript' ? 'ts' : 'js')}`
    + `, then declare "${options.port}": "${options.provider}" in config/ports.json for the module that uses it.\n`,
  );
}

if (process.argv.includes('--selftest')) {
  process.exit(runSelfTest());
} else {
  main();
}
