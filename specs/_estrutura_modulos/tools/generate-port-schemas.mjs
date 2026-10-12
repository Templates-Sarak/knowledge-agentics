#!/usr/bin/env node
/**
 * generate-port-schemas.mjs — deriva os dois schemas de porta de `ports-vocabulary.mjs`.
 * Lei dona: specs/arquitetura/01-modulo.md §5.1.
 *
 *   node tools/generate-port-schemas.mjs [--check]
 *
 * A fonte é `tools/gate/ports-vocabulary.mjs`, e só ela. Dois arquivos, dois tratamentos:
 *
 *   - `config-ports.schema.json` é INTEIRO derivado (cada propriedade É um nome de porta) — mesmo
 *     tratamento do `eslint.config.js`/`ruff.toml` em `generate-lint-config.mjs`: byte a byte, o
 *     arquivo INTEIRO é gerado, e "editar a mão" é sempre regredível por este script;
 *   - `module.schema.json` NÃO é inteiro derivado — tem dezenas de campos que não são de porta
 *     nenhuma, e regenerá-lo por inteiro tornaria ESTE script o dono de campo que não é dele
 *     (a mesma classe de defeito que a fonte única existe para evitar, um nível acima). Só a lista
 *     `properties.ports.items.enum` é tocada, por SUBSTITUIÇÃO DE TEXTO — o resto do arquivo,
 *     inclusive espaçamento, sai bit a bit igual.
 *
 * `--check` não escreve nada: sai 1 se algum dos dois arquivos divergir do que seria gerado, e
 * nomeia qual.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KNOWN_PORTS } from './gate/ports-vocabulary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORTS_CONFIG_PATH = join(HERE, 'gate', 'schemas', 'config-ports.schema.json');
const MODULE_PATH = join(HERE, 'gate', 'schemas', 'module.schema.json');

const PORTS_CONFIG_COMMENT =
  'UNICO lugar do modulo onde o nome de um fornecedor aparece. Lei dona: specs/arquitetura/01-modulo.md '
  + '§5. `additionalProperties: false` fecha o vocabulario de portas: nome fora do catalogo do §5.1 '
  + 'reprova. O que ele NAO faz, e nao tem como fazer, e amarrar este arquivo ao manifesto — schema nao '
  + 'enxerga o module.json. Quem cobra a coincidencia nos DOIS sentidos e a regra `port-declared` '
  + '(04-regras.md §4.4): porta configurada aqui e ausente do manifesto e config morta; porta declarada '
  + 'la e ausente daqui derruba o boot.';

/** `config-ports.schema.json` — cada porta vira `"name": { "type": "string", "minLength": 1 }`. */
function portsConfigContent() {
  const properties = KNOWN_PORTS
    .map((port) => `    "${port}": { "type": "string", "minLength": 1 }`)
    .join(',\n');
  return [
    '{',
    `  "$comment": "${PORTS_CONFIG_COMMENT}",`,
    '  "type": "object",',
    '  "additionalProperties": false,',
    '  "properties": {',
    properties,
    '  }',
    '}',
    '',
  ].join('\n');
}

/**
 * Só a linha do `enum` de `properties.ports.items`, por SUBSTITUIÇÃO DE TEXTO — não
 * `JSON.parse`/`JSON.stringify`, que reformataria o arquivo inteiro (`module.schema.json` é
 * hand-formatted, objeto pequeno numa linha só; `JSON.stringify(obj, null, 2)` expandiria cada um
 * em várias linhas, e o diff resultante não teria nada a ver com a mudança de vocabulário).
 *
 * O padrão ancora em `"ports":` e para no PRIMEIRO `"enum":` depois dele — o bloco de `ports` só
 * tem um enum, então isso é seguro. `[^]` (não `.`) porque `.` não casa quebra de linha sem a flag
 * `s`, e o trecho entre `"ports": {` e `"enum":` atravessa várias linhas no arquivo real.
 *
 * `"ports"` aqui é a CHAVE do manifesto (`module.schema.json`) — não confundir com
 * `config-ports.schema.json`, o arquivo. Os dois lados (este regex e o schema) têm de dizer
 * `"ports"` — se um lado divergir do outro, o padrão nunca casa e `--check` reporta OK mesmo
 * com o enum desatualizado, em silêncio.
 */
function withUpdatedPortsEnum(originalText, ports) {
  const newEnum = `[${ports.map((p) => JSON.stringify(p)).join(', ')}]`;
  return originalText.replace(/("ports":\s*\{[^]*?"enum":\s*)\[[^\]]*\]/, `$1${newEnum}`);
}

// Normaliza CRLF->LF: mesma defesa em profundidade de `context.mjs:readText` — o `.gitattributes`
// e o conserto estrutural, isto cobre clone ainda nao renormalizado.
function readOrNull(path) {
  return existsSync(path)
    ? readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')
    : null;
}

function main() {
  const check = process.argv.includes('--check');

  const expectedConfigPorts = portsConfigContent();
  const portsConfigOnDisk = readOrNull(PORTS_CONFIG_PATH);

  const moduleOnDisk = readOrNull(MODULE_PATH);
  if (moduleOnDisk === null) {
    process.stderr.write(`Error: ${MODULE_PATH} is missing\n`);
    return 1;
  }
  const expectedModule = withUpdatedPortsEnum(moduleOnDisk, KNOWN_PORTS);

  const divergent = [
    portsConfigOnDisk !== expectedConfigPorts ? 'config-ports.schema.json' : null,
    moduleOnDisk !== expectedModule ? 'module.schema.json (ports.items.enum)' : null,
  ].filter((name) => name !== null);

  if (check) {
    if (divergent.length === 0) {
      process.stdout.write('generate-port-schemas: OK — both schemas match ports-vocabulary.mjs\n');
      return 0;
    }
    process.stderr.write(
      `generate-port-schemas: FAILED — divergent: ${divergent.join(', ')}.\n`
      + '  run: node tools/generate-port-schemas.mjs\n',
    );
    return 1;
  }

  writeFileSync(PORTS_CONFIG_PATH, expectedConfigPorts, 'utf8');
  writeFileSync(MODULE_PATH, expectedModule, 'utf8');
  process.stdout.write(divergent.length === 0
    ? 'unchanged: both schemas are up to date\n'
    : `generated: ${divergent.join(', ')}\n`);
  return 0;
}

// Só executa quando ESTE arquivo é o entrypoint — mesma guarda de `generate-lint-config.mjs`.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
