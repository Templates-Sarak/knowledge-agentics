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
// Agora os limiares vêm de onde a lei manda (`ferramentas/gate/limiares.mjs` → config gerada), e a
// concordância entre hook e `verificar` é por construção, não por disciplina.
//
// Política CONFIGURÁVEL por projeto (`config/verificacao.json` → `qualidade`, com fallback para
// `hooks/config.json`): modo block = cobra correção | warn = só avisa | off = ignora.
// Só sinaliza quando a saída contém os marcadores das regras (evita falso-positivo de parser).
// NÃO cobre (é julgamento, fica com a skill): SRP, nomes, testes, encapsulamento de módulo.

const fs = require("fs");
const path = require("path");
const { readInput, allow, blockPostTool, warnPostTool, commandExists, loadConfig, langOf, projectRoot, run } = require("./_lib");

/**
 * A config do linter que o PROJETO declara, por área. Sem ela o hook não tem o que aplicar: os
 * limiares moram ali, derivados da fonte única. A lista cobre as formas que cada ferramenta procura.
 */
const CONFIGS_DE_LINTER = {
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
 * cobertura: `gerar-config-lint.mjs` emite `no-console`, `no-empty`, `T20` e `E` INCONDICIONALMENTE,
 * sem ler política nenhuma. A única coisa que o filtro conseguia fazer era ESCONDER do agente um erro
 * que o `npm run lint` do mesmo repositório acusava — segunda fonte para o que a config gerada já
 * decide, exatamente como o `limiares` que saiu daqui antes.
 */
function marcadores(lang) {
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
function acharLinter(raiz, linter) {
  const entrada = entrypointDoProjeto(raiz, linter);
  if (entrada !== null) return { cmd: process.execPath, prefixo: [entrada] };
  return commandExists(linter) ? { cmd: linter, prefixo: [] } : null;
}

/**
 * O conserto, dito para quem de fato recebe a mensagem.
 *
 * Ela só dispara em repositório que NÃO veio do template — `criar-projeto.mjs` sempre gera a config.
 * E o gerador que ela nomeava (`ferramentas/gerar-config-lint.mjs`) só existe em projeto do template:
 * na própria base ele mora em `specs/_estrutura_modulos/ferramentas/`. Nomear um arquivo ausente é
 * mandar o leitor rodar um comando que falha, então a mensagem só cita o caminho que EXISTE — e,
 * quando não existe nenhum, diz o que fazer em vez de fingir que há um gerador.
 */
function comoGerarAConfig(raiz) {
  const candidatos = [
    path.join("ferramentas", "gerar-config-lint.mjs"),
    path.join("specs", "_estrutura_modulos", "ferramentas", "gerar-config-lint.mjs"),
  ];
  const achado = candidatos.find((rel) => fs.existsSync(path.join(raiz, rel)));
  if (achado) return `Gere com: node ${achado.split(path.sep).join("/")}`;
  return (
    "Este repositório não veio do template de módulos: crie a config do linter na raiz, " +
    "ou desligue esta verificação com qualidade.modo = \"off\"."
  );
}

/**
 * O entrypoint JS do linter instalado no projeto, pelo campo `bin` do manifesto dele.
 *
 * Lê o `package.json` com `fs` em vez de `require.resolve`: o mapa `exports` do eslint não publica
 * `./bin/eslint.js`, então o resolver recusa (`ERR_PACKAGE_PATH_NOT_EXPORTED`) um arquivo que está
 * ali. O manifesto é a fonte certa e serve a qualquer linter de Node, não só ao eslint.
 */
function entrypointDoProjeto(raiz, linter) {
  const pasta = path.join(raiz, "node_modules", linter);
  try {
    const { bin } = JSON.parse(fs.readFileSync(path.join(pasta, "package.json"), "utf8"));
    const relativo = typeof bin === "string" ? bin : bin?.[linter];
    if (!relativo) return null;
    const alvo = path.join(pasta, relativo);
    return fs.existsSync(alvo) ? alvo : null;
  } catch {
    return null;
  }
}

/**
 * Como cada linter é invocado. Sem `--rule` e sem `--config`: a config do projeto é que manda.
 *
 * No eslint, sem `--format` também: o `compact` saiu do core no v9 (assim como o `--no-eslintrc`), e
 * pedi-lo faz o processo abortar com "no longer part of core ESLint" em vez de lintar. O formatador
 * default (`stylish`) imprime o id da regra em cada linha, que é tudo de que os marcadores precisam.
 */
function invocar(lang, exe, raiz, fp) {
  const opcoes = { cwd: raiz };
  const chamar = (args) => run(exe.cmd, [...exe.prefixo, ...args], opcoes);
  if (lang === "python") return chamar(["check", "--output-format", "concise", fp]);
  if (lang === "js") return chamar([fp]);
  if (lang === "go") return chamar(["run", "--out-format", "line-number", fp]);
  if (lang === "java") {
    const cfg = CONFIGS_DE_LINTER.java.map((n) => path.join(raiz, n)).find((c) => fs.existsSync(c));
    return chamar(["-c", cfg, fp]);
  }
  return null;
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
if (!linter) allow(); // area sem linter declarado na politica para estas regras

// A raiz do projeto, ou o cwd. `projectRoot()` acha a raiz pelo `config/verificacao.json`; fora de um
// projeto do template ela e nula, e ai o cwd e a melhor aproximacao que existe.
const raiz = projectRoot() ?? process.cwd();

const exe = acharLinter(raiz, linter);
if (exe === null) {
  sinaliza(
    `${linter} não instalado — verificação de padrão de escrita (modo "${q.modo}"). ` +
      `Instale ${linter} para validar limiares, ausência de print/console e exceção não engolida em ${lang}.`
  );
  allow();
}

// PROJETO SEM CONFIG DE LINTER: o hook SINALIZA e segue, nunca reprova por conta propria.
//
// Antes ele funcionava sem config porque carregava os proprios numeros — e era exatamente esse
// atalho que criava a quarta copia dos limiares. Perdida a injecao, config ausente significa que
// NAO HA limiar a aplicar, e inventar um seria repor o defeito. Quem decide a severidade disso e a
// politica que ja existe: `qualidade.modo` (`warn` por padrao) — em `off` cala, em `warn` avisa, e
// so em `block` cobra, porque ai foi o projeto que pediu para ser cobrado.
const temConfig = (CONFIGS_DE_LINTER[lang] ?? []).some((nome) => fs.existsSync(path.join(raiz, nome)));
if (!temConfig) {
  sinaliza(
    `Sem config de ${linter} na raiz de ${raiz} — os limiares vivem nessa config, então não há o que ` +
      `aplicar aqui (modo "${q.modo}"). ${comoGerarAConfig(raiz)}`
  );
  allow();
}

const marcas = marcadores(lang);
if (!marcas) allow();

const res = invocar(lang, exe, raiz, fp);
if (!res) allow();

const out = `${res.stdout || ""}${res.stderr || ""}`.trim();
if (new RegExp(marcas.join("|")).test(out)) {
  sinaliza(
    `Padrão de escrita violado em ${fp} — limiares, print/console e exceção engolida, tudo pela ` +
      `config de ${linter} deste repositório:\n${out.slice(0, 1500)}\n` +
      `Corrija conforme a skill padrao-escrita.`
  );
}

allow();
