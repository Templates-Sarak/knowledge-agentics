// Interfaces CANONICAS das portas. Lei dona: doutrina/00-arquitetura.md §3.3 e §4.2.
//
// `packages/` e a excecao minima ao isolamento: so entra o que e interface, contrato ou design,
// SEM logica de negocio. Regra de negocio nunca mora aqui — se dois modulos precisam da mesma
// regra, duplica-se (ADR-001).
//
// Por que a interface canonica existe: um adapter generico precisa de uma forma comum. Se cada
// modulo inventasse a propria, nenhum adapter serviria a dois. O `core/portas/` do modulo ESTENDE
// (ou espelha) o que esta aqui, e viaja com o modulo na extracao.

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
} as const;

export type CodigoErro = keyof typeof CODIGOS_DE_ERRO;

/** Falha de porta. O adapter TRADUZ o erro do fornecedor para ca — o dominio nunca ve o SDK. */
export class ErroPorta extends Error {
  constructor(public readonly codigo: CodigoErro, mensagem: string, public readonly detalhe?: string) {
    super(mensagem);
    this.name = 'ErroPorta';
  }
}

/** Nomes validos de porta. `config/portas.json` e `modulo.json:portas` usam este vocabulario. */
export const PORTAS_CONHECIDAS = [
  'repositorio', 'auditoria', 'relogio', 'geradorId',
  'storage', 'auth', 'notificador', 'fila',
] as const;

export type NomeDePorta = (typeof PORTAS_CONHECIDAS)[number];

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface Repositorio<T> {
  listar(pagina: number, tamanho: number): Promise<Pagina<T>>;
  buscarPorHash(hash: string): Promise<T | null>;
  inserir(registro: T): Promise<void>;
  contar(): Promise<number>;
}

export interface EventoDeAuditoria {
  hash: string;
  acao: string;
  sujeito: string;
  camposAlterados: string[];
  requestId: string;
}

export interface Auditoria {
  registrar(evento: EventoDeAuditoria): Promise<void>;
}

export interface Relogio {
  agora(): string;
}

export interface GeradorId {
  hash(): string;
}

export interface Auth {
  verificar(token: string): Promise<{ permissoes: string[] } | null>;
}
