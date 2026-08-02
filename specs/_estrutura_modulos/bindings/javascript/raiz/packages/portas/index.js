// Interfaces CANONICAS das portas. Lei dona: doutrina/00-arquitetura.md §3.3 e §4.2.
//
// `packages/` e a excecao minima ao isolamento: so entra o que e interface, contrato ou design,
// SEM logica de negocio. Regra de negocio nunca mora aqui — se dois modulos precisam da mesma
// regra, duplica-se (ADR-001).
//
// Por que a interface canonica existe: um adapter generico precisa de uma forma comum. Se cada
// modulo inventasse a propria, nenhum adapter serviria a dois. O `core/portas/` do modulo
// ESPELHA o que esta aqui, e viaja com o modulo na extracao.
//
// Sem interface de linguagem, o contrato e JSDoc — cobrado por `tsc --checkJs`.

/** Taxonomia FECHADA de erro (doutrina/02-contrato-e-dados.md §3.1). */
export const CODIGOS_DE_ERRO = {
  VALIDACAO: 400,
  NAO_AUTENTICADO: 401,
  NAO_AUTORIZADO: 403,
  NAO_ENCONTRADO: 404,
  CONFLITO: 409,
  LIMITE_EXCEDIDO: 429,
  DEPENDENCIA_EXTERNA: 502,
  INTERNO: 500,
};

/** Falha de porta. O adapter TRADUZ o erro do fornecedor para ca — o dominio nunca ve o SDK. */
export class ErroPorta extends Error {
  /**
   * @param {keyof typeof CODIGOS_DE_ERRO} codigo
   * @param {string} mensagem
   * @param {string} [detalhe]
   */
  constructor(codigo, mensagem, detalhe) {
    super(mensagem);
    this.name = 'ErroPorta';
    this.codigo = codigo;
    this.detalhe = detalhe;
  }
}

/** Nomes validos de porta. `config/portas.json` e `modulo.json:portas` usam este vocabulario. */
export const PORTAS_CONHECIDAS = [
  'repositorio', 'auditoria', 'relogio', 'geradorId',
  'storage', 'auth', 'notificador', 'fila',
];

/**
 * @template T
 * @typedef {object} Pagina
 * @property {T[]} itens
 * @property {number} pagina
 * @property {number} tamanho
 * @property {number} total
 */

/**
 * @template T
 * @typedef {object} Repositorio
 * @property {(pagina: number, tamanho: number) => Promise<Pagina<T>>} listar
 * @property {(hash: string) => Promise<T | null>} buscarPorHash
 * @property {(registro: T) => Promise<void>} inserir
 * @property {() => Promise<number>} contar
 */

/**
 * @typedef {object} EventoDeAuditoria
 * @property {string} hash
 * @property {string} acao
 * @property {string} sujeito
 * @property {string[]} camposAlterados
 * @property {string} requestId
 */

/**
 * @typedef {object} Auditoria
 * @property {(evento: EventoDeAuditoria) => Promise<void>} registrar
 *
 * @typedef {object} Relogio
 * @property {() => string} agora
 *
 * @typedef {object} GeradorId
 * @property {() => string} hash
 *
 * @typedef {object} Auth
 * @property {(token: string) => Promise<{ permissoes: string[] } | null>} verificar
 */

export {};
