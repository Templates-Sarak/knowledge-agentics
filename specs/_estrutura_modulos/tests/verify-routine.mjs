#!/usr/bin/env node
/**
 * verify-routine.mjs — o roteiro do §11.2 de `fe-sistema-modular.md`, como UM comando em vez de
 * prosa que alguém precisa lembrar de rodar. Lei dona: nenhuma — ferramenta de manutenção do
 * TEMPLATE, como `template-self-test.mjs` e as demais de `tests/` (§4.6).
 *
 *   node tests/verify-routine.mjs             roda o roteiro inteiro (A–G), ~5 min — a camada 3 domina
 *   node tests/verify-routine.mjs --autoteste prova o núcleo (contagem, achado de termo) com fixtures
 *
 * Antes desta ferramenta, §11.2 era comando + comentário `# esperado: N` — verde ou vermelho vivia
 * na cabeça de quem rodou, e um número que divergisse ficava só na prosa até a PRÓXIMA verificação
 * manual. Aqui cada `# esperado` virou uma comparação de verdade: diverge, reprova, nomeia os dois
 * lados. Em particular fecha a lacuna que a camada 2 sozinha não fecha (`gate/tests/run.mjs` conta
 * "N regras com caso de teste" mas nunca compara contra `REGRAS.length` — regra nova sem caso não
 * derrubava nada, só encolhia um número que ninguém olhava).
 *
 * NÚCLEO × CASCA, precedente de `verify-map.mjs`/`verify-catalog.mjs`: `compararValor` e
 * `ocorrenciasDoTermo` são puras. A CASCA orquestra os processos reais (node, python) nas mesmas
 * pastas temporárias que o roteiro em prosa descreve, e reusa `classificarPasso` de
 * `template-self-test.mjs` em vez de reimplementar "o que é um `spawnSync` que deu certo".
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classificarPasso } from './template-self-test.mjs';
import { REGRAS } from '../tools/gate/engine.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha até a marca "CASCA" toca `fs` nem `child_process`.
// ================================================================================================

/** Comparação genérica por valor (número, string ou objeto via forma canônica). Um formato só de
 * resultado para toda afirmação do roteiro — é o que deixa a saída previsível de A a G. */
export function compararValor(rotulo, obtido, esperado) {
  const bateu = JSON.stringify(obtido) === JSON.stringify(esperado);
  return {
    ok: bateu,
    rotulo,
    detalhe: bateu ? null : `esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`,
  };
}

/** Quantas vezes `id: '` aparece no texto de um arquivo de família de regras — o mesmo recorte que
 * o `grep -c "id: '"` do §11.2 faz, só que em JS puro (portável, sem depender de `grep` no PATH). */
export function contarIdsDeRegra(texto) {
  return (texto.match(/id:\s*'/g) ?? []).length;
}

/** De uma lista `{ caminho, texto }` (já lida pela casca), os caminhos cujo texto cita `termo` — o
 * núcleo do "o que vazou da base para o projeto gerado" (§11.2 F). Pura: não decide QUAIS arquivos
 * ler, só filtra o que já foi lido. */
export function ocorrenciasDoTermo(arquivosComTexto, termo) {
  return arquivosComTexto.filter(({ texto }) => texto.includes(termo)).map(({ caminho }) => caminho);
}

// ================================================================================================
// CASCA — toca disco, `child_process` e ambiente.
// ================================================================================================

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_TEMPLATE = join(AQUI, '..');
const RAIZ_BASE = join(RAIZ_TEMPLATE, '..', '..');
const NODE = process.execPath;
const IGNORAR_VARREDURA = new Set(['node_modules', '.git', '.venv', '__pycache__']);

function rodarNode(args, cwd) {
  return spawnSync(NODE, args, { cwd, encoding: 'utf8', shell: false });
}

function resolverPython() {
  const candidatos = [process.env.SARAK_PYTHON, 'python', 'python3'].filter(Boolean);
  return candidatos.find((c) => spawnSync(c, ['--version'], { shell: false }).status === 0) ?? null;
}

function rodarPython(executavel, args, cwd) {
  return spawnSync(executavel, args, { cwd, encoding: 'utf8', shell: false });
}

/** Passo = `{ nome, fn }`; `fn` devolve `{ ok, detalhe }` OU lança (a exceção vira `FALHA` também —
 * um passo que explode não deve derrubar o roteiro inteiro, só marcar a si mesmo). */
function rodarPasso(nome, fn) {
  try {
    const r = fn();
    return { nome, ok: r.ok === true, detalhe: r.detalhe ?? null };
  } catch (causa) {
    return { nome, ok: false, detalhe: `excecao: ${causa.message}` };
  }
}

function deProcesso(resultadoSpawn) {
  const c = classificarPasso(resultadoSpawn);
  return { ok: c.ok, detalhe: c.ok ? null : `${c.motivo} — ${[resultadoSpawn?.stdout, resultadoSpawn?.stderr].filter(Boolean).join(' | ').slice(0, 300)}` };
}

/** Varre uma árvore inteira (arquivo por arquivo) devolvendo `{ caminho relativo, texto }` — só de
 * texto (extensões conhecidas), para o achado de termo de F não estourar em binário. */
function lerArvore(raiz) {
  const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.json', '.md', '.yaml', '.yml']);
  const achados = [];
  const pilha = [raiz];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    for (const entrada of readdirSync(atual, { withFileTypes: true })) {
      if (IGNORAR_VARREDURA.has(entrada.name)) continue;
      const caminho = join(atual, entrada.name);
      if (entrada.isDirectory()) { pilha.push(caminho); continue; }
      if (!EXT.has(entrada.name.slice(entrada.name.lastIndexOf('.')))) continue;
      achados.push({ caminho: relative(raiz, caminho).split('\\').join('/'), texto: readFileSync(caminho, 'utf8') });
    }
  }
  return achados;
}

// ── A. as quatro camadas de auto-verificação (§4.1) ────────────────────────────────────────────

const TOTAL_ESPERADO_POR_BINDING = { typescript: 128, javascript: 128, python: 124 };

function passosCamada2() {
  return Object.keys(TOTAL_ESPERADO_POR_BINDING).map((binding) => ({
    nome: `camada 2 — ${binding}`,
    fn: () => {
      const resultado = rodarNode([join(RAIZ_TEMPLATE, 'tools', 'gate', 'tests', 'run.mjs'), '--binding', binding], RAIZ_BASE);
      const proc = deProcesso(resultado);
      if (!proc.ok) return proc;
      const saida = resultado.stdout ?? '';
      const totalOk = saida.match(/binding \w+: (\d+)\/(\d+) ok/);
      if (totalOk === null) return { ok: false, detalhe: 'saida sem a linha "binding X: N/N ok"' };
      const [, ok, total] = totalOk;
      if (ok !== total) return { ok: false, detalhe: `${ok}/${total} — ha FALHA, exit 0 nao deveria ter acontecido` };
      // A CATRACA que faltava: `run.mjs` conta "N regras com caso de teste" mas nunca compara contra
      // o catalogo. Regra nova sem caso encolhia esse numero em silencio — aqui ele reprova.
      const cobertura = saida.match(/(\d+) regras com caso de teste/);
      if (cobertura === null) return { ok: false, detalhe: 'saida sem "N regras com caso de teste"' };
      return compararValor('regras com caso de teste', Number(cobertura[1]), REGRAS.length);
    },
  }));
}

function passosResto() {
  return [
    {
      nome: 'camada 4 — nenhum --autoteste orfao',
      fn: () => deProcesso(rodarNode([join(RAIZ_TEMPLATE, 'tests', 'run-all-selftests.mjs')], RAIZ_BASE)),
    },
    {
      nome: 'camada 3 — o template se testa',
      fn: () => {
        const resultado = rodarNode([join(RAIZ_TEMPLATE, 'tests', 'template-self-test.mjs')], RAIZ_BASE);
        const proc = deProcesso(resultado);
        if (!proc.ok) return proc;
        const bate = /3\/3 bindings verdes/.test(resultado.stdout ?? '');
        return { ok: bate, detalhe: bate ? null : 'saida sem "3/3 bindings verdes"' };
      },
    },
    {
      nome: 'typecheck:tools',
      fn: () => deProcesso(rodarNode([join(RAIZ_BASE, 'node_modules', 'typescript', 'bin', 'tsc'), '--project', 'tsconfig.tools-check.json'], RAIZ_BASE)),
    },
  ];
}

// ── B. o catálogo de regras (§4.2) ──────────────────────────────────────────────────────────────

const FAMILIAS_ESPERADAS = {
  configuration: 21, contract: 11, data: 6, isolation: 12, operation: 11, structure: 11, writing: 4,
};

function passosCatalogo() {
  const pastaRegras = join(RAIZ_TEMPLATE, 'tools', 'gate', 'rules');
  const porFamilia = () => {
    const achados = {};
    for (const arquivo of readdirSync(pastaRegras).filter((n) => n.endsWith('.mjs'))) {
      achados[arquivo.replace('.mjs', '')] = contarIdsDeRegra(readFileSync(join(pastaRegras, arquivo), 'utf8'));
    }
    return achados;
  };
  const por = (chave) => REGRAS.reduce((a, r) => ({ ...a, [r[chave]]: (a[r[chave]] ?? 0) + 1 }), {});

  return [
    { nome: 'catalogo — total de regras', fn: () => compararValor('regras', REGRAS.length, 76) },
    { nome: 'catalogo — por escopo', fn: () => compararValor('escopo', por('escopo'), { module: 58, root: 14, global: 4 }) },
    { nome: 'catalogo — por nivel', fn: () => compararValor('nivel', por('nivel'), { erro: 72, aviso: 4 }) },
    { nome: 'catalogo — por familia', fn: () => compararValor('familia', porFamilia(), FAMILIAS_ESPERADAS) },
    {
      // O terceiro argumento varre `tools/**` atras de "N regras com caso"/"N regras suas"
      // defasada — o defeito medido em `affected.mjs`/`contract-compatible.mjs`/`gate/context.mjs`
      // (73/74/57 contra o 76/58 real). So `tools/**`, nunca `.md` — limite declarado em
      // `verify-catalog.mjs` e em `04-regras.md` §7.2.
      nome: 'catalogo — a catraca lei <-> codigo (ids + contagem em tools/**)',
      fn: () => deProcesso(rodarNode([
        join(AQUI, 'verify-catalog.mjs'), '--conferir',
        join(RAIZ_TEMPLATE, 'doutrina', '04-regras.md'), join(RAIZ_TEMPLATE, 'tools', 'gate', 'engine.mjs'),
        join(RAIZ_TEMPLATE, 'tools'),
      ], RAIZ_BASE)),
    },
    {
      // PORTAS_CONHECIDAS duplicada a mao em cinco lugares, nada comparava — a mesma disciplina
      // da checagem de ids acima, aplicada ao vocabulario de portas em vez do catalogo de regras.
      nome: 'catalogo — vocabulario de portas identico nas cinco fontes',
      fn: () => deProcesso(rodarNode([join(AQUI, 'verify-catalog.mjs'), '--conferir-vocabulario', RAIZ_TEMPLATE], RAIZ_BASE)),
    },
  ];
}

// ── C. os dois manifestos (§2.1) ────────────────────────────────────────────────────────────────

function passosManifestos() {
  const schemas = join(RAIZ_TEMPLATE, 'tools', 'gate', 'schemas');
  return [
    {
      nome: 'manifesto — module.schema.json',
      fn: () => {
        const s = JSON.parse(readFileSync(join(schemas, 'module.schema.json'), 'utf8'));
        return compararValor('module.schema', { obrigatorios: s.required.length, additionalProperties: s.additionalProperties }, { obrigatorios: 19, additionalProperties: false });
      },
    },
    {
      nome: 'manifesto — project.schema.json',
      fn: () => {
        const s = JSON.parse(readFileSync(join(schemas, 'project.schema.json'), 'utf8'));
        return compararValor('project.schema', { obrigatorios: s.required, additionalProperties: s.additionalProperties }, { obrigatorios: ['requiredEnv'], additionalProperties: false });
      },
    },
  ];
}

// ── D. rotas obrigatórias (§2) e o que não viaja (§4.6) ─────────────────────────────────────────

function passosRotasETests() {
  return [
    {
      nome: 'rotas obrigatorias em contract.mjs',
      fn: () => {
        const texto = readFileSync(join(RAIZ_TEMPLATE, 'tools', 'gate', 'rules', 'contract.mjs'), 'utf8');
        const bate = ['/health', '/meta', '/resumo'].every((rota) => texto.includes(`'${rota}'`));
        return { ok: bate, detalhe: bate ? null : 'contract.mjs nao declara as tres rotas obrigatorias' };
      },
    },
    {
      nome: 'ferramentas de manutencao — exatamente 5 arquivos em tests/',
      fn: () => compararValor('arquivos .mjs em tests/', readdirSync(AQUI).filter((n) => n.endsWith('.mjs')).length, 5),
    },
  ];
}

// ── E. a declaração de módulo (§5.1) ────────────────────────────────────────────────────────────

function passosRejeicaoDeModulo(python) {
  if (python === null) {
    return [{ nome: 'declaracao de modulo (E)', ok: false, detalhe: 'nenhum interpretador python resolvido (SARAK_PYTHON/python/python3)', pulado: true }];
  }
  const initRepo = join(RAIZ_BASE, 'skills', 'meta-iniciar-repositorio', 'scripts', 'init_repo.py');
  const casos = [
    { alvo: 'fe-t1', args: ['--modulos', 'catalogo'] },
    { alvo: 'fe-t2', args: ['--modulos', 'hub:connector:artefato'] },
  ];
  return casos.map(({ alvo, args }) => ({
    nome: `rejeicao de forma invalida — ${args.join(' ')}`,
    fn: () => {
      // O PAI é único por `mkdtemp` (como o passo F) — nunca o `destino`: a afirmação é que
      // `init_repo.py` REJEITADO não cria o destino, e um `destino` pré-criado por `mkdtemp`
      // tornaria essa afirmação vazia (sempre "existe", qualquer que fosse o comportamento real).
      // Caminho fixo aqui (medido, Onda 3) colidia entre duas instâncias simultâneas — a segunda
      // apagava o alvo da primeira no meio do teste e morria sem saída, parecendo defeito do
      // template.
      const pai = mkdtempSync(join(tmpdir(), 'sarak-verify-routine-rejeicao-'));
      try {
        const destino = join(pai, alvo);
        const resultado = rodarPython(python, [initRepo, '--target', destino, ...args], RAIZ_BASE);
        if (resultado.status !== 1) return { ok: false, detalhe: `esperava exit 1, saiu ${resultado.status}` };
        if (existsSync(destino)) return { ok: false, detalhe: `${destino} foi criado — rejeicao devia deixar nada para tras` };
        return { ok: true };
      } finally {
        rmSync(pai, { recursive: true, force: true });
      }
    },
  }));
}

// ── F + G. o que viaja para o projeto gerado, e a camada 1 nele (§1.3, §4.1, §4.3) ─────────────

function passosProjetoGerado(python) {
  const destino = mkdtempSync(join(tmpdir(), 'sarak-verify-routine-fe-p-'));
  const t = (...partes) => join(destino, ...partes);
  const passos = [
    {
      nome: 'F — create-project.mjs gera o projeto',
      fn: () => deProcesso(rodarNode([join(RAIZ_TEMPLATE, 'tools', 'create-project.mjs'), destino, '--binding', 'typescript', '--escopo', 'acme'], RAIZ_BASE)),
    },
    {
      nome: 'F — verify-map.mjs --conferir no projeto gerado',
      fn: () => deProcesso(rodarNode([join(AQUI, 'verify-map.mjs'), '--conferir', t('specs', 'arquitetura')], RAIZ_BASE)),
    },
    {
      nome: 'F — nenhum vazamento de "_estrutura_modulos" alem da linha declarada',
      fn: () => {
        const achados = ocorrenciasDoTermo(lerArvore(destino), '_estrutura_modulos');
        return compararValor('arquivos que citam _estrutura_modulos', achados, ['specs/adr/000-decisoes-do-template.md']);
      },
    },
    {
      nome: 'G — create-module.mjs no projeto gerado',
      fn: () => deProcesso(rodarNode([join(destino, 'tools', 'create-module.mjs'), 'catalogo', '--role', 'domain'], destino)),
    },
    {
      nome: 'G — camada 1: gate --todos no projeto gerado',
      fn: () => deProcesso(rodarNode([join(destino, 'tools', 'gate', 'validate.mjs'), '--todos'], destino)),
    },
    {
      nome: 'G — sync-env.mjs --conferir',
      fn: () => deProcesso(rodarNode([join(destino, 'tools', 'sync-env.mjs'), '--conferir'], destino)),
    },
    {
      nome: 'G — generate-port-schemas.mjs --conferir',
      fn: () => deProcesso(rodarNode([join(destino, 'tools', 'generate-port-schemas.mjs'), '--conferir'], destino)),
    },
    {
      nome: 'G — generate-lint-config.mjs --conferir',
      fn: () => deProcesso(rodarNode([join(destino, 'tools', 'generate-lint-config.mjs'), '--conferir'], destino)),
    },
  ];
  return { passos, limpar: () => rmSync(destino, { recursive: true, force: true }) };
}

function rodarRoteiro() {
  const python = resolverPython();
  const { passos: passosFG, limpar } = passosProjetoGerado(python);
  const grupos = [
    ...passosCamada2(),
    ...passosResto(),
    ...passosCatalogo(),
    ...passosManifestos(),
    ...passosRotasETests(),
    ...passosRejeicaoDeModulo(python),
    ...passosFG,
  ];

  const resultados = [];
  try {
    for (const passo of grupos) {
      const resultado = passo.pulado === true ? passo : rodarPasso(passo.nome, passo.fn);
      resultados.push(resultado);
      const marca = resultado.pulado === true ? 'pula ' : (resultado.ok ? 'ok   ' : 'FALHA');
      process.stdout.write(`  ${marca} ${resultado.nome}\n`);
      if (resultado.ok !== true && resultado.pulado !== true) process.stdout.write(`       ${resultado.detalhe}\n`);
    }
  } finally {
    limpar();
  }

  const falhas = resultados.filter((r) => r.ok !== true && r.pulado !== true);
  const executados = resultados.filter((r) => r.pulado !== true);
  process.stdout.write(`\nverify-routine: ${executados.length - falhas.length}/${executados.length} passo(s) ok\n`);
  return falhas.length > 0 ? 1 : 0;
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória, sem tocar disco nem `child_process`.
// ================================================================================================

function casosDeAutoteste() {
  return [
    { nome: 'compararValor: numeros iguais -> ok', fn: () => compararValor('x', 5, 5).ok === true },
    { nome: 'compararValor: numeros diferentes -> nao ok, com os dois lados no detalhe', fn: () => {
      const r = compararValor('x', 5, 6);
      return r.ok === false && r.detalhe.includes('5') && r.detalhe.includes('6');
    } },
    { nome: 'compararValor: objetos com mesma forma -> ok', fn: () => compararValor('x', { a: 1, b: 2 }, { a: 1, b: 2 }).ok === true },
    { nome: 'contarIdsDeRegra: conta so as ocorrencias de "id: \'"', fn: () => contarIdsDeRegra("id: 'a',\n  id: 'b',\n  outraChave: 'x'") === 2 },
    { nome: 'contarIdsDeRegra: texto sem id -> zero', fn: () => contarIdsDeRegra('nada aqui') === 0 },
    { nome: 'ocorrenciasDoTermo: acha so quem cita o termo', fn: () => {
      const r = ocorrenciasDoTermo([{ caminho: 'a.md', texto: 'cita _estrutura_modulos aqui' }, { caminho: 'b.md', texto: 'nao cita' }], '_estrutura_modulos');
      return r.length === 1 && r[0] === 'a.md';
    } },
    { nome: 'ocorrenciasDoTermo: nenhuma ocorrencia -> lista vazia', fn: () => ocorrenciasDoTermo([{ caminho: 'a.md', texto: 'nada' }], '_estrutura_modulos').length === 0 },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  for (const caso of casosDeAutoteste()) {
    let ok;
    try {
      ok = caso.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  const total = casosDeAutoteste().length;
  process.stdout.write(`\nautoteste (verify-routine): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(process.argv.includes('--autoteste') ? rodarAutoteste() : rodarRoteiro());
}
