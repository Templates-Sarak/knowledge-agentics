#!/usr/bin/env node
/**
 * executar.mjs — o autoteste do gate. Lei dona: specs/arquitetura/04-regras.md §7.3
 *
 *   node ferramentas/gate/testes/executar.mjs [--binding typescript]
 *
 * Duas afirmações, e o gate só está saudável se as duas valerem:
 *   1. o molde CONFORME produz ZERO erro — senão o gate acusa o que não deve;
 *   2. cada mutação de `casos.mjs` produz o id esperado e **NENHUM id não declarado** — senão ou a
 *      regra não cobra nada, ou outra regra passou a acusar onde não devia.
 *
 * A mutação que cria um segundo defeito de verdade declara o co-achado em `tambem: [...]`. Declarar
 * é permitido; surpreender, não. Extra fora da lista REPROVA, e é assim que uma regra nova que
 * comece a acusar em cima de caso alheio derruba o autoteste em vez de entrar calada.
 *
 * `tambem` é lido como TETO, não como obrigação: o co-achado pode não aparecer num binding cujo
 * molde não tem a peça (o `web/` só existe em TS e JS). Exigir presença tornaria a lista falsa em
 * dois dos três bindings.
 *
 * Caso que muta arquivo de código declara um ALVO LÓGICO (`rotas`, `mapeadores`) e o trecho por
 * família de sintaxe (`{ js, py }`) — ver `ALVOS` e `FAMILIA_DE_SINTAXE` abaixo. É o que permite a
 * mesma regra ser provada nos três bindings, e não só naquele em que o caso foi escrito. Onde o
 * conteúdo é agnóstico (manifesto, `config/*.json`, `openapi.yaml`, SQL), nada disso é preciso.
 *
 * A segunda é a que importa mais: uma regra quebrada passa despercebida para sempre, porque
 * "verde" é indistinguível de "não verificou". Este runner torna as duas coisas distinguíveis.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { carregarContexto } from '../contexto.mjs';
import { analisar } from '../motor.mjs';
import { CASOS } from './casos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_TEMPLATE = join(AQUI, '..', '..', '..');

/**
 * Alvos LÓGICOS — o caso nomeia o PAPEL do arquivo, e o harness resolve o caminho de cada binding.
 *
 * Sem isto, o caso precisava fixar `api/src/routes/index.ts` e só rodava em TypeScript: a regra
 * valia nos três bindings e a prova dela, num só.
 */
const ALVOS = {
  rotas: {
    typescript: 'api/src/routes/index.ts',
    javascript: 'api/src/routes/index.js',
    python: 'api/src/rotas.py',
  },
  mapeadores: {
    typescript: 'api/src/mapeadores/index.ts',
    javascript: 'api/src/mapeadores/index.js',
    python: 'api/src/mapeadores.py',
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
const FAMILIA_DE_SINTAXE = { typescript: 'js', javascript: 'js', python: 'py' };

/**
 * Falta de trecho ou de alvo NUNCA vira aprovação silenciosa: vira SEM COBERTURA declarada, com o
 * motivo, do mesmo jeito que o `ENOENT` de um caso escrito para o molde de outro binding.
 */
function semCobertura(motivo) {
  const causa = new Error(motivo);
  causa.code = 'SEM_COBERTURA';
  return causa;
}

/** Trecho agnóstico entra como string; onde a sintaxe importa, como `{ js, py }`. */
function trechoDe(trechos, binding) {
  if (typeof trechos === 'string') return trechos;
  return trechos[binding] ?? trechos[FAMILIA_DE_SINTAXE[binding]] ?? null;
}

function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8').replace(/^﻿/, ''));
}

function gravarJson(caminho, valor) {
  writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
}

/** Operações que um caso pode aplicar sobre a cópia do molde. */
function operacoes(raiz, binding) {
  const acrescentar = (rel, conteudo) => {
    const caminho = join(raiz, rel);
    writeFileSync(caminho, readFileSync(caminho, 'utf8') + conteudo, 'utf8');
  };
  return {
    escrever: (rel, conteudo) => writeFileSync(join(raiz, rel), conteudo, 'utf8'),
    acrescentar,
    /**
     * Acrescenta num alvo LÓGICO, resolvendo caminho e sintaxe pelo binding. É a operação que
     * torna um caso portável nos dois eixos de uma vez.
     */
    acrescentarEm: (alvo, trechos) => {
      const rel = ALVOS[alvo]?.[binding];
      if (rel === undefined) throw semCobertura(`o binding "${binding}" nao declara o alvo "${alvo}"`);
      const trecho = trechoDe(trechos, binding);
      if (trecho === null) throw semCobertura(`o caso nao tem trecho de "${alvo}" para a sintaxe de "${binding}"`);
      acrescentar(rel, trecho);
    },
    substituir: (rel, de, para) => {
      const caminho = join(raiz, rel);
      writeFileSync(caminho, readFileSync(caminho, 'utf8').replace(de, para), 'utf8');
    },
    remover: (rel) => rmSync(join(raiz, rel), { force: true }),
    removerPasta: (rel) => rmSync(join(raiz, rel), { recursive: true, force: true }),
    manifesto: (transformar) => {
      const caminho = join(raiz, 'modulo.json');
      gravarJson(caminho, transformar(lerJson(caminho)));
    },
    config: (assunto, transformar) => {
      const caminho = join(raiz, 'config', `${assunto}.json`);
      gravarJson(caminho, transformar(lerJson(caminho)));
    },
  };
}

/** Vizinho mínimo, para as regras globais (import lateral, tabela alheia, ciclo). */
function criarVizinho(pastaModulos, molde, consome) {
  const raiz = join(pastaModulos, 'vizinho');
  cpSync(molde, raiz, { recursive: true });
  const caminho = join(raiz, 'modulo.json');
  const manifesto = lerJson(caminho);
  manifesto.id = 'vizinho';
  manifesto.rotaBase = '/api/v1/vizinho';
  manifesto.rotaWeb = '/vizinho';
  manifesto.dados = { schema: 'escopo', prefixo: 'vizinho_', tabelas: ['vizinho_metadados'] };
  manifesto.permissoes = ['vizinho:ler', 'vizinho:escrever'];
  // `/resumo` e obrigatoria em todo modulo: o vizinho fecha o ciclo sem violar `consome-contrato`.
  manifesto.consome = consome ? [{ modulo: 'molde', contrato: 'GET /resumo', porQue: 'ciclo' }] : [];
  gravarJson(caminho, manifesto);
  return raiz;
}

/** Monta um projeto temporário com o molde (e opcionalmente um vizinho), roda o gate e limpa. */
function rodarCaso(binding, caso) {
  const temporario = mkdtempSync(join(tmpdir(), 'gate-teste-'));
  try {
    const modulos = join(temporario, 'modulos');
    const molde = join(RAIZ_TEMPLATE, 'bindings', binding, '_template');
    const alvo = join(modulos, '_template');
    cpSync(molde, alvo, { recursive: true });

    if (caso?.mutar !== undefined) caso.mutar(operacoes(alvo, binding));

    const pastas = [alvo];
    if (caso?.exigeVizinho === true) pastas.push(criarVizinho(modulos, molde, caso.vizinhoConsome === true));

    const contextos = pastas.map((p) => carregarContexto(p, temporario));
    const alvoCtx = contextos.filter((c) => c.raiz === alvo);
    return analisar(contextos, alvoCtx, {});
  } finally {
    rmSync(temporario, { recursive: true, force: true });
  }
}

function verificarConforme(binding) {
  const erros = rodarCaso(binding, null).filter((a) => a.nivel === 'erro');
  if (erros.length === 0) return { ok: true, rotulo: 'molde conforme produz zero erro' };
  return {
    ok: false,
    rotulo: 'molde conforme produz zero erro',
    detalhe: erros.map((e) => `[${e.regra}] ${e.mensagem}`).join('\n      '),
  };
}

function verificarCaso(binding, caso) {
  const rotulo = `${caso.regra} — ${caso.descricao}`;
  let achados;
  try {
    achados = rodarCaso(binding, caso);
  } catch (causa) {
    // O caso mexe num arquivo que este binding nao tem (ex.: `web/` num molde Python), ou nao
    // declara trecho para a sintaxe dele. Isso e AUSENCIA DE COBERTURA, nao aprovacao — por isso
    // conta separado, aparece na saida e diz o MOTIVO, para lacuna nao se confundir com conformidade.
    if (causa?.code === 'ENOENT') {
      return { pulado: true, rotulo, motivo: 'o molde deste binding nao tem o arquivo que o caso muta' };
    }
    if (causa?.code === 'SEM_COBERTURA') return { pulado: true, rotulo, motivo: causa.message };
    throw causa;
  }
  const ids = new Set(achados.map((a) => a.regra));
  const permitidos = new Set([caso.regra, ...(caso.tambem ?? [])]);
  const extras = [...ids].filter((id) => !permitidos.has(id));

  if (!ids.has(caso.regra)) {
    return {
      ok: false,
      rotulo,
      detalhe: ids.size === 0 ? 'nenhum achado' : `acusou: ${[...ids].join(', ')}`,
    };
  }
  if (extras.length > 0) {
    return {
      ok: false,
      rotulo,
      detalhe: `id NAO declarado: ${extras.join(', ')} — se o co-achado for legitimo, declare em `
        + '`tambem: [...]`; se nao for, o caso ou a regra e que precisa de conserto',
    };
  }
  return { ok: true, rotulo };
}

function principal() {
  const argumentos = process.argv.slice(2);
  const indice = argumentos.indexOf('--binding');
  const binding = indice === -1 ? 'typescript' : argumentos[indice + 1];

  const resultados = [verificarConforme(binding), ...CASOS.map((caso) => verificarCaso(binding, caso))];
  const falhas = resultados.filter((r) => r.ok !== true && r.pulado !== true);
  const pulados = resultados.filter((r) => r.pulado === true);

  for (const resultado of resultados) {
    const marca = resultado.ok === true ? 'ok   ' : (resultado.pulado === true ? 'pula ' : 'FALHA');
    process.stdout.write(`  ${marca} ${resultado.rotulo}\n`);
    if (resultado.pulado === true) process.stdout.write(`       SEM COBERTURA: ${resultado.motivo}\n`);
    if (resultado.ok !== true && resultado.pulado !== true) {
      process.stdout.write(`       ${resultado.detalhe}\n`);
    }
  }

  const executados = resultados.length - pulados.length;
  const cobertas = new Set(CASOS.map((c) => c.regra));
  process.stdout.write(`\nbinding ${binding}: ${executados - falhas.length}/${executados} ok`);
  if (pulados.length > 0) {
    process.stdout.write(`, ${pulados.length} SEM COBERTURA neste binding (caso escrito para outro)`);
  }
  process.stdout.write(` — ${cobertas.size} regras com caso de teste\n`);
  return falhas.length > 0 ? 1 : 0;
}

process.exit(principal());
