// Dubles das portas do modulo <module>. Lei dona: specs/arquitetura/03-operacao.md §5.
//
// TODO teste do modulo roda com estes — sem rede e sem banco. Isso nao e preferencia de teste:
// e a PROVA EXECUTAVEL de que o desacoplamento existe. Se um teste precisar de infraestrutura,
// a porta esta mal desenhada ou falta o adapter de memoria.
//
// Clock e idGenerator sao FIXOS aqui de proposito: e o que torna o motor testavel sem congelar
// o relogio do sistema, e o que prova que o dominio nao chama `new Date()` escondido.

const FIXED_INSTANT = '2024-01-01T00:00:00.000Z';

export function createInMemoryRepository(initial = []) {
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

export function createInMemoryAudit() {
  const events = [];
  return {
    events,
    async record(event) {
      events.push(event);
    },
  };
}

export function createFixedClock(instant = FIXED_INSTANT) {
  return { now: () => instant };
}

/** Sequencial e previsivel: teste que depende de sorteio nao e teste. */
export function createSequentialGenerator() {
  let nextValue = 0;
  return {
    hash() {
      nextValue += 1;
      return String(10000 + nextValue);
    },
  };
}

export function createDependencies(initial = []) {
  return {
    repository: createInMemoryRepository(initial),
    audit: createInMemoryAudit(),
    clock: createFixedClock(),
    idGenerator: createSequentialGenerator(),
  };
}

/** Auth que aceita um token conhecido. Qualquer outro e negado — deny by default. */
export function createAuth(permissions, credential = 'test-token') {
  return {
    async verify(token) {
      return token === credential ? { permissions } : null;
    },
  };
}

export function recordExample(overrides = {}) {
  return { hash: '10001', title: 'Example', status: 'draft', createdAt: FIXED_INSTANT, ...overrides };
}
