#!/usr/bin/env node
/**
 * criar-modulo.mjs — scaffold determinístico de módulo. Lei dona: specs/arquitetura/01-modulo.md §8
 *
 *   node ferramentas/criar-modulo.mjs <id> [--binding typescript] [--papel dominio]
 *                                          [--escopo acme] [--sem-artefato] [--sem-web]
 *
 * Ninguém cria módulo à mão: módulo manual nasce sem manifesto e com nome divergente — as duas
 * coisas que quebram o gate e que o gate não consegue consertar sozinho.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_FERRAMENTA = join(AQUI, '..');
const PASTAS_DE_ARTEFATO = ['core/motor', 'core/templates', 'database', 'gerados'];
const BINDINGS = ['typescript', 'javascript', 'python'];
const PAPEIS = ['dominio', 'gateway', 'conector'];

function abortar(mensagem) {
  process.stderr.write(`erro: ${mensagem}\n`);
  process.exit(1);
}

/** Le removendo o BOM: editor e shell do Windows gravam por padrao, e `JSON.parse` rejeita. */
function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

function lerOpcoes() {
  const brutos = process.argv.slice(2);
  const valorDe = (nome, padrao) => {
    const indice = brutos.indexOf(`--${nome}`);
    return indice === -1 ? padrao : brutos[indice + 1];
  };
  return {
    id: brutos.find((a) => !a.startsWith('--') && brutos[brutos.indexOf(a) - 1]?.startsWith('--') !== true) ?? brutos[0],
    binding: valorDe('binding', 'typescript'),
    papel: valorDe('papel', 'dominio'),
    escopo: valorDe('escopo', null),
    semArtefato: brutos.includes('--sem-artefato'),
    semWeb: brutos.includes('--sem-web'),
  };
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
 * Acha o molde, na ordem: molde por binding no projeto, molde único do projeto,
 * molde do próprio template. É o que faz o comando funcionar dentro e fora do repo do template.
 */
function acharMolde(raizProjeto, binding) {
  const candidatos = [
    join(raizProjeto, 'modulos', `_template-${binding}`),
    join(raizProjeto, 'modulos', '_template'),
    join(RAIZ_FERRAMENTA, 'bindings', binding, '_template'),
  ];
  return candidatos.find((caminho) => existsSync(join(caminho, 'modulo.json'))) ?? null;
}

/** Escopo dos packages: flag, senão o nome do package da raiz, senão o nome da pasta. */
function resolverEscopo(raizProjeto, informado) {
  if (informado !== null) return informado;
  const caminho = join(raizProjeto, 'package.json');
  if (existsSync(caminho)) {
    const { name = '' } = JSON.parse(lerTexto(caminho));
    const casado = name.match(/^@([^/]+)\//);
    if (casado !== null) return casado[1];
    if (name !== '') return name;
  }
  return raizProjeto.split(/[\\/]/).pop().toLowerCase();
}

function substituir(texto, id, escopo) {
  return texto
    .replaceAll('<MODULO>', id.toUpperCase().replace(/-/g, '_'))
    .replaceAll('<Modulo>', id.charAt(0).toUpperCase() + id.slice(1))
    .replaceAll('<modulo>', id)
    .replaceAll('<escopo>', escopo);
}

function percorrer(pasta, acumulado = []) {
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) percorrer(caminho, acumulado);
    else acumulado.push(caminho);
  }
  return acumulado;
}

function aplicarMarcadores(destino, id, escopo) {
  for (const arquivo of percorrer(destino)) {
    writeFileSync(arquivo, substituir(lerTexto(arquivo), id, escopo), 'utf8');
    const nome = arquivo.split(/[\\/]/).pop();
    if (nome.includes('<modulo>')) renameSync(arquivo, join(dirname(arquivo), substituir(nome, id, escopo)));
  }
}

function ajustarManifesto(destino, opcoes) {
  const caminho = join(destino, 'modulo.json');
  const manifesto = JSON.parse(lerTexto(caminho));
  manifesto.papel = opcoes.papel;
  manifesto.binding = opcoes.binding;
  if (opcoes.semArtefato) {
    manifesto.geraArtefato = false;
    manifesto.dados.tabelas = [];
  }
  if (opcoes.semWeb) manifesto.rotaWeb = null;
  writeFileSync(caminho, `${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');
}

/** Config de texto que so a tela usa. Sem `web/`, ela viraria config morta — e o gate avisa. */
const TEXTOS_SO_DA_TELA = ['carregando', 'listaVazia', 'erroGenerico'];

function podarTextosDeTela(destino) {
  const caminho = join(destino, 'config', 'textos.json');
  const textos = JSON.parse(lerTexto(caminho));
  for (const chave of TEXTOS_SO_DA_TELA) delete textos[chave];
  writeFileSync(caminho, `${JSON.stringify(textos, null, 2)}\n`, 'utf8');
}

/** O `.env` do módulo só aponta para a raiz (ADR-004). Segredo real mora num lugar só. */
function criarEnvLocal(destino, id) {
  const conteudo = [
    `# .env do modulo ${id} — NAO versionado (ADR-004).`,
    '# Este arquivo APONTA para o .env da raiz; o segredo real mora la, num lugar so.',
    '# Na extracao: apague a linha ENV_RAIZ e preencha os valores aqui. Nenhum codigo muda.',
    '',
    'ENV_RAIZ=../../.env',
    '',
    `# Override local (dev). So chaves ${id.toUpperCase().replace(/-/g, '_')}_*.`,
    '',
  ].join('\n');
  writeFileSync(join(destino, '.env'), conteudo, 'utf8');
}

function rodar(script, argumentos, raizProjeto) {
  return execFileSync(process.execPath, [join(RAIZ_FERRAMENTA, 'ferramentas', script), ...argumentos], {
    encoding: 'utf8',
    cwd: raizProjeto,
  });
}

function validarOpcoes(opcoes) {
  if (opcoes.id === undefined) abortar('uso: criar-modulo.mjs <id> [--binding b] [--papel p] [--sem-artefato]');
  if (!/^[a-z][a-z0-9-]*$/.test(opcoes.id)) abortar(`id "${opcoes.id}" invalido — use kebab-case minusculo`);
  if (!BINDINGS.includes(opcoes.binding)) abortar(`binding "${opcoes.binding}" invalido — use ${BINDINGS.join(', ')}`);
  if (!PAPEIS.includes(opcoes.papel)) abortar(`papel "${opcoes.papel}" invalido — use ${PAPEIS.join(', ')}`);
}

function principal() {
  const opcoes = lerOpcoes();
  validarOpcoes(opcoes);

  const raizProjeto = acharRaizProjeto();
  const molde = acharMolde(raizProjeto, opcoes.binding);
  if (molde === null) abortar(`molde do binding "${opcoes.binding}" nao encontrado`);

  const destino = join(raizProjeto, 'modulos', opcoes.id);
  if (existsSync(destino)) abortar(`modulo "${opcoes.id}" ja existe em ${destino}`);

  mkdirSync(join(raizProjeto, 'modulos'), { recursive: true });
  cpSync(molde, destino, { recursive: true });

  if (opcoes.semArtefato) {
    for (const relativo of PASTAS_DE_ARTEFATO) rmSync(join(destino, relativo), { recursive: true, force: true });
  }
  if (opcoes.semWeb) {
    rmSync(join(destino, 'web'), { recursive: true, force: true });
    rmSync(join(destino, 'tests', 'web'), { recursive: true, force: true });
  }

  aplicarMarcadores(destino, opcoes.id, resolverEscopo(raizProjeto, opcoes.escopo));
  ajustarManifesto(destino, opcoes);
  if (opcoes.semWeb) podarTextosDeTela(destino);
  criarEnvLocal(destino, opcoes.id);

  process.stdout.write(`modulo "${opcoes.id}" criado em modulos/${opcoes.id}\n`);
  finalizar(opcoes, raizProjeto);
}

function finalizar(opcoes, raizProjeto) {
  // `sincronizar-env.mjs` (sem `--conferir`) MESCLA o `.env` real com as chaves de TODOS os
  // manifestos, inclusive as deste modulo novo — nao so o `.env.example`. Ele nunca sobrescreve
  // valor ja preenchido, entao chamar em todo `criar-modulo` (nao so no primeiro) e seguro; e o
  // que faz o `.env` real acompanhar o segundo modulo em diante, o que uma criacao unica (so no
  // primeiro modulo, com early-return se o arquivo ja existisse) nao fazia — medido: chave do
  // segundo modulo nunca chegava ao `.env` real por esse caminho.
  process.stdout.write(rodar('sincronizar-env.mjs', [], raizProjeto));
  process.stdout.write('validando...\n');
  try {
    process.stdout.write(rodar('gate/validar.mjs', [join('modulos', opcoes.id)], raizProjeto));
  } catch (causa) {
    process.stdout.write(causa.stdout ?? '');
    process.stderr.write('\nmodulo criado, mas o gate apontou pendencias acima — resolva antes de commitar.\n');
    process.exit(1);
  }
  process.stdout.write('\nproximo passo: contrato/openapi.yaml, depois core/dominio e api/src/routes.\n');
}

principal();
