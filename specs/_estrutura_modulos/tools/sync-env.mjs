#!/usr/bin/env node
/**
 * sync-env.mjs — gera os `.env.example` e MESCLA o `.env` real, a partir dos MANIFESTOS.
 * Lei dona: specs/arquitetura/01-modulo.md §4.2
 *
 *   node tools/sync-env.mjs             regrava os .env.example, MESCLA o .env real
 *   node tools/sync-env.mjs --conferir  só verifica os .env.example (para o gate/CI)
 *
 * São DUAS fontes, uma por unidade que declara: `module.json:requiredEnv` para o `.env.example` de
 * cada módulo, e `project.json:requiredEnv` para as chaves da própria RAIZ (a fiação —
 * `adapters/`, `src/`, `packages/`). O `.env.example` da raiz é a união das duas.
 *
 * Enquanto a raiz não declarava, o segredo dela nascia órfão: `JWT_SECRET`, `DATABASE_URL`, chave
 * de provedor — todos fora do `.env.example`, todos invisíveis a `env-declarado` e `env-exemplo`,
 * que são regras por módulo. O mais sensível do sistema era o único que ninguém documentava.
 *
 * O `.env.example` nunca guarda valor real — regravá-lo por inteiro a cada chamada é seguro, e é
 * o que mantém `chaves === manifesto` sem intervenção. O `.env` REAL é outra história: ele guarda
 * segredo de verdade, preenchido à mão (é o único jeito de um segredo nunca virar texto versionado).
 * Por isso este script MESCLA nele — nunca sobrescreve valor já preenchido, nunca apaga chave em
 * silêncio (medido: `create-module.mjs` do segundo módulo em diante não tinha como fazer a chave
 * nova chegar ao `.env` real; só ao `.env.example`, que ninguém lê para subir o processo).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** `.env.example` — SEM valor, sempre. Regravado por inteiro; "nao edite a mao" e verdade aqui. */
const CABECALHO_ENV_EXEMPLO = [
  '# .env.example da RAIZ — fonte UNICA de segredo do projeto (ADR-004).',
  '# GERADO por `node tools/sync-env.mjs` a partir de project.json:envRequerido (as',
  '# chaves da propria raiz) e de module.json:envRequerido de cada modulo. NAO edite a mao:',
  '# acrescente a chave no manifesto que a EXIGE — project.json ou module.json — e rode o script.',
  '# Este arquivo e versionado (SEM segredo real); o .env real fica no .gitignore.',
];

/**
 * `.env` REAL — tem valor de verdade. As CHAVES sao geradas/mescladas por este script (mesma fonte
 * do `.env.example`); os VALORES sao preenchidos A MAO, por design — e o unico jeito de um segredo
 * nunca virar texto versionado. O script NUNCA sobrescreve valor ja preenchido, e NUNCA apaga chave
 * em silencio: chave que nenhum manifesto exige mais vai para a secao ORFAS, comentada, no fim.
 */
const CABECALHO_ENV_REAL = [
  '# .env da RAIZ — fonte UNICA de segredo do projeto (ADR-004). NAO versionado (.gitignore).',
  '# As CHAVES sao geradas/mescladas por `node tools/sync-env.mjs`, a partir de',
  '# project.json:envRequerido e de module.json:envRequerido de cada modulo — rode o script sempre',
  '# que um manifesto mudar (create-module.mjs ja roda por voce). Os VALORES sao preenchidos A MAO:',
  '# e o unico jeito de um segredo real nunca virar texto versionado. O script NUNCA sobrescreve um',
  '# valor ja preenchido, e NUNCA apaga chave em silencio — chave que nenhum manifesto exige mais',
  '# vai para a secao "ORFAS", comentada, no fim: decida remover ou nao.',
];

/** Cabecalho da secao da raiz. As chaves dela sao `RAIZ_*`; as de modulo, `<MODULO>_*`. */
const SECAO_DA_RAIZ = '# --- RAIZ: a fiacao (adapters/, src/, packages/) — project.json ---';

/** Cabecalho da secao de chaves que nenhum manifesto exige mais. */
const SECAO_ORFAS = '# --- ORFAS: nenhum manifesto exige mais. Comentadas, valor preservado — apague a mao se tiver certeza ---';

function acharRaizProjeto() {
  let atual = process.cwd();
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modules'))) return atual;
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
    manifesto: JSON.parse(lerTexto(join(pasta, 'module.json'))),
  };
}

/** Módulos com manifesto. Moldes (`_*`) entram — o `.env.example` deles também fica em dia. */
function listarModulos(raizProjeto) {
  const base = join(raizProjeto, 'modules');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((nome) => statSync(join(base, nome)).isDirectory())
    .filter((nome) => existsSync(join(base, nome, 'module.json')))
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
    .filter((pasta) => existsSync(join(pasta, 'module.json')))
    .map((pasta) => montarEntrada(pasta, '_template'));
}

function conteudoDoModulo({ manifesto }) {
  return [
    `# Chaves do modulo ${manifesto.id} — GERADO por tools/sync-env.mjs.`,
    '# O .env REAL e unico, na RAIZ do projeto (ADR-004); este arquivo so DOCUMENTA.',
    '# Sem segredo real aqui. Para acrescentar uma chave: declare em module.json:envRequerido.',
    '',
    ...(manifesto.requiredEnv ?? []).map((chave) => `${chave}=`),
    '',
  ].join('\n');
}

/**
 * O manifesto da RAIZ. Ausente devolve `null` — projeto anterior ao template, e quem reprova isso é
 * a regra `manifesto-raiz` do gate, não este script. JSON quebrado ESTOURA, como o `module.json`
 * quebrado já estourava: gerar em cima de fonte ilegível daria um `.env.example` silenciosamente
 * incompleto, que é pior que a parada.
 */
function lerManifestoDaRaiz(raizProjeto) {
  const caminho = join(raizProjeto, 'project.json');
  return existsSync(caminho) ? JSON.parse(lerTexto(caminho)) : null;
}

/** Chaves desejadas da raiz, na MESMA order/secao nos dois arquivos (.env.example e .env real). */
function chavesDaRaizPorSecao(lista, envDaRaiz) {
  const secoes = [];
  if (envDaRaiz !== null) secoes.push({ titulo: SECAO_DA_RAIZ, chaves: envDaRaiz });
  for (const { manifesto } of lista) {
    secoes.push({ titulo: `# --- ${manifesto.name} (${manifesto.basePath}) ---`, chaves: manifesto.requiredEnv ?? [] });
  }
  return secoes;
}

function conteudoDaRaizExemplo(lista, envDaRaiz) {
  const linhas = [...CABECALHO_ENV_EXEMPLO, ''];
  // A secao da raiz vem PRIMEIRO, e aparece mesmo vazia quando ha `project.json`: "a raiz nao exige
  // nada" e uma afirmacao, e o operador precisa distingui-la de "ninguem perguntou".
  for (const { titulo, chaves } of chavesDaRaizPorSecao(lista, envDaRaiz)) {
    linhas.push(titulo, ...chaves.map((chave) => `${chave}=`), '');
  }
  linhas.push('# --- Exposto ao browser: NUNCA chave, segredo ou token aqui ---');
  linhas.push('');
  return linhas.join('\n');
}

/**
 * Pares chave=valor de um `.env` REAL existente, para PRESERVAR ao mesclar. Ignora comentario e
 * linha vazia; `Map` guarda a ORDEM de aparicao no arquivo — e o que da a ordem estavel das ORFAS.
 */
function lerParesDoEnvReal(conteudo) {
  const pares = new Map();
  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (linha === '' || linha.startsWith('#') || !linha.includes('=')) continue;
    const igual = linha.indexOf('=');
    pares.set(linha.slice(0, igual).trim(), linha.slice(igual + 1).trim());
  }
  return pares;
}

/**
 * MESCLA o `.env` real: mesma forma do `.env.example`, mas com o VALOR já preenchido preservado
 * (nunca `${chave}=`, e sim `${chave}=${valorExistente}`), e as chaves que existiam no arquivo mas
 * nenhum manifesto exige mais viram uma secao ORFAS, comentada — nunca somem em silencio.
 */
function conteudoDoEnvReal(lista, envDaRaiz, existente) {
  const secoes = chavesDaRaizPorSecao(lista, envDaRaiz);
  const desejadas = new Set(secoes.flatMap((secao) => secao.chaves));

  const linhas = [...CABECALHO_ENV_REAL, ''];
  for (const { titulo, chaves } of secoes) {
    linhas.push(titulo, ...chaves.map((chave) => `${chave}=${existente.get(chave) ?? ''}`), '');
  }
  linhas.push('# --- Exposto ao browser: NUNCA chave, segredo ou token aqui ---');
  linhas.push('');

  const orfas = [...existente.keys()].filter((chave) => !desejadas.has(chave));
  if (orfas.length > 0) {
    linhas.push(SECAO_ORFAS);
    linhas.push(...orfas.map((chave) => `# ${chave}=${existente.get(chave)}`));
    linhas.push('');
  }
  return linhas.join('\n');
}

function montarAlvos(raizProjeto, lista) {
  const doModulo = lista.map((modulo) => ({
    caminho: join(modulo.pasta, '.env.example'),
    conteudo: conteudoDoModulo(modulo),
  }));

  // O `.env.example` da raiz é a união dos módulos REAIS com as chaves da própria raiz. Um
  // repositório que só tem moldes E cuja raiz não exige nada (o do próprio template, e o projeto
  // recém-criado antes do primeiro módulo) não ganha arquivo de raiz — não haveria chave nenhuma
  // nele. Basta a raiz declarar UMA chave para o arquivo passar a existir.
  const reais = lista.filter((m) => !m.eMolde);
  const envDaRaiz = lerManifestoDaRaiz(raizProjeto)?.envRequerido ?? null;
  if (reais.length === 0 && (envDaRaiz === null || envDaRaiz.length === 0)) return doModulo;
  return [
    ...doModulo,
    { caminho: join(raizProjeto, '.env.example'), conteudo: conteudoDaRaizExemplo(reais, envDaRaiz) },
  ];
}

/**
 * O alvo do `.env` REAL — `null` quando não há chave nenhuma de raiz a exigir (mesma guarda do
 * `.env.example`). Só entra no MODO ESCRITA (nunca no `--conferir`): o `.env` tem valor de
 * ambiente, e comparar por igualdade byte a byte reprovaria todo projeto com valor preenchido —
 * o oposto do que essa mescla existe para permitir.
 */
function montarAlvoEnvReal(raizProjeto, lista) {
  const reais = lista.filter((m) => !m.eMolde);
  const envDaRaiz = lerManifestoDaRaiz(raizProjeto)?.envRequerido ?? null;
  if (reais.length === 0 && (envDaRaiz === null || envDaRaiz.length === 0)) return null;

  const caminho = join(raizProjeto, '.env');
  const existente = existsSync(caminho) ? lerParesDoEnvReal(lerTexto(caminho)) : new Map();
  return { caminho, conteudo: conteudoDoEnvReal(reais, envDaRaiz, existente) };
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
    process.stdout.write('corrija com: node tools/sync-env.mjs\n');
    return 1;
  }
  if (conferir) {
    process.stdout.write('.env.example em dia com os manifestos.\n');
    return 0;
  }

  // MESCLA o `.env` real — só no modo escrita (o porquê está em `montarAlvoEnvReal`). Idempotente:
  // sem chave nova nem manifesto mudado, o conteudo mesclado bate com o atual e nada e regravado.
  const alvoEnvReal = montarAlvoEnvReal(raizProjeto, lista);
  if (alvoEnvReal !== null) {
    const existiaAntes = existsSync(alvoEnvReal.caminho);
    const atual = existiaAntes ? readFileSync(alvoEnvReal.caminho, 'utf8') : '';
    if (atual.replace(/\r\n/g, '\n') !== alvoEnvReal.conteudo) {
      writeFileSync(alvoEnvReal.caminho, alvoEnvReal.conteudo, 'utf8');
      const motivo = existiaAntes ? 'chaves mescladas, valores preservados' : 'criado, preencha os valores reais';
      process.stdout.write(`atualizado: ${alvoEnvReal.caminho.replace(raizProjeto, '.')} (${motivo})\n`);
    }
  }
  return 0;
}

process.exit(principal());
