// Adapter de MEMORIA — obrigatorio em todo projeto. Lei dona: specs/arquitetura/01-modulo.md §5.2.
//
// Nao e um adapter "de brinquedo": e o que permite os testes de todo modulo rodarem sem rede e
// sem banco. Sem variante de memoria para cada porta, o desacoplamento nao e verificavel — e o
// que nao e verificavel e folclore (ADR-003, specs/adr/000-decisoes-do-template.md).
//
// Adapter NAO conhece dominio: nao existe `if (modulo === 'catalogo')` aqui dentro.
import type {
  Auditoria,
  Auth,
  EventoDeAuditoria,
  GeradorId,
  Pagina,
  Relogio,
  Repositorio,
} from '../../packages/portas/index.js';

interface ComHash {
  hash: string;
}

export function criarRepositorio<T extends ComHash>(iniciais: T[] = []): Repositorio<T> {
  const registros = [...iniciais];
  return {
    async listar(pagina: number, tamanho: number): Promise<Pagina<T>> {
      const inicio = (pagina - 1) * tamanho;
      return { itens: registros.slice(inicio, inicio + tamanho), pagina, tamanho, total: registros.length };
    },
    async buscarPorHash(hash: string): Promise<T | null> {
      return registros.find((registro) => registro.hash === hash) ?? null;
    },
    async inserir(registro: T): Promise<void> {
      registros.push(registro);
    },
    async contar(): Promise<number> {
      return registros.length;
    },
  };
}

export function criarAuditoria(): Auditoria & { eventos: EventoDeAuditoria[] } {
  const eventos: EventoDeAuditoria[] = [];
  return {
    eventos,
    async registrar(evento: EventoDeAuditoria): Promise<void> {
      eventos.push(evento);
    },
  };
}

/** Relogio do sistema. Existe aqui, fora do dominio, exatamente para que o dominio nao o tenha. */
export function criarRelogio(): Relogio {
  return { agora: () => new Date().toISOString() };
}

/** Relogio congelado, para teste de motor deterministico. */
export function criarRelogioFixo(instante: string): Relogio {
  return { agora: () => instante };
}

export function criarGeradorId(): GeradorId {
  return { hash: () => String(Math.floor(Math.random() * 90000) + 10000) };
}

export function criarGeradorSequencial(inicio = 10000): GeradorId {
  let atual = inicio;
  return {
    hash() {
      atual += 1;
      return String(atual);
    },
  };
}

/** Auth que NEGA tudo. E o default seguro enquanto o projeto nao tem login (deny by default). */
export function criarAuthQueNega(): Auth {
  return {
    async verificar(): Promise<{ permissoes: string[] } | null> {
      return null;
    },
  };
}
