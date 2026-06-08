"use strict";
// Base compartilhada dos hooks Sarak (SRP: só I/O e utilidades, zero regra de negócio).
// Contrato dos hooks do Claude Code: payload JSON via stdin; decisão via JSON no stdout.

const fs = require("fs");
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

/** Carrega hooks/config.json (tunables não-secretos). Nunca lança; mescla com defaults. */
function loadConfig() {
  const defaults = {
    qualidade: {
      modo: "warn", // block | warn | off
      limiares: { linhas: 40, aninhamento: 3, parametros: 4 },
      proibir: { printConsole: true, excecaoEngolida: true },
    },
    formatacao: { ativo: true },
    cobertura: {
      modo: "ask", // ask | block | warn | off
      minima: 80,
      ferramentas: { python: "pytest", js: "vitest", go: "go", java: "jacoco" },
    },
    dependencias: {
      modo: "warn", // block | warn | off
      severidadeMinima: "high",
      ferramentas: { node: "npm", python: "pip-audit", go: "govulncheck" },
    },
    linguagens: {
      python: { linter: "ruff", formatter: "ruff" },
      js: { linter: "eslint", formatter: "prettier" },
      go: { linter: "golangci-lint", formatter: "gofmt" },
      java: { linter: "checkstyle", formatter: "google-java-format" },
    },
  };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
    return {
      qualidade: { ...defaults.qualidade, ...raw.qualidade,
        limiares: { ...defaults.qualidade.limiares, ...(raw.qualidade?.limiares) },
        proibir: { ...defaults.qualidade.proibir, ...(raw.qualidade?.proibir) } },
      formatacao: { ...defaults.formatacao, ...raw.formatacao },
      cobertura: { ...defaults.cobertura, ...raw.cobertura,
        ferramentas: { ...defaults.cobertura.ferramentas, ...(raw.cobertura?.ferramentas) } },
      dependencias: { ...defaults.dependencias, ...raw.dependencias,
        ferramentas: { ...defaults.dependencias.ferramentas, ...(raw.dependencias?.ferramentas) } },
      linguagens: { ...defaults.linguagens, ...raw.linguagens },
    };
  } catch {
    return defaults;
  }
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

module.exports = {
  readInput,
  commandExists,
  run,
  denyPreTool,
  askPreTool,
  blockPostTool,
  warnPostTool,
  addContext,
  allow,
  loadConfig,
  langOf,
};
