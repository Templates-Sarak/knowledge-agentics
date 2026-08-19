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
 * Dependência: pacote `typescript`, resolvido a partir do PROJETO-ALVO (ou do cwd) — usa a API
 * CLÁSSICA do compilador (`createSourceFile`/`forEachChild`/`ScriptTarget`). LIMITE DECLARADO:
 * o pacote `typescript` >= 7 (o rewrite nativo/Go) NÃO expõe mais essa API — só `./lib/version.cjs`
 * no export raiz. Rodar este script contra `typescript@7+` não é degradação silenciosa, é falha
 * dura de import. A base pina `typescript` em 5.9.3 exato na raiz por causa disso (ver
 * package.json) — o pin ADIA a migração, não a resolve: portar para 7+ exige outro parser aqui.
 *
 * Código de saída: violação de dimensão "parse" (arquivo que não deu pra ler ou parsear) é
 * SEMPRE fatal — `process.exitCode = 1`, nunca 0. Quem consome esta saída (code-adequador,
 * code-auditoria-padrao) lê exit 0 como "conforme"; um parse que falha e ainda assim retorna
 * 0 aprovaria qualquer coisa (fail-open, medido nesta base antes deste conserto).
 *
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

/** Núcleo: valida um TEXTO TS/JS já lido contra `cfg`. Puro — não toca `fs`. É o que o
 * `--autoteste` prova com fixtures em memória (a única entrada externa é o compilador `ts`,
 * carregado uma vez, do mesmo jeito que o autoteste de `validate.py` usa o `ast` da stdlib). */
function validarTexto(ts, caminho, texto, cfg) {
  const ext = extname(caminho);
  const ehTs = ext === ".ts" || ext === ".tsx";
  const sf = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true, scriptKind(ts, ext));
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

/** Núcleo: valida um TEXTO já lido, e nunca deixa uma exceção do AST-walk escapar sem virar
 * violação — qualquer erro de parsing vira uma violação de dimensão "parse", a MESMA regra que
 * `main()` aplicava só para I/O. Extraído para o núcleo para o `--autoteste` provar o item sem
 * tocar disco: injeta um `ts` que sempre falha e confere que o resultado é fatal. */
function validarComFallbackDeParse(ts, caminho, texto, cfg) {
  try {
    return validarTexto(ts, caminho, texto, cfg);
  } catch (e) {
    return [violacao(caminho, 0, "parse", "alta", "baixo", `falha ao parsear: ${e.message}`, "arquivo válido")];
  }
}

/** Núcleo: violação de dimensão "parse" é SEMPRE fatal — ver o LIMITE DECLARADO no cabeçalho. */
function temFalhaDeParse(violacoes) {
  return violacoes.some((v) => v.dimensao === "parse");
}

/** Casca: lê o arquivo do disco e delega ao núcleo. */
function validarArquivo(ts, caminho, cfg) {
  return validarComFallbackDeParse(ts, caminho, readFileSync(caminho, "utf-8"), cfg);
}

function _cfgFixture() {
  return {
    maxFunctionLines: 3,
    maxNesting: 2,
    maxParams: 2,
    ignoreParamNames: ["this"],
    extensions: [".ts", ".tsx", ".js"],
    skipDirs: [],
    allowedMagicNumbers: [0, 1, -1, 2],
    secretNamePatterns: ["password", "token"],
    urlLikePrefixes: ["http://", "https://"],
    hardcodedHeuristic: true,
  };
}

function autoteste() {
  const falhas = [];
  const ts = carregarTypescript(process.cwd());
  const cfg = _cfgFixture();
  const tem = (viol, dimensao) => viol.some((v) => v.dimensao === dimensao);

  const funcaoGrande = "function f(a, b, c) {\n  const x = 1;\n  const y = 2;\n  return x + y + a + b + c;\n}\n";
  if (!tem(validarTexto(ts, "f.ts", funcaoGrande, cfg), "limiares"))
    falhas.push("validarTexto deveria achar violacao de limiares (funcao/parametros grandes)");

  const cfgAninhamento = { ..._cfgFixture(), maxFunctionLines: 10, maxParams: 10 };
  const aninhado = "function f() {\n if (1) {\n  if (1) {\n   if (1) { }\n  }\n }\n}\n";
  const violAninhado = validarTexto(ts, "f.ts", aninhado, cfgAninhamento);
  if (!violAninhado.some((v) => v.descricao.includes("aninhamento")))
    falhas.push("validarTexto deveria achar violacao de aninhamento (3 niveis > limite 2)");

  const semTipo = "export function publica(a) {\n  return a;\n}\n";
  if (!tem(validarTexto(ts, "f.ts", semTipo, cfg), "tipagem"))
    falhas.push("validarTexto deveria achar violacao de tipagem em funcao publica sem anotacao (.ts)");

  const comConsole = "export function publica(a: number): number {\n  console.log(a);\n  return a;\n}\n";
  if (!tem(validarTexto(ts, "f.ts", comConsole, cfg), "logging"))
    falhas.push("validarTexto deveria achar violacao de logging (console.*)");

  const catchVazio = "try { f(); } catch (e) { }\n";
  if (!tem(validarTexto(ts, "f.ts", catchVazio, cfg), "logging"))
    falhas.push("validarTexto deveria achar violacao de logging (catch vazio)");

  // Concatenado, nao literal: o texto de ORIGEM deste arquivo nao pode conter um segredo-
  // formato contiguo, senao o proprio scan de vazamentos do audit_base.py acha "vazamento"
  // que e so dado de teste (mesmo cuidado do fixture em scan_segredos.py --autoteste).
  const valorSecreto = "valor-bem" + "-secreto";
  const segredo = `const token = '${valorSecreto}';\n`;
  if (!tem(validarTexto(ts, "f.ts", segredo, cfg), "segredos"))
    falhas.push("validarTexto deveria achar violacao de segredos em nome sensivel");

  const magico = "const limite = 777;\n";
  if (!tem(validarTexto(ts, "f.ts", magico, cfg), "hardcoded"))
    falhas.push("validarTexto deveria achar violacao de hardcoded (numero magico)");

  const limpo = "export function publica(a: number): number {\n  return a;\n}\n";
  if (validarTexto(ts, "f.ts", limpo, cfg).length !== 0)
    falhas.push("validarTexto nao deveria achar nada em codigo dentro dos limiares");

  // Item central do fail-open: injeta um `ts` que sempre falha ao parsear (nao depende de achar
  // um snippet real que faca o compilador explodir — o compilador TS e tolerante por design) e
  // confere que (a) o nucleo NUNCA deixa a excecao escapar, sempre devolve uma violacao "parse",
  // e (b) essa violacao decide reprovacao (exit fatal), nunca passa em silencio.
  const tsQuebrado = { ...ts, createSourceFile: () => { throw new Error("boom simulado"); } };
  const violQuebrado = validarComFallbackDeParse(tsQuebrado, "f.ts", "qualquer coisa", cfg);
  if (violQuebrado.length !== 1 || violQuebrado[0].dimensao !== "parse")
    falhas.push("validarComFallbackDeParse deveria converter excecao de parse em violacao 'parse'");
  if (!temFalhaDeParse(violQuebrado))
    falhas.push("temFalhaDeParse deveria reprovar (true) quando ha violacao de dimensao 'parse'");
  if (temFalhaDeParse(validarTexto(ts, "f.ts", limpo, cfg)))
    falhas.push("temFalhaDeParse nao deveria reprovar codigo limpo sem violacao de parse");

  for (const falha of falhas) process.stdout.write(`  falha  ${falha}\n`);
  if (falhas.length > 0) {
    process.stdout.write(`autoteste (validate.mjs): ${falhas.length} falha(s)\n`);
    return 1;
  }
  process.stdout.write("autoteste (validate.mjs): 11/11 ok\n");
  return 0;
}

function main() {
  if (process.argv.includes("--autoteste")) process.exit(autoteste());
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
    violacoes.push(...validarArquivo(ts, arquivo, cfg));
  }
  process.stdout.write(JSON.stringify({ alvo: alvoAbs, violacoes }, null, 2) + "\n");
  // Fail-open medido: sem isto, um arquivo que falhava ao parsear virava violacao "alta" no
  // JSON mas o processo saia com 0 mesmo assim, e quem consome (code-adequador,
  // code-auditoria-padrao) le exit 0 como "conforme" sem olhar o corpo da violacao.
  process.exitCode = temFalhaDeParse(violacoes) ? 1 : 0;
}

main();
