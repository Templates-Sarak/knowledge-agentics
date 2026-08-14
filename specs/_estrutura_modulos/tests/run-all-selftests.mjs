#!/usr/bin/env node
/**
 * run-all-selftests.mjs — plan-3.1.md Bloco AJ.1. O achado do AG generalizado: `migrations.py`
 * ficou com `--autoteste` QUEBRADO por dois commits inteiros, gate verde, Bloco K verde, porque
 * nada no template roda `--autoteste` de ninguém automaticamente. Não é só `tools/**` (AJ.1
 * original) — é QUALQUER arquivo com `--autoteste` que nenhum CI, hook ou script invoca. Um
 * `--autoteste` que ninguém roda é indistinguível de não ter `--autoteste` nenhum, e MAIS caro:
 * ele existe, alguém confiou nele, e ninguém percebeu quando parou de significar algo.
 *
 *   node tests/run-all-selftests.mjs             roda o REGISTRO inteiro, exige 0 falhas
 *   node tests/run-all-selftests.mjs --autoteste  prova o núcleo (descoberta, comparação) com
 *                                                  fixtures em memória
 *
 * NÃO é uma lista à mão que apodrece como as que este bloco existe para substituir: a CASCA
 * VARRE o corpus atrás do padrão `--autoteste` em posição de comparação de CLI (não qualquer
 * menção em prosa/comentário) e compara contra o REGISTRO abaixo — arquivo achado E não
 * registrado é `ORFAO` e REPROVA sozinho, nomeando o arquivo, antes mesmo de rodar um teste. É a
 * mesma disciplina de `citation-baseline.json`/`rename-refusals.json`: o artefato tem de ficar
 * MENOR ou igual ao que a varredura acha, nunca o contrário sem alguém decidir.
 *
 * Fora de `tools/` de propósito — mesmo motivo de `template-self-test.mjs`/`verify-map.mjs` (D3):
 * ferramenta de quem MANTÉM a base, nunca de um projeto gerado.
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
 * — `'--autoteste'` (aspas simples ou duplas) seguido de comparação (`===`, `in`, `.includes(`).
 * Não casa menção em docstring solta (`--autoteste prova...` sem comparação ao lado). */
const PADRAO_SUPORTE = /(?:===|\.includes\()\s*['"]--autoteste['"]|['"]--autoteste['"]\s*(?:===|in\b)/;

export function suportaAutoteste(texto) {
  return PADRAO_SUPORTE.test(texto);
}

/** `registrados` que a varredura não achou mais: RESOLVIDO (arquivo sumiu ou perdeu `--autoteste`),
 * informativo. `achados` sem entrada em `registrados`: ORFAO, reprova sozinho. Mesma forma de
 * `compararComLinhaBase` (`verify-citations.mjs`, Bloco AJ.0) — comparação de dois conjuntos por
 * chave, chave aqui é só o caminho relativo (um arquivo, um comando). */
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
 * arquivo) e `bindings/<binding>/root/**` (os runners que viajam com o projeto —
 * `migrations.{mjs,py}`, o achado do AG). NÃO desce em `_template/**`: é conteúdo de MÓDULO
 * gerado, o gate já cobre. */
function raizesDeVarredura() {
  const raizes = [join(RAIZ_TEMPLATE, 'tools'), join(RAIZ_TEMPLATE, 'tests')];
  for (const binding of BINDINGS) raizes.push(join(RAIZ_TEMPLATE, 'bindings', binding, 'root'));
  return raizes;
}

const CAMINHO_DESTE_ARQUIVO = fileURLToPath(import.meta.url);

/** Todo caminho (relativo à raiz da BASE, barra normal) sob as raízes de varredura cujo texto
 * suporta `--autoteste` — exclui este próprio arquivo: ele CITA `'--autoteste'` várias vezes
 * (docstring, `suportaAutoteste`, `principal`) sem ser, ele mesmo, um alvo do REGISTRO — o mesmo
 * bug de auto-referência que `verify-citations.mjs` documenta no próprio cabeçalho. */
function arquivosComAutoteste() {
  const achados = [];
  for (const raiz of raizesDeVarredura()) {
    for (const caminho of arquivosSob(raiz, ['.mjs', '.py'])) {
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
 * `composicao.py` fica DE FORA de propósito (declarado, não esquecido — mesma disciplina de
 * `config/conformidade.json`): `--autoteste` ali é `python -m src.composicao --autoteste`, e só
 * roda dentro de um projeto instanciado (o módulo `src` não existe solto na base). Cobri-lo exige
 * o passo `criar-modulo` do Bloco K, não este runner — registrado como pendência, não escondido.
 */
const REGISTRO = [
  { caminho: 'specs/_estrutura_modulos/tools/affected.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/ci-dependencies.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/ci-security.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/contract-compatible.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/package.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tools/verify-commit.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/apply-rename.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/no-comments-diff.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/verify-citations.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/verify-map.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/tests/template-self-test.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/typescript/root/scripts/migrations.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/javascript/root/scripts/migrations.mjs', runtime: 'node' },
  { caminho: 'specs/_estrutura_modulos/bindings/python/root/scripts/migrations.py', runtime: 'python' },
];

const DECLARADOS_FORA = new Set(['specs/_estrutura_modulos/bindings/python/root/src/composicao.py']);

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
