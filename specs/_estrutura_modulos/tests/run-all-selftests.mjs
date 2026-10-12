#!/usr/bin/env node
/**
 * run-all-selftests.mjs — roda todo `--selftest` registrado no template e na base, e reprova se
 * achar um `--selftest` fora do REGISTRO: nada aqui roda `--selftest` de ninguém automaticamente
 * por conta própria, e um `--selftest` que nenhum CI, hook ou script invoca é indistinguível de não
 * ter `--selftest` nenhum — e MAIS caro: ele existe, alguém confiou nele, e ninguém percebe quando
 * ele parar de significar algo.
 *
 *   node tests/run-all-selftests.mjs             roda o REGISTRO inteiro, exige 0 falhas
 *   node tests/run-all-selftests.mjs --selftest  prova o núcleo (descoberta, comparação) com
 *                                                  fixtures em memória
 *
 * NÃO é uma lista à mão que apodrece: a CASCA VARRE o corpus atrás do padrão `--selftest` em
 * posição de comparação de CLI (não qualquer menção em prosa/comentário) e compara contra o
 * REGISTRO abaixo — arquivo achado E não registrado é `ORFAO` e REPROVA sozinho, nomeando o
 * arquivo, antes mesmo de rodar um teste. O artifact (o REGISTRO) tem de ficar MENOR ou igual ao
 * que a varredura acha, nunca o contrário sem alguém decidir.
 *
 * Cobre `tools/`, `tests/`, `bindings/<binding>/root/` e `skills/<skill>/scripts/`: ferramenta de quem
 * MANTÉM a base, nunca de um projeto gerado — um `--selftest` de skill que ninguém roda apodrece
 * do mesmo jeito que um de `tools/`, e é o mesmo defeito que este arquivo existe para impedir.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TEMPLATE_ROOT = join(HERE, '..');
const BASE_ROOT = join(TEMPLATE_ROOT, '..', '..');
const BINDINGS = ['typescript', 'javascript', 'python'];

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha até a marca "CASCA" toca `fs` nem processo.
// ================================================================================================

/** Um arquivo SUPORTA `--selftest` quando o texto compara literalmente contra o argv nessa forma
 * — `'--selftest'` (aspas simples ou duplas) seguido de comparação (`===`, `in`, `.includes(`) —
 * ou quando declara a flag via `argparse.add_argument('--selftest', ...)` (o idioma Python
 * equivalente: `add_argument` É o ponto de reconhecimento da flag, mesmo sem comparação direta a
 * `sys.argv` — achado ao varrer `skills/**`, onde os dois scripts baseados em argparse escapavam
 * do padrão pensado para `sys.argv` cru). Não casa menção em docstring solta
 * (`--selftest prova...` sem comparação ao lado). */
const SUPPORT_PATTERN = /(?:===|\.includes\()\s*['"]--selftest['"]|['"]--selftest['"]\s*(?:===|in\b)|add_argument\(\s*['"]--selftest['"]|['"]--selftest['"]\s*:/;

export function supportsSelfTest(text) {
  return SUPPORT_PATTERN.test(text);
}

/** `registrados` que a varredura não achou mais: RESOLVIDO (arquivo sumiu ou perdeu `--selftest`),
 * informativo. `achados` sem entrada em `registrados`: ORFAO, reprova sozinho. Comparação de dois
 * conjuntos por chave — chave aqui é só o caminho relativo (um arquivo, um comando). */
export function compareRegistry(findings, registered) {
  const findingsSet = new Set(findings);
  const registeredSet = new Set(registered.map((r) => r.caminho));
  return {
    orphans: findings.filter((c) => !registeredSet.has(c)),
    obsolete: registered.filter((r) => !findingsSet.has(r.caminho)),
  };
}

// ================================================================================================
// CASCA — toca disco e processo.
// ================================================================================================

const IGNORE = new Set(['node_modules', '.git', '__pycache__', '.venv', 'dist', 'generated', '_template']);

function filesUnder(dir, extensions) {
  if (!existsSync(dir)) return [];
  const findings = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) findings.push(...filesUnder(path, extensions));
    else if (extensions.some((ext) => entry.name.endsWith(ext))) findings.push(path);
  }
  return findings;
}

/** Onde `--selftest` pode legitimamente morar: `tools/**`, `tests/**` (a própria pasta deste
 * arquivo), `bindings/<binding>/root/**` (os runners que viajam com o projeto —
 * `migrations.{mjs,py}`, o achado do AG), `skills/**` (todo `.mjs`/`.py` da base mora em
 * `skills/<skill>/scripts/`, e a varredura recursiva chega lá sem precisar saber o nome de cada
 * skill) e `hooks/` (a única "garantia determinística" do README — sem varredura aqui, um
 * `--selftest` novo em hook ficava órfão do mesmo jeito que os de `skills/` ficavam antes desta
 * pasta entrar no REGISTRO), e `plugin/` (o `sync_ide.py` ganhou `--selftest` — registrado sem
 * varredura aqui, apareceria como "não achado" em vez de cobrado). NÃO desce em `_template/**`:
 * é conteúdo de MÓDULO gerado, o gate já cobre. */
function scanRoots() {
  const roots = [
    join(TEMPLATE_ROOT, 'tools'),
    join(TEMPLATE_ROOT, 'tests'),
    join(BASE_ROOT, 'skills'),
    join(BASE_ROOT, 'hooks'),
    join(BASE_ROOT, 'plugin'),
  ];
  for (const binding of BINDINGS) roots.push(join(TEMPLATE_ROOT, 'bindings', binding, 'root'));
  return roots;
}

/** Todo caminho (relativo à raiz da BASE, barra normal) sob as raízes de varredura cujo texto
 * suporta `--selftest`, incluindo este runner, que compara os argumentos de CLI no `main()`. */
function filesWithSelfTest() {
  const findings = [];
  for (const root of scanRoots()) {
    for (const path of filesUnder(root, ['.mjs', '.py', '.js', '.ts'])) {
      const text = readFileSync(path, 'utf8');
      if (supportsSelfTest(text)) findings.push(relative(BASE_ROOT, path).split('\\').join('/'));
    }
  }
  return findings.sort();
}

/**
 * O REGISTRO — um runtime por arquivo achado pela varredura (o caminho já é o suficiente: todo
 * arquivo aqui resolve a PRÓPRIA raiz por `import.meta.url`/`__file__`, nunca por `cwd` — rodar por
 * caminho absoluto, de qualquer diretório, é seguro). Cresce só de propósito: um arquivo NOVO com
 * `--selftest` reprova como ÓRFÃO até alguém decidir o runtime dele e acrescentar aqui.
 *
 * `composition.py`/`.js`/`.ts` ficam DE FORA de propósito (declarados, não esquecidos — mesma
 * disciplina de `config/compliance.json`): o `--selftest` de cada um só roda dentro de um projeto
 * INSTANCIADO — `python -m src.composition --selftest` depende do módulo `src`, que não existe
 * solto na base; `composition.js`/`.ts` importam `express` de `node_modules`, que também não existe
 * solto na base (medido: os dois estouram `ERR_MODULE_NOT_FOUND` ao rodar direto daqui). Cobri-los
 * exige um projeto gerado — o passo `create-module` de `selftest:template`, não este runner —
 * registrado como pendência, não escondido.
 */
const REGISTRY = [
  { caminho: 'specs/_estrutura_modulos/tools/affected.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/create-adapter.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/ci-dependencies.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/ci-security.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/contract-compatible.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/package.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/create-module.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/sync-deploy.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/verify-commit.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/verify-map.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/verify-catalog.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/verify-routine.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/template-self-test.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/supervise.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/run-all-selftests.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/typescript/root/scripts/migrations.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/javascript/root/scripts/migrations.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/python/root/scripts/migrations.py', runtime: 'python' },
  { caminho: 'skills/git-verificacao-commit/scripts/gerar_config.py', runtime: 'python' },
  { caminho: 'skills/git-verificacao-commit/scripts/verificar_commit.py', runtime: 'python' },
  { caminho: 'skills/meta-iniciar-repositorio/scripts/comparar_arvore.py', runtime: 'python' },
  { caminho: 'skills/meta-iniciar-repositorio/scripts/init_repo.py', runtime: 'python' },
  { caminho: 'skills/meta-iniciar-repositorio/scripts/carimbo.py', runtime: 'python' },
  { caminho: 'skills/meta-propagar-base/scripts/propagar.py', runtime: 'python' },
  { caminho: 'skills/meta-verificacao-base/scripts/audit_base.py', runtime: 'python' },
  { caminho: 'skills/meta-adequacao-modular/scripts/diagnosticar_terreno.py', runtime: 'python' },
  { caminho: 'skills/code-generalizacao-modulo/scripts/inventariar_origem.py', runtime: 'python' },
  { caminho: 'skills/code-generalizacao-modulo/scripts/verificar_neutralidade.py', runtime: 'python' },
  { caminho: 'skills/code-generalizacao-modulo/scripts/verificar_entregavel.py', runtime: 'python' },
  { caminho: 'skills/cyber-segredos/scripts/scan_segredos.py', runtime: 'python' },
  { caminho: 'skills/spec-revisao/scripts/verificar_paridade.py', runtime: 'python' },
  { caminho: 'skills/padrao-python/scripts/validate.py', runtime: 'python' },
  { caminho: 'skills/padrao-typescript/scripts/validate.mjs', runtime: 'node' },
  { caminho: 'hooks/_lib.js', runtime: 'node' },
  { caminho: 'hooks/padrao-limiares.js', runtime: 'node' },
  { caminho: 'hooks/padrao-format.js', runtime: 'node' },
  { caminho: 'skills/spec-panorama/scripts/gerar_resumo.py', runtime: 'python' },
  { caminho: 'skills/deploy-docker-monolito/scripts/validar_monolito.py', runtime: 'python' },
  { caminho: 'plugin/sync_ide.py', runtime: 'python' },
];

/**
 * PENDÊNCIA DECLARADA (não escondida): scripts e hooks que AINDA não têm `--selftest`, listados
 * aqui de propósito para não regredir a decisão sem alguém decidir de novo.
 *
 * 13 scripts de skill sem `--selftest`: `code-documentacao/scripts/auditar_docs.py`,
 * `code-assinatura/scripts/scan_assinaturas.py` (os dois mudaram de pasta numa campanha de
 * decomposição de `code-entrega` — endereço atualizado, nenhum ganhou `--selftest`),
 * `code-limpeza-projeto/scripts/detectar_lixo.py`, `cyber-codigo/scripts/sast_scan.py`,
 * `cyber-config/scripts/check_headers.py`, `cyber-dependencias/scripts/parse_audit.py`,
 * `deploy-docker-microsservico/scripts/validar_docker.py`, `deploy-vercel/scripts/validar_predeploy.py`,
 * `git-especialista-repositorio/scripts/scan_historico.py`,
 * `git-revisao-diff/scripts/revisar_diff.py`, `meta-create-skill/scripts/scaffold_skill.py`,
 * `otimizacao-nivel-1/scripts/auditar_assets.py`, `site-seo/scripts/auditar_seo.py` — erram para
 * MENOS gravidade (relatório incompleto), nunca para aprovação falsa, e por isso ficam de fora de
 * propósito nesta rodada. (`meta-verificacao-base/scripts/{limiares,ponteiros,nomenclatura,
 * proatividade,secoes,contagens,paridade,manifestos,verify-map}.py` NÃO entram nesta lista: são módulos importados por
 * `audit_base.py`, provados pelo `--selftest` DELE, não scripts standalone.)
 *
 * 3 hooks sem `--selftest`: `cyber-git-seguro.js`, `cyber-dependencias.js`, `test-cobertura.js` —
 * a parte pura de cada um ainda não foi separada da chamada de ferramenta externa (gitleaks/
 * npm audit/pip-audit/pytest/vitest) do jeito que `padrao-limiares.js` foi. (`padrao-format.js` saiu
 * desta lista quando ganhou lógica nova — a decisão de escopo `deveFormatar`, pura — e com ela o
 * `--selftest`, registrado abaixo.)
 */

const DECLARED_OUTSIDE = new Set([
  'specs/_estrutura_modulos/bindings/python/root/src/composition.py',
  'specs/_estrutura_modulos/bindings/javascript/root/src/composition.js',
  'specs/_estrutura_modulos/bindings/typescript/root/src/composition.ts',
]);

function runOne(entry) {
  const absolutePath = join(BASE_ROOT, entry.caminho);
  try {
    execFileSync(entry.runtime, [absolutePath, '--selftest'], { stdio: 'pipe', encoding: 'utf8' });
    return { ok: true };
  } catch (error) {
    return { ok: false, saida: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function runAll() {
  const findings = filesWithSelfTest().filter((c) => !DECLARED_OUTSIDE.has(c));
  const { orphans, obsolete } = compareRegistry(findings, REGISTRY);

  if (obsolete.length > 0) {
    process.stdout.write(`\n=== registered self-tests not found by the scan (${obsolete.length}) — informational ===\n`);
    for (const o of obsolete) process.stdout.write(`  ${o.caminho}\n`);
  }
  if (orphans.length > 0) {
    process.stdout.write(`\n=== ORPHANS — files with --selftest missing from the registry (${orphans.length}) ===\n`);
    for (const o of orphans) process.stdout.write(`  ${o}\n`);
    process.stdout.write('\nAdd each file to the registry in tests/run-all-selftests.mjs with the right command — an\n'
      + '--selftest that nobody runs is the problem this runner exists to prevent.\n');
    return 1;
  }

  let failures = 0;
  for (const entry of REGISTRY) {
    const result = runOne(entry);
    process.stdout.write(`  ${result.ok ? 'ok   ' : 'FAIL'} ${entry.caminho}\n`);
    if (!result.ok) {
      failures += 1;
      process.stdout.write(`${result.saida.split('\n').map((line) => `        ${line}`).join('\n')}\n`);
    }
  }
  process.stdout.write(`\nrun-all-selftests: ${REGISTRY.length - failures}/${REGISTRY.length} files passed --selftest\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória.
// ================================================================================================

function selfTestCases() {
  return [
    { name: 'supportsSelfTest: equality comparison is recognized', fn: () => supportsSelfTest("if (argv === '--selftest')") === true },
    { name: 'supportsSelfTest: includes check is recognized', fn: () => supportsSelfTest("argv.includes('--selftest')") === true },
    { name: 'supportsSelfTest: in operator is recognized', fn: () => supportsSelfTest('"--selftest" in argv') === true },
    { name: 'supportsSelfTest: argparse add_argument is recognized', fn: () => supportsSelfTest("parser.add_argument('--selftest', action='store_true')") === true },
    { name: 'supportsSelfTest: flag declaration in CLI options object is detected', fn: () => supportsSelfTest("const FLAGS = { '--selftest': 'selfTest' }") === true },
    { name: 'supportsSelfTest: a prose mention is not recognized', fn: () => supportsSelfTest('run with --selftest to verify') === false },
    { name: 'compareRegistry: registered file is neither orphan nor obsolete', fn: () => {
      const r = compareRegistry(['a.mjs'], [{ caminho: 'a.mjs' }]);
      return r.orphans.length === 0 && r.obsolete.length === 0;
    } },
    { name: 'compareRegistry: discovered file without a registry entry is an orphan', fn: () => (
      compareRegistry(['a.mjs'], []).orphans.length === 1
    ) },
    { name: 'compareRegistry: registry entry without a discovered file is obsolete but not a failure', fn: () => {
      const r = compareRegistry([], [{ caminho: 'a.mjs' }]);
      return r.orphans.length === 0 && r.obsolete.length === 1;
    } },
  ];
}

function runSelfTest() {
  let failures = 0;
  for (const testCase of selfTestCases()) {
    const ok = testCase.fn() === true;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  const total = selfTestCases().length;
  process.stdout.write(`\nself-test (run-all-selftests): ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

function main() {
  return process.argv.includes('--selftest') ? runSelfTest() : runAll();
}

if (process.argv[1] !== undefined) process.exitCode = main();
