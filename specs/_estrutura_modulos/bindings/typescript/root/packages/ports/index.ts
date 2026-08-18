// Interfaces CANONICAS das portas. Lei dona: specs/arquitetura/00-arquitetura.md §3.3 e §4.2.
//
// `packages/` e a excecao minima ao isolamento: so entra o que e interface, contrato ou design,
// SEM logica de negocio. Regra de negocio nunca mora aqui — se dois modulos precisam da mesma
// regra, duplica-se (ADR-001, specs/adr/000-decisoes-do-template.md).
//
// Por que a interface canonica existe: um adapter generico precisa de uma forma comum. Se cada
// modulo inventasse a propria, nenhum adapter serviria a dois. O `core/ports/` do modulo ESTENDE
// (ou espelha) o que esta aqui, e viaja com o modulo na extracao.

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
} as const;

export type CodigoErro = keyof typeof CODIGOS_DE_ERRO;

/** Falha de porta. O adapter TRADUZ o erro do fornecedor para ca — o dominio nunca ve o SDK. */
export class ErroPorta extends Error {
  constructor(
    public readonly codigo: CodigoErro,
    mensagem: string,
    public readonly detalhe?: string,
  ) {
    super(mensagem);
    this.name = 'ErroPorta';
  }
}

/**
 * Nomes validos de porta. `config/ports.json` e `module.json:ports` usam este vocabulario.
 *
 * Fonte NORMATIVA: `tools/gate/ports-vocabulary.mjs`, na base — os dois schemas do gate
 * (`config-ports.schema.json`, `module.schema.json:ports.items.enum`) sao GERADOS dela. Esta
 * lista, aqui, e a metade que nao da para gerar (interface de linguagem, nao config mecanica) —
 * mantenha as duas iguais a mao. `fila` NAO ESTA no vocabulario: arrasta retry,
 * dead-letter, idempotencia e ordem de entrega — desenho de topologia que 00-arquitetura.md §5 diz
 * que o template nao escolhe. `verificadorDeToken` era `auth` ate o ADR-010.
 */
export const PORTAS_CONHECIDAS = [
  'repositorio',
  'auditoria',
  'relogio',
  'geradorId',
  'storage',
  'verificadorDeToken',
  'notificador',
] as const;

export type NomeDePorta = (typeof PORTAS_CONHECIDAS)[number];

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface Repositorio<T> {
  list(pagina: number, tamanho: number): Promise<Pagina<T>>;
  findByHash(hash: string): Promise<T | null>;
  insert(registro: T): Promise<void>;
  count(): Promise<number>;
}

export interface EventoDeAuditoria {
  hash: string;
  acao: string;
  sujeito: string;
  camposAlterados: string[];
  requestId: string;
}

export interface Auditoria {
  record(evento: EventoDeAuditoria): Promise<void>;
}

export interface Relogio {
  now(): string;
}

export interface GeradorId {
  hash(): string;
}

export interface VerificadorDeToken {
  verify(token: string): Promise<{ permissoes: string[] } | null>;
}

/**
 * Guarda e recupera CONTEUDO por caminho — upload, o caso mais comum de quase todo projeto real
 * — superficie MINIMA e tipada por operacao, no precedente de `Repositorio`:
 * nada de `executar(comando: string)` — o desenho que sustenta `sql-no-modulo` do lado do banco.
 */
export interface Storage {
  save(caminho: string, conteudo: Buffer): Promise<void>;
  find(caminho: string): Promise<Buffer | null>;
  remove(caminho: string): Promise<void>;
}

/** Envia mensagem a um destinatario — e-mail, o outro caso mais comum. */
export interface Notificador {
  send(destinatario: string, assunto: string, corpo: string): Promise<void>;
}
