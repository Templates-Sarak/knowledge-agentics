#!/usr/bin/env node
"use strict";
// GARANTIA 2 (parte de idioma) — PostToolUse(Write/Edit): AVISA quando um identificador do arquivo editado
// bate o vocabulário fechado de português (ADR-023: o código é em inglês; o português mora em comentário,
// em documentação e no valor de `config/texts.json`).
//
// É o Nível 0 da MESMA regra que o gate cobra no template (`portuguese-identifier`): vale para projeto com
// ou sem template. O que cobra, o que não cobra e o tokenizador são os do gate — este hook IMPORTA
// `tools/gate/language.mjs` e lê o `language-vocabulary.json` ao lado dele. Uma fonte, três leitores (gate,
// medidor, hook); copiar o vocabulário para cá seria a quarta cópia que divergiria.
//
// Onde procura o par (tokenizador + vocabulário), na ordem:
//   1. `<raiz do projeto>/tools/gate/` — o gate vendorizado num projeto do template (é o que o gate DELE cobra);
//   2. `<plugin>/specs/_estrutura_modulos/tools/gate/` — o caminho em que o plugin `sarak` o instala.
// Nenhum achado → o hook SE CALA e diz por quê no log (stderr), sem quebrar a edição.
//
// Política (`language.mode` em `config/verification.json`, com fallback para `hooks/config.json`):
// warn (padrão) = só avisa | block = cobra correção | off = ignora. NUNCA bloqueia por padrão: idioma é
// convenção do projeto, e projeto legado em português receberia um bloqueio a cada edição.
// Não cobre: comentário, string, valor de `config/texts.json`, acesso por ponto, nome de arquivo e SQL.

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { readInput, allow, blockPostTool, warnPostTool, editedFiles, loadConfig, projectRoot } = require("./_lib");

const RULE_ID = "portuguese-identifier";
const MAX_REPORTED = 8;
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
const SKIPPED_DIRS = ["node_modules", "dist", "build", "generated", ".venv", "venv", "__pycache__", ".git"];
const GATE_PARTS = ["specs", "_estrutura_modulos", "tools", "gate"];

/** Núcleo: o arquivo é código de que o tokenizador entende e fora de pasta gerada/vendorizada? Pura. */
function isCandidate(file) {
  if (!CODE_EXT.has(path.extname(file).toLowerCase())) return false;
  const parts = path.resolve(file).split(path.sep);
  return !parts.some((part) => SKIPPED_DIRS.includes(part));
}

/** As pastas onde o par (language.mjs + vocabulário) pode estar, na ordem de precedência. Pura. */
function gateDirs(root) {
  const dirs = [];
  if (root) dirs.push(path.join(root, "tools", "gate"));
  dirs.push(path.join(__dirname, "..", ...GATE_PARTS));
  return dirs;
}

/** A primeira pasta com os DOIS arquivos, ou `null`. O disco entra por `exists` (testável). */
function findGateDir(dirs, exists = fs.existsSync) {
  const both = (dir) => exists(path.join(dir, "language.mjs")) && exists(path.join(dir, "language-vocabulary.json"));
  return dirs.find(both) ?? null;
}

/** Carrega tokenizador + vocabulário. Devolve `{ api, vocabulary }` ou `{ silent: <por quê> }`. Nunca lança. */
async function loadLanguage(dir) {
  if (dir === null) return { silent: "language.mjs and language-vocabulary.json were not found (looked in the project's tools/gate and in the plugin's specs/)" };
  try {
    const api = await import(pathToFileURL(path.join(dir, "language.mjs")).href);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "language-vocabulary.json"), "utf8"));
    return { api, vocabulary: api.buildVocabulary(raw) };
  } catch (cause) {
    return { silent: `could not load the language rule from ${dir}: ${String(cause?.message ?? cause).slice(0, 160)}` };
  }
}

/**
 * Núcleo: os nomes em português de UM arquivo, `[{ name, terms, line }]`. Pura sobre `api`/`vocabulary`.
 * Extensão fora do conjunto do tokenizador devolve vazio — nunca acusa o que não leu.
 */
function portugueseNames(text, ext, loaded) {
  const language = loaded.api.languageOf(ext);
  if (language === null) return [];
  return loaded.api.findPortugueseNames(text, language, loaded.vocabulary);
}

/** A mensagem de um arquivo: nomeia arquivo, linha, nome e termo, e aponta a lei. Pura. */
function messageFor(rel, names) {
  const lines = names.slice(0, MAX_REPORTED).map(({ name, terms, line }) => (
    `  ${rel}:${line}: identifier "${name}" contains the Portuguese term ${terms.map((t) => `"${t}"`).join(", ")}`
  ));
  const more = names.length > MAX_REPORTED ? `\n  … and ${names.length - MAX_REPORTED} more` : "";
  return `${lines.join("\n")}${more}`;
}

/**
 * Núcleo: a exceção declarada (`config/compliance.json`) cobre este arquivo? Mesmo mecanismo do gate:
 * módulo + regra. Arquivo em `modules/<id>/` casa o módulo `<id>`; fiação (`adapters/`, `src/`,
 * `packages/`) casa `(root)`. Pura: recebe a lista já lida.
 */
function isExcepted(rel, exceptions) {
  const parts = rel.split(path.sep).join("/").split("/");
  const owner = parts[0] === "modules" && parts.length > 2 ? parts[1] : "(root)";
  return exceptions.some((entry) => entry.rule === RULE_ID && entry.module === owner);
}

function readExceptions(root) {
  if (!root) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, "config", "compliance.json"), "utf8"));
    return Array.isArray(raw.exceptions) ? raw.exceptions : [];
  } catch {
    return [];
  }
}

function log(text) {
  process.stderr.write(`[padrao-idioma] ${text}\n`);
}

/** Corpo do hook, separado do I/O de stdin para o `--selftest` chamá-lo. Devolve `{ signal, text }` ou `{ silent }`. */
async function evaluate({ files, root, mode }) {
  const candidates = files.filter(isCandidate);
  if (candidates.length === 0 || mode === "off") return { quiet: true };
  const loaded = await loadLanguage(findGateDir(gateDirs(root)));
  if (loaded.silent) return { silent: loaded.silent };
  const exceptions = readExceptions(root);
  const blocks = [];
  for (const file of candidates) {
    const rel = root ? path.relative(root, file) : file;
    if (isExcepted(rel, exceptions) && root) continue;
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    const names = portugueseNames(text, path.extname(file).toLowerCase(), loaded);
    if (names.length > 0) blocks.push(messageFor(rel, names));
  }
  if (blocks.length === 0) return { quiet: true };
  const text = `Portuguese identifiers (the code is in English — ADR-023; Portuguese stays in comments, documentation, and the values of config/texts.json):\n${blocks.join("\n")}\nRename them following the padrao-escrita skill.`;
  return { signal: mode === "block" ? "block" : "warn", text };
}

// ------------------------------------------------------------------------------------------------
// AUTOTESTE
// ------------------------------------------------------------------------------------------------

async function selftest() {
  const failures = [];
  let total = 0;
  const check = (ok, name) => { total += 1; if (!ok) failures.push(name); };
  const here = path.resolve(__dirname, "..", ...GATE_PARTS);
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", "sarak-idioma-"));
  try {
    const warns = path.join(tmp, "warns.py");
    fs.writeFileSync(warns, "def listar_registros(titulo):\n    return titulo\n");
    const quiet = path.join(tmp, "quiet.py");
    fs.writeFileSync(quiet, "# listar registros\ndef list_records(title):\n    data_status = 'Nenhum registro'\n    return title\n");
    const real = findGateDir([here]);
    check(real !== null, "the plugin install path should hold language.mjs and the vocabulary");
    if (real === null) return report(failures, total);

    const warned = await evaluate({ files: [warns], root: tmp, mode: "warn" });
    check(warned.signal === "warn" && /listar_registros/.test(warned.text) && /warns\.py:1/.test(warned.text),
      "a Portuguese identifier should WARN, naming file, line and name");
    check(/ADR-023/.test(warned.text ?? ""), "the warning should point to the law (ADR-023)");

    const clean = await evaluate({ files: [quiet], root: tmp, mode: "warn" });
    check(clean.quiet === true, "Portuguese in a comment, a string and a cognate name should stay QUIET");

    const blocked = await evaluate({ files: [warns], root: tmp, mode: "block" });
    check(blocked.signal === "block", "mode block should block, and only when configured");
    const off = await evaluate({ files: [warns], root: tmp, mode: "off" });
    check(off.quiet === true, "mode off should ignore");

    // Sem o par de arquivos: se cala e DIZ por quê (o log), sem lançar.
    check(findGateDir([path.join(tmp, "nowhere")]) === null, "findGateDir should return null when nothing is found");
    const missing = await loadLanguage(null);
    check(typeof missing.silent === "string" && missing.silent.length > 0, "a missing gate should stay silent WITH a reason");
    const broken = path.join(tmp, "broken");
    fs.mkdirSync(broken);
    fs.writeFileSync(path.join(broken, "language.mjs"), "export const x = ;");
    fs.writeFileSync(path.join(broken, "language-vocabulary.json"), "{}");
    check(typeof (await loadLanguage(broken)).silent === "string", "an unloadable gate should stay silent WITH a reason, never throw");

    // Precedência e exceção declarada.
    check(gateDirs("/p")[0] === path.join("/p", "tools", "gate"), "the project's vendored gate should come first");
    check(isExcepted(path.join("modules", "legacy", "api", "a.py"), [{ rule: RULE_ID, module: "legacy" }]) === true,
      "a declared exception (module + rule) should cover the module's files");
    check(isExcepted(path.join("modules", "other", "a.py"), [{ rule: RULE_ID, module: "legacy" }]) === false,
      "an exception for another module should not cover this one");
    check(isExcepted(path.join("src", "composition.py"), [{ rule: RULE_ID, module: "(root)" }]) === true,
      "an exception for (root) should cover the composition code");
    check(isCandidate(path.join(tmp, "node_modules", "x", "a.js")) === false && isCandidate("a.md") === false,
      "vendored folders and non-code files should not be judged");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return report(failures, total);
}

function report(failures, total) {
  for (const failure of failures) process.stdout.write(`  failure  ${failure}\n`);
  if (failures.length > 0) {
    process.stdout.write(`selftest (padrao-idioma.js): ${failures.length} failure(s)\n`);
    return 1;
  }
  process.stdout.write(`selftest (padrao-idioma.js): ${total}/${total} ok\n`);
  return 0;
}

async function main() {
  const input = readInput();
  const cfg = loadConfig(input.cwd);
  const root = projectRoot(input.cwd) ?? process.env.CLAUDE_PROJECT_DIR ?? null;
  const result = await evaluate({ files: editedFiles(input), root, mode: cfg.language.mode });
  if (result.silent) log(`silent — ${result.silent}`);
  if (result.signal === "block") blockPostTool(result.text);
  if (result.signal === "warn") warnPostTool(result.text);
  allow();
}

if (process.argv.includes("--selftest")) {
  selftest().then((code) => process.exit(code));
} else {
  main().catch((cause) => {
    log(`silent — unexpected failure: ${String(cause?.message ?? cause).slice(0, 160)}`);
    process.exit(0);
  });
}
