// Portas do modulo <modulo>: o que ele precisa de INFRAESTRUTURA.
// Lei dona: specs/arquitetura/01-modulo.md §5.
//
// Aqui mora o CONTRATO ("preciso de um repositorio"), nunca a implementacao ("falo com Postgres").
// Quem atende cada porta e decidido em config/portas.json, e o adapter e INJETADO no bootstrap.
// O modulo nunca importa `adapters/*` nem SDK de fornecedor — trocar de provedor e editar um JSON.

import type { Registro } from '../dominio/index.js';

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

/** Persistencia dos registros do proprio modulo. Nunca toca tabela de outro modulo. */
export interface Repositorio {
  listar(pagina: number, tamanho: number): Promise<Pagina<Registro>>;
  buscarPorHash(hash: string): Promise<Registro | null>;
  inserir(registro: Registro): Promise<void>;
  contar(): Promise<number>;
}

/** Trilha append-only do modulo. Guarda o NOME dos campos alterados, nunca o valor. */
export interface Auditoria {
  registrar(evento: {
    hash: string;
    acao: string;
    sujeito: string;
    camposAlterados: string[];
    requestId: string;
  }): Promise<void>;
}

/** O instante. Existe para que o dominio nunca chame `new Date()`. */
export interface Relogio {
  agora(): string;
}

/** Identificadores. Existe para que o dominio nunca chame `Math.random()`. */
export interface GeradorId {
  hash(): string;
}

/**
 * O conjunto que o bootstrap RECEBE. Cada nome aqui corresponde a uma chave de config/portas.json
 * e a uma entrada de modulo.json:portas — o gate cobra que os tres concordem.
 */
export interface DependenciasModulo {
  repositorio: Repositorio;
  auditoria: Auditoria;
  relogio: Relogio;
  geradorId: GeradorId;
}
