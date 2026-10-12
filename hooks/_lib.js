"use strict";
// Base compartilhada dos hooks Sarak (SRP: só I/O e utilidades, zero regra de negócio).
// Contrato dos hooks do Claude Code: payload JSON via stdin; decisão via JSON no stdout.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

/** Lê e parseia o payload JSON do hook (stdin). Nunca lança. */
function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

/** Verifica se um executável existe no PATH (cross-OS). */
function commandExists(cmd) {
  const finder = process.platform === "win32" ? "where" : "which";
  return spawnSync(finder, [cmd], { stdio: "ignore" }).status === 0;
}

/** Executa um comando capturando stdout/stderr como texto. */
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

/** PreToolUse: nega a chamada da ferramenta com um motivo. */
function denyPreTool(reason) {
  emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
}

/** PreToolUse: pede aprovação do usuário (prompt nativo) em vez de negar/permitir direto. */
function askPreTool(reason) {
  emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: reason,
    },
  });
}

/**
 * Extrai arquivos afetados tanto do payload Claude quanto de um patch do Codex, sempre ABSOLUTOS.
 *
 * O patch do Codex traz caminhos relativos ao `cwd` da sessão (`*** Add File: a.py`); o processo do
 * hook pode nascer em outro diretório. Resolver contra `input.cwd` aqui, num lugar só, poupa cada hook
 * de saber disso. Caminho já absoluto (o `file_path` do Claude) passa intacto pelo `path.resolve`.
 */
function editedFiles(input) {
  const base = input?.cwd || process.cwd();
  const claudePath = input?.tool_input?.file_path;
  if (typeof claudePath === "string" && claudePath) return [path.resolve(base, claudePath)];

  const patch = input?.tool_input?.command;
  if (typeof patch !== "string") return [];

  return [...new Set(patchFiles(patch).map((rel) => path.resolve(base, rel)))];
}

/**
 * Núcleo: os caminhos (como escritos no patch) que EXISTEM depois de um `apply_patch` do Codex. Pura —
 * a regra é a gramática do patch, não o disco: `Add File` entra; `Update File` entra; um `Move to` logo
 * após um `Update File` troca a origem (que deixa de existir) pelo destino; `Delete File` não entra.
 */
function patchFiles(patch) {
  const finals = [];
  let lastUpdate = -1;
  for (const [, kind, target] of patch.matchAll(/^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/gm)) {
    const filePath = target.trim();
    if (kind === "Move to" && lastUpdate >= 0) finals[lastUpdate] = filePath;
    if (kind === "Add File" || kind === "Update File") finals.push(filePath);
    lastUpdate = kind === "Update File" ? finals.length - 1 : -1;
  }
  return finals;
}

/**
 * PreToolUse que pede confirmação (`ask`) — exceto no Codex, onde nega.
 *
 * O Codex interpreta `permissionDecision: "ask"` mas não o suporta: marca o hook como falho e deixa a
 * chamada seguir (fail-open). Pedir confirmação lá equivaleria a liberar, por isso nega. A detecção usa
 * `PLUGIN_ROOT`, que só o Codex define (ele também define `CLAUDE_PLUGIN_ROOT`, por compatibilidade, então
 * essa variável não distingue os dois harnesses).
 * Lacuna declarada: a premissa vale para hooks DE PLUGIN — um hook manual do Codex (`.codex/hooks.json`) não recebe `PLUGIN_ROOT` e cai no `ask`.
 */
function askOrDenyPreTool(reason) {
  if (process.env.PLUGIN_ROOT) denyPreTool(reason);
  askPreTool(reason);
}

/** PostToolUse: devolve feedback ao modelo para corrigir (re-prompt). */
function blockPostTool(reason) {
  emit({ decision: "block", reason });
}

/** PostToolUse: injeta aviso ao modelo SEM bloquear (modo "warn"). */
function warnPostTool(text) {
  emit({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } });
}

/** SessionStart / UserPromptSubmit: injeta contexto adicional. */
function addContext(eventName, text) {
  emit({ hookSpecificOutput: { hookEventName: eventName, additionalContext: text } });
}

/** Sai sem decisão — segue o fluxo normal. */
function allow() {
  process.exit(0);
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

/**
 * A raiz do PROJETO em que o agente está trabalhando, ou `null`.
 *
 * Procura o arquivo de política em si (`config/verification.json`), e não um marcador indireto como
 * `modulos/`: se o alvo existe, a resposta é certa; se não existe em lugar nenhum, cai no
 * `config.json` da base sem inventar raiz. É o que faz o hook rodar na PRÓPRIA base sem quebrar —
 * ela não tem esse arquivo, então a busca falha e o fallback assume.
 *
 * `CLAUDE_PROJECT_DIR` primeiro porque é o contrato do ambiente de hook do Claude Code e é
 * literalmente "o projeto em que o agente está" — o mesmo que `settings.template.json` já usa. Depois
 * o `cwd` do PAYLOAD (`payloadCwd`, opcional): no Codex não há `CLAUDE_PROJECT_DIR`, e o processo do
 * hook não nasce necessariamente na sessão — o payload é quem diz onde ela está. `process.cwd()` por
 * último, porque o hook pode ser invocado à mão, sem variável nem payload.
 */
function projectRoot(payloadCwd) {
  const starts = [];
  if (process.env.CLAUDE_PROJECT_DIR) starts.push(process.env.CLAUDE_PROJECT_DIR);
  if (payloadCwd) starts.push(payloadCwd);
  starts.push(process.cwd());
  for (const start of starts) {
    let current = path.resolve(start);
    for (let level = 0; level < 8; level += 1) {
      if (fs.existsSync(path.join(current, "config", "verification.json"))) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

/**
 * Vocabulário ANTIGO (português) das chaves de política → o atual (inglês). Projetos que já têm cópia ou
 * override local de `hooks/config.json` podem trazer as chaves antigas; `normalizeLegacyKeys` as traduz
 * num lugar só, e nenhum hook precisa saber que elas existiram.
 */
const LEGACY_KEYS = {
  qualidade: "quality",
  modo: "mode",
  formatacao: "formatting",
  ativo: "active",
  escopo: "scope",
  cobertura: "coverage",
  minima: "minimum",
  ferramentas: "tools",
  dependencias: "dependencies",
  severidadeMinima: "minimumSeverity",
  linguagens: "languages",
  formatador: "formatter",
};

/** Valores enumerados antigos (português) → atuais, por chave já traduzida. */
const LEGACY_VALUES = {
  scope: { conformes: "conforming", arquivo: "file" },
};

/** Núcleo: devolve a política com as chaves/valores antigos traduzidos. Pura; chave atual vence a antiga. */
function normalizeLegacyKeys(raw) {
  if (Array.isArray(raw) || raw === null || typeof raw !== "object") return raw;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const renamed = LEGACY_KEYS[key] ?? key;
    if (renamed !== key && Object.hasOwn(raw, renamed)) continue;
    const normalized = normalizeLegacyKeys(value);
    out[renamed] = LEGACY_VALUES[renamed]?.[normalized] ?? normalized;
  }
  return out;
}

/**
 * Lê `config/verification.json` (vocabulário do TEMPLATE, o mesmo dos hooks desde a Onda 5) e devolve a
 * política no formato interno dos hooks.
 *
 * O único trabalho da ponte: o template nomeia BINDING (`typescript`/`javascript`/`python`) e os hooks
 * nomeiam ÁREA (`js`/`python`), porque `langOf` mapeia extensão para área. `typescript` e `javascript`
 * colapsam na mesma área `js` (quem linta `.ts` e `.js` no projeto é o mesmo eslint); `typescript` tem
 * precedência quando os dois estão declarados.
 */
function projectPolicy(root) {
  const raw = normalizeLegacyKeys(JSON.parse(fs.readFileSync(path.join(root, "config", "verification.json"), "utf8")));
  const languages = {};
  const forJs = raw.languages?.typescript ?? raw.languages?.javascript;
  if (forJs) languages.js = { linter: forJs.linter, formatter: forJs.formatter };
  if (raw.languages?.python) {
    languages.python = { linter: raw.languages.python.linter, formatter: raw.languages.python.formatter };
  }
  return {
    quality: raw.quality,
    formatting: raw.formatting,
    coverage: raw.coverage,
    dependencies: raw.dependencies,
    languages: Object.keys(languages).length > 0 ? languages : undefined,
  };
}

/**
 * Carrega a política dos hooks. Nunca lança; mescla com defaults.
 *
 * DUAS fontes, e a ordem é a decisão: quando existe `config/verification.json` no projeto, a política
 * é a DELE — o repositório que os hooks protegem é quem diz como quer ser protegido. Só na ausência
 * dele vale o `config.json` da base, que é o caso da própria base e de projeto que não veio do
 * template. Em ambas, chaves no vocabulário antigo (português) são aceitas via `normalizeLegacyKeys`.
 *
 * `quality` tem `mode` e NADA MAIS. Nem limiares nem lista de proibições: os limiares são LEI, com fonte
 * única em `tools/gate/thresholds.mjs`. O hook não carrega mais número nenhum — ele roda o linter do
 * projeto com a config do projeto, que é derivada daquela fonte. Enquanto o número morava aqui, ele
 * VENCIA a config gerada, e o hook podia discordar do `npm run lint` do mesmo projeto. A lista de
 * proibições saiu pelo mesmo argumento com o sinal trocado: o gerador emite `no-console`/`no-empty`/
 * `T20`/`E` sem ler política nenhuma, então o campo nunca acrescentava cobertura — só escondia do agente
 * um erro que o lint acusava.
 *
 * `payloadCwd` (opcional) é repassado ao `projectRoot`: a política vem do mesmo projeto que o hook
 * inspeciona, não de onde o processo nasceu.
 */
function loadConfig(payloadCwd) {
  const defaults = {
    quality: {
      mode: "warn", // block | warn | off
    },
    formatting: { active: true, scope: "conforming" }, // scope: conforming | file
    coverage: {
      mode: "ask", // ask | block | warn | off
      minimum: 80,
      tools: { python: "pytest", js: "vitest", go: "go", java: "jacoco" },
    },
    dependencies: {
      mode: "warn", // block | warn | off
      minimumSeverity: "high",
      tools: { node: "npm", python: "pip-audit", go: "govulncheck" },
    },
    languages: {
      python: { linter: "ruff", formatter: "ruff" },
      js: { linter: "eslint", formatter: "prettier" },
      go: { linter: "golangci-lint", formatter: "gofmt" },
      java: { linter: "checkstyle", formatter: "google-java-format" },
    },
  };
  return mergePolicy(defaults, readPolicy(payloadCwd));
}

/** A política crua, do projeto quando houver, da base quando não. Nunca lança. */
function readPolicy(payloadCwd) {
  const root = projectRoot(payloadCwd);
  try {
    if (root !== null) return projectPolicy(root);
    return normalizeLegacyKeys(JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")));
  } catch {
    return {};
  }
}

/** Mescla a política crua sobre os defaults, um nível abaixo onde a forma é aninhada. */
function mergePolicy(defaults, raw) {
  return {
    quality: { ...defaults.quality, ...raw.quality },
    formatting: { ...defaults.formatting, ...raw.formatting },
    coverage: { ...defaults.coverage, ...raw.coverage,
      tools: { ...defaults.coverage.tools, ...(raw.coverage?.tools) } },
    dependencies: { ...defaults.dependencies, ...raw.dependencies,
      tools: { ...defaults.dependencies.tools, ...(raw.dependencies?.tools) } },
    languages: { ...defaults.languages, ...raw.languages },
  };
}

/** Mapeia extensão de arquivo para a área de padrão. */
function langOf(file) {
  const ext = ((file || "").toLowerCase().match(/\.[^.\\/]+$/) || [""])[0];
  if (ext === ".py") return "python";
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "js";
  if (ext === ".go") return "go";
  if (ext === ".java") return "java";
  return null;
}

/** Acumulador de casos do `--selftest`: `check(ok, name)` conta cada caso e guarda os que falham. */
function newChecks() {
  const failures = [];
  let total = 0;
  const check = (ok, name) => {
    total += 1;
    if (!ok) failures.push(name);
  };
  return { check, failures, count: () => total };
}

/** `editedFiles`: patch relativo resolvido contra o `cwd` do payload; absoluto e Claude intactos. */
function selftestEditedFiles(check) {
  const proj = path.resolve("/proj");
  const codexFiles = editedFiles({
    cwd: proj,
    tool_input: { command: "*** Update File: src/a.ts\n*** Add File: tests/a.test.ts\n" },
  });
  check(
    codexFiles.join(",") === [path.resolve(proj, "src/a.ts"), path.resolve(proj, "tests/a.test.ts")].join(","),
    "editedFiles should resolve the Codex patch against the payload cwd",
  );
  const absolute = path.resolve("/other/b.py");
  check(
    editedFiles({ cwd: proj, tool_input: { command: `*** Add File: ${absolute}\n` } }).join() === absolute,
    "editedFiles should leave an absolute path in the patch intact",
  );
  const fromClaude = path.resolve("/proj/src/a.py");
  check(
    editedFiles({ tool_input: { file_path: fromClaude } }).join() === fromClaude,
    "editedFiles should preserve Claude's absolute file_path",
  );
  selftestPatchWithDeleteAndMove(check, proj);
}

/** `editedFiles` no patch do Codex: só o que existe DEPOIS da edição — Delete fora, Move pelo destino. */
function selftestPatchWithDeleteAndMove(check, proj) {
  const fromPatch = (command) => editedFiles({ cwd: proj, tool_input: { command } }).join(",");
  const resolved = (...rels) => rels.map((rel) => path.resolve(proj, rel)).join(",");
  check(
    fromPatch("*** Begin Patch\n*** Delete File: legacy.py\n*** End Patch\n") === "",
    "editedFiles should leave out the file of a Delete File",
  );
  check(
    fromPatch("*** Update File: old.py\n*** Move to: new.py\n@@\n-a\n+b\n") === resolved("new.py"),
    "editedFiles should swap the source of an Update + Move to for the destination",
  );
  const mixed = "*** Begin Patch\n*** Add File: add.py\n+x\n*** Update File: mod.py\n@@\n-a\n+b\n"
    + "*** Delete File: deleted.py\n*** Update File: old.py\n*** Move to: dir/renamed.py\n@@\n-c\n+d\n"
    + "*** Update File: mod.py\n@@\n-e\n+f\n*** End Patch\n";
  check(
    fromPatch(mixed) === resolved("add.py", "mod.py", "dir/renamed.py"),
    "editedFiles should, in a mixed patch, bring Add + Update + Move destination, without Delete or duplicates",
  );
}

/** `projectRoot(cwd)`: acha a raiz partindo do `cwd` do payload, sem `CLAUDE_PROJECT_DIR` mascarando. */
function selftestProjectRoot(check) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sarak-root-"));
  const saved = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  try {
    fs.mkdirSync(path.join(tmp, "config"));
    fs.writeFileSync(path.join(tmp, "config", "verification.json"), "{}");
    const sub = path.join(tmp, "src", "mod");
    fs.mkdirSync(sub, { recursive: true });
    check(projectRoot(sub) === path.resolve(tmp), "projectRoot should find the root starting from the payload cwd");
  } finally {
    if (saved !== undefined) process.env.CLAUDE_PROJECT_DIR = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** `mergePolicy`: o valor do projeto vence, o default não sobrescrito fica, `tools` mescla por chave. */
function selftestMergePolicy(check) {
  const defaults = {
    quality: { mode: "warn" },
    coverage: { mode: "ask", tools: { python: "pytest" } },
    dependencies: { mode: "warn", tools: { node: "npm" } },
    languages: { python: { linter: "ruff" } },
  };
  const overridingMode = mergePolicy(defaults, { quality: { mode: "block" } });
  check(overridingMode.quality.mode === "block", "mergePolicy should override quality.mode with the project value");
  check(overridingMode.coverage.mode === "ask", "mergePolicy should preserve a non-overridden default (coverage.mode)");
  const overridingTool = mergePolicy(defaults, { dependencies: { tools: { python: "pip-audit" } } });
  check(
    overridingTool.dependencies.tools.node === "npm" && overridingTool.dependencies.tools.python === "pip-audit",
    "mergePolicy should merge tools by key, not replace the whole object",
  );
}

/** `normalizeLegacyKeys`: política com chaves antigas (português) chega ao hook já no vocabulário atual. */
function selftestLegacyKeys(check) {
  const legacy = normalizeLegacyKeys({
    qualidade: { modo: "block" },
    formatacao: { ativo: false, escopo: "arquivo" },
    cobertura: { minima: 70, ferramentas: { python: "pytest" } },
    dependencias: { severidadeMinima: "critical" },
    linguagens: { python: { linter: "ruff" } },
  });
  check(legacy.quality?.mode === "block", "normalizeLegacyKeys should translate the legacy quality key to quality.mode");
  check(
    legacy.formatting?.active === false && legacy.formatting?.scope === "file",
    "normalizeLegacyKeys should translate the legacy formatting keys and scope value to formatting.active/scope",
  );
  check(
    legacy.coverage?.minimum === 70 && legacy.coverage?.tools?.python === "pytest",
    "normalizeLegacyKeys should translate the legacy coverage keys to coverage.minimum/tools",
  );
  check(
    legacy.dependencies?.minimumSeverity === "critical" && legacy.languages?.python?.linter === "ruff",
    "normalizeLegacyKeys should translate the legacy dependencies and languages keys",
  );
  const current = normalizeLegacyKeys({ quality: { mode: "off" }, qualidade: { modo: "block" } });
  check(current.quality.mode === "off", "normalizeLegacyKeys: the current key should win over the legacy one");
}

function selftest() {
  const { check, failures, count } = newChecks();
  check(langOf("a.py") === "python", "langOf should recognize .py as python");
  check(langOf("a.ts") === "js", "langOf should collapse .ts into the js area");
  check(langOf("A.TSX") === "js", "langOf should be case-insensitive (.TSX)");
  check(langOf("a.go") === "go", "langOf should recognize .go as go");
  check(langOf("a.rb") === null, "langOf should return null for an extension without an area");
  selftestEditedFiles(check);
  selftestProjectRoot(check);
  selftestMergePolicy(check);
  selftestLegacyKeys(check);

  for (const failure of failures) process.stdout.write(`  failure  ${failure}\n`);
  if (failures.length > 0) {
    process.stdout.write(`selftest (_lib.js): ${failures.length} failure(s)\n`);
    return 1;
  }
  process.stdout.write(`selftest (_lib.js): ${count()}/${count()} ok\n`);
  return 0;
}

if (require.main === module && process.argv.includes("--selftest")) process.exit(selftest());

module.exports = {
  readInput,
  commandExists,
  projectRoot,
  run,
  editedFiles,
  denyPreTool,
  askPreTool,
  askOrDenyPreTool,
  blockPostTool,
  warnPostTool,
  addContext,
  allow,
  loadConfig,
  langOf,
  mergePolicy,
  normalizeLegacyKeys,
};
