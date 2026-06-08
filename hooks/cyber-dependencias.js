#!/usr/bin/env node
"use strict";
// GARANTIA 3 — "Sem dependência vulnerável indo para o GitHub".
// PreToolUse(Bash) em `git push`: audita as dependências dos ecossistemas presentes.
// LEVE POR DESIGN: roda só na fronteira (push), não a cada edição; audita só se houver manifesto.
// Política configurável (hooks/config.json → dependencias): modo block|warn|off + severidadeMinima.
// Missing-tool segue o modo (default warn) — NÃO trava o dev (diferente de segredos, fail-closed).

const fs = require("fs");
const path = require("path");
const { readInput, denyPreTool, allow, commandExists, loadConfig, run } = require("./_lib");

const input = readInput();
const cmd = input.tool_input?.command || "";
const cwd = input.cwd || process.cwd();

if (!/\bgit\s+push\b/.test(cmd)) allow();

const cfg = loadConfig();
const dep = cfg.dependencias || {};
const modo = dep.modo || "warn";
if (modo === "off") allow();
const sev = dep.severidadeMinima || "high";
const tool = dep.ferramentas || { node: "npm", python: "pip-audit", go: "govulncheck" };

const has = (f) => {
  try {
    return fs.existsSync(path.join(cwd, f));
  } catch {
    return false;
  }
};
const trim = (r) => `${r.stdout || ""}${r.stderr || ""}`.trim().slice(0, 600);
const missing = (t, eco) =>
  modo === "block" ? `[${eco}] ${t} não instalado — auditoria de dependências exigida (modo block).` : null;

function auditNode() {
  const lock = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"].some(has);
  if (!lock) return null; // sem lockfile, npm audit não é confiável — pula
  const t = tool.node;
  if (!commandExists(t)) return missing(t, "node");
  const r = run(t, ["audit", `--audit-level=${sev}`], { cwd });
  return r.status && r.status !== 0 ? `[node/${t}]\n${trim(r)}` : null;
}

function auditPython() {
  const t = tool.python;
  if (!commandExists(t)) return missing(t, "python");
  const args = has("requirements.txt") ? ["-r", "requirements.txt"] : [];
  const r = run(t, args, { cwd });
  return r.status && r.status !== 0 ? `[python/${t}]\n${trim(r)}` : null;
}

function auditGo() {
  const t = tool.go;
  if (!commandExists(t)) return missing(t, "go");
  const r = run(t, ["./..."], { cwd });
  return r.status && r.status !== 0 ? `[go/${t}]\n${trim(r)}` : null;
}

const audits = [];
if (has("package.json")) audits.push(auditNode());
if (has("requirements.txt") || has("pyproject.toml") || has("Pipfile")) audits.push(auditPython());
if (has("go.mod")) audits.push(auditGo());

const problemas = audits.filter(Boolean);
if (!problemas.length) allow();

const msg =
  `Dependências com vulnerabilidade (≥ ${sev}) antes do push:\n${problemas.join("\n\n").slice(0, 1800)}\n` +
  `Atualize/corrija as dependências antes de enviar.`;

if (modo === "block") denyPreTool(msg);
process.stderr.write(`[cyber-dependencias] AVISO:\n${msg}\n`); // modo warn: prossegue avisando
allow();
