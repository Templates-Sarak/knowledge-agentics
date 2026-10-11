#!/usr/bin/env node
/**
 * package.mjs — compila o backend TS (tsc), constroi o front onde existe (`web/`, vite), e
 * opcionalmente empacota um artefato AUTOSSUFICIENTE (sem a arvore de fonte) num diretorio novo.
 * Lei dona: specs/arquitetura/03-operacao.md §9 (build por binding).
 *
 *   node tools/package.mjs                compila backend + front, em arvore (npm run build)
 *   node tools/package.mjs <destino>       idem, MAIS empacota o artefato backend em <destino>
 *   node tools/package.mjs --autoteste     prova interna (mesclarDependencias)
 *
 * SO TYPESCRIPT EMITE. Um module/root sem `tsconfig.build.json` e pulado em silencio informativo —
 * JavaScript ja E o artefato (o fonte roda direto), Python roda o fonte por natureza (specs/arquitetura/
 * 03-operacao.md §9). Nao ha "build vazio" aqui: o que nao emite, o script DIZ que nao emite, e
 * segue — nunca finge um passo que nao faz nada (lei 10 do catalogo, mesma raiz do defeito).
 *
 * O ARTEFATO, por binding: TypeScript empacota o `dist/` emitido; JavaScript copia o que o processo
 * le em runtime (`src/` da raiz de composicao, `adapters/`, `packages/` e, por modulo, `module.json`,
 * `config/`, `api/`, `core/`) — o fonte E o artefato. Python NAO tem passo de empacotamento
 * (03-operacao.md §9.1): este script recusa o binding Python com mensagem, nunca finge empacotar.
 *
 * DEPENDENCIA DE ADAPTER VIAJA COM O ADAPTER E SO ENTRA SE ELE E ESCOLHIDO: `adapters/<provedor>/
 * package.json` declara o driver (`pg`), e o artefato so o carrega se algum modulo escolhe aquele
 * provedor em `config/ports.json`. Projeto que fica em `memory` nao paga o driver.
 *
 * LOCKFILE: o artefato sai com `package-lock.json` gerado do lock da RAIZ
 * (`npm install --package-lock-only`, que reaproveita as versoes ja travadas) — a instalacao de
 * producao (`npm ci --omit=dev`) fica reprodutivel, inclusive nas dependencias transitivas.
 *
 * ZERO SHELL, mesma tecnica de `verify-commit.mjs` (ver o cabecalho de la para o porque —
 * `shell: true` concatena args numa string sem citacao, e um id de modulo vindo de pasta vira
 * injecao). `tsc`/`vite` sao resolvidos pelo campo `bin` do `package.json` deles e rodados com
 * `process.execPath` direto no `.js`, sem passar pelo shim `.cmd`/`.sh` nenhuma vez. Copiada aqui,
 * nao importada: `entrypointDoPacote` já existe em `verify-commit.mjs`, mas essa ferramenta está
 * fora do escopo deste bloco (aprovada, não se reabre) — duas cópias pequenas divergem menos do
 * que uma dependência entre ferramentas que não precisavam se conhecer.
 *
 * ATIVOS COPIADOS POR CONVENCAO, NUNCA POR LISTA DE NOMES — e o que faz a lista nao envelhecer:
 *   - `module.json`: o UNICO nome fixo, porque e o manifesto canonico (um por modulo, sempre).
 *   - `config/*.json`: TODO arquivo `.json` sob `config/` do modulo, mecanicamente — uma chave nova
 *     amanha entra sozinha, sem tocar este arquivo (medido contra o runtime: config.ts:128-141 le
 *     exatamente os `.json` de `config/`, nunca por nome fora dali).
 *   - `dist/`: o que `tsc` emitiu — a lista de ARQUIVOS .ts vira lista de ATIVOS de graca, porque e
 *     o tsconfig.build.json (include) que decide o que compila, nao este script.
 *   - `contract/openapi.yaml`, `core/templates/*.html`, `database/**`: medido (grep no runtime nao-
 *     teste) que NADA disso e lido pelo processo — ficam de fora, de proposito, para o artefato nao
 *     inchar com o que ninguem le rodando.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

function acharRaizProjeto(partida) {
  let atual = partida;
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

function lerJsonSeExiste(caminho) {
  return existsSync(caminho) ? JSON.parse(lerTexto(caminho)) : null;
}

/**
 * O entrypoint JS de um pacote instalado em `<raizNode>/node_modules/<pastaPacote>`, pelo campo
 * `bin` do manifesto dele. Mesma tecnica de `hooks/padrao-limiares.js:entrypointDoProjeto` e de
 * `verify-commit.mjs:entrypointDoPacote` — nao importada de nenhum dos dois (ver cabecalho).
 */
function entrypointDoPacote(raizNode, pastaPacote, chaveBin = pastaPacote) {
  const pasta = join(raizNode, 'node_modules', pastaPacote);
  try {
    const { bin } = JSON.parse(lerTexto(join(pasta, 'package.json')));
    const relativo = typeof bin === 'string' ? bin : bin?.[chaveBin];
    if (!relativo) return null;
    const alvo = join(pasta, relativo);
    return existsSync(alvo) ? alvo : null;
  } catch {
    return null;
  }
}

/** O entrypoint JS do `npm`, ao lado do `node` atual — nunca pelo `PATH` (mesma tecnica de `create-module.mjs`). */
function entrypointDoNpm() {
  const raizNode = dirname(NODE);
  for (const candidato of [raizNode, join(raizNode, '..', 'lib')]) {
    const alvo = entrypointDoPacote(candidato, 'npm');
    if (alvo !== null) return alvo;
  }
  return null;
}

function rodar(rotulo, executavel, args, cwd) {
  process.stdout.write(`  construindo: ${rotulo}\n`);
  execFileSync(executavel, args, { cwd, stdio: 'inherit' });
}

function listarModulosReais(raizProjeto) {
  const base = join(raizProjeto, 'modules');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((nome) => !nome.startsWith('_'))
    .filter((nome) => existsSync(join(base, nome, 'module.json')))
    .map((nome) => join(base, nome));
}

function listarAdapters(raizProjeto) {
  const base = join(raizProjeto, 'adapters');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((nome) => join(base, nome))
    .filter((pasta) => existsSync(join(pasta, 'package.json')));
}

// ================================================================================================
// COMPILACAO — so quando ha `tsconfig.build.json`. Ausencia NAO e erro: e o binding dizendo "nao
// emito" (JS/Python), e o script informa e segue.
// ================================================================================================

function compilarBackendRaiz(raizProjeto) {
  const configBuild = join(raizProjeto, 'tsconfig.build.json');
  if (!existsSync(configBuild)) {
    process.stdout.write('backend da raiz: sem tsconfig.build.json — este binding nao emite (JS ja e o artefato; Python roda o fonte)\n');
    return;
  }
  const tsc = entrypointDoPacote(raizProjeto, 'typescript', 'tsc');
  if (tsc === null) throw new Error('typescript ausente em node_modules — rode "npm install" antes de compilar');
  rodar('backend da raiz (tsc -p tsconfig.build.json)', NODE, [tsc, '-p', 'tsconfig.build.json'], raizProjeto);
}

function compilarBackendDoModulo(raizProjeto, pastaModulo) {
  const configBuild = join(pastaModulo, 'tsconfig.build.json');
  if (!existsSync(configBuild)) {
    process.stdout.write(`backend de ${basename(pastaModulo)}: sem tsconfig.build.json — nada a emitir\n`);
    return;
  }
  const tsc = entrypointDoPacote(raizProjeto, 'typescript', 'tsc');
  if (tsc === null) throw new Error('typescript ausente em node_modules — rode "npm install" antes de compilar');
  rodar(`backend de ${basename(pastaModulo)} (tsc -p tsconfig.build.json)`, NODE, [tsc, '-p', 'tsconfig.build.json'], pastaModulo);
}

function construirWebDoModulo(raizProjeto, pastaModulo) {
  const configVite = ['vite.config.ts', 'vite.config.js']
    .map((nome) => join(pastaModulo, 'web', nome))
    .find((caminho) => existsSync(caminho));
  if (configVite === undefined) {
    process.stdout.write(`web de ${basename(pastaModulo)}: sem web/ — nada a construir (o passo nao falha por isso)\n`);
    return;
  }
  const vite = entrypointDoPacote(raizProjeto, 'vite');
  if (vite === null) throw new Error('vite ausente em node_modules — rode "npm install" antes de construir o front');
  rodar(`web de ${basename(pastaModulo)} (vite build)`, NODE, [vite, 'build', '--config', configVite], pastaModulo);
}

// ================================================================================================
// EMPACOTAMENTO — copia SO o que o artefato precisa para um diretorio novo. Ver o cabecalho para a
// convencao (extensao/pasta, nunca lista de nomes).
// ================================================================================================

/** Copia so os `.json` de uma pasta — mecanico, nunca por nome. */
function copiarJsonDe(origem, destino) {
  if (!existsSync(origem)) return;
  mkdirSync(destino, { recursive: true });
  for (const nome of readdirSync(origem)) {
    if (nome.endsWith('.json')) cpSync(join(origem, nome), join(destino, nome));
  }
}

function empacotarModulo(pastaModulo, destinoModulos) {
  const id = basename(pastaModulo);
  const destino = join(destinoModulos, id);
  mkdirSync(destino, { recursive: true });
  cpSync(join(pastaModulo, 'module.json'), join(destino, 'module.json'));
  copiarJsonDe(join(pastaModulo, 'config'), join(destino, 'config'));

  const dist = join(pastaModulo, 'dist');
  if (existsSync(dist)) {
    // TypeScript: o artefato E o `dist/` compilado — nenhuma fonte `.ts` viaja.
    cpSync(dist, join(destino, 'dist'), { recursive: true });
    return;
  }
  // JavaScript: ja e o proprio artefato — `api/` e `core/` SAO o codigo que roda, sem etapa nenhuma.
  for (const pasta of ['api', 'core']) {
    if (existsSync(join(pastaModulo, pasta))) cpSync(join(pastaModulo, pasta), join(destino, pasta), { recursive: true });
  }
}

/**
 * PURA — mescla `dependencies` de varios `package.json` (raiz, modulos, adapters), MECANICAMENTE:
 * uniao de chaves, a ULTIMA entrada com o mesmo nome vence. Nao envelhece: uma dependencia nova
 * entra sozinha porque a fonte e sempre o campo `dependencies` de quem a declara — nunca uma lista
 * escrita a mao neste arquivo.
 */
export function mesclarDependencias(listaDeDependencies) {
  const resultado = {};
  for (const dependencies of listaDeDependencies) {
    for (const [nome, versao] of Object.entries(dependencies ?? {})) {
      resultado[nome] = versao;
    }
  }
  return resultado;
}

/** Recusa um destino perigoso ANTES do `rmSync` — nunca apaga a propria raiz nem uma ancestral dela. */
function validarDestino(raizProjeto, destino) {
  if (destino === raizProjeto || raizProjeto.startsWith(destino + sep)) {
    throw new Error(`destino "${destino}" contem a raiz do projeto — recusado`);
  }
  const segmentos = destino.split(/[\\/]/).filter(Boolean);
  if (segmentos.length < 2) {
    throw new Error(`destino "${destino}" parece raiz de disco — recusado por seguranca`);
  }
}

/**
 * PURA — os provedores que ALGUM modulo escolhe: a uniao dos valores string de cada `config/ports.json`.
 * E o que decide quais `adapters/<provedor>/` contribuem com `dependencies` ao artefato (o nome da
 * pasta do adapter e o nome do provedor — a convencao de `create-adapter.mjs`).
 */
export function provedoresEscolhidos(listaDePortas) {
  const escolhidos = new Set();
  for (const portas of listaDePortas) {
    for (const provedor of Object.values(portas ?? {})) {
      if (typeof provedor === 'string') escolhidos.add(provedor);
    }
  }
  return escolhidos;
}

/** PURA — qual forma de artefato o projeto tem: `ts` (dist/ emitido), `js` (fonte e artefato) ou `null`. */
export function formaDoArtefato({ temDistNaRaiz, temComposicaoJs }) {
  if (temDistNaRaiz) return 'ts';
  if (temComposicaoJs) return 'js';
  return null;
}

/** `adapters/*` com `package.json` cujo nome de pasta (= provedor) algum modulo escolheu. */
function adaptersEmUso(raizProjeto, modulos) {
  const portas = modulos.map((m) => lerJsonSeExiste(join(m, 'config', 'ports.json')));
  const escolhidos = provedoresEscolhidos(portas);
  return listarAdapters(raizProjeto).filter((pasta) => escolhidos.has(basename(pasta)));
}

/** Copia a arvore de runtime do JS: raiz de composicao, adapters (sem o molde `_*`) e packages. */
function copiarFonteJs(raizProjeto, destino) {
  cpSync(join(raizProjeto, 'src'), join(destino, 'src'), { recursive: true });
  cpSync(join(raizProjeto, 'packages'), join(destino, 'packages'), { recursive: true });
  cpSync(join(raizProjeto, 'adapters'), join(destino, 'adapters'), {
    recursive: true,
    filter: (origem) => !basename(origem).startsWith('_'),
  });
}

/** Copia a raiz do artefato e devolve o comando de `start` dele. */
function copiarRaizDoArtefato(raizProjeto, destino) {
  const forma = formaDoArtefato({
    temDistNaRaiz: existsSync(join(raizProjeto, 'dist')),
    temComposicaoJs: existsSync(join(raizProjeto, 'src', 'composition.js')),
  });
  if (forma === null) {
    throw new Error('este binding nao tem passo de empacotamento (Python roda o fonte e se instala por `pip install`'
      + ' — 03-operacao.md §9.1); nao ha dist/ nem src/composition.js para empacotar');
  }
  if (forma === 'ts') {
    cpSync(join(raizProjeto, 'dist'), join(destino, 'dist'), { recursive: true });
    return 'node dist/src/composition.js';
  }
  copiarFonteJs(raizProjeto, destino);
  return 'node src/composition.js';
}

/**
 * `config/runtime.json` da RAIZ — o unico arquivo de `config/` da raiz que o processo le em runtime
 * (o teto do desligamento gracioso; `verification.json`/`compliance.json` sao politica de CI, nao
 * runtime). Nome fixo pelo mesmo motivo de `module.json`: e o contrato da raiz de composicao.
 */
function copiarConfigDeRuntimeDaRaiz(raizProjeto, destino) {
  const origem = join(raizProjeto, 'config', 'runtime.json');
  if (!existsSync(origem)) {
    throw new Error('config/runtime.json da raiz ausente — o processo composto o exige no boot (teto de desligamento)');
  }
  mkdirSync(join(destino, 'config'), { recursive: true });
  cpSync(origem, join(destino, 'config', 'runtime.json'));
}

/**
 * Gera o `package-lock.json` do artefato a partir do lock da raiz: copia-o e deixa o npm podar para o
 * `package.json` novo, reaproveitando as versoes ja travadas. Sem lock na raiz, falha: artefato sem
 * lock nao e reprodutivel.
 */
function gerarLockDoArtefato(raizProjeto, destino) {
  const lockRaiz = join(raizProjeto, 'package-lock.json');
  if (!existsSync(lockRaiz)) {
    throw new Error('package-lock.json da raiz ausente — rode "npm install" na raiz antes de empacotar (artefato sem lock nao e reprodutivel)');
  }
  cpSync(lockRaiz, join(destino, 'package-lock.json'));
  const npm = entrypointDoNpm();
  if (npm === null) throw new Error('npm ausente ao lado do node atual — nao foi possivel gerar o lock do artefato');
  rodar('lock do artefato (npm install --package-lock-only)', NODE,
    [npm, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], destino);
}

function empacotarBackend(raizProjeto, destino) {
  validarDestino(raizProjeto, destino);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });

  const comandoDeStart = copiarRaizDoArtefato(raizProjeto, destino);
  copiarConfigDeRuntimeDaRaiz(raizProjeto, destino);

  const modulos = listarModulosReais(raizProjeto);
  const destinoModulos = join(destino, 'modules');
  for (const pastaModulo of modulos) empacotarModulo(pastaModulo, destinoModulos);

  const fontesDeDependencies = [
    lerJsonSeExiste(join(raizProjeto, 'package.json'))?.dependencies,
    ...modulos.map((m) => lerJsonSeExiste(join(m, 'package.json'))?.dependencies),
    ...adaptersEmUso(raizProjeto, modulos).map((a) => lerJsonSeExiste(join(a, 'package.json'))?.dependencies),
  ];
  const pacote = {
    name: 'artefato-backend',
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { start: comandoDeStart },
    dependencies: mesclarDependencias(fontesDeDependencies),
  };
  writeFileSync(join(destino, 'package.json'), `${JSON.stringify(pacote, null, 2)}\n`, 'utf8');
  gerarLockDoArtefato(raizProjeto, destino);

  // `.env.example` DOCUMENTA as chaves; o `.env` REAL nunca e copiado — segredo e por ambiente de
  // implantacao, nao um artefato de build (specs/arquitetura/00-arquitetura.md §5).
  const exemplo = join(raizProjeto, '.env.example');
  if (existsSync(exemplo)) cpSync(exemplo, join(destino, '.env.example'));

  process.stdout.write(`\nartefato empacotado em ${destino}\n`);
  process.stdout.write('  falta: preencher .env (nao copiado — segredo e por ambiente) e "npm ci --omit=dev"\n');
}

// ================================================================================================
// AUTOTESTE — so a decisao PURA (`mesclarDependencias`): compilar/empacotar sao I/O de verdade,
// provados pela empacotagem real (relatorio do bloco), nao por fixture em memoria.
// ================================================================================================

function casosDeMesclaDeDependencias() {
  return [
    { nome: 'lista vazia', entradas: [], esperado: {} },
    { nome: 'uniao simples', entradas: [{ a: '1.0.0' }, { b: '2.0.0' }], esperado: { a: '1.0.0', b: '2.0.0' } },
    { nome: 'undefined e null sao ignorados', entradas: [undefined, { a: '1.0.0' }, null], esperado: { a: '1.0.0' } },
    { nome: 'conflito de versao: a ULTIMA entrada vence', entradas: [{ a: '1.0.0' }, { a: '2.0.0' }], esperado: { a: '2.0.0' } },
    {
      nome: 'tres fontes, sem conflito',
      entradas: [{ express: '^4.19.2' }, { express: '^4.19.2', react: '^18.3.1' }, { pg: '^8.11.0' }],
      esperado: { express: '^4.19.2', react: '^18.3.1', pg: '^8.11.0' },
    },
  ];
}

function casosDeProvedoresEForma() {
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return [
    { nome: 'provedoresEscolhidos: uniao dos valores de varios ports.json', fn: () => igual(
      [...provedoresEscolhidos([{ repository: 'postgres', clock: 'system' }, { repository: 'memory' }])].sort(),
      ['memory', 'postgres', 'system'],
    ) },
    { nome: 'provedoresEscolhidos: null/undefined e valor nao-string sao ignorados', fn: () => igual(
      [...provedoresEscolhidos([null, undefined, { a: 1, b: 'memory' }])], ['memory'],
    ) },
    { nome: 'provedoresEscolhidos: tudo em memory -> postgres NAO entra', fn: () => (
      provedoresEscolhidos([{ repository: 'memory', audit: 'memory' }]).has('postgres') === false
    ) },
    { nome: 'formaDoArtefato: dist -> ts; so composition.js -> js; nada -> null (Python)', fn: () => (
      formaDoArtefato({ temDistNaRaiz: true, temComposicaoJs: false }) === 'ts'
      && formaDoArtefato({ temDistNaRaiz: false, temComposicaoJs: true }) === 'js'
      && formaDoArtefato({ temDistNaRaiz: false, temComposicaoJs: false }) === null
    ) },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  const casos = casosDeMesclaDeDependencias();
  for (const caso of casosDeProvedoresEForma()) {
    const ok = caso.fn() === true;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }

  for (const caso of casos) {
    const obtido = mesclarDependencias(caso.entradas);
    const ok = JSON.stringify(obtido) === JSON.stringify(caso.esperado);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} mesclarDependencias: ${caso.nome}\n`);
    if (!ok) {
      falhas += 1;
      process.stdout.write(`       esperado: ${JSON.stringify(caso.esperado)}\n`);
      process.stdout.write(`       obtido:   ${JSON.stringify(obtido)}\n`);
    }
  }

  const total = casos.length + casosDeProvedoresEForma().length;
  process.stdout.write(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function principal() {
  if (process.argv.includes('--autoteste')) return rodarAutoteste();

  const raizProjeto = acharRaizProjeto(process.cwd());
  const bruto = process.argv[2];
  const destino = bruto !== undefined && !bruto.startsWith('--') ? resolve(process.cwd(), bruto) : null;

  compilarBackendRaiz(raizProjeto);
  for (const pastaModulo of listarModulosReais(raizProjeto)) {
    compilarBackendDoModulo(raizProjeto, pastaModulo);
    construirWebDoModulo(raizProjeto, pastaModulo);
  }

  if (destino !== null) empacotarBackend(raizProjeto, destino);
  return 0;
}

process.exit(principal());
