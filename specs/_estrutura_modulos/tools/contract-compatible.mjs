#!/usr/bin/env node
/**
 * contract-compatible.mjs — esta mudança no `contract/openapi.yaml` quebra quem consome o módulo?
 * Lei dona: specs/arquitetura/02-contrato-e-dados.md §5 ("v1 é estável... consulte o grafo antes").
 *
 *   node tools/contract-compatible.mjs [--since <ref>] [<module>] [--json]
 *   node tools/contract-compatible.mjs --selftest
 *
 * O QUE ISTO NÃO É: não é regra de gate. O gate compara UM estado (04-regras.md); isto compara DOIS —
 * precisa de baseline git, e por isso é FERRAMENTA, não regra: "o gate não roda git de propósito, é o
 * que o mantém puro e chamável de dentro de um hook" (gate/README.md). Não ganha id, não entra no
 * §4.x, não conta para as 81 regras com caso.
 *
 * ============================================================================================
 * A LEI, E O QUE DELA ESTE ARQUIVO COBRE — 02-contrato-e-dados.md §5, cláusula por cláusula:
 *
 *   COBERTO (provado por --selftest):
 *     - "rota nova é compatível"                          → rota em depois e não em antes: nada
 *     - "remover... campo [rota] não é [compatível]"       → rota em antes e não em depois: BREAKING
 *     - método de uma rota que continua, removido          → BREAKING (mesma cláusula, granularidade menor)
 *     - "acrescentar campo opcional [na resposta] é compatível" → propriedade nova na resposta: nada
 *     - "remover... campo [da resposta]... não é [compatível]"  → propriedade sumida da resposta: BREAKING
 *     - direção INVERSA na requisição (não é cláusula literal da lei, é a mecânica por trás dela):
 *       campo que passa a ser OBRIGATÓRIO na entrada → BREAKING; deixar de ser obrigatório → nada
 *     - `servers[0].url` alterado → BREAKING (muda o prefixo, quebra todo consumidor)
 *
 *   NÃO COBERTO, declarado como limite em 04-regras.md §7.2 (não fingido, não testado como coberto):
 *     - "mudar tipo" de um campo (`type: string` → `type: integer`)
 *     - "apertar validação" (minLength, maximum, pattern, format mais estritos)
 *     - "enum que perdeu valor"
 *     - "mudar semântica" — nunca decidível por máquina, nem tentado
 *
 * Por quê parar aqui: os quatro primeiros exigem um leitor CIENTE DE TIPO — o que `spec.mjs` tem hoje
 * é um leitor de NOME (property existe? está em `required`?), não de FORMA. Estender para tipo/validação
 * é redesenho do extrator (a mesma fronteira que `spec.mjs` já documenta para `contract-projection`: "o
 * conserto não é uma guarda, é a região passar a ser... redesenho do extrator"). Prefiro cinco cláusulas
 * provadas e quatro limites escritos a nove cláusulas alegadas — é a lei 1 deste prompt (falso positivo
 * não se aceita) aplicada ao MEU PRÓPRIO relatório: dizer "cubro a lei inteira" sem provar seria a mesma
 * cegueira-fingida-de-certeza que este arquivo existe para impedir na spec.
 * ============================================================================================
 *
 * NÚCLEO × CASCA — o precedente é `affected.mjs` (grafo) e `gate/spec.mjs` (leitura), os dois já
 * fixaram esta forma duas vezes:
 *
 *   `compareContracts(yamlAntes, yamlDepois)` é o núcleo: recebe TEXTO, devolve DADO, nunca toca
 *   `fs` nem `child_process`. É o que permite `--selftest` provar cada cláusula com fixture em
 *   memória, sem escrever projeto em disco nem precisar de repositório git.
 *
 *   A casca (`principal`, `git`, `readInRef`, `readCurrent`, `caminhosMudados`) é quem toca disco e git.
 *   `git()` é o ÚNICO ponto que roda `git` de verdade — mesmo isolamento de `changedPathsSince`
 *   em `affected.mjs`. `execFileSync` sempre com ARRAY de argumentos, nunca `shell: true`: a etapa
 *   anterior deste plano foi reprovada por shell concatenando argumento hostil em comando — aqui o
 *   argumento hostil é a PRÓPRIA ref (`--since`), e ela nunca toca um interpretador de shell.
 *
 * CEGUEIRA ≠ COMPATIBILIDADE — a armadilha central. Se `failedReads` (gate/spec.mjs) disser que
 * `paths:` ou `servers:` de QUALQUER um dos dois lados não pôde ser lido, a resposta NUNCA é
 * "compatível": é "não consegui comparar", com exit 1 e a seção nomeada. Dizer "sem breaking change"
 * sobre uma spec que não se leu é a pior saída possível — libera um deploy que quebra consumidor
 * acreditando que foi verificado.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  failedReads, requestRequired, specOperations, responseProperties,
  specServer, operationStatus,
} from './gate/spec.mjs';
import { buildGraph } from './affected.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process` ou `process.env`.
// ================================================================================================

/** Rota removida é BREAKING; rota nova não é reportada (compatível, lei explícita). */
function compareRoutes(before, after) {
  const findings = [];
  for (const [route, methods] of specOperations(before)) {
    const methodsAfter = specOperations(after).get(route);
    if (methodsAfter === undefined) {
      findings.push({ kind: 'removed-route', message: `route "${route}" existed and was removed — this breaks consumers` });
      continue;
    }
    for (const method of methods) {
      if (!methodsAfter.has(method)) {
        findings.push({ kind: 'removed-method', message: `${method} "${route}" existed and was removed — this breaks consumers` });
      }
    }
  }
  return findings;
}

/** `servers[0].url` é o prefixo do módulo — mudar quebra todo consumidor. Só compara quando os dois lados leem. */
function compareServer(before, after) {
  const urlBefore = specServer(before);
  const urlAfter = specServer(after);
  if (urlBefore === null || urlAfter === null || urlBefore === urlAfter) return [];
  return [{ kind: 'changed-server', message: `servers[0].url changed from "${urlBefore}" to "${urlAfter}" — the module prefix changed and breaks every consumer` }];
}

/**
 * Campo de RESPOSTA removido é BREAKING; campo novo não é reportado. Só compara rota+método+status
 * presentes nos DOIS lados — rota/método removidos já viraram achado em `compareRoutes`, e status
 * code que desapareceu é uma pergunta diferente desta cláusula (não coberta, ver cabeçalho do arquivo).
 */
/** O laco de `status` isolado do de `compareResponses` — so por isso o aninhamento de UM cai
 * dentro do limiar (04-regras.md §4.7): a mesma tecnica que separa `compareResponseFields`.
 * `{ antes, depois }` e `{ rota, metodo }` agrupados: os dois pares sempre viajam juntos, e sem
 * agrupar a extracao trocaria um limiar (aninhamento) por outro (parametros). */
function statusFindingsInResponse(specs, operation, statusBefore, statusAfter) {
  const findings = [];
  for (const status of statusBefore) {
    if (!statusAfter.has(status)) continue;
    findings.push(...compareResponseFields(specs.before, specs.after, { ...operation, status }));
  }
  return findings;
}

function compareResponses(before, after) {
  const findings = [];
  for (const [route, methods] of specOperations(before)) {
    const methodsAfter = specOperations(after).get(route);
    if (methodsAfter === undefined) continue;
    for (const method of methods) {
      if (!methodsAfter.has(method)) continue;
      const statusBefore = operationStatus(before, route, method) ?? new Set();
      const statusAfter = operationStatus(after, route, method) ?? new Set();
      findings.push(...statusFindingsInResponse({ before, after }, { route, method }, statusBefore, statusAfter));
    }
  }
  return findings;
}

/** `{ rota, metodo, status }` em vez de tres parametros soltos — o limiar de 4 parametros
 * (04-regras.md §4.7) que este arquivo tambem cobra do codigo do usuario. */
function compareResponseFields(before, after, operation) {
  const { route, method, status } = operation;
  const propsBefore = responseProperties(before, route, method, status) ?? new Set();
  const propsAfter = responseProperties(after, route, method, status) ?? new Set();
  const findings = [];
  for (const field of propsBefore) {
    if (!propsAfter.has(field)) {
      findings.push({
        kind: 'removed-response-field',
        message: `${method} "${route}" ${status}: response field "${field}" existed and was removed — this breaks consumers`,
      });
    }
  }
  return findings;
}

/**
 * Campo que PASSA A SER obrigatório na requisição é BREAKING (quem não manda o campo novo passa a
 * ser rejeitado); deixar de ser obrigatório não é reportado — a direção é o INVERSO da resposta, e é
 * a própria lei que a inverte (acrescentar é compatível na resposta, mas obrigar é que quebra na
 * requisição). Mesma guarda de rota/método presentes nos dois lados que `compareResponses`.
 */
/** O laco de `campo` isolado do de `compareRequests` — mesma tecnica de
 * `statusFindingsInResponse`, para o aninhamento caber no limiar (04-regras.md §4.7). */
function fieldFindingsInRequest(route, method, beforeRequired, afterRequired) {
  const findings = [];
  for (const field of afterRequired) {
    if (!beforeRequired.has(field)) {
      findings.push({
        kind: 'required-request-field-added',
        message: `${method} "${route}": request field "${field}" is now required — consumers that omit it will be rejected`,
      });
    }
  }
  return findings;
}

function compareRequests(before, after) {
  const findings = [];
  for (const [route, methods] of specOperations(before)) {
    const methodsAfter = specOperations(after).get(route);
    if (methodsAfter === undefined) continue;
    for (const method of methods) {
      if (!methodsAfter.has(method)) continue;
      const beforeRequired = requestRequired(before, route, method) ?? new Set();
      const afterRequired = requestRequired(after, route, method) ?? new Set();
      findings.push(...fieldFindingsInRequest(route, method, beforeRequired, afterRequired));
    }
  }
  return findings;
}

/**
 * O núcleo inteiro. Recebe o texto dos dois lados (qualquer um pode ser `null` — spec ausente
 * naquele lado) e devolve o veredito. NUNCA afirma `compativel: true` sobre um lado que não leu.
 *
 * As quatro formas de "não há o que comparar", em ordem de checagem:
 *   1. os dois `null` — nunca existiu, nada a dizer (trivial, não deveria acontecer na prática).
 *   2. só `antes` é `null` — spec NOVA. Não é breaking, é CRIAÇÃO: não há consumidor antigo para quebrar.
 *   3. só `depois` é `null` — spec REMOVIDA (o módulo pode ou não ter sumido junto; a casca decide a
 *      frase exata, o núcleo só sabe que sumiu). SEMPRE breaking: quem consumia perdeu o contrato.
 *   4. qualquer um dos dois é ILEGÍVEL (`failedReads` não-vazio) — CEGUEIRA, nunca "compatível".
 */
export function compareContracts(yamlBefore, yamlAfter) {
  if (yamlBefore === null && yamlAfter === null) {
    return { status: 'new-contract', compatible: true, findings: [] };
  }
  if (yamlBefore === null) {
    return { status: 'new-contract', compatible: true, findings: [] };
  }
  if (yamlAfter === null) {
    return {
      status: 'removed',
      compatible: false,
      findings: [{ kind: 'removed-spec', message: 'contract/openapi.yaml existed in the baseline and was removed — consumers lost the contract' }],
    };
  }

  const failuresBefore = failedReads(yamlBefore);
  const failuresAfter = failedReads(yamlAfter);
  if (failuresBefore.length > 0 || failuresAfter.length > 0) {
    return {
      status: 'unreadable',
      compatible: false,
      findings: [
        ...failuresBefore.map((section) => ({ kind: 'unreadable', message: `baseline: section "${section}:" cannot be read — compatibility cannot be determined` })),
        ...failuresAfter.map((section) => ({ kind: 'unreadable', message: `current: section "${section}:" cannot be read — compatibility cannot be determined` })),
      ],
    };
  }

  const findings = [
    ...compareRoutes(yamlBefore, yamlAfter),
    ...compareServer(yamlBefore, yamlAfter),
    ...compareResponses(yamlBefore, yamlAfter),
    ...compareRequests(yamlBefore, yamlAfter),
  ];
  return { status: 'compared', compatible: findings.length === 0, findings };
}

// ================================================================================================
// CASCA — toca disco e git. `git()` é o ÚNICO ponto que roda `git` de verdade.
// ================================================================================================

const HERE = dirname(fileURLToPath(import.meta.url));

/** Mesmo raciocínio de `gate/context.mjs:findRootProjeto` — não importado: só `spec.mjs` e
 * `affected.mjs` estão liberados para import neste escopo, `context.mjs` não. */
function findRoot(start) {
  let current = start;
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = join(current, '..');
    if (relative(parent, current) === '') break;
    current = parent;
  }
  return start;
}

const ROOT = findRoot(HERE);

/** ÚNICO ponto que roda `git` de verdade — array de argumentos, NUNCA `shell: true` (lição da etapa anterior). */
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/**
 * O hash da ÁRVORE VAZIA — constante do Git, válida em todo repositório sem precisar ser alcançável
 * por commit nenhum. Comparar contra ela faz todo `contract/openapi.yaml` existente contar como
 * "novo, sem baseline" — nunca "não verificado" (mesmo raciocínio de `ci-security.mjs`).
 */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** A ref existe? Verificado ANTES de qualquer comparação — ref hostil/inválida REPROVA, nunca vira
 * "nada mudou". A árvore vazia é a única exceção: não é commit, e é sempre válida por definição. */
function validRef(ref) {
  if (ref === EMPTY_TREE) return true;
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Repositório com um commit só não tem `HEAD~1` — sem isto, o primeiro pipeline de todo repositório
 * Sarak nasceria vermelho aqui. `--since` explícito nunca é substituído em silêncio: só o DEFAULT cai
 * para a árvore vazia quando não resolve.
 */
function effectiveRef(since) {
  if (since !== null) return since;
  return validRef(DEFAULT_REF) ? DEFAULT_REF : EMPTY_TREE;
}

/** Conteúdo de um arquivo NAQUELE ref — `null` se não existir ali (git falha por design, não exceção nossa). */
function readInRef(ref, relativePath) {
  const target = relativePath.split('\\').join('/');
  try {
    return git(['show', `${ref}:${target}`]);
  } catch {
    return null;
  }
}

function readCurrent(id) {
  const path = join(ROOT, 'modules', id, 'contract', 'openapi.yaml');
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Os ids de módulo cujo `contract/openapi.yaml` mudou (criado, editado ou apagado) desde a ref. */
function modulesWithChangedContract(ref) {
  const pattern = /^modules\/([^/]+)\/contract\/openapi\.yaml$/;
  const changed = git(['diff', '--name-only', '--no-renames', ref])
    .split(/\r?\n/)
    .map((line) => line.match(pattern))
    .filter((m) => m !== null)
    .map((m) => m[1]);
  return [...new Set(changed)];
}

/** Quem DECLARA `consumes` apontando para `id`, no grafo ATUAL — inclusive se `id` não existe mais
 * (a declaração continua no manifesto de quem consome, ainda que o dono tenha sumido). Mesma
 * pergunta que `consumes-contract` faz no gate ("reportado no consumidor"), UM salto só — não
 * transitivo como `affected.mjs:computeAffected` (que responde "o que precisa reverificar", uma
 * pergunta mais ampla que "quem depende DIRETO deste contrato"). */
function directConsumers(graph, id) {
  const consumers = [];
  for (const [otherId, { consumes }] of graph.modules) {
    if (consumes.includes(id)) consumers.push(otherId);
  }
  return consumers.sort();
}

function compareModule(ref, graph, id) {
  const before = readInRef(ref, join('modules', id, 'contract', 'openapi.yaml'));
  const after = readCurrent(id);
  const result = compareContracts(before, after);
  const consumers = result.compatible ? [] : directConsumers(graph, id);
  const moduleStillExists = existsSync(join(ROOT, 'modules', id));
  return { module: id, moduleStillExists, consumers, ...result };
}

// ================================================================================================
// SAÍDA
// ================================================================================================

function printHuman(ref, results) {
  const refLabel = ref === EMPTY_TREE ? `${ref} (empty tree — no HEAD~1, new repository)` : ref;
  process.stdout.write(`contract-compatible: comparing with --since ${refLabel}\n`);
  if (results.length === 0) {
    process.stdout.write('  no contract/openapi.yaml changed in this area\n');
    return;
  }
  for (const r of results) {
    if (r.status === 'new-contract') {
      process.stdout.write(`  ${r.module}: new contract (no baseline) — there is nothing to break\n`);
      continue;
    }
    const mark = r.compatible ? 'ok   ' : 'FAIL ';
    const qualifier = r.status === 'removed'
      ? (r.moduleStillExists ? ' (module remains; its contract is gone)' : ' (module was removed)')
      : '';
    process.stdout.write(`  ${mark} ${r.module}${qualifier}\n`);
    for (const finding of r.findings) process.stdout.write(`        [${finding.kind}] ${finding.message}\n`);
    if (r.consumers.length > 0) {
      process.stdout.write(`        affected consumers: ${r.consumers.join(', ')}\n`);
    } else if (!r.compatible) {
      process.stdout.write('        affected consumers: no current module declares "consumes" for this contract\n');
    }
  }
}

function printJson(ref, results) {
  const errors = results.filter((r) => !r.compatible).length;
  process.stdout.write(`${JSON.stringify({ since: ref, modules: results, errors }, null, 2)}\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

function readOptions(argv) {
  const options = { since: null, module: null, json: false, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--selftest') { options.selfTest = true; continue; }
    if (argv[i] === '--json') { options.json = true; continue; }
    if (argv[i] === '--since') { options.since = argv[i + 1] ?? null; i += 1; continue; }
    if (!argv[i].startsWith('--')) { options.module = argv[i]; continue; }
  }
  return options;
}

/**
 * `HEAD~1`, não `@{u}`. Este é passo de CI (ver cabeçalho): checkout de CI é frequentemente HEAD
 * destacado, sem upstream configurado — `@{u}` (a escolha certa em `verify-commit.mjs:pre-push`,
 * onde há sempre um clone de dev com upstream) falharia na maioria dos provedores por padrão.
 * `HEAD~1` sempre existe em qualquer histórico com 2+ commits e não depende de configuração de rede
 * nem de branch remota — é o "compare com o commit anterior" que faz sentido tanto em squash-merge
 * (1 commit por PR) quanto rodando localmente por curiosidade.
 */
const DEFAULT_REF = 'HEAD~1';

function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();

  const ref = effectiveRef(options.since);
  if (!validRef(ref)) {
    process.stderr.write(`Error: invalid or missing ref "${ref}" — compatibility cannot be determined without a baseline\n`);
    return 1;
  }

  const graph = buildGraph(ROOT);
  const ids = options.module !== null ? [options.module] : modulesWithChangedContract(ref);
  const results = ids.map((id) => compareModule(ref, graph, id));

  if (options.json) printJson(ref, results);
  else printHuman(ref, results);

  const failed = results.some((r) => !r.compatible);
  if (!options.json) {
    process.stdout.write(`\ncontract-compatible: ${failed ? 'FAILED' : 'OK'}\n`);
  }
  return failed ? 1 : 0;
}

// ================================================================================================
// AUTOTESTE — o núcleo contra fixtures em memória. Lei 6: sem prova por máquina, não entra.
// ================================================================================================

const BASE = `
openapi: 3.1.0
servers:
  - url: /api/v1/orders
paths:
  /entries:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  items: { type: array }
                  total: { type: integer }
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NewEntry' }
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Entry' }
  /entries/{hash}:
    get:
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Entry' }
components:
  schemas:
    Entry:
      type: object
      properties:
        hash: { type: string }
        title: { type: string }
    NewEntry:
      type: object
      required: [title]
      properties:
        title: { type: string }
`;

/** Fixture ILEGÍVEL de propósito — `paths:` em *flow style*, que `spec.mjs:specOperations` não alcança. */
const UNREADABLE = 'openapi: 3.1.0\npaths: {"/x": {"get": {}}}\n';

function selfTestCases() {
  return [
    {
      name: 'removed route: BREAKING',
      before: BASE,
      after: BASE.replace(/ {2}\/entries\/\{hash\}:[\s\S]*?(?=\ncomponents:)/, ''),
      expected: { compatible: false, kind: 'removed-route' },
    },
    {
      name: 'added route: compatible',
      before: BASE,
      after: `${BASE.replace('components:', '  /status:\n    get:\n      responses:\n        \'200\':\n          content: {}\ncomponents:')}`,
      expected: { compatible: true },
    },
    {
      name: 'method removed from a retained route: BREAKING',
      before: BASE,
      after: BASE.replace(/ {4}post:[\s\S]*?(?=\n {2}\/entries\/)/, ''),
      expected: { compatible: false, kind: 'removed-method' },
    },
    {
      name: 'response field removed: BREAKING',
      before: BASE,
      after: BASE.replace('                  total: { type: integer }\n', ''),
      expected: { compatible: false, kind: 'removed-response-field' },
    },
    {
      name: 'response field added: compatible',
      before: BASE,
      after: BASE.replace('                  total: { type: integer }', '                  total: { type: integer }\n                  page: { type: integer }'),
      expected: { compatible: true },
    },
    {
      name: 'required request field added: BREAKING',
      before: BASE,
      after: BASE.replace('required: [title]', 'required: [title, status]'),
      expected: { compatible: false, kind: 'required-request-field-added' },
    },
    {
      name: 'required request field removed: compatible',
      before: BASE.replace('required: [title]', 'required: [title, status]'),
      after: BASE,
      expected: { compatible: true },
    },
    {
      name: 'servers[0].url changed: BREAKING',
      before: BASE,
      after: BASE.replace('/api/v1/orders', '/api/v1/orders-v2'),
      expected: { compatible: false, kind: 'changed-server' },
    },
    {
      name: 'unreadable before spec: fails and names the section, never "compatible"',
      before: UNREADABLE,
      after: BASE,
      expected: { compatible: false, status: 'unreadable' },
    },
    {
      name: 'unreadable after spec: fails and names the section, never "compatible"',
      before: BASE,
      after: UNREADABLE,
      expected: { compatible: false, status: 'unreadable' },
    },
    {
      name: 'new spec without a baseline does NOT fail (creation, not breaking)',
      before: null,
      after: BASE,
      expected: { compatible: true, status: 'new-contract' },
    },
    {
      name: 'removed spec: BREAKING',
      before: BASE,
      after: null,
      expected: { compatible: false, status: 'removed' },
    },
  ];
}

function resultMatches(result, expected) {
  if (result.compatible !== expected.compatible) return false;
  if (expected.status !== undefined && result.status !== expected.status) return false;
  if (expected.kind !== undefined && !result.findings.some((a) => a.kind === expected.kind)) return false;
  return true;
}

function runSelfTest() {
  let failures = 0;
  for (const testCase of selfTestCases()) {
    const result = compareContracts(testCase.before, testCase.after);
    const ok = resultMatches(result, testCase.expected);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) {
      failures += 1;
      process.stdout.write(`       expected: ${JSON.stringify(testCase.expected)}\n`);
      process.stdout.write(`       received: compatible=${result.compatible} status=${result.status} findings=${JSON.stringify(result.findings)}\n`);
    }
  }
  const total = selfTestCases().length;
  process.stdout.write(`\nself-test: ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
