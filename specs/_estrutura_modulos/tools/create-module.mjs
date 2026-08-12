#!/usr/bin/env node
/**
 * create-module.mjs — scaffold determinístico de módulo. Lei dona: specs/arquitetura/01-modulo.md §8
 *
 *   node tools/create-module.mjs <id> [--binding typescript] [--papel dominio]
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
const PASTAS_DE_ARTEFATO = ['core/engine', 'core/templates', 'database', 'generated'];
const BINDINGS = ['typescript', 'javascript', 'python'];
const PAPEIS = ['dominio', 'gateway', 'conector'];

function abortar(mensagem) {
  process.stderr.write(`erro: ${mensagem}\n`);
  process.exit(1);
}

/**
 * Le removendo o BOM (editor e shell do Windows gravam por padrao, e `JSON.parse` rejeita) e
 * normalizando CRLF para LF — defesa em profundidade, mesma de `tools/gate/context.mjs:lerTexto`.
 * O molde é copiado de disco, não de um clone git (`core.autocrlf` não protege aqui), e
 * `podarTesteDeArtefatoPy` casa texto por `\n` literal: sem isto, um molde ainda em CRLF faz o
 * `.replace()` de lá virar noop silencioso (plan-3.md Bloco AE.e).
 */
function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
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

/** Sobe até achar a raiz do projeto (a que tem `modules/`). Cai na raiz da ferramenta se não achar. */
function acharRaizProjeto() {
  let atual = process.cwd();
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modules'))) return atual;
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
    join(raizProjeto, 'modules', `_template-${binding}`),
    join(raizProjeto, 'modules', '_template'),
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
  if (opcoes.semWeb) {
    // As DUAS juntas (Bloco O, plan-2.md) — nao so `rotaWeb`. `navegacao` sozinha, sem `rotaWeb`,
    // e uma entrada de menu apontando para o nada: `navegacao-declarada` reprova, e reprova com
    // razao (o modulo pediu tela removida e deixou o menu para tras).
    manifesto.rotaWeb = null;
    manifesto.navegacao = null;
  }
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

/**
 * Remove `agulha` de `texto` (regex ou string) e EXIGE que algo tenha mudado. Sem isto,
 * `String.replace()`/`RegExp.replace()` que não casam devolvem o texto igual em silêncio — a poda
 * vira noop, o import órfão sobra no arquivo, e só o `tsc`/`ruff` do Bloco K acusa, três passos
 * adiante (o defeito real do AD.1 em `create-module.mjs:162`, plan-3.md Bloco AE.c/AE.e).
 */
function podarOuFalhar(texto, agulha, contexto) {
  const podado = texto.replace(agulha, '');
  if (podado === texto) {
    throw new Error(`podarTesteDeArtefato: "${agulha}" nao encontrado em ${contexto} — o molde mudou e a poda ficou obsoleta`);
  }
  return podado;
}

/**
 * O teste de domínio importa `core/engine` para exercitar `gerarArtefato` (Bloco O, plan-2.md).
 * `--sem-artefato` apaga a PASTA e deixa o teste importando o nada — `tsc`/`import` reprova antes
 * mesmo do `vitest` rodar. Poda o import E o bloco de teste, por binding; o teste de domínio
 * (`montarRegistro`/`montar_registro`) fica intacto, porque não depende do motor.
 */
function podarTesteDeArtefatoTsJs(caminho) {
  const conteudo = lerTexto(caminho);
  const semImportEngine = podarOuFalhar(
    conteudo, /^import \{ gerarArtefato \} from '\.\.\/\.\.\/core\/engine\/index\.js';\n/m, caminho,
  );
  // `registroDeExemplo` so serve o bloco `gerarArtefato` — sem ele, o import fica sem leitor e
  // `tsc --noEmit` reprova com TS6133 ("declared but its value is never read").
  const semImports = podarOuFalhar(
    semImportEngine, /^import \{ registroDeExemplo \} from '\.\.\/fixtures\/index\.js';\n/m, caminho,
  );
  const indice = semImports.indexOf("describe('gerarArtefato'");
  if (indice === -1) return;
  const inicioBloco = semImports.lastIndexOf('\n\n', indice) + 1;
  writeFileSync(caminho, `${semImports.slice(0, inicioBloco).trimEnd()}\n`, 'utf8');
}

function podarTesteDeArtefatoPy(caminho) {
  const conteudo = lerTexto(caminho);
  const semImportEngine = podarOuFalhar(conteudo, 'from core.engine import gerar_artefato\n', caminho);
  // Mesmo motivo do lado TS/JS: `registro_de_exemplo` sem leitor e F401 (ruff) reprova.
  const semImports = podarOuFalhar(
    semImportEngine, 'from tests.fixtures import registro_de_exemplo\n', caminho,
  );
  const indice = semImports.indexOf('TEMPLATE = ');
  if (indice === -1) return;
  const inicioBloco = semImports.lastIndexOf('\n\n', indice) + 1;
  writeFileSync(caminho, `${semImports.slice(0, inicioBloco).trimEnd()}\n`, 'utf8');
}

function podarTesteDeArtefato(destino, binding) {
  if (binding === 'python') {
    podarTesteDeArtefatoPy(join(destino, 'tests', 'domain', 'test_domain.py'));
    return;
  }
  const nome = binding === 'typescript' ? 'domain.test.ts' : 'domain.test.js';
  podarTesteDeArtefatoTsJs(join(destino, 'tests', 'domain', nome));
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
  return execFileSync(process.execPath, [join(RAIZ_FERRAMENTA, 'tools', script), ...argumentos], {
    encoding: 'utf8',
    cwd: raizProjeto,
  });
}

/**
 * O entrypoint JS do `npm` pelo campo `bin` de `node_modules/npm/package.json`, ao lado do `node`
 * atual — nunca pelo `PATH`. Mesma técnica de `ci-dependencies.mjs:entrypointDoNpm` (que por sua vez
 * cita `verify-commit.mjs:entrypointDoNpm`); copiada, não importada — cada ferramenta de
 * `tools/` roda isolada, e um `import` cruzado entre elas viraria dependência que a árvore
 * vendorizada num projeto gerado não garante resolver na mesma ordem.
 */
function entrypointDoNpm() {
  const raizNode = dirname(process.execPath);
  for (const candidato of [raizNode, join(raizNode, '..', 'lib')]) {
    const pasta = join(candidato, 'node_modules', 'npm');
    try {
      const { bin } = JSON.parse(readFileSync(join(pasta, 'package.json'), 'utf8'));
      const relativo = typeof bin === 'string' ? bin : bin?.npm;
      const alvo = relativo && join(pasta, relativo);
      if (alvo && existsSync(alvo)) return alvo;
    } catch {
      // candidato seguinte
    }
  }
  return null;
}

/**
 * `npm install` de novo, DEPOIS do módulo entrar no workspace. Sem isto, as dependências que o
 * `package.json` do módulo novo declara (`react`, `@testing-library/react`, `@vitejs/plugin-react`,
 * ...) nunca são baixadas — `npm install` só liga membro de workspace na hora em que roda, e o único
 * install documentado (`create-project.mjs`, passo 1) acontece ANTES do primeiro módulo existir.
 * Medido: `npm run verificar` de um módulo recém-criado reprovava `tipos` com ~20 erros TS2307
 * ("Cannot find module 'react'") seguindo exatamente os passos que `create-project.mjs` imprime.
 * Só TS/JS: o binding Python não tem manifesto de dependência por módulo (venv único da raiz).
 */
function instalarDependencias(raizProjeto, binding) {
  if (binding === 'python') return;
  const entrada = entrypointDoNpm();
  if (entrada === null) abortar('npm nao encontrado ao lado do node atual — nao foi possivel instalar as dependencias do modulo novo');
  process.stdout.write(execFileSync(process.execPath, [entrada, 'install', '--prefer-offline', '--no-audit', '--no-fund'], {
    encoding: 'utf8',
    cwd: raizProjeto,
  }));
}

function validarOpcoes(opcoes) {
  if (opcoes.id === undefined) abortar('uso: create-module.mjs <id> [--binding b] [--papel p] [--sem-artefato]');
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

  const destino = join(raizProjeto, 'modules', opcoes.id);
  if (existsSync(destino)) abortar(`modulo "${opcoes.id}" ja existe em ${destino}`);

  mkdirSync(join(raizProjeto, 'modules'), { recursive: true });
  cpSync(molde, destino, { recursive: true });

  if (opcoes.semArtefato) {
    for (const relativo of PASTAS_DE_ARTEFATO) rmSync(join(destino, relativo), { recursive: true, force: true });
    podarTesteDeArtefato(destino, opcoes.binding);
  }
  if (opcoes.semWeb) {
    rmSync(join(destino, 'web'), { recursive: true, force: true });
    rmSync(join(destino, 'tests', 'web'), { recursive: true, force: true });
  }

  aplicarMarcadores(destino, opcoes.id, resolverEscopo(raizProjeto, opcoes.escopo));
  ajustarManifesto(destino, opcoes);
  if (opcoes.semWeb) podarTextosDeTela(destino);
  criarEnvLocal(destino, opcoes.id);

  process.stdout.write(`modulo "${opcoes.id}" criado em modules/${opcoes.id}\n`);
  finalizar(opcoes, raizProjeto);
}

function finalizar(opcoes, raizProjeto) {
  // `sync-env.mjs` (sem `--conferir`) MESCLA o `.env` real com as chaves de TODOS os
  // manifestos, inclusive as deste modulo novo — nao so o `.env.example`. Ele nunca sobrescreve
  // valor ja preenchido, entao chamar em todo `criar-modulo` (nao so no primeiro) e seguro; e o
  // que faz o `.env` real acompanhar o segundo modulo em diante, o que uma criacao unica (so no
  // primeiro modulo, com early-return se o arquivo ja existisse) nao fazia — medido: chave do
  // segundo modulo nunca chegava ao `.env` real por esse caminho.
  process.stdout.write(rodar('sync-env.mjs', [], raizProjeto));
  process.stdout.write('instalando dependencias do modulo novo...\n');
  instalarDependencias(raizProjeto, opcoes.binding);
  process.stdout.write('validando...\n');
  try {
    process.stdout.write(rodar('gate/validate.mjs', [join('modules', opcoes.id)], raizProjeto));
  } catch (causa) {
    process.stdout.write(causa.stdout ?? '');
    process.stderr.write('\nmodulo criado, mas o gate apontou pendencias acima — resolva antes de commitar.\n');
    process.exit(1);
  }
  process.stdout.write('\nproximo passo: contract/openapi.yaml, depois core/domain e api/src/routes.\n');
}

principal();
