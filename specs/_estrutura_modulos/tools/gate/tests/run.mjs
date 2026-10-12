#!/usr/bin/env node
/**
 * run.mjs — o autoteste do gate. Lei dona: specs/arquitetura/04-regras.md §7.3
 *
 *   node tools/gate/tests/run.mjs [--binding typescript]
 *
 * Duas afirmações, e o gate só está saudável se as duas valerem:
 *   1. o molde CONFORME produz ZERO erro — senão o gate acusa o que não deve;
 *   2. cada mutação de `cases.mjs` produz o id esperado e **NENHUM id não declarado** — senão ou a
 *      regra não cobra nada, ou outra regra passa a acusar onde não devia.
 *
 * A mutação que cria um segundo defeito de verdade declara o co-achado em `tambem: [...]`. Declarar
 * é permitido; surpreender, não. Extra fora da lista REPROVA, e é assim que uma regra nova que
 * comece a acusar em cima de caso alheio derruba o autoteste em vez de entrar calada.
 *
 * `tambem` é lido como TETO, não como obrigação: o co-achado pode não aparecer num binding cujo
 * molde não tem a peça (o `web/` só existe em TS e JS). Exigir presença tornaria a lista falsa em
 * dois dos três bindings.
 *
 * Caso que muta arquivo de código declara um ALVO LÓGICO (`rotas`, `mappers`) e o trecho por
 * família de sintaxe (`{ js, py }`) — ver `ALVOS` e `SYNTAX_FAMILY` abaixo. É o que permite a
 * mesma regra ser provada nos três bindings, e não só naquele em que o caso foi escrito. Onde o
 * conteúdo é agnóstico (manifesto, `config/*.json`, `openapi.yaml`, SQL), nada disso é preciso.
 *
 * A segunda é a que importa mais: uma regra quebrada passa despercebida para sempre, porque
 * "verde" é indistinguível de "não verificou". Este runner torna as duas coisas distinguíveis.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadContext } from '../context.mjs';
import { analyze, serializeFinding } from '../engine.mjs';
import { outputOf } from '../../generate-lint-config.mjs';
import { CASES } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = join(HERE, '..', '..', '..');

/**
 * Alvos LÓGICOS — o caso nomeia o PAPEL do arquivo, e o harness resolve o caminho de cada binding.
 *
 * Sem isto, o caso precisava fixar `api/src/routes/index.ts` e só rodava em TypeScript: a regra
 * valia nos três bindings e a prova dela, num só.
 */
const TARGETS = {
  routes: {
    typescript: 'api/src/routes/index.ts',
    javascript: 'api/src/routes/index.js',
    python: 'api/src/routes.py',
  },
  // Sobe da pasta do módulo para a raiz do PROJETO: é lá que moram os alvos das regras de escopo
  // `root` (`verification-declared`, `derived-lint`, `root-manifest`, `root-env-declared`), e
  // não dentro do módulo.
  rootLint: {
    typescript: '../../eslint.config.js',
    javascript: '../../eslint.config.js',
    python: '../../.ruff.toml',
  },
  // A raiz de composição — o arquivo da FIAÇÃO onde a chave de ambiente da raiz é lida de verdade.
  compositionRoot: {
    typescript: '../../src/composition.ts',
    javascript: '../../src/composition.js',
    python: '../../src/composition.py',
  },
  // As outras duas pontas do diagrama de dependência. O caso muta o arquivo REAL da fiação, e não
  // um arquivo inventado ao lado: é o mesmo arquivo que o molde conforme mantém limpo, e é o que
  // torna o par "conforme passa / violado acusa" uma afirmação sobre a MESMA peça.
  rootAdapter: {
    typescript: '../../adapters/memory/index.ts',
    javascript: '../../adapters/memory/index.js',
    python: '../../adapters/memory/__init__.py',
  },
  rootPorts: {
    typescript: '../../packages/ports/index.ts',
    javascript: '../../packages/ports/index.js',
    python: '../../packages/ports/__init__.py',
  },
  // A imagem de front só existe nos bindings que têm `web/` — o Python nasce sem, e o caso que a remove
  // vira SEM COBERTURA ali em vez de apagar o nada e cobrar um achado impossível.
  frontDockerfile: {
    typescript: '../../front.Dockerfile',
    javascript: '../../front.Dockerfile',
  },
  mappers: {
    typescript: 'api/src/mappers/index.ts',
    javascript: 'api/src/mappers/index.js',
    python: 'api/src/mappers.py',
  },
  /**
   * A pasta de teste de tela. **Não declarada para o Python de propósito**, e o silêncio é o ponto:
   * aquele molde nasce sem `web/` e com `webPath: null`, então `web-tests` é vacuamente satisfeita
   * ali. Um caso que apenas apagasse a pasta (`removerPasta` usa `force`) não acharia nada no Python
   * e REPROVARIA por "no findings" — culpando a regra por um molde que não tem a peça. Sem o alvo,
   * `removerPastaEm` estoura `SEM_COBERTURA` com o motivo, que é a verdade: ausência de cobertura,
   * nunca aprovação.
   */
  webTestsDir: {
    typescript: 'tests/web',
    javascript: 'tests/web',
  },
};

/**
 * Famílias de SINTAXE — o segundo eixo, e o que faz o mapa de caminho não ser meia solução.
 *
 * Portar só o caminho seria pior que a lacuna: o caso deixaria de PULAR e passaria a rodar com um
 * trecho que a linguagem do molde não reconhece, a regra não acharia nada, e o autoteste anunciaria
 * cobertura onde não há — enquanto SEM COBERTURA, ao menos, se declara. TS e JS registram rota e
 * projetam saída do mesmo jeito, então compartilham o trecho `js`; Python tem o dele.
 */
const SYNTAX_FAMILY = { typescript: 'js', javascript: 'js', python: 'py' };

/**
 * Falta de trecho ou de alvo NUNCA vira aprovação silenciosa: vira SEM COBERTURA declarada, com o
 * motivo, do mesmo jeito que o `ENOENT` de um caso escrito para o molde de outro binding.
 */
function withoutCoverage(reason) {
  const cause = /** @type {Error & {code: string}} */ (new Error(reason));
  cause.code = 'SEM_COBERTURA';
  return cause;
}

/**
 * Irmã de `withoutCoverage`: a agulha de `substituir` não foi achada no arquivo. Diferente de
 * SEM_COBERTURA (o caso não se aplica a este binding), aqui o caso SE APLICA e a mutação falhou —
 * é reprovação do CASO, não ausência de cobertura, e por isso `checkCase` a trata como `FALHA`
 * comum: reprova só este caso, os demais continuam medidos.
 *
 * Quando a causa é DETECTÁVEL — agulha com `\n` literal contra um arquivo em CRLF — a mensagem
 * nomeia a causa provável em vez de deixar quem lê decifrar os sintomas de novo.
 */
function invalidMutation(rel, from, content) {
  const base = `replace: text not found in ${rel}: ${JSON.stringify(from)}`;
  const probablyEol = from.includes('\n') && content.includes('\r\n');
  const cause = /** @type {Error & {code: string}} */ (new Error(probablyEol
    ? `${base} — file uses CRLF while the search string uses LF; renormalize (git add --renormalize .)`
    : base));
  cause.code = 'MUTACAO_INVALIDA';
  return cause;
}

/** Trecho agnóstico entra como string; onde a sintaxe importa, como `{ js, py }`. */
function snippetOf(snippets, binding) {
  if (typeof snippets === 'string') return snippets;
  return snippets[binding] ?? snippets[SYNTAX_FAMILY[binding]] ?? null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Lê um JSON, aplica `transformar` e regrava — o núcleo comum de `manifesto`/`manifestoRaiz`/
 * `config` em `operacoes`, extraído para tirar `operacoes` do limiar de linhas sem mudar nada do
 * que cada operação faz. */
function transformJson(path, transform) {
  writeJson(path, transform(readJson(path)));
}

/** Operações que um caso pode aplicar sobre a cópia do molde. */
function operations(root, binding) {
  const add = (rel, content) => {
    const path = join(root, rel);
    writeFileSync(path, readFileSync(path, 'utf8') + content, 'utf8');
  };
  return {
    writeOut: (rel, content) => writeFileSync(join(root, rel), content, 'utf8'),
    add,
    /**
     * Acrescenta num alvo LÓGICO, resolvendo caminho e sintaxe pelo binding. É a operação que
     * torna um caso portável nos dois eixos de uma vez.
     */
    addIn: (target, snippets) => {
      const rel = TARGETS[target]?.[binding];
      if (rel === undefined) throw withoutCoverage(`binding "${binding}" does not define target "${target}"`);
      const snippet = snippetOf(snippets, binding);
      if (snippet === null) throw withoutCoverage(`case has no "${target}" snippet for "${binding}" syntax`);
      add(rel, snippet);
    },
    /**
     * `String.replace(agulha)` que nao acha devolve a string IGUAL, em silencio — a mutacao vira
     * noop e o caso reporta "no findings", apontando a REGRA quando o defeito esta na MUTACAO
     * Lanca `MUTACAO_INVALIDA` em vez de aceitar noop: quem escreve um caso
     * novo com agulha errada (typo, `\n` que o molde nao tem mais) descobre no proprio `substituir`,
     * nao tres camadas depois — e so ESTE caso reprova, os outros continuam medidos.
     */
    substitute: (rel, from, to) => {
      const path = join(root, rel);
      const content = readFileSync(path, 'utf8');
      if (!content.includes(from)) throw invalidMutation(rel, from, content);
      writeFileSync(path, content.replace(from, to), 'utf8');
    },
    remove: (rel) => rmSync(join(root, rel), { force: true }),
    removeDir: (rel) => rmSync(join(root, rel), { recursive: true, force: true }),
    /**
     * Remove uma pasta por alvo LÓGICO. Diferente de `removerPasta`, ela EXIGE que o binding declare
     * o alvo: onde o molde não tem a peça, o caso vira SEM COBERTURA declarada em vez de apagar o
     * nada e depois cobrar da regra um achado que não poderia existir.
     */
    removeDirIn: (target) => {
      const rel = TARGETS[target]?.[binding];
      if (rel === undefined) throw withoutCoverage(`binding "${binding}" does not define target "${target}"`);
      rmSync(join(root, rel), { recursive: true, force: true });
    },
    manifest: (transform) => transformJson(join(root, 'module.json'), transform),
    /** O manifesto da RAIZ (`project.json`), que fica dois níveis acima da pasta do módulo. */
    rootManifest: (transform) => transformJson(join(root, '..', '..', 'project.json'), transform),
    config: (topic, transform) => transformJson(join(root, 'config', `${topic}.json`), transform),
  };
}

/**
 * A RAIZ do projeto temporário — `config/` e a config de lint gerada, como `create-project.mjs` as
 * instala.
 *
 * O fixture já tem `modules/`, e por isso é um projeto aos olhos do gate; só que um projeto
 * INCOMPLETO, sem nada do que a raiz carrega. `verification-declared` e `derived-lint` olham para
 * fora do módulo, e acusariam em TODO caso um fixture que ficasse assim incompleto.
 * O conserto é o fixture ficar fiel ao projeto real, nunca a regra deixar de cobrar.
 */
function buildProjectRoot(temporary, binding) {
  const root = join(TEMPLATE_ROOT, 'bindings', binding, 'root');
  cpSync(join(root, 'config'), join(temporary, 'config'), { recursive: true });
  const { name } = outputOf(binding);
  cpSync(join(root, name), join(temporary, name));
  // O `.gitignore` é da raiz e `gitignore-secret` o lê: sem ele aqui, a regra acusaria em TODO
  // caso — de novo o fixture sendo um projeto incompleto, não a regra estando errada.
  cpSync(join(root, '.gitignore'), join(temporary, '.gitignore'));
  // O manifesto da raiz, pelo mesmo motivo: `root-manifest` o exige em todo projeto.
  cpSync(join(root, 'project.json'), join(temporary, 'project.json'));
  // O hook de pre-commit, pelo mesmo motivo: `pre-commit-installed` o exige em todo projeto, e sem
  // copiá-lo aqui o fixture voltaria a ser um projeto incompleto — a mesma classe de defeito que as
  // duas linhas acima já corrigiram para `.gitignore` e `project.json`.
  cpSync(join(root, '.githooks'), join(temporary, '.githooks'), { recursive: true });
  // Os arquivos de container, pelo mesmo motivo: `container-present` e `compose-variables-declared` os
  // exigem em todo projeto. O front só entra onde o binding o tem (o Python nasce sem `web/`).
  for (const name of ['Dockerfile', '.dockerignore', 'compose.yml', 'front.Dockerfile', 'deploy']) {
    if (existsSync(join(root, name))) cpSync(join(root, name), join(temporary, name), { recursive: true });
  }
  // A FIAÇÃO. Ela entra por duas razões, e a segunda é a que importa mais: `root-env-declared`
  // precisa de código de raiz para ter o que ler, E este é o único lugar onde se prova, caso a
  // caso, que carregar o código da raiz NÃO fez regra de módulo nenhuma passar a enxergá-lo.
  for (const dir of ['adapters', 'src', 'packages']) {
    cpSync(join(root, dir), join(temporary, dir), { recursive: true });
  }
}

/** Vizinho mínimo, para as regras globais (import lateral, tabela alheia, ciclo). */
function createNeighbor(modulesDir, template, consumes) {
  const root = join(modulesDir, 'vizinho');
  cpSync(template, root, { recursive: true });
  const path = join(root, 'module.json');
  const manifest = readJson(path);
  manifest.id = 'vizinho';
  manifest.basePath = '/api/v1/vizinho';
  manifest.webPath = '/vizinho';
  manifest.data = { schema: 'escopo', prefix: 'vizinho_', tables: ['vizinho_metadata'] };
  manifest.permissions = ['vizinho:read', 'vizinho:write'];
  // `/summary` e obrigatoria em todo modulo: o vizinho fecha o ciclo sem violar `consumes-contract`.
  manifest.consumes = consumes ? [{ module: 'molde', contract: 'GET /summary', why: 'ciclo' }] : [];
  writeJson(path, manifest);
  return root;
}

/** Monta um projeto temporário com o molde (e opcionalmente um vizinho), roda o gate e limpa. */
function runCase(binding, testCase) {
  const temporary = mkdtempSync(join(tmpdir(), 'gate-teste-'));
  try {
    const modules = join(temporary, 'modules');
    const template = join(TEMPLATE_ROOT, 'bindings', binding, '_template');
    const target = join(modules, '_template');
    cpSync(template, target, { recursive: true });
    buildProjectRoot(temporary, binding);

    if (testCase?.mutate !== undefined) testCase.mutate(operations(target, binding));

    const dirs = [target];
    if (testCase?.requiresNeighbor === true) dirs.push(createNeighbor(modules, template, testCase.neighborConsumes === true));

    const contexts = dirs.map((p) => loadContext(p, temporary));
    const targetCtx = contexts.filter((c) => c.raiz === target);
    return analyze(contexts, targetCtx, {});
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function checkConformance(binding) {
  const errors = runCase(binding, null).filter((a) => a.nivel === 'erro');
  if (errors.length === 0) return { ok: true, label: 'template conformance produces zero errors' };
  return {
    ok: false,
    label: 'template conformance produces zero errors',
    detail: errors.map((e) => `[${e.regra}] ${e.mensagem}`).join('\n      '),
  };
}

/**
 * O caso passa a poder afirmar mais que o id — `{ arquivo?, contem?, naoContem?, vezes? }`, os quatro
 * opcionais. Sem eles, `null` sempre: nenhum caso existente muda de comportamento. `naoContem` é a
 * afirmação NEGATIVA: no findings da regra pode trazer o texto — é o que prova que o achado do
 * caso é o certo e que a regra não acusou também o que estava conforme.
 *
 * O harness hoje só compara CONJUNTO DE IDS: se uma regra acusasse a linha errada, ou o arquivo
 * errado, ou o número errado de vezes, ela sairia sob o MESMO id e o autoteste passaria do mesmo
 * jeito — "verde" indistinguível de "verificou a coisa certa". `arquivo`/`contem` restringem QUAL
 * achado, entre os de `caso.regra`, conta; `vezes` afirma QUANTOS — sem ele, um só já basta (a
 * mesma tolerância de hoje).
 */
function checkFineAssertion(testCase, findings) {
  const withoutAssertion = testCase.arquivo === undefined && testCase.contains === undefined
    && testCase.notContains === undefined && testCase.times === undefined;
  if (withoutAssertion) return null;

  const ruleFindings = findings.filter((a) => a.regra === testCase.regra);
  const matched = ruleFindings.filter((a) => (
    (testCase.arquivo === undefined || a.mensagem.includes(testCase.arquivo))
    && (testCase.contains === undefined || a.mensagem.includes(testCase.contains))
  ));

  if (matched.length === 0) {
    const missed = [
      testCase.arquivo !== undefined ? `file "${testCase.arquivo}"` : null,
      testCase.contains !== undefined ? `text "${testCase.contains}"` : null,
    ].filter((x) => x !== null).join(' and ');
    return `no finding for "${testCase.regra}" matches ${missed} — rule findings: `
      + (ruleFindings.map((a) => a.mensagem).join(' | ') || '(none)');
  }
  const forbidden = ruleFindings.find((a) => testCase.notContains !== undefined && a.mensagem.includes(testCase.notContains));
  if (forbidden !== undefined) {
    return `finding for "${testCase.regra}" contains forbidden text "${testCase.notContains}": ${forbidden.mensagem}`;
  }
  if (testCase.times !== undefined && matched.length !== testCase.times) {
    return `expected ${testCase.times} finding(s) matching file/text; received ${matched.length}: `
      + matched.map((a) => a.mensagem).join(' | ');
  }
  return null;
}

function checkCase(binding, testCase) {
  const label = `${testCase.regra} — ${testCase.description}`;
  let findings;
  try {
    findings = runCase(binding, testCase);
  } catch (cause) {
    // O caso mexe num arquivo que este binding nao tem (ex.: `web/` num molde Python), ou nao
    // declara trecho para a sintaxe dele. Isso e AUSENCIA DE COBERTURA, nao aprovacao — por isso
    // conta separado, aparece na saida e diz o MOTIVO, para lacuna nao se confundir com conformidade.
    if (cause?.code === 'ENOENT') {
      return { skipped: true, label, motivo: 'this binding template does not contain the file mutated by the case' };
    }
    if (cause?.code === 'SEM_COBERTURA') return { skipped: true, label, motivo: cause.message };
    // A agulha de `substituir` nao foi achada: o CASO se aplica a este binding e a mutacao falhou —
    // reprova so ele, no vocabulario comum de FALHA, sem cegar os demais.
    if (cause?.code === 'MUTACAO_INVALIDA') return { ok: false, label, detail: cause.message };
    throw cause;
  }
  const ids = new Set(findings.map((a) => a.regra));
  const allowed = new Set([testCase.regra, ...(testCase.also ?? [])]);
  const extras = [...ids].filter((id) => !allowed.has(id));

  if (!ids.has(testCase.regra)) {
    return {
      ok: false,
      label,
      detail: ids.size === 0 ? 'no findings' : `reported: ${[...ids].join(', ')}`,
    };
  }
  if (extras.length > 0) {
    return {
      ok: false,
      label,
      detail: `undeclared id: ${extras.join(', ')} — if this co-finding is valid, declare it in `
        + '`also: [...]`; otherwise, fix the case or the rule',
    };
  }

  const withoutFineAssertion = checkFineAssertion(testCase, findings);
  if (withoutFineAssertion !== null) return { ok: false, label, detail: withoutFineAssertion };

  return { ok: true, label };
}

function main() {
  const publicFinding = serializeFinding({
    modulo: 'orders',
    regra: 'manifest',
    nivel: 'aviso',
    mensagem: 'example',
  });
  const expectedPublicFinding = {
    module: 'orders',
    rule: 'manifest',
    severity: 'warning',
    message: 'example',
  };
  if (JSON.stringify(publicFinding) !== JSON.stringify(expectedPublicFinding)) {
    process.stderr.write('Public gate JSON contract has changed unexpectedly.\n');
    return 1;
  }

  const args = process.argv.slice(2);
  const index = args.indexOf('--binding');
  const binding = index === -1 ? 'typescript' : args[index + 1];

  const results = [checkConformance(binding), ...CASES.map((testCase) => checkCase(binding, testCase))];
  const failures = results.filter((r) => r.ok !== true && r.skipped !== true);
  const skipped = results.filter((r) => r.skipped === true);

  for (const result of results) {
    const mark = result.ok === true ? 'ok   ' : (result.skipped === true ? 'skip ' : 'FAIL');
    process.stdout.write(`  ${mark} ${result.label}\n`);
    if (result.skipped === true) process.stdout.write(`       NO COVERAGE: ${result.motivo}\n`);
    if (result.ok !== true && result.skipped !== true) {
      process.stdout.write(`       ${result.detail}\n`);
    }
  }

  const executed = results.length - skipped.length;
  const covered = new Set(CASES.map((c) => c.regra));
  process.stdout.write(`\nbinding ${binding}: ${executed - failures.length}/${executed} passed`);
  if (skipped.length > 0) {
    process.stdout.write(`, ${skipped.length} NO COVERAGE cases for another binding`);
  }
  process.stdout.write(` — ${covered.size} rules with test cases\n`);
  return failures.length > 0 ? 1 : 0;
}

process.exit(main());
