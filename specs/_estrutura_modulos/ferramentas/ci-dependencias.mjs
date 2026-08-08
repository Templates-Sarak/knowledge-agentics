#!/usr/bin/env node
/**
 * ci-dependencias.mjs — audita dependências (npm audit / pip-audit) contra o piso de severidade de
 * `config/verificacao.json:dependencias.severidadeMinima` (já no schema — nenhuma chave nova).
 *
 *   node ferramentas/ci-dependencias.mjs [--json]
 *   node ferramentas/ci-dependencias.mjs --autoteste
 *
 * NÃO é regra de gate — audita ESTADO EXTERNO (registro npm/PyPI), não o código do módulo. Ferramenta,
 * como `contrato-compativel.mjs`/`ci-seguranca.mjs`. Sem id, fora do catálogo.
 *
 * ============================================================================================
 * A DECISÃO JÁ TOMADA (não reaberta aqui): ferramenta ausente é PARTE DO PACOTE — `pip-audit` entra
 * como `optional-dependencies` do projeto (mesmo grupo do `pytest-cov`); `npm audit` é embutido no
 * npm. Isso elimina o "fail-open por ausência": as duas SEMPRE estão instaladas onde este comando
 * roda. O que sobra de "fail-open" morre — vira EXCEÇÃO NOMINAL, RATIFICADA (`decisao`, como o gate
 * já exige) E DATADA (`expira`, novo aqui) em `config/conformidade.json:excecoesCve`.
 *
 * NÚCLEO × CASCA, mesmo precedente de `afetados.mjs`/`contrato-compativel.mjs`/`ci-seguranca.mjs`:
 * `normalizarNpm`/`normalizarPip`/`statusDaExcecao`/`avaliar` recebem DADO (o JSON já parseado, e
 * "hoje" como STRING `YYYY-MM-DD`), nunca tocam `fs`/`child_process`/relógio. A casca resolve os
 * binários SEM shell (mesma técnica de `verificar-commit.mjs:entrypointDoNpm` — não importada de lá
 * porque não é exportada; copiada, com a origem citada, o mesmo precedente que `ci-seguranca.mjs` já
 * seguiu para `acharRaiz`) e lê o relógio UMA vez, na borda.
 *
 * MEDIDO ANTES DE ESCREVER O PARSER (os dois formatos reais, colados no relatório desta tarefa):
 *   - `npm audit --json` (npm 11.x): `{ auditReportVersion, vulnerabilities: { <pacote>: { severity,
 *     isDirect, via: [string|{source,name,url,severity,cwe,cvss,...}], ... } }, metadata }`. SEM
 *     lockfile: `{ error: { code: "ENOLOCK", summary, detail } }` — JSON válido, ZERO vulnerabilidade
 *     não é a mesma coisa que "não consegui auditar" (lei 10), e o campo `error` é o discriminador.
 *   - `pip-audit --format=json`: `{ dependencies: [ { name, version, vulns: [ { id, fix_versions,
 *     aliases, description } ] } ] }`. **Achado, medido**: NENHUM campo de severidade/CVSS — ao
 *     contrário do que este bloco assumia. `pip-audit --help` não tem `--severity` nem `--cvss`. Por
 *     isso `dependencias.severidadeMinima` filtra o lado NPM; do lado PIP, TODO achado conta —
 *     declarado abaixo e em `04-regras.md` §7.2, não escondido.
 *   - **Achado, medido**: as mensagens de aviso do `pip-audit` (`WARNING: pip-audit will run pip
 *     against...`) saem em STDERR, não stdout — mas se a casca capturar os dois fluxos JUNTOS
 *     (`2>&1`), o texto do aviso se mistura ANTES do JSON e quebra o parse. A casca aqui separa os
 *     dois fluxos (`stdio: ['ignore', 'pipe', 'pipe']`) e só faz `JSON.parse` do stdout.
 * ============================================================================================
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process`, `process.env` ou o relógio.
// ================================================================================================

export const ORDEM_SEVERIDADE = ['low', 'moderate', 'high', 'critical'];

/** Extrai o id GHSA/CVE de uma URL de advisory — `null` se a forma não for reconhecida. */
function idDaUrl(url) {
  const casado = typeof url === 'string' ? url.match(/GHSA-[\w-]+$/) : null;
  return casado !== null ? casado[0] : null;
}

/**
 * `npm audit --json` → achados uniformes. Só os itens OBJETO de `via` carregam advisory de verdade;
 * os itens STRING são só "por causa desta outra dependência" — o pacote citado tem sua PRÓPRIA
 * entrada em `vulnerabilities` com o advisory real, então ignorar as strings não perde achado, evita
 * duplicar o mesmo advisory sob dois nomes de pacote.
 */
export function normalizarNpm(auditJson) {
  if (auditJson === null || typeof auditJson !== 'object') return null;
  if (auditJson.error !== undefined) return null; // "nao consegui auditar" — nunca vira lista vazia
  const vulnerabilidades = auditJson.vulnerabilities ?? {};
  const achados = [];
  for (const [pacote, entrada] of Object.entries(vulnerabilidades)) {
    for (const via of entrada.via ?? []) {
      if (typeof via === 'string') continue;
      achados.push({
        ecossistema: 'npm',
        pacote,
        severidade: via.severity ?? entrada.severity ?? null,
        id: idDaUrl(via.url) ?? `npm:${pacote}:${via.source ?? 'sem-id'}`,
        titulo: via.title ?? `${pacote}: vulnerabilidade sem titulo`,
        url: via.url ?? null,
      });
    }
  }
  return achados;
}

/** `pip-audit --format=json` → achados uniformes. SEM severidade (medido — não existe no formato). */
export function normalizarPip(auditJson) {
  if (auditJson === null || typeof auditJson !== 'object' || !Array.isArray(auditJson.dependencies)) return null;
  const achados = [];
  for (const dep of auditJson.dependencies) {
    for (const vuln of dep.vulns ?? []) {
      achados.push({
        ecossistema: 'pip',
        pacote: dep.name,
        severidade: null,
        id: vuln.id ?? (vuln.aliases ?? [])[0] ?? `pip:${dep.name}:sem-id`,
        titulo: (vuln.description ?? '').slice(0, 120) || `${dep.name}: vulnerabilidade sem descricao`,
        url: null,
      });
    }
  }
  return achados;
}

/** `null` (pip, sem severidade) sempre conta — não há como filtrar o que a ferramenta não relata. */
export function acimaDoPiso(severidade, minima) {
  if (severidade === null) return true;
  const indiceAchado = ORDEM_SEVERIDADE.indexOf(severidade);
  const indiceMinimo = ORDEM_SEVERIDADE.indexOf(minima);
  if (indiceAchado === -1 || indiceMinimo === -1) return true; // severidade fora do vocabulario: erra para mais
  return indiceAchado >= indiceMinimo;
}

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Calendário de verdade — rejeita "2026-02-30" que `new Date` rolaria em silêncio para março. */
function dataRealISO(texto) {
  if (typeof texto !== 'string' || !FORMATO_DATA.test(texto)) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/**
 * `hojeISO` é STRING `YYYY-MM-DD`, passada pela casca — nunca lida daqui (é o que faz o `--autoteste`
 * determinístico: sem isso, o caso "expirada" passa hoje e falha em janeiro). Comparação lexicográfica
 * de datas ISO é comparação cronológica — não precisa de objeto `Date` para isso.
 */
export function statusDaExcecao(excecao, hojeISO) {
  if (!excecao || typeof excecao !== 'object' || !excecao.decisao) return 'sem-decisao';
  if (!dataRealISO(excecao.expira)) return 'expira-malformada';
  return excecao.expira < hojeISO ? 'expirada' : 'valida';
}

/**
 * O núcleo inteiro: combina achados normalizados, o piso de severidade e as exceções (com "hoje" já
 * resolvido), e devolve o veredito. Exceção com QUALQUER status que não seja `'valida'` continua
 * REPROVANDO o achado — e some como AVISO próprio, nunca como silêncio (lei 10 aplicada à exceção).
 */
export function avaliar({ npm, pip, minima, excecoes, hojeISO }) {
  if (npm === null && pip === null) {
    return { status: 'nao-auditado', compativel: false, achados: [], excecoesProblematicas: [] };
  }
  const brutos = [...(npm ?? []), ...(pip ?? [])].filter((a) => acimaDoPiso(a.severidade, minima));

  const excecoesProblematicas = [];
  const achados = [];
  for (const achado of brutos) {
    const excecao = (excecoes ?? []).find((e) => e.id === achado.id);
    if (excecao === undefined) {
      achados.push({ ...achado, perdoado: false });
      continue;
    }
    const status = statusDaExcecao(excecao, hojeISO);
    if (status === 'valida') {
      achados.push({ ...achado, perdoado: true });
      continue;
    }
    excecoesProblematicas.push({ id: achado.id, status });
    achados.push({ ...achado, perdoado: false });
  }

  const reprovadores = achados.filter((a) => !a.perdoado);
  return {
    status: 'auditado',
    compativel: reprovadores.length === 0,
    achados,
    excecoesProblematicas,
  };
}

// ================================================================================================
// CASCA — toca disco, `child_process` e o relógio. Cada acesso externo isolado num ponto nomeado.
// ================================================================================================

const AQUI = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

/** Mesmo raciocínio de `gate/contexto.mjs:acharRaizProjeto` — cópia, não import (fora de escopo). */
function acharRaiz(partida) {
  let atual = partida;
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modulos'))) return atual;
    const pai = join(atual, '..');
    if (relative(pai, atual) === '') break;
    atual = pai;
  }
  return partida;
}

const RAIZ = acharRaiz(AQUI);

/** `hoje`, lido UMA vez, na borda — o núcleo inteiro recebe a string, nunca chama o relógio. */
function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function binding() {
  if (existsSync(join(RAIZ, 'package.json'))) return 'node';
  if (existsSync(join(RAIZ, 'pyproject.toml'))) return 'python';
  return null;
}

/**
 * O entrypoint JS de um pacote de `node_modules/<pacote>` pelo campo `bin` — mesma técnica de
 * `verificar-commit.mjs:entrypointDoPacote` (que por sua vez cita `hooks/padrao-limiares.js`). Copiada
 * aqui porque `verificar-commit.mjs` não exporta a função (é FORA de escopo, não editável), e
 * `ferramentas/**` não pode depender de `hooks/` (não viaja para o projeto gerado).
 */
function entrypointDoPacote(raizNode, pastaPacote, chaveBin = pastaPacote) {
  const pasta = join(raizNode, 'node_modules', pastaPacote);
  try {
    const { bin } = JSON.parse(readFileSync(join(pasta, 'package.json'), 'utf8'));
    const relativo = typeof bin === 'string' ? bin : bin?.[chaveBin];
    if (!relativo) return null;
    const alvo = join(pasta, relativo);
    return existsSync(alvo) ? alvo : null;
  } catch {
    return null;
  }
}

/** `npm` vem empacotado ao lado do `node`, não é dependência do projeto — mesmos dois layouts
 * candidatos (Windows/POSIX) de `verificar-commit.mjs:entrypointDoNpm`. */
function entrypointDoNpm() {
  const raizNode = dirname(NODE);
  for (const candidato of [raizNode, join(raizNode, '..', 'lib')]) {
    const achado = entrypointDoPacote(candidato, 'npm');
    if (achado !== null) return achado;
  }
  return null;
}

let pythonResolvido;
function resolverPython() {
  if (pythonResolvido !== undefined) return pythonResolvido;
  const candidatos = [process.env.SARAK_PYTHON, 'python', 'python3'].filter((c) => Boolean(c));
  pythonResolvido = candidatos.find((c) => spawnSync(c, ['--version'], { shell: false }).status === 0) ?? null;
  return pythonResolvido;
}

/** JSON de um comando, com stdout/stderr SEPARADOS (medido: `pip-audit` grava aviso em stderr — juntar
 * os dois fluxos quebra o parse). `null` quando o executável não resolve ou a saída não é JSON. */
function jsonDeComando(executavel, args, cwd) {
  if (executavel === null) return null;
  const resultado = spawnSync(executavel, args, { cwd, encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  if (resultado.error !== undefined) return null;
  try {
    return JSON.parse(resultado.stdout);
  } catch {
    return null;
  }
}

function auditarNpm() {
  const entrada = entrypointDoNpm();
  if (entrada === null) return null; // ferramenta ausente — REPROVA (lei 7), nunca "zero vulnerabilidade"
  return jsonDeComando(NODE, [entrada, 'audit', '--json'], RAIZ);
}

function auditarPip() {
  const python = resolverPython();
  if (python === null) return null;
  return jsonDeComando(python, ['-m', 'pip_audit', '--format=json'], RAIZ);
}

function severidadeMinima() {
  const caminho = join(RAIZ, 'config', 'verificacao.json');
  if (!existsSync(caminho)) return 'high'; // mesmo default de `hooks/test-cobertura.js`/config.json da base
  try {
    return JSON.parse(readFileSync(caminho, 'utf8')).dependencias?.severidadeMinima ?? 'high';
  } catch {
    return 'high';
  }
}

/** `config/conformidade.json:excecoesCve` — MESMO arquivo das exceções de regra do gate, chave nova.
 * Decisão (não um arquivo próprio): a disciplina "sem decisao não vale" já mora e é testada ali;
 * duplicar em outro arquivo repetiria o mecanismo sem nenhum ganho, só mais uma entrada na árvore. */
function excecoesCve() {
  const caminho = join(RAIZ, 'config', 'conformidade.json');
  if (!existsSync(caminho)) return [];
  try {
    return JSON.parse(readFileSync(caminho, 'utf8')).excecoesCve ?? [];
  } catch {
    return [];
  }
}

// ================================================================================================
// SAÍDA
// ================================================================================================

function imprimirHumano(r, bind) {
  if (r.status === 'nao-auditado') {
    process.stdout.write(`  x ferramenta de auditoria ausente ou saida ilegivel (binding: ${bind ?? 'desconhecido'}) — FAIL-CLOSED: nao verificado nunca vira "ok"\n`);
    return;
  }
  if (r.achados.length === 0) {
    process.stdout.write('  ok   nenhuma vulnerabilidade no piso configurado\n');
  }
  for (const a of r.achados) {
    const marca = a.perdoado ? '!' : 'x';
    const rotulo = a.perdoado ? 'PERDOADA (excecao valida)' : 'REPROVA';
    process.stdout.write(`  ${marca} [${a.ecossistema}] ${a.pacote} (${a.severidade ?? 'sem severidade'}) ${a.id}: ${a.titulo} — ${rotulo}\n`);
  }
  for (const p of r.excecoesProblematicas) {
    process.stdout.write(`  !    excecao para "${p.id}" nao vale (${p.status}) — achado continua reprovando\n`);
  }
}

function imprimirJson(r) {
  process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

function lerOpcoes(argv) {
  const opcoes = { json: false, autoteste: false };
  for (const arg of argv) {
    if (arg === '--json') opcoes.json = true;
    if (arg === '--autoteste') opcoes.autoteste = true;
  }
  return opcoes;
}

function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  if (opcoes.autoteste) return rodarAutoteste();

  const bind = binding();
  const npm = bind === 'node' ? auditarNpm() : null;
  const npmNormalizado = npm === null ? null : normalizarNpm(npm);
  const pip = bind === 'python' ? auditarPip() : null;
  const pipNormalizado = pip === null ? null : normalizarPip(pip);

  // Ferramenta ausente/saida ilegivel E o binding exigia aquela ferramenta: nao-auditado.
  const semAuditoria = (bind === 'node' && npmNormalizado === null) || (bind === 'python' && pipNormalizado === null) || bind === null;

  const resultado = semAuditoria
    ? { status: 'nao-auditado', compativel: false, achados: [], excecoesProblematicas: [] }
    : avaliar({ npm: npmNormalizado, pip: pipNormalizado, minima: severidadeMinima(), excecoes: excecoesCve(), hojeISO: hojeISO() });

  if (opcoes.json) imprimirJson(resultado);
  else {
    process.stdout.write(`ci-dependencias: binding ${bind ?? 'desconhecido'}, piso ${severidadeMinima()}\n`);
    imprimirHumano(resultado, bind);
    process.stdout.write(`\nci-dependencias: ${resultado.compativel ? 'OK' : 'REPROVADO'}\n`);
  }
  return resultado.compativel ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — o núcleo puro contra fixtures em memória (JSON real medido, colado como fixture).
// ================================================================================================

const NPM_COM_LOCKFILE_QUEBRADO = { error: { code: 'ENOLOCK', summary: 'This command requires an existing lockfile.' } };

const NPM_UMA_VULN = {
  auditReportVersion: 2,
  vulnerabilities: {
    vite: {
      name: 'vite', severity: 'high', isDirect: true,
      via: [{ source: 1, name: 'vite', url: 'https://github.com/advisories/GHSA-4w7w-66w2-5vf9', severity: 'moderate', title: 'Path Traversal' }],
      effects: [], range: '<=6.4.1', nodes: ['node_modules/vite'],
    },
    'vite-node': { name: 'vite-node', severity: 'moderate', isDirect: false, via: ['vite'], effects: ['vitest'], range: '*', nodes: [] },
  },
  metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 1, low: 0, info: 0, total: 2 } },
};

const PIP_UMA_VULN = {
  dependencies: [
    { name: 'pip', version: '25.2', vulns: [{ id: 'PYSEC-2026-196', fix_versions: ['26.1.2'], aliases: ['GHSA-wf93-45jw-7689', 'CVE-2026-8643'], description: 'path traversal' }] },
    { name: 'anyio', version: '4.14.2', vulns: [] },
  ],
};

function casosDeAutoteste() {
  return [
    { nome: 'npm com lockfile quebrado (error): normalizarNpm devolve null, nunca []', fn: () => normalizarNpm(NPM_COM_LOCKFILE_QUEBRADO) === null },
    { nome: 'npm real: extrai 1 achado de "via" objeto, ignora "via" string duplicada', fn: () => normalizarNpm(NPM_UMA_VULN).length === 1 },
    { nome: 'npm real: id extraido da URL do GHSA', fn: () => normalizarNpm(NPM_UMA_VULN)[0].id === 'GHSA-4w7w-66w2-5vf9' },
    { nome: 'pip real: 1 achado, severidade SEMPRE null (medido — pip-audit nao reporta)', fn: () => { const a = normalizarPip(PIP_UMA_VULN); return a.length === 1 && a[0].severidade === null; } },
    { nome: 'pip com 0 vulns em tudo: lista vazia, NAO null (auditou, achou nada)', fn: () => { const r = normalizarPip({ dependencies: [{ name: 'x', version: '1', vulns: [] }] }); return Array.isArray(r) && r.length === 0; } },
    { nome: 'pip com shape invalido (nao e {dependencies}): null, nao lista vazia', fn: () => normalizarPip({ oops: true }) === null },
    { nome: 'acimaDoPiso: severidade null (pip) sempre conta', fn: () => acimaDoPiso(null, 'critical') === true },
    { nome: 'acimaDoPiso: moderate < high nao conta com piso high', fn: () => acimaDoPiso('moderate', 'high') === false },
    { nome: 'acimaDoPiso: high >= high conta', fn: () => acimaDoPiso('high', 'high') === true },
    { nome: 'excecao sem decisao: sem-decisao (nunca valida)', fn: () => statusDaExcecao({ expira: '2099-01-01' }, '2026-01-01') === 'sem-decisao' },
    { nome: 'excecao com decisao, expira no FUTURO: valida', fn: () => statusDaExcecao({ decisao: 'ADR-01', expira: '2099-01-01' }, '2026-01-01') === 'valida' },
    { nome: 'excecao com decisao, expira no PASSADO: expirada', fn: () => statusDaExcecao({ decisao: 'ADR-01', expira: '2020-01-01' }, '2026-01-01') === 'expirada' },
    { nome: 'excecao com data MALFORMADA (2026-02-30): expira-malformada, nunca "valida para sempre"', fn: () => statusDaExcecao({ decisao: 'ADR-01', expira: '2026-02-30' }, '2026-01-01') === 'expira-malformada' },
    { nome: 'excecao com expira ausente: expira-malformada', fn: () => statusDaExcecao({ decisao: 'ADR-01' }, '2026-01-01') === 'expira-malformada' },
    { nome: 'excecao com expira em formato errado ("30/02/2026"): expira-malformada', fn: () => statusDaExcecao({ decisao: 'ADR-01', expira: '30/02/2026' }, '2026-01-01') === 'expira-malformada' },
    {
      nome: 'avaliar: excecao valida PERDOA o achado (compativel=true)',
      fn: () => {
        const r = avaliar({ npm: normalizarNpm(NPM_UMA_VULN), pip: [], minima: 'low', excecoes: [{ id: 'GHSA-4w7w-66w2-5vf9', decisao: 'ADR-9', expira: '2099-01-01' }], hojeISO: '2026-01-01' });
        return r.compativel === true && r.achados.some((a) => a.perdoado);
      },
    },
    {
      nome: 'avaliar: excecao EXPIRADA nao perdoa — continua reprovando E aparece como excecaoProblematica',
      fn: () => {
        const r = avaliar({ npm: normalizarNpm(NPM_UMA_VULN), pip: [], minima: 'low', excecoes: [{ id: 'GHSA-4w7w-66w2-5vf9', decisao: 'ADR-9', expira: '2020-01-01' }], hojeISO: '2026-01-01' });
        return r.compativel === false && r.excecoesProblematicas.some((p) => p.status === 'expirada');
      },
    },
    {
      nome: 'avaliar: nem npm nem pip auditados (null,null) — nao-auditado, nunca "compativel"',
      fn: () => avaliar({ npm: null, pip: null, minima: 'low', excecoes: [], hojeISO: '2026-01-01' }).status === 'nao-auditado',
    },
    {
      nome: 'ADVERSARIAL: id de excecao com "; echo INJETADO" so casa por IGUALDADE de string — nunca executa',
      fn: () => statusDaExcecao({ id: '; echo INJETADO', decisao: 'ADR-1', expira: '2099-01-01' }, '2026-01-01') === 'valida',
    },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  for (const caso of casosDeAutoteste()) {
    let ok;
    try {
      ok = caso.fn() === true;
    } catch (erro) {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  const total = casosDeAutoteste().length;
  process.stdout.write(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
