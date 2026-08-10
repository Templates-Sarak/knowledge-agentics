#!/usr/bin/env node
/**
 * gerar-schemas-portas.mjs — deriva os dois schemas de porta de `vocabulario-portas.mjs`.
 * Lei dona: specs/arquitetura/01-modulo.md §5.1 (plan-2.md Bloco S).
 *
 *   node ferramentas/gerar-schemas-portas.mjs [--conferir]
 *
 * A fonte é `ferramentas/gate/vocabulario-portas.mjs`, e só ela. Dois arquivos, dois tratamentos:
 *
 *   - `config-portas.schema.json` é INTEIRO derivado (cada propriedade É um nome de porta) — mesmo
 *     tratamento do `eslint.config.js`/`ruff.toml` em `gerar-config-lint.mjs`: byte a byte, o
 *     arquivo INTEIRO é gerado, e "editar a mão" é sempre regredível por este script;
 *   - `modulo.schema.json` NÃO é inteiro derivado — tem dezenas de campos que não são de porta
 *     nenhuma, e regenerá-lo por inteiro tornaria ESTE script o dono de campo que não é dele
 *     (a mesma classe de defeito que a fonte única existe para evitar, um nível acima). Só a lista
 *     `properties.portas.items.enum` é tocada, por SUBSTITUIÇÃO DE TEXTO — o resto do arquivo,
 *     inclusive espaçamento, sai bit a bit igual.
 *
 * `--conferir` não escreve nada: sai 1 se algum dos dois arquivos divergir do que seria gerado, e
 * nomeia qual.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORTAS_CONHECIDAS } from './gate/vocabulario-portas.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG_PORTAS = join(AQUI, 'gate', 'schemas', 'config-portas.schema.json');
const CAMINHO_MODULO = join(AQUI, 'gate', 'schemas', 'modulo.schema.json');

const COMENTARIO_CONFIG_PORTAS =
  'UNICO lugar do modulo onde o nome de um fornecedor aparece. Lei dona: specs/arquitetura/01-modulo.md '
  + '§5. `additionalProperties: false` fecha o vocabulario de portas: nome fora do catalogo do §5.1 '
  + 'reprova. O que ele NAO faz, e nao tem como fazer, e amarrar este arquivo ao manifesto — schema nao '
  + 'enxerga o modulo.json. Quem cobra a coincidencia nos DOIS sentidos e a regra `porta-declarada` '
  + '(04-regras.md §4.4): porta configurada aqui e ausente do manifesto e config morta; porta declarada '
  + 'la e ausente daqui derruba o boot.';

/** `config-portas.schema.json` — cada porta vira `"nome": { "type": "string", "minLength": 1 }`. */
function conteudoConfigPortas() {
  const propriedades = PORTAS_CONHECIDAS
    .map((porta) => `    "${porta}": { "type": "string", "minLength": 1 }`)
    .join(',\n');
  return [
    '{',
    `  "$comentario": "${COMENTARIO_CONFIG_PORTAS}",`,
    '  "type": "object",',
    '  "additionalProperties": false,',
    '  "properties": {',
    propriedades,
    '  }',
    '}',
    '',
  ].join('\n');
}

/**
 * Só a linha do `enum` de `properties.portas.items`, por SUBSTITUIÇÃO DE TEXTO — não
 * `JSON.parse`/`JSON.stringify`, que reformataria o arquivo inteiro (`modulo.schema.json` é
 * hand-formatted, objeto pequeno numa linha só; `JSON.stringify(obj, null, 2)` expandiria cada um
 * em várias linhas, e o diff resultante não teria nada a ver com a mudança de vocabulário).
 *
 * O padrão ancora em `"portas":` e para no PRIMEIRO `"enum":` depois dele — o bloco de `portas` só
 * tem um enum, então isso é seguro. `[^]` (não `.`) porque `.` não casa quebra de linha sem a flag
 * `s`, e o trecho entre `"portas": {` e `"enum":` atravessa várias linhas no arquivo real.
 */
function comEnumDePortasAtualizado(textoOriginal, portas) {
  const novoEnum = `[${portas.map((p) => JSON.stringify(p)).join(', ')}]`;
  return textoOriginal.replace(/("portas":\s*\{[^]*?"enum":\s*)\[[^\]]*\]/, `$1${novoEnum}`);
}

function lerOuNulo(caminho) {
  return existsSync(caminho) ? readFileSync(caminho, 'utf8').replace(/^﻿/, '') : null;
}

function principal() {
  const conferir = process.argv.includes('--conferir');

  const configPortasEsperado = conteudoConfigPortas();
  const configPortasEmDisco = lerOuNulo(CAMINHO_CONFIG_PORTAS);

  const moduloEmDisco = lerOuNulo(CAMINHO_MODULO);
  if (moduloEmDisco === null) {
    process.stderr.write(`erro: ${CAMINHO_MODULO} ausente\n`);
    return 1;
  }
  const moduloEsperado = comEnumDePortasAtualizado(moduloEmDisco, PORTAS_CONHECIDAS);

  const divergentes = [
    configPortasEmDisco !== configPortasEsperado ? 'config-portas.schema.json' : null,
    moduloEmDisco !== moduloEsperado ? 'modulo.schema.json (portas.items.enum)' : null,
  ].filter((nome) => nome !== null);

  if (conferir) {
    if (divergentes.length === 0) {
      process.stdout.write('gerar-schemas-portas: OK — os dois schemas em dia com vocabulario-portas.mjs\n');
      return 0;
    }
    process.stderr.write(
      `gerar-schemas-portas: REPROVADO — divergente(s): ${divergentes.join(', ')}.\n`
      + '  rode: node ferramentas/gerar-schemas-portas.mjs\n',
    );
    return 1;
  }

  writeFileSync(CAMINHO_CONFIG_PORTAS, configPortasEsperado, 'utf8');
  writeFileSync(CAMINHO_MODULO, moduloEsperado, 'utf8');
  process.stdout.write(divergentes.length === 0
    ? 'inalterado: os dois schemas ja estavam em dia\n'
    : `gerado: ${divergentes.join(', ')}\n`);
  return 0;
}

// Só executa quando ESTE arquivo é o entrypoint — mesma guarda de `gerar-config-lint.mjs`.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
