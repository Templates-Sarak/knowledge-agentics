#!/usr/bin/env node
"use strict";
// GARANTIA 2 (consistência visual) — PostToolUse(Write/Edit): formata o arquivo
// editado com o formatter da linguagem (definido em hooks/config.json).
// Best-effort: formatar não é verificação — sem a ferramenta ou com formatacao.ativo=false, pula.
// Mapeia: padrao-escrita (consistência de estilo).

const { readInput, allow, commandExists, loadConfig, langOf, run } = require("./_lib");

const input = readInput();
const fp = input.tool_input?.file_path || "";
const lang = langOf(fp);
if (!lang) allow();

const cfg = loadConfig();
if (cfg.formatacao?.ativo === false) allow();

const formatter = cfg.linguagens[lang]?.formatter;
if (!formatter || !commandExists(formatter)) allow();

const args = {
  ruff: ["format", fp],
  prettier: ["--write", fp],
  gofmt: ["-w", fp],
  "google-java-format": ["--replace", fp],
}[formatter];

if (args) run(formatter, args);
allow(); // formatar nunca bloqueia.
