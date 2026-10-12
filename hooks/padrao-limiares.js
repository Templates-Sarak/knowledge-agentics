#!/usr/bin/env node
"use strict";
// GARANTIA 2 (parte mecânica) — PostToolUse(Write/Edit): aplica o subconjunto
// VERIFICÁVEL da skill padrao-escrita rodando O LINTER DO PROJETO com A CONFIG DO PROJETO:
//   - Limiares: função ≤N linhas, aninhamento ≤N, ≤N parâmetros.
//   - Sem print/console.log (logger estruturado).
//   - Sem exceção engolida (bare except / catch vazio).
//
// Este hook NÃO carrega número nenhum, e a ausência é o desenho. Antes ele injetava os limiares
// (`--no-eslintrc --rule {…}` no eslint, `--config lint.pylint.max-args=N` no ruff), o que produzia
// dois defeitos: o número vivia numa quarta cópia dentro de `hooks/`, e essa cópia VENCIA a config
// do projeto — o hook e o `npm run lint` do mesmo repositório podiam cobrar valores diferentes.
// Agora os limiares vêm de onde a lei manda (`tools/gate/thresholds.mjs` → config gerada), e a
// concordância entre hook e `verificar` é por construção, não por disciplina.
//
// Política CONFIGURÁVEL por projeto (`config/verification.json` → `quality`, com fallback para
// `hooks/config.json`): mode block = cobra correção | warn = só avisa | off = ignora.
// Só sinaliza quando a saída contém os markers das regras (evita falso-positivo de parser).
// NÃO cobre (é julgamento, fica com a skill): SRP, nomes, testes, encapsulamento de módulo.

const fs = require("fs");
const path = require("path");
const { readInput, allow, blockPostTool, warnPostTool, commandExists, editedFiles, loadConfig, langOf, projectRoot, run } = require("./_lib");

/**
 * A config do linter que o PROJETO declara, por área. Sem ela o hook não tem o que aplicar: os
 * limiares moram ali, derivados da fonte única. A lista cobre as formas que cada ferramenta procura.
 */
const LINTER_CONFIGS = {
  js: ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml"],
  python: [".ruff.toml", "ruff.toml", "pyproject.toml"],
  go: [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"],
  java: ["checkstyle.xml", path.join("config", "checkstyle", "checkstyle.xml")],
};

/**
 * Os identificadores de regra que o linter IMPRIME para o subconjunto do §4.7. Substituem a antiga
 * lista de regras injetadas: o hook não decide mais o que checar — decide o que RECONHECER na saída,
 * para não sinalizar por erro de parser nem por regra alheia ao padrão de escrita.
 *
 * Conjunto FIXO, e a ausência de política aqui é o ponto. Havia um `proibir.printConsole` /
 * `proibir.excecaoEngolida` filtrando estas linhas, e ele era estruturalmente incapaz de acrescentar
 * cobertura: `generate-lint-config.mjs` emite `no-console`, `no-empty`, `T20` e `E` INCONDICIONALMENTE,
 * sem ler política nenhuma. A única coisa que o filtro conseguia fazer era ESCONDER do agente um erro
 * que o `npm run lint` do mesmo repositório acusava — segunda fonte para o que a config gerada já
 * decide, exatamente como o `limiares` que saiu daqui antes.
 */
function markers(lang) {
  return {
    js: ["max-lines-per-function", "max-depth", "max-params", "no-console", "no-empty"],
    python: ["PLR0913", "PLR0915", "PLR0912", "C901", "T201", "T203", "E722"],
    go: ["funlen", "nestif", "gocyclo", "forbidigo", "errcheck"],
    java: ["MethodLength", "NestedIfDepth", "ParameterNumber", "RegexpSinglelineJava", "EmptyCatchBlock"],
  }[lang] ?? null;
}

/**
 * O executável do linter, com o do PROJETO na frente do do PATH. Devolve `{ cmd, prefixo }`.
 *
 * Em Node o binário local é um shim `node_modules/.bin/<x>.cmd` no Windows, e `spawnSync` NÃO o
 * executa: falha com `EINVAL`. A saída óbvia — `shell: true` — obrigaria a concatenar os argumentos
 * numa string única, e um deles é caminho de arquivo vindo do payload: seria injeção por nome de
 * arquivo, e o próprio Node já deprecou a combinação. Resolver o ENTRYPOINT JS do pacote e rodá-lo
 * com `process.execPath` evita o shim e a concatenação de uma vez.
 */
function findLinter(root, linter) {
  const entry = projectEntrypoint(root, linter);
  if (entry !== null) return { cmd: process.execPath, prefix: [entry] };
  return commandExists(linter) ? { cmd: linter, prefix: [] } : null;
}

/**
 * O conserto, dito para quem de fato recebe a mensagem.
 *
 * Ela só dispara em repositório que NÃO veio do template — `create-project.mjs` sempre gera a config.
 * E o gerador que ela nomeava (`tools/generate-lint-config.mjs`) só existe em projeto do template:
 * na própria base ele mora em `specs/_estrutura_modulos/tools/`. Nomear um arquivo ausente é
 * mandar o leitor rodar um comando que falha, então a mensagem só cita o caminho que EXISTE — e,
 * quando não existe nenhum, diz o que fazer em vez de fingir que há um gerador.
 */
function howToGenerateConfig(root) {
  const candidates = [
    path.join("tools", "generate-lint-config.mjs"),
    path.join("specs", "_estrutura_modulos", "tools", "generate-lint-config.mjs"),
  ];
  const found = candidates.find((rel) => fs.existsSync(path.join(root, rel)));
  if (found) return `Generate with: node ${found.split(path.sep).join("/")}`;
  return (
    "This repository did not come from the module template: create the linter config at the root, " +
    "or turn this check off with quality.mode = \"off\"."
  );
}

/**
 * O entrypoint JS do linter instalado no projeto, pelo campo `bin` do manifesto dele.
 *
 * Lê o `package.json` com `fs` em vez de `require.resolve`: o mapa `exports` do eslint não publica
 * `./bin/eslint.js`, então o resolver recusa (`ERR_PACKAGE_PATH_NOT_EXPORTED`) um arquivo que está
 * ali. O manifesto é a fonte certa e serve a qualquer linter de Node, não só ao eslint.
 */
function projectEntrypoint(root, linter) {
  const dir = path.join(root, "node_modules", linter);
  try {
    const { bin } = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const relative = typeof bin === "string" ? bin : bin?.[linter];
    if (!relative) return null;
    const target = path.join(dir, relative);
    return fs.existsSync(target) ? target : null;
  } catch {
    return null;
  }
}

/**
 * Como cada linter é invocado. Sem `--rule` e sem `--config`: a config do projeto é que manda.
 *
 * No eslint, sem `--format` também: o `compact` saiu do core no v9 (assim como o `--no-eslintrc`), e
 * pedi-lo faz o processo abortar com "no longer part of core ESLint" em vez de lintar. O formatador
 * default (`stylish`) imprime o id da regra em cada linha, que é tudo de que os markers precisam.
 */
function invoke(lang, exe, root, fp) {
  const options = { cwd: root };
  const call = (args) => run(exe.cmd, [...exe.prefix, ...args], options);
  if (lang === "python") return call(["check", "--output-format", "concise", fp]);
  if (lang === "js") return call([fp]);
  if (lang === "go") return call(["run", "--out-format", "line-number", fp]);
  if (lang === "java") {
    const cfg = LINTER_CONFIGS.java.map((n) => path.join(root, n)).find((c) => fs.existsSync(c));
    return call(["-c", cfg, fp]);
  }
  return null;
}

/**
 * Núcleo: a AÇÃO da política, dado só o `mode` — "allow" (modo off, não sinaliza nada), "block"
 * ou "warn". Pura: não decide QUANDO sinalizar (isso depende de I/O — linter instalado, config
 * presente, saída do linter), só COM QUE SEVERIDADE, dado que há algo a sinalizar.
 */
function actionForMode(mode) {
  if (mode === "off") return "allow";
  return mode === "block" ? "block" : "warn";
}

/**
 * Núcleo: a saída (já capturada) do linter contém algum marcador do subconjunto verificável do
 * padrao-escrita? Pura — recebe texto e lista já resolvidos, nunca chama o linter.
 */
function violatesPattern(output, marks) {
  return Boolean(marks) && marks.length > 0 && new RegExp(marks.join("|")).test(output);
}

/** `fp` está dentro de `raiz` (ou é ela)? Falso quando não há raiz ou quando o relativo escapa dela. */
function isInside(root, fp) {
  if (!root) return false;
  const rel = path.relative(root, fp);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Núcleo: o diretório cuja config de linter vale para `fp`, ou `null`. Sobe a partir de
 * `path.dirname(fp)` até o primeiro diretório com um dos `LINTER_CONFIGS[lang]` — a mesma descoberta
 * hierárquica que o próprio linter faz. Projeto sem `config/verification.json` não tem raiz reconhecida
 * por `projectRoot`, e a config do linter pode estar acima do `cwd` da sessão.
 *
 * A subida tem teto, senão uma config solta em `~` seria adotada. Para no primeiro destes, sempre
 * DEPOIS de checar a config no diretório: um `.git` (a raiz do repo conta), a `raiz` quando `fp` está
 * dentro dela, ou 8 níveis (o mesmo teto do `projectRoot`). Pura: o disco entra por `existe`.
 */
function configDir(lang, fp, root, exists = fs.existsSync) {
  const names = LINTER_CONFIGS[lang] ?? [];
  const limit = isInside(root, fp) ? path.resolve(root) : null;
  let current = path.dirname(path.resolve(fp));
  for (let level = 0; level < 8; level += 1) {
    if (names.some((name) => exists(path.join(current, name)))) return current;
    if (exists(path.join(current, ".git")) || current === limit) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

/** `configDir` com disco em memória: os limites da subida são o que impede adotar config alheia. */
function selftestConfigDir(failures) {
  const r = (...parts) => path.resolve("/r", ...parts);
  const disk = (...paths) => (p) => paths.includes(path.resolve(p));
  const deep = (n) => r(...Array.from({ length: n }, (_, i) => String(i + 1)), "a.py");
  const cases = [
    ["found in its own directory", ["python", r("proj", "a.py"), r("proj"), disk(r("proj", "pyproject.toml"))], r("proj")],
    ["found two levels up", ["python", r("proj", "src", "mod", "a.py"), null, disk(r("proj", "pyproject.toml"))], r("proj")],
    ["stopped at .git without adopting the outside config", ["python", r("repo", "src", "a.py"), null, disk(r("repo", ".git"), r("pyproject.toml"))], null],
    ["stopped at the root without adopting the config above it", ["python", r("proj", "src", "a.py"), r("proj"), disk(r("pyproject.toml"))], null],
    ["stopped at the 8-level ceiling", ["python", deep(8), null, disk(r("pyproject.toml"))], null],
    ["ceiling control: 7 levels down still finds it", ["python", deep(7), null, disk(r("pyproject.toml"))], r()],
  ];
  for (const [name, args, expected] of cases) {
    if (configDir(...args) !== expected) failures.push(`configDir: ${name}`);
  }
}

function selftest() {
  const failures = [];
  if (actionForMode("off") !== "allow") failures.push("actionForMode('off') should return 'allow'");
  if (actionForMode("block") !== "block") failures.push("actionForMode('block') should return 'block'");
  if (actionForMode("warn") !== "warn") failures.push("actionForMode('warn') should return 'warn'");
  if (actionForMode("qualquer-outra-coisa") !== "warn")
    failures.push("actionForMode should fall back to 'warn' for any mode other than off/block");

  const jsMarks = markers("js");
  if (!violatesPattern("error: max-lines-per-function exceeded", jsMarks))
    failures.push("violatesPattern should match 'max-lines-per-function' in the eslint output");
  if (violatesPattern("all good, no problem found", jsMarks))
    failures.push("violatesPattern should NOT match clean linter output");
  if (violatesPattern("qualquer coisa", markers("nonexistent-language")))
    failures.push("violatesPattern should return false when markers(lang) is null");
  selftestConfigDir(failures);

  for (const failure of failures) process.stdout.write(`  failure  ${failure}\n`);
  if (failures.length > 0) {
    process.stdout.write(`selftest (padrao-limiares.js): ${failures.length} failure(s)\n`);
    return 1;
  }
  process.stdout.write("selftest (padrao-limiares.js): 13/13 ok\n");
  return 0;
}

if (process.argv.includes("--selftest")) process.exit(selftest());

const input = readInput();
const cfg = loadConfig(input.cwd);
const q = cfg.quality;
const action = actionForMode(q.mode);
if (action === "allow") allow();

const signal = action === "block" ? blockPostTool : warnPostTool;
// So uma raiz RECONHECIDA limita a subida do configDir; o cwd usado como fallback, nao (senao a
// subida pararia no proprio cwd e nunca acharia a config de um nivel acima).
const projectRootDir = projectRoot(input.cwd) ?? process.env.CLAUDE_PROJECT_DIR ?? null;
const root = projectRootDir ?? input.cwd ?? process.cwd();
const findings = [];

for (const fp of editedFiles(input)) {
  const lang = langOf(fp);
  if (!lang) continue;
  const linter = cfg.languages[lang]?.linter;
  if (!linter) continue;
  const exe = findLinter(root, linter);
  if (exe === null) {
    findings.push(`${linter} not installed — writing-standard check (mode "${q.mode}"). Install ${linter} to validate ${lang}.`);
    continue;
  }
  const configDirPath = configDir(lang, fp, projectRootDir);
  if (configDirPath === null) {
    findings.push(`No ${linter} config at the root of ${root} — the thresholds live in that config (mode "${q.mode}"). ${howToGenerateConfig(root)}`);
    continue;
  }
  const marks = markers(lang);
  const res = marks ? invoke(lang, exe, configDirPath, fp) : null;
  const out = `${res?.stdout || ""}${res?.stderr || ""}`.trim();
  if (violatesPattern(out, marks)) {
    findings.push(`Writing standard violated in ${path.relative(configDirPath, fp) || fp} by the ${linter} config:\n${out.slice(0, 1500)}\nFix it following the padrao-escrita skill.`);
  }
}

if (findings.length > 0) signal(findings.join("\n\n"));
allow();
