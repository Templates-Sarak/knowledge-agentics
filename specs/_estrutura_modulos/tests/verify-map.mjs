#!/usr/bin/env node
/**
 * verify-map.mjs — prova que `specs/arquitetura/README.md` (o mapa) está instalado e que todo `§`
 * que ele cita resolve a um título real do arquivo que ele nomeia.
 * Lei dona: nenhuma — ferramenta de manutenção do TEMPLATE, como `template-self-test.mjs` (mesmo
 * motivo de ficar fora de `tools/`: um projeto gerado não gera projeto, e não precisa reverificar o
 * PRÓPRIO mapa depois de instalado).
 *
 *   node tests/verify-map.mjs --check <pastaArquitetura>   confere um specs/arquitetura/ real
 *   node tests/verify-map.mjs --selftest                     prova o núcleo com fixtures em memória
 *
 * A TRAVA É O PONTEIRO, NÃO O BYTE: não compara o mapa byte a byte com uma cópia de
 * referência — isso pegaria edição manual, que não é o risco. O risco é `§` citado que deixou de
 * existir quando a lei for reorganizada. Por isso o núcleo lê os TÍTULOS reais de cada arquivo citado
 * e confere que a seção referida ainda está lá — precedente de `skills/meta-verificacao-base/scripts/
 * pointers.py`, mesma ideia, outro alvo (a doutrina do template, não a base inteira).
 *
 * NÚCLEO × CASCA, precedente de `affected.mjs`: `extractCitations`/`extractSections`/`orphanPoints` são
 * puras — nenhuma toca `fs`. `--selftest` prova as três com fixtures em memória.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`.
// ================================================================================================

const RE_FILE = /`([\w.-]+\.md)`/g;
const RE_SECTION = /§(\d+(?:\.\d+)?)/g;

/**
 * `{arquivo, secao, linha}` de cada citação `` `arquivo.md` §N[.M] `` do texto — as duas marcas na
 * MESMA linha (o formato que o mapa usa em toda tabela e em toda prosa). Quando mais de um arquivo
 * aparece antes da seção na mesma linha, associa ao MAIS PRÓXIMO que a precede — é como uma frase lida
 * da esquerda para a direita associa naturalmente. Sem arquivo nenhum antes da seção na linha, a
 * citação é ignorada (não é uma citação cruzada — provavelmente é o número de uma lista).
 */
export function extractCitations(text) {
  const citations = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const files = [...line.matchAll(RE_FILE)];
    if (files.length === 0) return;
    for (const sectionMatch of line.matchAll(RE_SECTION)) {
      const preceding = files.filter((a) => a.index < sectionMatch.index);
      if (preceding.length === 0) continue;
      const file = preceding.at(-1)[1];
      citations.push({ file, section: sectionMatch[1], line: index + 1 });
    }
  });
  return citations;
}

/** Cabeçalho `#+ N[.M][.] Título` -> o número da seção, como string (`"9"`, `"9.1"`). */
const RE_TITLE = /^#{1,6}\s+(\d+(?:\.\d+)?)\.?\s+\S/;

/** O conjunto de números de seção que o arquivo REALMENTE declara em título — o que um `§` pode citar. */
export function extractSections(text) {
  const sections = new Set();
  for (const line of text.split('\n')) {
    const matched = line.match(RE_TITLE);
    if (matched) sections.add(matched[1]);
  }
  return sections;
}

/**
 * As citações que NÃO resolvem: arquivo fora do mapa de seções conhecido, ou seção que o arquivo não
 * declara em título nenhum. `secoesPorArquivo` é `Map<nomeDoArquivo, Set<secao>>` — monta-se na casca,
 * lendo os arquivos de verdade; aqui é só comparação.
 */
export function orphanPoints(citations, sectionsByFile) {
  return citations.filter(({ file, section }) => {
    const sections = sectionsByFile.get(file);
    return sections === undefined || !sections.has(section);
  });
}

// ================================================================================================
// CASCA — toca disco. Só as duas funções abaixo.
// ================================================================================================

function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

/** `Map<nomeDoArquivo, Set<secao>>` de todo `.md` da pasta de arquitetura — o universo que resolve as citações do mapa. */
function buildSectionsByFile(architectureDir) {
  const map = new Map();
  for (const entry of readdirSync(architectureDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    map.set(entry.name, extractSections(readText(join(architectureDir, entry.name))));
  }
  return map;
}

/**
 * O veredito completo para uma pasta `specs/arquitetura/` real: mapa instalado? ponteiros resolvem?
 * `{ ok, motivo }` — `motivo` só quando `ok` é `false`, sempre com detalhe suficiente para localizar.
 */
function check(architectureDir) {
  const mapPath = join(architectureDir, 'README.md');
  if (!existsSync(mapPath)) {
    return { ok: false, reason: `architecture map not installed: ${mapPath} does not exist` };
  }

  const citations = extractCitations(readText(mapPath));
  const sectionsByFile = buildSectionsByFile(architectureDir);
  const orphans = orphanPoints(citations, sectionsByFile);
  if (orphans.length > 0) {
    const lines = orphans.map((o) => `  README.md:${o.line} -> \`${o.file}\` §${o.section} does not exist`);
    return { ok: false, reason: `${orphans.length} orphan reference(s):\n${lines.join('\n')}` };
  }
  return { ok: true, reason: null };
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória, sem tocar disco.
// ================================================================================================

function selfTestCases() {
  return [
    {
      name: 'extractCitations: file and section are on the same line in a Markdown table',
      fn: () => {
        const c = extractCitations('| … change field | `01-modulo.md` §9.1 |');
        return c.length === 1 && c[0].file === '01-modulo.md' && c[0].section === '9.1';
      },
    },
    {
      name: 'extractCitations: two sections from the same file share a line',
      fn: () => {
        const c = extractCitations('see `01-modulo.md` §8 and §9 to create and change');
        return c.length === 2 && c.every((x) => x.file === '01-modulo.md') && c[0].section === '8' && c[1].section === '9';
      },
    },
    {
      name: 'extractCitations: section before any file on a line is ignored, not a citation',
      fn: () => extractCitations('§9 does not appear before any file here').length === 0,
    },
    {
      name: 'extractCitations: a line without a file produces no citation',
      fn: () => extractCitations('prose only, no backticks, no section').length === 0,
    },
    {
      name: 'extractSections: level 1 and 2 headings, with and without a trailing period',
      fn: () => {
        const s = extractSections('# 8. Create a new module\n\n## 9.1 New field in the contract\n');
        return s.has('8') && s.has('9.1') && !s.has('9');
      },
    },
    {
      name: 'extractSections: numbered prose is not a section; it must be a heading',
      fn: () => extractSections('This talks about 9.1 but is not a heading').size === 0,
    },
    {
      name: 'orphanPoints: a cited section still exists, so there is no orphan',
      fn: () => {
        const citations = [{ file: '01-modulo.md', section: '9.1', line: 1 }];
        const map = new Map([['01-modulo.md', new Set(['8', '9', '9.1'])]]);
        return orphanPoints(citations, map).length === 0;
      },
    },
    {
      name: 'orphanPoints: cited section no longer exists after renumbering, so it is an orphan',
      fn: () => {
        const citations = [{ file: '01-modulo.md', section: '9.9', line: 5 }];
        const map = new Map([['01-modulo.md', new Set(['8', '9', '9.1'])]]);
        const orphans = orphanPoints(citations, map);
        return orphans.length === 1 && orphans[0].section === '9.9';
      },
    },
    {
      name: 'orphanPoints: cited file is outside the map after rename or deletion, so it is an orphan',
      fn: () => {
        const citations = [{ file: '99-ghost.md', section: '1', line: 2 }];
        const map = new Map([['01-modulo.md', new Set(['1'])]]);
        return orphanPoints(citations, map).length === 1;
      },
    },
  ];
}

function runSelfTest() {
  let failures = 0;
  for (const testCase of selfTestCases()) {
    let ok;
    try {
      ok = testCase.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  const total = selfTestCases().length;
  process.stdout.write(`\nself-test (verify-map): ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return runSelfTest();

  const index = argv.indexOf('--check');
  if (index === -1 || argv[index + 1] === undefined) {
    process.stderr.write('Usage: node tests/verify-map.mjs --check <architecture-directory>\n'
      + '     node tests/verify-map.mjs --selftest\n');
    return 1;
  }

  const architectureDir = resolve(argv[index + 1]);
  const result = check(architectureDir);
  process.stdout.write(result.ok
    ? `map: OK — ${architectureDir}\n`
    : `map: FAILED — ${result.reason}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
