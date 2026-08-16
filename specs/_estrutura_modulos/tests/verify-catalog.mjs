#!/usr/bin/env node
/**
 * verify-catalog.mjs — a catraca que falta entre a lei e o código: prova que os ids de regra do
 * `engine.mjs` e as linhas de tabela de `# 4. O catálogo` em `04-regras.md` são o MESMO conjunto —
 * e, com o terceiro argumento, que nenhum comentário de `tools/**` cita uma contagem defasada.
 * Lei dona: nenhuma — ferramenta de manutenção do TEMPLATE, como `verify-map.mjs` (mesmo motivo de
 * ficar fora de `tools/`: um projeto gerado não gera catálogo novo, e não precisa reverificar o
 * PRÓPRIO catálogo depois de instalado).
 *
 *   node tests/verify-catalog.mjs --conferir <04-regras.md> <engine.mjs> [<raiz-de-tools>]
 *   node tests/verify-catalog.mjs --autoteste   prova o núcleo com fixtures
 *
 * Sem a checagem de ids, a lei podia citar um id que o código não tem — ou o código ganhar um id que a
 * lei nunca documentou — e nada acusava: a camada 2 prova código ↔ `cases.mjs`, a camada 4 prova que
 * todo `--autoteste` está no REGISTRO, e nenhuma das duas olha para o TEXTO da lei. Foi assim que
 * `04-regras.md` citou `tests`/`contract` — ids que o `engine.mjs` nunca teve (sempre foram
 * `testes`/`contrato`) — sem o gate nem o autoteste do template acusarem nada.
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
 * NÚCLEO × CASCA, precedente de `verify-map.mjs`: todas as funções do núcleo são puras — nenhuma
 * toca `fs` nem importa módulo. `--autoteste` prova as quatro com fixtures em memória.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs` nem importa módulo.
// ================================================================================================

const INICIO_CATALOGO = /^# 4\. O catálogo\s*$/;
const PROXIMO_TOPICO_NIVEL_1 = /^# \d/;
const RE_LINHA_DE_REGRA = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(erro|aviso)\s*\|/;

/**
 * Os ids que `04-regras.md` cita em linha de tabela dentro de `# 4. O catálogo` — a única seção
 * onde `| \`id\` | nível | verifica | escopo |` é o formato real de linha (§4.7 tem uma SEGUNDA
 * tabela, sem crase no primeiro campo — "complexidade ciclomática" —, e por isso nunca casa aqui).
 * Preserva duplicata de propósito: é `compararCatalogos` quem decide o que fazer com ela.
 */
export function extrairIdsDaLei(textoDoutrina) {
  const ids = [];
  let dentroDoCatalogo = false;
  for (const linha of textoDoutrina.split('\n')) {
    if (INICIO_CATALOGO.test(linha)) { dentroDoCatalogo = true; continue; }
    if (dentroDoCatalogo && PROXIMO_TOPICO_NIVEL_1.test(linha)) break;
    if (!dentroDoCatalogo) continue;
    const casado = linha.match(RE_LINHA_DE_REGRA);
    if (casado) ids.push(casado[1]);
  }
  return ids;
}

/**
 * `{ soCodigo, soLei, duplicadosNaLei }` — as três formas de divergir. `soCodigo`: o `engine.mjs`
 * registrou a regra e a lei nunca a documentou. `soLei`: a lei cita um id que nenhuma regra tem —
 * o defeito medido (`tests`/`contract`). `duplicadosNaLei`: a mesma linha entrou duas vezes na
 * tabela, sinal de cópia malfeita entre seções.
 */
export function compararCatalogos(idsCodigo, idsLei) {
  const codigoSet = new Set(idsCodigo);
  const leiSet = new Set(idsLei);
  const contagem = new Map();
  for (const id of idsLei) contagem.set(id, (contagem.get(id) ?? 0) + 1);
  return {
    soCodigo: [...codigoSet].filter((id) => !leiSet.has(id)).sort(),
    soLei: [...leiSet].filter((id) => !codigoSet.has(id)).sort(),
    duplicadosNaLei: [...contagem.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort(),
  };
}

// As duas únicas formas medidas em `tools/**` — nunca em `.md` (ver o limite declarado no cabeçalho).
// Âncora estreita de propósito: "regras com caso"/"regras suas" tem UM significado só, sempre o
// TOTAL do catálogo ou o escopo `module`, nunca narrativa de transição (`X → Y`, que usa outra forma).
const RE_CITACAO_TOTAL = /\b(\d+)\s+regras\s+com\s+caso\b/g;
const RE_CITACAO_MODULO = /\b(\d+)\s+regras\s+suas\b/g;

/**
 * `{ arquivo, linha, numero, tipo }` de cada citação de contagem em `textosPorArquivo` (já lidos
 * pela casca — este núcleo não decide QUAIS arquivos ler, só extrai o que está no texto dado).
 * `tipo` é `'total'` (o catálogo inteiro) ou `'modulo'` (só o escopo `module`).
 */
export function citacoesDeContagem(textosPorArquivo) {
  const achados = [];
  for (const { arquivo, texto } of textosPorArquivo) {
    texto.split('\n').forEach((linha, indice) => {
      for (const casado of linha.matchAll(RE_CITACAO_TOTAL)) {
        achados.push({ arquivo, linha: indice + 1, numero: Number(casado[1]), tipo: 'total' });
      }
      for (const casado of linha.matchAll(RE_CITACAO_MODULO)) {
        achados.push({ arquivo, linha: indice + 1, numero: Number(casado[1]), tipo: 'modulo' });
      }
    });
  }
  return achados;
}

/** As citações cujo número diverge do esperado para o `tipo` — o que a CASCA reprova. `esperado` é
 * `{ total, modulo }`, os dois valores de verdade (importados do `engine.mjs`, nunca hardcoded aqui). */
export function citacoesDefasadas(citacoes, esperado) {
  return citacoes.filter((c) => c.numero !== esperado[c.tipo]);
}

// ================================================================================================
// CASCA — toca disco e importa módulo.
// ================================================================================================

function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

const EXT_VARREDURA = new Set(['.mjs', '.py', '.js', '.ts']);

/** Todo arquivo de código sob `raiz` (recursivo), já lido — o universo que `citacoesDeContagem`
 * varre. `node_modules`/`.git`/cache não existem dentro de `tools/**` do template, mas o filtro
 * fica aqui por barato e por simetria com `run-all-selftests.mjs`. */
function lerArvoreDeCodigo(raiz) {
  const IGNORAR = new Set(['node_modules', '.git', '__pycache__']);
  const achados = [];
  const pilha = [raiz];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    for (const entrada of readdirSync(atual, { withFileTypes: true })) {
      if (IGNORAR.has(entrada.name)) continue;
      const caminho = join(atual, entrada.name);
      if (entrada.isDirectory()) { pilha.push(caminho); continue; }
      if (!EXT_VARREDURA.has(extname(entrada.name))) continue;
      achados.push({ arquivo: relative(raiz, caminho).split('\\').join('/'), texto: lerTexto(caminho) });
    }
  }
  return achados;
}

/** `{ id, escopo }` de cada regra registrada — a base tanto dos ids (checagem 1) quanto das duas
 * contagens de verdade, total e `module`, que a checagem 2 usa como denominador. */
async function idsDoRegras(caminhoEngine) {
  const modulo = await import(pathToFileURL(caminhoEngine).href);
  return modulo.REGRAS.map((regra) => ({ id: regra.id, escopo: regra.escopo }));
}

/** O veredito completo para um par real `(04-regras.md, engine.mjs)`, mais a checagem de contagem
 * em `tools/**` quando `raizTools` é dado — `undefined` pula essa metade sem reprovar por falta. */
async function conferir(caminhoDoutrina, caminhoEngine, raizTools) {
  if (!existsSync(caminhoDoutrina)) return { ok: false, motivo: `lei nao encontrada: ${caminhoDoutrina}` };
  if (!existsSync(caminhoEngine)) return { ok: false, motivo: `engine nao encontrado: ${caminhoEngine}` };

  const idsLei = extrairIdsDaLei(lerTexto(caminhoDoutrina));
  const regrasCodigo = (await idsDoRegras(caminhoEngine));
  const idsCodigo = regrasCodigo.map((r) => r.id);
  const { soCodigo, soLei, duplicadosNaLei } = compararCatalogos(idsCodigo, idsLei);

  const linhas = [];
  if (soCodigo.length > 0) linhas.push(`  codigo tem, a lei nao cita: ${soCodigo.join(', ')}`);
  if (soLei.length > 0) linhas.push(`  a lei cita, codigo nao tem: ${soLei.join(', ')}`);
  if (duplicadosNaLei.length > 0) linhas.push(`  id duplicado na tabela da lei: ${duplicadosNaLei.join(', ')}`);

  if (raizTools !== undefined) {
    if (!existsSync(raizTools)) return { ok: false, motivo: `raiz de tools/ nao encontrada: ${raizTools}` };
    const esperado = { total: idsCodigo.length, modulo: regrasCodigo.filter((r) => r.escopo === 'module').length };
    const defasadas = citacoesDefasadas(citacoesDeContagem(lerArvoreDeCodigo(raizTools)), esperado);
    for (const d of defasadas) {
      linhas.push(`  ${d.arquivo}:${d.linha} cita "${d.numero} regras ${d.tipo === 'total' ? 'com caso' : 'suas'}",`
        + ` esperado ${esperado[d.tipo]}`);
    }
  }

  if (linhas.length === 0) return { ok: true, motivo: null, total: idsCodigo.length };
  return { ok: false, motivo: linhas.join('\n') };
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória, sem tocar disco nem importar módulo.
// ================================================================================================

const FIXTURE_CATALOGO = [
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
  '| `manifesto` | erro | descricao | módulo |',
  '| `estrutura` | erro | descricao | módulo |',
  '',
  '## 4.7 Escrita',
  '',
  '| id | nível | verifica | escopo |',
  '|---|---|---|---|',
  '| `limiar-funcao` | erro | descricao | módulo |',
  '',
  '| Regra | nível | Limiar | Por |',
  '|---|---|---|---|',
  '| complexidade ciclomática | aviso | 10 | linter |',
  '',
  '# 5. A cadeia de verificação',
  '',
  '| `nao-e-regra` | erro | isto e de outra secao, nunca deveria contar | módulo |',
].join('\n');

function casosDeAutoteste() {
  return [
    {
      nome: 'extrairIdsDaLei: pega as linhas de regra dentro de # 4. O catalogo',
      fn: () => {
        const ids = extrairIdsDaLei(FIXTURE_CATALOGO);
        return ids.length === 3 && ids.includes('manifesto') && ids.includes('estrutura') && ids.includes('limiar-funcao');
      },
    },
    {
      nome: 'extrairIdsDaLei: ignora a tabela de nomes (§3) antes do catalogo',
      fn: () => !extrairIdsDaLei(FIXTURE_CATALOGO).includes('modules/catalogo/'),
    },
    {
      nome: 'extrairIdsDaLei: ignora a segunda tabela do §4.7 (sem crase no id)',
      fn: () => !extrairIdsDaLei(FIXTURE_CATALOGO).includes('complexidade ciclomática'),
    },
    {
      nome: 'extrairIdsDaLei: para no proximo topico de nivel 1 (# 5.), nao vaza para a secao seguinte',
      fn: () => !extrairIdsDaLei(FIXTURE_CATALOGO).includes('nao-e-regra'),
    },
    {
      nome: 'compararCatalogos: mesmo conjunto -> nenhuma divergencia',
      fn: () => {
        const r = compararCatalogos(['a', 'b'], ['a', 'b']);
        return r.soCodigo.length === 0 && r.soLei.length === 0 && r.duplicadosNaLei.length === 0;
      },
    },
    {
      nome: 'compararCatalogos: id so no codigo -> soCodigo',
      fn: () => {
        const r = compararCatalogos(['a', 'b'], ['a']);
        return r.soCodigo.length === 1 && r.soCodigo[0] === 'b';
      },
    },
    {
      nome: 'compararCatalogos: id que a lei cita e o codigo nao tem -> soLei (o defeito medido: tests/contract)',
      fn: () => {
        const r = compararCatalogos(['testes', 'contrato'], ['tests', 'contrato']);
        return r.soLei.length === 1 && r.soLei[0] === 'tests' && r.soCodigo.length === 1 && r.soCodigo[0] === 'testes';
      },
    },
    {
      nome: 'compararCatalogos: id duplicado na tabela da lei -> duplicadosNaLei',
      fn: () => {
        const r = compararCatalogos(['a'], ['a', 'a']);
        return r.duplicadosNaLei.length === 1 && r.duplicadosNaLei[0] === 'a';
      },
    },
    {
      nome: 'citacoesDeContagem: acha "N regras com caso" e "N regras suas", com arquivo e linha',
      fn: () => {
        const c = citacoesDeContagem([
          { arquivo: 'a.mjs', texto: 'linha 1\nnao conta para as 73 regras com caso do catalogo\n' },
          { arquivo: 'b.mjs', texto: 'ja tem 57 regras suas' },
        ]);
        return c.length === 2
          && c[0].arquivo === 'a.mjs' && c[0].linha === 2 && c[0].numero === 73 && c[0].tipo === 'total'
          && c[1].arquivo === 'b.mjs' && c[1].linha === 1 && c[1].numero === 57 && c[1].tipo === 'modulo';
      },
    },
    {
      nome: 'citacoesDeContagem: NAO casa transicao "X -> Y regras" (narrativa historica correta em .md)',
      fn: () => citacoesDeContagem([
        { arquivo: 'ultimas-atualizacoes.md', texto: '75 -> 76 regras, com caso novo em cases.mjs' },
      ]).length === 0,
    },
    {
      nome: 'citacoesDeContagem: NAO casa "nao conta para o catalogo" sem numero nenhum (o padrao seguro)',
      fn: () => citacoesDeContagem([
        { arquivo: 'verify-commit.mjs', texto: 'nao tem id, nao conta para as regras com caso do catalogo' },
      ]).length === 0,
    },
    {
      nome: 'citacoesDeContagem: NAO casa contagem de outra coisa ("N regras citam X")',
      fn: () => citacoesDeContagem([
        { arquivo: '04-regras.md', texto: '33 regras citam (§7.2) na linha de catalogo' },
      ]).length === 0,
    },
    {
      nome: 'citacoesDefasadas: numero bate o esperado -> nenhuma defasada',
      fn: () => citacoesDefasadas(
        [{ arquivo: 'a.mjs', linha: 1, numero: 76, tipo: 'total' }],
        { total: 76, modulo: 58 },
      ).length === 0,
    },
    {
      nome: 'citacoesDefasadas: numero diverge do esperado -> defasada (o defeito medido: 73/74/57)',
      fn: () => {
        const r = citacoesDefasadas(
          [{ arquivo: 'affected.mjs', linha: 5, numero: 73, tipo: 'total' },
            { arquivo: 'context.mjs', linha: 39, numero: 57, tipo: 'modulo' }],
          { total: 76, modulo: 58 },
        );
        return r.length === 2;
      },
    },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  for (const caso of casosDeAutoteste()) {
    let ok;
    try {
      ok = caso.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  const total = casosDeAutoteste().length;
  process.stdout.write(`\nautoteste (verify-catalog): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

async function principal() {
  const argv = process.argv.slice(2);
  if (argv.includes('--autoteste')) return rodarAutoteste();

  const indice = argv.indexOf('--conferir');
  if (indice === -1 || argv[indice + 1] === undefined || argv[indice + 2] === undefined) {
    process.stderr.write('uso: node tests/verify-catalog.mjs --conferir <04-regras.md> <engine.mjs> [<raiz-de-tools>]\n'
      + '     node tests/verify-catalog.mjs --autoteste\n');
    return 1;
  }

  const caminhoDoutrina = resolve(argv[indice + 1]);
  const caminhoEngine = resolve(argv[indice + 2]);
  const raizTools = argv[indice + 3] !== undefined ? resolve(argv[indice + 3]) : undefined;
  const resultado = await conferir(caminhoDoutrina, caminhoEngine, raizTools);
  process.stdout.write(resultado.ok
    ? `catalogo: OK — ${resultado.total} ids, lei e codigo batem\n`
    : `catalogo: REPROVADO —\n${resultado.motivo}\n`);
  return resultado.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().then((codigo) => process.exit(codigo));
}
