#!/usr/bin/env node
/**
 * generate-port-schemas.mjs — deriva os dois schemas de porta de `ports-vocabulary.mjs`.
 * Lei dona: specs/arquitetura/01-modulo.md §5.1 (plan-2.md Bloco S).
 *
 *   node tools/generate-port-schemas.mjs [--conferir]
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
 * `--conferir` não escreve nada: sai 1 se algum dos dois arquivos divergir do que seria gerado, e
 * nomeia qual.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORTAS_CONHECIDAS } from './gate/ports-vocabulary.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG_PORTAS = join(AQUI, 'gate', 'schemas', 'config-ports.schema.json');
const CAMINHO_MODULO = join(AQUI, 'gate', 'schemas', 'module.schema.json');

const COMENTARIO_CONFIG_PORTAS =
  'UNICO lugar do modulo onde o nome de um fornecedor aparece. Lei dona: specs/arquitetura/01-modulo.md '
  + '§5. `additionalProperties: false` fecha o vocabulario de portas: nome fora do catalogo do §5.1 '
  + 'reprova. O que ele NAO faz, e nao tem como fazer, e amarrar este arquivo ao manifesto — schema nao '
  + 'enxerga o module.json. Quem cobra a coincidencia nos DOIS sentidos e a regra `porta-declarada` '
  + '(04-regras.md §4.4): porta configurada aqui e ausente do manifesto e config morta; porta declarada '
  + 'la e ausente daqui derruba o boot.';

/** `config-ports.schema.json` — cada porta vira `"name": { "type": "string", "minLength": 1 }`. */
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
 * Só a linha do `enum` de `properties.ports.items`, por SUBSTITUIÇÃO DE TEXTO — não
 * `JSON.parse`/`JSON.stringify`, que reformataria o arquivo inteiro (`module.schema.json` é
 * hand-formatted, objeto pequeno numa linha só; `JSON.stringify(obj, null, 2)` expandiria cada um
 * em várias linhas, e o diff resultante não teria nada a ver com a mudança de vocabulário).
 *
 * O padrão ancora em `"ports":` e para no PRIMEIRO `"enum":` depois dele — o bloco de `ports` só
 * tem um enum, então isso é seguro. `[^]` (não `.`) porque `.` não casa quebra de linha sem a flag
 * `s`, e o trecho entre `"ports": {` e `"enum":` atravessa várias linhas no arquivo real.
 *
 * `"ports"` aqui é a CHAVE do manifesto (`module.schema.json`, renomeada na fase AD.3 — antes disso
 * era `"ports"`) — não confundir com `config-ports.schema.json`, o arquivo, que já é `ports` desde
 * a fase AD.1. Achado ORIGINALMENTE ao rodar o Bloco K, antes do AD.3: o regex já dizia `"ports":`
 * (a chave ainda não tinha sido renomeada), e como `module.schema.json` continuava com a chave em
 * português, o padrão nunca casava — silencioso, `--conferir` reportava OK mesmo com o enum
 * desatualizado. Resolvido de verdade no AD.3: agora os dois lados (regex e schema) dizem `"ports"`.
 */
function comEnumDePortasAtualizado(textoOriginal, portas) {
  const novoEnum = `[${portas.map((p) => JSON.stringify(p)).join(', ')}]`;
  return textoOriginal.replace(/("ports":\s*\{[^]*?"enum":\s*)\[[^\]]*\]/, `$1${novoEnum}`);
}

// Normaliza CRLF->LF: mesma defesa em profundidade de `context.mjs:lerTexto` — o `.gitattributes`
// e o conserto estrutural, isto cobre clone ainda nao renormalizado (plan-3.md Bloco AE).
function lerOuNulo(caminho) {
  return existsSync(caminho)
    ? readFileSync(caminho, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')
    : null;
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
    configPortasEmDisco !== configPortasEsperado ? 'config-ports.schema.json' : null,
    moduloEmDisco !== moduloEsperado ? 'module.schema.json (ports.items.enum)' : null,
  ].filter((nome) => nome !== null);

  if (conferir) {
    if (divergentes.length === 0) {
      process.stdout.write('gerar-schemas-portas: OK — os dois schemas em dia com ports-vocabulary.mjs\n');
      return 0;
    }
    process.stderr.write(
      `gerar-schemas-portas: REPROVADO — divergente(s): ${divergentes.join(', ')}.\n`
      + '  rode: node tools/generate-port-schemas.mjs\n',
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

// Só executa quando ESTE arquivo é o entrypoint — mesma guarda de `generate-lint-config.mjs`.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
