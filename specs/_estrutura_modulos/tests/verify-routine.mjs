#!/usr/bin/env node
/**
 * verify-routine.mjs — a verificação ponta a ponta do template, como UM comando em vez de
 * prosa que alguém precisa lembrar de rodar. Lei dona: nenhuma — ferramenta de manutenção do
 * TEMPLATE, como `template-self-test.mjs` e as demais de `tests/` (§4.6).
 *
 *   node tests/verify-routine.mjs             roda o roteiro inteiro (A–G), ~5 min — a camada 3 domina
 *   node tests/verify-routine.mjs --selftest prova o núcleo (contagem, achado de termo) com fixtures
 *
 * Antes desta ferramenta, §11.2 era comando + comentário `# esperado: N` — verde ou vermelho vivia
 * na cabeça de quem rodou, e um número que divergisse ficava só na prosa até a PRÓXIMA verificação
 * manual. Aqui cada `# esperado` virou uma comparação de verdade: diverge, reprova, nomeia os dois
 * lados. Em particular fecha a lacuna que a camada 2 sozinha não fecha (`gate/tests/run.mjs` conta
 * "N regras com caso de teste" mas nunca compara contra `REGRAS.length` — regra nova sem caso não
 * derrubava nada, só encolhia um número que ninguém olhava).
 *
 * NÚCLEO × CASCA, precedente de `verify-map.mjs`/`verify-catalog.mjs`: `compareValue` e
 * `termOccurrences` são puras. A CASCA orquestra os processos reais (node, python) nas mesmas
 * pastas temporárias que o roteiro em prosa descreve, e reusa `classifyStep` de
 * `template-self-test.mjs` em vez de reimplementar "o que é um `spawnSync` que deu certo".
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyStep } from './template-self-test.mjs';
import { RULES } from '../tools/gate/engine.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha até a marca "CASCA" toca `fs` nem `child_process`.
// ================================================================================================

/** Comparação genérica por valor (número, string ou objeto via forma canônica). Um formato só de
 * resultado para toda afirmação do roteiro — é o que deixa a saída previsível de A a G. */
export function compareValue(label, obtained, expected) {
  const matched = JSON.stringify(obtained) === JSON.stringify(expected);
  return {
    ok: matched,
    label,
    detail: matched ? null : `expected ${JSON.stringify(expected)}, received ${JSON.stringify(obtained)}`,
  };
}

/** Quantas vezes `id: '` aparece no texto de um arquivo de família de regras — o mesmo recorte que
 * o `grep -c "id: '"` do §11.2 faz, só que em JS puro (portável, sem depender de `grep` no PATH). */
export function countRuleIds(text) {
  return (text.match(/id:\s*'/g) ?? []).length;
}

/** De uma lista `{ path, text }` (já lida pela casca), os caminhos cujo texto cita `termo` — o
 * núcleo do "o que vazou da base para o projeto gerado" (§11.2 F). Pura: não decide QUAIS arquivos
 * ler, só filtra o que já foi lido. */
export function termOccurrences(filesWithText, term) {
  return filesWithText.filter(({ text }) => text.includes(term)).map(({ path }) => path);
}

// ================================================================================================
// CASCA — toca disco, `child_process` e ambiente.
// ================================================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = join(HERE, '..');
const BASE_ROOT = join(TEMPLATE_ROOT, '..', '..');
const NODE = process.execPath;
const IGNORE_SCAN = new Set(['node_modules', '.git', '.venv', '__pycache__']);

function runNode(args, cwd) {
  return spawnSync(NODE, args, { cwd, encoding: 'utf8', shell: false });
}

function resolvePython() {
  const candidates = [process.env.SARAK_PYTHON, 'python', 'python3'].filter(Boolean);
  return candidates.find((c) => spawnSync(c, ['--version'], { shell: false }).status === 0) ?? null;
}

function runPython(executable, args, cwd) {
  return spawnSync(executable, args, { cwd, encoding: 'utf8', shell: false });
}

/** Passo = `{ nome, fn }`; `fn` devolve `{ ok, detalhe }` OU lança (a exceção vira `FALHA` também —
 * um passo que explode não deve derrubar o roteiro inteiro, só marcar a si mesmo). */
function runStep(name, fn) {
  try {
    const r = fn();
    return { name, ok: r.ok === true, detail: r.detail ?? null };
  } catch (cause) {
    return { name, ok: false, detail: `exception: ${cause.message}` };
  }
}

function fromProcess(spawnResult) {
  const c = classifyStep(spawnResult);
  return { ok: c.ok, detail: c.ok ? null : `${c.reason} — ${[spawnResult?.stdout, spawnResult?.stderr].filter(Boolean).join(' | ').slice(0, 300)}` };
}

/** Varre uma árvore inteira (arquivo por arquivo) devolvendo `{ path relativo, text }` — só de
 * texto (extensões conhecidas), para o achado de termo de F não estourar em binário. */
function readTree(root) {
  const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.json', '.md', '.yaml', '.yml']);
  const findings = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (IGNORE_SCAN.has(entry.name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) { stack.push(path); continue; }
      if (!EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) continue;
      findings.push({ path: relative(root, path).split('\\').join('/'), text: readFileSync(path, 'utf8') });
    }
  }
  return findings;
}

// ── A. as quatro camadas de auto-verificação (§4.1) ────────────────────────────────────────────

const EXPECTED_TOTAL_BY_BINDING = { typescript: 136, javascript: 136, python: 131 };

function layer2Steps() {
  return Object.keys(EXPECTED_TOTAL_BY_BINDING).map((binding) => ({
    name: `layer 2 — ${binding}`,
    fn: () => {
      const result = runNode([join(TEMPLATE_ROOT, 'tools', 'gate', 'tests', 'run.mjs'), '--binding', binding], BASE_ROOT);
      const proc = fromProcess(result);
      if (!proc.ok) return proc;
      const output = result.stdout ?? '';
      const totalOk = output.match(/binding \w+: (\d+)\/(\d+) passed/);
      if (totalOk === null) return { ok: false, detail: 'output is missing the "binding X: N/N passed" line' };
      const [, ok, total] = totalOk;
      if (ok !== total) return { ok: false, detail: `${ok}/${total} — failures were reported with exit code 0` };
      // A CATRACA que faltava: `run.mjs` conta "N regras com caso de teste" mas nunca compara contra
      // o catalogo. Regra nova sem caso encolhia esse numero em silencio — aqui ele reprova.
      const coverage = output.match(/(\d+) rules with test cases/);
      if (coverage === null) return { ok: false, detail: 'output is missing the "N rules with test cases" line' };
      return compareValue('rules with test cases', Number(coverage[1]), RULES.length);
    },
  }));
}

function restSteps() {
  return [
    {
      name: 'layer 4: no orphan --selftest entry',
      fn: () => fromProcess(runNode([join(TEMPLATE_ROOT, 'tests', 'run-all-selftests.mjs')], BASE_ROOT)),
    },
    {
      name: 'layer 3: the template tests itself',
      fn: () => {
        const result = runNode([join(TEMPLATE_ROOT, 'tests', 'template-self-test.mjs')], BASE_ROOT);
        const proc = fromProcess(result);
        if (!proc.ok) return proc;
        const matches = /3\/3 bindings passed/.test(result.stdout ?? '');
        return { ok: matches, detail: matches ? null : 'output is missing "3/3 bindings passed"' };
      },
    },
    {
      name: 'typecheck:tools',
      fn: () => fromProcess(runNode([join(BASE_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--project', 'tsconfig.tools-check.json'], BASE_ROOT)),
    },
  ];
}

// ── B. o catálogo de regras (§4.2) ──────────────────────────────────────────────────────────────

const EXPECTED_FAMILIES = {
  configuration: 21, contract: 11, data: 8, isolation: 12, operation: 14, structure: 11, writing: 5,
};

function catalogSteps() {
  const rulesDir = join(TEMPLATE_ROOT, 'tools', 'gate', 'rules');
  const byFamily = () => {
    const findings = {};
    for (const file of readdirSync(rulesDir).filter((n) => n.endsWith('.mjs'))) {
      findings[file.replace('.mjs', '')] = countRuleIds(readFileSync(join(rulesDir, file), 'utf8'));
    }
    return findings;
  };
  const countBy = (key) => RULES.reduce((a, r) => ({ ...a, [r[key]]: (a[r[key]] ?? 0) + 1 }), {});
  const countBySeverity = () => RULES.reduce((counts, rule) => {
    counts[rule.severity] = (counts[rule.severity] ?? 0) + 1;
    return counts;
  }, {});

  return [
    { name: 'catalog: total rule count', fn: () => compareValue('rules', RULES.length, 82) },
    { name: 'catalog: counts by scope', fn: () => compareValue('scope', countBy('scope'), { module: 61, root: 17, global: 4 }) },
    { name: 'catalog: counts by severity', fn: () => compareValue('severity', countBySeverity(), { error: 78, warning: 4 }) },
    { name: 'catalog: counts by family', fn: () => compareValue('family', byFamily(), EXPECTED_FAMILIES) },
    {
      // O terceiro argumento varre `tools/**` atras de "N regras com caso"/"N regras suas"
      // defasada — o defeito medido em `affected.mjs`/`contract-compatible.mjs`/`gate/context.mjs`
      // (73/74/57 contra o 76/58 real). So `tools/**`, nunca `.md` — limite declarado em
      // `verify-catalog.mjs` e em `04-regras.md` §7.2.
      name: 'catalog: doctrine and code ids and tools counts agree',
      fn: () => fromProcess(runNode([
        join(HERE, 'verify-catalog.mjs'), '--check',
        join(TEMPLATE_ROOT, 'doutrina', '04-regras.md'), join(TEMPLATE_ROOT, 'tools', 'gate', 'engine.mjs'),
        join(TEMPLATE_ROOT, 'tools'),
      ], BASE_ROOT)),
    },
    {
      // KNOWN_PORTS duplicada a mao em cinco lugares, nada comparava — a mesma disciplina
      // da checagem de ids acima, aplicada ao vocabulario de portas em vez do catalogo de regras.
      name: 'catalog: port vocabulary matches across five sources',
      fn: () => fromProcess(runNode([join(HERE, 'verify-catalog.mjs'), '--check-vocabulary', TEMPLATE_ROOT], BASE_ROOT)),
    },
    {
      // `renamed-rules.json` viaja com o gate e e GERADO da tabela do ADR-024: se o ADR mudar e o arquivo
      // nao, a dica de renomeacao da excecao mandaria o dono para um id que o gate nao conhece.
      name: 'catalog: shipped rename table matches ADR-024 and the catalog',
      fn: () => fromProcess(runNode([
        join(HERE, 'verify-catalog.mjs'), '--check-renames',
        join(TEMPLATE_ROOT, 'doutrina', 'adr', 'decisoes.md'),
        join(TEMPLATE_ROOT, 'tools', 'gate', 'renamed-rules.json'),
        join(TEMPLATE_ROOT, 'tools', 'gate', 'engine.mjs'),
      ], BASE_ROOT)),
    },
  ];
}

// ── C. os dois manifestos (§2.1) ────────────────────────────────────────────────────────────────

function manifestSteps() {
  const schemas = join(TEMPLATE_ROOT, 'tools', 'gate', 'schemas');
  return [
    {
      name: 'manifest: module.schema.json',
      fn: () => {
        const s = JSON.parse(readFileSync(join(schemas, 'module.schema.json'), 'utf8'));
        return compareValue('module.schema', { requiredCount: s.required.length, additionalProperties: s.additionalProperties }, { requiredCount: 19, additionalProperties: false });
      },
    },
    {
      name: 'manifest: project.schema.json',
      fn: () => {
        const s = JSON.parse(readFileSync(join(schemas, 'project.schema.json'), 'utf8'));
        return compareValue('project.schema', { required: s.required, additionalProperties: s.additionalProperties }, { required: ['requiredEnv'], additionalProperties: false });
      },
    },
  ];
}

// ── D. rotas obrigatórias (§2) e o que não viaja (§4.6) ─────────────────────────────────────────

function routeAndTestSteps() {
  return [
    {
      name: 'required routes in contract.mjs',
      fn: () => {
        const text = readFileSync(join(TEMPLATE_ROOT, 'tools', 'gate', 'rules', 'contract.mjs'), 'utf8');
        const matches = ['/health', '/meta', '/summary'].every((route) => text.includes(`'${route}'`));
        return { ok: matches, detail: matches ? null : 'contract.mjs does not declare all three required routes' };
      },
    },
    {
      // 8: os sete de antes + `verify-language-parity.mjs` (a prova de concordância entre o gate e o medidor, ADR-023 onda 6). Antes: os cinco de antes + `supervise.mjs` (casca de processo do autoteste do template — teto e
      // encerramento da arvore). `shutdown-proof.py` e `.json` nao entram: so `.mjs` e contado.
      name: 'maintenance tools: exactly 8 .mjs files in tests/',
      fn: () => compareValue('.mjs files in tests/', readdirSync(HERE).filter((n) => n.endsWith('.mjs')).length, 8),
    },
  ];
}

// ── E. a declaração de módulo (§5.1) ────────────────────────────────────────────────────────────

function moduleRejectionSteps(python) {
  if (python === null) {
    return [{ name: 'module declaration (E)', ok: false, detail: 'no Python interpreter was resolved (SARAK_PYTHON/python/python3)', skipped: true }];
  }
  const initRepo = join(BASE_ROOT, 'skills', 'meta-iniciar-repositorio', 'scripts', 'init_repo.py');
  const cases = [
    { target: 'fe-t1', args: ['--modules', 'catalog'] },
    { target: 'fe-t2', args: ['--modules', 'hub:connector:artifact'] },
  ];
  return cases.map(({ target, args }) => ({
    name: `invalid-shape rejection — ${args.join(' ')}`,
    fn: () => {
      // O PAI é único por `mkdtemp` (como o passo F) — nunca o `destino`: a afirmação é que
      // `init_repo.py` REJEITADO não cria o destino, e um `destino` pré-criado por `mkdtemp`
      // tornaria essa afirmação vazia (sempre "existe", qualquer que fosse o comportamento real).
      // Caminho fixo aqui (medido, Onda 3) colidia entre duas instâncias simultâneas — a segunda
      // apagava o alvo da primeira no meio do teste e morria sem saída, parecendo defeito do
      // template.
      const parent = mkdtempSync(join(tmpdir(), 'sarak-verify-routine-rejeicao-'));
      try {
        const destination = join(parent, target);
        const result = runPython(python, [initRepo, '--target', destination, ...args], BASE_ROOT);
        if (result.status !== 1) return { ok: false, detail: `expected exit 1, received ${result.status}` };
        if (existsSync(destination)) return { ok: false, detail: `${destination} was created — rejection should leave no destination` };
        return { ok: true };
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    },
  }));
}

// ── F + G. o que viaja para o projeto gerado, e a camada 1 nele (§1.3, §4.1, §4.3) ─────────────

function generatedProjectSteps(python) {
  const destination = mkdtempSync(join(tmpdir(), 'sarak-verify-routine-fe-p-'));
  const t = (...parts) => join(destination, ...parts);
  const steps = [
    {
      name: 'F: create-project generates the project',
      fn: () => fromProcess(runNode([join(TEMPLATE_ROOT, 'tools', 'create-project.mjs'), destination, '--binding', 'typescript', '--scope', 'acme'], BASE_ROOT)),
    },
    {
      name: 'F: verify-map check passes in the generated project',
      fn: () => fromProcess(runNode([join(HERE, 'verify-map.mjs'), '--check', t('specs', 'arquitetura')], BASE_ROOT)),
    },
    {
      name: 'F: no _estrutura_modulos leak beyond the declared line',
      fn: () => {
        const findings = termOccurrences(readTree(destination), '_estrutura_modulos');
        return compareValue('files that cite _estrutura_modulos', findings, ['specs/adr/000-decisoes-do-template.md']);
      },
    },
    {
      name: 'G: create-module works in the generated project',
      fn: () => fromProcess(runNode([join(destination, 'tools', 'create-module.mjs'), 'catalog', '--role', 'domain'], destination)),
    },
    {
      name: 'G: gate --all passes in the generated project',
      fn: () => fromProcess(runNode([join(destination, 'tools', 'gate', 'validate.mjs'), '--all'], destination)),
    },
    {
      name: 'G: module creation and gate checks in a generated project',
      fn: () => fromProcess(runNode([join(destination, 'tools', 'sync-env.mjs'), '--check'], destination)),
    },
    {
      name: 'G: module creation and gate checks in a generated project',
      fn: () => fromProcess(runNode([join(destination, 'tools', 'generate-port-schemas.mjs'), '--check'], destination)),
    },
    {
      name: 'G: module creation and gate checks in a generated project',
      fn: () => fromProcess(runNode([join(destination, 'tools', 'generate-lint-config.mjs'), '--check'], destination)),
    },
  ];
  return { steps, clean: () => rmSync(destination, { recursive: true, force: true }) };
}

function runScript() {
  const python = resolvePython();
  const { steps: fgSteps, clean } = generatedProjectSteps(python);
  const groups = [
    ...layer2Steps(),
    ...restSteps(),
    ...catalogSteps(),
    ...manifestSteps(),
    ...routeAndTestSteps(),
    ...moduleRejectionSteps(python),
    ...fgSteps,
  ];

  const results = [];
  try {
    for (const step of groups) {
      const result = step.skipped === true ? step : runStep(step.name, step.fn);
      results.push(result);
      const mark = result.skipped === true ? 'skip ' : (result.ok ? 'ok   ' : 'FAIL');
      process.stdout.write(`  ${mark} ${result.name}\n`);
      if (result.ok !== true && result.skipped !== true) process.stdout.write(`       ${result.detail}\n`);
    }
  } finally {
    clean();
  }

  const failures = results.filter((r) => r.ok !== true && r.skipped !== true);
  const executed = results.filter((r) => r.skipped !== true);
  process.stdout.write(`\nverify-routine: ${executed.length - failures.length}/${executed.length} steps passed\n`);
  return failures.length > 0 ? 1 : 0;
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória, sem tocar disco nem `child_process`.
// ================================================================================================

function selfTestCases() {
  return [
    { name: 'compareValue: equal numbers succeed', fn: () => compareValue('x', 5, 5).ok === true },
    { name: 'compareValue: unequal numbers fail and show both values', fn: () => {
      const r = compareValue('x', 5, 6);
      return r.ok === false && r.detail.includes('5') && r.detail.includes('6');
    } },
    { name: 'compareValue: objects with the same shape succeed', fn: () => compareValue('x', { a: 1, b: 2 }, { a: 1, b: 2 }).ok === true },
    { name: 'countRuleIds: counts only occurrences of the id key', fn: () => countRuleIds("id: 'a',\n  id: 'b',\n  otherKey: 'x'") === 2 },
    { name: 'countRuleIds: text without an id returns zero', fn: () => countRuleIds('nothing here') === 0 },
    { name: 'termOccurrences: returns only files that cite the term', fn: () => {
      const r = termOccurrences([{ path: 'a.md', text: 'mentions _estrutura_modulos here' }, { path: 'b.md', text: 'does not mention it' }], '_estrutura_modulos');
      return r.length === 1 && r[0] === 'a.md';
    } },
    { name: 'termOccurrences: no occurrences returns an empty list', fn: () => termOccurrences([{ path: 'a.md', text: 'nothing' }], '_estrutura_modulos').length === 0 },
  ];
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
  process.stdout.write(`\nself-test (verify-routine): ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(process.argv.includes('--selftest') ? runSelfTest() : runScript());
}
