#!/usr/bin/env node
"use strict";
// GARANTIA 1 — "Nada incorreto vai para o GitHub".
// PreToolUse(Bash) em `git commit`/`git push`. Verifica, na fronteira do git:
//   1. Nenhum segredo (gitleaks)        — FAIL-CLOSED sem a ferramenta.
//   2. Nenhum .env real versionado.
//   3. Se existe .env local, .env.example precisa estar versionado.
// Mapeia: padrao-escrita ("nunca versione segredos; .env no .gitignore, só .env.example commitado").

const fs = require("fs");
const path = require("path");
const { readInput, denyPreTool, allow, commandExists, run } = require("./_lib");

const input = readInput();
const cmd = input.tool_input?.command || "";
const cwd = input.cwd || process.cwd();

const isCommit = /\bgit\s+commit\b/.test(cmd);
const isPush = /\bgit\s+push\b/.test(cmd);
if (!isCommit && !isPush) allow();

const list = (args) => {
  const r = run("git", args, { cwd });
  return r.status === 0 ? r.stdout.split(/\r?\n/).filter(Boolean) : [];
};
const isRealEnv = (f) => /(^|\/)\.env($|\.)/.test(f) && !/\.env\.example$/.test(f);

// 1) .env real prestes a ir para o GitHub (staged no commit; rastreado no push).
const offenders = (isCommit ? list(["diff", "--cached", "--name-only"]) : list(["ls-files"])).filter(isRealEnv);
if (offenders.length) {
  denyPreTool(
    `.env about to go to GitHub: ${offenders.join(", ")}. ` +
      `Add '.env' to .gitignore and untrack it with 'git rm --cached <file>'. ` +
      `Only .env.example should be versioned.`
  );
}

// 2) Existe .env local mas falta .env.example versionado.
if (fs.existsSync(path.join(cwd, ".env"))) {
  const exampleTracked = list(["ls-files"]).some((f) => /(^|\/)\.env\.example$/.test(f));
  if (!exampleTracked) {
    denyPreTool(
      "There is a local .env, but no versioned .env.example. " +
        "Create a .env.example with the same keys (empty/fake values) and version it — it is the template the team needs."
    );
  }
}

// 3) Segredos (fail-closed).
if (!commandExists("gitleaks")) {
  denyPreTool(
    "gitleaks not installed — the fail-closed secret check blocked the push. " +
      "Install: https://github.com/gitleaks/gitleaks (e.g. scoop/choco install gitleaks)."
  );
}
let gl;
if (isCommit) {
  gl = run("gitleaks", ["protect", "--staged", "--redact", "--no-banner"], { cwd });
} else {
  // push: varre só os commits que vão subir (delta), não o histórico inteiro — leve.
  const up = run("git", ["rev-parse", "--abbrev-ref", "@{u}"], { cwd });
  const args =
    up.status === 0
      ? ["detect", "--log-opts", "@{u}..HEAD", "--redact", "--no-banner"]
      : ["detect", "--redact", "--no-banner"]; // primeiro push do branch (sem upstream): varre tudo
  gl = run("gitleaks", args, { cwd });
}
if (gl.status === 1) {
  const out = `${gl.stdout || ""}${gl.stderr || ""}`.trim().slice(0, 1500);
  denyPreTool(`gitleaks detected a possible secret:\n${out}\nMove the value to .env (gitignored) before pushing.`);
}

allow();
