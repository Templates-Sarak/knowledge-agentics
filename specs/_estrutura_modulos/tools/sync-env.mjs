#!/usr/bin/env node
/**
 * sync-env.mjs — gera os `.env.example` e MESCLA o `.env` real, a partir dos MANIFESTOS.
 * Lei dona: specs/arquitetura/01-modulo.md §4.2
 *
 *   node tools/sync-env.mjs             regrava os .env.example, MESCLA o .env real
 *   node tools/sync-env.mjs --check     só verifica os .env.example (para o gate/CI)
 *
 * São DUAS fontes, uma por unidade que declara: `module.json:requiredEnv` para o `.env.example` de
 * cada módulo, e `project.json:requiredEnv` para as chaves da própria RAIZ (a fiação —
 * `adapters/`, `src/`, `packages/`). O `.env.example` da raiz é a união das duas.
 *
 * Sem a raiz declarar, o segredo dela nasce órfão: `JWT_SECRET`, `DATABASE_URL`, chave
 * de provedor — todos fora do `.env.example`, todos invisíveis a `env-declared` e `env-example`,
 * que são regras por módulo. O mais sensível do sistema fica o único que ninguém documenta.
 *
 * O `.env.example` nunca guarda valor real — regravá-lo por inteiro a cada chamada é seguro, e é
 * o que mantém `chaves === manifesto` sem intervenção. O `.env` REAL é outra história: ele guarda
 * segredo de verdade, preenchido à mão (é o único jeito de um segredo nunca virar texto versionado).
 * Por isso este script MESCLA nele — nunca sobrescreve valor já preenchido, nunca apaga chave em
 * silêncio (medido: sem isto, `create-module.mjs` do segundo módulo em diante não teria como fazer
 * a chave nova chegar ao `.env` real; só ao `.env.example`, que ninguém lê para subir o processo).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** `.env.example` — SEM valor, sempre. Regravado por inteiro; "nao edite a mao" e verdade aqui. */
const EXAMPLE_ENV_HEADER = [
  '# .env.example da RAIZ — fonte UNICA de segredo do projeto (ADR-004).',
  '# GERADO por `node tools/sync-env.mjs` a partir de project.json:requiredEnv (as',
  '# chaves da propria raiz) e de module.json:requiredEnv de cada modulo. NAO edite a mao:',
  '# acrescente a chave no manifesto que a EXIGE — project.json ou module.json — e rode o script.',
  '# Este arquivo e versionado (SEM segredo real); o .env real fica no .gitignore.',
];

/**
 * `.env` REAL — tem valor de verdade. As CHAVES sao geradas/mescladas por este script (mesma fonte
 * do `.env.example`); os VALORES sao preenchidos A MAO, por design — e o unico jeito de um segredo
 * nunca virar texto versionado. O script NUNCA sobrescreve valor ja preenchido, e NUNCA apaga chave
 * em silencio: chave que nenhum manifesto exige mais vai para a secao ORFAS, comentada, no fim.
 */
const REAL_ENV_HEADER = [
  '# .env da RAIZ — fonte UNICA de segredo do projeto (ADR-004). NAO versionado (.gitignore).',
  '# As CHAVES sao geradas/mescladas por `node tools/sync-env.mjs`, a partir de',
  '# project.json:requiredEnv e de module.json:requiredEnv de cada modulo — rode o script sempre',
  '# que um manifesto mudar (create-module.mjs ja roda por voce). Os VALORES sao preenchidos A MAO:',
  '# e o unico jeito de um segredo real nunca virar texto versionado. O script NUNCA sobrescreve um',
  '# valor ja preenchido, e NUNCA apaga chave em silencio — chave que nenhum manifesto exige mais',
  '# vai para a secao "ORFAS", comentada, no fim: decida remover ou nao.',
];

/** Cabecalho da secao da raiz. As chaves dela sao `ROOT_*`; as de modulo, `<MODULE>_*`. */
const ROOT_SECTION = '# --- ROOT: a fiacao (adapters/, src/, packages/) — project.json ---';

/** Cabecalho da secao de chaves que nenhum manifesto exige mais. */
const ORPHAN_SECTION = '# --- ORFAS: nenhum manifesto exige mais. Comentadas, valor preservado — apague a mao se tiver certeza ---';

function findProjectRoot() {
  let current = process.cwd();
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(HERE, '..');
}

/** Le removendo o BOM: editor e shell do Windows gravam por padrao, e `JSON.parse` rejeita. */
function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

function buildEntry(dir, name) {
  return {
    name,
    isTemplate: name.startsWith('_'),
    dir,
    manifest: JSON.parse(readText(join(dir, 'module.json'))),
  };
}

/** Módulos com manifesto. Moldes (`_*`) entram — o `.env.example` deles também fica em dia. */
function listModules(projectRoot) {
  const base = join(projectRoot, 'modules');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => statSync(join(base, name)).isDirectory())
    .filter((name) => existsSync(join(base, name, 'module.json')))
    .map((name) => buildEntry(join(base, name), name));
}

/**
 * Moldes dos bindings, quando rodando dentro do repositório do template.
 * Sem isto, o `.env.example` do molde seria o único editado à mão — e o único a divergir (ADR-006).
 */
function listBindingTemplates(projectRoot) {
  const base = join(projectRoot, 'bindings');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((binding) => join(base, binding, '_template'))
    .filter((dir) => existsSync(join(dir, 'module.json')))
    .map((dir) => buildEntry(dir, '_template'));
}

function moduleContent({ manifest }) {
  return [
    `# Chaves do modulo ${manifest.id} — GERADO por tools/sync-env.mjs.`,
    '# O .env REAL e unico, na RAIZ do projeto (ADR-004); este arquivo so DOCUMENTA.',
    '# Sem segredo real aqui. Para acrescentar uma chave: declare em module.json:requiredEnv.',
    '',
    ...(manifest.requiredEnv ?? []).map((key) => `${key}=`),
    '',
  ].join('\n');
}

/**
 * O manifesto da RAIZ. Ausente devolve `null` — projeto anterior ao template, e quem reprova isso é
 * a regra `root-manifest` do gate, não este script. JSON quebrado ESTOURA, como o `module.json`
 * quebrado já estourava: gerar em cima de fonte ilegível daria um `.env.example` silenciosamente
 * incompleto, que é pior que a parada.
 */
function readRootManifest(projectRoot) {
  const path = join(projectRoot, 'project.json');
  return existsSync(path) ? JSON.parse(readText(path)) : null;
}

/** Chaves desejadas da raiz, na MESMA order/secao nos dois arquivos (.env.example e .env real). */
function rootKeysBySection(list, rootEnv) {
  const sections = [];
  if (rootEnv !== null) sections.push({ title: ROOT_SECTION, keys: rootEnv });
  for (const { manifest } of list) {
    sections.push({ title: `# --- ${manifest.name} (${manifest.basePath}) ---`, keys: manifest.requiredEnv ?? [] });
  }
  return sections;
}

function exampleRootContent(list, rootEnv) {
  const lines = [...EXAMPLE_ENV_HEADER, ''];
  // A secao da raiz vem PRIMEIRO, e aparece mesmo vazia quando ha `project.json`: "a raiz nao exige
  // nada" e uma afirmacao, e o operador precisa distingui-la de "ninguem perguntou".
  for (const { title, keys } of rootKeysBySection(list, rootEnv)) {
    lines.push(title, ...keys.map((key) => `${key}=`), '');
  }
  lines.push('# --- Exposto ao browser: NUNCA chave, segredo ou token aqui ---');
  lines.push('');
  return lines.join('\n');
}

/**
 * Pares chave=valor de um `.env` REAL existente, para PRESERVAR ao mesclar. Ignora comentario e
 * linha vazia; `Map` guarda a ORDEM de aparicao no arquivo — e o que da a ordem estavel das ORFAS.
 */
function readEnvRealPairs(content) {
  const pairs = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || !line.includes('=')) continue;
    const equal = line.indexOf('=');
    pairs.set(line.slice(0, equal).trim(), line.slice(equal + 1).trim());
  }
  return pairs;
}

/**
 * MESCLA o `.env` real: mesma forma do `.env.example`, mas com o VALOR já preenchido preservado
 * (nunca `${chave}=`, e sim `${chave}=${valorExistente}`), e as chaves que existiam no arquivo mas
 * nenhum manifesto exige mais viram uma secao ORFAS, comentada — nunca somem em silencio.
 */
function envRealContent(list, rootEnv, existing) {
  const sections = rootKeysBySection(list, rootEnv);
  const desired = new Set(sections.flatMap((section) => section.keys));

  const lines = [...REAL_ENV_HEADER, ''];
  for (const { title, keys } of sections) {
    lines.push(title, ...keys.map((key) => `${key}=${existing.get(key) ?? ''}`), '');
  }
  lines.push('# --- Exposto ao browser: NUNCA chave, segredo ou token aqui ---');
  lines.push('');

  const orphans = [...existing.keys()].filter((key) => !desired.has(key));
  if (orphans.length > 0) {
    lines.push(ORPHAN_SECTION);
    lines.push(...orphans.map((key) => `# ${key}=${existing.get(key)}`));
    lines.push('');
  }
  return lines.join('\n');
}

function buildTargets(projectRoot, list) {
  const moduleEntries = list.map((module) => ({
    path: join(module.dir, '.env.example'),
    content: moduleContent(module),
  }));

  // O `.env.example` da raiz é a união dos módulos REAIS com as chaves da própria raiz. Um
  // repositório que só tem moldes E cuja raiz não exige nada (o do próprio template, e o projeto
  // recém-criado antes do primeiro módulo) não ganha arquivo de raiz — não haveria chave nenhuma
  // nele. Basta a raiz declarar UMA chave para o arquivo passar a existir.
  const real = list.filter((m) => !m.isTemplate);
  const rootEnv = readRootManifest(projectRoot)?.requiredEnv ?? null;
  if (real.length === 0 && (rootEnv === null || rootEnv.length === 0)) return moduleEntries;
  return [
    ...moduleEntries,
    { path: join(projectRoot, '.env.example'), content: exampleRootContent(real, rootEnv) },
  ];
}

/**
 * O alvo do `.env` REAL — `null` quando não há chave nenhuma de raiz a exigir (mesma guarda do
 * `.env.example`). Só entra no MODO ESCRITA (nunca no `--check`): o `.env` tem valor de
 * ambiente, e comparar por igualdade byte a byte reprovaria todo projeto com valor preenchido —
 * o oposto do que essa mescla existe para permitir.
 */
function buildRealEnvTarget(projectRoot, list) {
  const real = list.filter((m) => !m.isTemplate);
  const rootEnv = readRootManifest(projectRoot)?.requiredEnv ?? null;
  if (real.length === 0 && (rootEnv === null || rootEnv.length === 0)) return null;

  const path = join(projectRoot, '.env');
  const existing = existsSync(path) ? readEnvRealPairs(readText(path)) : new Map();
  return { path, content: envRealContent(real, rootEnv, existing) };
}

function main() {
  const check = process.argv.includes('--check');
  const projectRoot = findProjectRoot();
  const list = [...listModules(projectRoot), ...listBindingTemplates(projectRoot)];
  const divergent = [];

  if (list.length === 0) {
    process.stdout.write('No modules with a manifest were found; nothing to synchronize.\n');
    return 0;
  }

  for (const { path, content } of buildTargets(projectRoot, list)) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') === content) continue;
    if (check) {
      divergent.push(path);
      continue;
    }
    writeFileSync(path, content, 'utf8');
    process.stdout.write(`Updated: ${path.replace(projectRoot, '.')}\n`);
  }

  if (check && divergent.length > 0) {
    process.stdout.write(`.env.example differs from the manifests:\n${divergent.map((c) => `  ${c}`).join('\n')}\n`);
    process.stdout.write('Fix it with: node tools/sync-env.mjs\n');
    return 1;
  }
  if (check) {
    process.stdout.write('.env.example matches the manifests.\n');
    return 0;
  }

  // MESCLA o `.env` real — só no modo escrita (o porquê está em `buildRealEnvTarget`). Idempotente:
  // sem chave nova nem manifesto mudado, o conteudo mesclado bate com o atual e nada e regravado.
  const realEnvTarget = buildRealEnvTarget(projectRoot, list);
  if (realEnvTarget !== null) {
    const existedBefore = existsSync(realEnvTarget.path);
    const current = existedBefore ? readFileSync(realEnvTarget.path, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== realEnvTarget.content) {
      writeFileSync(realEnvTarget.path, realEnvTarget.content, 'utf8');
      const reason = existedBefore ? 'keys merged; values preserved' : 'created; fill in real values';
      process.stdout.write(`Updated: ${realEnvTarget.path.replace(projectRoot, '.')} (${reason})\n`);
    }
  }
  return 0;
}

process.exit(main());
