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
    `.env prestes a ir para o GitHub: ${offenders.join(", ")}. ` +
      `Adicione '.env' ao .gitignore e remova do controle com 'git rm --cached <arquivo>'. ` +
      `Só o .env.example deve ser versionado.`
  );
}

// 2) Existe .env local mas falta .env.example versionado.
if (fs.existsSync(path.join(cwd, ".env"))) {
  const exampleTracked = list(["ls-files"]).some((f) => /(^|\/)\.env\.example$/.test(f));
  if (!exampleTracked) {
    denyPreTool(
      "Há um .env local, mas não existe .env.example versionado. " +
        "Crie um .env.example com as mesmas chaves (valores vazios/fake) e versione — é o template que o time precisa."
    );
  }
}

// 3) Segredos (fail-closed).
if (!commandExists("gitleaks")) {
  denyPreTool(
    "gitleaks não instalado — verificação de segredos fail-closed bloqueou o envio. " +
      "Instale: https://github.com/gitleaks/gitleaks (ex.: scoop/choco install gitleaks)."
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
  denyPreTool(`gitleaks detectou possível segredo:\n${out}\nMova o valor para .env (gitignored) antes de enviar.`);
}

allow();
