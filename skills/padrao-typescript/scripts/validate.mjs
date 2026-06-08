/**
 * validate.mjs — valida código TypeScript/JavaScript contra os limiares do padrao-escrita.
 *
 * Uso:
 *   node validate.mjs <arquivo-ou-pasta> [--config config.json]
 *
 * Retorno (stdout):
 *   JSON { "alvo", "violacoes": [ {caminho, linha, dimensao, severidade, risco,
 *   descricao, regra, confianca} ] } — formato consumível pelo code-diagnostico.
 *
 * Detecta (mecânico, via API do compilador TypeScript): limiares (tamanho de função,
 * aninhamento, nº de parâmetros), logging (console.* / catch vazio), tipagem (assinatura
 * pública sem tipo — só .ts/.tsx), segredos (literal em nome sensível) e hardcoded
 * heurístico (número mágico / URL) — este marcado com confianca "baixa".
 *
 * Dependência: pacote `typescript`, resolvido a partir do PROJETO-ALVO (ou do cwd).
 * Regras (CLAUDE.md): zero hardcoded (limiares/allowlists vêm do config.json), responsabilidade única.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const alvo = argv.find((a) => !a.startsWith("--"));
  const i = argv.indexOf("--config");
  const config = i >= 0 ? argv[i + 1] : join(SCRIPT_DIR, "config.json");
  return { alvo, config };
}

/** Resolve o pacote `typescript` a partir do projeto-alvo; cai para o cwd. */
function carregarTypescript(baseDir) {
  for (const base of [baseDir, process.cwd()]) {
    try {
      const req = createRequire(pathToFileURL(join(base, "__resolve__.js")));
      return req("typescript");
    } catch {
      /* tenta o próximo */
    }
  }
  console.error("erro: pacote 'typescript' não encontrado no projeto-alvo nem no cwd. Rode: npm i -D typescript");
  process.exit(2);
}

function carregarConfig(caminho) {
  return JSON.parse(readFileSync(caminho, "utf-8"));
}

function coletarArquivos(alvo, cfg) {
  const skip = new Set(cfg.skipDirs);
  const exts = new Set(cfg.extensions);
  const st = statSync(alvo);
  if (st.isFile()) return exts.has(extname(alvo)) ? [alvo] : [];
  const out = [];
  for (const nome of readdirSync(alvo)) {
    if (skip.has(nome)) continue;
    const p = join(alvo, nome);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...coletarArquivos(p, cfg));
    else if (exts.has(extname(p))) out.push(p);
  }
  return out;
}

function scriptKind(ts, ext) {
  return { ".ts": ts.ScriptKind.TS, ".tsx": ts.ScriptKind.TSX, ".js": ts.ScriptKind.JS,
    ".jsx": ts.ScriptKind.JSX, ".mjs": ts.ScriptKind.JS, ".cjs": ts.ScriptKind.JS }[ext] ?? ts.ScriptKind.TS;
}

const norm = (nome) => nome.toLowerCase().replace(/[^a-z0-9]/g, "");

function violacao(caminho, linha, dimensao, severidade, risco, descricao, regra, confianca = "alta") {
  return { caminho, linha, dimensao, severidade, risco, descricao, regra, confianca };
}

function validarArquivo(ts, caminho, cfg) {
  const ext = extname(caminho);
  const ehTs = ext === ".ts" || ext === ".tsx";
  const sf = ts.createSourceFile(caminho, readFileSync(caminho, "utf-8"), ts.ScriptTarget.Latest, true, scriptKind(ts, ext));
  const viol = [];
  const linhaDe = (no) => sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;

  const ehControle = (n) =>
    ts.isIfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
    ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isSwitchStatement(n) || ts.isTryStatement(n);

  const profundidade = (no, atual = 0) => {
    let max = atual;
    ts.forEachChild(no, (filho) => {
      const prox = ehControle(filho) ? atual + 1 : atual;
      max = Math.max(max, profundidade(filho, prox));
    });
    return max;
  };

  const ehFuncao = (n) =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

  function nomeFuncao(no) {
    if (no.name && ts.isIdentifier(no.name)) return no.name.text;
    if (no.parent && ts.isVariableDeclaration(no.parent) && ts.isIdentifier(no.parent.name)) return no.parent.name.text;
    return undefined;
  }

  function checarFuncao(no) {
    const ini = sf.getLineAndCharacterOfPosition(no.getStart(sf)).line;
    const fim = sf.getLineAndCharacterOfPosition(no.getEnd()).line;
    const linhas = fim - ini + 1;
    const linha = ini + 1;
    const nome = nomeFuncao(no) ?? "<anônima>";

    if (linhas > cfg.maxFunctionLines)
      viol.push(violacao(caminho, linha, "limiares", "media", "medio",
        `função '${nome}' com ${linhas} linhas`, `função <= ${cfg.maxFunctionLines} linhas`));

    const params = (no.parameters ?? []).filter((p) => !cfg.ignoreParamNames.includes(p.name?.getText?.(sf)));
    if (params.length > cfg.maxParams)
      viol.push(violacao(caminho, linha, "limiares", "media", "baixo",
        `função '${nome}' com ${params.length} parâmetros`, `<= ${cfg.maxParams} parâmetros`));

    const prof = profundidade(no);
    if (prof > cfg.maxNesting)
      viol.push(violacao(caminho, linha, "limiares", "media", "medio",
        `função '${nome}' com aninhamento de ${prof} níveis`, `aninhamento <= ${cfg.maxNesting} (use guard clauses)`));

    // tipagem: só TS, só função nomeada pública, ignora construtor
    if (ehTs && nomeFuncao(no) && !nome.startsWith("_") && !ts.isConstructorDeclaration(no)) {
      const semRetorno = !no.type && !ts.isSetAccessor(no);
      const semParam = (no.parameters ?? []).some((p) => !p.type && p.name?.getText?.(sf) !== "this");
      if (semRetorno || semParam)
        viol.push(violacao(caminho, linha, "tipagem", "baixa", "baixo",
          `função pública '${nome}' sem anotação de tipo completa`, "tipar assinaturas públicas (api/contrato)"));
    }
  }

  function checarConsole(no) {
    const e = no.expression;
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "console")
      viol.push(violacao(caminho, linhaDe(no), "logging", "media", "baixo",
        `uso de console.${e.name.text}`, "usar logger estruturado, sem console.*"));
  }

  function checarCatch(no) {
    if (no.block && no.block.statements.length === 0)
      viol.push(violacao(caminho, linhaDe(no), "logging", "media", "baixo",
        "catch vazio (exceção engolida)", "não engolir exceção; tratar/registrar"));
  }

  function checarLiteralNomeado(nome, init, linha) {
    if (!init) return;
    const n = norm(nome);
    if (ts.isStringLiteral(init)) {
      if (cfg.secretNamePatterns.some((p) => n.includes(p)) && init.text) {
        viol.push(violacao(caminho, linha, "segredos", "alta", "baixo",
          `possível segredo embutido em '${nome}'`, "segredos em .env (prefixado por módulo), nunca no código"));
        return;
      }
    }
    if (!cfg.hardcodedHeuristic) return;
    const ehConstante = nome === nome.toUpperCase() && /[A-Z]/.test(nome);
    if (ts.isNumericLiteral(init)) {
      const v = Number(init.text);
      if (!cfg.allowedMagicNumbers.includes(v) && !ehConstante)
        viol.push(violacao(caminho, linha, "hardcoded", "baixa", "baixo",
          `número mágico ${init.text}`, "valores de config em config.json", "baixa"));
    } else if (ts.isStringLiteral(init) && cfg.urlLikePrefixes.some((p) => init.text.startsWith(p))) {
      viol.push(violacao(caminho, linha, "hardcoded", "media", "baixo",
        `URL/host embutido '${init.text}'`, "URLs/hosts em config.json/.env", "baixa"));
    }
  }

  function visit(no) {
    if (ehFuncao(no)) checarFuncao(no);
    if (ts.isCallExpression(no)) checarConsole(no);
    if (ts.isCatchClause(no)) checarCatch(no);
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.initializer)
      checarLiteralNomeado(no.name.text, no.initializer, linhaDe(no));
    if (ts.isPropertyAssignment(no) && ts.isIdentifier(no.name) && no.initializer)
      checarLiteralNomeado(no.name.text, no.initializer, linhaDe(no));
    ts.forEachChild(no, visit);
  }

  visit(sf);
  return viol;
}

function main() {
  const { alvo, config } = parseArgs(process.argv.slice(2));
  if (!alvo) {
    console.error("uso: node validate.mjs <arquivo-ou-pasta> [--config config.json]");
    process.exit(2);
  }
  const alvoAbs = resolve(alvo);
  const baseDir = statSync(alvoAbs).isDirectory() ? alvoAbs : dirname(alvoAbs);
  const ts = carregarTypescript(baseDir);
  const cfg = carregarConfig(config);

  const violacoes = [];
  for (const arquivo of coletarArquivos(alvoAbs, cfg)) {
    try {
      violacoes.push(...validarArquivo(ts, arquivo, cfg));
    } catch (e) {
      violacoes.push(violacao(arquivo, 0, "parse", "alta", "baixo", `falha ao parsear: ${e.message}`, "arquivo válido"));
    }
  }
  process.stdout.write(JSON.stringify({ alvo: alvoAbs, violacoes }, null, 2) + "\n");
}

main();
