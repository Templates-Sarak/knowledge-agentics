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
} as const;

export type ErrorCode = keyof typeof CODES;

/**
 * O unico erro que a borda sabe traduzir em resposta.
 * A `message` e generica e estavel — o detalhe vai para o log, ligado pelo requestId.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get status(): number {
    return CODES[this.code];
  }
}

/** Envelope unico de erro. Toda falha sai exatamente nesta forma. */
export function errorEnvelope(error: ApiError, requestId: string): Record<string, unknown> {
  return { error: { code: error.code, message: error.message, requestId } };
}
