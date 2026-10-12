// Dominio do modulo <module>: tipos e validacao. Lei dona: specs/arquitetura/01-modulo.md §2.
//
// Regras desta camada:
//   - ZERO I/O. Nada de rede, banco, arquivo ou env.
//   - ZERO nao-determinismo: `new Date()` e `Math.random()` sao PROIBIDOS aqui — o instante e o
//     identificador chegam pelas portas `clock` e `idGenerator` (specs/arquitetura/01-modulo.md §5.1).
//   - ZERO literal de vocabulario: os status validos vem de config/domain.json.
//
// Sem TypeScript, o contrato de tipo e JSDoc — e ele NAO e decorativo: e o que o editor e o
// `tsc --checkJs` usam para cobrar as fronteiras (ver jsconfig.json).

/**
 * @typedef {object} Entry
 * @property {string} hash
 * @property {string} title
 * @property {string} status
 * @property {string} createdAt
 */

/**
 * @typedef {object} NewEntry
 * @property {string} title
 * @property {string} [status]
 */

/** Falha de validacao do dominio. A borda a traduz para VALIDACAO (400). */
export class ValidationError extends Error {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * @param {unknown} title
 * @returns {string}
 */
function requireTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new ValidationError('title', 'title is required');
  }
  return title.trim();
}

/**
 * @param {unknown} status
 * @param {readonly string[]} validStatuses
 * @returns {string}
 */
function requireStatus(status, validStatuses) {
  const defaultStatus = validStatuses[0];
  if (defaultStatus === undefined) {
    throw new ValidationError('status', 'config/domain.json:validStatuses is empty');
  }
  if (status === undefined) return defaultStatus;
  if (typeof status !== 'string' || !validStatuses.includes(status)) {
    throw new ValidationError('status', `status must be one of: ${validStatuses.join(', ')}`);
  }
  return status;
}

/**
 * Valida a entrada externa e devolve o registro do dominio.
 * O `hash` e o `createdAt` vem de fora (portas), nunca daqui — e o que mantem o dominio
 * deterministico e testavel sem congelar o relogio do sistema.
 *
 * @param {NewEntry} input
 * @param {readonly string[]} validStatuses
 * @param {string} hash
 * @param {string} createdAt
 * @returns {Entry}
 */
export function buildRecord(input, validStatuses, hash, createdAt) {
  return {
    hash,
    title: requireTitle(input.title),
    status: requireStatus(input.status, validStatuses),
    createdAt,
  };
}
