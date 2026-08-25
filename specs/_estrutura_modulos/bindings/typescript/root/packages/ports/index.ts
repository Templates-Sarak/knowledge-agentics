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
export const ERROR_CODES = {
  VALIDACAO: 400,
  NAO_AUTENTICADO: 401,
  NAO_AUTORIZADO: 403,
  NAO_ENCONTRADO: 404,
  CONFLITO: 409,
  LIMITE_EXCEDIDO: 429,
  DEPENDENCIA_EXTERNA: 502,
  INTERNO: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Falha de porta. O adapter TRADUZ o erro do fornecedor para ca — o dominio nunca ve o SDK. */
export class PortError extends Error {
  constructor(
    public readonly codigo: ErrorCode,
    mensagem: string,
    public readonly detalhe?: string,
  ) {
    super(mensagem);
    this.name = 'PortError';
  }
}

/**
 * Nomes validos de porta. `config/ports.json` e `module.json:ports` usam este vocabulario.
 *
 * Fonte NORMATIVA: `tools/gate/ports-vocabulary.mjs`, na base — os dois schemas do gate
 * (`config-ports.schema.json`, `module.schema.json:ports.items.enum`) sao GERADOS dela. Esta
 * lista, aqui, e a metade que nao da para gerar (interface de linguagem, nao config mecanica) —
 * mantenha as duas iguais a mao (o SIMBOLO diverge de proposito: `PORTAS_CONHECIDAS` na fonte,
 * `KNOWN_PORTS` aqui — Onda 3 do ADR-013/ADR-016, esqueleto e ferramental traduzem por regras
 * diferentes; o CONTEUDO das duas listas e que precisa ser identico). `fila` NAO ESTA no
 * vocabulario: arrasta retry, dead-letter, idempotencia e ordem de entrega — desenho de topologia
 * que 00-arquitetura.md §5 diz que o template nao escolhe. `tokenVerifier` era `verificadorDeToken`
 * (traducao de idioma, ADR-013/ADR-016) e, antes disso, `auth` ate o ADR-010.
 */
export const KNOWN_PORTS = [
  'repository',
  'audit',
  'clock',
  'idGenerator',
  'storage',
  'tokenVerifier',
  'notifier',
] as const;

export type PortName = (typeof KNOWN_PORTS)[number];

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface Repository<T> {
  list(pagina: number, tamanho: number): Promise<Pagina<T>>;
  findByHash(hash: string): Promise<T | null>;
  insert(registro: T): Promise<void>;
  count(): Promise<number>;
}

export interface AuditEvent {
  hash: string;
  acao: string;
  sujeito: string;
  camposAlterados: string[];
  requestId: string;
}

export interface Audit {
  record(evento: AuditEvent): Promise<void>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  hash(): string;
}

export interface TokenVerifier {
  verify(token: string): Promise<{ permissoes: string[] } | null>;
}

/**
 * Guarda e recupera CONTEUDO por caminho — upload, o caso mais comum de quase todo projeto real
 * — superficie MINIMA e tipada por operacao, no precedente de `Repository`:
 * nada de `executar(comando: string)` — o desenho que sustenta `sql-no-modulo` do lado do banco.
 */
export interface Storage {
  save(caminho: string, conteudo: Buffer): Promise<void>;
  find(caminho: string): Promise<Buffer | null>;
  remove(caminho: string): Promise<void>;
}

/** Envia mensagem a um destinatario — e-mail, o outro caso mais comum. */
export interface Notifier {
  send(destinatario: string, assunto: string, corpo: string): Promise<void>;
}
