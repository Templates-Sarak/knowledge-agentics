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

function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8').replace(/^﻿/, ''));
}

function gravarJson(caminho, valor) {
  writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
}

/** Operações que um caso pode aplicar sobre a cópia do molde. */
function operacoes(raiz) {
  return {
    escrever: (rel, conteudo) => writeFileSync(join(raiz, rel), conteudo, 'utf8'),
    acrescentar: (rel, conteudo) => {
      const caminho = join(raiz, rel);
      writeFileSync(caminho, readFileSync(caminho, 'utf8') + conteudo, 'utf8');
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

    if (caso?.mutar !== undefined) caso.mutar(operacoes(alvo));

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
    // O caso mexe num arquivo que este binding nao tem (ex.: `.ts` num molde Python).
    // Isso e AUSENCIA DE COBERTURA, nao aprovacao — por isso conta separado e aparece na saida.
    if (causa?.code === 'ENOENT') return { pulado: true, rotulo };
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
