#!/usr/bin/env node
/**
 * gerar-config-lint.mjs — deriva a config do linter dos limiares do gate.
 * Lei dona: specs/arquitetura/04-regras.md §4.7
 *
 *   node ferramentas/gerar-config-lint.mjs [--binding b] [--destino dir] [--conferir]
 *
 * A fonte é `ferramentas/gate/limiares.mjs`, e só ela. O linter e o gate cobram os MESMOS três
 * números porque um é gerado do outro — enquanto cada lado guardava a sua cópia, a precedência do
 * §7.2 ("onde o gate e o linter discordarem, o linter tem razão") apontava para uma autoridade que
 * ninguém tinha como manter em dia.
 *
 * A saída é VERSIONADA, não gerada a cada execução: editor e CI precisam de arquivo real em disco.
 * O mesmo padrão do `.env.example` — gerado dos manifestos e commitado. Por isso este script é
 * determinístico e re-executável: rodar duas vezes produz byte idêntico, e é o que permite a uma
 * regra do gate comparar o disco com a saída dele e acusar a deriva.
 *
 * `--conferir` não escreve nada: sai 1 se o disco divergir do que seria gerado.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIMIARES } from './gate/limiares.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Exportado para a regra `lint-derivado` poder perguntar "isto e alguma saida minha?". */
export const BINDINGS = ['typescript', 'javascript', 'python'];

/**
 * Pastas que o linter do PROJETO não julga.
 *
 * `ferramentas/` entra pelo mesmo argumento que já vale para `.agents/` e `.githooks/` no ruff: é
 * ferramental VENDORIZADO da base Sarak, cujo dono é outro repositório e cuja correção vive lá.
 * Um linter não julga código de terceiro que o projeto apenas carrega.
 */
const IGNORADOS = [
  'node_modules', 'dist', 'build', 'coverage', 'gerados',
  '.venv', '.agents', '.githooks', 'ferramentas',
];

/**
 * As cinco regras do ESLint que se SOBREPÕEM ao gate, e a regra do catálogo que cada uma espelha.
 * As três primeiras saem dos limiares; as duas últimas são proibições, sem número a derivar.
 */
function regrasEslint() {
  return [
    `      // gate: limiar-funcao`,
    `      'max-lines-per-function': ['error', { max: ${LIMIARES.linhasFuncao}, skipBlankLines: true, skipComments: true }],`,
    `      // gate: limiar-aninhamento`,
    `      'max-depth': ['error', ${LIMIARES.aninhamento}],`,
    `      // gate: limiar-parametros`,
    `      'max-params': ['error', ${LIMIARES.parametros}],`,
    `      // gate: excecao-engolida`,
    `      'no-empty': ['error', { allowEmptyCatch: false }],`,
    `      // gate: log`,
    `      'no-console': 'error',`,
  ].join('\n');
}

const CABECALHO = [
  '// GERADO por ferramentas/gerar-config-lint.mjs — NAO edite a mao.',
  '// A fonte dos limiares e ferramentas/gate/limiares.mjs (LEI: specs/arquitetura/04-regras.md §4.7).',
  '// Para mudar um limiar, mude a lei e rode o gerador de novo. Editar aqui cria a divergencia que',
  '// este arquivo existe para impedir.',
].join('\n');

/** Flat config do ESLint. TypeScript precisa de parser proprio; JavaScript, so de JSX ligado. */
function eslintConfig(binding) {
  const ignores = IGNORADOS.map((p) => `'${p}/**'`).join(', ');
  const partes = [CABECALHO, ''];

  if (binding === 'typescript') {
    partes.push("import parserTs from '@typescript-eslint/parser';", '');
  }
  partes.push('export default [');
  partes.push(`  { ignores: [${ignores}] },`);
  partes.push('  {');
  partes.push(binding === 'typescript'
    ? "    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],"
    : "    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],");
  partes.push('    languageOptions: {');
  if (binding === 'typescript') partes.push('      parser: parserTs,');
  partes.push('      ecmaVersion: 2023,');
  partes.push("      sourceType: 'module',");
  partes.push('      parserOptions: { ecmaFeatures: { jsx: true } },');
  partes.push('    },');
  partes.push('    rules: {');
  partes.push(regrasEslint());
  partes.push('    },');
  partes.push('  },');
  partes.push('  {');
  partes.push("    // Teste tem outra economia: fixture longa e `console` de diagnostico sao legitimos ali,");
  partes.push('    // e o gate ja isenta arquivo de teste nas mesmas regras (`eTeste`).');
  partes.push("    files: ['**/tests/**', '**/*.test.*', '**/*.spec.*'],");
  partes.push("    rules: { 'max-lines-per-function': 'off', 'no-console': 'off' },");
  partes.push('  },');
  partes.push('];');
  return `${partes.join('\n')}\n`;
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
    '# GERADO por ferramentas/gerar-config-lint.mjs — NAO edite a mao.',
    '# A fonte dos limiares e ferramentas/gate/limiares.mjs (LEI: specs/arquitetura/04-regras.md §4.7).',
    '# Este arquivo tem PRECEDENCIA sobre [tool.ruff] do pyproject.toml — o ruff le um so. Por isso o',
    '# pyproject nao declara mais nada de ruff: duas fontes, uma morta, e o pior dos dois mundos.',
    '',
    'line-length = 110',
    'target-version = "py311"',
    `exclude = [${IGNORADOS.filter((p) => p.startsWith('.') || p === 'ferramentas').map((p) => `"${p}"`).join(', ')}]`,
    '',
    '[lint]',
    'select = ["E", "F", "W", "B", "C90", "T20", "ANN", "RET", "SIM", "PL"]',
    'ignore = ["ANN401"]',
    '',
    '[lint.mccabe]',
    'max-complexity = 10',
    '',
    '[lint.pylint]',
    '# gate: limiar-parametros',
    `max-args = ${LIMIARES.parametros}`,
    '# gate: limiar-funcao — `max-statements` e o analogo mais proximo que o ruff oferece.',
    `max-statements = ${LIMIARES.linhasFuncao}`,
    '',
    '[lint.per-file-ignores]',
    '# Teste tem outra economia — o gate ja o isenta das mesmas regras (`eTeste`). A lista acompanha',
    '# a do pyproject.toml de cada modulo: raiz e modulo isentam o teste do MESMO conjunto.',
    '"**/tests/**" = ["ANN", "PLR0915", "PLR2004", "S101", "T20"]',
    '',
  ].join('\n');
}

/**
 * Qual arquivo cada binding gera, e com que conteúdo. PURA: não toca disco, não lê argumento.
 *
 * É exportada porque a regra `lint-derivado` do gate precisa da MESMA resposta que o `--conferir`
 * daqui. Uma segunda cópia da lógica seria uma segunda fonte da verdade — o defeito exato que este
 * gerador existe para eliminar, reencenado um nível acima. Por isso o CLI abaixo só roda quando
 * este arquivo é o entrypoint: importá-lo tem de ser inerte.
 */
export function saidaDe(binding) {
  if (binding === 'python') return { nome: '.ruff.toml', conteudo: ruffConfig() };
  return { nome: 'eslint.config.js', conteudo: eslintConfig(binding) };
}

/** Binding do destino, pelos arquivos de raiz que só ele tem. */
function detectarBinding(destino) {
  if (existsSync(join(destino, 'pyproject.toml'))) return 'python';
  if (existsSync(join(destino, 'tsconfig.json'))) return 'typescript';
  if (existsSync(join(destino, 'jsconfig.json'))) return 'javascript';
  return null;
}

/** Sobe até achar a raiz do projeto (a que tem `modulos/`); senão, o diretório atual. */
function acharRaizProjeto() {
  let atual = process.cwd();
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modulos'))) return atual;
    const pai = dirname(atual);
    if (pai === atual) break;
    atual = pai;
  }
  return process.cwd();
}

function lerOpcoes() {
  const brutos = process.argv.slice(2);
  const valorDe = (nome) => {
    const indice = brutos.indexOf(`--${nome}`);
    return indice === -1 ? null : brutos[indice + 1];
  };
  const destino = resolve(process.cwd(), valorDe('destino') ?? acharRaizProjeto());
  return {
    destino,
    binding: valorDe('binding') ?? detectarBinding(destino),
    conferir: brutos.includes('--conferir'),
  };
}

function principal() {
  const { destino, binding, conferir } = lerOpcoes();
  if (binding === null) {
    process.stderr.write(`erro: nao identifiquei o binding de ${destino} — use --binding\n`);
    return 1;
  }
  if (!BINDINGS.includes(binding)) {
    process.stderr.write(`erro: binding "${binding}" invalido — use ${BINDINGS.join(', ')}\n`);
    return 1;
  }

  const { nome, conteudo } = saidaDe(binding);
  const caminho = join(destino, nome);
  const emDisco = existsSync(caminho) ? readFileSync(caminho, 'utf8').replace(/^﻿/, '') : null;

  if (conferir) {
    if (emDisco === conteudo) {
      process.stdout.write(`config-lint: OK — ${nome} em dia com ferramentas/gate/limiares.mjs\n`);
      return 0;
    }
    process.stderr.write(
      `config-lint: REPROVADO — ${nome} diverge dos limiares do gate.\n`
      + '  rode: node ferramentas/gerar-config-lint.mjs\n',
    );
    return 1;
  }

  writeFileSync(caminho, conteudo, 'utf8');
  process.stdout.write(`${emDisco === conteudo ? 'inalterado' : 'gerado'}: ${nome} (binding ${binding})\n`);
  return 0;
}

// Só executa quando ESTE arquivo é o entrypoint. Sem a guarda, `import { saidaDe }` de dentro do
// gate escreveria arquivo e derrubaria o processo — e a regra `lint-derivado`, que precisa da
// função pura, não teria como consumi-la sem duplicá-la.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
