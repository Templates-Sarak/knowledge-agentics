/**
 * language.mjs — o núcleo da regra de idioma. Lei dona: specs/arquitetura/04-regras.md (parágrafo "Idioma")
 * e `ADR-023`. Dois leitores, uma fonte: a regra `portuguese-identifier` (`rules/writing.mjs`) e o medidor
 * (`tests/measure-language.mjs`) leem o MESMO `language-vocabulary.json` e usam as MESMAS funções de
 * casamento deste arquivo; o hook de qualidade da base (`hooks/padrao-idioma.js`) o importa do lugar onde o
 * plugin o instala.
 *
 * ZERO DEPENDÊNCIA, de propósito: o gate roda em projeto JS e Python sem `typescript` instalado. Por isso
 * a leitura de código aqui é um tokenizador LÉXICO (pula comentário, string, template, regex e texto de
 * JSX), e não a árvore sintática que o medidor usa. A troca tem um preço declarado e ele só vai num
 * sentido — o tokenizador pode DEIXAR PASSAR (texto de JSX em casos limite, acesso por ponto), nunca
 * acusar o que está num comentário, numa string ou num valor de `texts.json` (04-regras.md §7.2: na
 * dúvida, não acusa).
 *
 * O QUE CONTA COMO NOME: todo identificador solto de código (declaração e uso do mesmo nome saem uma vez
 * por arquivo), a chave entre aspas de objeto/dicionário e, em Python, o atributo atribuído (`self.x = …`).
 * O acesso por ponto (`obj.nome`) NÃO conta: o dono do nome é quem o declara.
 *
 * NÚCLEO PURO: recebe texto, devolve dado. Quem lê disco é `context.mjs` (e as cascas do medidor e do hook).
 */

// ================================================================================================
// Vocabulário — compartilhado com o medidor.
// ================================================================================================

/** Sem acento e minúsculo — `situação` e `Situacao` viram a mesma palavra. */
export function fold(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Palavras de um identificador ou texto: parte por caixa (camelCase), `_`, `-`, `.`, `/`, espaço e dígito. */
export function splitWords(text) {
  const spaced = text
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return fold(spaced).split(/[^a-z]+/).filter((word) => word.length > 0);
}

/** Cria o consultor do vocabulário a partir do JSON versionado. */
export function buildVocabulary(raw) {
  const terms = new Map(Object.entries(raw.terms));
  const functionWords = new Map(Object.entries(raw.functionWords ?? {}));
  const cognates = new Set(raw.cognates ?? []);
  const rootOf = (term) => {
    for (const cut of [['oes', 'ao'], ['ais', 'al'], ['es', ''], ['s', '']]) {
      if (!term.endsWith(cut[0])) continue;
      const singular = term.slice(0, term.length - cut[0].length) + cut[1];
      if (terms.has(singular)) return singular;
    }
    return term;
  };
  return { terms, functionWords, cognates, rootOf };
}

/** Termos do vocabulário que aparecem no texto. `free` inclui as palavras funcionais (texto livre). */
export function matchTerms(text, vocabulary, free = false) {
  const found = [];
  for (const word of splitWords(text)) {
    if (vocabulary.cognates.has(word)) continue;
    if (vocabulary.terms.has(word) || (free && vocabulary.functionWords.has(word))) found.push(word);
  }
  return found;
}

// ================================================================================================
// Tokenizador léxico — JS/TS e Python.
// ================================================================================================

const IDENT_START = /[\p{L}_$]/u;
const IDENT_PART = /[\p{L}\p{N}_$]/u;
const DIGIT = /[0-9]/;
const WHITESPACE = /\s/;
const OPENERS = '{([';
const CLOSERS = '})]';
const PY_STRING_PREFIXES = new Set(['r', 'u', 'b', 'f', 'br', 'rb', 'fr', 'rf']);
const REGEX_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);
/** Texto entre tags de JSX: sem pontuação de código, seguido de tag de fechamento (`</`) ou de filha. */
const JSX_TEXT = /(>)([^<>{}()=;&|]*)(?=<\/|<[A-Za-z])/g;

const EXT_LANGUAGE = new Map([
  ['.ts', 'js'], ['.tsx', 'js'], ['.js', 'js'], ['.jsx', 'js'], ['.mjs', 'js'], ['.cjs', 'js'], ['.py', 'py'],
]);

/** `'js'`, `'py'` ou `null` para a extensão. */
export function languageOf(ext) {
  return EXT_LANGUAGE.get(ext) ?? null;
}

/** Troca o texto de JSX por espaços (preserva as quebras de linha). Só gera falso NEGATIVO. */
function blankJsxText(src) {
  if (!/<\/[A-Za-z]|\/>/.test(src)) return src;
  return src.replace(JSX_TEXT, (match, open, text, offset) => {
    const next = src[offset + match.length + 1];
    if (/[A-Za-z]/.test(next ?? '') && !/\s$/.test(text)) return match;
    return open + text.replace(/[^\n]/g, ' ');
  });
}

/** Fim do literal entre aspas simples/duplas que começa em `start` (para antes da quebra de linha). */
function endOfQuoted(src, start) {
  const quote = src[start];
  let at = start + 1;
  while (at < src.length) {
    if (src[at] === '\\') { at += 2; continue; }
    if (src[at] === quote) return at + 1;
    if (src[at] === '\n') return at;
    at += 1;
  }
  return src.length;
}

/** Fim do `${…}` de um template (`at` aponta o primeiro caractere depois de `${`). */
function endOfInterpolation(src, start) {
  let depth = 1;
  let at = start;
  while (at < src.length && depth > 0) {
    const ch = src[at];
    if (ch === '`') { at = endOfTemplate(src, at); continue; }
    if (ch === '"' || ch === "'") { at = endOfQuoted(src, at); continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    at += 1;
  }
  return at;
}

/** Fim do template literal que começa em `start` (a crase), com `${}` aninhado. */
function endOfTemplate(src, start) {
  let at = start + 1;
  while (at < src.length) {
    if (src[at] === '\\') { at += 2; continue; }
    if (src[at] === '`') return at + 1;
    if (src[at] === '$' && src[at + 1] === '{') { at = endOfInterpolation(src, at + 2); continue; }
    at += 1;
  }
  return src.length;
}

/** Fim da regex que começa em `start`, ou -1 se não fechar na mesma linha (então é divisão). */
function endOfRegex(src, start) {
  let at = start + 1;
  let inClass = false;
  while (at < src.length && src[at] !== '\n') {
    const ch = src[at];
    if (ch === '\\') { at += 2; continue; }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      at += 1;
      while (at < src.length && IDENT_PART.test(src[at])) at += 1;
      return at;
    }
    at += 1;
  }
  return -1;
}

function regexAllowed(prev) {
  if (prev === undefined) return true;
  if (prev.type === 'punct') return !')]'.includes(prev.text);
  if (prev.type === 'ident') return REGEX_AFTER_WORD.has(prev.text);
  return false;
}

/** Primeiro caractere não branco a partir de `at` (ou `''`). */
function peekChar(src, at) {
  let cursor = at;
  while (cursor < src.length && WHITESPACE.test(src[cursor])) cursor += 1;
  return cursor < src.length ? src[cursor] : '';
}

/** Atributo anotado no início da instrução (`self.x: T = v`): a linha antes do nome é só a cadeia pontuada. */
const DOTTED_PREFIX = /^[\p{L}_][\p{L}\p{N}_]*(\.[\p{L}\p{N}_]+)*\.$/u;

class Lexer {
  constructor(src, language, offset = 0) {
    this.src = src;
    this.language = language;
    this.offset = offset;
    this.pos = 0;
    this.tokens = [];
    this.stack = [];
  }

  run() {
    if (this.src.startsWith('#!')) this.pos = this.lineEnd(0);
    while (this.pos < this.src.length) this.step();
    return this.tokens;
  }

  lineEnd(from) {
    const at = this.src.indexOf('\n', from);
    return at === -1 ? this.src.length : at;
  }

  step() {
    const ch = this.src[this.pos];
    if (this.skipTrivia(ch)) return;
    if (this.readString(ch)) return;
    if (DIGIT.test(ch)) this.readNumber();
    else if (IDENT_START.test(ch)) this.readWord();
    else this.readPunct(ch);
  }

  skipTrivia(ch) {
    if (WHITESPACE.test(ch)) { this.pos += 1; return true; }
    if (this.language === 'py') {
      if (ch !== '#') return false;
      this.pos = this.lineEnd(this.pos);
      return true;
    }
    const next = this.src[this.pos + 1];
    if (ch === '/' && next === '/') { this.pos = this.lineEnd(this.pos); return true; }
    if (ch === '/' && next === '*') {
      const close = this.src.indexOf('*/', this.pos + 2);
      this.pos = close === -1 ? this.src.length : close + 2;
      return true;
    }
    return false;
  }

  /** Lê um literal de texto em `this.pos`. Devolve `true` se havia um. */
  readString(ch) {
    const isQuote = ch === '"' || ch === "'";
    if (!isQuote && !(ch === '`' && this.language === 'js')) return false;
    const start = this.pos;
    if (ch === '`') this.readTemplate(start);
    else {
      this.pos = this.endOfLiteral(start);
      this.pushString(start, this.pos, true);
    }
    return true;
  }

  /** O texto do template é string; o que está em `${…}` é CÓDIGO e entra pelo mesmo tokenizador. */
  readTemplate(start) {
    const end = endOfTemplate(this.src, start);
    let at = start + 1;
    while (at < end - 1) {
      if (this.src[at] === '\\') { at += 2; continue; }
      if (this.src[at] === '$' && this.src[at + 1] === '{') {
        const close = endOfInterpolation(this.src, at + 2);
        this.lexInterpolation(at + 2, close - 1);
        at = close;
        continue;
      }
      at += 1;
    }
    this.pos = end;
    this.pushString(start, end, false);
  }

  lexInterpolation(from, to) {
    const sub = new Lexer(this.src.slice(from, to), 'js', this.offset + from);
    this.tokens.push(...sub.run());
  }

  endOfLiteral(start) {
    const quote = this.src[start];
    const triple = quote.repeat(3);
    if (this.language === 'py' && this.src.startsWith(triple, start)) {
      const close = this.src.indexOf(triple, start + 3);
      return close === -1 ? this.src.length : close + 3;
    }
    return endOfQuoted(this.src, start);
  }

  /** Chave entre aspas: `{ 'a': 1 }` ou `{"a": 1}` — o literal vira nome, não texto. */
  pushString(start, end, quoted) {
    const prev = this.tokens.at(-1);
    const afterOpenOrComma = prev !== undefined && prev.type === 'punct' && (prev.text === '{' || prev.text === ',');
    const isKey = quoted && afterOpenOrComma && this.stack.at(-1) === '{' && peekChar(this.src, end) === ':';
    if (isKey) this.tokens.push({ type: 'key', text: this.src.slice(start + 1, end - 1), start: start + this.offset });
    else this.tokens.push({ type: 'string', text: '', start: start + this.offset });
  }

  readNumber() {
    const start = this.pos;
    this.pos += 1;
    while (this.pos < this.src.length && /[0-9A-Za-z_.]/.test(this.src[this.pos])) this.pos += 1;
    this.tokens.push({ type: 'number', text: this.src.slice(start, this.pos), start: start + this.offset });
  }

  readWord() {
    const start = this.pos;
    this.pos += 1;
    while (this.pos < this.src.length && IDENT_PART.test(this.src[this.pos])) this.pos += 1;
    const word = this.src.slice(start, this.pos);
    const quote = this.src[this.pos];
    if (this.language === 'py' && PY_STRING_PREFIXES.has(word.toLowerCase()) && (quote === '"' || quote === "'")) {
      const stringStart = this.pos;
      this.pos = this.endOfLiteral(stringStart);
      this.tokens.push({ type: 'string', text: '', start: start + this.offset });
      return;
    }
    this.pushIdentifier(word, start);
  }

  pushIdentifier(word, start) {
    const [prev, before] = [this.tokens.at(-1), this.tokens.at(-2)];
    const member = prev?.type === 'punct' && prev.text === '.' && !(before?.type === 'punct' && before.text === '.');
    const token = { type: 'ident', text: word, start: start + this.offset, member, store: false };
    if (member && this.language === 'py') token.store = this.isAssignment(this.pos) || this.isAnnotatedStore(start);
    this.tokens.push(token);
  }

  /** `self.x: T = v` — o atributo anotado, só no nível de instrução (`if self.x:` não é isto). */
  isAnnotatedStore(start) {
    if (this.stack.length > 0 || peekChar(this.src, this.pos) !== ':') return false;
    const lineStart = this.src.lastIndexOf('\n', start) + 1;
    return DOTTED_PREFIX.test(this.src.slice(lineStart, start).trim());
  }

  /** `=` simples (não `==`) logo depois de `at`. */
  isAssignment(at) {
    const rest = this.src.slice(at).trimStart();
    return rest[0] === '=' && rest[1] !== '=';
  }

  readPunct(ch) {
    if (ch === '/' && this.language === 'js' && regexAllowed(this.tokens.at(-1))) {
      const end = endOfRegex(this.src, this.pos);
      if (end !== -1) {
        this.tokens.push({ type: 'regex', text: '', start: this.pos + this.offset });
        this.pos = end;
        return;
      }
    }
    if (OPENERS.includes(ch)) this.stack.push(ch);
    else if (CLOSERS.includes(ch)) this.stack.pop();
    this.tokens.push({ type: 'punct', text: ch, start: this.pos + this.offset });
    this.pos += 1;
  }
}

/** Os tokens de `src` na linguagem (`'js'` | `'py'`). Exportado para o medidor de paridade. */
export function tokenize(src, language) {
  const prepared = language === 'js' ? blankJsxText(src) : src;
  return new Lexer(prepared, language).run();
}

function lineAt(src, index) {
  let line = 1;
  for (let at = src.indexOf('\n'); at !== -1 && at < index; at = src.indexOf('\n', at + 1)) line += 1;
  return line;
}

function nameOf(token) {
  if (token.type === 'key') return token.text;
  if (token.type !== 'ident') return null;
  return token.member && !token.store ? null : token.text;
}

/**
 * Os nomes de `src` que contêm termo do vocabulário: `{ name, terms, line }`, um por nome distinto
 * (a primeira ocorrência). Nome sem termo, cognato e tudo que está em comentário/string não entra.
 */
export function findPortugueseNames(src, language, vocabulary) {
  const found = new Map();
  const seen = new Set();
  for (const token of tokenize(src, language)) {
    const name = nameOf(token);
    if (name === null || seen.has(name)) continue;
    seen.add(name);
    const terms = [...new Set(matchTerms(name, vocabulary))];
    if (terms.length > 0) found.set(name, { name, terms, line: lineAt(src, token.start) });
  }
  return [...found.values()];
}

/** Todos os nomes que o tokenizador enxerga em `src` (sem filtro de vocabulário) — para a paridade. */
export function allNames(src, language) {
  const names = new Set();
  for (const token of tokenize(src, language)) {
    const name = nameOf(token);
    if (name !== null) names.add(name);
  }
  return [...names];
}

// ================================================================================================
// Chaves de JSON — config e manifesto.
// ================================================================================================

const DOC_KEYS = new Set(['description', 'summary', 'title', '$comment', '_doc', '_comment', 'comment', 'reason', 'why']);

/** Chave de documentação em JSON: `//`, `_comment`, `description`… — o valor é prosa, não dado. */
function isDocKey(key) {
  return key.startsWith('//') || DOC_KEYS.has(key);
}

/** Todas as chaves (em qualquer profundidade) de um valor JSON já lido, sem as de documentação. */
export function jsonKeyNames(value, into = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) jsonKeyNames(item, into);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!isDocKey(key)) into.add(key);
      jsonKeyNames(child, into);
    }
  }
  return [...into];
}

/** Linha (1-based) da primeira ocorrência de `"key"` no texto do JSON, ou 1. */
export function keyLine(text, key) {
  const at = text.indexOf(`"${key}"`);
  return at === -1 ? 1 : lineAt(text, at);
}

/** As chaves de um JSON (texto) que contêm termo do vocabulário: `{ name, terms, line }`. Ilegível = nada. */
export function findPortugueseKeys(text, vocabulary) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  const found = [];
  for (const key of jsonKeyNames(value)) {
    const terms = [...new Set(matchTerms(key, vocabulary))];
    if (terms.length > 0) found.push({ name: key, terms, line: keyLine(text, key) });
  }
  return found;
}
