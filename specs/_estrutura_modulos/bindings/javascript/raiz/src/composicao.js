// Raiz de composicao — o WIRING, e nada alem. Lei dona: specs/arquitetura/00-arquitetura.md §3.4.
//
// O que este arquivo faz:
//   1. DESCOBRE os modulos lendo modulos/*/modulo.json — nao existe lista fixa de modulos no codigo;
//   2. resolve as portas de cada um a partir do config/portas.json DELE;
//   3. INJETA os adapters e MONTA cada api/ sob a rotaBase do manifesto — um Express por modulo,
//      pendurado no Express raiz sob a propria rotaBase (nunca em "/": middleware de modulo roda
//      para QUALQUER requisicao que alcance o app dele, e a auth nega por padrao — montado sem
//      prefixo, o primeiro modulo responderia, errado, pelas rotas do segundo);
//   4. sobe UM processo, UMA porta (specs/arquitetura/00-arquitetura.md §5).
//
// O que ele NAO faz: regra de negocio, nem servir front (specs/arquitetura/00-arquitetura.md §4.4:
// cada `web/` e build estatico do PROPRIO modulo, publicado por fora deste processo). Nenhum modulo
// importa daqui, e nada aqui conhece o dominio de modulo nenhum. Acrescentar um modulo nao pode
// exigir editar este arquivo.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import express from 'express';

import {
  criarAuditoria,
  criarAuthQueNega,
  criarGeradorId,
  criarNotificadorEmMemoria,
  criarRelogio,
  criarRepositorio,
  criarStorageEmMemoria,
} from '../adapters/memoria/index.js';
import { criarPostgresAuditoria, criarPostgresRepositorio } from '../adapters/postgres/index.js';

/**
 * Fabrica de adapter por (porta, provedor). Acrescentar provedor e acrescentar linha AQUI, so.
 *
 * Recebe o manifesto do modulo que esta compondo — `memoria` ignora (nao precisa saber QUEM a
 * chamou), `postgres` usa (`modulo.id` para a chave de ambiente, `modulo.pasta` para ler
 * `dados.schema`/`dados.prefixo` do proprio manifesto). Sem isto, um adapter que precisa de
 * contexto por-modulo nao teria como sabe-lo (plan-2.2.md Bloco Z).
 */
const FABRICAS = {
  repositorio: { memoria: () => criarRepositorio(), postgres: (modulo) => criarPostgresRepositorio(modulo) },
  auditoria: { memoria: () => criarAuditoria(), postgres: (modulo) => criarPostgresAuditoria(modulo) },
  relogio: { sistema: () => criarRelogio() },
  geradorId: { padrao: () => criarGeradorId() },
  storage: { memoria: () => criarStorageEmMemoria() },
  notificador: { memoria: () => criarNotificadorEmMemoria() },
};

function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8').replace(/^﻿/, ''));
}

/**
 * Le todos os manifestos. E a DESCOBERTA: o sistema conhece os modulos por declaracao, nao por
 * import. Molde (`_*`) fica de fora — ele e material do scaffold, nao um modulo do sistema.
 */
export function descobrirModulos(raiz) {
  const base = join(raiz, 'modulos');
  if (!existsSync(base)) return [];

  return readdirSync(base)
    .filter((nome) => !nome.startsWith('_'))
    .filter((nome) => existsSync(join(base, nome, 'modulo.json')))
    .map((nome) => ({ ...lerJson(join(base, nome, 'modulo.json')), pasta: join(base, nome) }));
}

/**
 * Resolve as portas declaradas por um modulo, lendo a ESCOLHA em config/portas.json dele.
 * Porta declarada sem provedor conhecido derruba o boot — melhor falhar aqui que servir errado.
 */
export function resolverDependencias(modulo) {
  const escolhas = lerJson(join(modulo.pasta, 'config', 'portas.json'));
  const dependencias = {};

  for (const porta of modulo.portas) {
    const provedor = escolhas[porta];
    const fabrica = FABRICAS[porta]?.[provedor ?? ''];
    if (fabrica === undefined) {
      throw new Error(
        `[composicao] ${modulo.id}: porta "${porta}" com provedor "${provedor}" sem fabrica registrada`,
      );
    }
    dependencias[porta] = fabrica(modulo);
  }
  return dependencias;
}

/**
 * Auth do sistema. Enquanto nao houver login, NEGA tudo — as rotas que precisam funcionar sem
 * token estao declaradas em `rotasPublicas` de cada modulo, e so elas passam.
 */
export function resolverAuth() {
  return criarAuthQueNega();
}

/**
 * Nenhum par de modulos pode reivindicar a mesma rotaBase: o segundo simplesmente nunca seria
 * alcancado (o Express do primeiro responde por ele antes), e o defeito ficaria mudo ate alguem
 * notar uma rota "sumida". PURO — dado o array de manifestos, so decide; nao toca disco nem rede.
 */
export function verificarRotasUnicas(modulos) {
  const porRota = new Map();
  for (const modulo of modulos) {
    porRota.set(modulo.rotaBase, [...(porRota.get(modulo.rotaBase) ?? []), modulo.id]);
  }
  const colisoes = [...porRota.entries()].filter(([, ids]) => ids.length > 1);
  if (colisoes.length === 0) return;

  const detalhe = colisoes.map(([rota, ids]) => `"${rota}" (${ids.join(', ')})`).join('; ');
  throw new Error(`[composicao] rotaBase colidindo entre modulos: ${detalhe}`);
}

/** Import dinamico do modulo, pelo CAMINHO — a mesma descoberta por declaracao, nunca por lista fixa. */
async function importarApi(modulo) {
  const caminho = join(modulo.pasta, 'api', 'src', 'index.js');
  return import(pathToFileURL(caminho).href);
}

/** Pares chave=valor de um `.env`, ignorando comentario e linha vazia — mesma leitura do carregador de modulo. */
function lerParesEnv(caminho) {
  return readFileSync(caminho, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#') && linha.includes('='))
    .map((linha) => {
      const igual = linha.indexOf('=');
      return [linha.slice(0, igual).trim(), linha.slice(igual + 1).trim()];
    });
}

/**
 * Carrega o `.env` UNICO da raiz (specs/arquitetura/00-arquitetura.md §5) no processo, sem
 * sobrescrever o que ja veio de fora (mesma precedencia de ADR-004). E o unico lugar que toca este
 * arquivo: cada modulo, chamado daqui, ainda resolve o proprio `.env`/`ENV_RAIZ`, mas a essa altura
 * o processo ja tem tudo — a leitura dele so confirma o que ja esta la.
 */
function carregarEnvDaRaiz(raiz) {
  const caminho = join(raiz, '.env');
  if (!existsSync(caminho)) return;
  for (const [chave, valor] of lerParesEnv(caminho)) {
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

/**
 * Monta o app do PROCESSO: um Express por modulo, cada um montado sob a PROPRIA `rotaBase` — nunca
 * em "/". `criarApp`, quando composto (recebe `raiz`), ja sabe que o Express externo tira o prefixo
 * antes de entregar a requisicao a ele; aqui so se ESCOLHE onde montar, nenhuma rota e remontada.
 */
export async function montarSistema(raiz) {
  const modulos = descobrirModulos(raiz);
  verificarRotasUnicas(modulos);

  const auth = resolverAuth();
  const app = express();

  for (const modulo of modulos) {
    const deps = resolverDependencias(modulo);
    const api = await importarApi(modulo);
    // MONTADO na propria rotaBase — nunca em "/". Middleware de modulo (auth INCLUSIVE, que NEGA
    // por padrao) roda para QUALQUER requisicao que alcance o app dele; montado em "/", o app do
    // PRIMEIRO modulo responderia (errado) por caminho de OUTRO modulo antes de "no match" —
    // medido: 401 na rota publica de um segundo modulo, negada pela auth do primeiro. Montando na
    // rotaBase, o Express so entrega ao app do modulo a requisicao que ja e dele.
    app.use(modulo.rotaBase, api.criarApp({ deps, auth, raiz: modulo.pasta }));
  }
  return app;
}

/** Le uma variavel obrigatoria da RAIZ. Ausente = boot morre com mensagem acionavel. */
function envObrigatoriaDaRaiz(chave) {
  const valor = process.env[chave];
  if (valor === undefined || valor === '') {
    throw new Error(
      `[composicao] variavel obrigatoria ausente: ${chave} (declare em projeto.json:envRequerido)`,
    );
  }
  return valor;
}

/**
 * Sobe o processo: um Express, uma porta (specs/arquitetura/00-arquitetura.md §5). A porta vem do
 * ambiente — nenhum literal aqui — e a falta dela DERRUBA o boot, nomeando a chave.
 */
export async function iniciarSistema(raiz) {
  carregarEnvDaRaiz(raiz);
  const porta = Number(envObrigatoriaDaRaiz('RAIZ_API_PORT'));
  const app = await montarSistema(raiz);

  return new Promise((resolver) => {
    const servidor = app.listen(porta, () => {
      process.stdout.write(`[composicao] sistema no ar na porta ${porta}\n`);
      resolver(servidor);
    });
  });
}

// ================================================================================================
// AUTOTESTE — so a parte PURA (`verificarRotasUnicas`): descoberta, DI e boot sao I/O de verdade,
// provados pela subida real de processo (relatorio do bloco), nao por fixture em memoria.
// ================================================================================================

function manifestoDeTeste(id, rotaBase) {
  return { id, nome: id, rotaBase, papel: 'dominio', portas: [], pasta: `/fake/${id}` };
}

function casosDeRotasUnicas() {
  return [
    { nome: 'lista vazia', modulos: [], esperaErro: false },
    { nome: 'um so modulo', modulos: [manifestoDeTeste('a', '/api/v1/a')], esperaErro: false },
    {
      nome: 'rotas distintas',
      modulos: [manifestoDeTeste('a', '/api/v1/a'), manifestoDeTeste('b', '/api/v1/b')],
      esperaErro: false,
    },
    {
      nome: 'rotas colidindo',
      modulos: [manifestoDeTeste('a', '/api/v1/a'), manifestoDeTeste('a2', '/api/v1/a')],
      esperaErro: true,
    },
    {
      nome: 'tres modulos, dois colidindo',
      modulos: [
        manifestoDeTeste('a', '/api/v1/a'),
        manifestoDeTeste('b', '/api/v1/b'),
        manifestoDeTeste('b2', '/api/v1/b'),
      ],
      esperaErro: true,
    },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  const casos = casosDeRotasUnicas();

  for (const caso of casos) {
    let lancou = false;
    try {
      verificarRotasUnicas(caso.modulos);
    } catch {
      lancou = true;
    }
    const ok = lancou === caso.esperaErro;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} verificarRotasUnicas: ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }

  process.stdout.write(`\nautoteste: ${casos.length - falhas}/${casos.length} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI — so quando executado diretamente (`node src/composicao.js`), nunca quando importado por teste.
// ================================================================================================

const ehExecucaoDireta =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (ehExecucaoDireta) {
  if (process.argv.includes('--autoteste')) {
    process.exit(rodarAutoteste());
  } else {
    iniciarSistema(process.cwd()).catch((causa) => {
      process.stderr.write(`${causa instanceof Error ? causa.message : String(causa)}\n`);
      process.exitCode = 1;
    });
  }
}
