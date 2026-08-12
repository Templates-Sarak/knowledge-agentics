// Dominio do modulo <modulo>: tipos e validacao. Lei dona: specs/arquitetura/01-modulo.md §2.
//
// Regras desta camada:
//   - ZERO I/O. Nada de rede, banco, arquivo ou env.
//   - ZERO nao-determinismo: `new Date()` e `Math.random()` sao PROIBIDOS aqui — o instante e o
//     identificador chegam pelas portas `relogio` e `geradorId` (specs/arquitetura/01-modulo.md §5.1).
//   - ZERO literal de vocabulario: os status validos vem de config/domain.json.
//
// Sem TypeScript, o contrato de tipo e JSDoc — e ele NAO e decorativo: e o que o editor e o
// `tsc --checkJs` usam para cobrar as fronteiras (ver jsconfig.json).

/**
 * @typedef {object} Registro
 * @property {string} hash
 * @property {string} titulo
 * @property {string} status
 * @property {string} criadoEm
 */

/**
 * @typedef {object} NovoRegistro
 * @property {string} titulo
 * @property {string} [status]
 */

/** Falha de validacao do dominio. A borda a traduz para VALIDACAO (400). */
export class ErroDeValidacao extends Error {
  /**
   * @param {string} campo
   * @param {string} mensagem
   */
  constructor(campo, mensagem) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
    this.campo = campo;
  }
}

/**
 * @param {unknown} titulo
 * @returns {string}
 */
function requireTitle(titulo) {
  if (typeof titulo !== 'string' || titulo.trim() === '') {
    throw new ErroDeValidacao('titulo', 'titulo e obrigatorio');
  }
  return titulo.trim();
}

/**
 * @param {unknown} status
 * @param {readonly string[]} statusValidos
 * @returns {string}
 */
function requireStatus(status, statusValidos) {
  const padrao = statusValidos[0];
  if (padrao === undefined) {
    throw new ErroDeValidacao('status', 'config/domain.json:statusValidos esta vazio');
  }
  if (status === undefined) return padrao;
  if (typeof status !== 'string' || !statusValidos.includes(status)) {
    throw new ErroDeValidacao('status', `status deve ser um de: ${statusValidos.join(', ')}`);
  }
  return status;
}

/**
 * Valida a entrada externa e devolve o registro do dominio.
 * O `hash` e o `criadoEm` vem de fora (portas), nunca daqui — e o que mantem o dominio
 * deterministico e testavel sem congelar o relogio do sistema.
 *
 * @param {NovoRegistro} entrada
 * @param {readonly string[]} statusValidos
 * @param {string} hash
 * @param {string} criadoEm
 * @returns {Registro}
 */
export function buildRecord(entrada, statusValidos, hash, criadoEm) {
  return {
    hash,
    titulo: requireTitle(entrada.titulo),
    status: requireStatus(entrada.status, statusValidos),
    criadoEm,
  };
}
