// Taxonomia FECHADA de erro do modulo <modulo>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §3.1.
//
// Fechada quer dizer: acrescentar codigo aqui e mudanca de contrato, nao improviso de rota.
// Num projeto com `packages/portas`, este arquivo re-exporta a versao canonica de la — assim
// todos os modulos falam a mesma lingua de erro. O molde traz a copia local para ser
// autossuficiente desde o primeiro `npm test`.

export const CODIGOS = {
  VALIDACAO: 400,
  NAO_AUTENTICADO: 401,
  NAO_AUTORIZADO: 403,
  NAO_ENCONTRADO: 404,
  CONFLITO: 409,
  LIMITE_EXCEDIDO: 429,
  DEPENDENCIA_EXTERNA: 502,
  INTERNO: 500,
} as const;

export type CodigoErro = keyof typeof CODIGOS;

/**
 * O unico erro que a borda sabe traduzir em resposta.
 * A `mensagem` e generica e estavel — o detalhe vai para o log, ligado pelo requestId.
 */
export class ErroApi extends Error {
  constructor(
    public readonly codigo: CodigoErro,
    mensagem: string,
    public readonly detalhe?: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }

  get status(): number {
    return CODIGOS[this.codigo];
  }
}

/** Envelope unico de erro. Toda falha sai exatamente nesta forma. */
export function envelopeDeErro(erro: ErroApi, requestId: string): Record<string, unknown> {
  return { erro: { codigo: erro.codigo, mensagem: erro.message, requestId } };
}
