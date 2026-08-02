// Adapter de MEMORIA — obrigatorio em todo projeto. Lei dona: doutrina/01-modulo.md §5.2.
//
// Nao e um adapter "de brinquedo": e o que permite os testes de todo modulo rodarem sem rede e
// sem banco. Sem variante de memoria para cada porta, o desacoplamento nao e verificavel — e o
// que nao e verificavel e folclore (ADR-003).
//
// Adapter NAO conhece dominio: nao existe `if (modulo === 'catalogo')` aqui dentro.

/**
 * @template {{ hash: string }} T
 * @param {T[]} [iniciais]
 * @returns {import('../../packages/portas/index.js').Repositorio<T>}
 */
export function criarRepositorio(iniciais = []) {
  const registros = [...iniciais];
  return {
    async listar(pagina, tamanho) {
      const inicio = (pagina - 1) * tamanho;
      return { itens: registros.slice(inicio, inicio + tamanho), pagina, tamanho, total: registros.length };
    },
    async buscarPorHash(hash) {
      return registros.find((registro) => registro.hash === hash) ?? null;
    },
    async inserir(registro) {
      registros.push(registro);
    },
    async contar() {
      return registros.length;
    },
  };
}

export function criarAuditoria() {
  /** @type {import('../../packages/portas/index.js').EventoDeAuditoria[]} */
  const eventos = [];
  return {
    eventos,
    async registrar(evento) {
      eventos.push(evento);
    },
  };
}

/** Relogio do sistema. Existe aqui, FORA do dominio, exatamente para que o dominio nao o tenha. */
export function criarRelogio() {
  return { agora: () => new Date().toISOString() };
}

/** Relogio congelado, para teste de motor deterministico. */
export function criarRelogioFixo(instante) {
  return { agora: () => instante };
}

export function criarGeradorId() {
  return { hash: () => String(Math.floor(Math.random() * 90000) + 10000) };
}

export function criarGeradorSequencial(inicio = 10000) {
  let atual = inicio;
  return {
    hash() {
      atual += 1;
      return String(atual);
    },
  };
}

/** Auth que NEGA tudo. E o default seguro enquanto o projeto nao tem login (deny by default). */
export function criarAuthQueNega() {
  return {
    async verificar() {
      return null;
    },
  };
}
