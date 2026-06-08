#!/usr/bin/env node
"use strict";
// GARANTIA 4 — "Cobertura mínima antes do push".
// PreToolUse(Bash) em `git push`: mede a cobertura dos ecossistemas presentes e, se abaixo do mínimo,
// PEDE APROVAÇÃO do usuário (modo "ask") — ou bloqueia/avisa conforme hooks/config.json → cobertura.
// LEVE POR DESIGN: roda só na fronteira (push) e só onde há ferramenta + testes. Rodar a suíte é mais
// pesado que os outros hooks — por isso é configurável (off) e nunca roda a cada edição.
// Operacionaliza a norma de testes do padrao-escrita §9 (meta ~80%). NÃO escreve testes (isso é test-unitario).

const fs = require("fs");
const path = require("path");
const { readInput, denyPreTool, askPreTool, allow, commandExists, loadConfig, run } = require("./_lib");

const input = readInput();
const cmd = input.tool_input?.command || "";
const cwd = input.cwd || process.cwd();

if (!/\bgit\s+push\b/.test(cmd)) allow();

const cfg = loadConfig();
const cob = cfg.cobertura || {};
const modo = cob.modo || "ask";
if (modo === "off") allow();
const minima = typeof cob.minima === "number" ? cob.minima : 80;
const tool = cob.ferramentas || { python: "pytest", js: "vitest", go: "go", java: "jacoco" };

const has = (f) => {
  try {
    return fs.existsSync(path.join(cwd, f));
  } catch {
    return false;
  }
};
const out = (r) => `${r.stdout || ""}${r.stderr || ""}`;
const umPct = (re, text) => {
  const m = text.match(re);
  return m ? parseFloat(m[1]) : null;
};
const menorPct = (re, text) => {
  const nums = [...text.matchAll(re)].map((m) => parseFloat(m[1]));
  return nums.length ? Math.min(...nums) : null;
};

function medirPython(t) {
  if (!has("tests") && !has("test")) return null;
  if (!commandExists(t)) return { eco: "python", missing: t };
  return { eco: "python", pct: umPct(/TOTAL\s+.*?(\d+(?:\.\d+)?)%/, out(run(t, ["--cov", "--cov-report=term"], { cwd }))) };
}

function medirJs(t) {
  if (!has("package.json") || (!has("tests") && !has("__tests__") && !has("test"))) return null;
  if (!commandExists(t)) return { eco: "js", missing: t };
  const args = t === "jest" ? ["--coverage", "--silent"] : ["run", "--coverage"];
  return { eco: "js", pct: umPct(/All files[^\n]*?\|\s*(\d+(?:\.\d+)?)/, out(run(t, args, { cwd }))) };
}

function medirGo(t) {
  if (!has("go.mod")) return null;
  if (!commandExists(t)) return { eco: "go", missing: t };
  return { eco: "go", pct: menorPct(/coverage:\s*(\d+(?:\.\d+)?)%/g, out(run(t, ["test", "-cover", "./..."], { cwd }))) };
}

// Java: lê um relatório JaCoCo já gerado (target/site/jacoco/jacoco.csv) — não dispara o build (pesado).
function medirJava() {
  const csv = path.join(cwd, "target", "site", "jacoco", "jacoco.csv");
  if (!fs.existsSync(csv)) return null;
  try {
    let perdido = 0;
    let coberto = 0;
    for (const linha of fs.readFileSync(csv, "utf8").trim().split("\n").slice(1)) {
      const c = linha.split(",");
      perdido += Number(c[3]) || 0; // INSTRUCTION_MISSED
      coberto += Number(c[4]) || 0; // INSTRUCTION_COVERED
    }
    const total = perdido + coberto;
    return { eco: "java", pct: total ? (coberto / total) * 100 : null };
  } catch {
    return null;
  }
}

const medidas = [medirPython(tool.python), medirJs(tool.js), medirGo(tool.go), medirJava()].filter(Boolean);
if (!medidas.length) allow(); // nada mensurável — não bloqueia o que não dá para medir

const faltaTool = medidas.filter((m) => m.missing);
const abaixo = medidas.filter((m) => typeof m.pct === "number" && m.pct < minima);

if (!abaixo.length && !faltaTool.length) allow();

const linhas = [
  ...abaixo.map((m) => `[${m.eco}] cobertura ${m.pct.toFixed(1)}% < mínimo ${minima}%`),
  ...faltaTool.map((m) => `[${m.eco}] ${m.missing} não instalado — cobertura não verificada`),
];
const msg =
  `Cobertura abaixo do mínimo antes do push:\n${linhas.join("\n")}\n` +
  `Eleve a cobertura (skill test-unitario) ou ajuste hooks/config.json → cobertura.`;

// Gate só quando há medida abaixo do mínimo; ferramenta ausente só trava em modo block (estrito).
if (!abaixo.length) {
  if (modo === "block") denyPreTool(msg);
  process.stderr.write(`[test-cobertura] AVISO:\n${msg}\n`);
  allow();
}
if (modo === "block") denyPreTool(msg);
if (modo === "ask") askPreTool(msg);
process.stderr.write(`[test-cobertura] AVISO:\n${msg}\n`); // modo warn: prossegue avisando
allow();
