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

/**
 * A raiz do PROJETO em que o agente está trabalhando, ou `null`.
 *
 * Procura o arquivo de política em si (`config/verificacao.json`), e não um marcador indireto como
 * `modulos/`: se o alvo existe, a resposta é certa; se não existe em lugar nenhum, cai no
 * `config.json` da base sem inventar raiz. É o que faz o hook rodar na PRÓPRIA base sem quebrar —
 * ela não tem esse arquivo, então a busca falha e o fallback assume.
 *
 * `CLAUDE_PROJECT_DIR` primeiro porque é o contrato do ambiente de hook do Claude Code e é
 * literalmente "o projeto em que o agente está" — o mesmo que `settings.template.json` já usa. `cwd`
 * depois, porque o wiring do plugin declara que os scripts operam sobre o projeto-alvo por `cwd`, e
 * porque o hook pode ser invocado à mão, sem a variável.
 */
function projectRoot() {
  const partidas = [];
  if (process.env.CLAUDE_PROJECT_DIR) partidas.push(process.env.CLAUDE_PROJECT_DIR);
  partidas.push(process.cwd());
  for (const partida of partidas) {
    let atual = path.resolve(partida);
    for (let nivel = 0; nivel < 8; nivel += 1) {
      if (fs.existsSync(path.join(atual, "config", "verificacao.json"))) return atual;
      const pai = path.dirname(atual);
      if (pai === atual) break;
      atual = pai;
    }
  }
  return null;
}

/**
 * Traduz `config/verificacao.json` (vocabulário do TEMPLATE) para o vocabulário interno dos hooks.
 *
 * Os dois arquivos falam línguas diferentes de propósito — o template nomeia BINDING
 * (`typescript`/`javascript`/`python`) e usa `formatador`; os hooks nomeiam ÁREA (`js`/`python`) e
 * usam `formatter`, porque `langOf` mapeia extensão para área. A ponte fica AQUI, num lugar só, e é
 * o que permite os quatro hooks consumirem `cfg` sem saber de onde a política veio.
 *
 * `typescript` e `javascript` colapsam na mesma área `js`: quem linta `.ts` e `.js` no projeto é o
 * mesmo eslint. `typescript` tem precedência quando os dois estão declarados.
 */
function politicaDoProjeto(raiz) {
  const bruto = JSON.parse(fs.readFileSync(path.join(raiz, "config", "verificacao.json"), "utf8"));
  const linguagens = {};
  const doJs = bruto.linguagens?.typescript ?? bruto.linguagens?.javascript;
  if (doJs) linguagens.js = { linter: doJs.linter, formatter: doJs.formatador };
  if (bruto.linguagens?.python) {
    linguagens.python = { linter: bruto.linguagens.python.linter, formatter: bruto.linguagens.python.formatador };
  }
  return {
    qualidade: bruto.qualidade,
    formatacao: bruto.formatacao,
    cobertura: bruto.cobertura,
    dependencias: bruto.dependencias,
    linguagens: Object.keys(linguagens).length > 0 ? linguagens : undefined,
  };
}

/**
 * Carrega a política dos hooks. Nunca lança; mescla com defaults.
 *
 * DUAS fontes, e a ordem é a decisão: quando existe `config/verificacao.json` no projeto, a política
 * é a DELE — o repositório que os hooks protegem é quem diz como quer ser protegido. Só na ausência
 * dele vale o `config.json` da base, que é o caso da própria base e de projeto que não veio do
 * template.
 *
 * `qualidade` tem `modo` e NADA MAIS. Nem `limiares` nem `proibir`: os limiares são LEI, com fonte única
 * em `ferramentas/gate/limiares.mjs`. O hook não carrega mais número nenhum — ele roda o linter do
 * projeto com a config do projeto, que é derivada daquela fonte. Enquanto o número morava aqui, ele
 * VENCIA a config gerada, e o hook podia discordar do `npm run lint` do mesmo projeto. `proibir` saiu
 * pelo mesmo argumento com o sinal trocado: o gerador emite `no-console`/`no-empty`/`T20`/`E` sem ler
 * política nenhuma, então o campo nunca acrescentava cobertura — só escondia do agente um erro que o
 * lint acusava.
 */
function loadConfig() {
  const defaults = {
    qualidade: {
      modo: "warn", // block | warn | off
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
  return mesclar(defaults, lerPolitica());
}

/** A política crua, do projeto quando houver, da base quando não. Nunca lança. */
function lerPolitica() {
  const raiz = projectRoot();
  try {
    if (raiz !== null) return politicaDoProjeto(raiz);
    return JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  } catch {
    return {};
  }
}

/** Mescla a política crua sobre os defaults, um nível abaixo onde a forma é aninhada. */
function mesclar(defaults, raw) {
  return {
    qualidade: { ...defaults.qualidade, ...raw.qualidade },
    formatacao: { ...defaults.formatacao, ...raw.formatacao },
    cobertura: { ...defaults.cobertura, ...raw.cobertura,
      ferramentas: { ...defaults.cobertura.ferramentas, ...(raw.cobertura?.ferramentas) } },
    dependencias: { ...defaults.dependencias, ...raw.dependencias,
      ferramentas: { ...defaults.dependencias.ferramentas, ...(raw.dependencias?.ferramentas) } },
    linguagens: { ...defaults.linguagens, ...raw.linguagens },
  };
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

function autoteste() {
  const falhas = [];
  if (langOf("a.py") !== "python") falhas.push("langOf deveria reconhecer .py como python");
  if (langOf("a.ts") !== "js") falhas.push("langOf deveria colapsar .ts na area js");
  if (langOf("A.TSX") !== "js") falhas.push("langOf deveria ser case-insensitive (.TSX)");
  if (langOf("a.go") !== "go") falhas.push("langOf deveria reconhecer .go como go");
  if (langOf("a.rb") !== null) falhas.push("langOf deveria devolver null para extensao sem area");

  const defaults = {
    qualidade: { modo: "warn" },
    cobertura: { modo: "ask", ferramentas: { python: "pytest" } },
    dependencias: { modo: "warn", ferramentas: { node: "npm" } },
    linguagens: { python: { linter: "ruff" } },
  };
  const sobrepondoModo = mesclar(defaults, { qualidade: { modo: "block" } });
  if (sobrepondoModo.qualidade.modo !== "block")
    falhas.push("mesclar deveria sobrescrever qualidade.modo com o valor do projeto");
  if (sobrepondoModo.cobertura.modo !== "ask")
    falhas.push("mesclar deveria preservar default nao sobrescrito (cobertura.modo)");

  const sobrepondoFerramenta = mesclar(defaults, { dependencias: { ferramentas: { python: "pip-audit" } } });
  if (sobrepondoFerramenta.dependencias.ferramentas.node !== "npm"
    || sobrepondoFerramenta.dependencias.ferramentas.python !== "pip-audit")
    falhas.push("mesclar deveria mesclar ferramentas por chave, nao substituir o objeto inteiro");

  for (const falha of falhas) process.stdout.write(`  falha  ${falha}\n`);
  if (falhas.length > 0) {
    process.stdout.write(`autoteste (_lib.js): ${falhas.length} falha(s)\n`);
    return 1;
  }
  process.stdout.write("autoteste (_lib.js): 6/6 ok\n");
  return 0;
}

if (require.main === module && process.argv.includes("--autoteste")) process.exit(autoteste());

module.exports = {
  readInput,
  commandExists,
  projectRoot,
  run,
  denyPreTool,
  askPreTool,
  blockPostTool,
  warnPostTool,
  addContext,
  allow,
  loadConfig,
  langOf,
  mesclar,
};
