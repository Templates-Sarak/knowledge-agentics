#!/usr/bin/env node
"use strict";
// GARANTIA 2 (consistência visual) — PostToolUse(Write/Edit): formata o arquivo
// editado com o formatter da linguagem (definido em hooks/config.json).
// Best-effort: formatar não é verificação — sem a ferramenta ou com formatacao.ativo=false, pula.
// Escopo (`formatacao.escopo`): "conformes" (default) só reformata quando isso não gera ruído —
// arquivo fora de git, novo, ou cujo HEAD já estava conforme. Arquivo legado (HEAD fora do formatador)
// fica intacto, para o diff não misturar formatação com a mudança. "arquivo" = sempre formata.
// Mapeia: padrao-escrita (consistência de estilo).

const path = require("path");
const { readInput, allow, warnPostTool, commandExists, editedFiles, loadConfig, langOf, run } = require("./_lib");

/** Como cada formatter reescreve o arquivo no lugar. */
const ARGS_DE_FORMATACAO = {
  ruff: (fp) => ["format", fp],
  prettier: (fp) => ["--write", fp],
  gofmt: (fp) => ["-w", fp],
  "google-java-format": (fp) => ["--replace", fp],
};

/**
 * Como cada formatter CHECA um conteúdo lido por stdin, com `fp` só para a descoberta de config.
 * Só entra aqui o que foi EXECUTADO e confirmado (exit 0 = conforme, 1 = não conforme): `ruff` e
 * `prettier`. `gofmt` e `google-java-format` ficam de fora até alguém confirmar um modo de checagem
 * por stdin — sem ele a conformidade é indeterminada, e arquivo rastreado não é reformatado.
 */
const ARGS_DE_CHECAGEM = {
  ruff: (fp) => ["format", "--check", "--stdin-filename", fp, "-"],
  prettier: (fp) => ["--check", "--stdin-filepath", fp],
};

/** Núcleo: exit da checagem -> conforme (true), não conforme (false) ou indeterminado (null). */
function conformidadePorStatus(status) {
  if (status === 0) return true;
  if (status === 1) return false;
  return null;
}

/**
 * Núcleo: "formatar" ou "pular-legado". Pura. `headConforme` é true | false | null — null (não deu
 * para verificar) é tratado como legado: na dúvida, nada de ruído. Escopo "arquivo" sempre formata.
 */
function deveFormatar({ escopo, emRepo, rastreado, headConforme }) {
  if (escopo === "arquivo") return "formatar";
  if (!emRepo || !rastreado) return "formatar";
  return headConforme === true ? "formatar" : "pular-legado";
}

function git(cwd, args) {
  return run("git", ["-C", cwd, ...args]);
}

/**
 * Casca: `{ emRepo, rastreado, conteudoHead }` do arquivo. Rastreado mas ausente no HEAD (só no
 * índice) conta como novo. git que nem roda devolve rastreado com conteúdo null (indeterminado).
 */
function estadoNoGit(fp) {
  const topo = git(path.dirname(fp), ["rev-parse", "--show-toplevel"]);
  if (topo.error) return { emRepo: true, rastreado: true, conteudoHead: null };
  if (topo.status !== 0) return { emRepo: false, rastreado: false, conteudoHead: null };
  const raiz = topo.stdout.trim();
  const rel = path.relative(raiz, fp).split(path.sep).join("/");
  const novo = { emRepo: true, rastreado: false, conteudoHead: null };
  if (git(raiz, ["ls-files", "--error-unmatch", "--", rel]).status !== 0) return novo;
  if (git(raiz, ["cat-file", "-e", `HEAD:${rel}`]).status !== 0) return novo;
  const show = git(raiz, ["show", `HEAD:${rel}`]);
  return { emRepo: true, rastreado: true, conteudoHead: show.status === 0 ? show.stdout : null };
}

/** Casca: o conteúdo do HEAD passa pelo modo de checagem do formatter, por stdin. */
function headConforme(formatter, fp, conteudoHead) {
  const checagem = ARGS_DE_CHECAGEM[formatter];
  if (!checagem || conteudoHead === null) return null;
  const r = run(formatter, checagem(fp), { input: conteudoHead, cwd: path.dirname(fp) });
  return conformidadePorStatus(r.status);
}

/** Casca: a decisão para um arquivo, e a conformidade do HEAD (para a mensagem). */
function decidir(fp, formatter, escopo) {
  if (escopo === "arquivo") return { acao: "formatar", conforme: null };
  const estado = estadoNoGit(fp);
  const conforme = estado.rastreado ? headConforme(formatter, fp, estado.conteudoHead) : null;
  return { acao: deveFormatar({ escopo, ...estado, headConforme: conforme }), conforme };
}

function avisoDeLegado(rotulo, conforme) {
  const motivo = conforme === false ? " não estava formatado no HEAD" : ": não deu para verificar se estava formatado no HEAD";
  return `${rotulo}${motivo} — não reformatado, para não misturar formatação com a mudança. Formate num commit separado, se quiser.`;
}

function autoteste() {
  const base = { escopo: "conformes", emRepo: true, rastreado: true };
  const casos = [
    ["fora de repositorio git -> formatar", deveFormatar({ ...base, emRepo: false, rastreado: false, headConforme: null }) === "formatar"],
    ["nao rastreado (novo) -> formatar", deveFormatar({ ...base, rastreado: false, headConforme: null }) === "formatar"],
    ["rastreado com HEAD conforme -> formatar", deveFormatar({ ...base, headConforme: true }) === "formatar"],
    ["rastreado com HEAD nao conforme (legado) -> pular", deveFormatar({ ...base, headConforme: false }) === "pular-legado"],
    ["indeterminado (null) -> pular, como legado", deveFormatar({ ...base, headConforme: null }) === "pular-legado"],
    ["escopo 'arquivo' formata mesmo o legado", deveFormatar({ ...base, escopo: "arquivo", headConforme: false }) === "formatar"],
    ["escopo 'arquivo' formata mesmo o indeterminado", deveFormatar({ ...base, escopo: "arquivo", headConforme: null }) === "formatar"],
    ["checagem exit 0 -> conforme", conformidadePorStatus(0) === true],
    ["checagem exit 1 -> nao conforme", conformidadePorStatus(1) === false],
    ["checagem exit 2 ou sem exit -> indeterminado", conformidadePorStatus(2) === null && conformidadePorStatus(null) === null],
  ];
  const falhas = casos.filter(([, ok]) => !ok);
  for (const [nome, ok] of casos) process.stdout.write(`  ${ok ? "ok   " : "FALHA"} ${nome}\n`);
  process.stdout.write(`autoteste (padrao-format.js): ${casos.length - falhas.length}/${casos.length} ok\n`);
  return falhas.length === 0 ? 0 : 1;
}

if (process.argv.includes("--autoteste")) process.exit(autoteste());

const input = readInput();
const cfg = loadConfig(input.cwd);
if (cfg.formatacao?.ativo === false) allow();

const escopo = cfg.formatacao?.escopo ?? "conformes";
const base = input.cwd || process.cwd();
const avisos = [];

for (const fp of editedFiles(input)) {
  const lang = langOf(fp);
  if (!lang) continue;
  const formatter = cfg.linguagens[lang]?.formatter;
  const args = ARGS_DE_FORMATACAO[formatter];
  if (!args || !commandExists(formatter)) continue;

  const { acao, conforme } = decidir(fp, formatter, escopo);
  if (acao === "formatar") run(formatter, args(fp));
  else avisos.push(avisoDeLegado(path.relative(base, fp) || fp, conforme));
}

if (avisos.length > 0) warnPostTool(avisos.join("\n"));
allow(); // formatar nunca bloqueia.
