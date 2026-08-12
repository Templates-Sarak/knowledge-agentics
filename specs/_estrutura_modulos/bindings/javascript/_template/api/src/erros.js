// Taxonomia FECHADA de erro do modulo <modulo>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §3.1.
//
// Fechada quer dizer: acrescentar codigo aqui e mudanca de contrato, nao improviso de rota.
// Num projeto com `packages/ports`, este arquivo re-exporta a versao canonica de la — assim
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
};

/**
 * O unico erro que a borda sabe traduzir em resposta.
 * A `mensagem` e generica e estavel — o detalhe vai para o log, ligado pelo requestId.
 */
export class ErroApi extends Error {
  /**
   * @param {keyof typeof CODIGOS} codigo
   * @param {string} mensagem
   * @param {string} [detalhe]
   */
  constructor(codigo, mensagem, detalhe) {
    super(mensagem);
    this.name = 'ErroApi';
    this.codigo = codigo;
    this.detalhe = detalhe;
  }

  get status() {
    return CODIGOS[this.codigo];
  }
}

/** Envelope unico de erro. Toda falha sai exatamente nesta forma. */
export function envelopeDeErro(erro, requestId) {
  return { erro: { codigo: erro.codigo, mensagem: erro.message, requestId } };
}
