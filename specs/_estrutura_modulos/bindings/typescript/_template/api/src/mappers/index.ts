// Mapeadores do modulo <module>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §3.
//
// Duas responsabilidades, e so estas:
//   1. FRONTEIRA DE CAIXA — o banco fala snake_case, o contrato fala camelCase. A conversao e
//      explicita, nas duas direcoes. Nunca implicita, nunca no ORM.
//   2. PROJECAO DE SAIDA POR ALLOWLIST — a resposta e montada CAMPO A CAMPO. Devolver o registro
//      cru e proibido (regra `raw-output`): e o que impede vazar coluna nova ou PII adicionada
//      depois por quem nao pensou na borda.
//
// A consequencia aceita de proposito: campo novo exige tocar aqui TAMBEM. Esquecer faz o campo
// nao aparecer — falha silenciosa que o teste de contrato pega. O inverso, publicar por omissao,
// seria pior.

import type { Entry } from '../../../core/domain/index.js';
import type { Manifest } from '../config.js';

/** Linha crua do banco. Nunca sai desta camada. */
export interface EntryRow {
  hash: string;
  title: string;
  status: string;
  created_at: string;
}

/** banco -> dominio */
export function rowToDomain(line: EntryRow): Entry {
  return {
    hash: line.hash,
    title: line.title,
    status: line.status,
    createdAt: line.created_at,
  };
}

/** dominio -> banco */
export function domainToRow(entry: Entry): EntryRow {
  return {
    hash: entry.hash,
    title: entry.title,
    status: entry.status,
    created_at: entry.createdAt,
  };
}

/**
 * dominio -> CONTRATO. A allowlist e esta funcao: o que nao esta escrito aqui nao e publicado.
 * Campo declarado em module.json:sensitiveFields nunca entra — ou entra mascarado.
 */
export function toContract(entry: Entry): Record<string, unknown> {
  return {
    hash: entry.hash,
    title: entry.title,
    status: entry.status,
    createdAt: entry.createdAt,
  };
}

/**
 * manifesto -> META publica (allowlist). `GET /meta` e rota SEM TOKEN (`publicRoutes`): o que nao
 * esta aqui e reconhecimento — schema do banco, nomes de chave de segredo, vocabulario de
 * `permissions`, `publicRoutes` e `sensitiveFields` nunca saem por esta rota.
 */
export function toMeta(manifest: Manifest): Record<string, unknown> {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    role: manifest.role,
    basePath: manifest.basePath,
    webPath: manifest.webPath,
    navigation: manifest.navigation,
    exportsSummary: manifest.exportsSummary,
  };
}

/** Envelope unico de colecao (specs/arquitetura/02-contrato-e-dados.md §3.1). */
export function toCollection(
  entries: Entry[],
  page: number,
  pageSize: number,
  total: number,
): Record<string, unknown> {
  return { items: entries.map(toContract), page, pageSize, total };
}
