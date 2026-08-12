/**
 * schema.mjs — validador de JSON Schema, subconjunto suficiente e SEM dependência externa.
 * Lei dona: specs/arquitetura/04-regras.md §4.4
 *
 * Por que próprio e não uma biblioteca: o gate viaja com o módulo extraído (specs/arquitetura/03 §6). Uma
 * dependência de runtime aqui significaria que a verificabilidade só existe depois de um
 * `npm install` — exatamente a fragilidade que o template evita em todo o resto.
 *
 * Suportado: type, required, properties, additionalProperties, items, enum, const,
 * pattern, minLength, minimum, maximum, minItems, uniqueItems, oneOf, nullable.
 * Não suportado (e deliberadamente fora): $ref, allOf, if/then, dependências condicionais —
 * se um schema precisar disso, ele está descrevendo lógica, não forma.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_SCHEMAS = join(dirname(fileURLToPath(import.meta.url)), 'schemas');
const memoria = new Map();

/**
 * Carrega um schema por nome, uma vez só.
 * Schema é ASSET DO GATE, não dado do módulo — por isso ler daqui não fere a regra de que
 * regra nenhuma toca disco: o que não pode ser lido pela regra é o arquivo do módulo.
 */
export function carregarEsquema(nome) {
  if (memoria.has(nome)) return memoria.get(nome);
  const bruto = readFileSync(join(PASTA_SCHEMAS, `${nome}.schema.json`), 'utf8').replace(/^﻿/, '');
  const esquema = JSON.parse(bruto);
  memoria.set(nome, esquema);
  return esquema;
}

const TIPOS = {
  string: (valor) => typeof valor === 'string',
  number: (valor) => typeof valor === 'number' && Number.isFinite(valor),
  integer: (valor) => Number.isInteger(valor),
  boolean: (valor) => typeof valor === 'boolean',
  object: (valor) => typeof valor === 'object' && valor !== null && !Array.isArray(valor),
  array: (valor) => Array.isArray(valor),
  null: (valor) => valor === null,
};

function tipoBate(valor, tipo) {
  const aceitos = Array.isArray(tipo) ? tipo : [tipo];
  return aceitos.some((nome) => TIPOS[nome]?.(valor) === true);
}

function validarEscalar(valor, esquema, caminho) {
  const achados = [];
  if (esquema.enum !== undefined && !esquema.enum.includes(valor)) {
    achados.push(`${caminho}: "${valor}" fora do vocabulario [${esquema.enum.join(', ')}]`);
  }
  if (esquema.const !== undefined && valor !== esquema.const) {
    achados.push(`${caminho}: deve ser exatamente "${esquema.const}"`);
  }
  if (esquema.pattern !== undefined && typeof valor === 'string' && !new RegExp(esquema.pattern).test(valor)) {
    achados.push(`${caminho}: "${valor}" nao casa o padrao ${esquema.pattern}`);
  }
  if (esquema.minLength !== undefined && typeof valor === 'string' && valor.length < esquema.minLength) {
    achados.push(`${caminho}: tamanho minimo ${esquema.minLength}`);
  }
  if (esquema.minimum !== undefined && typeof valor === 'number' && valor < esquema.minimum) {
    achados.push(`${caminho}: minimo ${esquema.minimum}`);
  }
  if (esquema.maximum !== undefined && typeof valor === 'number' && valor > esquema.maximum) {
    achados.push(`${caminho}: maximo ${esquema.maximum}`);
  }
  return achados;
}

function validarObjeto(valor, esquema, caminho) {
  const achados = [];
  const propriedades = esquema.properties ?? {};

  for (const exigida of esquema.required ?? []) {
    if (valor[exigida] === undefined) achados.push(`${caminho}: campo obrigatorio ausente "${exigida}"`);
  }
  if (esquema.additionalProperties === false) {
    for (const chave of Object.keys(valor)) {
      if (chave.startsWith('_')) continue;
      if (propriedades[chave] === undefined) achados.push(`${caminho}: campo nao previsto "${chave}"`);
    }
  }
  for (const [chave, subEsquema] of Object.entries(propriedades)) {
    if (valor[chave] === undefined) continue;
    achados.push(...validar(valor[chave], subEsquema, `${caminho}.${chave}`));
  }
  return achados;
}

function validarArranjo(valor, esquema, caminho) {
  const achados = [];
  if (esquema.minItems !== undefined && valor.length < esquema.minItems) {
    achados.push(`${caminho}: precisa de ao menos ${esquema.minItems} item(ns)`);
  }
  if (esquema.uniqueItems === true && new Set(valor.map((i) => JSON.stringify(i))).size !== valor.length) {
    achados.push(`${caminho}: itens duplicados`);
  }
  if (esquema.items !== undefined) {
    valor.forEach((item, indice) => achados.push(...validar(item, esquema.items, `${caminho}[${indice}]`)));
  }
  return achados;
}

/** Valida um valor contra um esquema. Devolve a lista de achados (vazia = conforme). */
export function validar(valor, esquema, caminho = '$') {
  if (esquema === undefined || esquema === true) return [];

  if (esquema.oneOf !== undefined) {
    const conforme = esquema.oneOf.some((alternativa) => validar(valor, alternativa, caminho).length === 0);
    return conforme ? [] : [`${caminho}: nao casa nenhuma das formas aceitas`];
  }

  if (esquema.type !== undefined && !tipoBate(valor, esquema.type)) {
    const esperado = Array.isArray(esquema.type) ? esquema.type.join('|') : esquema.type;
    return [`${caminho}: esperado ${esperado}, veio ${valor === null ? 'null' : typeof valor}`];
  }

  const achados = validarEscalar(valor, esquema, caminho);
  if (TIPOS.object(valor)) achados.push(...validarObjeto(valor, esquema, caminho));
  if (TIPOS.array(valor)) achados.push(...validarArranjo(valor, esquema, caminho));
  return achados;
}
