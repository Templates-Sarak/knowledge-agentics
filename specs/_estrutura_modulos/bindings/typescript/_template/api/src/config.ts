// Carregador UNICO de configuracao do modulo <modulo>. Lei dona: specs/arquitetura/01-modulo.md §4.
//
// Regras que este arquivo materializa:
//   - SO ele toca o ambiente. Qualquer outro arquivo lendo env e aviso do gate.
//   - Cascata (ADR-004): processo > .env do modulo > .env apontado por ENV_RAIZ > default de tunable.
//   - Falha rapida: env ou config ausente DERRUBA o boot. Nunca `?? 'http://localhost'`.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface ConfigApi {
  paginaTamanhoPadrao: number;
  paginaTamanhoMaximo: number;
  corpoMaximoKb: number;
  nivelLog: 'debug' | 'info' | 'warn' | 'error';
}

export interface ConfigSeguranca {
  rateLimit: { janelaSegundos: number; limiteLeitura: number; limiteEscrita: number };
  cors: { origensPermitidas: string[]; metodos: string[] };
  headers: { hsts: boolean; noSniff: boolean; frameDeny: boolean; referrerPolicy: string };
}

export interface Manifesto {
  id: string;
  name: string;
  version: string;
  role: string;
  basePath: string;
  webPath: string | null;
  navigation: { label: string; icon: string; order: number } | null;
  exportsSummary: boolean;
  data: { schema: string; prefix: string; tables: string[] };
  requiredEnv: string[];
  ports: string[];
  permissions: string[];
  publicRoutes: string[];
  sensitiveFields: string[];
}

export interface ConfiguracaoModulo {
  raiz: string;
  manifesto: Manifesto;
  api: ConfigApi;
  dominio: { statusValidos: string[] };
  seguranca: ConfigSeguranca;
  portas: Record<string, string>;
  textos: Record<string, string>;
}

/** Sobe a partir de um ponto ate achar o `module.json`. Funciona em dev, em teste e ja extraido. */
export function findRootModule(partida: string = process.cwd()): string {
  let atual = partida;
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'module.json'))) return atual;
    const pai = dirname(atual);
    if (pai === atual) break;
    atual = pai;
  }
  throw new Error(`[config] module.json nao encontrado a partir de "${partida}"`);
}

/** Le removendo o BOM: editor e shell do Windows gravam por padrao, e `JSON.parse` rejeita. */
function readText(caminho: string): string {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

function readJson<T>(raiz: string, relativo: string): T {
  try {
    return JSON.parse(readText(join(raiz, relativo))) as T;
  } catch (causa) {
    throw new Error(`[config] nao foi possivel ler "${relativo}": ${String(causa)}`);
  }
}

/** Pares chave=valor de um `.env`, ignorando comentario e linha vazia. */
function readPairsEnv(caminho: string): Array<[string, string]> {
  return readText(caminho)
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#') && linha.includes('='))
    .map((linha) => {
      const igual = linha.indexOf('=');
      return [linha.slice(0, igual).trim(), linha.slice(igual + 1).trim()] as [string, string];
    });
}

/** Aplica pares no ambiente SEM sobrescrever o que ja veio do processo — mantem a precedencia. */
function applyWithoutOverwrite(pares: Array<[string, string]>): void {
  for (const [chave, valor] of pares) {
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

/**
 * Resolve o `.env` em cascata (ADR-004, specs/adr/000-decisoes-do-template.md).
 * O `.env` do modulo aponta para o da raiz por `ENV_RAIZ`. Na extracao, apaga-se essa linha e
 * os valores passam a viver localmente — sem uma linha de codigo mudar.
 */
function resolveEnvironment(raizModulo: string): void {
  const local = join(raizModulo, '.env');
  if (!existsSync(local)) return;

  const pares = readPairsEnv(local);
  applyWithoutOverwrite(pares.filter(([chave]) => chave !== 'ENV_RAIZ'));

  const ponteiro = pares.find(([chave]) => chave === 'ENV_RAIZ');
  if (ponteiro === undefined) return;

  const alvo = isAbsolute(ponteiro[1]) ? ponteiro[1] : resolve(raizModulo, ponteiro[1]);
  if (!existsSync(alvo)) {
    throw new Error(`[config] ENV_RAIZ aponta para "${alvo}", que nao existe`);
  }
  applyWithoutOverwrite(readPairsEnv(alvo));
}

/** Le uma variavel obrigatoria. Ausente = boot morre com mensagem acionavel. */
export function envRequired(chave: string): string {
  const valor = process.env[chave];
  if (valor === undefined || valor === '') {
    throw new Error(`[config] variavel obrigatoria ausente: ${chave} (declare em module.json:envRequerido)`);
  }
  return valor;
}

/**
 * Exportada só para o teste direto (plan-2.md N.4): sem `.env` real, TODO teste rodaria sob
 * `NODE_ENV=test` sem uma unica variavel de `requiredEnv` preenchida — e sem o bypass abaixo,
 * `loadConfiguration()` derrubaria a suite inteira antes do primeiro `it()`. O preco declarado:
 * "suite verde" nunca prova, por si so, que a fiacao de ambiente esta correta — quem prova isso e o
 * boot real (`npm run start`) ou este mesmo teste, chamando a funcao com `NODE_ENV` diferente de
 * `test` de proposito.
 */
export function checkEnvRequired(manifesto: Manifesto): void {
  const faltando = manifesto.requiredEnv.filter((chave) => process.env[chave] === undefined);
  if (faltando.length > 0 && process.env['NODE_ENV'] !== 'test') {
    throw new Error(`[config] ${manifesto.id}: variaveis ausentes no ambiente: ${faltando.join(', ')}`);
  }
}

/** Carrega e valida TUDO no boot; qualquer falta derruba o processo antes de servir. */
export function loadConfiguration(raiz: string = findRootModule()): ConfiguracaoModulo {
  const manifesto = readJson<Manifesto>(raiz, 'module.json');
  resolveEnvironment(raiz);
  checkEnvRequired(manifesto);

  return {
    raiz,
    manifesto,
    api: readJson<ConfigApi>(raiz, 'config/api.json'),
    dominio: readJson<{ statusValidos: string[] }>(raiz, 'config/domain.json'),
    seguranca: readJson<ConfigSeguranca>(raiz, 'config/seguranca.json'),
    portas: readJson<Record<string, string>>(raiz, 'config/ports.json'),
    textos: readJson<Record<string, string>>(raiz, 'config/textos.json'),
  };
}
