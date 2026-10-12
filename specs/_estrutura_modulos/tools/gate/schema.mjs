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

const SCHEMAS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'schemas');
const cache = new Map();

/**
 * Carrega um schema por nome, uma vez só.
 * Schema é ASSET DO GATE, não dado do módulo — por isso ler daqui não fere a regra de que
 * regra nenhuma toca disco: o que não pode ser lido pela regra é o arquivo do módulo.
 */
export function loadSchema(name) {
  if (cache.has(name)) return cache.get(name);
  const raw = readFileSync(join(SCHEMAS_DIR, `${name}.schema.json`), 'utf8').replace(/^﻿/, '');
  const schema = JSON.parse(raw);
  cache.set(name, schema);
  return schema;
}

const TYPES = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  null: (value) => value === null,
};

function typeMatches(value, type) {
  const accepted = Array.isArray(type) ? type : [type];
  return accepted.some((name) => TYPES[name]?.(value) === true);
}

function validateScalar(value, schema, path) {
  const findings = [];
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    findings.push(`${path}: "${value}" is outside the allowed values [${schema.enum.join(', ')}]`);
  }
  if (schema.const !== undefined && value !== schema.const) {
    findings.push(`${path}: must be exactly "${schema.const}"`);
  }
  if (schema.pattern !== undefined && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    findings.push(`${path}: "${value}" does not match the pattern ${schema.pattern}`);
  }
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
    findings.push(`${path}: minimum length is ${schema.minLength}`);
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    findings.push(`${path}: minimum is ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
    findings.push(`${path}: maximum is ${schema.maximum}`);
  }
  return findings;
}

function validateObject(value, schema, path) {
  const findings = [];
  const properties = schema.properties ?? {};

  for (const required of schema.required ?? []) {
    if (value[required] === undefined) findings.push(`${path}: required field "${required}" is missing`);
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (key.startsWith('_')) continue;
      if (properties[key] === undefined) findings.push(`${path}: unexpected field "${key}"`);
    }
  }
  for (const [key, subSchema] of Object.entries(properties)) {
    if (value[key] === undefined) continue;
    findings.push(...validate(value[key], subSchema, `${path}.${key}`));
  }
  return findings;
}

function validateArray(value, schema, path) {
  const findings = [];
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    findings.push(`${path}: must contain at least ${schema.minItems} item(s)`);
  }
  if (schema.uniqueItems === true && new Set(value.map((i) => JSON.stringify(i))).size !== value.length) {
    findings.push(`${path}: duplicate items are not allowed`);
  }
  if (schema.items !== undefined) {
    value.forEach((item, index) => findings.push(...validate(item, schema.items, `${path}[${index}]`)));
  }
  return findings;
}

/** Valida um valor contra um esquema. Devolve a lista de achados (vazia = conforme). */
export function validate(value, schema, path = '$') {
  if (schema === undefined || schema === true) return [];

  if (schema.oneOf !== undefined) {
    const conforms = schema.oneOf.some((alternative) => validate(value, alternative, path).length === 0);
    return conforms ? [] : [`${path}: does not match any accepted form`];
  }

  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    const expected = Array.isArray(schema.type) ? schema.type.join('|') : schema.type;
    return [`${path}: expected ${expected}, received ${value === null ? 'null' : typeof value}`];
  }

  const findings = validateScalar(value, schema, path);
  if (TYPES.object(value)) findings.push(...validateObject(value, schema, path));
  if (TYPES.array(value)) findings.push(...validateArray(value, schema, path));
  return findings;
}
