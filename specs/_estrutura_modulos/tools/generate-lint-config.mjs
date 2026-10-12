#!/usr/bin/env node
/**
 * generate-lint-config.mjs — deriva a config do linter dos limiares do gate.
 * Lei dona: specs/arquitetura/04-regras.md §4.7
 *
 *   node tools/generate-lint-config.mjs [--binding b] [--target dir] [--check]
 *
 * A fonte é `tools/gate/thresholds.mjs`, e só ela. O linter e o gate cobram os MESMOS três
 * números porque um é gerado do outro — se cada lado guardasse a sua cópia, a precedência do
 * §7.2 ("onde o gate e o linter discordarem, o linter tem razão") apontaria para uma autoridade que
 * ninguém teria como manter em dia.
 *
 * A saída é VERSIONADA, não gerada a cada execução: editor e CI precisam de arquivo real em disco.
 * O mesmo padrão do `.env.example` — gerado dos manifestos e commitado. Por isso este script é
 * determinístico e re-executável: rodar duas vezes produz byte idêntico, e é o que permite a uma
 * regra do gate comparar o disco com a saída dele e acusar a deriva.
 *
 * `--check` não escreve nada: sai 1 se o disco divergir do que seria gerado.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { THRESHOLDS } from './gate/thresholds.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Exportado para a regra `derived-lint` poder perguntar "isto e alguma saida minha?". */
export const BINDINGS = ['typescript', 'javascript', 'python'];

/**
 * Pastas que o linter do PROJETO não julga.
 *
 * `tools/` entra pelo mesmo argumento que já vale para `.agents/` e `.githooks/` no ruff: é
 * ferramental VENDORIZADO da base Sarak, cujo dono é outro repositório e cuja correção vive lá.
 * Um linter não julga código de terceiro que o projeto apenas carrega.
 */
const IGNORED = [
  'node_modules', 'dist', 'build', 'coverage', 'generated',
  '.venv', '.agents', '.githooks', 'tools',
];

/**
 * As cinco regras do ESLint que se SOBREPÕEM ao gate, e a regra do catálogo que cada uma espelha.
 * As três primeiras saem dos limiares; as duas últimas são proibições, sem número a derivar.
 */
function eslintRules() {
  return [
    `      // gate: function-threshold`,
    `      'max-lines-per-function': ['error', { max: ${THRESHOLDS.functionLines}, skipBlankLines: true, skipComments: true }],`,
    `      // gate: nesting-threshold`,
    `      'max-depth': ['error', ${THRESHOLDS.nesting}],`,
    `      // gate: parameters-threshold`,
    `      'max-params': ['error', ${THRESHOLDS.params}],`,
    `      // gate: swallowed-exception`,
    `      'no-empty': ['error', { allowEmptyCatch: false }],`,
    `      // gate: log`,
    `      'no-console': 'error',`,
  ].join('\n');
}

const HEADER = [
  '// GERADO por tools/generate-lint-config.mjs — NAO edite a mao.',
  '// A fonte dos limiares e tools/gate/thresholds.mjs (LEI: specs/arquitetura/04-regras.md §4.7).',
  '// Para mudar um limiar, mude a lei e rode o gerador de novo. Editar aqui cria a divergencia que',
  '// este arquivo existe para impedir.',
].join('\n');

/** Flat config do ESLint. TypeScript precisa de parser proprio; JavaScript, so de JSX ligado. */
function eslintConfig(binding) {
  // `'${p}/**'` (sem o `**/` na frente) ancora na RAIZ do config — so casa `<root>/dist/**`, nunca
  // `modules/*/web/dist/**`. Medido: `npm run build` gera bundle minificado em
  // `modules/*/web/dist/`, e sem o prefixo o eslint linta esse bundle — 419 problemas, 1 real.
  // `.prettierignore` usa semantica gitignore (casa em qualquer nivel); sem o prefixo, so o eslint teria o furo.
  const ignores = IGNORED.map((p) => `'**/${p}/**'`).join(', ');
  const parts = [HEADER, ''];

  if (binding === 'typescript') {
    parts.push("import parserTs from '@typescript-eslint/parser';", '');
  }
  parts.push('export default [');
  parts.push(`  { ignores: [${ignores}] },`);
  parts.push('  {');
  parts.push(binding === 'typescript'
    ? "    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],"
    : "    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],");
  parts.push('    languageOptions: {');
  if (binding === 'typescript') parts.push('      parser: parserTs,');
  // 'latest', nao um ano fixo: o molde JS usa `import ... with { type: 'json' }` (atributos de
  // import) em web/src/pages/*.jsx e tests/web/*.test.jsx — medido: `ecmaVersion: 2023`
  // faz o espree (parser default, sem @typescript-eslint) rejeitar essa sintaxe com "Unexpected
  // token with". O binding TypeScript nao pega o mesmo erro porque usa outro parser.
  parts.push("      ecmaVersion: 'latest',");
  parts.push("      sourceType: 'module',");
  parts.push('      parserOptions: { ecmaFeatures: { jsx: true } },');
  parts.push('    },');
  parts.push('    rules: {');
  parts.push(eslintRules());
  parts.push('    },');
  parts.push('  },');
  parts.push('  {');
  parts.push("    // Teste tem outra economia: fixture longa e `console` de diagnostico sao legitimos ali,");
  parts.push('    // e o gate ja isenta arquivo de teste nas mesmas regras (`isTest`).');
  parts.push("    files: ['**/tests/**', '**/*.test.*', '**/*.spec.*'],");
  parts.push("    rules: { 'max-lines-per-function': 'off', 'no-console': 'off' },");
  parts.push('  },');
  parts.push('];');
  return `${parts.join('\n')}\n`;
}

/**
 * `.ruff.toml`, e NÃO `[tool.ruff]` no `pyproject.toml`.
 *
 * O motivo é de precedência, não de gosto: o ruff escolhe UM arquivo de configuração, e o
 * `.ruff.toml` vence o `pyproject.toml` por inteiro — não há merge. Manter os dois faria a seção do
 * pyproject ser silenciosamente descartada, que é pior que duplicar: seriam duas fontes, uma delas
 * morta. Com arquivo próprio, o gerador é dono do arquivo INTEIRO, e a conferência de deriva é uma
 * comparação de arquivo inteiro — a mesma do `eslint.config.js`.
 */
function ruffConfig() {
  return [
    '# GERADO por tools/generate-lint-config.mjs — NAO edite a mao.',
    '# A fonte dos limiares e tools/gate/thresholds.mjs (LEI: specs/arquitetura/04-regras.md §4.7).',
    '# Este arquivo tem PRECEDENCIA sobre [tool.ruff] do pyproject.toml — o ruff le um so. Por isso o',
    '# pyproject nao declara mais nada de ruff: duas fontes, uma morta, e o pior dos dois mundos.',
    '',
    'line-length = 110',
    'target-version = "py311"',
    // MESMA lista do eslint (IGNORADOS inteiro), sem filtro — uma fonte unica produzindo duas listas
    // diferentes e a fonte unica desmentida: um filtro por prefixo (so `.` ou
    // `tools`) deixa `dist`/`build`/`coverage`/`generated`/`node_modules` de fora do ruff.
    `exclude = [${IGNORED.map((p) => `"${p}"`).join(', ')}]`,
    '',
    '[lint]',
    'select = ["E", "F", "W", "B", "C90", "T20", "ANN", "RET", "SIM", "PL"]',
    'ignore = ["ANN401"]',
    '',
    '[lint.mccabe]',
    'max-complexity = 10',
    '',
    '[lint.pylint]',
    '# gate: parameters-threshold',
    `max-args = ${THRESHOLDS.params}`,
    '# gate: function-threshold — `max-statements` e o analogo mais proximo que o ruff oferece.',
    `max-statements = ${THRESHOLDS.functionLines}`,
    '',
    '[lint.per-file-ignores]',
    '# Teste tem outra economia — o gate ja o isenta das mesmas regras (`isTest`). A lista acompanha',
    '# a do pyproject.toml de cada modulo: raiz e modulo isentam o teste do MESMO conjunto.',
    '"**/tests/**" = ["ANN", "PLR0915", "PLR2004", "S101", "T20"]',
    '',
  ].join('\n');
}

/**
 * Qual arquivo cada binding gera, e com que conteúdo. PURA: não toca disco, não lê argumento.
 *
 * É exportada porque a regra `derived-lint` do gate precisa da MESMA resposta que o `--check`
 * daqui. Uma segunda cópia da lógica seria uma segunda fonte da verdade — o defeito exato que este
 * gerador existe para eliminar, reencenado um nível acima. Por isso o CLI abaixo só roda quando
 * este arquivo é o entrypoint: importá-lo tem de ser inerte.
 */
export function outputOf(binding) {
  if (binding === 'python') return { name: '.ruff.toml', content: ruffConfig() };
  return { name: 'eslint.config.js', content: eslintConfig(binding) };
}

/** Binding do destino, pelos arquivos de raiz que só ele tem. */
function detectBinding(destination) {
  if (existsSync(join(destination, 'pyproject.toml'))) return 'python';
  if (existsSync(join(destination, 'tsconfig.json'))) return 'typescript';
  if (existsSync(join(destination, 'jsconfig.json'))) return 'javascript';
  return null;
}

/** Sobe até achar a raiz do projeto (a que tem `modules/`); senão, o diretório atual. */
function findProjectRoot() {
  let current = process.cwd();
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

function readOptions() {
  const rawArgs = process.argv.slice(2);
  const flagValue = (name) => {
    const index = rawArgs.indexOf(`--${name}`);
    return index === -1 ? null : rawArgs[index + 1];
  };
  const destination = resolve(process.cwd(), flagValue('target') ?? findProjectRoot());
  return {
    destination,
    binding: flagValue('binding') ?? detectBinding(destination),
    check: rawArgs.includes('--check'),
  };
}

function main() {
  const { destination, binding, check } = readOptions();
  if (binding === null) {
    process.stderr.write(`Error: could not identify the binding for ${destination}; use --binding\n`);
    return 1;
  }
  if (!BINDINGS.includes(binding)) {
    process.stderr.write(`Error: invalid binding "${binding}"; choose from ${BINDINGS.join(', ')}\n`);
    return 1;
  }

  const { name, content } = outputOf(binding);
  const path = join(destination, name);
  // Normaliza CRLF->LF: mesma defesa em profundidade de `context.mjs:readText` — o `.gitattributes`
  // e o conserto estrutural, isto cobre clone ainda nao renormalizado.
  const onDisk = existsSync(path)
    ? readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')
    : null;

  if (check) {
    if (onDisk === content) {
      process.stdout.write(`lint-config: OK — ${name} matches tools/gate/thresholds.mjs\n`);
      return 0;
    }
    process.stderr.write(
      `lint-config: FAILED — ${name} differs from the gate thresholds.\n`
      + '  run: node tools/generate-lint-config.mjs\n',
    );
    return 1;
  }

  writeFileSync(path, content, 'utf8');
  process.stdout.write(`${onDisk === content ? 'Unchanged' : 'Generated'}: ${name} (binding ${binding})\n`);
  return 0;
}

// Só executa quando ESTE arquivo é o entrypoint. Sem a guarda, `import { outputOf }` de dentro do
// gate escreveria arquivo e derrubaria o processo — e a regra `derived-lint`, que precisa da
// função pura, não teria como consumi-la sem duplicá-la.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
