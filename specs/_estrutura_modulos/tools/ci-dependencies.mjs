#!/usr/bin/env node
/**
 * ci-dependencies.mjs — audita dependências (npm audit / pip-audit) contra o piso de severidade de
 * `config/verification.json:dependencies.minimumSeverity` (já no schema — nenhuma chave nova).
 *
 *   node tools/ci-dependencies.mjs [--json]
 *   node tools/ci-dependencies.mjs --selftest
 *
 * NÃO é regra de gate — audita ESTADO EXTERNO (registro npm/PyPI), não o código do módulo. Ferramenta,
 * como `contract-compatible.mjs`/`ci-security.mjs`. Sem id, fora do catálogo.
 *
 * ============================================================================================
 * A DECISÃO JÁ TOMADA (não reaberta aqui): ferramenta ausente é PARTE DO PACOTE — `pip-audit` entra
 * como `optional-dependencies` do projeto (mesmo grupo do `pytest-cov`); `npm audit` é embutido no
 * npm. Isso elimina o "fail-open por ausência": as duas SEMPRE estão instaladas onde este comando
 * roda. O que sobra de "fail-open" morre — vira EXCEÇÃO NOMINAL, RATIFICADA (`decision`, como o gate
 * já exige) E DATADA (`expires`, novo aqui) em `config/compliance.json:exceptionsCve`.
 *
 * NÚCLEO × CASCA, mesmo precedente de `affected.mjs`/`contract-compatible.mjs`/`ci-security.mjs`:
 * `normalizeNpm`/`normalizePip`/`exceptionStatus`/`avaliar` recebem DADO (o JSON já parseado, e
 * "hoje" como STRING `YYYY-MM-DD`), nunca tocam `fs`/`child_process`/relógio. A casca resolve os
 * binários SEM shell (mesma técnica de `verify-commit.mjs:npmEntrypoint` — não importada de lá
 * porque não é exportada; copiada, com a origem citada, o mesmo precedente que `ci-security.mjs` já
 * seguiu para `findRoot`) e lê o relógio UMA vez, na borda.
 *
 * MEDIDO ANTES DE ESCREVER O PARSER (os dois formatos reais, colados no relatório desta tarefa):
 *   - `npm audit --json` (npm 11.x): `{ auditReportVersion, vulnerabilities: { <pacote>: { severity,
 *     isDirect, via: [string|{source,name,url,severity,cwe,cvss,...}], ... } }, metadata }`. SEM
 *     lockfile: `{ error: { code: "ENOLOCK", summary, detail } }` — JSON válido, ZERO vulnerabilidade
 *     não é a mesma coisa que "não consegui auditar" (lei 10), e o campo `error` é o discriminador.
 *   - `pip-audit --format=json`: `{ dependencies: [ { name, version, vulns: [ { id, fix_versions,
 *     aliases, description } ] } ] }`. **Achado, medido**: NENHUM campo de severidade/CVSS — ao
 *     contrário do que este bloco assumia. `pip-audit --help` não tem `--severity` nem `--cvss`. Por
 *     isso `dependencies.minimumSeverity` filtra o lado NPM; do lado PIP, TODO achado conta —
 *     declarado abaixo e em `04-regras.md` §7.2, não escondido.
 *   - **Achado, medido**: as mensagens de aviso do `pip-audit` (`WARNING: pip-audit will run pip
 *     against...`) saem em STDERR, não stdout — mas se a casca capturar os dois fluxos JUNTOS
 *     (`2>&1`), o texto do aviso se mistura ANTES do JSON e quebra o parse. A casca aqui separa os
 *     dois fluxos (`stdio: ['ignore', 'pipe', 'pipe']`) e só faz `JSON.parse` do stdout.
 * ============================================================================================
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process`, `process.env` ou o relógio.
// ================================================================================================

export const SEVERITY_ORDER = ['low', 'moderate', 'high', 'critical'];

/** Extrai o id GHSA/CVE de uma URL de advisory — `null` se a forma não for reconhecida. */
function urlId(url) {
  const matched = typeof url === 'string' ? url.match(/GHSA-[\w-]+$/) : null;
  return matched !== null ? matched[0] : null;
}

/**
 * `npm audit --json` → achados uniformes. Só os itens OBJETO de `via` carregam advisory de verdade;
 * os itens STRING são só "por causa desta outra dependência" — o pacote citado tem sua PRÓPRIA
 * entrada em `vulnerabilities` com o advisory real, então ignorar as strings não perde achado, evita
 * duplicar o mesmo advisory sob dois nomes de pacote.
 */
export function normalizeNpm(auditJson) {
  if (auditJson === null || typeof auditJson !== 'object') return null;
  if (auditJson.error !== undefined) return null; // "nao consegui auditar" — nunca vira lista vazia
  const vulnerabilities = auditJson.vulnerabilities ?? {};
  const findings = [];
  for (const [pkg, entry] of Object.entries(vulnerabilities)) {
    for (const via of entry.via ?? []) {
      if (typeof via === 'string') continue;
      findings.push({
        ecosystem: 'npm',
        package: pkg,
        severity: via.severity ?? entry.severity ?? null,
        id: urlId(via.url) ?? `npm:${pkg}:${via.source ?? 'missing-id'}`,
        title: via.title ?? `${pkg}: vulnerability title is unavailable`,
        url: via.url ?? null,
      });
    }
  }
  return findings;
}

/** `pip-audit --format=json` → achados uniformes. SEM severidade (medido — não existe no formato). */
export function normalizePip(auditJson) {
  if (auditJson === null || typeof auditJson !== 'object' || !Array.isArray(auditJson.dependencies)) return null;
  const findings = [];
  for (const dep of auditJson.dependencies) {
    for (const vuln of dep.vulns ?? []) {
      findings.push({
        ecosystem: 'pip',
        package: dep.name,
        severity: null,
        id: vuln.id ?? (vuln.aliases ?? [])[0] ?? `pip:${dep.name}:missing-id`,
        title: (vuln.description ?? '').slice(0, 120) || `${dep.name}: vulnerability description is unavailable`,
        url: null,
      });
    }
  }
  return findings;
}

/** `null` (pip, sem severidade) sempre conta — não há como filtrar o que a ferramenta não relata. */
export function floorAbove(severity, min) {
  if (severity === null) return true;
  const findingIndex = SEVERITY_ORDER.indexOf(severity);
  const minIndex = SEVERITY_ORDER.indexOf(min);
  if (findingIndex === -1 || minIndex === -1) return true; // severidade fora do vocabulario: erra para mais
  return findingIndex >= minIndex;
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** Calendário de verdade — rejeita "2026-02-30" que `new Date` rolaria em silêncio para março. */
function realDateIso(text) {
  if (typeof text !== 'string' || !DATE_FORMAT.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const data = new Date(Date.UTC(year, month - 1, day));
  return data.getUTCFullYear() === year && data.getUTCMonth() === month - 1 && data.getUTCDate() === day;
}

/**
 * `todayIso` é STRING `YYYY-MM-DD`, passada pela casca — nunca lida daqui (é o que faz o `--selftest`
 * determinístico: sem isso, o caso "expirada" passa hoje e falha em janeiro). Comparação lexicográfica
 * de datas ISO é comparação cronológica — não precisa de objeto `Date` para isso.
 */
export function exceptionStatus(exception, todayIso) {
  if (!exception || typeof exception !== 'object' || !exception.decision) return 'missing-decision';
  if (!realDateIso(exception.expires)) return 'malformed-expiry';
  return exception.expires < todayIso ? 'expired' : 'valid';
}

/**
 * O núcleo inteiro: combina achados normalizados, o piso de severidade e as exceções (com "hoje" já
 * resolvido), e devolve o veredito. Exceção com QUALQUER status que não seja `'valida'` continua
 * REPROVANDO o achado — e some como AVISO próprio, nunca como silêncio (lei 10 aplicada à exceção).
 */
export function evaluate({ npm, pip, min, exceptions, todayIso }) {
  if (npm === null && pip === null) {
    return { status: 'unaudited', compatible: false, findings: [], problematicExceptions: [] };
  }
  const rawArgs = [...(npm ?? []), ...(pip ?? [])].filter((a) => floorAbove(a.severity, min));

  const problematicExceptions = [];
  const findings = [];
  for (const finding of rawArgs) {
    const exception = (exceptions ?? []).find((e) => e.id === finding.id);
    if (exception === undefined) {
      findings.push({ ...finding, waived: false });
      continue;
    }
    const status = exceptionStatus(exception, todayIso);
    if (status === 'valid') {
      findings.push({ ...finding, waived: true });
      continue;
    }
    problematicExceptions.push({ id: finding.id, status });
    findings.push({ ...finding, waived: false });
  }

  const failers = findings.filter((a) => !a.waived);
  return {
    status: 'audited',
    compatible: failers.length === 0,
    findings,
    problematicExceptions,
  };
}

// ================================================================================================
// CASCA — toca disco, `child_process` e o relógio. Cada acesso externo isolado num ponto nomeado.
// ================================================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

/** Mesmo raciocínio de `gate/context.mjs:findRootProjeto` — cópia, não import (fora de escopo). */
function findRoot(start) {
  let current = start;
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = join(current, '..');
    if (relative(parent, current) === '') break;
    current = parent;
  }
  return start;
}

const ROOT = findRoot(HERE);

/** `hoje`, lido UMA vez, na borda — o núcleo inteiro recebe a string, nunca chama o relógio. */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function binding() {
  if (existsSync(join(ROOT, 'package.json'))) return 'node';
  if (existsSync(join(ROOT, 'pyproject.toml'))) return 'python';
  return null;
}

/**
 * O entrypoint JS de um pacote de `node_modules/<pacote>` pelo campo `bin` — mesma técnica de
 * `verify-commit.mjs:packageEntrypoint` (que por sua vez cita `hooks/padrao-limiares.js`). Copiada
 * aqui porque `verify-commit.mjs` não exporta a função (é FORA de escopo, não editável), e
 * `tools/**` não pode depender de `hooks/` (não viaja para o projeto gerado).
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

/** `npm` vem empacotado ao lado do `node`, não é dependência do projeto — mesmos dois layouts
 * candidatos (Windows/POSIX) de `verify-commit.mjs:npmEntrypoint`. */
function npmEntrypoint() {
  const nodeRoot = dirname(NODE);
  for (const candidate of [nodeRoot, join(nodeRoot, '..', 'lib')]) {
    const finding = packageEntrypoint(candidate, 'npm');
    if (finding !== null) return finding;
  }
  return null;
}

let resolvedPython;
function resolvePython() {
  if (resolvedPython !== undefined) return resolvedPython;
  const candidates = [process.env.SARAK_PYTHON, 'python', 'python3'].filter((c) => Boolean(c));
  resolvedPython = candidates.find((c) => spawnSync(c, ['--version'], { shell: false }).status === 0) ?? null;
  return resolvedPython;
}

/** JSON de um comando, com stdout/stderr SEPARADOS (medido: `pip-audit` grava aviso em stderr — juntar
 * os dois fluxos quebra o parse). `null` quando o executável não resolve ou a saída não é JSON. */
function commandJson(executable, args, cwd) {
  if (executable === null) return null;
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error !== undefined) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function auditNpm() {
  const entry = npmEntrypoint();
  if (entry === null) return null; // ferramenta ausente — REPROVA (lei 7), nunca "zero vulnerabilidade"
  return commandJson(NODE, [entry, 'audit', '--json'], ROOT);
}

function auditPip() {
  const python = resolvePython();
  if (python === null) return null;
  return commandJson(python, ['-m', 'pip_audit', '--format=json'], ROOT);
}

function minSeverity() {
  const path = join(ROOT, 'config', 'verification.json');
  if (!existsSync(path)) return 'high'; // mesmo default de `hooks/test-cobertura.js`/config.json da base
  try {
    return JSON.parse(readFileSync(path, 'utf8')).dependencies?.minimumSeverity ?? 'high';
  } catch {
    return 'high';
  }
}

/** `config/compliance.json:exceptionsCve` — MESMO arquivo das exceções de regra do gate, chave nova.
 * Decisão (não um arquivo próprio): a disciplina "sem decisao não vale" já mora e é testada ali;
 * duplicar em outro arquivo repetiria o mecanismo sem nenhum ganho, só mais uma entrada na árvore. */
function cveExceptions() {
  const path = join(ROOT, 'config', 'compliance.json');
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')).exceptionsCve ?? [];
  } catch {
    return [];
  }
}

// ================================================================================================
// SAÍDA
// ================================================================================================

function printHuman(r, bind) {
  if (r.status === 'unaudited') {
    process.stdout.write(`  x audit tool is missing or returned unreadable output (binding: ${bind ?? 'unknown'}) — FAIL-CLOSED: unchecked never means "ok"\n`);
    return;
  }
  if (r.findings.length === 0) {
    process.stdout.write('  ok   no vulnerabilities at the configured severity floor\n');
  }
  for (const a of r.findings) {
    const mark = a.waived ? '!' : 'x';
    const label = a.waived ? 'WAIVED (valid exception)' : 'FAILS';
    process.stdout.write(`  ${mark} [${a.ecosystem}] ${a.package} (${a.severity ?? 'no severity'}) ${a.id}: ${a.title} — ${label}\n`);
  }
  for (const p of r.problematicExceptions) {
    process.stdout.write(`  !    exception for "${p.id}" is invalid (${p.status}) — the finding still fails\n`);
  }
}

function printJson(r) {
  process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

function readOptions(argv) {
  const options = { json: false, selfTest: false };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    if (arg === '--selftest') options.selfTest = true;
  }
  return options;
}

function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();

  const bind = binding();
  const npm = bind === 'node' ? auditNpm() : null;
  const normalizedNpm = npm === null ? null : normalizeNpm(npm);
  const pip = bind === 'python' ? auditPip() : null;
  const normalizedPip = pip === null ? null : normalizePip(pip);

  // Ferramenta ausente/saida ilegivel E o binding exigia aquela ferramenta: nao-auditado.
  const withoutAudit = (bind === 'node' && normalizedNpm === null) || (bind === 'python' && normalizedPip === null) || bind === null;

  const result = withoutAudit
    ? { status: 'unaudited', compatible: false, findings: [], problematicExceptions: [] }
    : evaluate({ npm: normalizedNpm, pip: normalizedPip, min: minSeverity(), exceptions: cveExceptions(), todayIso: todayIso() });

  if (options.json) printJson(result);
  else {
    process.stdout.write(`ci-dependencies: binding ${bind ?? 'unknown'}, severity floor ${minSeverity()}\n`);
    printHuman(result, bind);
    process.stdout.write(`\nci-dependencies: ${result.compatible ? 'OK' : 'FAILED'}\n`);
  }
  return result.compatible ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — o núcleo puro contra fixtures em memória (JSON real medido, colado como fixture).
// ================================================================================================

const NPM_WITH_BROKEN_LOCKFILE = { error: { code: 'ENOLOCK', summary: 'This command requires an existing lockfile.' } };

const NPM_ONE_VULN = {
  auditReportVersion: 2,
  vulnerabilities: {
    vite: {
      name: 'vite', severity: 'high', isDirect: true,
      via: [{ source: 1, name: 'vite', url: 'https://github.com/advisories/GHSA-4w7w-66w2-5vf9', severity: 'moderate', title: 'Path Traversal' }],
      effects: [], range: '<=6.4.1', nodes: ['node_modules/vite'],
    },
    'vite-node': { name: 'vite-node', severity: 'moderate', isDirect: false, via: ['vite'], effects: ['vitest'], range: '*', nodes: [] },
  },
  metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 1, low: 0, info: 0, total: 2 } },
};

const PIP_ONE_VULN = {
  dependencies: [
    { name: 'pip', version: '25.2', vulns: [{ id: 'PYSEC-2026-196', fix_versions: ['26.1.2'], aliases: ['GHSA-wf93-45jw-7689', 'CVE-2026-8643'], description: 'path traversal' }] },
    { name: 'anyio', version: '4.14.2', vulns: [] },
  ],
};

function selfTestCases() {
  return [
    { name: 'npm with a broken lockfile returns null, never an empty list', fn: () => normalizeNpm(NPM_WITH_BROKEN_LOCKFILE) === null },
    { name: 'real npm output: reads one finding from an object via entry and ignores the duplicate string entry', fn: () => normalizeNpm(NPM_ONE_VULN).length === 1 },
    { name: 'real npm output: extracts the id from the GHSA URL', fn: () => normalizeNpm(NPM_ONE_VULN)[0].id === 'GHSA-4w7w-66w2-5vf9' },
    { name: 'real pip output: severity is always null because pip-audit does not report it', fn: () => { const a = normalizePip(PIP_ONE_VULN); return a.length === 1 && a[0].severity === null; } },
    { name: 'pip with no vulnerabilities returns an empty list, not null', fn: () => { const r = normalizePip({ dependencies: [{ name: 'x', version: '1', vulns: [] }] }); return Array.isArray(r) && r.length === 0; } },
    { name: 'pip with an invalid shape returns null, not an empty list', fn: () => normalizePip({ oops: true }) === null },
    { name: 'floorAbove: null severity from pip always counts', fn: () => floorAbove(null, 'critical') === true },
    { name: 'floorAbove: moderate does not meet a high severity floor', fn: () => floorAbove('moderate', 'high') === false },
    { name: 'floorAbove: high meets a high severity floor', fn: () => floorAbove('high', 'high') === true },
    { name: 'exception without a decision is never valid', fn: () => exceptionStatus({ expires: '2099-01-01' }, '2026-01-01') === 'missing-decision' },
    { name: 'exception with a decision and a future expiry is valid', fn: () => exceptionStatus({ decision: 'ADR-01', expires: '2099-01-01' }, '2026-01-01') === 'valid' },
    { name: 'exception with a decision and a past expiry is expired', fn: () => exceptionStatus({ decision: 'ADR-01', expires: '2020-01-01' }, '2026-01-01') === 'expired' },
    { name: 'exception with an invalid date is malformed, never valid forever', fn: () => exceptionStatus({ decision: 'ADR-01', expires: '2026-02-30' }, '2026-01-01') === 'malformed-expiry' },
    { name: 'exception without an expiry is malformed', fn: () => exceptionStatus({ decision: 'ADR-01' }, '2026-01-01') === 'malformed-expiry' },
    { name: 'exception with an invalid date format is malformed', fn: () => exceptionStatus({ decision: 'ADR-01', expires: '30/02/2026' }, '2026-01-01') === 'malformed-expiry' },
    {
      name: 'evaluate: a valid exception forgives the finding',
      fn: () => {
        const r = evaluate({ npm: normalizeNpm(NPM_ONE_VULN), pip: [], min: 'low', exceptions: [{ id: 'GHSA-4w7w-66w2-5vf9', decision: 'ADR-9', expires: '2099-01-01' }], todayIso: '2026-01-01' });
        return r.compatible === true && r.findings.some((a) => a.waived);
      },
    },
    {
      name: 'evaluate: an expired exception does not forgive the finding and remains problematic',
      fn: () => {
        const r = evaluate({ npm: normalizeNpm(NPM_ONE_VULN), pip: [], min: 'low', exceptions: [{ id: 'GHSA-4w7w-66w2-5vf9', decision: 'ADR-9', expires: '2020-01-01' }], todayIso: '2026-01-01' });
        return r.compatible === false && r.problematicExceptions.some((p) => p.status === 'expired');
      },
    },
    {
      name: 'evaluate: when neither npm nor pip was audited, the result is unaudited, never compatible',
      fn: () => evaluate({ npm: null, pip: null, min: 'low', exceptions: [], todayIso: '2026-01-01' }).status === 'unaudited',
    },
    {
      name: 'ADVERSARIAL: an exception id containing shell syntax is compared as a string and never executed',
      fn: () => exceptionStatus({ id: '; echo INJECTED', decision: 'ADR-1', expires: '2099-01-01' }, '2026-01-01') === 'valid',
    },
  ];
}

function runSelfTest() {
  let failures = 0;
  for (const testCase of selfTestCases()) {
    let ok;
    try {
      ok = testCase.fn() === true;
    } catch (error) {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  const total = selfTestCases().length;
  process.stdout.write(`\nself-test: ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
