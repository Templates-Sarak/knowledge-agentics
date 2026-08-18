#!/usr/bin/env node
/**
 * create-adapter.mjs — scaffold determinístico de adapter. Lei dona: specs/arquitetura/01-modulo.md
 * §5.2.
 *
 *   node tools/create-adapter.mjs <porta> <provedor> [--binding typescript]
 *
 * Mesma forma do `create-module.mjs`: copia o molde (`adapters/_template`, instalado por
 * `create-project.mjs`), substitui marcadores, registra a fábrica em `src/composicao.*` e roda o
 * gate. `<porta>` tem de estar no vocabulário conhecido (`tools/gate/ports-vocabulary.mjs`)
 * — nome fora dele é rejeitado antes de tocar disco.
 *
 * O molde é um STUB, de propósito: os MÉTODOS de cada interface variam por porta (`Repositorio`
 * tem quatro, `Notificador` tem um), e um gerador que tentasse produzir o corpo certo por porta
 * precisaria entender a forma de cada interface nas três linguagens — mais caro que o defeito que
 * evitaria. O molde importa nada, devolve um tipo genérico e lança "TODO: implemente" nomeando a
 * porta e o arquivo; o gate NÃO cobra método (não é AST), só isolamento e forma.
 *
 * LIMITE CONHECIDO: `verificadorDeToken` é resolvida por `resolveAuth()`/`resolve_auth()`, não por
 * `FABRICAS` — é a auth ÚNICA do sistema, nunca por-módulo. Registrar um adapter para a porta
 * "verificadorDeToken" aqui ACRESCENTA a entrada em `FABRICAS` (coerente com o vocabulário), mas
 * nada a consulta hoje; trocar o provedor de auth continua sendo editar `resolveAuth()` à mão. Não
 * é bug deste script — é a mesma arquitetura de antes dele. Nome da porta por ADR-010
 * (`specs/adr/000-decisoes-do-template.md`) — era `auth`, e colidia com a auth da fiação.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { PORTAS_CONHECIDAS } from './gate/ports-vocabulary.mjs';

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
    abortar('uso: create-adapter.mjs <porta> <provedor> [--binding b]');
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
 * Acha o molde, no mesmo precedente de `create-module.mjs:acharMolde`: primeiro o que
 * `create-project.mjs` instalou no projeto (`adapters/_template`), depois o do próprio template —
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

/**
 * Nome de pasta/import do adapter — kebab-case em TS/JS (onde funciona: nome de pasta e chave de
 * objeto CITADA aceitam hífen), snake_case só em Python, onde o hífen não é uma preferência de
 * estilo e sim ilegal em `import`/nome de módulo (regra da linguagem, não deste script). A
 * IDENTIDADE do provedor (o que vai em `config/ports.json`, na chave string de `FABRICAS` e na
 * mensagem pro usuário) continua kebab-case nos três bindings — só a pasta física em disco e o
 * caminho de import Python sofrem a conversão. ADR-011.
 */
function pastaAdapter(binding, provedor) {
  return binding === 'python' ? provedor.replaceAll('-', '_') : provedor;
}

/**
 * `<provedor-pasta>` é um marcador À PARTE de `<provedor>`: identidade (nome do adapter, "Adapter
 * disco-frio para a porta...") continua kebab-case sempre, mas a referência a CAMINHO EM DISCO
 * (`adapters/<pasta>/__init__.py` no TODO do molde Python) precisa apontar pro nome de pasta real
 * — que diverge da identidade quando `pastaAdapter` converte pra snake_case. Sem o marcador
 * separado, o TODO gerado apontaria pra uma pasta que não existe.
 */
function substituirMarcadores(texto, porta, provedor, pasta) {
  return texto.replaceAll('<porta>', porta).replaceAll('<provedor-pasta>', pasta).replaceAll('<provedor>', provedor);
}

/**
 * O nome fixo que o molde usa — nunca marcador, para o arquivo em disco continuar sintaticamente
 * válido SEMPRE, mesmo sem substituição (a mesma garantia de `modules/_template`, cujos marcadores
 * vivem só em comentário/string). Este script troca o nome pelo do provedor NA CÓPIA, não no molde.
 *
 * `createAdapter`, não `criarAdapter`: é o que os moldes `_adapter/index.{ts,js}` REALMENTE
 * exportam (medido) — o molde é a verdade (mesmo precedente das âncoras de `registrarFabrica*`).
 * A forma antiga (`criarAdapter`) nunca casava com `\breplaceAll\b`, e a rescrita nunca disparava:
 * TODO adapter TS/JS já criado manteve `export function createAdapter` no arquivo, enquanto
 * `composicao.*` importava o nome CORRETO (`criarG`, calculado, nunca escrito) — `tsc` reprova ao
 * primeiro adapter novo, mas nada rodava `tsc` depois de `create-adapter.mjs` até esta rede existir.
 */
const NOME_GENERICO = { typescript: 'createAdapter', javascript: 'createAdapter', python: 'AdapterPendente' };

function nomeDoProvedor(binding, provedor) {
  const pascal = paraPascalCase(provedor);
  return binding === 'python' ? pascal : `criar${pascal}`;
}

function copiarEAdaptarMolde(molde, destino, opcoes) {
  mkdirSync(destino, { recursive: true });
  cpSync(molde, destino, { recursive: true });

  const nomeNovo = nomeDoProvedor(opcoes.binding, opcoes.provedor);
  const generico = NOME_GENERICO[opcoes.binding];
  const pasta = pastaAdapter(opcoes.binding, opcoes.provedor);
  for (const nome of readdirSync(destino)) {
    const caminho = join(destino, nome);
    const substituido = substituirMarcadores(lerTexto(caminho), opcoes.porta, opcoes.provedor, pasta)
      .replaceAll(new RegExp(`\\b${generico}\\b`, 'g'), nomeNovo);
    writeFileSync(caminho, substituido, 'utf8');
  }
  return nomeNovo;
}

/**
 * Registra a fábrica nova em `src/composicao.*`, por SUBSTITUIÇÃO DE TEXTO — mesma técnica de
 * `generate-port-schemas.mjs:comEnumDePortasAtualizado`. Duas formas: a porta JÁ tem entrada
 * (acrescenta um provedor a mais na MESMA linha) ou é porta NOVA (acrescenta uma linha antes do
 * fechamento do objeto). Devolve `null` se nenhuma das duas âncoras bateu — o chamador ABORTA em
 * vez de escrever um arquivo quebrado.
 */
function registrarFabricaTs(conteudo, { porta, provedor, nomeSimbolo, caminhoImport }) {
  const linhaDaImportacao = "} from '../adapters/memory/index.js';";
  const comImport = conteudo.includes(linhaDaImportacao)
    ? conteudo.replace(linhaDaImportacao, `${linhaDaImportacao}\nimport { ${nomeSimbolo} } from '${caminhoImport}';`)
    : null;
  if (comImport === null) return null;

  const linhaDaPorta = new RegExp(`(  ${porta}: \\{ [^}]*)( \\},\\n)`);
  if (linhaDaPorta.test(comImport)) {
    // Chave CITADA: `provedor` é kebab-case (validarOpcoes aceita hífen, e a mensagem de erro da
    // ferramenta recomenda o formato), e chave de objeto sem aspas com `-` é erro de sintaxe —
    // `storage: { memoria: ..., disco-frio: ... }` nunca parseava. Citar um identificador que já
    // era válido continua legal em JS/TS, então provedores sem hífen não regridem.
    return comImport.replace(linhaDaPorta, `$1, '${provedor}': () => ${nomeSimbolo}()$2`);
  }
  // `[^>]*` no lugar da assinatura do parâmetro (em vez de `\(\)` fixo): o molde real declara
  // `(modulo: ManifestoDescoberto) => unknown`, não `() => unknown` — a âncora antiga, presa à
  // forma SEM parâmetro, nunca casava contra o molde de verdade. Medido: a única porta que hoje
  // alcança este ramo (`FABRICAS` já tem as outras seis) sai com "nao encontrei onde registrar a
  // fabrica", sempre. `[^>]*` tolera qualquer assinatura de parâmetro futura sem reabrir o mesmo
  // drift — só não atravessa o `>>` de fechamento do genérico.
  const aberturaObjeto = /(const FABRICAS: Record<string, Record<string, [^>]*=> unknown>> = \{\n)/;
  if (!aberturaObjeto.test(comImport)) return null;
  return comImport.replace(aberturaObjeto, `$1  ${porta}: { '${provedor}': () => ${nomeSimbolo}() },\n`);
}

function registrarFabricaJs(conteudo, { porta, provedor, nomeSimbolo, caminhoImport }) {
  const linhaDaImportacao = "} from '../adapters/memory/index.js';";
  const comImport = conteudo.includes(linhaDaImportacao)
    ? conteudo.replace(linhaDaImportacao, `${linhaDaImportacao}\nimport { ${nomeSimbolo} } from '${caminhoImport}';`)
    : null;
  if (comImport === null) return null;

  const linhaDaPorta = new RegExp(`(  ${porta}: \\{ [^}]*)( \\},\\n)`);
  if (linhaDaPorta.test(comImport)) {
    // Mesma razão da versão TS acima: chave CITADA, porque `provedor` pode ter hífen.
    return comImport.replace(linhaDaPorta, `$1, '${provedor}': () => ${nomeSimbolo}()$2`);
  }
  const aberturaObjeto = /(const FABRICAS = \{\n)/;
  if (!aberturaObjeto.test(comImport)) return null;
  return comImport.replace(aberturaObjeto, `$1  ${porta}: { '${provedor}': () => ${nomeSimbolo}() },\n`);
}

function registrarFabricaPy(conteudo, { porta, provedor, nomeSimbolo, caminhoImport }) {
  // A âncora e o ULTIMO import antes do comentario, seja ele qual for — nao mais o `)` do import
  // multilinha de `adapters.memory` especificamente. O molde real ja tem uma SEGUNDA linha de
  // import entre os dois (`from adapters.postgres import ...`), e a ancora antiga, presa ao `)`,
  // nunca casava contra o molde de verdade: `create-adapter.mjs --binding python` falhava para
  // TODA porta, sempre (medido). Ancorar na linha em branco + comentario,
  // em vez do caractere que a precede, sobrevive a uma terceira linha de import que venha a existir.
  const linhaDaImportacao = '\n\n# Fabrica de adapter';
  const comImport = conteudo.includes(linhaDaImportacao)
    ? conteudo.replace(linhaDaImportacao, `\nfrom ${caminhoImport} import ${nomeSimbolo}\n\n# Fabrica de adapter`)
    : null;
  if (comImport === null) return null;

  const linhaDaPorta = new RegExp(`(    "${porta}": \\{[^}]*)(\\},\\n)`);
  if (linhaDaPorta.test(comImport)) {
    return comImport.replace(linhaDaPorta, `$1, "${provedor}": ${nomeSimbolo}$2`);
  }
  // Mesmo drift do TS (linha 147, `[^>]*`): o molde real declara
  // `Callable[[dict[str, Any]], Any]` (o adapter recebe o manifesto), nao `Callable[[], Any]`
  // (sem parametro) — a ancora antiga so casava a forma vazia. `.*` no lugar da lista de
  // parametros tolera qualquer assinatura, presente ou futura, sem reabrir o mesmo drift.
  const aberturaObjeto = /(FABRICAS: dict\[str, dict\[str, Callable\[.*\]\]\] = \{\n)/;
  if (!aberturaObjeto.test(comImport)) return null;
  return comImport.replace(aberturaObjeto, `$1    "${porta}": {"${provedor}": ${nomeSimbolo}},\n`);
}

function caminhoDeComposicao(raizProjeto, binding) {
  const nome = binding === 'python' ? 'composicao.py' : `composicao.${binding === 'typescript' ? 'ts' : 'js'}`;
  return join(raizProjeto, 'src', nome);
}

function registrarFabrica(raizProjeto, opcoes, nomeGerado) {
  const caminho = caminhoDeComposicao(raizProjeto, opcoes.binding);
  const conteudo = lerTexto(caminho);

  const pasta = pastaAdapter(opcoes.binding, opcoes.provedor);
  const atualizado = opcoes.binding === 'python'
    ? registrarFabricaPy(conteudo, {
      porta: opcoes.porta, provedor: opcoes.provedor, nomeSimbolo: nomeGerado,
      caminhoImport: `adapters.${pasta}`,
    })
    : (opcoes.binding === 'typescript' ? registrarFabricaTs : registrarFabricaJs)(conteudo, {
      porta: opcoes.porta, provedor: opcoes.provedor, nomeSimbolo: nomeGerado,
      caminhoImport: `../adapters/${pasta}/index.js`,
    });

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
      [join(raizProjeto, 'tools', 'gate', 'validate.mjs'), '--todos'],
      { encoding: 'utf8', cwd: raizProjeto },
    ));
  } catch (causa) {
    process.stdout.write(causa.stdout ?? '');
    process.stderr.write('\nadapter criado, mas o gate apontou pendencias acima — resolva antes de commitar.\n');
    process.exit(1);
  }
}

// ================================================================================================
// AUTOTESTE — núcleo puro (paraPascalCase/nomeDoProvedor/substituirMarcadores/registrarFabrica{Ts,Js,Py})
// contra fixtures em memória, sem tocar disco. Precedente de `verify-map.mjs`/`verify-catalog.mjs`.
//
// As fixtures de `registrarFabrica*` são cópias FIÉIS do trecho real de cada `bindings/<b>/root/
// src/composicao.*` — não simplificadas — porque o valor deste autoteste é justamente flagrar quando
// a ÂNCORA do regex e o arquivo real se separam. Foi rodando este autoteste contra o texto real,
// antes do refactor de §4.7 (`max-params`), que dois bugs pré-existentes apareceram — nenhum era do
// refactor, e os dois foram corrigidos na mesma rodada:
//
// (1) TS: o tipo de `FABRICAS` no molde real é `Record<string, Record<string, (modulo:
//     ManifestoDescoberto) => unknown>>`, mas a âncora de "porta nova" em `registrarFabricaTs`
//     esperava `() => unknown` (sem parâmetro) — drift entre o gerador e o molde. Consertado:
//     `[^>]*` no lugar da assinatura do parâmetro, tolerante à forma sem reabrir o mesmo drift.
// (2) Python: a âncora de importação em `registrarFabricaPy` era `)\n\n# Fabrica de adapter`, presa
//     ao `)` do import multilinha de `adapters.memory` seguido direto de linha em branco. O molde
//     real tem uma SEGUNDA linha de import (`from adapters.postgres import ...`) entre os dois, e a
//     âncora nunca casava — `--binding python` falhava SEMPRE, para qualquer porta. Consertado:
//     âncora movida para a linha em branco + comentário, que sobrevive a uma terceira linha de
//     import que venha a existir.
// ================================================================================================

const FIXTURE_TS_MOLDE_REAL = [
  "import {",
  '  createRepository,',
  "} from '../adapters/memory/index.js';",
  "import { createPostgresRepository } from '../adapters/postgres/index.js';",
  '',
  'const FABRICAS: Record<string, Record<string, (modulo: ManifestoDescoberto) => unknown>> = {',
  '  repositorio: { memoria: () => createRepository() },',
  '};',
  '',
].join('\n');

const FIXTURE_JS_MOLDE_REAL = [
  "import {",
  '  createRepository,',
  "} from '../adapters/memory/index.js';",
  '',
  'const FABRICAS = {',
  '  repositorio: { memoria: () => createRepository() },',
  '};',
  '',
].join('\n');

const FIXTURE_PY_MOLDE_REAL = [
  'from adapters.memory import (',
  '    RepositorioEmMemoria,',
  ')',
  'from adapters.postgres import AuditoriaPostgres, RepositorioPostgres',
  '',
  '# Fabrica de adapter por (porta, provedor).',
  'FABRICAS: dict[str, dict[str, Callable[[dict[str, Any]], Any]]] = {',
  '    "repositorio": {"memory": lambda modulo: RepositorioEmMemoria()},',
  '}',
  '',
].join('\n');

// A mesma forma do molde Python, mas SEM a segunda linha de import — prova que a lógica de
// `registrarFabricaPy` funciona quando a âncora bate; o que falta hoje é o molde ter se afastado
// dela, não a função estar quebrada por dentro.
const FIXTURE_PY_ANCORA_ISOLADA = [
  'from adapters.memory import (',
  '    RepositorioEmMemoria,',
  ')',
  '',
  '# Fabrica de adapter por (porta, provedor).',
  'FABRICAS: dict[str, dict[str, Callable[[], Any]]] = {',
  '    "repositorio": {"memory": lambda: RepositorioEmMemoria()},',
  '}',
  '',
].join('\n');

/** Atalho só do autoteste — monta o objeto de parâmetros na ordem posicional antiga, para os
 * casos ficarem tão tersos quanto eram antes do refactor de §4.7 (`max-params`). */
function paramsFabrica(porta, provedor, nomeSimbolo, caminhoImport) {
  return { porta, provedor, nomeSimbolo, caminhoImport };
}

function casosPuros() {
  return [
    { nome: 'paraPascalCase: kebab com hifen -> PascalCase', fn: () => paraPascalCase('aws-s3') === 'AwsS3' },
    { nome: 'paraPascalCase: palavra unica -> so capitaliza', fn: () => paraPascalCase('okta') === 'Okta' },
    { nome: 'nomeDoProvedor: typescript prefixa "criar"', fn: () => nomeDoProvedor('typescript', 'okta') === 'criarOkta' },
    { nome: 'nomeDoProvedor: javascript prefixa "criar"', fn: () => nomeDoProvedor('javascript', 'okta') === 'criarOkta' },
    { nome: 'nomeDoProvedor: python e so PascalCase, sem prefixo', fn: () => nomeDoProvedor('python', 'okta') === 'Okta' },
    { nome: 'substituirMarcadores: troca <porta> e <provedor>', fn: () => substituirMarcadores('<porta> e <provedor>', 'auth', 'okta', 'okta') === 'auth e okta' },
    {
      nome: 'substituirMarcadores: <provedor-pasta> troca separado de <provedor> (identidade x caminho)',
      fn: () => substituirMarcadores('<provedor> em <provedor-pasta>', 'x', 'disco-frio', 'disco_frio') === 'disco-frio em disco_frio',
    },
    { nome: 'pastaAdapter: python converte hifen -> underscore', fn: () => pastaAdapter('python', 'disco-frio') === 'disco_frio' },
    { nome: 'pastaAdapter: typescript/javascript mantem kebab-case', fn: () => pastaAdapter('typescript', 'disco-frio') === 'disco-frio' && pastaAdapter('javascript', 'disco-frio') === 'disco-frio' },
  ];
}

function casosRegistroTs() {
  return [
    {
      nome: 'registrarFabricaTs: porta EXISTENTE ganha provedor novo na mesma linha, mais o import',
      fn: () => {
        const r = registrarFabricaTs(FIXTURE_TS_MOLDE_REAL, paramsFabrica('repositorio', 'dynamo', 'criarDynamo', '../adapters/dynamo/index.js'));
        return r !== null
          && r.includes("repositorio: { memoria: () => createRepository(), 'dynamo': () => criarDynamo() },")
          && r.includes("import { criarDynamo } from '../adapters/dynamo/index.js';");
      },
    },
    {
      nome: 'registrarFabricaTs: porta NOVA ("verificadorDeToken") registra (bug 1 consertado — ver cabecalho)',
      fn: () => {
        const r = registrarFabricaTs(FIXTURE_TS_MOLDE_REAL, paramsFabrica('verificadorDeToken', 'okta', 'criarOkta', '../adapters/okta/index.js'));
        return r !== null && r.includes("verificadorDeToken: { 'okta': () => criarOkta() },");
      },
    },
    {
      nome: 'registrarFabricaTs: sem a linha de import -> null',
      fn: () => registrarFabricaTs('nada de import aqui', paramsFabrica('repositorio', 'x', 'y', 'z')) === null,
    },
    {
      nome: 'registrarFabricaTs: provedor com hifen -> chave CITADA (bug 3 consertado — ver cabecalho)',
      fn: () => {
        const r = registrarFabricaTs(FIXTURE_TS_MOLDE_REAL, paramsFabrica('repositorio', 'disco-frio', 'criarDiscoFrio', '../adapters/disco-frio/index.js'));
        return r !== null && r.includes("repositorio: { memoria: () => createRepository(), 'disco-frio': () => criarDiscoFrio() },");
      },
    },
  ];
}

function casosRegistroJs() {
  return [
    {
      nome: 'registrarFabricaJs: porta EXISTENTE ganha provedor novo, mais o import',
      fn: () => {
        const r = registrarFabricaJs(FIXTURE_JS_MOLDE_REAL, paramsFabrica('repositorio', 'dynamo', 'criarDynamo', '../adapters/dynamo/index.js'));
        return r !== null
          && r.includes("repositorio: { memoria: () => createRepository(), 'dynamo': () => criarDynamo() },")
          && r.includes("import { criarDynamo } from '../adapters/dynamo/index.js';");
      },
    },
    {
      nome: 'registrarFabricaJs: porta NOVA ("verificadorDeToken") funciona — sem assinatura de tipo para desalinhar',
      fn: () => {
        const r = registrarFabricaJs(FIXTURE_JS_MOLDE_REAL, paramsFabrica('verificadorDeToken', 'okta', 'criarOkta', '../adapters/okta/index.js'));
        return r !== null && r.includes("verificadorDeToken: { 'okta': () => criarOkta() },");
      },
    },
    {
      nome: 'registrarFabricaJs: provedor com hifen -> chave CITADA (bug 3 consertado — ver cabecalho)',
      fn: () => {
        const r = registrarFabricaJs(FIXTURE_JS_MOLDE_REAL, paramsFabrica('repositorio', 'disco-frio', 'criarDiscoFrio', '../adapters/disco-frio/index.js'));
        return r !== null && r.includes("repositorio: { memoria: () => createRepository(), 'disco-frio': () => criarDiscoFrio() },");
      },
    },
  ];
}

function casosRegistroPy() {
  return [
    {
      nome: 'registrarFabricaPy: molde REAL de hoje, porta existente, REGISTRA (bug 2 consertado — ver cabecalho)',
      fn: () => {
        const r = registrarFabricaPy(FIXTURE_PY_MOLDE_REAL, paramsFabrica('repositorio', 'dynamo', 'RepositorioDynamo', 'adapters.dynamo'));
        return r !== null
          && r.includes('"repositorio": {"memory": lambda modulo: RepositorioEmMemoria(), "dynamo": RepositorioDynamo}')
          && r.includes('from adapters.dynamo import RepositorioDynamo');
      },
    },
    {
      nome: 'registrarFabricaPy: molde REAL de hoje, porta NOVA ("verificadorDeToken"), tambem registra',
      fn: () => {
        const r = registrarFabricaPy(FIXTURE_PY_MOLDE_REAL, paramsFabrica('verificadorDeToken', 'okta', 'VerificadorOkta', 'adapters.okta'));
        return r !== null && r.includes('"verificadorDeToken": {"okta": VerificadorOkta}');
      },
    },
    {
      nome: 'registrarFabricaPy: molde sem segunda linha de import (variante mais simples) tambem registra',
      fn: () => {
        const r = registrarFabricaPy(FIXTURE_PY_ANCORA_ISOLADA, paramsFabrica('repositorio', 'dynamo', 'RepositorioDynamo', 'adapters.dynamo'));
        return r !== null
          && r.includes('"repositorio": {"memory": lambda: RepositorioEmMemoria(), "dynamo": RepositorioDynamo}')
          && r.includes('from adapters.dynamo import RepositorioDynamo');
      },
    },
  ];
}

function casosDeAutoteste() {
  return [...casosPuros(), ...casosRegistroTs(), ...casosRegistroJs(), ...casosRegistroPy()];
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
  process.stdout.write(`\nautoteste (create-adapter): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

function principal() {
  const opcoes = lerOpcoes();
  validarOpcoes(opcoes);

  const raizProjeto = acharRaizProjeto();
  const molde = acharMolde(raizProjeto, opcoes.binding);
  if (molde === null) abortar('molde de adapter nao encontrado (adapters/_template ausente — rode dentro de um projeto gerado por create-project.mjs)');

  const pasta = pastaAdapter(opcoes.binding, opcoes.provedor);
  const destino = join(raizProjeto, 'adapters', pasta);
  if (existsSync(destino)) abortar(`adapter "${opcoes.provedor}" ja existe em ${destino}`);

  const nomeGerado = copiarEAdaptarMolde(molde, destino, opcoes);
  registrarFabrica(raizProjeto, opcoes, nomeGerado);

  process.stdout.write(`adapter "${opcoes.provedor}" criado em adapters/${pasta} (porta "${opcoes.porta}")\n`);
  process.stdout.write('validando...\n');
  rodarGate(raizProjeto);
  process.stdout.write(
    `\nproximo passo: implemente os metodos de "${opcoes.porta}" em adapters/${pasta}/`
    + `${opcoes.binding === 'python' ? '__init__.py' : 'index.' + (opcoes.binding === 'typescript' ? 'ts' : 'js')}`
    + `, depois declare "${opcoes.porta}": "${opcoes.provedor}" no config/ports.json do modulo que vai usa-lo.\n`,
  );
}

if (process.argv.includes('--autoteste')) {
  process.exit(rodarAutoteste());
} else {
  principal();
}
