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
  Notificador,
  Pagina,
  Relogio,
  Repositorio,
  Storage,
} from '../../packages/ports/index.js';

interface ComHash {
  hash: string;
}

export function createRepository<T extends ComHash>(iniciais: T[] = []): Repositorio<T> {
  const registros = [...iniciais];
  return {
    async list(pagina: number, tamanho: number): Promise<Pagina<T>> {
      const inicio = (pagina - 1) * tamanho;
      return { itens: registros.slice(inicio, inicio + tamanho), pagina, tamanho, total: registros.length };
    },
    async findByHash(hash: string): Promise<T | null> {
      return registros.find((registro) => registro.hash === hash) ?? null;
    },
    async insert(registro: T): Promise<void> {
      registros.push(registro);
    },
    async count(): Promise<number> {
      return registros.length;
    },
  };
}

export function createAuditLog(): Auditoria & { eventos: EventoDeAuditoria[] } {
  const eventos: EventoDeAuditoria[] = [];
  return {
    eventos,
    async record(evento: EventoDeAuditoria): Promise<void> {
      eventos.push(evento);
    },
  };
}

/** Relogio do sistema. Existe aqui, fora do dominio, exatamente para que o dominio nao o tenha. */
export function createClock(): Relogio {
  return { now: () => new Date().toISOString() };
}

/** Relogio congelado, para teste de motor deterministico. */
export function createFixedClock(instante: string): Relogio {
  return { now: () => instante };
}

export function createIdGenerator(): GeradorId {
  return { hash: () => String(Math.floor(Math.random() * 90000) + 10000) };
}

export function createSequentialGenerator(inicio = 10000): GeradorId {
  let atual = inicio;
  return {
    hash() {
      atual += 1;
      return String(atual);
    },
  };
}

/** Auth que NEGA tudo. E o default seguro enquanto o projeto nao tem login (deny by default). */
export function createDenyingAuth(): Auth {
  return {
    async verify(): Promise<{ permissoes: string[] } | null> {
      return null;
    },
  };
}

/** `arquivos` exposto para o teste inspecionar o que foi salvo — mesmo padrao de `createAuditLog`. */
export function createInMemoryStorage(): Storage & { arquivos: Map<string, Buffer> } {
  const arquivos = new Map<string, Buffer>();
  return {
    arquivos,
    async save(caminho: string, conteudo: Buffer): Promise<void> {
      arquivos.set(caminho, conteudo);
    },
    async find(caminho: string): Promise<Buffer | null> {
      return arquivos.get(caminho) ?? null;
    },
    async remove(caminho: string): Promise<void> {
      arquivos.delete(caminho);
    },
  };
}

interface MensagemEnviada {
  destinatario: string;
  assunto: string;
  corpo: string;
}

/** `enviados` exposto pelo mesmo motivo de `createInMemoryStorage`: o teste afirma o que saiu. */
export function createInMemoryNotifier(): Notificador & { enviados: MensagemEnviada[] } {
  const enviados: MensagemEnviada[] = [];
  return {
    enviados,
    async send(destinatario: string, assunto: string, corpo: string): Promise<void> {
      enviados.push({ destinatario, assunto, corpo });
    },
  };
}
