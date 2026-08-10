#!/usr/bin/env node
/**
 * criar-adapter.mjs — scaffold determinístico de adapter. Lei dona: specs/arquitetura/01-modulo.md
 * §5.2 (plan-2.md Bloco S).
 *
 *   node ferramentas/criar-adapter.mjs <porta> <provedor> [--binding typescript]
 *
 * Mesma forma do `criar-modulo.mjs`: copia o molde (`adapters/_template`, instalado por
 * `criar-projeto.mjs`), substitui marcadores, registra a fábrica em `src/composicao.*` e roda o
 * gate. `<porta>` tem de estar no vocabulário conhecido (`ferramentas/gate/vocabulario-portas.mjs`)
 * — nome fora dele é rejeitado antes de tocar disco.
 *
 * O molde é um STUB, de propósito: os MÉTODOS de cada interface variam por porta (`Repositorio`
 * tem quatro, `Notificador` tem um), e um gerador que tentasse produzir o corpo certo por porta
 * precisaria entender a forma de cada interface nas três linguagens — mais caro que o defeito que
 * evitaria. O molde importa nada, devolve um tipo genérico e lança "TODO: implemente" nomeando a
 * porta e o arquivo; o gate NÃO cobra método (não é AST), só isolamento e forma.
 *
 * LIMITE CONHECIDO: `auth` é resolvida por `resolverAuth()`/`resolver_auth()`, não por `FABRICAS` —
 * é a auth ÚNICA do sistema, nunca por-módulo. Registrar um adapter para a porta "auth" aqui
 * ACRESCENTA a entrada em `FABRICAS` (coerente com o vocabulário), mas nada a consulta hoje; trocar
 * o provedor de auth continua sendo editar `resolverAuth()` à mão. Não é bug deste script — é a
 * mesma arquitetura de antes dele.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { PORTAS_CONHECIDAS } from './gate/vocabulario-portas.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_FERRAMENTA = join(AQUI, '..');
const BINDINGS = ['typescript', 'javascript', 'python'];

function abortar(mensagem) {
  process.stderr.write(`erro: ${mensagem}\n`);
  process.exit(1);
}

function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

function lerOpcoes() {
  const brutos = process.argv.slice(2);
  const posicionais = brutos.filter((a, i) => !a.startsWith('--') && brutos[i - 1]?.startsWith('--') !== true);
  const valorDe = (nome, padrao) => {
    const indice = brutos.indexOf(`--${nome}`);
    return indice === -1 ? padrao : brutos[indice + 1];
  };
  return { porta: posicionais[0], provedor: posicionais[1], binding: valorDe('binding', 'typescript') };
}

function validarOpcoes(opcoes) {
  if (opcoes.porta === undefined || opcoes.provedor === undefined) {
    abortar('uso: criar-adapter.mjs <porta> <provedor> [--binding b]');
  }
  if (!PORTAS_CONHECIDAS.includes(opcoes.porta)) {
    abortar(`porta "${opcoes.porta}" fora do vocabulario — use uma de: ${PORTAS_CONHECIDAS.join(', ')}`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(opcoes.provedor)) {
    abortar(`provedor "${opcoes.provedor}" invalido — use kebab-case minusculo`);
  }
  if (!BINDINGS.includes(opcoes.binding)) {
    abortar(`binding "${opcoes.binding}" invalido — use ${BINDINGS.join(', ')}`);
  }
}

/** Sobe até achar a raiz do projeto (a que tem `modulos/`). Cai na raiz da ferramenta se não achar. */
function acharRaizProjeto() {
  let atual = process.cwd();
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modulos'))) return atual;
    const pai = dirname(atual);
    if (pai === atual) break;
    atual = pai;
  }
  return RAIZ_FERRAMENTA;
}

/**
 * Acha o molde, no mesmo precedente de `criar-modulo.mjs:acharMolde`: primeiro o que
 * `criar-projeto.mjs` instalou no projeto (`adapters/_template`), depois o do próprio template —
 * o segundo é o que faz este comando funcionar rodado de DENTRO do repositório do template.
 */
function acharMolde(raizProjeto, binding) {
  const candidatos = [
    join(raizProjeto, 'adapters', '_template'),
    join(RAIZ_FERRAMENTA, 'bindings', binding, '_adapter'),
  ];
  return candidatos.find((caminho) => existsSync(caminho)) ?? null;
}

/** PascalCase a partir de kebab-case — "aws-s3" -> "AwsS3". Mesmo uso de `<Modulo>` em criar-modulo. */
function paraPascalCase(kebab) {
  return kebab.split('-').map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1)).join('');
}

function substituirMarcadores(texto, porta, provedor) {
  return texto.replaceAll('<porta>', porta).replaceAll('<provedor>', provedor);
}

/** O nome fixo que o molde usa — nunca marcador, para o arquivo em disco continuar sintaticamente
 * válido SEMPRE, mesmo sem substituição (a mesma garantia de `modulos/_template`, cujos marcadores
 * vivem só em comentário/string). Este script troca o nome pelo do provedor NA CÓPIA, não no molde. */
const NOME_GENERICO = { typescript: 'criarAdapter', javascript: 'criarAdapter', python: 'AdapterPendente' };

function nomeDoProvedor(binding, provedor) {
  const pascal = paraPascalCase(provedor);
  return binding === 'python' ? pascal : `criar${pascal}`;
}

function copiarEAdaptarMolde(molde, destino, opcoes) {
  mkdirSync(destino, { recursive: true });
  cpSync(molde, destino, { recursive: true });

  const nomeNovo = nomeDoProvedor(opcoes.binding, opcoes.provedor);
  const generico = NOME_GENERICO[opcoes.binding];
  for (const nome of readdirSync(destino)) {
    const caminho = join(destino, nome);
    const substituido = substituirMarcadores(lerTexto(caminho), opcoes.porta, opcoes.provedor)
      .replaceAll(new RegExp(`\\b${generico}\\b`, 'g'), nomeNovo);
    writeFileSync(caminho, substituido, 'utf8');
  }
  return nomeNovo;
}

/**
 * Registra a fábrica nova em `src/composicao.*`, por SUBSTITUIÇÃO DE TEXTO — mesma técnica de
 * `gerar-schemas-portas.mjs:comEnumDePortasAtualizado`. Duas formas: a porta JÁ tem entrada
 * (acrescenta um provedor a mais na MESMA linha) ou é porta NOVA (acrescenta uma linha antes do
 * fechamento do objeto). Devolve `null` se nenhuma das duas âncoras bateu — o chamador ABORTA em
 * vez de escrever um arquivo quebrado.
 */
function registrarFabricaTs(conteudo, porta, provedor, nomeFuncao, caminhoImport) {
  const linhaDaImportacao = "} from '../adapters/memoria/index.js';";
  const comImport = conteudo.includes(linhaDaImportacao)
    ? conteudo.replace(linhaDaImportacao, `${linhaDaImportacao}\nimport { ${nomeFuncao} } from '${caminhoImport}';`)
    : null;
  if (comImport === null) return null;

  const linhaDaPorta = new RegExp(`(  ${porta}: \\{ [^}]*)( \\},\\n)`);
  if (linhaDaPorta.test(comImport)) {
    return comImport.replace(linhaDaPorta, `$1, ${provedor}: () => ${nomeFuncao}()$2`);
  }
  const aberturaObjeto = /(const FABRICAS: Record<string, Record<string, \(\) => unknown>> = \{\n)/;
  if (!aberturaObjeto.test(comImport)) return null;
  return comImport.replace(aberturaObjeto, `$1  ${porta}: { ${provedor}: () => ${nomeFuncao}() },\n`);
}

function registrarFabricaJs(conteudo, porta, provedor, nomeFuncao, caminhoImport) {
  const linhaDaImportacao = "} from '../adapters/memoria/index.js';";
  const comImport = conteudo.includes(linhaDaImportacao)
    ? conteudo.replace(linhaDaImportacao, `${linhaDaImportacao}\nimport { ${nomeFuncao} } from '${caminhoImport}';`)
    : null;
  if (comImport === null) return null;

  const linhaDaPorta = new RegExp(`(  ${porta}: \\{ [^}]*)( \\},\\n)`);
  if (linhaDaPorta.test(comImport)) {
    return comImport.replace(linhaDaPorta, `$1, ${provedor}: () => ${nomeFuncao}()$2`);
  }
  const aberturaObjeto = /(const FABRICAS = \{\n)/;
  if (!aberturaObjeto.test(comImport)) return null;
  return comImport.replace(aberturaObjeto, `$1  ${porta}: { ${provedor}: () => ${nomeFuncao}() },\n`);
}

function registrarFabricaPy(conteudo, porta, provedor, nomeClasse, moduloImport) {
  const linhaDaImportacao = ')\n\n# Fabrica de adapter';
  const comImport = conteudo.includes(linhaDaImportacao)
    ? conteudo.replace(linhaDaImportacao, `)\nfrom ${moduloImport} import ${nomeClasse}\n\n# Fabrica de adapter`)
    : null;
  if (comImport === null) return null;

  const linhaDaPorta = new RegExp(`(    "${porta}": \\{[^}]*)(\\},\\n)`);
  if (linhaDaPorta.test(comImport)) {
    return comImport.replace(linhaDaPorta, `$1, "${provedor}": ${nomeClasse}$2`);
  }
  const aberturaObjeto = /(FABRICAS: dict\[str, dict\[str, Callable\[\[\], Any\]\]\] = \{\n)/;
  if (!aberturaObjeto.test(comImport)) return null;
  return comImport.replace(aberturaObjeto, `$1    "${porta}": {"${provedor}": ${nomeClasse}},\n`);
}

function caminhoDeComposicao(raizProjeto, binding) {
  const nome = binding === 'python' ? 'composicao.py' : `composicao.${binding === 'typescript' ? 'ts' : 'js'}`;
  return join(raizProjeto, 'src', nome);
}

function registrarFabrica(raizProjeto, opcoes, nomeGerado) {
  const caminho = caminhoDeComposicao(raizProjeto, opcoes.binding);
  const conteudo = lerTexto(caminho);

  const atualizado = opcoes.binding === 'python'
    ? registrarFabricaPy(conteudo, opcoes.porta, opcoes.provedor, nomeGerado, `adapters.${opcoes.provedor}`)
    : (opcoes.binding === 'typescript' ? registrarFabricaTs : registrarFabricaJs)(
      conteudo, opcoes.porta, opcoes.provedor, nomeGerado,
      `../adapters/${opcoes.provedor}/${opcoes.binding === 'python' ? '__init__.py' : 'index.js'}`,
    );

  if (atualizado === null) {
    abortar(
      `nao encontrei onde registrar a fabrica em ${caminho} — as ancoras esperadas mudaram. `
      + 'Registre a mao: import do adapter novo + entrada em FABRICAS.',
    );
  }
  writeFileSync(caminho, atualizado, 'utf8');
}

function rodarGate(raizProjeto) {
  try {
    process.stdout.write(execFileSync(
      process.execPath,
      [join(raizProjeto, 'ferramentas', 'gate', 'validar.mjs'), '--todos'],
      { encoding: 'utf8', cwd: raizProjeto },
    ));
  } catch (causa) {
    process.stdout.write(causa.stdout ?? '');
    process.stderr.write('\nadapter criado, mas o gate apontou pendencias acima — resolva antes de commitar.\n');
    process.exit(1);
  }
}

function principal() {
  const opcoes = lerOpcoes();
  validarOpcoes(opcoes);

  const raizProjeto = acharRaizProjeto();
  const molde = acharMolde(raizProjeto, opcoes.binding);
  if (molde === null) abortar('molde de adapter nao encontrado (adapters/_template ausente — rode dentro de um projeto gerado por criar-projeto.mjs)');

  const destino = join(raizProjeto, 'adapters', opcoes.provedor);
  if (existsSync(destino)) abortar(`adapter "${opcoes.provedor}" ja existe em ${destino}`);

  const nomeGerado = copiarEAdaptarMolde(molde, destino, opcoes);
  registrarFabrica(raizProjeto, opcoes, nomeGerado);

  process.stdout.write(`adapter "${opcoes.provedor}" criado em adapters/${opcoes.provedor} (porta "${opcoes.porta}")\n`);
  process.stdout.write('validando...\n');
  rodarGate(raizProjeto);
  process.stdout.write(
    `\nproximo passo: implemente os metodos de "${opcoes.porta}" em adapters/${opcoes.provedor}/`
    + `${opcoes.binding === 'python' ? '__init__.py' : 'index.' + (opcoes.binding === 'typescript' ? 'ts' : 'js')}`
    + `, depois declare "${opcoes.porta}": "${opcoes.provedor}" no config/portas.json do modulo que vai usa-lo.\n`,
  );
}

principal();
