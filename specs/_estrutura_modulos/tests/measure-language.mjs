#!/usr/bin/env node
/**
 * measure-language.mjs — mede quanto do que o template entrega ainda está em português. Ferramenta de
 * manutenção do TEMPLATE (não viaja para o projeto gerado), como `verify-catalog.mjs` e
 * `template-self-test.mjs`. Lei dona: ADR-023 (decisão 6: "a medição é por vocabulário fechado, nunca
 * 'parece português'").
 *
 *   node tests/measure-language.mjs                         tabela por escopo, categoria e raiz
 *   node tests/measure-language.mjs --list                  + cada ocorrência (arquivo:linha, nome, termos)
 *   node tests/measure-language.mjs --full                  com --list, o texto inteiro do literal (sem corte em 80)
 *   node tests/measure-language.mjs --json                  saída de máquina
 *   node tests/measure-language.mjs --scope bindings,tools  restringe os escopos (bindings|tools|tests|skills|hooks|plugin)
 *   node tests/measure-language.mjs --check                 exit 1 se restar ocorrência NÃO declarada (language-exceptions.json)
 *   node tests/measure-language.mjs --base-root <dir>       outra raiz da base (a que contém skills/, hooks/, plugin/)
 *   node tests/measure-language.mjs --only <prefixo,...>    só os arquivos cujo caminho relativo começa com o prefixo
 *   node tests/measure-language.mjs --exceptions <a.json,..> outros arquivos de exceção (padrão: language-exceptions.json)
 *   node tests/measure-language.mjs --unknown               palavras fora do vocabulário (para revisão)
 *   node tests/measure-language.mjs --root <dir>            outro template (a raiz que contém bindings/, tools/, tests/)
 *   node tests/measure-language.mjs --selftest              prova o núcleo com fixtures em memória
 *
 * O QUE MEDE. Por árvore sintática real — a API do `typescript` que a base já tem para `.mjs/.js/.ts/.tsx/.jsx`,
 * o módulo `ast` do Python chamado como subprocesso para `.py` — e, para os arquivos de dado (`.sql`, `.yml`,
 * `.json`, `.toml`), por varredura de palavras fora de comentário:
 *
 *   - `decl`    declarações de nome único por (arquivo, nome, papel): função, classe, tipo, constante, variável,
 *               parâmetro, propriedade, método, import;
 *   - `member`  acesso por ponto (referência, não declaração) — fica à parte para não inflar `decl`;
 *   - `string`  literais de texto (comentário emitido em arquivo gerado — linhas `#`/`//`/`--` — é ignorado);
 *   - `data`    palavras de chave/valor de arquivo de dado (valor de `texts.json` e `module.json:name` são texto
 *               ao usuário e ficam de fora — ADR-023, decisões 2 e 3).
 *
 * COMO DECIDE. Um nome é português quando alguma de suas palavras (partida por camelCase, snake_case,
 * kebab-case e dígito, sem acento, minúscula) está em `tools/gate/language-vocabulary.json` — lista FECHADA com origem
 * rastreável por termo. Cognatos e termos técnicos ficam de fora de propósito (`cognates`). Nunca "parece
 * português". Texto livre (`string`) também casa as palavras funcionais de `functionWords`.
 *
 * NÚCLEO × CASCA: tudo até a marca "CASCA" é puro (recebe texto, devolve dado).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// O casamento é o do gate: UMA implementação, dois leitores (tools/gate/language.mjs).
import { buildVocabulary, fold, matchTerms, splitWords } from '../tools/gate/language.mjs';

export { buildVocabulary, fold, matchTerms, splitWords };

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(HERE, '..');
/** O arquivo único do template (ADR-023 decisão 7): o gate lê o MESMO. */
const VOCABULARY_FILE = join(HERE, '..', 'tools', 'gate', 'language-vocabulary.json');
const DEFAULT_BASE_ROOT = join(HERE, '..', '..', '..');
const EXCEPTIONS_FILE = join(HERE, 'language-exceptions.json');
/** Escopos do template (relativos a `--root`) e da base (relativos a `--base-root`; globs `*` por pasta). */
const TEMPLATE_SCOPES = ['bindings', 'tools', 'tests'];
const BASE_SCOPES = { skills: 'skills/*/scripts', hooks: 'hooks', plugin: 'plugin' };
const SCOPES = [...TEMPLATE_SCOPES, ...Object.keys(BASE_SCOPES)];
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'dist', 'generated']);
const CODE_EXT = ['.mjs', '.js', '.ts', '.tsx', '.jsx'];
const DATA_EXT = ['.sql', '.yml', '.yaml', '.json', '.toml'];
const DOC_ONLY_KEYS = new Set(['description', 'summary', 'title', '$comment', '_doc', '_comment', 'comment', 'reason', 'why']);
/** Chave de documentação em JSON: `//`, `//build`, `_comment`… — o valor é prosa, não dado. */
function isDocKey(key) {
  return key.startsWith('//') || DOC_ONLY_KEYS.has(key);
}
/** O medidor não se mede: o vocabulário e as fixtures do próprio selftest são português de propósito. */
const SELF_DATA = new Set([
  'language-vocabulary.json', 'language-exceptions.json', 'measure-language.mjs', 'verify-language-parity.mjs',
]);
let nameWidth = 80;
const GENERATED_COMMENT = /^\s*(#|\/\/|--|\/\*|\*)/;

// ================================================================================================
// NÚCLEO — puro.
// ================================================================================================

/** Remove as linhas que são comentário emitido em arquivo gerado (`#`, `//`, `--`) de um texto. */
export function dropCommentLines(text) {
  if (!text.includes('\n')) return GENERATED_COMMENT.test(text) ? '' : text;
  return text.split('\n').filter((line) => !GENERATED_COMMENT.test(line)).join('\n');
}

/** Extração de código JS/TS pela API do compilador. Devolve `{ decls, members, strings }`. */
export function extractScript(ts, text, fileName) {
  const kind = /\.(tsx|jsx)$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const decls = [];
  const members = [];
  const strings = [];
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const declare = (node, role) => {
    if (node && ts.isIdentifier(node)) decls.push({ name: node.text, role, line: lineOf(node) });
    else if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      decls.push({ name: node.text, role, line: lineOf(node) });
    }
  };
  const declarePattern = (node, role) => {
    if (!node) return;
    if (ts.isIdentifier(node)) { declare(node, role); return; }
    if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
      for (const element of node.elements) {
        if (ts.isOmittedExpression(element)) continue;
        if (element.propertyName) declare(element.propertyName, 'property');
        declarePattern(element.name, role);
      }
    }
  };
  const visit = (node) => {
    collectNode(ts, node, { declare, declarePattern, members, strings, lineOf });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { decls, members, strings };
}

const NAMED_ROLE = [
  ['isFunctionDeclaration', 'function'], ['isClassDeclaration', 'class'], ['isInterfaceDeclaration', 'type'],
  ['isTypeAliasDeclaration', 'type'], ['isEnumDeclaration', 'type'], ['isEnumMember', 'property'],
  ['isPropertyAssignment', 'property'], ['isShorthandPropertyAssignment', 'property'],
  ['isPropertySignature', 'property'], ['isPropertyDeclaration', 'property'], ['isMethodDeclaration', 'method'],
  ['isMethodSignature', 'method'], ['isGetAccessor', 'property'], ['isSetAccessor', 'property'],
  ['isTypeParameterDeclaration', 'type'], ['isImportSpecifier', 'import'], ['isNamespaceImport', 'import'],
  ['isImportClause', 'import'], ['isJsxAttribute', 'property'],
];

function collectNode(ts, node, sink) {
  const { declare, declarePattern, members, strings, lineOf } = sink;
  for (const [guard, role] of NAMED_ROLE) {
    if (ts[guard](node) && node.name) { declare(node.name, role); return; }
  }
  if (ts.isVariableDeclaration(node)) {
    const parentFlags = node.parent && node.parent.flags;
    const role = parentFlags !== undefined && (parentFlags & ts.NodeFlags.Const) !== 0 ? 'const' : 'variable';
    declarePattern(node.name, role);
  } else if (ts.isParameter(node)) declarePattern(node.name, 'parameter');
  else if (ts.isPropertyAccessExpression(node)) members.push({ name: node.name.text, line: lineOf(node.name) });
  else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (isPlainString(ts, node)) strings.push({ text: node.text, line: lineOf(node) });
  } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    strings.push({ text: node.text, line: lineOf(node) });
  }
}

/** Literal que não é nome de propriedade, especificador de módulo nem tipo literal já tratado como nome. */
function isPlainString(ts, node) {
  const parent = node.parent;
  if (!parent) return true;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)
    || ts.isMethodDeclaration(parent) || ts.isEnumMember(parent)) && parent.name === node) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return false;
  if (ts.isExternalModuleReference(parent) || ts.isModuleDeclaration(parent)) return false;
  return !(ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword);
}

/** Palavras de arquivo de dado (`.sql`, `.yml`, `.toml`): linha a linha, sem comentário. */
export function extractWordFile(text, ext) {
  const found = [];
  const lines = text.split('\n');
  let inBlock = false;
  let foldedIndent = -1;
  lines.forEach((raw, index) => {
    let line = raw;
    const indent = raw.length - raw.trimStart().length;
    if (foldedIndent >= 0) {
      if (raw.trim() === '' || indent > foldedIndent) return;
      foldedIndent = -1;
    }
    if (ext === '.sql') {
      if (inBlock) { inBlock = !line.includes('*/'); return; }
      if (line.includes('/*') && !line.includes('*/')) { inBlock = true; line = line.slice(0, line.indexOf('/*')); }
      line = line.replace(/--.*$/, '');
    } else {
      line = line.replace(/(^|\s)#.*$/, '$1');
    }
    const keyed = line.match(/^\s*(?:-\s+)?([\w$.'"-]+)\s*[:=]\s*(.*)$/);
    if (keyed && isDocKey(keyed[1].replace(/['"]/g, ''))) {
      if (/^[>|][+-]?$/.test(keyed[2].trim())) foldedIndent = indent;
      line = keyed[1];
    }
    if (line.trim() !== '') found.push({ text: line, line: index + 1 });
  });
  return found;
}

/** Chaves e valores de um JSON, com a isenção de `texts.json` (valores) e `module.json:name`. */
export function extractJson(text, fileName) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  const base = fileName.split(/[\\/]/).pop();
  const valuesExempt = base === 'texts.json';
  const found = [];
  const walk = (value, key, depth) => {
    if (Array.isArray(value)) { value.forEach((item) => walk(item, key, depth)); return; }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (!isDocKey(k)) found.push({ text: k, kind: 'key' });
        walk(v, k, depth + 1);
      }
      return;
    }
    if (typeof value !== 'string' || valuesExempt || isDocKey(key)) return;
    if (base === 'module.json' && key === 'name' && depth === 1) return;
    found.push({ text: value, kind: 'value' });
  };
  walk(data, '', 0);
  return found;
}

/** Declarações únicas por (arquivo, nome, papel). */
export function uniqueDeclarations(items) {
  const seen = new Map();
  for (const item of items) {
    const key = `${item.file}\u0000${item.name}\u0000${item.role}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

/** Agrega ocorrências já classificadas (`terms` não vazio = português) por categoria e raiz. */
export function summarize(occurrences, vocabulary) {
  const total = occurrences.length;
  const declared = occurrences.filter((o) => o.terms.length > 0 && o.declared !== undefined).length;
  const matched = occurrences.filter((o) => o.terms.length > 0 && o.declared === undefined);
  const byRoot = new Map();
  for (const occurrence of matched) {
    for (const root of new Set(occurrence.terms.map((t) => vocabulary.rootOf(t)))) {
      byRoot.set(root, (byRoot.get(root) ?? 0) + 1);
    }
  }
  const roots = [...byRoot.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { total, matched: matched.length, declared, roots };
}

/**
 * Exceção declarada: `{ file, category?, names?, contains?, reason }`. `file` é o caminho relativo (termina em
 * `/` = pasta inteira); `category` é decl|member|string|data (omitida = todas); `names` casa o nome exato
 * (decl/member/data) e `contains` um trecho do literal (string). Sem `names` nem `contains` = o arquivo todo
 * naquela categoria. `reason` é obrigatório: a exceção é revisável, nunca silenciosa.
 */
export function findException(exceptions, category, item) {
  return exceptions.find((e) => {
    if (e.category !== undefined && e.category !== category) return false;
    const fileOk = e.file.endsWith('/') ? item.file.startsWith(e.file) : item.file === e.file;
    if (!fileOk) return false;
    if (e.names !== undefined) return e.names.includes(item.name);
    if (e.contains !== undefined) return e.contains.some((part) => item.name.includes(part));
    return true;
  });
}

/** Marca (`declared = reason`) as ocorrências cobertas por exceção; as demais seguem como achado. */
export function applyExceptions(buckets, exceptions) {
  for (const [category, items] of Object.entries(buckets)) {
    for (const item of items) {
      if (item.terms.length === 0) continue;
      const hit = findException(exceptions, category, item);
      if (hit !== undefined) item.declared = hit.reason;
    }
  }
}

// ================================================================================================
// CASCA — toca disco, `typescript` e `python`.
// ================================================================================================

const PY_EXTRACTOR = `
import ast, json, sys
out = {}
def role_of(node, parents):
    return 'property' if parents and isinstance(parents[-1], ast.ClassDef) else None
for path in json.load(sys.stdin):
    try:
        text = open(path, encoding='utf-8').read()
        tree = ast.parse(text)
    except Exception as exc:
        out[path] = {'error': str(exc)}; continue
    decls, members, strings = [], [], []
    docs = set()
    keys = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = node.body
            if body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], 'value', None), ast.Constant):
                docs.add(id(body[0].value))
        if isinstance(node, ast.Dict):
            for k in node.keys:
                if isinstance(k, ast.Constant) and isinstance(k.value, str):
                    keys.add(id(k)); decls.append({'name': k.value, 'role': 'property', 'line': k.lineno})
    class_bodies = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for child in node.body:
                class_bodies[id(child)] = True
    for node in ast.walk(tree):
        line = getattr(node, 'lineno', 0)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            decls.append({'name': node.name, 'role': 'function', 'line': line})
            a = node.args
            for arg in a.posonlyargs + a.args + a.kwonlyargs + ([a.vararg] if a.vararg else []) + ([a.kwarg] if a.kwarg else []):
                decls.append({'name': arg.arg, 'role': 'parameter', 'line': arg.lineno})
        elif isinstance(node, ast.ClassDef):
            decls.append({'name': node.name, 'role': 'class', 'line': line})
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            decls.append({'name': node.id, 'role': 'variable', 'line': line})
        elif isinstance(node, ast.Attribute):
            (decls if isinstance(node.ctx, ast.Store) else members).append({'name': node.attr, 'role': 'property', 'line': line})
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                if alias.asname: decls.append({'name': alias.asname, 'role': 'import', 'line': line})
        elif isinstance(node, ast.keyword) and node.arg:
            members.append({'name': node.arg, 'line': getattr(node, 'lineno', line)})
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            if id(node) in docs or id(node) in keys: continue
            strings.append({'text': node.value, 'line': line})
    out[path] = {'decls': decls, 'members': members, 'strings': strings}
json.dump(out, sys.stdout)
`;

function runPython(files) {
  for (const exe of ['python', 'python3', 'py']) {
    const result = spawnSync(exe, ['-I', '-c', PY_EXTRACTOR], {
      input: JSON.stringify(files), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    });
    if (result.error === undefined && result.status === 0) return JSON.parse(result.stdout);
  }
  return null;
}

export function loadTypeScript() {
  const require = createRequire(import.meta.url);
  return require('typescript');
}

function walkFiles(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(path, exts, out);
    else if (!SELF_DATA.has(entry.name) && exts.some((ext) => entry.name.endsWith(ext))) out.push(path);
  }
  return out;
}

// Pastas de um escopo: o padrão da base (skills, asterisco, scripts) expande o asterisco pelas pastas de skill.
function scopeDirs(root, baseRoot, scope) {
  if (!(scope in BASE_SCOPES)) return [join(root, scope)];
  const pattern = BASE_SCOPES[scope];
  if (!pattern.includes('*')) return [join(baseRoot, pattern)];
  const [head, tail] = pattern.split('*');
  const parent = join(baseRoot, head);
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parent, entry.name, tail));
}

/** Lê o arquivo e devolve `{ kind, items }` de ocorrências brutas (sem classificar). */
function extractFile(ts, path, pythonByFile) {
  const text = readFileSync(path, 'utf8');
  const ext = path.slice(path.lastIndexOf('.'));
  if (CODE_EXT.includes(ext)) return { ...extractScript(ts, text, path), data: [] };
  if (ext === '.py') {
    const py = pythonByFile?.[path];
    if (py === undefined || py.error !== undefined) return { decls: [], members: [], strings: [], data: [], error: py?.error };
    return { ...py, data: [] };
  }
  if (ext === '.json') return { decls: [], members: [], strings: [], data: extractJson(text, path) };
  return { decls: [], members: [], strings: [], data: extractWordFile(text, ext) };
}

function classify(extracted, file, vocabulary) {
  const decl = [];
  const member = [];
  const string = [];
  const data = [];
  for (const d of extracted.decls) {
    decl.push({ file, line: d.line, name: d.name, role: d.role, terms: matchTerms(d.name, vocabulary) });
  }
  for (const m of extracted.members) member.push({ file, line: m.line, name: m.name, role: 'member', terms: matchTerms(m.name, vocabulary) });
  for (const s of extracted.strings) {
    const text = dropCommentLines(s.text);
    if (text.trim() === '') continue;
    string.push({ file, line: s.line, name: text.slice(0, nameWidth), role: 'string', terms: matchTerms(text, vocabulary, true) });
  }
  for (const d of extracted.data) {
    const text = d.kind === undefined ? d.text : d.text;
    data.push({ file, line: d.line ?? 0, name: text.slice(0, nameWidth), role: d.kind ?? 'data', terms: matchTerms(text, vocabulary, d.kind === 'value') });
  }
  return { decl: uniqueDeclarations(decl), member: uniqueDeclarations(member), string, data };
}

function loadExceptions(files) {
  const list = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const entries = raw.exceptions ?? [];
    const bad = entries.filter((e) => typeof e.file !== 'string' || typeof e.reason !== 'string' || e.reason.trim() === '');
    if (bad.length > 0) throw new Error(`${file}: ${bad.length} entries without file/reason`);
    list.push(...entries);
  }
  return list;
}

export function measureScope(root, baseRoot, scope, vocabulary, ts, exceptions, only = []) {
  const exts = [...CODE_EXT, '.py', ...DATA_EXT];
  const anchor = scope in BASE_SCOPES ? baseRoot : root;
  const relOf = (path) => relative(anchor, path).split('\\').join('/');
  const files = scopeDirs(root, baseRoot, scope)
    .flatMap((dir) => walkFiles(dir, exts))
    .filter((path) => only.length === 0 || only.some((prefix) => relOf(path).startsWith(prefix)));
  const pyFiles = files.filter((f) => f.endsWith('.py'));
  const pythonByFile = pyFiles.length > 0 ? runPython(pyFiles) : {};
  if (pythonByFile === null) throw new Error('python was not found on PATH (needed to read .py with ast)');
  const buckets = { decl: [], member: [], string: [], data: [] };
  for (const path of files) {
    const rel = relOf(path);
    const extracted = extractFile(ts, path, pythonByFile);
    const classified = classify(extracted, rel, vocabulary);
    for (const key of Object.keys(buckets)) buckets[key].push(...classified[key]);
  }
  applyExceptions(buckets, exceptions);
  return { scope, files: files.length, buckets };
}

function bindingOf(file) {
  const m = file.match(/^bindings\/([^/]+)\//);
  return m ? m[1] : null;
}

function printScope(result, vocabulary, options) {
  const out = [];
  out.push(`\n=== ${result.scope} (${result.files} files) ===`);
  for (const [key, label] of [['decl', 'declarations'], ['string', 'strings'], ['data', 'data words'], ['member', 'member accesses']]) {
    const items = result.buckets[key];
    const summary = summarize(items, vocabulary);
    const pct = summary.total === 0 ? '0.0' : ((100 * summary.matched) / summary.total).toFixed(1);
    const declared = summary.declared > 0 ? `, ${summary.declared} declared` : '';
    out.push(`  ${label}: ${summary.matched} Portuguese of ${summary.total} (${pct}%)${declared}`);
    if (result.scope === 'bindings') {
      for (const binding of ['typescript', 'javascript', 'python']) {
        const sub = items.filter((i) => bindingOf(i.file) === binding);
        const matched = sub.filter((i) => i.terms.length > 0).length;
        out.push(`      ${binding}: ${matched} of ${sub.length}`);
      }
    }
    const top = summary.roots.slice(0, options.top);
    if (top.length > 0) out.push(`      by root: ${top.map(([r, n]) => `${r} ${n}`).join(', ')}${summary.roots.length > top.length ? `, … (+${summary.roots.length - top.length} roots)` : ''}`);
    if (options.list) {
      for (const item of items.filter((i) => i.terms.length > 0 && i.declared === undefined)) {
        out.push(`      ${item.file}:${item.line}  ${item.role}  ${JSON.stringify(item.name)}  [${[...new Set(item.terms)].join(', ')}]`);
      }
    }
  }
  return out.join('\n');
}

function unknownWords(results, vocabulary, keys = ['decl', 'data']) {
  const counts = new Map();
  for (const result of results) {
    for (const key of keys) {
      for (const item of result.buckets[key]) {
        for (const word of splitWords(item.name)) {
          if (vocabulary.terms.has(word) || vocabulary.cognates.has(word)) continue;
          counts.set(word, (counts.get(word) ?? 0) + 1);
        }
      }
    }
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** `--check`: exit 1 se sobrou ocorrência em português que nenhuma exceção declarada cobre. */
function checkExit(results, vocabulary) {
  let undeclared = 0;
  for (const result of results) {
    for (const items of Object.values(result.buckets)) undeclared += summarize(items, vocabulary).matched;
  }
  process.stdout.write(`\nundeclared Portuguese occurrences: ${undeclared}\n`);
  return undeclared === 0 ? 0 : 1;
}

function parseArgs(argv) {
  const options = {
    list: false, json: false, unknown: false, check: false, unknownKeys: ['decl', 'data'],
    root: DEFAULT_ROOT, baseRoot: DEFAULT_BASE_ROOT, scopes: SCOPES, top: 40, only: [], exceptionFiles: [EXCEPTIONS_FILE],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') options.list = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--unknown') options.unknown = true;
    else if (arg === '--unknown-strings') { options.unknown = true; options.unknownKeys = ['string']; }
    else if (arg === '--check') options.check = true;
    else if (arg === '--only') { options.only = argv[i + 1].split(','); i += 1; }
    else if (arg === '--exceptions') { options.exceptionFiles = argv[i + 1].split(','); i += 1; }
    else if (arg === '--root') { options.root = argv[i + 1]; i += 1; }
    else if (arg === '--base-root') { options.baseRoot = argv[i + 1]; i += 1; }
    else if (arg === '--scope') { options.scopes = argv[i + 1].split(','); i += 1; }
    else if (arg === '--top') { options.top = Number(argv[i + 1]); i += 1; }
    else if (arg === '--full') nameWidth = Number.POSITIVE_INFINITY;
  }
  return options;
}

function runMeasure(argv) {
  const options = parseArgs(argv);
  const vocabulary = buildVocabulary(JSON.parse(readFileSync(VOCABULARY_FILE, 'utf8')));
  const ts = loadTypeScript();
  const exceptions = loadExceptions(options.exceptionFiles);
  const results = options.scopes.map((scope) => measureScope(
    options.root, options.baseRoot, scope, vocabulary, ts, exceptions, options.only));
  if (options.unknown) {
    for (const [word, count] of unknownWords(results, vocabulary, options.unknownKeys)) process.stdout.write(`${word} ${count}\n`);
    return 0;
  }
  if (options.json) {
    const payload = results.map((r) => ({
      scope: r.scope,
      files: r.files,
      categories: Object.fromEntries(Object.entries(r.buckets).map(([key, items]) => {
        const s = summarize(items, vocabulary);
        return [key, { total: s.total, portuguese: s.matched, declared: s.declared, roots: Object.fromEntries(s.roots) }];
      })),
    }));
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`vocabulary: ${vocabulary.terms.size} terms, ${vocabulary.cognates.size} cognates excluded\n`);
  for (const result of results) process.stdout.write(`${printScope(result, vocabulary, options)}\n`);
  return options.check ? checkExit(results, vocabulary) : 0;
}

// ================================================================================================
// AUTOTESTE — núcleo contra fixtures em memória (+ um subprocesso Python curto).
// ================================================================================================

function fixtureVocabulary() {
  return buildVocabulary({
    terms: { registro: 'x', registros: 'x', titulo: 'x', situacao: 'x', criado: 'x', tabela: 'x' },
    cognates: ['data', 'status'],
    functionWords: { nao: 'x', para: 'x' },
  });
}

function selfTestCases() {
  const vocabulary = fixtureVocabulary();
  const ts = loadTypeScript();
  const script = [
    '// registro em comentário não conta',
    'export function listarRegistros(titulo: string, { situacao }: { situacao: string }) {',
    "  const mensagem = 'título inválido, não repita';",
    "  const comment = '# registro\\n// titulo\\nok';",
    '  return { registro: titulo, status: situacao, mensagem, comment };',
    '}',
    'interface NovoRegistro { criadoEm: string }',
  ].join('\n');
  const found = extractScript(ts, script, 'fixture.ts');
  const names = found.decls.map((d) => d.name);
  const verdict = (name) => matchTerms(name, vocabulary).length > 0;
  return [
    { name: 'splitWords: camelCase, snake_case, SCREAMING and kebab-case', fn: () => (
      JSON.stringify(splitWords('criadoEm_NAO-ENCONTRADO')) === JSON.stringify(['criado', 'em', 'nao', 'encontrado'])) },
    { name: 'fold: accents and case are removed', fn: () => fold('Situação') === 'situacao' },
    { name: 'matchTerms: a closed-vocabulary term is matched inside a compound', fn: () => verdict('listarRegistros') },
    { name: 'matchTerms: a cognate is never matched', fn: () => !verdict('dataStatus') },
    { name: 'matchTerms: a word that only looks Portuguese is not matched', fn: () => !verdict('importantFlag') },
    { name: 'matchTerms: function words count only in free text', fn: () => (
      matchTerms('não', vocabulary).length === 0 && matchTerms('não', vocabulary, true).length === 1) },
    { name: 'dropCommentLines: generated-file comment lines are removed', fn: () => (
      dropCommentLines('# registro\n// titulo\n-- tabela\nok') === 'ok') },
    { name: 'extractScript: declarations by role (function, parameter, property, interface)', fn: () => (
      names.includes('listarRegistros') && names.includes('titulo') && names.includes('situacao')
      && names.includes('NovoRegistro') && names.includes('criadoEm')) },
    { name: 'extractScript: comments are not declarations or strings', fn: () => (
      !found.strings.some((s) => s.text.includes('em comentário') ))},
    { name: 'extractScript: strings are collected; comment lines inside a string are dropped by the classifier', fn: () => {
      const comment = found.strings.find((s) => s.text.startsWith('# registro'));
      return comment !== undefined && dropCommentLines(comment.text) === 'ok';
    } },
    { name: 'uniqueDeclarations: one entry per (file, name, role)', fn: () => (
      uniqueDeclarations([{ file: 'a', name: 'x', role: 'const' }, { file: 'a', name: 'x', role: 'const' }, { file: 'a', name: 'x', role: 'parameter' }]).length === 2) },
    { name: 'summarize: counts by root, plural folded into the singular', fn: () => {
      const s = summarize([{ terms: ['registro'] }, { terms: ['registros'] }, { terms: [] }], vocabulary);
      return s.total === 3 && s.matched === 2 && s.roots[0][0] === 'registro' && s.roots[0][1] === 2;
    } },
    { name: 'extractWordFile: SQL comments are ignored', fn: () => {
      const words = extractWordFile('-- tabela\nCREATE TABLE x (titulo text); -- registro\n/* tabela\n registro */\nok', '.sql');
      return words.map((w) => w.text).join('|') === 'CREATE TABLE x (titulo text); |ok';
    } },
    { name: 'extractWordFile: description values are documentation, not data', fn: () => {
      const words = extractWordFile('  description: o registro novo\n  titulo: x', '.yml');
      return words.length === 2 && !words[0].text.includes('registro');
    } },
    { name: 'extractJson: texts.json values and module.json:name are exempt, keys are not', fn: () => {
      const texts = extractJson('{"emptyList":"Nenhum registro"}', 'config/texts.json');
      const manifest = extractJson('{"name":"Pedidos","basePath":"/api/registros"}', 'module.json');
      return texts.length === 1 && texts[0].kind === 'key' && manifest.length === 3
        && manifest.some((m) => m.text === '/api/registros') && !manifest.some((m) => m.text === 'Pedidos');
    } },
    { name: 'vocabulary file: every term has an origin and no term is also a cognate', fn: () => {
      const raw = JSON.parse(readFileSync(VOCABULARY_FILE, 'utf8'));
      const origins = new Set(Object.keys(raw.origins));
      const cognates = new Set(raw.cognates);
      return Object.entries(raw.terms).every(([term, origin]) => origins.has(origin) && !cognates.has(term) && term === fold(term));
    } },
    { name: 'applyExceptions: a declared occurrence leaves the count, an undeclared one stays', fn: () => {
      const buckets = { string: [
        { file: 'skills/x/a.py', name: '## Decisão', terms: ['decisao'] },
        { file: 'skills/x/a.py', name: 'mensagem solta', terms: ['mensagem'] },
      ] };
      applyExceptions(buckets, [{ file: 'skills/x/', category: 'string', contains: ['## Decis'], reason: 'doc heading' }]);
      const s = summarize(buckets.string, vocabulary);
      return s.matched === 1 && s.declared === 1 && buckets.string[0].declared === 'doc heading';
    } },
    { name: 'python extraction: ast declarations, docstring and dict keys', fn: () => {
      const tmp = join(mkdtempSync(join(tmpdir(), 'measure-language-')), 'fixture.py');
      return withTempFile(tmp, 'def listar(titulo):\n    """registro"""\n    return {"situacao": titulo}\n', () => {
        const result = runPython([tmp]);
        if (result === null) return true; // sem Python no PATH: o caso se declara pulado
        const r = result[tmp];
        const names = r.decls.map((d) => d.name);
        return names.includes('listar') && names.includes('titulo') && names.includes('situacao')
          && !r.strings.some((s) => s.text === 'registro');
      });
    } },
  ];
}

function withTempFile(path, content, fn) {
  writeFileSync(path, content);
  try { return fn(); } finally { rmSync(dirname(path), { recursive: true, force: true }); }
}

function runSelfTest() {
  let failures = 0;
  const cases = selfTestCases();
  for (const testCase of cases) {
    let ok = false;
    try { ok = testCase.fn() === true; } catch { ok = false; }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  process.stdout.write(`\nself-test (measure-language): ${cases.length - failures}/${cases.length} passed\n`);
  return failures === 0 ? 0 : 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return runSelfTest();
  if (!existsSync(VOCABULARY_FILE) || !statSync(VOCABULARY_FILE).isFile()) {
    process.stderr.write(`vocabulary file not found: ${VOCABULARY_FILE}\n`);
    return 1;
  }
  return runMeasure(args);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
