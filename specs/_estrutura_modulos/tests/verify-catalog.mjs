#!/usr/bin/env node
/**
 * verify-catalog.mjs — a catraca que falta entre a lei e o código: prova que os ids de regra do
 * `engine.mjs` e as linhas de tabela de `# 4. O catálogo` em `04-regras.md` são o MESMO conjunto —
 * com o terceiro argumento, que nenhum comentário de `tools/**` cita uma contagem defasada — e,
 * com `--check-vocabulary`, que o vocabulário de portas é o MESMO nos cinco lugares que o
 * repetem à mão.
 * Lei dona: nenhuma — ferramenta de manutenção do TEMPLATE, como `verify-map.mjs` (mesmo motivo de
 * ficar fora de `tools/`: um projeto gerado não gera catálogo novo, e não precisa reverificar o
 * PRÓPRIO catálogo depois de instalado).
 *
 *   node tests/verify-catalog.mjs --check <04-regras.md> <engine.mjs> [<raiz-de-tools>]
 *   node tests/verify-catalog.mjs --check-vocabulary <raiz-do-template>
 *   node tests/verify-catalog.mjs --check-renames <decisoes.md> <renamed-rules.json> <engine.mjs> [--write]
 *   node tests/verify-catalog.mjs --selftest   prova o núcleo com fixtures
 *
 * Sem a checagem de ids, a lei podia citar um id que o código não tem — ou o código ganhar um id que a
 * lei nunca documentou — e nada acusava: a camada 2 prova código ↔ `cases.mjs`, a camada 4 prova que
 * todo `--selftest` está no REGISTRO, e nenhuma das duas olha para o TEXTO da lei. Foi assim que
 * `04-regras.md` citou ids que o `engine.mjs` nunca teve (a lei e o código usavam grafias
 * diferentes) — sem o gate nem o autoteste do template acusarem nada.
 *
 * A checagem de CONTAGEM (terceiro argumento) fecha um segundo defeito medido, primo do primeiro:
 * comentário de `tools/**` citando "N regras com caso"/"N regras suas" em prosa, sem ligação
 * nenhuma ao catálogo — `affected.mjs`, `contract-compatible.mjs` e `gate/context.mjs` chegaram a
 * ficar 1-3 campanhas atrasados (73/74/57 contra o 76/58 real) sem nenhum verificador notar.
 *
 * **Limite declarado, não escondido (04-regras.md §7.2): a checagem de contagem só varre `tools/**`,
 * nunca `.md`.** Prosa em `.md` usa o MESMO vocabulário ("regras", números) para narrar história
 * corrigível só por leitura — `"75 → 76 regras"` é uma transição correta, `"33 regras citam (§7.2)"`
 * conta uma coisa que não é o total do catálogo, e `"não conta para o catálogo"` sem número nenhum é
 * o próprio padrão seguro. Nenhuma forma sintática distingue esses três de uma contagem realmente
 * defasada sem arriscar falso positivo em texto historicamente correto — e "cobertura inventada é
 * pior que lacuna declarada" (04-regras.md §7). `tools/**` não tem esse problema: as únicas duas
 * frases usadas lá (medido) são "N regras com caso" e "N regras suas", sempre no PRESENTE, nunca
 * narrando transição.
 *
 * A checagem de VOCABULÁRIO (`--check-vocabulary`) fecha um terceiro primo: o vocabulário de
 * portas está duplicado à mão em cinco lugares (`ports-vocabulary.mjs` — a "FONTE ÚNICA" segundo o
 * próprio cabeçalho dele —, `module.schema.json:ports.items.enum`, e os três `packages/ports/index.*`
 * de TS/JS/Python), e nada comparava as cinco. **Desde a Onda 3 do `ADR-013`/`ADR-016`, o SÍMBOLO que
 * carrega a lista não é mais o mesmo texto nos cinco**: `KNOWN_PORTS` em `ports-vocabulary.mjs`
 * (ferramental de `tools/`, nome fica português — `ADR-009` linha 4), `KNOWN_PORTS` nos três
 * `packages/ports/index.*` (esqueleto, nome vai inglês — linha 3). `extractSourcePorts` reconhece
 * os dois nomes de símbolo; o que a checagem exige igual nos cinco é o CONTEÚDO (o conjunto de
 * portas), nunca o nome do símbolo que o carrega. Compara por CONJUNTO, não por ordem — a mesma
 * disciplina de `compareCatalogs`. **Sem cláusula de "porta sem `FABRICAS`"**: a decisão foi não
 * escrevê-la — exigiria lista de exceção editorial (toda porta sem provedor padrão, como
 * `tokenVerifier`, entraria nela), e uma cláusula que precisa de exceção editorial vale menos que a
 * cláusula de conjunto sozinha e correta.
 *
 * NÚCLEO × CASCA, precedente de `verify-map.mjs`: todas as funções do núcleo são puras — nenhuma
 * toca `fs` nem importa módulo. `--selftest` prova todas com fixtures em memória.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs` nem importa módulo.
// ================================================================================================

const CATALOG_START = /^# 4\. O catálogo\s*$/;
const NEXT_LEVEL_TOPIC_1 = /^# \d/;
const RE_RULE_LINE = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(erro|aviso)\s*\|/;

/**
 * Os ids que `04-regras.md` cita em linha de tabela dentro de `# 4. O catálogo` — a única seção
 * onde `| \`id\` | nível | verifica | escopo |` é o formato real de linha (§4.7 tem uma SEGUNDA
 * tabela, sem crase no primeiro campo — "complexidade ciclomática" —, e por isso nunca casa aqui).
 * Preserva duplicata de propósito: é `compareCatalogs` quem decide o que fazer com ela.
 */
export function extractLawIds(doctrineText) {
  const ids = [];
  let insideCatalog = false;
  for (const line of doctrineText.split('\n')) {
    if (CATALOG_START.test(line)) { insideCatalog = true; continue; }
    if (insideCatalog && NEXT_LEVEL_TOPIC_1.test(line)) break;
    if (!insideCatalog) continue;
    const matched = line.match(RE_RULE_LINE);
    if (matched) ids.push(matched[1]);
  }
  return ids;
}

/**
 * `{ soCodigo, soLei, duplicadosNaLei }` — as três formas de divergir. `soCodigo`: o `engine.mjs`
 * registrou a regra e a lei nunca a documentou. `soLei`: a lei cita um id que nenhuma regra tem —
 * o defeito medido (`tests`/`contract`). `duplicadosNaLei`: a mesma linha entrou duas vezes na
 * tabela, sinal de cópia malfeita entre seções.
 */
export function compareCatalogs(codeIds, lawIds) {
  const codeSet = new Set(codeIds);
  const lawSet = new Set(lawIds);
  const count = new Map();
  for (const id of lawIds) count.set(id, (count.get(id) ?? 0) + 1);
  return {
    codeOnly: [...codeSet].filter((id) => !lawSet.has(id)).sort(),
    lawOnly: [...lawSet].filter((id) => !codeSet.has(id)).sort(),
    duplicatesInLaw: [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort(),
  };
}

// As duas únicas formas medidas em `tools/**` — nunca em `.md` (ver o limite declarado no cabeçalho).
// Âncora estreita de propósito: "regras com caso"/"regras suas" tem UM significado só, sempre o
// TOTAL do catálogo ou o escopo `module`, nunca narrativa de transição (`X → Y`, que usa outra forma).
const RE_TOTAL_CITATION = /\b(\d+)\s+regras\s+com\s+caso\b/g;
const RE_MODULE_CITATION = /\b(\d+)\s+regras\s+suas\b/g;

/**
 * `{ arquivo, linha, numero, tipo }` de cada citação de contagem em `textosPorArquivo` (já lidos
 * pela casca — este núcleo não decide QUAIS arquivos ler, só extrai o que está no texto dado).
 * `tipo` é `'total'` (o catálogo inteiro) ou `'modulo'` (só o escopo `module`).
 */
export function countCitations(textsByFile) {
  const findings = [];
  for (const { arquivo: file, text } of textsByFile) {
    text.split('\n').forEach((line, index) => {
      for (const matched of line.matchAll(RE_TOTAL_CITATION)) {
        findings.push({ arquivo: file, linha: index + 1, number: Number(matched[1]), tipo: 'total' });
      }
      for (const matched of line.matchAll(RE_MODULE_CITATION)) {
        findings.push({ arquivo: file, linha: index + 1, number: Number(matched[1]), tipo: 'modulo' });
      }
    });
  }
  return findings;
}

/** As citações cujo número diverge do esperado para o `tipo` — o que a CASCA reprova. `esperado` é
 * `{ total, modulo }`, os dois valores de verdade (importados do `engine.mjs`, nunca hardcoded aqui). */
export function staleCitations(citations, expected) {
  return citations.filter((c) => c.number !== expected[c.tipo]);
}

const RE_PORT_BETWEEN_QUOTES = /['"]([a-zA-Z][a-zA-Z0-9_]*)['"]/g;

// Âncora na ATRIBUIÇÃO (`KNOWN_PORTS = [`/`(` OU `KNOWN_PORTS = [`/`(`), nunca só no nome:
// `ports-vocabulary.mjs` CITA `KNOWN_PORTS` em prosa de comentário antes da declaração real
// (documentando os outros lugares que a repetem) — um `indexOf('KNOWN_PORTS')` ingênuo pega
// essa citação primeiro e nunca chega ao bloco de verdade. `=` é o que distingue "declarando a
// lista" de "mencionando o nome". Os DOIS nomes de símbolo (ver o cabeçalho do arquivo — Onda 3 do
// ADR-013/ADR-016 deu nomes diferentes a `tools/` e a `packages/ports/`) casam com a MESMA âncora,
// porque o que esta checagem compara é o conteúdo, nunca o nome do símbolo que o carrega.
const RE_PORTS_ASSIGNMENT = /(?:KNOWN_PORTS|KNOWN_PORTS)\s*=\s*([[(])/;

/**
 * As portas citadas dentro do bloco `KNOWN_PORTS = ( … )`/`KNOWN_PORTS = [ … ]` de `texto` — o
 * mesmo extrator serve o array JS/TS (colchete, `ports-vocabulary.mjs` e os dois `index.{ts,js}`) e a
 * tupla Python (parêntese, `__init__.py`), porque o que varia entre os dois é só o delimitador,
 * nunca a forma de cada item (string entre aspas). `null` se a atribuição não aparecer no texto, ou
 * se o delimitador de abertura não tiver par — o chamador decide o que isso significa.
 */
export function extractSourcePorts(text) {
  const matched = text.match(RE_PORTS_ASSIGNMENT);
  if (matched === null) return null;
  const opens = matched.index + matched[0].length - 1;
  const closes = text.indexOf(matched[1] === '[' ? ']' : ')', opens);
  if (closes === -1) return null;
  const block = text.slice(opens, closes);
  return [...block.matchAll(RE_PORT_BETWEEN_QUOTES)].map((m) => m[1]);
}

/**
 * `{ fonte, faltando, sobrando }[]` — só as fontes cujo CONJUNTO diverge da primeira de
 * `listasPorFonte` (o canônico — `ports-vocabulary.mjs`, a única que se declara "FONTE ÚNICA").
 * Ordem dentro de cada lista não importa, de propósito: o que a lei exige é o mesmo CONJUNTO, não
 * a mesma sequência de declaração.
 */
export function compareVocabularies(listsBySource) {
  const [first, ...rest] = listsBySource;
  const canonical = new Set(first.ports);
  const divergences = [];
  for (const { source, ports } of rest) {
    const current = new Set(ports);
    const missing = [...canonical].filter((p) => !current.has(p)).sort();
    const leftover = [...current].filter((p) => !canonical.has(p)).sort();
    if (missing.length > 0 || leftover.length > 0) divergences.push({ source, missing, leftover });
  }
  return divergences;
}

const RE_RENAME_LINE = /^\|\s*`([a-z0-9-]+)`\s*\|\s*`([a-z0-9-]+)`\s*\|\s*`([a-z0-9-]+)`(?:\s*◄)?\s*\|/;
const RENAME_TITLE = /^## ADR-024\b/;
const NEXT_ADR = /^## ADR-\d+/;

/**
 * `{ idAntigo: idNovo }` da tabela do ADR-024 (coluna B, a vigente) — só os ids que MUDAM. É a fonte
 * de `tools/gate/renamed-rules.json`: o arquivo viaja com o gate e nunca é escrito à mão, porque uma
 * tabela à mão envelhece em silêncio contra a decisão que a gerou.
 */
export function extractRenames(decisionsText) {
  const renamed = {};
  let inside = false;
  for (const line of decisionsText.split('\n')) {
    if (RENAME_TITLE.test(line)) { inside = true; continue; }
    if (inside && NEXT_ADR.test(line)) break;
    if (!inside) continue;
    const matched = line.match(RE_RENAME_LINE);
    if (matched && matched[1] !== matched[3]) renamed[matched[1]] = matched[3];
  }
  return renamed;
}

/**
 * As formas de a tabela viajante divergir: `desatualizada` (o arquivo difere do que o ADR gera),
 * `destinoFantasma` (o id novo não existe no catálogo — a dica mandaria o dono para um id que o gate
 * não conhece) e `antigoVivo` (o id "antigo" ainda existe — a dica acusaria exceção válida).
 */
export function compareRenames(expected, current, codeIds) {
  const live = new Set(codeIds);
  const keys = new Set([...Object.keys(expected), ...Object.keys(current)]);
  return {
    outdated: [...keys].filter((id) => expected[id] !== current[id]).sort(),
    phantomDestination: Object.values(current).filter((fresh) => !live.has(fresh)).sort(),
    oldAlive: Object.keys(current).filter((old) => live.has(old)).sort(),
  };
}

// ================================================================================================
// CASCA — toca disco e importa módulo.
// ================================================================================================

function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

const EXT_SCAN = new Set(['.mjs', '.py', '.js', '.ts']);

/** Todo arquivo de código sob `raiz` (recursivo), já lido — o universo que `countCitations`
 * varre. `node_modules`/`.git`/cache não existem dentro de `tools/**` do template, mas o filtro
 * fica aqui por barato e por simetria com `run-all-selftests.mjs`. */
function readCodeTree(root) {
  const IGNORE = new Set(['node_modules', '.git', '__pycache__']);
  const findings = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (IGNORE.has(entry.name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) { stack.push(path); continue; }
      if (!EXT_SCAN.has(extname(entry.name))) continue;
      findings.push({ arquivo: relative(root, path).split('\\').join('/'), text: readText(path) });
    }
  }
  return findings;
}

/** `{ id, escopo }` de cada regra registrada — a base tanto dos ids (checagem 1) quanto das duas
 * contagens de verdade, total e `module`, que a checagem 2 usa como denominador. */
async function ruleIds(enginePath) {
  const module = await import(pathToFileURL(enginePath).href);
  return module.RULES.map((rule) => ({ id: rule.id, escopo: rule.escopo }));
}

/** O veredito completo para um par real `(04-regras.md, engine.mjs)`, mais a checagem de contagem
 * em `tools/**` quando `raizTools` é dado — `undefined` pula essa metade sem reprovar por falta. */
async function check(doctrinePath, enginePath, toolsRoot) {
  if (!existsSync(doctrinePath)) return { ok: false, motivo: `doctrine not found: ${doctrinePath}` };
  if (!existsSync(enginePath)) return { ok: false, motivo: `engine not found: ${enginePath}` };

  const lawIds = extractLawIds(readText(doctrinePath));
  const codeRules = (await ruleIds(enginePath));
  const codeIds = codeRules.map((r) => r.id);
  const { codeOnly, lawOnly, duplicatesInLaw } = compareCatalogs(codeIds, lawIds);

  const lines = [];
  if (codeOnly.length > 0) lines.push(`  code contains rules missing from doctrine: ${codeOnly.join(', ')}`);
  if (lawOnly.length > 0) lines.push(`  doctrine contains rules missing from code: ${lawOnly.join(', ')}`);
  if (duplicatesInLaw.length > 0) lines.push(`  duplicate rule IDs in doctrine table: ${duplicatesInLaw.join(', ')}`);

  if (toolsRoot !== undefined) {
    if (!existsSync(toolsRoot)) return { ok: false, motivo: `tools/ root not found: ${toolsRoot}` };
    const expected = { total: codeIds.length, modulo: codeRules.filter((r) => r.escopo === 'module').length };
    const stale = staleCitations(countCitations(readCodeTree(toolsRoot)), expected);
    for (const d of stale) {
      lines.push(`  ${d.arquivo}:${d.linha} cites "${d.number} ${d.tipo === 'total' ? 'catalog rules with cases' : 'module rules'}",`
        + ` expected ${expected[d.tipo]}`);
    }
  }

  if (lines.length === 0) return { ok: true, motivo: null, total: codeIds.length };
  return { ok: false, motivo: lines.join('\n') };
}

/** Gera (`escrever`) ou confere `renamed-rules.json` contra a tabela do ADR-024 e o catálogo do engine. */
async function checkRenames(decisionsPath, jsonPath, enginePath, writeOut) {
  for (const [label, path] of [['decisions', decisionsPath], ['engine', enginePath]]) {
    if (!existsSync(path)) return { ok: false, motivo: `${label} not found: ${path}` };
  }
  const expected = extractRenames(readText(decisionsPath));
  if (Object.keys(expected).length === 0) return { ok: false, motivo: 'ADR-024 contains no renamed rule IDs' };
  if (writeOut) {
    const previous = existsSync(jsonPath) ? JSON.parse(readText(jsonPath)) : {};
    writeFileSync(jsonPath, `${JSON.stringify({ ...previous, renamed: expected }, null, 2)}\n`);
  }
  if (!existsSync(jsonPath)) return { ok: false, motivo: `rename table not found: ${jsonPath}` };
  const codeIds = (await ruleIds(enginePath)).map((r) => r.id);
  const current = JSON.parse(readText(jsonPath)).renamed ?? {};
  const { outdated, phantomDestination, oldAlive } = compareRenames(expected, current, [...codeIds, 'extraction']);
  const lines = [];
  if (outdated.length > 0) lines.push(`  table differs from ADR-024 (regenerate with --write): ${outdated.join(', ')}`);
  if (phantomDestination.length > 0) lines.push(`  destination IDs missing from the catalog: ${phantomDestination.join(', ')}`);
  if (oldAlive.length > 0) lines.push(`  old IDs still identify active rules: ${oldAlive.join(', ')}`);
  if (lines.length === 0) return { ok: true, motivo: null, total: Object.keys(current).length };
  return { ok: false, motivo: lines.join('\n') };
}

/** Os cinco lugares que repetem o vocabulário de portas à mão — caminho relativo à raiz do TEMPLATE
 * (não da base), o mesmo `raizTemplate` que `verify-routine.mjs` já resolve. A ordem importa: a
 * primeira é o CANÔNICO que `compareVocabularies` usa (ver o comentário dela). */
function vocabularySources(templateRoot) {
  return [
    { source: 'tools/gate/ports-vocabulary.mjs', caminho: join(templateRoot, 'tools', 'gate', 'ports-vocabulary.mjs'), format: 'texto' },
    { source: 'tools/gate/schemas/module.schema.json', caminho: join(templateRoot, 'tools', 'gate', 'schemas', 'module.schema.json'), format: 'schema' },
    { source: 'bindings/typescript/root/packages/ports/index.ts', caminho: join(templateRoot, 'bindings', 'typescript', 'root', 'packages', 'ports', 'index.ts'), format: 'texto' },
    { source: 'bindings/javascript/root/packages/ports/index.js', caminho: join(templateRoot, 'bindings', 'javascript', 'root', 'packages', 'ports', 'index.js'), format: 'texto' },
    { source: 'bindings/python/root/packages/ports/__init__.py', caminho: join(templateRoot, 'bindings', 'python', 'root', 'packages', 'ports', '__init__.py'), format: 'texto' },
  ];
}

/** O veredito completo para as cinco fontes de vocabulário de um template real. */
function checkVocabulary(templateRoot) {
  const listsBySource = [];
  for (const { source, caminho: path, format } of vocabularySources(templateRoot)) {
    if (!existsSync(path)) return { ok: false, motivo: `source not found (${source}): ${path}` };
    if (format === 'schema') {
      const schema = JSON.parse(readText(path));
      const ports = schema.properties?.ports?.items?.enum;
      if (!Array.isArray(ports)) return { ok: false, motivo: `${source}: properties.ports.items.enum is missing` };
      listsBySource.push({ source, ports });
      continue;
    }
    const ports = extractSourcePorts(readText(path));
    if (ports === null) return { ok: false, motivo: `${source}: KNOWN_PORTS list not found or missing a [...] / (...) block` };
    listsBySource.push({ source, ports });
  }

  const divergences = compareVocabularies(listsBySource);
  if (divergences.length === 0) return { ok: true, motivo: null, total: listsBySource[0].ports.length };
  const lines = divergences.map(({ source, missing, leftover }) => {
    const parts = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
    if (leftover.length > 0) parts.push(`extra: ${leftover.join(', ')}`);
    return `  ${source}: ${parts.join(' | ')}`;
  });
  return { ok: false, motivo: lines.join('\n') };
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória, sem tocar disco nem importar módulo.
// ================================================================================================

const FIXTURE_CATALOG = [
  '# 3. Nomes',
  '',
  '| Elemento | Padrão | Exemplo |',
  '|---|---|---|',
  '| Pasta de módulo | kebab-case | `modules/catalogo/` |',
  '',
  '# 4. O catálogo',
  '',
  '## 4.1 Estrutura',
  '',
  '| id | nível | verifica | escopo |',
  '|---|---|---|---|',
  '| `manifest` | erro | descricao | módulo |',
  '| `structure` | erro | descricao | módulo |',
  '',
  '## 4.7 Escrita',
  '',
  '| id | nível | verifica | escopo |',
  '|---|---|---|---|',
  '| `function-threshold` | erro | descricao | módulo |',
  '',
  '| Regra | nível | Limiar | Por |',
  '|---|---|---|---|',
  '| complexidade ciclomática | aviso | 10 | linter |',
  '',
  '# 5. A cadeia de verificação',
  '',
  '| `nao-e-regra` | erro | isto e de outra secao, nunca deveria contar | módulo |',
].join('\n');

function selfTestCases() {
  return [
    {
      name: 'extractLawIds: reads rule rows inside section 4, the catalog',
      fn: () => {
        const ids = extractLawIds(FIXTURE_CATALOG);
        return ids.length === 3 && ids.includes('manifest') && ids.includes('structure') && ids.includes('function-threshold');
      },
    },
    {
      name: 'extractLawIds: ignores the names table in section 3 before the catalog',
      fn: () => !extractLawIds(FIXTURE_CATALOG).includes('modules/catalogo/'),
    },
    {
      name: 'extractLawIds: ignores the second table in section 4.7 when the id is not code-formatted',
      fn: () => !extractLawIds(FIXTURE_CATALOG).includes('complexidade ciclomática'),
    },
    {
      name: 'extractLawIds: stops at the next level 1 heading and does not spill into the next section',
      fn: () => !extractLawIds(FIXTURE_CATALOG).includes('nao-e-regra'),
    },
    {
      name: 'compareCatalogs: matching sets produce no differences',
      fn: () => {
        const r = compareCatalogs(['a', 'b'], ['a', 'b']);
        return r.codeOnly.length === 0 && r.lawOnly.length === 0 && r.duplicatesInLaw.length === 0;
      },
    },
    {
      name: 'compareCatalogs: id only in code is classified as codeOnly',
      fn: () => {
        const r = compareCatalogs(['a', 'b'], ['a']);
        return r.codeOnly.length === 1 && r.codeOnly[0] === 'b';
      },
    },
    {
      name: 'compareCatalogs: id only in law is classified as lawOnly',
      fn: () => {
        const r = compareCatalogs(['tests', 'contract'], ['test', 'contract']);
        return r.lawOnly.length === 1 && r.lawOnly[0] === 'test' && r.codeOnly.length === 1 && r.codeOnly[0] === 'tests';
      },
    },
    {
      name: 'compareCatalogs: duplicate id in the law table is reported',
      fn: () => {
        const r = compareCatalogs(['a'], ['a', 'a']);
        return r.duplicatesInLaw.length === 1 && r.duplicatesInLaw[0] === 'a';
      },
    },
    {
      name: 'countCitations: reads rule counts with their file and line',
      fn: () => {
        const c = countCitations([
          { arquivo: 'a.mjs', text: 'linha 1\nnao conta para as 73 regras com caso do catalogo\n' },
          { arquivo: 'b.mjs', text: 'ja tem 57 regras suas' },
        ]);
        return c.length === 2
          && c[0].arquivo === 'a.mjs' && c[0].linha === 2 && c[0].number === 73 && c[0].tipo === 'total'
          && c[1].arquivo === 'b.mjs' && c[1].linha === 1 && c[1].number === 57 && c[1].tipo === 'modulo';
      },
    },
    {
      name: 'countCitations: does not match historical count transitions',
      fn: () => countCitations([
        { arquivo: 'notas.md', text: '75 -> 76 regras, com caso novo em cases.mjs' },
      ]).length === 0,
    },
    {
      name: 'countCitations: does not match prose saying an item does not count without a number',
      fn: () => countCitations([
        { arquivo: 'verify-commit.mjs', text: 'nao tem id, nao conta para as regras com caso do catalogo' },
      ]).length === 0,
    },
    {
      name: 'countCitations: does not match a count of a different thing',
      fn: () => countCitations([
        { arquivo: '04-regras.md', text: '33 regras citam (§7.2) na linha de catalogo' },
      ]).length === 0,
    },
    {
      name: 'staleCitations: matching expected count is not stale',
      fn: () => staleCitations(
        [{ arquivo: 'a.mjs', linha: 1, number: 76, tipo: 'total' }],
        { total: 76, modulo: 58 },
      ).length === 0,
    },
    {
      name: 'staleCitations: a count different from the expected value is stale',
      fn: () => {
        const r = staleCitations(
          [{ arquivo: 'affected.mjs', linha: 5, number: 73, tipo: 'total' },
            { arquivo: 'context.mjs', linha: 39, number: 57, tipo: 'modulo' }],
          { total: 76, modulo: 58 },
        );
        return r.length === 2;
      },
    },
    {
      name: 'extractSourcePorts: array JS/TS entre colchetes',
      fn: () => {
        const r = extractSourcePorts("export const KNOWN_PORTS = [\n  'repositorio',\n  'storage',\n] as const;");
        return r.length === 2 && r[0] === 'repositorio' && r[1] === 'storage';
      },
    },
    {
      name: 'extractSourcePorts: tupla Python entre parenteses, aspas duplas',
      fn: () => {
        const r = extractSourcePorts('KNOWN_PORTS = (\n    "repositorio",\n    "storage",\n)');
        return r.length === 2 && r[0] === 'repositorio' && r[1] === 'storage';
      },
    },
    {
      name: 'extractSourcePorts: returns null when KNOWN_PORTS is absent from the text',
      fn: () => extractSourcePorts('nada aqui') === null,
    },
    {
      name: 'compareVocabularies: matching sets in different orders have no differences',
      fn: () => compareVocabularies([
        { source: 'a', ports: ['repositorio', 'storage'] },
        { source: 'b', ports: ['storage', 'repositorio'] },
      ]).length === 0,
    },
    {
      name: 'compareVocabularies: reports a missing port in one source and an extra port in another',
      fn: () => {
        const r = compareVocabularies([
          { source: 'canonico', ports: ['repositorio', 'storage', 'auth'] },
          { source: 'incompleta', ports: ['repositorio', 'storage'] },
          { source: 'com-extra', ports: ['repositorio', 'storage', 'auth', 'fila'] },
        ]);
        const incomplete = r.find((d) => d.source === 'incompleta');
        const withExtra = r.find((d) => d.source === 'com-extra');
        return r.length === 2
          && incomplete.missing.includes('auth') && incomplete.leftover.length === 0
          && withExtra.leftover.includes('fila') && withExtra.missing.length === 0;
      },
    },
    {
      name: 'extractRenames: reads column B and ignores unchanged ids',
      fn: () => {
        const text = [
          '## ADR-024 — x', '| id atual | A | B | n |', '|---|---|---|---|',
          '| `old-one` | `old-id` | `one-old` ◄ | 3/1 |',
          '| `log` | `log` | `log` | 9/2 |',
          '## ADR-025 — y', '| `outro` | `a` | `b` | 1/1 |',
        ].join('\n');
        const r = extractRenames(text);
        return Object.keys(r).length === 1 && r['old-one'] === 'one-old';
      },
    },
    {
      name: 'compareRenames: matching ADR table and catalog needs no report',
      fn: () => {
        const r = compareRenames({ oldRule: 'newRule' }, { oldRule: 'newRule' }, ['newRule']);
        return r.outdated.length === 0 && r.phantomDestination.length === 0 && r.oldAlive.length === 0;
      },
    },
    {
      name: 'compareRenames: stale table, unknown destination, and live old id are reported separately',
      fn: () => {
        const r = compareRenames(
          { a: 'x', b: 'y' }, { a: 'x', c: 'unknown-target', 'still-live-old': 'x' }, ['x', 'still-live-old'],
        );
        return r.outdated.join() === 'b,c,still-live-old'
          && r.phantomDestination.join() === 'unknown-target' && r.oldAlive.join() === 'still-live-old';
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
  process.stdout.write(`\nself-test (verify-catalog): ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function usage() {
  process.stderr.write('Usage: node tests/verify-catalog.mjs --check <04-rules.md> <engine.mjs> [<tools-root>]\n'
    + '       node tests/verify-catalog.mjs --check-vocabulary <template-root>\n'
    + '       node tests/verify-catalog.mjs --check-renames <decisions.md> <renamed-rules.json> <engine.mjs> [--write]\n'
    + '       node tests/verify-catalog.mjs --selftest\n');
  return 1;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return runSelfTest();

  const vocabularyIndex = argv.indexOf('--check-vocabulary');
  if (vocabularyIndex !== -1) {
    if (argv[vocabularyIndex + 1] === undefined) return usage();
    const result = checkVocabulary(resolve(argv[vocabularyIndex + 1]));
    process.stdout.write(result.ok
      ? `vocabulary: OK — ${result.total} ports; all five sources match\n`
      : `vocabulary: FAILED —\n${result.motivo}\n`);
    return result.ok ? 0 : 1;
  }

  const renameIndex = argv.indexOf('--check-renames');
  if (renameIndex !== -1) {
    const [decisions, json, engine] = argv.slice(renameIndex + 1).filter((a) => !a.startsWith('--'));
    if (engine === undefined) return usage();
    const result = await checkRenames(resolve(decisions), resolve(json), resolve(engine), argv.includes('--write'));
    process.stdout.write(result.ok
      ? `renames: OK — ${result.total} ids; the shipped table matches ADR-024\n`
      : `renames: FAILED —\n${result.motivo}\n`);
    return result.ok ? 0 : 1;
  }

  const index = argv.indexOf('--check');
  if (index === -1 || argv[index + 1] === undefined || argv[index + 2] === undefined) return usage();

  const doctrinePath = resolve(argv[index + 1]);
  const enginePath = resolve(argv[index + 2]);
  const toolsRoot = argv[index + 3] !== undefined ? resolve(argv[index + 3]) : undefined;
  const result = await check(doctrinePath, enginePath, toolsRoot);
  process.stdout.write(result.ok
    ? `catalog: OK — ${result.total} ids; doctrine and code match\n`
    : `catalog: FAILED —\n${result.motivo}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
