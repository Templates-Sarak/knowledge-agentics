#!/usr/bin/env node
"use strict";
// GARANTIA 2 (consistência visual) — PostToolUse(Write/Edit): formata o arquivo
// editado com o formatter da linguagem (definido em hooks/config.json).
// Best-effort: formatar não é verificação — sem a ferramenta ou com formatacao.ativo=false, pula.
// Mapeia: padrao-escrita (consistência de estilo).

const { readInput, allow, commandExists, editedFiles, loadConfig, langOf, run } = require("./_lib");

const input = readInput();
const cfg = loadConfig();
if (cfg.formatacao?.ativo === false) allow();

for (const fp of editedFiles(input)) {
  const lang = langOf(fp);
  if (!lang) continue;
  const formatter = cfg.linguagens[lang]?.formatter;
  if (!formatter || !commandExists(formatter)) continue;

  const args = {
    ruff: ["format", fp],
    prettier: ["--write", fp],
    gofmt: ["-w", fp],
    "google-java-format": ["--replace", fp],
  }[formatter];

  if (args) run(formatter, args);
}
allow(); // formatar nunca bloqueia.
