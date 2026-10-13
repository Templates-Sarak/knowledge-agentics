#!/usr/bin/env node
/**
 * affected.mjs — dado um conjunto de arquivos alterados, diz o que precisa ser VERIFICADO.
 * Lei dona: nenhuma — ferramenta, como `sync-env.mjs` e `generate-lint-config.mjs`. Não é
 * regra de gate, não tem id, não conta para as 82 regras com caso do catálogo.
 *
 *   node tools/affected.mjs <caminho...>          caminhos por argumento
 *   git diff --name-only | node tools/affected.mjs   caminhos por stdin (sem argumento)
 *   node tools/affected.mjs --since <ref>          chama `git diff --name-only <ref>`
 *   node tools/affected.mjs ... --json             saida estruturada em vez de texto
 *   node tools/affected.mjs --selftest            roda a prova interna (fixtures em memoria)
 *
 * ============================================================================================
 * O PRINCIPIO QUE MANDA EM TODA DECISAO DESTE ARQUIVO: ERRA PARA MAIS, NUNCA PARA MENOS.
 *
 * Selecionar demais custa minutos de CI. Selecionar de menos deixa código NAO VERIFICADO passar
 * com o pipeline verde — e "verde indistinguível de não verificou" é exatamente a doença que todo
 * o template de módulos existe para tratar (04-regras.md §7). Toda dúvida, todo
 * caminho não reconhecido, toda falha de leitura resolve em "verificar TUDO", nunca em "não afeta
 * nada". Quem mexer neste arquivo depois: a direção proibida é fazer o cálculo mais preciso à
 * custa de arriscar um falso negativo. Precisão que arrisca esconder código não verificado NAO
 * entra aqui — é a mesma lei do §7.2 do catálogo, na direção oposta (lá é falso positivo que não
 * se aceita; aqui é falso negativo).
 * ============================================================================================
 *
 * ARQUITETURA DO ARQUIVO — duas metades, como `gate/context.mjs` e `gate/spec.mjs` já separam:
 *
 *   - `buildGraph` é a ÚNICA função que toca disco. Lê `module.json` de cada módulo (via
 *     `listModules`/`findRootProjeto`, REUSADOS de `gate/context.mjs` — a mesma definição de
 *     "o que é um módulo" em todo o template, nunca uma segunda);
 *   - `normalizePath` e `computeAffected` são PURAS: recebem dado, devolvem dado, nunca
 *     `existsSync`/`readFileSync`. É o que permite `--selftest` provar o cálculo inteiro com
 *     fixtures em memória, sem escrever um projeto em disco — o mesmo raciocínio do cabeçalho de
 *     `spec.mjs` ("não toca o disco: recebe o texto e devolve dado").
 */
import { readFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { findProjectRoot, listModules } from './gate/context.mjs';

// ================================================================================================
// CASCA — toca disco. Só esta função.
// ================================================================================================

/** Lê removendo o BOM (U+FEFF) — editor e shell do Windows gravam por padrão, `JSON.parse` rejeita. */
function readText(path) {
  return readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
}

/**
 * Monta o grafo do projeto a partir do disco: um nó por pasta de `modules/` com manifesto (via
 * `listModules`, que JÁ inclui `_template` — "Lista as pastas de modules/ que tem manifesto —
 * inclusive os moldes", context.mjs). Decisão sobre `_template` (armadilha do Passo 4): entra sem
 * tratamento especial. Reusar `listModules` em vez de reimplementar significa aceitar a definição
 * dela inteira — e é segura aqui pelo mesmo motivo que é segura no gate: nenhum módulo REAL declara
 * `consumes` apontando pra `_template` (não faria sentido semântico), então o conjunto afetado por
 * uma mudança nele é, na prática, só ele mesmo — o mesmo isolamento que `validate.mjs --all` já
 * mostra ao reportar "molde" como uma unidade própria, separada dos módulos reais.
 *
 * A CHAVE do grafo é o NOME DA PASTA, não o `id` de dentro do manifesto. É a mesma chave que
 * `context.mjs:dirId` usa, e a razão é dupla: (1) é o que aparece no CAMINHO do arquivo
 * alterado (`modules/<pasta>/...`), que é o único dado que este script recebe; (2) `consumes[].module`
 * referencia o módulo DONO pelo nome que a regra `manifest` já obriga a casar com a pasta — se
 * meta.json:id divergir do nome da pasta, o gate já está vermelho por outro motivo (`manifest`), e
 * não é este script que precisa ser a segunda rede de segurança para esse defeito.
 */
export function buildGraph(projectRoot) {
  const dirs = listModules(projectRoot);
  const modules = new Map();
  let unreadable = false;

  for (const dir of dirs) {
    const id = basename(dir);
    try {
      const manifest = JSON.parse(readText(resolve(dir, 'module.json')));
      const consumes = Array.isArray(manifest.consumes)
        ? manifest.consumes.map((entry) => entry.module).filter((target) => typeof target === 'string')
        : [];
      modules.set(id, { consumes });
    } catch {
      // Armadilha do Passo 4 — "module.json ilegível": JSON quebrado numa pasta é grafo INCOMPLETO,
      // não "módulo sem arestas". Não dá pra saber se este módulo consome alguém nem quem o
      // consome de verdade — qualquer resposta que não seja "não confio neste grafo" seria
      // inventar aresta que pode não existir, ou omitir uma que existe. `ilegivel` propaga para
      // "tudo" em `computeAffected`, sem exceção.
      modules.set(id, { consumes: [] });
      unreadable = true;
    }
  }

  return { modules, unreadable };
}

/**
 * ÚNICO ponto deste arquivo que roda comando externo. Isolado de propósito: as ferramentas deste
 * repositório (lei 3 do prompt que encomendou este script) não dependem de nada além de
 * `node:fs`/`path`/`url` — `git` no PATH não é uma dependência de PACOTE, mas é uma dependência de
 * AMBIENTE, e por isso fica marcada aqui, isolada, nunca escondida dentro do cálculo. Quem não quiser
 * essa dependência usa `<caminho...>` ou stdin — as outras duas portas de entrada não tocam em nada
 * fora de `node:fs`/`path`.
 */
function changedPathsSince(ref, projectRoot) {
  const output = execFileSync('git', ['diff', '--name-only', '--no-renames', ref], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return output.split(/\r?\n/).filter((line) => line.trim() !== '');
}

// ================================================================================================
// PURO — nunca toca disco. É a metade que `--selftest` prova.
// ================================================================================================

/**
 * Normaliza um caminho bruto (do usuário, do git, de stdin) para relativo à raiz do projeto, com
 * `/` sempre — armadilha do Passo 4 "caminho absoluto × relativo, `\` × `/`". `null` quando o
 * caminho cai FORA da raiz do projeto (`../`, ou absoluto de outro lugar): isso é "não reconhecido"
 * na mesma direção das outras armadilhas — não filtramos silenciosamente, o chamador resolve em
 * "tudo" (ver `computeAffected`).
 *
 * PURA apesar de usar `path.resolve`/`path.relative`: as duas são matemática de string sobre os
 * caminhos recebidos, nunca leem o disco para saber se o caminho existe.
 */
export function normalizePath(raw, projectRoot) {
  const withoutSpace = raw.trim();
  if (withoutSpace === '') return null;
  const absolute = isAbsolute(withoutSpace) ? withoutSpace : resolve(projectRoot, withoutSpace);
  const rel = relative(projectRoot, absolute);
  if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/**
 * Em que ÁREA do projeto este caminho (já normalizado, relativo, `/`) cai — a pergunta que decide
 * tudo. `grafo` só é usado para confirmar que um `modules/<id>` é um id que EXISTE hoje.
 *
 * O DEFAULT (nenhum prefixo reconhecido) é `tudo` — não uma lista de exceções que precisa ser
 * mantida em dia. É a forma como a armadilha "caminho não reconhecido" (Passo 4) e a decisão do
 * Passo 1 sobre `tools/`, `config/`, `.env`, `package.json`/`pyproject.toml` da raiz e config
 * de linter viram a MESMA linha de código: nenhum desses é `modules/`, `adapters/`, `src/` ou
 * `packages/`, então caem aqui por construção, sem precisar nomear cada arquivo (`.env`,
 * `.gitignore`, `tsconfig.json`, `.ruff.toml`, `verify.py`, `project.json`, `specs/**`, ...).
 * Medido (Passo 1): mudar o VERIFICADOR (`tools/`) ou a POLÍTICA do projeto (config raiz,
 * manifesto raiz, lint gerado) pode mudar o resultado de QUALQUER checagem — a resposta segura é
 * literalmente "tudo", e é isso que este `default` devolve sem lista para manter.
 */
function classifyPath(path, graph) {
  const [first, second, ...rest] = path.split('/');

  if (first === 'modules') {
    if (second === undefined) {
      return { kind: 'all', reason: `path "${path}" points to modules/ without a specific module` };
    }
    if (!graph.modules.has(second)) {
      // Armadilhas "arquivo apagado" / "modulo apagado" (Passo 4): a pasta pode ter sumido
      // inteira, ou nunca ter existido sob esse nome. Sem o grafo de ANTES da mudança não há como
      // achar quem consumia este módulo — silenciar seria inventar "ninguém o consumia".
      return {
        kind: 'all',
        reason: `"${second}" does not exist in modules/ today (deleted, renamed, or unknown) —`
          + ' without the previous graph, its consumers cannot be determined',
      };
    }
    const subPath = rest.join('/');
    const testOnly = subPath === 'tests' || subPath.startsWith('tests/');
    return { kind: 'module', id: second, testOnly };
  }

  if (first === 'adapters' || first === 'src') {
    // Medido (Passo 1): adapter é INJETADO — módulo nenhum importa `adapters/` nem `src/`
    // (`import-adapter` proíbe até em teste ser a forma recomendada). Mudança aqui não muda o
    // código de NENHUM módulo; muda o sistema COMPOSTO — as regras de escopo `root`. Não é "tudo":
    // é uma resposta calculada, não um escape.
    return { kind: 'wiring' };
  }

  if (first === 'packages') {
    // Medido (Passo 1): módulo importar `packages/ports` é OPCIONAL por projeto (o molde traz
    // cópia local "para ser autossuficiente desde o primeiro teste" — comentário de
    // `api/src/errors.ts`), e `packages/ui-kit` só entra quando `ui.mode: "kit"`. As duas são
    // condicionais que só se resolvem PARSEANDO import de cada módulo — a mesma máquina de
    // `isolation.mjs`, que este script não deveria duplicar. Sem essa máquina, não dá pra provar
    // que um módulo NÃO importa `packages/`, e por "erra para mais" a resposta segura é afetar a
    // raiz E todos os módulos — computada, não bailout: por isso é um `tipo` próprio, não `tudo`.
    return { kind: 'packages' };
  }

  if (first === 'tools') {
    return { kind: 'all', reason: 'tools/ contains the verifier itself — changing the gate can affect ANY check' };
  }

  return {
    kind: 'all',
    reason: `path is outside the known areas (modules/, adapters/, src/, packages/, tools/): "${path}"`,
  };
}

/** Mapa reverso `id -> [quem declara consumir id]` — a direção em que a mudança se propaga. */
function buildReverse(graph) {
  const reverse = new Map();
  for (const [id, { consumes }] of graph.modules) {
    for (const target of consumes) {
      if (!reverse.has(target)) reverse.set(target, []);
      reverse.get(target).push(id);
    }
  }
  return reverse;
}

/**
 * O cálculo inteiro. PURA: `grafo` já vem montado, `caminhosBrutos` são strings quaisquer — nenhuma
 * chamada a `fs` aqui. Direção medida no Passo 1 e reproduzida no mundo real (ver relatório): se A
 * declara `consumes: [{module: "B"}]`, é A quem lê o CONTRATO de B (`consumes-contract`, "Reportado
 * no consumidor") — então quando B muda, quem precisa reverificar é A, e transitivamente quem
 * consome A. A aresta salva no grafo é "A consome B" (a direção de dependência RUNTIME); a
 * propagação de afetados anda ao CONTRÁRIO dela.
 *
 * Armadilha "ciclo em consome" (Passo 4): a fila de propagação usa um `Set` de visitados
 * (`afetados`) — um nó só entra na fila UMA vez, então um ciclo A→B→A não trava o cálculo, só faz a
 * busca visitar o mesmo par de nós e parar por falta de novidade. Não há proteção ESPECIAL contra
 * ciclo porque a busca por visitados já é, por construção, imune a ele.
 */
export function computeAffected(graph, rawPaths) {
  if (graph.unreadable) {
    return { all: true, reason: 'module.json is unreadable in at least one module — the dependency graph is incomplete' };
  }

  const affected = new Set();
  const triggersPropagation = new Set();
  let root = false;

  for (const path of rawPaths) {
    if (path === null) {
      return { all: true, reason: 'path is outside the project root (outside modules/, adapters/, src/, packages/, tools/, and the root itself)' };
    }

    const cls = classifyPath(path, graph);

    if (cls.kind === 'all') return { all: true, reason: cls.reason };

    if (cls.kind === 'wiring') {
      root = true;
      continue;
    }

    if (cls.kind === 'packages') {
      root = true;
      for (const id of graph.modules.keys()) {
        affected.add(id);
        triggersPropagation.add(id);
      }
      continue;
    }

    // cls.kind === 'module'
    affected.add(cls.id);
    if (!cls.testOnly) triggersPropagation.add(cls.id);
  }

  const reverse = buildReverse(graph);
  const queue = [...triggersPropagation];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const consumer of reverse.get(current) ?? []) {
      if (affected.has(consumer)) continue;
      affected.add(consumer);
      queue.push(consumer);
    }
  }

  return { all: false, root, modules: [...affected].sort() };
}

// ================================================================================================
// SAIDA
// ================================================================================================

/**
 * Text format: one id per line (the format consumed by CI with `xargs`/`for`). `(all)` and
 * `(root)` são sentinelas entre parênteses — nenhum id de módulo passa pela regra `manifest`
 * (nomes de pasta, sem parênteses) com essa forma, então não colidem por acidente com um módulo
 * real. "Tudo" nunca fica indistinguível de "todos os módulos happen to ser a lista inteira": são
 * dois campos (`tudo` e `modules`) que nunca aparecem preenchidos ao mesmo tempo.
 */
function formatText(result) {
  if (result.all) return '(all)\n';
  const lines = result.root ? ['(root)', ...result.modules] : [...result.modules];
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function formatJson(result) {
  const object = result.all
    ? { all: true, reason: result.reason, root: null, modules: null }
    : { all: false, reason: null, root: result.root, modules: result.modules };
  return `${JSON.stringify(object, null, 2)}\n`;
}

// ================================================================================================
// AUTOTESTE — a prova por máquina (lei 6: sem prova, não entra). `cases.mjs` prova REGRA do gate;
// este script não é regra, então prova a si mesmo, aqui dentro, com fixture em memória — sem tocar
// disco, do mesmo jeito que `computeAffected` foi desenhada para permitir.
// ================================================================================================

function testGraph() {
  return {
    unreadable: false,
    modules: new Map([
      ['a', { consumes: [] }],
      ['b', { consumes: ['a'] }],
      ['c', { consumes: ['b'] }],
      ['loose', { consumes: [] }],
    ]),
  };
}

function graphWithCycle() {
  return {
    unreadable: false,
    modules: new Map([
      ['a', { consumes: ['b'] }],
      ['b', { consumes: ['a'] }],
    ]),
  };
}

function sameSet(list, expected) {
  const a = [...list].sort();
  const b = [...expected].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function resultMatches(result, expected) {
  if (result.all !== expected.all) return false;
  if (result.all) return true;
  if (result.root !== expected.root) return false;
  return sameSet(result.modules, expected.modules);
}

/** Os casos mínimos exigidos pelo plano, mais os que a implementação revelou precisarem de prova. */
function selfTestCases() {
  return [
    {
      name: 'transitive dependency chain affects dependent modules but leaves unrelated modules alone',
      graph: testGraph(),
      paths: ['modules/a/core/domain/index.ts'],
      expected: { all: false, root: false, modules: ['a', 'b', 'c'] },
    },
    {
      name: 'unknown path affects everything',
      graph: testGraph(),
      paths: ['docker-compose.yml'],
      expected: { all: true },
    },
    {
      name: 'deleted file or removed module affects everything',
      graph: testGraph(),
      paths: ['modules/removed/core/domain/index.ts'],
      expected: { all: true },
    },
    {
      name: 'unreadable module.json affects everything despite a healthy remaining graph',
      graph: { unreadable: true, modules: new Map() },
      paths: ['modules/a/core/domain/index.ts'],
      expected: { all: true },
    },
    {
      name: 'cycle in consumes does not stall the calculation',
      graph: graphWithCycle(),
      paths: ['modules/a/core/domain/index.ts'],
      expected: { all: false, root: false, modules: ['a', 'b'] },
    },
    {
      name: 'change in packages/ affects all modules and the root',
      graph: testGraph(),
      paths: ['packages/ports/index.ts'],
      expected: { all: false, root: true, modules: ['a', 'b', 'c', 'loose'] },
    },
    {
      name: 'change only in a module tests/ directory does not pull in its consumers',
      graph: testGraph(),
      paths: ['modules/a/tests/domain/test_a.py'],
      expected: { all: false, root: false, modules: ['a'] },
    },
    {
      name: 'adapters/ affects the root but no module because adapters are injected, not imported',
      graph: testGraph(),
      paths: ['adapters/memory/index.ts'],
      expected: { all: false, root: true, modules: [] },
    },
    {
      name: 'src/ affects the root but no module because composition is root code',
      graph: testGraph(),
      paths: ['src/composition.ts'],
      expected: { all: false, root: true, modules: [] },
    },
    {
      name: 'tools/ (the verifier itself) affects everything',
      graph: testGraph(),
      paths: ['tools/gate/validate.mjs'],
      expected: { all: true },
    },
    {
      name: 'root config/policy affects everything through the default case',
      graph: testGraph(),
      paths: ['config/verification.json'],
      expected: { all: true },
    },
    {
      name: 'path outside the project root affects everything',
      graph: testGraph(),
      paths: [null],
      expected: { all: true },
    },
    {
      name: 'two independent leaf modules changed together produce the union without a false cycle',
      graph: testGraph(),
      paths: ['modules/a/core/domain/index.ts', 'modules/loose/core/domain/index.ts'],
      expected: { all: false, root: false, modules: ['a', 'b', 'c', 'loose'] },
    },
    {
      name: 'an empty path list affects nothing: no full run, root, or module',
      graph: testGraph(),
      paths: [],
      expected: { all: false, root: false, modules: [] },
    },
  ];
}

/** Prova de `normalizePath` — a armadilha de Windows (`\`, absoluto x relativo) isolada. */
function normalizationCases() {
  const root = 'C:\\tmp\\project';
  return [
    { raw: 'modules\\a\\core\\domain\\index.ts', expected: 'modules/a/core/domain/index.ts' },
    { raw: 'modules/a/core/domain/index.ts', expected: 'modules/a/core/domain/index.ts' },
    { raw: 'C:\\tmp\\project\\modules\\a\\core\\domain\\index.ts', expected: 'modules/a/core/domain/index.ts' },
    { raw: '..\\outside\\file.ts', expected: null },
    { raw: 'C:\\tmp\\another-project\\file.ts', expected: null },
  ].map((c) => ({ ...c, root }));
}

function runSelfTest() {
  let failures = 0;

  for (const testCase of selfTestCases()) {
    const result = computeAffected(testCase.graph, testCase.paths);
    const ok = resultMatches(result, testCase.expected);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) {
      failures += 1;
      process.stdout.write(`       expected: ${JSON.stringify(testCase.expected)}\n`);
      process.stdout.write(`       received: ${JSON.stringify(result)}\n`);
    }
  }

  for (const testCase of normalizationCases()) {
    const obtained = normalizePath(testCase.raw, testCase.root);
    const ok = obtained === testCase.expected;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} normalizePath(${JSON.stringify(testCase.raw)})\n`);
    if (!ok) {
      failures += 1;
      process.stdout.write(`       expected: ${JSON.stringify(testCase.expected)} received: ${JSON.stringify(obtained)}\n`);
    }
  }

  const total = selfTestCases().length + normalizationCases().length;
  process.stdout.write(`\nself-test: ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function readOptions(argv) {
  const flagsWithValue = new Set(['--since', '--root']);
  const options = { selfTest: false, json: false, since: null, root: null, paths: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--selftest') { options.selfTest = true; continue; }
    if (current === '--json') { options.json = true; continue; }
    if (flagsWithValue.has(current)) {
      options[current.slice(2)] = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    options.paths.push(current);
  }
  return options;
}

/** `null` quando não há entrada nenhuma (nem argumento, nem `--since`, nem stdin com dado). */
function readInputPaths(options, projectRoot) {
  if (options.since !== null) return changedPathsSince(options.since, projectRoot);
  if (options.paths.length > 0) return options.paths;
  if (process.stdin.isTTY) return null;
  return readFileSync(0, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '');
}

function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();

  const projectRoot = options.root !== null ? resolve(process.cwd(), options.root) : findProjectRoot(process.cwd());
  const rawArgs = readInputPaths(options, projectRoot);
  if (rawArgs === null) {
    process.stderr.write(
      'Usage: node tools/affected.mjs <path...>\n'
      + '     node tools/affected.mjs --since <ref>\n'
      + '     <file-list command> | node tools/affected.mjs\n'
      + '     node tools/affected.mjs --selftest\n',
    );
    return 1;
  }

  const graph = buildGraph(projectRoot);
  const normalized = rawArgs.map((raw) => normalizePath(raw, projectRoot));
  const result = computeAffected(graph, normalized);
  process.stdout.write(options.json ? formatJson(result) : formatText(result));
  return 0;
}

// Só executa quando ESTE arquivo é o entrypoint — mesma guarda de `generate-lint-config.mjs`: importar
// as funções puras (num hook, num teste) não pode ter o efeito colateral de rodar o CLI.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
