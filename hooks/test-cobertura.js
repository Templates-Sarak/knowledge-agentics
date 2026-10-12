#!/usr/bin/env node
"use strict";
// GARANTIA 4 — "Cobertura mínima antes do push".
// PreToolUse(Bash) em `git push`: mede a cobertura dos ecossistemas presentes e, se abaixo do mínimo,
// PEDE APROVAÇÃO do usuário (modo "ask") — ou bloqueia/avisa conforme hooks/config.json → coverage.
// LEVE POR DESIGN: roda só na fronteira (push) e só onde há ferramenta + testes. Rodar a suíte é mais
// pesado que os outros hooks — por isso é configurável (off) e nunca roda a cada edição.
// Operacionaliza a norma de testes do padrao-escrita §9 (meta ~80%). NÃO escreve testes (isso é test-unitario).

const fs = require("fs");
const path = require("path");
const { readInput, denyPreTool, askOrDenyPreTool, allow, commandExists, loadConfig, run } = require("./_lib");

const input = readInput();
const cmd = input.tool_input?.command || "";
const cwd = input.cwd || process.cwd();

if (!/\bgit\s+push\b/.test(cmd)) allow();

const cfg = loadConfig(input.cwd);
const cov = cfg.coverage || {};
const mode = cov.mode || "ask";
if (mode === "off") allow();
const minimum = typeof cov.minimum === "number" ? cov.minimum : 80;
const tool = cov.tools || { python: "pytest", js: "vitest", go: "go", java: "jacoco" };

const has = (f) => {
  try {
    return fs.existsSync(path.join(cwd, f));
  } catch {
    return false;
  }
};
const out = (r) => `${r.stdout || ""}${r.stderr || ""}`;
const firstPct = (re, text) => {
  const m = text.match(re);
  return m ? parseFloat(m[1]) : null;
};
const minPct = (re, text) => {
  const nums = [...text.matchAll(re)].map((m) => parseFloat(m[1]));
  return nums.length ? Math.min(...nums) : null;
};

function measurePython(t) {
  if (!has("tests") && !has("test")) return null;
  if (!commandExists(t)) return { ecosystem: "python", missing: t };
  return { ecosystem: "python", pct: firstPct(/TOTAL\s+.*?(\d+(?:\.\d+)?)%/, out(run(t, ["--cov", "--cov-report=term"], { cwd }))) };
}

function measureJs(t) {
  if (!has("package.json") || (!has("tests") && !has("__tests__") && !has("test"))) return null;
  if (!commandExists(t)) return { ecosystem: "js", missing: t };
  const args = t === "jest" ? ["--coverage", "--silent"] : ["run", "--coverage"];
  return { ecosystem: "js", pct: firstPct(/All files[^\n]*?\|\s*(\d+(?:\.\d+)?)/, out(run(t, args, { cwd }))) };
}

function measureGo(t) {
  if (!has("go.mod")) return null;
  if (!commandExists(t)) return { ecosystem: "go", missing: t };
  return { ecosystem: "go", pct: minPct(/coverage:\s*(\d+(?:\.\d+)?)%/g, out(run(t, ["test", "-cover", "./..."], { cwd }))) };
}

// Java: lê um relatório JaCoCo já gerado (target/site/jacoco/jacoco.csv) — não dispara o build (pesado).
function measureJava() {
  const csv = path.join(cwd, "target", "site", "jacoco", "jacoco.csv");
  if (!fs.existsSync(csv)) return null;
  try {
    let missed = 0;
    let covered = 0;
    for (const line of fs.readFileSync(csv, "utf8").trim().split("\n").slice(1)) {
      const c = line.split(",");
      missed += Number(c[3]) || 0; // INSTRUCTION_MISSED
      covered += Number(c[4]) || 0; // INSTRUCTION_COVERED
    }
    const total = missed + covered;
    return { ecosystem: "java", pct: total ? (covered / total) * 100 : null };
  } catch {
    return null;
  }
}

const measures = [measurePython(tool.python), measureJs(tool.js), measureGo(tool.go), measureJava()].filter(Boolean);
if (!measures.length) allow(); // nada mensurável — não bloqueia o que não dá para medir

const missingTool = measures.filter((m) => m.missing);
const below = measures.filter((m) => typeof m.pct === "number" && m.pct < minimum);

if (!below.length && !missingTool.length) allow();

const lines = [
  ...below.map((m) => `[${m.ecosystem}] coverage ${m.pct.toFixed(1)}% < minimum ${minimum}%`),
  ...missingTool.map((m) => `[${m.ecosystem}] ${m.missing} not installed — coverage not verified`),
];
const msg =
  `Coverage below the minimum before push:\n${lines.join("\n")}\n` +
  `Raise the coverage (skill test-unitario) or adjust hooks/config.json → coverage.`;

// Gate só quando há medida abaixo do mínimo; ferramenta ausente só trava em modo block (estrito).
if (!below.length) {
  if (mode === "block") denyPreTool(msg);
  process.stderr.write(`[test-cobertura] WARNING:\n${msg}\n`);
  allow();
}
if (mode === "block") denyPreTool(msg);
if (mode === "ask") askOrDenyPreTool(msg);
process.stderr.write(`[test-cobertura] WARNING:\n${msg}\n`); // modo warn: prossegue avisando
allow();
