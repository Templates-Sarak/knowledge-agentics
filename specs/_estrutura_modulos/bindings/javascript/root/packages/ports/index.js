// Interfaces CANONICAS das portas. Lei dona: specs/arquitetura/00-arquitetura.md §3.3 e §4.2.
//
// `packages/` e a excecao minima ao isolamento: so entra o que e interface, contrato ou design,
// SEM logica de negocio. Regra de negocio nunca mora aqui — se dois modulos precisam da mesma
// regra, duplica-se (ADR-001, specs/adr/000-decisoes-do-template.md).
//
// Por que a interface canonica existe: um adapter generico precisa de uma forma comum. Se cada
// modulo inventasse a propria, nenhum adapter serviria a dois. O `core/ports/` do modulo
// ESPELHA o que esta aqui, e viaja com o modulo na extracao.
//
// Sem interface de linguagem, o contrato e JSDoc — cobrado por `tsc --checkJs`.

/** Taxonomia FECHADA de erro (specs/arquitetura/02-contrato-e-dados.md §3.1). */
export const ERROR_CODES = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LIMIT_EXCEEDED: 429,
  EXTERNAL_DEPENDENCY: 502,
  INTERNAL: 500,
};

/** Falha de porta. O adapter TRADUZ o erro do fornecedor para ca — o dominio nunca ve o SDK. */
export class PortError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} message
   * @param {string} [detail]
   */
  constructor(code, message, detail) {
    super(message);
    this.name = 'PortError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Nomes validos de porta. `config/ports.json` e `module.json:ports` usam este vocabulario.
 *
 * Fonte NORMATIVA: `tools/gate/ports-vocabulary.mjs`, na base — os dois schemas do gate
 * (`config-ports.schema.json`, `module.schema.json:ports.items.enum`) sao GERADOS dela. Esta
 * lista, aqui, e a metade que nao da para gerar (interface de linguagem, nao config mecanica) —
 * mantenha as duas iguais a mao (o SIMBOLO diverge de proposito: `KNOWN_PORTS` na fonte,
 * `KNOWN_PORTS` aqui — Onda 3 do ADR-013/ADR-016, esqueleto e ferramental traduzem por regras
 * diferentes; o CONTEUDO das duas listas e que precisa ser identico). `fila` NAO ESTA no
 * vocabulario: arrasta retry, dead-letter, idempotencia e ordem de entrega — desenho de topologia
 * que 00-arquitetura.md §5 diz que o template nao escolhe. `tokenVerifier` era `verificadorDeToken`
 * (traducao de idioma, ADR-013/ADR-016) e, antes disso, `auth` ate o ADR-010.
 */
export const KNOWN_PORTS = [
  'repository',
  'audit',
  'clock',
  'idGenerator',
  'storage',
  'tokenVerifier',
  'notifier',
];

/**
 * @template T
 * @typedef {object} Page
 * @property {T[]} items
 * @property {number} page
 * @property {number} pageSize
 * @property {number} total
 */

/**
 * @template T
 * @typedef {object} Repository
 * @property {(page: number, pageSize: number) => Promise<Page<T>>} list
 * @property {(hash: string) => Promise<T | null>} findByHash
 * @property {(entry: T) => Promise<void>} insert
 * @property {() => Promise<number>} count
 */

/**
 * @typedef {object} AuditEvent
 * @property {string} hash
 * @property {string} action
 * @property {string} actor
 * @property {string[]} changedFields
 * @property {string} requestId
 */

/**
 * @typedef {object} Audit
 * @property {(event: AuditEvent) => Promise<void>} record
 *
 * @typedef {object} Clock
 * @property {() => string} now
 *
 * @typedef {object} IdGenerator
 * @property {() => string} hash
 *
 * @typedef {object} TokenVerifier
 * @property {(token: string) => Promise<{ permissions: string[] } | null>} verify
 */

/**
 * Guarda e recupera CONTEUDO por caminho — upload, o caso mais comum de quase todo projeto real
 * — superficie MINIMA e tipada por operacao, no precedente de `Repository`:
 * nada de `executar(comando: string)` — o desenho que sustenta `sql-in-module` do lado do banco.
 *
 * @typedef {object} Storage
 * @property {(path: string, content: Buffer) => Promise<void>} save
 * @property {(path: string) => Promise<Buffer | null>} find
 * @property {(path: string) => Promise<void>} remove
 */

/**
 * Envia mensagem a um destinatario — e-mail, o outro caso mais comum.
 *
 * @typedef {object} Notifier
 * @property {(recipient: string, subject: string, body: string) => Promise<void>} send
 */

export {};
