// Taxonomia FECHADA de erro do modulo <module>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §3.1.
//
// Fechada quer dizer: acrescentar codigo aqui e mudanca de contrato, nao improviso de rota.
// Num projeto com `packages/ports`, este arquivo re-exporta a versao canonica de la — assim
// todos os modulos falam a mesma lingua de erro. O molde traz a copia local para ser
// autossuficiente desde o primeiro `npm test`.

export const CODES = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LIMIT_EXCEEDED: 429,
  EXTERNAL_DEPENDENCY: 502,
  INTERNAL: 500,
};

/**
 * O unico erro que a borda sabe traduzir em resposta.
 * A `message` e generica e estavel — o detalhe vai para o log, ligado pelo requestId.
 */
export class ApiError extends Error {
  /**
   * @param {keyof typeof CODES} code
   * @param {string} message
   * @param {string} [detail]
   */
  constructor(code, message, detail) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }

  get status() {
    return CODES[this.code];
  }
}

/** Envelope unico de erro. Toda falha sai exatamente nesta forma. */
export function errorEnvelope(error, requestId) {
  return { error: { code: error.code, message: error.message, requestId } };
}
