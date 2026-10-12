#!/usr/bin/env node
"use strict";
// GARANTIA 2 (consistência visual) — PostToolUse(Write/Edit): formata o arquivo
// editado com o formatter da linguagem (definido em hooks/config.json).
// Best-effort: formatar não é verificação — sem a ferramenta ou com formatting.active=false, pula.
// Escopo (`formatting.scope`): "conforming" (default) só reformata quando isso não gera ruído —
// arquivo fora de git, novo, ou cujo HEAD já estava conforme. Arquivo legado (HEAD fora do formatador)
// fica intacto, para o diff não misturar formatação com a mudança. "file" = sempre formata.
// Mapeia: padrao-escrita (consistência de estilo).

const path = require("path");
const { readInput, allow, warnPostTool, commandExists, editedFiles, loadConfig, langOf, run } = require("./_lib");

/** Como cada formatter reescreve o arquivo no lugar. */
const FORMAT_ARGS = {
  ruff: (fp) => ["format", fp],
  prettier: (fp) => ["--write", fp],
  gofmt: (fp) => ["-w", fp],
  "google-java-format": (fp) => ["--replace", fp],
};

/**
 * Como cada formatter CHECA um conteúdo lido por stdin, com `fp` só para a descoberta de config.
 * Só entra aqui o que foi EXECUTADO e confirmado (exit 0 = conforme, 1 = não conforme): `ruff` e
 * `prettier`. `gofmt` e `google-java-format` ficam de fora até alguém confirmar um modo de checagem
 * por stdin — sem ele a conformidade é indeterminada, e arquivo rastreado não é reformatado.
 */
const CHECK_ARGS = {
  ruff: (fp) => ["format", "--check", "--stdin-filename", fp, "-"],
  prettier: (fp) => ["--check", "--stdin-filepath", fp],
};

/** Núcleo: exit da checagem -> conforme (true), não conforme (false) ou indeterminado (null). */
function conformanceFromStatus(status) {
  if (status === 0) return true;
  if (status === 1) return false;
  return null;
}

/**
 * Núcleo: "format" ou "skip-legacy". Pura. `headConforming` é true | false | null — null (não deu
 * para verificar) é tratado como legado: na dúvida, nada de ruído. Escopo "arquivo" sempre formata.
 */
function shouldFormat({ scope, inRepo, tracked, headConforming }) {
  if (scope === "file") return "format";
  if (!inRepo || !tracked) return "format";
  return headConforming === true ? "format" : "skip-legacy";
}

function git(cwd, args) {
  return run("git", ["-C", cwd, ...args]);
}

/**
 * Casca: `{ emRepo, rastreado, conteudoHead }` do arquivo. Rastreado mas ausente no HEAD (só no
 * índice) conta como novo. git que nem roda devolve rastreado com conteúdo null (indeterminado).
 */
function gitState(fp) {
  const top = git(path.dirname(fp), ["rev-parse", "--show-toplevel"]);
  if (top.error) return { inRepo: true, tracked: true, headContent: null };
  if (top.status !== 0) return { inRepo: false, tracked: false, headContent: null };
  const root = top.stdout.trim();
  const rel = path.relative(root, fp).split(path.sep).join("/");
  const fresh = { inRepo: true, tracked: false, headContent: null };
  if (git(root, ["ls-files", "--error-unmatch", "--", rel]).status !== 0) return fresh;
  if (git(root, ["cat-file", "-e", `HEAD:${rel}`]).status !== 0) return fresh;
  const show = git(root, ["show", `HEAD:${rel}`]);
  return { inRepo: true, tracked: true, headContent: show.status === 0 ? show.stdout : null };
}

/** Casca: o conteúdo do HEAD passa pelo modo de checagem do formatter, por stdin. */
function headConforming(formatter, fp, headContent) {
  const check = CHECK_ARGS[formatter];
  if (!check || headContent === null) return null;
  const r = run(formatter, check(fp), { input: headContent, cwd: path.dirname(fp) });
  return conformanceFromStatus(r.status);
}

/** Casca: a decisão para um arquivo, e a conformidade do HEAD (para a mensagem). */
function decide(fp, formatter, scope) {
  if (scope === "file") return { action: "format", conforming: null };
  const state = gitState(fp);
  const conforming = state.tracked ? headConforming(formatter, fp, state.headContent) : null;
  return { action: shouldFormat({ scope, ...state, headConforming: conforming }), conforming };
}

function legacyWarning(label, conforming) {
  const reason = conforming === false ? " was not formatted at HEAD" : ": could not verify whether it was formatted at HEAD";
  return `${label}${reason} — not reformatted, to avoid mixing formatting with the change. Format it in a separate commit if you want.`;
}

function selftest() {
  const base = { scope: "conforming", inRepo: true, tracked: true };
  const cases = [
    ["outside a git repository -> format", shouldFormat({ ...base, inRepo: false, tracked: false, headConforming: null }) === "format"],
    ["untracked (new) -> format", shouldFormat({ ...base, tracked: false, headConforming: null }) === "format"],
    ["tracked with conforming HEAD -> format", shouldFormat({ ...base, headConforming: true }) === "format"],
    ["tracked with non-conforming HEAD (legacy) -> skip", shouldFormat({ ...base, headConforming: false }) === "skip-legacy"],
    ["indeterminate (null) -> skip, as legacy", shouldFormat({ ...base, headConforming: null }) === "skip-legacy"],
    ["scope 'file' formats even legacy", shouldFormat({ ...base, scope: "file", headConforming: false }) === "format"],
    ["scope 'file' formats even indeterminate", shouldFormat({ ...base, scope: "file", headConforming: null }) === "format"],
    ["check exit 0 -> conforming", conformanceFromStatus(0) === true],
    ["check exit 1 -> non-conforming", conformanceFromStatus(1) === false],
    ["check exit 2 or no exit -> indeterminate", conformanceFromStatus(2) === null && conformanceFromStatus(null) === null],
  ];
  const failures = cases.filter(([, ok]) => !ok);
  for (const [name, ok] of cases) process.stdout.write(`  ${ok ? "ok   " : "FAIL"} ${name}\n`);
  process.stdout.write(`selftest (padrao-format.js): ${cases.length - failures.length}/${cases.length} ok\n`);
  return failures.length === 0 ? 0 : 1;
}

if (process.argv.includes("--selftest")) process.exit(selftest());

const input = readInput();
const cfg = loadConfig(input.cwd);
if (cfg.formatting?.active === false) allow();

const scope = cfg.formatting?.scope ?? "conforming";
const base = input.cwd || process.cwd();
const warnings = [];

for (const fp of editedFiles(input)) {
  const lang = langOf(fp);
  if (!lang) continue;
  const formatter = cfg.languages[lang]?.formatter;
  const args = FORMAT_ARGS[formatter];
  if (!args || !commandExists(formatter)) continue;

  const { action, conforming } = decide(fp, formatter, scope);
  if (action === "format") run(formatter, args(fp));
  else warnings.push(legacyWarning(path.relative(base, fp) || fp, conforming));
}

if (warnings.length > 0) warnPostTool(warnings.join("\n"));
allow(); // formatar nunca bloqueia.
