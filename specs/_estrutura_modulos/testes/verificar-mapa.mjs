#!/usr/bin/env node
/**
 * verificar-mapa.mjs — prova que `specs/arquitetura/README.md` (o mapa, plan-2.1.md Bloco U) está
 * instalado e que todo `§` que ele cita resolve a um título real do arquivo que ele nomeia.
 * Lei dona: nenhuma — ferramenta de manutenção do TEMPLATE, como `autoteste-template.mjs` (mesmo
 * motivo de ficar fora de `ferramentas/`: D3 daquele arquivo — um projeto gerado não gera projeto,
 * e não precisa reverificar o PRÓPRIO mapa depois de instalado).
 *
 *   node testes/verificar-mapa.mjs --conferir <pastaArquitetura>   confere um specs/arquitetura/ real
 *   node testes/verificar-mapa.mjs --autoteste                     prova o núcleo com fixtures em memória
 *
 * A TRAVA É O PONTEIRO, NÃO O BYTE (Bloco U): não compara o mapa byte a byte com uma cópia de
 * referência — isso pegaria edição manual, que não é o risco. O risco é `§` citado que deixou de
 * existir quando a lei for reorganizada. Por isso o núcleo lê os TÍTULOS reais de cada arquivo citado
 * e confere que a seção referida ainda está lá — precedente de `skills/meta-verificacao-base/scripts/
 * ponteiros.py`, mesma ideia, outro alvo (a doutrina do template, não a base inteira).
 *
 * NÚCLEO × CASCA, precedente de `afetados.mjs`: `extrairCitacoes`/`extrairSecoes`/`pontosOrfaos` são
 * puras — nenhuma toca `fs`. `--autoteste` prova as três com fixtures em memória.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`.
// ================================================================================================

const RE_ARQUIVO = /`([\w.-]+\.md)`/g;
const RE_SECAO = /§(\d+(?:\.\d+)?)/g;

/**
 * `{arquivo, secao, linha}` de cada citação `` `arquivo.md` §N[.M] `` do texto — as duas marcas na
 * MESMA linha (o formato que o mapa usa em toda tabela e em toda prosa). Quando mais de um arquivo
 * aparece antes da seção na mesma linha, associa ao MAIS PRÓXIMO que a precede — é como uma frase lida
 * da esquerda para a direita associa naturalmente. Sem arquivo nenhum antes da seção na linha, a
 * citação é ignorada (não é uma citação cruzada — provavelmente é o número de uma lista).
 */
export function extrairCitacoes(texto) {
  const citacoes = [];
  const linhas = texto.split('\n');
  linhas.forEach((linha, indice) => {
    const arquivos = [...linha.matchAll(RE_ARQUIVO)];
    if (arquivos.length === 0) return;
    for (const secaoMatch of linha.matchAll(RE_SECAO)) {
      const precedentes = arquivos.filter((a) => a.index < secaoMatch.index);
      if (precedentes.length === 0) continue;
      const arquivo = precedentes.at(-1)[1];
      citacoes.push({ arquivo, secao: secaoMatch[1], linha: indice + 1 });
    }
  });
  return citacoes;
}

/** Cabeçalho `#+ N[.M][.] Título` -> o número da seção, como string (`"9"`, `"9.1"`). */
const RE_TITULO = /^#{1,6}\s+(\d+(?:\.\d+)?)\.?\s+\S/;

/** O conjunto de números de seção que o arquivo REALMENTE declara em título — o que um `§` pode citar. */
export function extrairSecoes(texto) {
  const secoes = new Set();
  for (const linha of texto.split('\n')) {
    const casado = linha.match(RE_TITULO);
    if (casado) secoes.add(casado[1]);
  }
  return secoes;
}

/**
 * As citações que NÃO resolvem: arquivo fora do mapa de seções conhecido, ou seção que o arquivo não
 * declara em título nenhum. `secoesPorArquivo` é `Map<nomeDoArquivo, Set<secao>>` — monta-se na casca,
 * lendo os arquivos de verdade; aqui é só comparação.
 */
export function pontosOrfaos(citacoes, secoesPorArquivo) {
  return citacoes.filter(({ arquivo, secao }) => {
    const secoes = secoesPorArquivo.get(arquivo);
    return secoes === undefined || !secoes.has(secao);
  });
}

// ================================================================================================
// CASCA — toca disco. Só as duas funções abaixo.
// ================================================================================================

function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

/** `Map<nomeDoArquivo, Set<secao>>` de todo `.md` da pasta de arquitetura — o universo que resolve as citações do mapa. */
function montarSecoesPorArquivo(pastaArquitetura) {
  const mapa = new Map();
  for (const entrada of readdirSync(pastaArquitetura, { withFileTypes: true })) {
    if (!entrada.isFile() || !entrada.name.endsWith('.md')) continue;
    mapa.set(entrada.name, extrairSecoes(lerTexto(join(pastaArquitetura, entrada.name))));
  }
  return mapa;
}

/**
 * O veredito completo para uma pasta `specs/arquitetura/` real: mapa instalado? ponteiros resolvem?
 * `{ ok, motivo }` — `motivo` só quando `ok` é `false`, sempre com detalhe suficiente para localizar.
 */
function conferir(pastaArquitetura) {
  const caminhoMapa = join(pastaArquitetura, 'README.md');
  if (!existsSync(caminhoMapa)) {
    return { ok: false, motivo: `mapa nao instalado: ${caminhoMapa} nao existe` };
  }

  const citacoes = extrairCitacoes(lerTexto(caminhoMapa));
  const secoesPorArquivo = montarSecoesPorArquivo(pastaArquitetura);
  const orfaos = pontosOrfaos(citacoes, secoesPorArquivo);
  if (orfaos.length > 0) {
    const linhas = orfaos.map((o) => `  README.md:${o.linha} -> \`${o.arquivo}\` §${o.secao} nao existe`);
    return { ok: false, motivo: `${orfaos.length} ponteiro(s) orfao(s):\n${linhas.join('\n')}` };
  }
  return { ok: true, motivo: null };
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória, sem tocar disco.
// ================================================================================================

function casosDeAutoteste() {
  return [
    {
      nome: 'extrairCitacoes: arquivo e secao na mesma linha, tabela markdown',
      fn: () => {
        const c = extrairCitacoes('| … alterar campo | `01-modulo.md` §9.1 |');
        return c.length === 1 && c[0].arquivo === '01-modulo.md' && c[0].secao === '9.1';
      },
    },
    {
      nome: 'extrairCitacoes: duas secoes do mesmo arquivo, mesma linha',
      fn: () => {
        const c = extrairCitacoes('ver `01-modulo.md` §8 e §9 para criar e alterar');
        return c.length === 2 && c.every((x) => x.arquivo === '01-modulo.md') && c[0].secao === '8' && c[1].secao === '9';
      },
    },
    {
      nome: 'extrairCitacoes: secao antes de qualquer arquivo na linha e ignorada (nao e citacao)',
      fn: () => extrairCitacoes('§9 nao aparece antes de nenhum arquivo aqui').length === 0,
    },
    {
      nome: 'extrairCitacoes: linha sem arquivo nenhum nao produz citacao',
      fn: () => extrairCitacoes('so prosa, nenhuma crase, nenhuma secao').length === 0,
    },
    {
      nome: 'extrairSecoes: titulos de nivel 1 e 2, com e sem ponto final',
      fn: () => {
        const s = extrairSecoes('# 8. Criar um modulo novo\n\n## 9.1 Campo novo no contrato\n');
        return s.has('8') && s.has('9.1') && !s.has('9');
      },
    },
    {
      nome: 'extrairSecoes: linha de prosa com numero nao vira secao (precisa ser cabecalho)',
      fn: () => extrairSecoes('Isto fala de 9.1 mas nao e um titulo').size === 0,
    },
    {
      nome: 'pontosOrfaos: secao existe no arquivo citado -> nenhum orfao',
      fn: () => {
        const citacoes = [{ arquivo: '01-modulo.md', secao: '9.1', linha: 1 }];
        const mapa = new Map([['01-modulo.md', new Set(['8', '9', '9.1'])]]);
        return pontosOrfaos(citacoes, mapa).length === 0;
      },
    },
    {
      nome: 'pontosOrfaos: secao NAO existe mais no arquivo (renumerado) -> orfao',
      fn: () => {
        const citacoes = [{ arquivo: '01-modulo.md', secao: '9.9', linha: 5 }];
        const mapa = new Map([['01-modulo.md', new Set(['8', '9', '9.1'])]]);
        const orfaos = pontosOrfaos(citacoes, mapa);
        return orfaos.length === 1 && orfaos[0].secao === '9.9';
      },
    },
    {
      nome: 'pontosOrfaos: arquivo citado nao esta no universo (renomeado/apagado) -> orfao',
      fn: () => {
        const citacoes = [{ arquivo: '99-fantasma.md', secao: '1', linha: 2 }];
        const mapa = new Map([['01-modulo.md', new Set(['1'])]]);
        return pontosOrfaos(citacoes, mapa).length === 1;
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
  process.stdout.write(`\nautoteste (verificar-mapa): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function principal() {
  const argv = process.argv.slice(2);
  if (argv.includes('--autoteste')) return rodarAutoteste();

  const indice = argv.indexOf('--conferir');
  if (indice === -1 || argv[indice + 1] === undefined) {
    process.stderr.write('uso: node testes/verificar-mapa.mjs --conferir <pastaArquitetura>\n'
      + '     node testes/verificar-mapa.mjs --autoteste\n');
    return 1;
  }

  const pastaArquitetura = resolve(argv[indice + 1]);
  const resultado = conferir(pastaArquitetura);
  process.stdout.write(resultado.ok
    ? `mapa: OK — ${pastaArquitetura}\n`
    : `mapa: REPROVADO — ${resultado.motivo}\n`);
  return resultado.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
