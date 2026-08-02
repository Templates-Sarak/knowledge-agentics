#!/usr/bin/env node
/**
 * sincronizar-env.mjs — gera os `.env.example` a partir dos MANIFESTOS.
 * Lei dona: specs/arquitetura/01-modulo.md §4.2
 *
 *   node ferramentas/sincronizar-env.mjs             regrava os .env.example
 *   node ferramentas/sincronizar-env.mjs --conferir  só verifica (para o gate/CI)
 *
 * A fonte é `modulo.json:envRequerido`: o `.env.example` de cada módulo documenta as chaves dele,
 * e o da raiz é a união de todos. Ninguém edita esses arquivos à mão — assim eles nunca divergem
 * do que o código realmente exige.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

const CABECALHO_RAIZ = [
  '# .env da RAIZ — fonte UNICA de segredo do projeto (ADR-004).',
  '# GERADO por `node ferramentas/sincronizar-env.mjs` a partir de modulo.json:envRequerido de',
  '# cada modulo. NAO edite a mao: acrescente a chave no manifesto do modulo e rode o script.',
  '# Este arquivo e versionado (SEM segredo real); o .env real fica no .gitignore.',
];

function acharRaizProjeto() {
  let atual = process.cwd();
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modulos'))) return atual;
    const pai = dirname(atual);
    if (pai === atual) break;
    atual = pai;
  }
  return join(AQUI, '..');
}

/** Le removendo o BOM: editor e shell do Windows gravam por padrao, e `JSON.parse` rejeita. */
function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

function montarEntrada(pasta, nome) {
  return {
    nome,
    eMolde: nome.startsWith('_'),
    pasta,
    manifesto: JSON.parse(lerTexto(join(pasta, 'modulo.json'))),
  };
}

/** Módulos com manifesto. Moldes (`_*`) entram — o `.env.example` deles também fica em dia. */
function listarModulos(raizProjeto) {
  const base = join(raizProjeto, 'modulos');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((nome) => statSync(join(base, nome)).isDirectory())
    .filter((nome) => existsSync(join(base, nome, 'modulo.json')))
    .map((nome) => montarEntrada(join(base, nome), nome));
}

/**
 * Moldes dos bindings, quando rodando dentro do repositório do template.
 * Sem isto, o `.env.example` do molde seria o único editado à mão — e o único a divergir (ADR-006).
 */
function listarMoldesDeBinding(raizProjeto) {
  const base = join(raizProjeto, 'bindings');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((binding) => join(base, binding, '_template'))
    .filter((pasta) => existsSync(join(pasta, 'modulo.json')))
    .map((pasta) => montarEntrada(pasta, '_template'));
}

function conteudoDoModulo({ manifesto }) {
  return [
    `# Chaves do modulo ${manifesto.id} — GERADO por ferramentas/sincronizar-env.mjs.`,
    '# O .env REAL e unico, na RAIZ do projeto (ADR-004); este arquivo so DOCUMENTA.',
    '# Sem segredo real aqui. Para acrescentar uma chave: declare em modulo.json:envRequerido.',
    '',
    ...(manifesto.envRequerido ?? []).map((chave) => `${chave}=`),
    '',
  ].join('\n');
}

function conteudoDaRaiz(lista) {
  const linhas = [...CABECALHO_RAIZ, ''];
  for (const { manifesto } of lista) {
    linhas.push(`# --- ${manifesto.nome} (${manifesto.rotaBase}) ---`);
    linhas.push(...(manifesto.envRequerido ?? []).map((chave) => `${chave}=`));
    linhas.push('');
  }
  linhas.push('# --- Exposto ao browser: NUNCA chave, segredo ou token aqui ---');
  linhas.push('');
  return linhas.join('\n');
}

function montarAlvos(raizProjeto, lista) {
  const doModulo = lista.map((modulo) => ({
    caminho: join(modulo.pasta, '.env.example'),
    conteudo: conteudoDoModulo(modulo),
  }));

  // O `.env.example` da raiz é a união dos módulos REAIS. Um repositório que só tem moldes
  // (o do próprio template) não ganha arquivo de raiz — não haveria chave nenhuma nele.
  const reais = lista.filter((m) => !m.eMolde);
  if (reais.length === 0) return doModulo;
  return [...doModulo, { caminho: join(raizProjeto, '.env.example'), conteudo: conteudoDaRaiz(reais) }];
}

function principal() {
  const conferir = process.argv.includes('--conferir');
  const raizProjeto = acharRaizProjeto();
  const lista = [...listarModulos(raizProjeto), ...listarMoldesDeBinding(raizProjeto)];
  const divergentes = [];

  if (lista.length === 0) {
    process.stdout.write('nenhum modulo com manifesto encontrado — nada a sincronizar.\n');
    return 0;
  }

  for (const { caminho, conteudo } of montarAlvos(raizProjeto, lista)) {
    const atual = existsSync(caminho) ? readFileSync(caminho, 'utf8') : '';
    if (atual.replace(/\r\n/g, '\n') === conteudo) continue;
    if (conferir) {
      divergentes.push(caminho);
      continue;
    }
    writeFileSync(caminho, conteudo, 'utf8');
    process.stdout.write(`atualizado: ${caminho.replace(raizProjeto, '.')}\n`);
  }

  if (conferir && divergentes.length > 0) {
    process.stdout.write(`.env.example divergente do manifesto:\n${divergentes.map((c) => `  ${c}`).join('\n')}\n`);
    process.stdout.write('corrija com: node ferramentas/sincronizar-env.mjs\n');
    return 1;
  }
  if (conferir) process.stdout.write('.env.example em dia com os manifestos.\n');
  return 0;
}

process.exit(principal());
