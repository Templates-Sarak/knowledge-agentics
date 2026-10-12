/**
 * validate.mjs — valida código TypeScript/JavaScript contra os limiares do padrao-escrita.
 *
 * Uso:
 *   node validate.mjs <file-or-dir> [--config config.json]
 *
 * Retorno (stdout):
 *   JSON { "target", "findings": [ {path, line, dimension, severity, risk,
 *   message, rule, confidence} ] } — formato consumível pelo code-diagnostico.
 *
 * Detecta (mecânico, via API do compilador TypeScript): limiares (tamanho de função,
 * aninhamento, nº de parâmetros), logging (console.* / catch vazio), tipagem (assinatura
 * pública sem tipo — só .ts/.tsx), segredos (literal em nome sensível) e hardcoded
 * heurístico (número mágico / URL) — este marcado com confidence "low".
 *
 * Dependência: pacote `typescript`, resolvido a partir do PROJETO-ALVO (ou do cwd) — usa a API
 * CLÁSSICA do compilador (`createSourceFile`/`forEachChild`/`ScriptTarget`). LIMITE DECLARADO:
 * o pacote `typescript` >= 7 (o rewrite nativo/Go) NÃO expõe mais essa API — só `./lib/version.cjs`
 * no export raiz. Rodar este script contra `typescript@7+` não é degradação silenciosa, é falha
 * dura de import. A base pina `typescript` em 5.9.3 exato na raiz por causa disso (ver
 * package.json) — o pin ADIA a migração, não a resolve: portar para 7+ exige outro parser aqui.
 *
 * Código de saída: violação de dimensão "parse" (arquivo que não deu pra ler ou parsear) é
 * SEMPRE fatal — `process.exitCode = 1`, nunca 0. Quem consome esta saída (code-adequador,
 * code-auditoria-padrao) lê exit 0 como "conforme"; um parse que falha e ainda assim retorna
 * 0 aprovaria qualquer coisa (fail-open, medido nesta base antes deste conserto).
 *
 * Regras (padrao-escrita): zero hardcoded (limiares/allowlists vêm do config.json), responsabilidade única.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const target = argv.find((a) => !a.startsWith("--"));
  const i = argv.indexOf("--config");
  const config = i >= 0 ? argv[i + 1] : join(SCRIPT_DIR, "config.json");
  return { target, config };
}

/** Resolve o pacote `typescript` a partir do projeto-alvo; cai para o cwd. */
function loadTypescript(baseDir) {
  for (const base of [baseDir, process.cwd()]) {
    try {
      const req = createRequire(pathToFileURL(join(base, "__resolve__.js")));
      return req("typescript");
    } catch {
      /* tenta o próximo */
    }
  }
  console.error("error: package 'typescript' not found in the target project or in the cwd. Run: npm i -D typescript");
  process.exit(2);
}

function loadConfig(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function collectFiles(target, cfg) {
  const skip = new Set(cfg.skipDirs);
  const exts = new Set(cfg.extensions);
  const stat = statSync(target);
  if (stat.isFile()) return exts.has(extname(target)) ? [target] : [];
  const out = [];
  for (const name of readdirSync(target)) {
    if (skip.has(name)) continue;
    const p = join(target, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...collectFiles(p, cfg));
    else if (exts.has(extname(p))) out.push(p);
  }
  return out;
}

function scriptKind(ts, ext) {
  return { ".ts": ts.ScriptKind.TS, ".tsx": ts.ScriptKind.TSX, ".js": ts.ScriptKind.JS,
    ".jsx": ts.ScriptKind.JSX, ".mjs": ts.ScriptKind.JS, ".cjs": ts.ScriptKind.JS }[ext] ?? ts.ScriptKind.TS;
}

const norm = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

function violation(filePath, line, dimension, severity, risk, message, rule, confidence = "high") {
  return { path: filePath, line, dimension, severity, risk, message, rule, confidence };
}

/** Núcleo: valida um TEXTO TS/JS já lido contra `cfg`. Puro — não toca `fs`. É o que o
 * `--selftest` prova com fixtures em memória (a única entrada externa é o compilador `ts`,
 * carregado uma vez, do mesmo jeito que o selftest de `validate.py` usa o `ast` da stdlib). */
function validateText(ts, filePath, text, cfg) {
  const ext = extname(filePath);
  const isTs = ext === ".ts" || ext === ".tsx";
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind(ts, ext));
  const findings = [];
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const isControl = (n) =>
    ts.isIfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
    ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isSwitchStatement(n) || ts.isTryStatement(n);

  const depth = (node, current = 0) => {
    let max = current;
    ts.forEachChild(node, (child) => {
      const next = isControl(child) ? current + 1 : current;
      max = Math.max(max, depth(child, next));
    });
    return max;
  };

  const isFunction = (n) =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

  function functionName(node) {
    if (node.name && ts.isIdentifier(node.name)) return node.name.text;
    if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
    return undefined;
  }

  function checkFunction(node) {
    const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
    const lineCount = endLine - startLine + 1;
    const line = startLine + 1;
    const name = functionName(node) ?? "<anonymous>";

    if (lineCount > cfg.maxFunctionLines)
      findings.push(violation(filePath, line, "thresholds", "medium", "medium",
        `function '${name}' with ${lineCount} lines`, `function <= ${cfg.maxFunctionLines} lines`));

    const params = (node.parameters ?? []).filter((p) => !cfg.ignoreParamNames.includes(p.name?.getText?.(sf)));
    if (params.length > cfg.maxParams)
      findings.push(violation(filePath, line, "thresholds", "medium", "low",
        `function '${name}' with ${params.length} parameters`, `<= ${cfg.maxParams} parameters`));

    const nestingDepth = depth(node);
    if (nestingDepth > cfg.maxNesting)
      findings.push(violation(filePath, line, "thresholds", "medium", "medium",
        `function '${name}' with nesting of ${nestingDepth} levels`, `nesting <= ${cfg.maxNesting} (use guard clauses)`));

    // tipagem: só TS, só função nomeada pública, ignora construtor
    if (isTs && functionName(node) && !name.startsWith("_") && !ts.isConstructorDeclaration(node)) {
      const missingReturn = !node.type && !ts.isSetAccessor(node);
      const missingParam = (node.parameters ?? []).some((p) => !p.type && p.name?.getText?.(sf) !== "this");
      if (missingReturn || missingParam)
        findings.push(violation(filePath, line, "typing", "low", "low",
          `public function '${name}' without complete type annotations`, "type public signatures (api/contract)"));
    }
  }

  function checkConsole(node) {
    const e = node.expression;
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "console")
      findings.push(violation(filePath, lineOf(node), "logging", "medium", "low",
        `use of console.${e.name.text}`, "use a structured logger, no console.*"));
  }

  function checkCatch(node) {
    if (node.block && node.block.statements.length === 0)
      findings.push(violation(filePath, lineOf(node), "logging", "medium", "low",
        "empty catch (swallowed exception)", "do not swallow exceptions; handle/log"));
  }

  function checkNamedLiteral(name, init, line) {
    if (!init) return;
    const n = norm(name);
    if (ts.isStringLiteral(init)) {
      if (cfg.secretNamePatterns.some((p) => n.includes(p)) && init.text) {
        findings.push(violation(filePath, line, "secrets", "high", "low",
          `possible embedded secret in '${name}'`, "secrets in .env (prefixed by module), never in code"));
        return;
      }
    }
    if (!cfg.hardcodedHeuristic) return;
    const isConstant = name === name.toUpperCase() && /[A-Z]/.test(name);
    if (ts.isNumericLiteral(init)) {
      const v = Number(init.text);
      if (!cfg.allowedMagicNumbers.includes(v) && !isConstant)
        findings.push(violation(filePath, line, "hardcoded", "low", "low",
          `magic number ${init.text}`, "config values in config.json", "low"));
    } else if (ts.isStringLiteral(init) && cfg.urlLikePrefixes.some((p) => init.text.startsWith(p))) {
      findings.push(violation(filePath, line, "hardcoded", "medium", "low",
        `embedded URL/host '${init.text}'`, "URLs/hosts in config.json/.env", "low"));
    }
  }

  function visit(node) {
    if (isFunction(node)) checkFunction(node);
    if (ts.isCallExpression(node)) checkConsole(node);
    if (ts.isCatchClause(node)) checkCatch(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      checkNamedLiteral(node.name.text, node.initializer, lineOf(node));
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.initializer)
      checkNamedLiteral(node.name.text, node.initializer, lineOf(node));
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return findings;
}

/** Núcleo: valida um TEXTO já lido, e nunca deixa uma exceção do AST-walk escapar sem virar
 * violação — qualquer erro de parsing vira uma violação de dimensão "parse", a MESMA regra que
 * `main()` aplicava só para I/O. Extraído para o núcleo para o `--selftest` provar o item sem
 * tocar disco: injeta um `ts` que sempre falha e confere que o resultado é fatal. */
function validateWithParseFallback(ts, filePath, text, cfg) {
  try {
    return validateText(ts, filePath, text, cfg);
  } catch (e) {
    return [violation(filePath, 0, "parse", "high", "low", `failed to parse: ${e.message}`, "valid file")];
  }
}

/** Núcleo: violação de dimensão "parse" é SEMPRE fatal — ver o LIMITE DECLARADO no cabeçalho. */
function hasParseFailure(findings) {
  return findings.some((v) => v.dimension === "parse");
}

/** Casca: lê o arquivo do disco e delega ao núcleo. */
function validateFile(ts, filePath, cfg) {
  return validateWithParseFallback(ts, filePath, readFileSync(filePath, "utf-8"), cfg);
}

function _cfgFixture() {
  return {
    maxFunctionLines: 3,
    maxNesting: 2,
    maxParams: 2,
    ignoreParamNames: ["this"],
    extensions: [".ts", ".tsx", ".js"],
    skipDirs: [],
    allowedMagicNumbers: [0, 1, -1, 2],
    secretNamePatterns: ["password", "token"],
    urlLikePrefixes: ["http://", "https://"],
    hardcodedHeuristic: true,
  };
}

function selftest() {
  const failures = [];
  const ts = loadTypescript(process.cwd());
  const cfg = _cfgFixture();
  const has = (findings, dimension) => findings.some((v) => v.dimension === dimension);

  const largeFunction = "function f(a, b, c) {\n  const x = 1;\n  const y = 2;\n  return x + y + a + b + c;\n}\n";
  if (!has(validateText(ts, "f.ts", largeFunction, cfg), "thresholds"))
    failures.push("validateText should find a thresholds violation (large function/parameters)");

  const nestingCfg = { ..._cfgFixture(), maxFunctionLines: 10, maxParams: 10 };
  const nested = "function f() {\n if (1) {\n  if (1) {\n   if (1) { }\n  }\n }\n}\n";
  const nestedFindings = validateText(ts, "f.ts", nested, nestingCfg);
  if (!nestedFindings.some((v) => v.message.includes("nesting")))
    failures.push("validateText should find a nesting violation (3 levels > limit 2)");

  const untyped = "export function public(a) {\n  return a;\n}\n";
  if (!has(validateText(ts, "f.ts", untyped, cfg), "typing"))
    failures.push("validateText should find a typing violation in a public function without annotation (.ts)");

  const withConsole = "export function public(a: number): number {\n  console.log(a);\n  return a;\n}\n";
  if (!has(validateText(ts, "f.ts", withConsole, cfg), "logging"))
    failures.push("validateText should find a logging violation (console.*)");

  const emptyCatch = "try { f(); } catch (e) { }\n";
  if (!has(validateText(ts, "f.ts", emptyCatch, cfg), "logging"))
    failures.push("validateText should find a logging violation (empty catch)");

  // Concatenado, nao literal: o texto de ORIGEM deste arquivo nao pode conter um segredo-
  // formato contiguo, senao o proprio scan de vazamentos do audit_base.py acha "vazamento"
  // que e so dado de teste (mesmo cuidado do fixture em scan_secrets.py --selftest).
  const secretValue = "sample-value" + "-secret";
  const secret = `const token = '${secretValue}';\n`;
  if (!has(validateText(ts, "f.ts", secret, cfg), "secrets"))
    failures.push("validateText should find a secrets violation in a sensitive name");

  const magic = "const limit = 777;\n";
  if (!has(validateText(ts, "f.ts", magic, cfg), "hardcoded"))
    failures.push("validateText should find a hardcoded violation (magic number)");

  const clean = "export function public(a: number): number {\n  return a;\n}\n";
  if (validateText(ts, "f.ts", clean, cfg).length !== 0)
    failures.push("validateText should find nothing in code within the thresholds");

  // Item central do fail-open: injeta um `ts` que sempre falha ao parsear (nao depende de achar
  // um snippet real que faca o compilador explodir — o compilador TS e tolerante por design) e
  // confere que (a) o nucleo NUNCA deixa a excecao escapar, sempre devolve uma violacao "parse",
  // e (b) essa violacao decide reprovacao (exit fatal), nunca passa em silencio.
  const brokenTs = { ...ts, createSourceFile: () => { throw new Error("simulated boom"); } };
  const brokenFindings = validateWithParseFallback(brokenTs, "f.ts", "anything", cfg);
  if (brokenFindings.length !== 1 || brokenFindings[0].dimension !== "parse")
    failures.push("validateWithParseFallback should convert a parse exception into a 'parse' violation");
  if (!hasParseFailure(brokenFindings))
    failures.push("hasParseFailure should fail (true) when there is a 'parse' dimension violation");
  if (hasParseFailure(validateText(ts, "f.ts", clean, cfg)))
    failures.push("hasParseFailure should not fail on clean code without a parse violation");

  for (const failure of failures) process.stdout.write(`  failure  ${failure}\n`);
  if (failures.length > 0) {
    process.stdout.write(`selftest (validate.mjs): ${failures.length} failure(s)\n`);
    return 1;
  }
  process.stdout.write("selftest (validate.mjs): 11/11 ok\n");
  return 0;
}

function main() {
  if (process.argv.includes("--selftest")) process.exit(selftest());
  const { target, config } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.error("usage: node validate.mjs <file-or-dir> [--config config.json]");
    process.exit(2);
  }
  const absTarget = resolve(target);
  const baseDir = statSync(absTarget).isDirectory() ? absTarget : dirname(absTarget);
  const ts = loadTypescript(baseDir);
  const cfg = loadConfig(config);

  const findings = [];
  for (const file of collectFiles(absTarget, cfg)) {
    findings.push(...validateFile(ts, file, cfg));
  }
  process.stdout.write(JSON.stringify({ target: absTarget, findings }, null, 2) + "\n");
  // Fail-open medido: sem isto, um arquivo que falhava ao parsear virava violation "high" no
  // JSON mas o processo saia com 0 mesmo assim, e quem consome (code-adequador,
  // code-auditoria-padrao) le exit 0 como "conforme" sem olhar o corpo da violacao.
  process.exitCode = hasParseFailure(findings) ? 1 : 0;
}

main();
