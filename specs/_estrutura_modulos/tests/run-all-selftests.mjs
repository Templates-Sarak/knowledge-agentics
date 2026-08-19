#!/usr/bin/env node
/**
 * run-all-selftests.mjs — roda todo `--autoteste` registrado no template e na base, e reprova se
 * achar um `--autoteste` fora do REGISTRO: nada aqui roda `--autoteste` de ninguém automaticamente
 * por conta própria, e um `--autoteste` que nenhum CI, hook ou script invoca é indistinguível de não
 * ter `--autoteste` nenhum — e MAIS caro: ele existe, alguém confiou nele, e ninguém percebe quando
 * ele parar de significar algo.
 *
 *   node tests/run-all-selftests.mjs             roda o REGISTRO inteiro, exige 0 falhas
 *   node tests/run-all-selftests.mjs --autoteste  prova o núcleo (descoberta, comparação) com
 *                                                  fixtures em memória
 *
 * NÃO é uma lista à mão que apodrece: a CASCA VARRE o corpus atrás do padrão `--autoteste` em
 * posição de comparação de CLI (não qualquer menção em prosa/comentário) e compara contra o
 * REGISTRO abaixo — arquivo achado E não registrado é `ORFAO` e REPROVA sozinho, nomeando o
 * arquivo, antes mesmo de rodar um teste. O artefato (o REGISTRO) tem de ficar MENOR ou igual ao
 * que a varredura acha, nunca o contrário sem alguém decidir.
 *
 * Cobre `tools/`, `tests/`, `bindings/<binding>/root/` e `skills/<skill>/scripts/`: ferramenta de quem
 * MANTÉM a base, nunca de um projeto gerado — um `--autoteste` de skill que ninguém roda apodrece
 * do mesmo jeito que um de `tools/`, e é o mesmo defeito que este arquivo existe para impedir.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ_TEMPLATE = join(AQUI, '..');
const RAIZ_BASE = join(RAIZ_TEMPLATE, '..', '..');
const BINDINGS = ['typescript', 'javascript', 'python'];

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha até a marca "CASCA" toca `fs` nem processo.
// ================================================================================================

/** Um arquivo SUPORTA `--autoteste` quando o texto compara literalmente contra o argv nessa forma
 * — `'--autoteste'` (aspas simples ou duplas) seguido de comparação (`===`, `in`, `.includes(`) —
 * ou quando declara a flag via `argparse.add_argument('--autoteste', ...)` (o idioma Python
 * equivalente: `add_argument` É o ponto de reconhecimento da flag, mesmo sem comparação direta a
 * `sys.argv` — achado ao varrer `skills/**`, onde os dois scripts baseados em argparse escapavam
 * do padrão pensado para `sys.argv` cru). Não casa menção em docstring solta
 * (`--autoteste prova...` sem comparação ao lado). */
const PADRAO_SUPORTE = /(?:===|\.includes\()\s*['"]--autoteste['"]|['"]--autoteste['"]\s*(?:===|in\b)|add_argument\(\s*['"]--autoteste['"]/;

export function suportaAutoteste(texto) {
  return PADRAO_SUPORTE.test(texto);
}

/** `registrados` que a varredura não achou mais: RESOLVIDO (arquivo sumiu ou perdeu `--autoteste`),
 * informativo. `achados` sem entrada em `registrados`: ORFAO, reprova sozinho. Comparação de dois
 * conjuntos por chave — chave aqui é só o caminho relativo (um arquivo, um comando). */
export function compararRegistro(achados, registrados) {
  const achadosSet = new Set(achados);
  const registradosSet = new Set(registrados.map((r) => r.caminho));
  return {
    orfaos: achados.filter((c) => !registradosSet.has(c)),
    obsoletos: registrados.filter((r) => !achadosSet.has(r.caminho)),
  };
}

// ================================================================================================
// CASCA — toca disco e processo.
// ================================================================================================

const IGNORAR = new Set(['node_modules', '.git', '__pycache__', '.venv', 'dist', 'generated', '_template']);

function arquivosSob(pasta, extensoes) {
  if (!existsSync(pasta)) return [];
  const achados = [];
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (IGNORAR.has(entrada.name)) continue;
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosSob(caminho, extensoes));
    else if (extensoes.some((ext) => entrada.name.endsWith(ext))) achados.push(caminho);
  }
  return achados;
}

/** Onde `--autoteste` pode legitimamente morar: `tools/**`, `tests/**` (a própria pasta deste
 * arquivo), `bindings/<binding>/root/**` (os runners que viajam com o projeto —
 * `migrations.{mjs,py}`, o achado do AG), `skills/**` (todo `.mjs`/`.py` da base mora em
 * `skills/<skill>/scripts/`, e a varredura recursiva chega lá sem precisar saber o nome de cada
 * skill) e `hooks/` (a única "garantia determinística" do README — sem varredura aqui, um
 * `--autoteste` novo em hook ficava órfão do mesmo jeito que os de `skills/` ficavam antes desta
 * pasta entrar no REGISTRO). NÃO desce em `_template/**`: é conteúdo de MÓDULO gerado, o gate já cobre. */
function raizesDeVarredura() {
  const raizes = [
    join(RAIZ_TEMPLATE, 'tools'),
    join(RAIZ_TEMPLATE, 'tests'),
    join(RAIZ_BASE, 'skills'),
    join(RAIZ_BASE, 'hooks'),
  ];
  for (const binding of BINDINGS) raizes.push(join(RAIZ_TEMPLATE, 'bindings', binding, 'root'));
  return raizes;
}

const CAMINHO_DESTE_ARQUIVO = fileURLToPath(import.meta.url);

/** Todo caminho (relativo à raiz da BASE, barra normal) sob as raízes de varredura cujo texto
 * suporta `--autoteste` — exclui este próprio arquivo: ele CITA `'--autoteste'` várias vezes
 * (docstring, `suportaAutoteste`, `principal`) sem ser, ele mesmo, um alvo do REGISTRO. */
function arquivosComAutoteste() {
  const achados = [];
  for (const raiz of raizesDeVarredura()) {
    for (const caminho of arquivosSob(raiz, ['.mjs', '.py', '.js', '.ts'])) {
      if (caminho === CAMINHO_DESTE_ARQUIVO) continue;
      const texto = readFileSync(caminho, 'utf8');
      if (suportaAutoteste(texto)) achados.push(relative(RAIZ_BASE, caminho).split('\\').join('/'));
    }
  }
  return achados.sort();
}

/**
 * O REGISTRO — um runtime por arquivo achado pela varredura (o caminho já é o suficiente: todo
 * arquivo aqui resolve a PRÓPRIA raiz por `import.meta.url`/`__file__`, nunca por `cwd` — rodar por
 * caminho absoluto, de qualquer diretório, é seguro). Cresce só de propósito: um arquivo NOVO com
 * `--autoteste` reprova como ÓRFÃO até alguém decidir o runtime dele e acrescentar aqui.
 *
 * `composicao.py`/`.js`/`.ts` ficam DE FORA de propósito (declarados, não esquecidos — mesma
 * disciplina de `config/conformidade.json`): o `--autoteste` de cada um só roda dentro de um projeto
 * INSTANCIADO — `python -m src.composicao --autoteste` depende do módulo `src`, que não existe
 * solto na base; `composicao.js`/`.ts` importam `express` de `node_modules`, que também não existe
 * solto na base (medido: os dois estouram `ERR_MODULE_NOT_FOUND` ao rodar direto daqui). Cobri-los
 * exige um projeto gerado — o passo `criar-modulo` de `autoteste:template`, não este runner —
 * registrado como pendência, não escondido.
 */
const REGISTRO = [
  { caminho: 'specs/_estrutura_modulos/tools/affected.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/create-adapter.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/ci-dependencies.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/ci-security.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/contract-compatible.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/package.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/verify-commit.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/verify-map.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/verify-catalog.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/verify-routine.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/template-self-test.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/typescript/root/scripts/migrations.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/javascript/root/scripts/migrations.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/python/root/scripts/migrations.py', runtime: 'python' },
  { caminho: 'skills/git-verificacao-commit/scripts/gerar_config.py', runtime: 'python' },
  { caminho: 'skills/git-verificacao-commit/scripts/verificar_commit.py', runtime: 'python' },
  { caminho: 'skills/meta-iniciar-repositorio/scripts/comparar_arvore.py', runtime: 'python' },
  { caminho: 'skills/meta-iniciar-repositorio/scripts/init_repo.py', runtime: 'python' },
  { caminho: 'skills/meta-verificacao-base/scripts/audit_base.py', runtime: 'python' },
  { caminho: 'skills/meta-adequacao-modular/scripts/diagnosticar_terreno.py', runtime: 'python' },
  { caminho: 'skills/cyber-segredos/scripts/scan_segredos.py', runtime: 'python' },
  { caminho: 'skills/padrao-python/scripts/validate.py', runtime: 'python' },
  { caminho: 'skills/padrao-typescript/scripts/validate.mjs', runtime: 'node' },
  { caminho: 'hooks/_lib.js', runtime: 'node' },
  { caminho: 'hooks/padrao-limiares.js', runtime: 'node' },
];

/**
 * PENDÊNCIA DECLARADA (não escondida): scripts e hooks que AINDA não têm `--autoteste`, listados
 * aqui de propósito para não regredir a decisão sem alguém decidir de novo.
 *
 * 13 scripts de skill sem `--autoteste`: `code-entrega/scripts/{auditar_docs,scan_assinaturas}.py`,
 * `code-limpeza-projeto/scripts/detectar_lixo.py`, `cyber-codigo/scripts/sast_scan.py`,
 * `cyber-config/scripts/check_headers.py`, `cyber-dependencias/scripts/parse_audit.py`,
 * `deploy-docker/scripts/validar_docker.py`, `deploy-vercel/scripts/validar_predeploy.py`,
 * `git-especialista-repositorio/scripts/scan_historico.py`,
 * `git-revisao-diff/scripts/revisar_diff.py`, `meta-create-skill/scripts/scaffold_skill.py`,
 * `otimizacao-nivel-1/scripts/auditar_assets.py`, `site-seo/scripts/auditar_seo.py` — erram para
 * MENOS gravidade (relatório incompleto), nunca para aprovação falsa, e por isso ficam de fora de
 * propósito nesta rodada. (`meta-verificacao-base/scripts/{limiares,ponteiros}.py` NÃO entram
 * nesta lista: são módulos importados por `audit_base.py`, provados pelo `--autoteste` DELE, não
 * scripts standalone.)
 *
 * 3 hooks sem `--autoteste`: `cyber-git-seguro.js`, `cyber-dependencias.js`, `test-cobertura.js` —
 * a parte pura de cada um ainda não foi separada da chamada de ferramenta externa (gitleaks/
 * npm audit/pip-audit/pytest/vitest) do jeito que `padrao-limiares.js` foi.
 */

const DECLARADOS_FORA = new Set([
  'specs/_estrutura_modulos/bindings/python/root/src/composicao.py',
  'specs/_estrutura_modulos/bindings/javascript/root/src/composicao.js',
  'specs/_estrutura_modulos/bindings/typescript/root/src/composicao.ts',
]);

function rodarUm(registro) {
  const caminhoAbsoluto = join(RAIZ_BASE, registro.caminho);
  try {
    execFileSync(registro.runtime, [caminhoAbsoluto, '--autoteste'], { stdio: 'pipe', encoding: 'utf8' });
    return { ok: true };
  } catch (erro) {
    return { ok: false, saida: `${erro.stdout ?? ''}${erro.stderr ?? ''}` };
  }
}

function rodarTudo() {
  const achados = arquivosComAutoteste().filter((c) => !DECLARADOS_FORA.has(c));
  const { orfaos, obsoletos } = compararRegistro(achados, REGISTRO);

  if (obsoletos.length > 0) {
    process.stdout.write(`\n=== registrados que a varredura não achou mais (${obsoletos.length}) — informativo ===\n`);
    for (const o of obsoletos) process.stdout.write(`  ${o.caminho}\n`);
  }
  if (orfaos.length > 0) {
    process.stdout.write(`\n=== ÓRFÃOS — arquivo com --autoteste sem entrada no REGISTRO (${orfaos.length}) ===\n`);
    for (const o of orfaos) process.stdout.write(`  ${o}\n`);
    process.stdout.write('\nAcrescente ao REGISTRO em tests/run-all-selftests.mjs com o comando certo — um\n'
      + '--autoteste que ninguém roda é o defeito que este arquivo existe para impedir.\n');
    return 1;
  }

  let falhas = 0;
  for (const registro of REGISTRO) {
    const resultado = rodarUm(registro);
    process.stdout.write(`  ${resultado.ok ? 'ok   ' : 'FALHA'} ${registro.caminho}\n`);
    if (!resultado.ok) {
      falhas += 1;
      process.stdout.write(`${resultado.saida.split('\n').map((l) => `        ${l}`).join('\n')}\n`);
    }
  }
  process.stdout.write(`\nrun-all-selftests: ${REGISTRO.length - falhas}/${REGISTRO.length} arquivo(s) com --autoteste verde\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória.
// ================================================================================================

function casosDeAutoteste() {
  return [
    { nome: 'suportaAutoteste: comparacao === casa', fn: () => suportaAutoteste("if (argv === '--autoteste')") === true },
    { nome: 'suportaAutoteste: .includes( casa', fn: () => suportaAutoteste("argv.includes('--autoteste')") === true },
    { nome: 'suportaAutoteste: "in" casa', fn: () => suportaAutoteste('"--autoteste" in argv') === true },
    { nome: 'suportaAutoteste: argparse add_argument casa', fn: () => suportaAutoteste("parser.add_argument('--autoteste', action='store_true')") === true },
    { nome: 'suportaAutoteste: mencao solta em prosa NAO casa', fn: () => suportaAutoteste('roda com --autoteste para conferir') === false },
    { nome: 'compararRegistro: achado registrado -> nem orfao nem obsoleto', fn: () => {
      const r = compararRegistro(['a.mjs'], [{ caminho: 'a.mjs' }]);
      return r.orfaos.length === 0 && r.obsoletos.length === 0;
    } },
    { nome: 'compararRegistro: achado sem registro -> orfao', fn: () => (
      compararRegistro(['a.mjs'], []).orfaos.length === 1
    ) },
    { nome: 'compararRegistro: registro sem achado -> obsoleto, nunca reprova', fn: () => {
      const r = compararRegistro([], [{ caminho: 'a.mjs' }]);
      return r.orfaos.length === 0 && r.obsoletos.length === 1;
    } },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  for (const caso of casosDeAutoteste()) {
    const ok = caso.fn() === true;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  const total = casosDeAutoteste().length;
  process.stdout.write(`\nautoteste (run-all-selftests): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

function principal() {
  return process.argv.includes('--autoteste') ? rodarAutoteste() : rodarTudo();
}

if (process.argv[1] !== undefined) process.exitCode = principal();
