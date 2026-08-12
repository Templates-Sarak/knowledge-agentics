// Portas do modulo <modulo>: o que ele precisa de INFRAESTRUTURA.
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
 * @typedef {object} Repositorio
 * @property {(pagina: number, tamanho: number) => Promise<Pagina<import('../domain/index.js').Registro>>} listar
 * @property {(hash: string) => Promise<import('../domain/index.js').Registro | null>} buscarPorHash
 * @property {(registro: import('../domain/index.js').Registro) => Promise<void>} inserir
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
 * Envia mensagem a um destinatario — e-mail. Existe aqui so como amostra: nenhuma rota deste
 * modulo a consome ainda (specs/arquitetura/01-modulo.md §5.1, plan-2.md Bloco S).
 * @typedef {object} Notificador
 * @property {(destinatario: string, assunto: string, corpo: string) => Promise<void>} enviar
 */

/**
 * O conjunto que o bootstrap RECEBE. Cada nome aqui corresponde a uma chave de
 * config/ports.json e a uma entrada de modulo.json:portas — o gate cobra que os tres concordem.
 *
 * `notificador` e OPCIONAL de proposito: e a porta que este molde declara so para provar que a
 * fabrica (`FABRICAS.notificador`, src/composicao.js) e alcancada de verdade no boot, nao so
 * declarada — nenhuma rota do modulo a exige, e um modulo real e livre para nao a declarar.
 *
 * @typedef {object} DependenciasModulo
 * @property {Repositorio} repositorio
 * @property {Auditoria} auditoria
 * @property {Relogio} relogio
 * @property {GeradorId} geradorId
 * @property {Notificador} [notificador]
 */

export {};
