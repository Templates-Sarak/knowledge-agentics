#!/usr/bin/env node
"use strict";
// GARANTIA 2 (parte mecânica) — PostToolUse(Write/Edit): aplica o subconjunto
// VERIFICÁVEL da skill padrao-escrita via linter da linguagem:
//   - Limiares (config): função ≤N linhas, aninhamento ≤N, ≤N parâmetros.
//   - Sem print/console.log (logger estruturado).
//   - Sem exceção engolida (bare except / catch vazio).
// Política CONFIGURÁVEL por projeto via hooks/config.json → qualidade.modo:
//   block = cobra correção | warn = só avisa | off = ignora.
// Só sinaliza quando a saída contém os marcadores das regras (evita falso-positivo de parser).
// NÃO cobre (é julgamento, fica com a skill): SRP, nomes, testes, encapsulamento de módulo.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { readInput, allow, blockPostTool, warnPostTool, commandExists, loadConfig, langOf, run } = require("./_lib");

// Gera uma config Checkstyle mínima a partir dos limiares (zero-hardcoded, self-contained).
// Mesmos limites que a skill padrao-java (MethodLength/NestedIfDepth/ParameterNumber); aqui derivados do config.
function buildCheckstyleXml({ linhas, aninhamento, parametros }, noPrint, noSwallow) {
  const mods = [
    `<module name="MethodLength"><property name="max" value="${linhas}"/></module>`,
    `<module name="NestedIfDepth"><property name="max" value="${aninhamento}"/></module>`,
    `<module name="ParameterNumber"><property name="max" value="${parametros}"/></module>`,
  ];
  if (noSwallow) mods.push(`<module name="EmptyCatchBlock"/>`);
  if (noPrint) mods.push(`<module name="RegexpSinglelineJava"><property name="format" value="System\\.(out|err)\\.print|printStackTrace"/></module>`);
  return `<?xml version="1.0"?>\n` +
    `<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN" "https://checkstyle.org/dtds/configuration_1_3.dtd">\n` +
    `<module name="Checker">\n<module name="TreeWalker">\n${mods.join("\n")}\n</module>\n</module>\n`;
}

const input = readInput();
const fp = input.tool_input?.file_path || "";
const lang = langOf(fp);
if (!lang) allow();

const cfg = loadConfig();
const q = cfg.qualidade;
if (q.modo === "off") allow();

const sinaliza = q.modo === "block" ? blockPostTool : warnPostTool;
const linter = cfg.linguagens[lang]?.linter;
if (!linter) allow(); // linguagem sem linter definido em config.json para estas regras

if (!commandExists(linter)) {
  sinaliza(
    `${linter} não instalado — verificação de padrão de escrita (modo "${q.modo}"). ` +
      `Instale ${linter} para validar limiares, ausência de print/console e exceção não engolida em ${lang}.`
  );
  allow();
}

const { linhas, aninhamento, parametros } = q.limiares;
const noPrint = q.proibir.printConsole;
const noSwallow = q.proibir.excecaoEngolida;

let res = null;
const markers = [];
if (lang === "python") {
  const sel = ["PLR0913", "PLR0915", "PLR0912", "C901"];
  if (noPrint) sel.push("T201", "T203");
  if (noSwallow) sel.push("E722");
  markers.push(...sel);
  res = run("ruff", [
    "check",
    "--select", sel.join(","),
    "--config", `lint.pylint.max-args=${parametros}`,
    "--config", `lint.pylint.max-statements=${linhas}`,
    "--output-format", "concise",
    fp,
  ]);
} else if (lang === "js") {
  const rules = {
    "max-lines-per-function": ["error", { max: linhas, skipBlankLines: true, skipComments: true }],
    "max-params": ["error", parametros],
    "max-depth": ["error", aninhamento],
  };
  if (noPrint) rules["no-console"] = "error";
  if (noSwallow) rules["no-empty"] = ["error", { allowEmptyCatch: false }];
  markers.push(...Object.keys(rules));
  res = run("eslint", ["--no-eslintrc", "--rule", JSON.stringify(rules), "--format", "compact", fp]);
} else if (lang === "go") {
  const enable = ["funlen", "nestif", "gocyclo"];
  if (noPrint) enable.push("forbidigo");
  if (noSwallow) enable.push("errcheck");
  markers.push(...enable);
  res = run("golangci-lint", ["run", "--disable-all", "--enable", enable.join(","), "--out-format", "line-number", fp]);
} else if (lang === "java") {
  const mods = ["MethodLength", "NestedIfDepth", "ParameterNumber"];
  if (noSwallow) mods.push("EmptyCatchBlock");
  if (noPrint) mods.push("RegexpSinglelineJava");
  markers.push(...mods);
  const cfgPath = path.join(os.tmpdir(), `sarak-checkstyle-${process.pid}.xml`);
  try {
    fs.writeFileSync(cfgPath, buildCheckstyleXml(q.limiares, noPrint, noSwallow));
    res = run("checkstyle", ["-c", cfgPath, fp]);
  } finally {
    try { fs.unlinkSync(cfgPath); } catch {}
  }
}

if (!res) allow();

const out = `${res.stdout || ""}${res.stderr || ""}`.trim();
const hit = new RegExp(markers.join("|")).test(out);

if (hit) {
  sinaliza(
    `Padrão de escrita violado em ${fp} (≤${linhas} linhas/função, ≤${aninhamento} aninhamento, ` +
      `≤${parametros} params${noPrint ? ", sem print/console" : ""}${noSwallow ? ", sem exceção engolida" : ""}):\n` +
      `${out.slice(0, 1500)}\nCorrija conforme a skill padrao-escrita.`
  );
}

allow();
