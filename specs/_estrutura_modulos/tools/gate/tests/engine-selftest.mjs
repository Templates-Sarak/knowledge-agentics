#!/usr/bin/env node
/**
 * engine-selftest.mjs — o `--selftest` do MOTOR (`engine.mjs`), que `run.mjs` não alcança: o `run.mjs`
 * prova as regras do catálogo contra o molde, e a pergunta da extração (`checkExtraction`) e o quux
 * de dois territórios (`checkRoot`) são do motor, não de regra nenhuma.
 *
 *   node tools/gate/tests/engine-selftest.mjs --selftest
 *
 * O caso que faltava: `checkExtraction` com `consumes[]` na forma REAL do manifesto — objetos
 * `{ module, contract, why }`. O defeito corrigido na onda 5 era ler o campo pelo nome antigo do
 * objeto, e nenhum caso o prendia: o laço seguia verde enquanto `module` chegava `undefined`.
 */
import { RULES, checkExtraction } from '../engine.mjs';
import { buildVocabulary } from '../language.mjs';

const consumer = (overrides) => ({
  dirId: 'billing',
  configs: { ports: { value: { repository: 'postgres' } } },
  manifest: {
    ports: ['repository'],
    requiredEnv: ['BILLING_DB_URL'],
    consumes: [{ module: 'orders', contract: 'GET /summary', why: 'totals' }],
    ...overrides,
  },
});

const messages = (ctx) => checkExtraction(ctx).map((finding) => finding.message);

function extractionCases() {
  return [
    { name: 'checkExtraction: a consumed module without a base-URL variable is reported, by name', fn: () => {
      const found = messages(consumer({}));
      return found.length === 1 && found[0].includes('"orders"') && !found[0].includes('undefined');
    } },
    { name: 'checkExtraction: the variable named after the consumed module satisfies it', fn: () => (
      messages(consumer({ requiredEnv: ['BILLING_DB_URL', 'ORDERS_BASE_URL'] })).length === 0) },
    { name: 'checkExtraction: a kebab-case module id becomes a SNAKE_CASE variable prefix', fn: () => (
      messages(consumer({
        consumes: [{ module: 'order-items', contract: 'GET /summary', why: 'x' }],
        requiredEnv: ['ORDER_ITEMS_BASE_URL'],
      })).length === 0) },
    { name: 'checkExtraction: every consumed module is checked, not only the first', fn: () => (
      messages(consumer({
        consumes: [
          { module: 'orders', contract: 'GET /summary', why: 'x' },
          { module: 'catalog', contract: 'GET /summary', why: 'y' },
        ],
        requiredEnv: ['ORDERS_BASE_URL'],
      })).length === 1) },
    { name: 'checkExtraction: no consumes[] is nothing to report', fn: () => messages(consumer({ consumes: [] })).length === 0 },
    { name: 'checkExtraction: a declared port without an adapter is an error', fn: () => {
      const [finding] = checkExtraction(consumer({ ports: ['repository', 'audit'], consumes: [] }));
      return finding?.severity === 'error' && finding.message.includes('"audit"');
    } },
  ];
}

/** Regra de escopo `module` com `checkRoot`: o MESMO id, rodando uma vez por projeto sobre a fiação. */
function dualTerritoryCases() {
  const rule = RULES.find((candidate) => candidate.id === 'portuguese-identifier');
  const vocabulary = { terms: { quux: 'x' }, cognates: ['data'] };
  const project = (content) => ({
    isProject: true,
    languageVocabulary: vocabulary,
    code: [{ rel: 'src/composition.ts', ext: '.ts', content }],
    rootJson: [],
  });
  return [
    { name: 'dual territory: the rule is registered once, with a module check AND a root check', fn: () => (
      RULES.filter((candidate) => candidate.id === 'portuguese-identifier').length === 1
      && rule.scope === 'module' && typeof rule.check === 'function' && typeof rule.checkRoot === 'function') },
    { name: 'dual territory: the root check reads the composition code', fn: () => (
      rule.checkRoot(project('const quux = 1;')).length === 1) },
    { name: 'dual territory: a cognate and a comment in the composition code are quiet', fn: () => (
      rule.checkRoot(project('// quux\nconst dataBase = 1;')).length === 0) },
    { name: 'dual territory: without modules/ there is no project to judge', fn: () => (
      rule.checkRoot({ ...project('const quux = 1;'), isProject: false }).length === 0) },
    { name: 'dual territory: a missing vocabulary is reported once by the root check, never silent', fn: () => (
      rule.checkRoot({ ...project('const a = 1;'), languageVocabulary: null }).length === 1) },
    { name: 'dual territory: a missing vocabulary keeps the module check quiet (no repetition per module)', fn: () => (
      rule.check({ project: { languageVocabulary: null }, files: [] }).length === 0) },
    { name: 'vocabulary: buildVocabulary exposes terms and cognates the rule relies on', fn: () => {
      const built = buildVocabulary(vocabulary);
      return built.terms.has('quux') && built.cognates.has('data');
    } },
  ];
}

function run() {
  const cases = [...extractionCases(), ...dualTerritoryCases()];
  let failures = 0;
  for (const testCase of cases) {
    let ok = false;
    try { ok = testCase.fn() === true; } catch { ok = false; }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  process.stdout.write(`\nself-test (engine): ${cases.length - failures}/${cases.length} passed\n`);
  return failures === 0 ? 0 : 1;
}

if (process.argv.includes('--selftest')) process.exitCode = run();
else process.stderr.write('Usage: node tools/gate/tests/engine-selftest.mjs --selftest\n');
