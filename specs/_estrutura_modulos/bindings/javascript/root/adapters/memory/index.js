// Adapter de MEMORIA — obrigatorio em todo projeto. Lei dona: specs/arquitetura/01-modulo.md §5.2.
//
// Nao e um adapter "de brinquedo": e o que permite os testes de todo modulo rodarem sem rede e
// sem banco. Sem variante de memoria para cada porta, o desacoplamento nao e verificavel — e o
// que nao e verificavel e folclore (ADR-003, specs/adr/000-decisoes-do-template.md).
//
// Adapter NAO conhece dominio: nao existe `if (module === 'catalogo')` aqui dentro.

/**
 * @template {{ hash: string }} T
 * @param {T[]} [iniciais]
 * @returns {import('../../packages/ports/index.js').Repositorio<T>}
 */
export function createRepository(iniciais = []) {
  const registros = [...iniciais];
  return {
    async list(pagina, tamanho) {
      const inicio = (pagina - 1) * tamanho;
      return { itens: registros.slice(inicio, inicio + tamanho), pagina, tamanho, total: registros.length };
    },
    async findByHash(hash) {
      return registros.find((registro) => registro.hash === hash) ?? null;
    },
    async insert(registro) {
      registros.push(registro);
    },
    async count() {
      return registros.length;
    },
  };
}

export function createAuditLog() {
  /** @type {import('../../packages/ports/index.js').EventoDeAuditoria[]} */
  const eventos = [];
  return {
    eventos,
    async record(evento) {
      eventos.push(evento);
    },
  };
}

/** Relogio do sistema. Existe aqui, FORA do dominio, exatamente para que o dominio nao o tenha. */
export function createClock() {
  return { now: () => new Date().toISOString() };
}

/** Relogio congelado, para teste de motor deterministico. */
export function createFixedClock(instante) {
  return { now: () => instante };
}

export function createIdGenerator() {
  return { hash: () => String(Math.floor(Math.random() * 90000) + 10000) };
}

export function createSequentialGenerator(inicio = 10000) {
  let atual = inicio;
  return {
    hash() {
      atual += 1;
      return String(atual);
    },
  };
}

/** Auth que NEGA tudo. E o default seguro enquanto o projeto nao tem login (deny by default). */
export function createDenyingAuth() {
  return {
    async verify() {
      return null;
    },
  };
}

/**
 * `arquivos` exposto para o teste inspecionar o que foi salvo — mesmo padrao de `createAuditLog`.
 * @returns {import('../../packages/ports/index.js').Storage & { arquivos: Map<string, Buffer> }}
 */
export function createInMemoryStorage() {
  const arquivos = new Map();
  return {
    arquivos,
    async save(caminho, conteudo) {
      arquivos.set(caminho, conteudo);
    },
    async find(caminho) {
      return arquivos.get(caminho) ?? null;
    },
    async remove(caminho) {
      arquivos.delete(caminho);
    },
  };
}

/**
 * `enviados` exposto pelo mesmo motivo de `createInMemoryStorage`: o teste afirma o que saiu.
 * @returns {import('../../packages/ports/index.js').Notificador & { enviados: Array<{destinatario: string, assunto: string, corpo: string}> }}
 */
export function createInMemoryNotifier() {
  const enviados = [];
  return {
    enviados,
    async send(destinatario, assunto, corpo) {
      enviados.push({ destinatario, assunto, corpo });
    },
  };
}
