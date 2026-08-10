// Interfaces CANONICAS das portas. Lei dona: specs/arquitetura/00-arquitetura.md §3.3 e §4.2.
//
// `packages/` e a excecao minima ao isolamento: so entra o que e interface, contrato ou design,
// SEM logica de negocio. Regra de negocio nunca mora aqui — se dois modulos precisam da mesma
// regra, duplica-se (ADR-001, specs/adr/000-decisoes-do-template.md).
//
// Por que a interface canonica existe: um adapter generico precisa de uma forma comum. Se cada
// modulo inventasse a propria, nenhum adapter serviria a dois. O `core/portas/` do modulo
// ESPELHA o que esta aqui, e viaja com o modulo na extracao.
//
// Sem interface de linguagem, o contrato e JSDoc — cobrado por `tsc --checkJs`.

/** Taxonomia FECHADA de erro (specs/arquitetura/02-contrato-e-dados.md §3.1). */
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

/**
 * Nomes validos de porta. `config/portas.json` e `modulo.json:portas` usam este vocabulario.
 *
 * Fonte NORMATIVA: `ferramentas/gate/vocabulario-portas.mjs`, na base — os dois schemas do gate
 * (`config-portas.schema.json`, `modulo.schema.json:portas.items.enum`) sao GERADOS dela. Esta
 * lista, aqui, e a metade que nao da para gerar (interface de linguagem, nao config mecanica) —
 * mantenha as duas iguais a mao (plan-2.md Bloco S). `fila` SAIU do vocabulario: arrasta retry,
 * dead-letter, idempotencia e ordem de entrega — desenho de topologia que 00-arquitetura.md §5 diz
 * que o template nao escolhe.
 */
export const PORTAS_CONHECIDAS = [
  'repositorio',
  'auditoria',
  'relogio',
  'geradorId',
  'storage',
  'auth',
  'notificador',
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

/**
 * Guarda e recupera CONTEUDO por caminho — upload, o caso mais comum de quase todo projeto real
 * (plan-2.md Bloco S). Superficie MINIMA e tipada por operacao, no precedente de `Repositorio`:
 * nada de `executar(comando: string)` — o desenho que sustenta `sql-no-modulo` do lado do banco.
 *
 * @typedef {object} Storage
 * @property {(caminho: string, conteudo: Buffer) => Promise<void>} salvar
 * @property {(caminho: string) => Promise<Buffer | null>} buscar
 * @property {(caminho: string) => Promise<void>} remover
 */

/**
 * Envia mensagem a um destinatario — e-mail, o outro caso mais comum (plan-2.md Bloco S).
 *
 * @typedef {object} Notificador
 * @property {(destinatario: string, assunto: string, corpo: string) => Promise<void>} enviar
 */

export {};
