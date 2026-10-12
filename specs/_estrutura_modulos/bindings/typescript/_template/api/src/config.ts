// Carregador UNICO de configuracao do modulo <module>. Lei dona: specs/arquitetura/01-modulo.md §4.
//
// Regras que este arquivo materializa:
//   - SO ele toca o ambiente. Qualquer outro arquivo lendo env e aviso do gate.
//   - Cascata (ADR-004): processo > .env do modulo > .env apontado por ENV_ROOT > default de tunable.
//   - Falha rapida: env ou config ausente DERRUBA o boot. Nunca `?? 'http://localhost'`.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface ConfigApi {
  defaultPageSize: number;
  maxPageSize: number;
  maxBodyKb: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface ConfigSecurity {
  rateLimit: { windowSeconds: number; readLimit: number; writeLimit: number };
  cors: { allowedOrigins: string[]; methods: string[] };
  headers: { hsts: boolean; noSniff: boolean; frameDeny: boolean; referrerPolicy: string };
}

export interface Manifest {
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

export interface ModuleConfiguration {
  root: string;
  manifest: Manifest;
  api: ConfigApi;
  domain: { validStatuses: string[] };
  security: ConfigSecurity;
  ports: Record<string, string>;
  texts: Record<string, string>;
}

/** Sobe a partir de um ponto ate achar o `module.json`. Funciona em dev, em teste e ja extraido. */
export function findRootModule(start: string = process.cwd()): string {
  let current = start;
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'module.json'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`[config] module.json not found from "${start}"`);
}

/** Le removendo o BOM: editor e shell do Windows gravam por padrao, e `JSON.parse` rejeita. */
function readText(path: string): string {
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

function readJson<T>(root: string, relativePath: string): T {
  try {
    return JSON.parse(readText(join(root, relativePath))) as T;
  } catch (cause) {
    throw new Error(`[config] could not read "${relativePath}": ${String(cause)}`);
  }
}

/** Pares chave=valor de um `.env`, ignorando comentario e linha vazia. */
function readPairsEnv(path: string): Array<[string, string]> {
  return readText(path)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const equalsIndex = line.indexOf('=');
      return [line.slice(0, equalsIndex).trim(), line.slice(equalsIndex + 1).trim()] as [string, string];
    });
}

/** Aplica pares no ambiente SEM sobrescrever o que ja veio do processo — mantem a precedencia. */
function applyWithoutOverwrite(pairs: Array<[string, string]>): void {
  for (const [key, value] of pairs) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Resolve o `.env` em cascata (ADR-004, specs/adr/000-decisoes-do-template.md).
 * O `.env` do modulo aponta para o da raiz por `ENV_ROOT`. Na extracao, apaga-se essa linha e
 * os valores passam a viver localmente — sem uma linha de codigo mudar.
 */
function resolveEnvironment(moduleRoot: string): void {
  const local = join(moduleRoot, '.env');
  if (!existsSync(local)) return;

  const pairs = readPairsEnv(local);
  applyWithoutOverwrite(pairs.filter(([key]) => key !== 'ENV_ROOT'));

  const pointer = pairs.find(([key]) => key === 'ENV_ROOT');
  if (pointer === undefined) return;

  const target = isAbsolute(pointer[1]) ? pointer[1] : resolve(moduleRoot, pointer[1]);
  if (!existsSync(target)) {
    throw new Error(`[config] ENV_ROOT points to "${target}", which does not exist`);
  }
  applyWithoutOverwrite(readPairsEnv(target));
}

/** Le uma variavel obrigatoria. Ausente = boot morre com mensagem acionavel. */
export function envRequired(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`[config] required variable missing: ${key} (declare it in module.json:requiredEnv)`);
  }
  return value;
}

/**
 * Exportada só para o teste direto: sem `.env` real, TODO teste rodaria sob
 * `NODE_ENV=test` sem uma unica variavel de `requiredEnv` preenchida — e sem o bypass abaixo,
 * `loadConfiguration()` derrubaria a suite inteira antes do primeiro `it()`. O preco declarado:
 * "suite verde" nunca prova, por si so, que a fiacao de ambiente esta correta — quem prova isso e o
 * boot real (`npm run start`) ou este mesmo teste, chamando a funcao com `NODE_ENV` diferente de
 * `test` de proposito.
 */
export function checkEnvRequired(manifest: Manifest): void {
  const missing = manifest.requiredEnv.filter((key) => process.env[key] === undefined);
  if (missing.length > 0 && process.env['NODE_ENV'] !== 'test') {
    throw new Error(`[config] ${manifest.id}: variables missing from the environment: ${missing.join(', ')}`);
  }
}

/** Carrega e valida TUDO no boot; qualquer falta derruba o processo antes de servir. */
export function loadConfiguration(root: string = findRootModule()): ModuleConfiguration {
  const manifest = readJson<Manifest>(root, 'module.json');
  resolveEnvironment(root);
  checkEnvRequired(manifest);

  return {
    root,
    manifest,
    api: readJson<ConfigApi>(root, 'config/api.json'),
    domain: readJson<{ validStatuses: string[] }>(root, 'config/domain.json'),
    security: readJson<ConfigSecurity>(root, 'config/security.json'),
    ports: readJson<Record<string, string>>(root, 'config/ports.json'),
    texts: readJson<Record<string, string>>(root, 'config/texts.json'),
  };
}
