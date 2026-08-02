// Portas do modulo <modulo>: o que ele precisa de INFRAESTRUTURA.
// Lei dona: specs/arquitetura/01-modulo.md §5.
//
// Aqui mora o CONTRATO ("preciso de um repositorio"), nunca a implementacao ("falo com Postgres").
// Quem atende cada porta e decidido em config/portas.json, e o adapter e INJETADO no bootstrap.
// O modulo nunca importa `adapters/*` nem SDK de fornecedor — trocar de provedor e editar um JSON.
//
// Sem interface de linguagem, a porta e um CONTRATO JSDoc. Ele nao e comentario: e o que o
// editor e o `tsc --checkJs` verificam, e o que documenta a fronteira para quem escreve o adapter.

/**
 * @template T
 * @typedef {object} Pagina
 * @property {T[]} itens
 * @property {number} pagina
 * @property {number} tamanho
 * @property {number} total
 */

/**
 * Persistencia dos registros do proprio modulo. Nunca toca tabela de outro modulo.
 * @typedef {object} Repositorio
 * @property {(pagina: number, tamanho: number) => Promise<Pagina<import('../dominio/index.js').Registro>>} listar
 * @property {(hash: string) => Promise<import('../dominio/index.js').Registro | null>} buscarPorHash
 * @property {(registro: import('../dominio/index.js').Registro) => Promise<void>} inserir
 * @property {() => Promise<number>} contar
 */

/**
 * Trilha append-only do modulo. Guarda o NOME dos campos alterados, nunca o valor.
 * @typedef {object} Auditoria
 * @property {(evento: EventoDeAuditoria) => Promise<void>} registrar
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
 * O instante. Existe para que o dominio nunca chame `new Date()`.
 * @typedef {object} Relogio
 * @property {() => string} agora
 */

/**
 * Identificadores. Existe para que o dominio nunca chame `Math.random()`.
 * @typedef {object} GeradorId
 * @property {() => string} hash
 */

/**
 * @typedef {object} Auth
 * @property {(token: string) => Promise<{ permissoes: string[] } | null>} verificar
 */

/**
 * O conjunto que o bootstrap RECEBE. Cada nome aqui corresponde a uma chave de
 * config/portas.json e a uma entrada de modulo.json:portas — o gate cobra que os tres concordem.
 *
 * @typedef {object} DependenciasModulo
 * @property {Repositorio} repositorio
 * @property {Auditoria} auditoria
 * @property {Relogio} relogio
 * @property {GeradorId} geradorId
 */

export {};
