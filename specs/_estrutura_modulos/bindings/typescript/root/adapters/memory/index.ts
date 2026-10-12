// Adapter de MEMORIA — obrigatorio em todo projeto. Lei dona: specs/arquitetura/01-modulo.md §5.2.
//
// Nao e um adapter "de brinquedo": e o que permite os testes de todo modulo rodarem sem rede e
// sem banco. Sem variante de memoria para cada porta, o desacoplamento nao e verificavel — e o
// que nao e verificavel e folclore (ADR-003, specs/adr/000-decisoes-do-template.md).
//
// Adapter NAO conhece dominio: nao existe `if (module === 'catalogo')` aqui dentro.
import type {
  Audit,
  AuditEvent,
  IdGenerator,
  Notifier,
  Page,
  Clock,
  Repository,
  Storage,
  TokenVerifier,
} from '../../packages/ports/index.js';

interface ComHash {
  hash: string;
}

export function createRepository<T extends ComHash>(initial: T[] = []): Repository<T> {
  const entries = [...initial];
  return {
    async list(page: number, pageSize: number): Promise<Page<T>> {
      const start = (page - 1) * pageSize;
      return { items: entries.slice(start, start + pageSize), page, pageSize, total: entries.length };
    },
    async findByHash(hash: string): Promise<T | null> {
      return entries.find((entry) => entry.hash === hash) ?? null;
    },
    async insert(entry: T): Promise<void> {
      entries.push(entry);
    },
    async count(): Promise<number> {
      return entries.length;
    },
  };
}

export function createAuditLog(): Audit & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    async record(event: AuditEvent): Promise<void> {
      events.push(event);
    },
  };
}

/** Relogio do sistema. Existe aqui, fora do dominio, exatamente para que o dominio nao o tenha. */
export function createClock(): Clock {
  return { now: () => new Date().toISOString() };
}

/** Relogio congelado, para teste de motor deterministico. */
export function createFixedClock(instant: string): Clock {
  return { now: () => instant };
}

export function createIdGenerator(): IdGenerator {
  return { hash: () => String(Math.floor(Math.random() * 90000) + 10000) };
}

export function createSequentialGenerator(start = 10000): IdGenerator {
  let current = start;
  return {
    hash() {
      current += 1;
      return String(current);
    },
  };
}

/** Auth que NEGA tudo. E o default seguro enquanto o projeto nao tem login (deny by default). */
export function createDenyingTokenVerifier(): TokenVerifier {
  return {
    async verify(): Promise<{ permissions: string[] } | null> {
      return null;
    },
  };
}

/** `files` exposto para o teste inspecionar o que foi salvo — mesmo padrao de `createAuditLog`. */
export function createInMemoryStorage(): Storage & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    files,
    async save(path: string, content: Buffer): Promise<void> {
      files.set(path, content);
    },
    async find(path: string): Promise<Buffer | null> {
      return files.get(path) ?? null;
    },
    async remove(path: string): Promise<void> {
      files.delete(path);
    },
  };
}

interface SentMessage {
  recipient: string;
  subject: string;
  body: string;
}

/** `sent` exposto pelo mesmo motivo de `createInMemoryStorage`: o teste afirma o que saiu. */
export function createInMemoryNotifier(): Notifier & { sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  return {
    sent,
    async send(recipient: string, subject: string, body: string): Promise<void> {
      sent.push({ recipient, subject, body });
    },
  };
}
