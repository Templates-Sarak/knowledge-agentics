/**
 * rules/writing.mjs — família "Escrita" do catálogo (specs/arquitetura/04-regras.md §4.7).
 * ids: function-threshold, nesting-threshold, parameters-threshold, swallowed-exception
 *
 * Por que no gate e não só no linter: o gate viaja com o módulo e roda sem `npm install`. Delegar
 * 100% ao ESLint/Ruff significa que num repositório sem linter instalado estes limites não são
 * cobrados por ninguém.
 *
 * O linter continua sendo a verificação PROFUNDA (complexidade ciclomática, tipos, regras de
 * idioma). Aqui ficam os quatro limiares que dá para medir por estrutura de bloco, de forma
 * conservadora: na dúvida, esta família não acusa.
 *
 * Os números vêm de `../thresholds.mjs`, a fonte única — a config do linter é GERADA de lá. Se
 * cada lado guardasse a própria cópia, o §7.2 mandaria o linter vencer o gate numa divergência
 * que ninguém teria como notar.
 */
import { THRESHOLDS } from '../thresholds.mjs';

const MAX_FUNCTION_LINES = THRESHOLDS.functionLines;
const MAX_NESTING = THRESHOLDS.nesting;
const MAX_PARAMS = THRESHOLDS.params;

const EXT_KEYS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Só arquivos de produção da linguagem pedida. Teste tem outra economia e fica de fora. */
function filesOf(ctx, keys) {
  return ctx.code.filter((a) => !a.isTest && EXT_KEYS.has(a.ext) === keys);
}

function countKeys(text) {
  const withoutText = text.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
  const opens = (withoutText.match(/[{[(]/g) ?? []).length;
  const closes = (withoutText.match(/[}\])]/g) ?? []).length;
  return opens - closes;
}

/** Assinaturas de função em linguagem de chaves e em Python. */
const FUNCTION_START = [
  /\bfunction\s+\w+\s*\(/,
  /\b(?:export\s+)?(?:async\s+)?function\b/,
  /\b\w+\s*\([^)]*\)\s*(?::\s*[^={]+)?\s*(?:=>\s*)?\{\s*$/,
  /^\s*(?:async\s+)?def\s+\w+\s*\(/,
];

function isFunctionStart(text) {
  return FUNCTION_START.some((pattern) => pattern.test(text));
}

/** Mede o tamanho de cada função por profundidade de bloco (chaves) ou por recuo (Python). */
function measureFunctions(file) {
  const isPython = file.ext === '.py';
  const measured = [];
  let current = null;

  for (const { number, text } of file.codeLines) {
    if (current !== null) {
      const indent = text.length - text.trimStart().length;
      const ended = isPython ? indent <= current.indent : (current.depth += countKeys(text)) <= 0;
      current.lines += 1;
      if (ended) {
        measured.push(current);
        current = null;
        continue;
      }
    }
    if (current === null && isFunctionStart(text)) {
      current = {
        start: number,
        lines: 0,
        indent: text.length - text.trimStart().length,
        depth: isPython ? 1 : countKeys(text),
      };
    }
  }
  if (current !== null) measured.push(current);
  return measured;
}

/** Conta parâmetros da assinatura, tolerando genéricos e valores default simples. */
function countParams(text) {
  const opens = text.indexOf('(');
  if (opens === -1) return 0;
  let depth = 0;
  let current = '';
  const parts = [];

  for (const character of text.slice(opens)) {
    if ('([{<'.includes(character)) depth += 1;
    if (')]}>'.includes(character)) {
      depth -= 1;
      if (depth === 0) break;
    }
    if (character === ',' && depth === 1) {
      parts.push(current);
      current = '';
      continue;
    }
    if (depth >= 1) current += character;
  }
  parts.push(current);
  return parts.map((p) => p.replace('(', '').trim()).filter((p) => p !== '' && p !== 'self' && p !== 'cls').length;
}

// Só estes abrem "aninhamento". Objeto literal, JSX, callback e bloco de função NAO sao
// aninhamento de controle — contá-los foi o que gerou falso positivo na primeira versão desta regra.
const CONTROL = /^\s*(?:\}\s*)?(?:if|else|for|while|switch|do|try|catch|finally)\b/;
const CONTROL_PY = /^\s*(?:if|elif|else|for|while|with|try|except|finally)\b/;

/** Profundidade de blocos de CONTROLE em linguagem de chaves, por pilha. */
function nestingByKeys(lines) {
  const stack = [];
  const findings = [];

  for (const { number, text } of lines) {
    const withoutText = text.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
    const isControl = CONTROL.test(text);
    let firstOpening = true;

    // O maximo DENTRO da linha, nao o saldo no fim dela: `if (a) { return 1; }` abre e fecha na
    // mesma linha, e e exatamente esse caso que escaparia se so o saldo final fosse medido.
    let max = stack.filter(Boolean).length;
    for (const character of withoutText) {
      if (character === '{') {
        stack.push(isControl && firstOpening);
        firstOpening = false;
        max = Math.max(max, stack.filter(Boolean).length);
      }
      if (character === '}') stack.pop();
    }
    if (max > MAX_NESTING) findings.push({ number, depth: max });
  }
  return findings;
}

/** Profundidade de blocos de CONTROLE em Python, pelos recuos onde um controle abriu. */
function pythonNesting(lines) {
  const open = [];
  const findings = [];

  for (const { number, text } of lines) {
    const indent = text.length - text.trimStart().length;
    while (open.length > 0 && indent <= open[open.length - 1]) open.pop();
    if (open.length > MAX_NESTING) findings.push({ number, depth: open.length });
    if (CONTROL_PY.test(text) && text.trimEnd().endsWith(':')) open.push(indent);
  }
  return findings;
}

export default [
  {
    id: 'function-threshold',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      for (const file of [...filesOf(ctx, true), ...filesOf(ctx, false)]) {
        for (const measured of measureFunctions(file)) {
          if (measured.lines > MAX_FUNCTION_LINES) {
            findings.push(`${file.rel}:${measured.start}: function has ${measured.lines} lines (limit ${MAX_FUNCTION_LINES})`);
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'nesting-threshold',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        const measure = file.ext === '.py' ? pythonNesting : nestingByKeys;
        for (const { number, depth } of measure(file.codeLines)) {
          findings.push(`${file.rel}:${number}: nesting depth ${depth} (limit ${MAX_NESTING}) — use a guard clause`);
        }
      }
      return findings;
    },
  },
  {
    id: 'parameters-threshold',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        for (const { number, text } of file.codeLines) {
          if (!isFunctionStart(text)) continue;
          const total = countParams(text);
          if (total > MAX_PARAMS) {
            findings.push(`${file.rel}:${number}: ${total} parameters (limit ${MAX_PARAMS}) — group them in an object`);
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'swallowed-exception',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const empty = [
        /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
        /except[^:]*:\s*pass\s*$/,
        /catch\s*(?:\([^)]*\))?\s*\{\s*$/,
      ];
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        const lines = file.codeLines;
        lines.forEach(({ number, text }, index) => {
          if (empty[0].test(text) || empty[1].test(text)) {
            findings.push(`${file.rel}:${number}: swallowed exception — handle it, wrap it, or let it propagate`);
            return;
          }
          // `catch {` seguido direto de `}` na proxima linha de codigo.
          if (empty[2].test(text) && lines[index + 1]?.text.trim() === '}') {
            findings.push(`${file.rel}:${number}: swallowed exception — handle it, wrap it, or let it propagate`);
          }
        });
      }
      return findings;
    },
  },
];
