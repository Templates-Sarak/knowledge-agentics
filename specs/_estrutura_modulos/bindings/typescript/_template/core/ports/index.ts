// Portas do modulo <modulo>: o que ele precisa de INFRAESTRUTURA.
// Lei dona: specs/arquitetura/01-modulo.md §5.
//
// Aqui mora o CONTRATO ("preciso de um repositorio"), nunca a implementacao ("falo com Postgres").
// Quem atende cada porta e decidido em config/ports.json, e o adapter e INJETADO no bootstrap.
// O modulo nunca importa `adapters/*` nem SDK de fornecedor — trocar de provedor e editar um JSON.

import type { Registro } from '../domain/index.js';

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

/** Persistencia dos registros do proprio modulo. Nunca toca tabela de outro modulo. */
export interface Repositorio {
  list(pagina: number, tamanho: number): Promise<Pagina<Registro>>;
  findByHash(hash: string): Promise<Registro | null>;
  insert(registro: Registro): Promise<void>;
  count(): Promise<number>;
}

/** Trilha append-only do modulo. Guarda o NOME dos campos alterados, nunca o valor. */
export interface Auditoria {
  record(evento: {
    hash: string;
    acao: string;
    sujeito: string;
    camposAlterados: string[];
    requestId: string;
  }): Promise<void>;
}

/** O instante. Existe para que o dominio nunca chame `new Date()`. */
export interface Relogio {
  now(): string;
}

/** Identificadores. Existe para que o dominio nunca chame `Math.random()`. */
export interface GeradorId {
  hash(): string;
}

/** Envia mensagem a um destinatario — e-mail. Existe aqui so como amostra: nenhuma rota deste
 * modulo a consome ainda (specs/arquitetura/01-modulo.md §5.1). */
export interface Notificador {
  send(destinatario: string, assunto: string, corpo: string): Promise<void>;
}

/**
 * O conjunto que o bootstrap RECEBE. Cada nome aqui corresponde a uma chave de config/ports.json
 * e a uma entrada de module.json:ports — o gate cobra que os tres concordem.
 *
 * `notificador` e OPCIONAL de proposito: e a porta que este molde declara so para provar que a
 * fabrica (`FABRICAS.notificador`, src/composicao.ts) e alcancada de verdade no boot, nao so
 * declarada — nenhuma rota do modulo a exige, e um modulo real e livre para nao a declarar.
 */
export interface DependenciasModulo {
  repositorio: Repositorio;
  auditoria: Auditoria;
  relogio: Relogio;
  geradorId: GeradorId;
  notificador?: Notificador;
}
