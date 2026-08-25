// Portas do modulo <module>: o que ele precisa de INFRAESTRUTURA.
// Lei dona: specs/arquitetura/01-modulo.md §5.
//
// Aqui mora o CONTRATO ("preciso de um repositorio"), nunca a implementacao ("falo com Postgres").
// Quem atende cada porta e decidido em config/ports.json, e o adapter e INJETADO no bootstrap.
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
 * @typedef {object} Repository
 * @property {(pagina: number, tamanho: number) => Promise<Pagina<import('../domain/index.js').Registro>>} list
 * @property {(hash: string) => Promise<import('../domain/index.js').Registro | null>} findByHash
 * @property {(registro: import('../domain/index.js').Registro) => Promise<void>} insert
 * @property {() => Promise<number>} count
 */

/**
 * Trilha append-only do modulo. Guarda o NOME dos campos alterados, nunca o valor.
 * @typedef {object} Audit
 * @property {(evento: AuditEvent) => Promise<void>} record
 */

/**
 * @typedef {object} AuditEvent
 * @property {string} hash
 * @property {string} acao
 * @property {string} sujeito
 * @property {string[]} camposAlterados
 * @property {string} requestId
 */

/**
 * O instante. Existe para que o dominio nunca chame `new Date()`.
 * @typedef {object} Clock
 * @property {() => string} now
 */

/**
 * Identificadores. Existe para que o dominio nunca chame `Math.random()`.
 * @typedef {object} IdGenerator
 * @property {() => string} hash
 */

/**
 * @typedef {object} Auth
 * @property {(token: string) => Promise<{ permissoes: string[] } | null>} verify
 */

/**
 * Envia mensagem a um destinatario — e-mail. Existe aqui so como amostra: nenhuma rota deste
 * modulo a consome ainda (specs/arquitetura/01-modulo.md §5.1).
 * @typedef {object} Notifier
 * @property {(destinatario: string, assunto: string, corpo: string) => Promise<void>} send
 */

/**
 * O conjunto que o bootstrap RECEBE. Cada nome aqui corresponde a uma chave de
 * config/ports.json e a uma entrada de module.json:ports — o gate cobra que os tres concordem.
 *
 * `notifier` e OPCIONAL de proposito: e a porta que este molde declara so para provar que a
 * fabrica (`FABRICAS.notifier`, src/composition.js) e alcancada de verdade no boot, nao so
 * declarada — nenhuma rota do modulo a exige, e um modulo real e livre para nao a declarar.
 *
 * @typedef {object} ModuleDependencies
 * @property {Repository} repository
 * @property {Audit} audit
 * @property {Clock} clock
 * @property {IdGenerator} idGenerator
 * @property {Notifier} [notifier]
 */

export {};
