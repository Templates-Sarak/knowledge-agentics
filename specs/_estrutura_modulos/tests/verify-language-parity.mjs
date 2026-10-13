#!/usr/bin/env node
/**
 * verify-language-parity.mjs — prova que a regra de idioma do gate (tokenizador léxico, zero dependência)
 * CONCORDA com o medidor (árvore sintática real) sobre o mesmo código. Ferramenta de manutenção do TEMPLATE,
 * como `measure-language.mjs` (não viaja para o projeto gerado). Lei dona: ADR-023, decisão 7 e onda 6.
 *
 *   node tests/verify-language-parity.mjs                    o próprio template (bindings, tools, tests)
 *   node tests/verify-language-parity.mjs --root <dir>       outro template (a raiz que contém bindings/, tools/, tests/)
 *   node tests/verify-language-parity.mjs --list             + cada divergência (arquivo, nome)
 *   node tests/verify-language-parity.mjs --selftest         o tokenizador contra fixtures em memória
 *
 * O QUE COMPARA. Por arquivo, os NOMES em português que cada lado enxerga:
 *   - medidor: declarações (`decl`, todo papel) e chaves de JSON — pela API do `typescript` e pelo `ast`
 *     do Python;
 *   - gate: `findPortugueseNames` e `findPortugueseKeys` (`tools/gate/language.mjs`), os que a regra
 *     `portuguese-identifier` usa.
 *
 * COMO LÊ O VEREDITO. Três conjuntos:
 *   - ambos: o mesmo nome, no mesmo arquivo — o acordo;
 *   - só o medidor: nome que o tokenizador deixou passar. Tem de ser VAZIO (ou o gate está cego a algo
 *     que o medidor vê) — é o que reprova;
 *   - só o gate: nome que o gate acusa e o medidor não conta como declaração naquele arquivo. Explicado
 *     quando o nome é, em português, DECLARADO em outro arquivo do mesmo corpus (o gate acusa também o uso;
 *     o medidor só a declaração). Sem declaração em lugar nenhum = divergência não explicada, e reprova.
 *
 * Com o template em dia (zero português) os três conjuntos são vazios — acordo, mas trivial. A prova que
 * pesa é rodar a MESMA comparação sobre uma árvore com português de verdade (`--root` de um checkout antigo
 * do template): é ali que "só o medidor" e "só o gate" ficam não vazios e cada item se explica.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  allNames, buildVocabulary, findPortugueseKeys, findPortugueseNames, languageOf, tokenize,
} from '../tools/gate/language.mjs';
import { loadTypeScript, measureScope } from './measure-language.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VOCABULARY_FILE = join(HERE, '..', 'tools', 'gate', 'language-vocabulary.json');
const SCOPES = ['bindings', 'tools', 'tests'];
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'dist', 'generated']);
const SELF_DATA = new Set([
  'language-vocabulary.json', 'language-exceptions.json', 'measure-language.mjs', 'verify-language-parity.mjs',
]);
const CODE_EXT = ['.mjs', '.js', '.ts', '.tsx', '.jsx', '.py'];

// ================================================================================================
// NÚCLEO — puro.
// ================================================================================================

/** `{ both, measurerOnly, gateOnly }` — cada um um array de `{ file, name }` ordenado. */
export function compareSets(measurerNames, gateNames) {
  const key = (item) => `${item.file}\u0000${item.name}`;
  const measurer = new Map(measurerNames.map((item) => [key(item), item]));
  const gate = new Map(gateNames.map((item) => [key(item), item]));
  const byKey = (a, b) => key(a).localeCompare(key(b));
  return {
    both: [...gate.keys()].filter((k) => measurer.has(k)).map((k) => gate.get(k)).sort(byKey),
    measurerOnly: [...measurer.keys()].filter((k) => !gate.has(k)).map((k) => measurer.get(k)).sort(byKey),
    gateOnly: [...gate.keys()].filter((k) => !measurer.has(k)).map((k) => gate.get(k)).sort(byKey),
  };
}

/**
 * Separa o "só o gate" entre explicado (o nome é declarado em português em OUTRO arquivo do corpus) e
 * não explicado. `declaredElsewhere` é o conjunto de nomes que o medidor declara em português, em qualquer arquivo.
 */
export function explainGateOnly(gateOnly, declaredNames) {
  const explained = gateOnly.filter((item) => declaredNames.has(item.name));
  const unexplained = gateOnly.filter((item) => !declaredNames.has(item.name));
  return { explained, unexplained };
}

// ================================================================================================
// CASCA — toca disco, `typescript` e `python`.
// ================================================================================================

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (!SELF_DATA.has(entry.name) && (CODE_EXT.some((ext) => entry.name.endsWith(ext)) || entry.name.endsWith('.json'))) {
      out.push(path);
    }
  }
  return out;
}

function gateSide(root, vocabulary) {
  const names = [];
  for (const scope of SCOPES) {
    for (const path of walk(join(root, scope))) {
      const rel = relative(root, path).split('\\').join('/');
      const text = readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
      const ext = path.slice(path.lastIndexOf('.'));
      const found = ext === '.json'
        ? findPortugueseKeys(text, vocabulary)
        : findPortugueseNames(text, languageOf(ext), vocabulary);
      for (const { name } of found) names.push({ file: rel, name });
    }
  }
  return names;
}

function measurerSide(root, vocabulary) {
  const ts = loadTypeScript();
  const names = [];
  for (const scope of SCOPES) {
    const { buckets } = measureScope(root, root, scope, vocabulary, ts, []);
    for (const item of buckets.decl) {
      if (item.terms.length > 0 && !SELF_DATA.has(item.file.split('/').pop())) names.push({ file: item.file, name: item.name });
    }
    for (const item of buckets.data) {
      if (item.terms.length > 0 && item.role === 'key' && item.file.endsWith('.json')) names.push({ file: item.file, name: item.name });
    }
  }
  return names;
}

function report(root, options) {
  const vocabulary = buildVocabulary(JSON.parse(readFileSync(VOCABULARY_FILE, 'utf8')));
  const measurer = measurerSide(root, vocabulary);
  const gate = gateSide(root, vocabulary);
  const { both, measurerOnly, gateOnly } = compareSets(measurer, gate);
  const { explained, unexplained } = explainGateOnly(gateOnly, new Set(measurer.map((item) => item.name)));
  const out = [];
  out.push(`root: ${root}`);
  out.push(`measurer (syntax tree): ${new Set(measurer.map((i) => `${i.file}\u0000${i.name}`)).size} Portuguese names`);
  out.push(`gate (lexical):         ${new Set(gate.map((i) => `${i.file}\u0000${i.name}`)).size} Portuguese names`);
  out.push(`agree:                  ${both.length}`);
  out.push(`measurer only:          ${measurerOnly.length}  (must be 0 — the gate would be blind to these)`);
  out.push(`gate only, explained:   ${explained.length}  (a use of a name the measurer sees declared in Portuguese elsewhere)`);
  out.push(`gate only, unexplained: ${unexplained.length}  (must be 0)`);
  if (options.list) {
    for (const [label, items] of [['measurer only', measurerOnly], ['gate only (explained)', explained], ['gate only (unexplained)', unexplained]]) {
      for (const item of items) out.push(`  ${label}: ${item.file}  ${item.name}`);
    }
  }
  process.stdout.write(`${out.join('\n')}\n`);
  return measurerOnly.length === 0 && unexplained.length === 0 ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — o tokenizador contra fixtures em memória.
// ================================================================================================

function fixtureVocabulary() {
  return buildVocabulary({
    terms: { registro: 'x', registros: 'x', listar: 'x', titulo: 'x', situacao: 'x', criado: 'x', pagina: 'x', mensagem: 'x' },
    cognates: ['data', 'status'],
  });
}

function namesOf(src, language) {
  return findPortugueseNames(src, language, fixtureVocabulary()).map((found) => found.name).sort();
}

function lexerCases() {
  const is = (src, language, expected) => JSON.stringify(namesOf(src, language)) === JSON.stringify([...expected].sort());
  return [
    { name: 'js: declarations, parameters, destructuring and properties are names', fn: () => is(
      'export function listarRegistros(titulo, { situacao }) { const mensagem = 1; return { pagina: mensagem }; }',
      'js', ['listarRegistros', 'mensagem', 'pagina', 'situacao', 'titulo']) },
    { name: 'js: line and block comments are not code', fn: () => is('// registro\n/* listar registros */\nconst a = 1;', 'js', []) },
    { name: 'js: strings and template text are not code, the interpolated expression is', fn: () => is(
      "const a = 'registro'; const b = \"titulo\"; const c = `pagina ${situacao} de registros`;", 'js', ['situacao']) },
    { name: 'js: a nested template inside an interpolation is read to its end', fn: () => is(
      'const a = `x ${f(`titulo ${mensagem}`)} y`; const b = 1;', 'js', ['mensagem']) },
    { name: 'js: a regex literal is not code, a division is', fn: () => is('const a = /registro/g; const b = x / titulo / 2;', 'js', ['titulo']) },
    { name: 'js: member access is not a name, a quoted key is', fn: () => is(
      "const a = obj.registro + obj?.titulo; const b = { 'criadoEm': 1, 'other-key': 2 };", 'js', ['criadoEm']) },
    { name: 'js: spread is not a member access', fn: () => is('const a = { ...registros };', 'js', ['registros']) },
    { name: 'js: JSX text between tags is user text, attributes are code', fn: () => is(
      'const a = <p titulo={x}>Nenhum registro ainda.</p>;', 'js', ['titulo']) },
    { name: 'js: a comparison is not JSX text', fn: () => is('const a = b > registro && c < d;', 'js', ['registro']) },
    { name: 'js: an unterminated string stops at the line end', fn: () => is("const a = 'registro\nconst titulo = 1;", 'js', ['titulo']) },
    { name: 'js: accented identifiers fold to the vocabulary', fn: () => is('const situação = 1;', 'js', ['situação']) },
    { name: 'js: a shebang line is skipped', fn: () => is('#!/usr/bin/env node\nconst a = 1;', 'js', []) },
    { name: 'py: names, parameters and keys', fn: () => is(
      'def listar(titulo):\n    d = {"criado": titulo, "data": 1}\n    return d', 'py', ['criado', 'listar', 'titulo']) },
    { name: 'py: comments, docstrings and f-strings are not code', fn: () => is(
      'def f():\n    """registro"""\n    # titulo\n    return f"{pagina} registros"', 'py', []) },
    { name: 'py: string prefixes do not become names', fn: () => is('a = r"registro"; b = b"titulo"; c = rb"pagina"', 'py', []) },
    { name: 'py: an assigned attribute is a name, a read attribute is not', fn: () => is(
      'self.situacao = 1\nx = obj.mensagem\nif obj.status == 2: pass', 'py', ['situacao']) },
    { name: 'py: an annotated attribute at statement level is a name, a condition is not', fn: () => is(
      'self.registros: list = []\nif self.situacao:\n    x = a[self.pagina:2]', 'py', ['registros']) },
    { name: 'py: a comparison with a string before a colon is not a key', fn: () => is(
      'if kind == "registro":\n    pass', 'py', []) },
    { name: 'cognates are never names', fn: () => is('const dataStatus = 1;', 'js', []) },
  ];
}

function tokenizerShape() {
  return [
    { name: 'tokenize: line numbers survive the JSX text blanking', fn: () => (
      findPortugueseNames('const a = <p>\nregistro aqui\n</p>;\nconst titulo = 1;', 'js', fixtureVocabulary())[0]?.line === 4) },
    { name: 'allNames: every bare identifier, vocabulary aside', fn: () => (
      JSON.stringify(allNames('const a = f(b);', 'js').sort()) === JSON.stringify(['a', 'b', 'const', 'f']))
      && tokenize('x', 'py').length === 1 },
  ];
}

function setCases() {
  const items = (...pairs) => pairs.map(([file, name]) => ({ file, name }));
  return [
    { name: 'compareSets: agreement, measurer-only and gate-only are separated', fn: () => {
      const result = compareSets(items(['a', 'x'], ['a', 'y']), items(['a', 'x'], ['b', 'z']));
      return result.both.length === 1 && result.measurerOnly.length === 1 && result.gateOnly.length === 1;
    } },
    { name: 'explainGateOnly: a name declared elsewhere is explained, an orphan is not', fn: () => {
      const { explained, unexplained } = explainGateOnly(items(['b', 'x'], ['b', 'z']), new Set(['x']));
      return explained.length === 1 && unexplained.length === 1 && unexplained[0].name === 'z';
    } },
  ];
}

function runSelfTest() {
  const cases = [...lexerCases(), ...tokenizerShape(), ...setCases()];
  let failures = 0;
  for (const testCase of cases) {
    let ok = false;
    try { ok = testCase.fn() === true; } catch { ok = false; }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  process.stdout.write(`\nself-test (verify-language-parity): ${cases.length - failures}/${cases.length} passed\n`);
  return failures === 0 ? 0 : 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return runSelfTest();
  const rootIndex = args.indexOf('--root');
  const root = rootIndex === -1 ? join(HERE, '..') : args[rootIndex + 1];
  return report(root, { list: args.includes('--list') });
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
