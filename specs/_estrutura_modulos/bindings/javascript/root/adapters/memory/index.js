// Adapter de MEMORIA — obrigatorio em todo projeto. Lei dona: specs/arquitetura/01-modulo.md §5.2.
//
// Nao e um adapter "de brinquedo": e o que permite os testes de todo modulo rodarem sem rede e
// sem banco. Sem variante de memoria para cada porta, o desacoplamento nao e verificavel — e o
// que nao e verificavel e folclore (ADR-003, specs/adr/000-decisoes-do-template.md).
//
// Adapter NAO conhece dominio: nao existe `if (module === 'catalogo')` aqui dentro.

/**
 * @template {{ hash: string }} T
 * @param {T[]} [initial]
 * @returns {import('../../packages/ports/index.js').Repository<T>}
 */
export function createRepository(initial = []) {
  const entries = [...initial];
  return {
    async list(page, pageSize) {
      const start = (page - 1) * pageSize;
      return { items: entries.slice(start, start + pageSize), page, pageSize, total: entries.length };
    },
    async findByHash(hash) {
      return entries.find((entry) => entry.hash === hash) ?? null;
    },
    async insert(entry) {
      entries.push(entry);
    },
    async count() {
      return entries.length;
    },
  };
}

export function createAuditLog() {
  /** @type {import('../../packages/ports/index.js').AuditEvent[]} */
  const events = [];
  return {
    events,
    async record(event) {
      events.push(event);
    },
  };
}

/** Relogio do sistema. Existe aqui, FORA do dominio, exatamente para que o dominio nao o tenha. */
export function createClock() {
  return { now: () => new Date().toISOString() };
}

/** Relogio congelado, para teste de motor deterministico. */
export function createFixedClock(instant) {
  return { now: () => instant };
}

export function createIdGenerator() {
  return { hash: () => String(Math.floor(Math.random() * 90000) + 10000) };
}

export function createSequentialGenerator(start = 10000) {
  let current = start;
  return {
    hash() {
      current += 1;
      return String(current);
    },
  };
}

/** Auth que NEGA tudo. E o default seguro enquanto o projeto nao tem login (deny by default). */
export function createDenyingTokenVerifier() {
  return {
    async verify() {
      return null;
    },
  };
}

/**
 * `files` exposto para o teste inspecionar o que foi salvo — mesmo padrao de `createAuditLog`.
 * @returns {import('../../packages/ports/index.js').Storage & { files: Map<string, Buffer> }}
 */
export function createInMemoryStorage() {
  const files = new Map();
  return {
    files,
    async save(path, content) {
      files.set(path, content);
    },
    async find(path) {
      return files.get(path) ?? null;
    },
    async remove(path) {
      files.delete(path);
    },
  };
}

/**
 * `sent` exposto pelo mesmo motivo de `createInMemoryStorage`: o teste afirma o que saiu.
 * @returns {import('../../packages/ports/index.js').Notifier & { sent: Array<{recipient: string, subject: string, body: string}> }}
 */
export function createInMemoryNotifier() {
  const sent = [];
  return {
    sent,
    async send(recipient, subject, body) {
      sent.push({ recipient, subject, body });
    },
  };
}
