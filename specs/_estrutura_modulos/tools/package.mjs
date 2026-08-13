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

function empacotarBackend(raizProjeto, destino) {
  validarDestino(raizProjeto, destino);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });

  const distRaiz = join(raizProjeto, 'dist');
  if (!existsSync(distRaiz)) {
    throw new Error('dist/ da raiz ausente — este binding nao tem backend emitido para empacotar (JS/Python nao usam este passo)');
  }
  cpSync(distRaiz, join(destino, 'dist'), { recursive: true });

  const modulos = listarModulosReais(raizProjeto);
  const destinoModulos = join(destino, 'modules');
  for (const pastaModulo of modulos) empacotarModulo(pastaModulo, destinoModulos);

  const fontesDeDependencies = [
    lerJsonSeExiste(join(raizProjeto, 'package.json'))?.dependencies,
    ...modulos.map((m) => lerJsonSeExiste(join(m, 'package.json'))?.dependencies),
    ...listarAdapters(raizProjeto).map((a) => lerJsonSeExiste(join(a, 'package.json'))?.dependencies),
  ];
  const pacote = {
    name: 'artefato-backend',
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { start: 'node dist/src/composicao.js' },
    dependencies: mesclarDependencias(fontesDeDependencies),
  };
  writeFileSync(join(destino, 'package.json'), `${JSON.stringify(pacote, null, 2)}\n`, 'utf8');

  // `.env.example` DOCUMENTA as chaves; o `.env` REAL nunca e copiado — segredo e por ambiente de
  // implantacao, nao um artefato de build (specs/arquitetura/00-arquitetura.md §5).
  const exemplo = join(raizProjeto, '.env.example');
  if (existsSync(exemplo)) cpSync(exemplo, join(destino, '.env.example'));

  process.stdout.write(`\nartefato empacotado em ${destino}\n`);
  process.stdout.write('  falta: preencher .env (nao copiado — segredo e por ambiente) e "npm install"\n');
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

function rodarAutoteste() {
  let falhas = 0;
  const casos = casosDeMesclaDeDependencias();

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

  process.stdout.write(`\nautoteste: ${casos.length - falhas}/${casos.length} ok\n`);
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
