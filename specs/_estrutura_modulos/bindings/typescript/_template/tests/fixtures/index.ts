// Dublês das portas do modulo <modulo>. Lei dona: specs/arquitetura/03-operacao.md §5.
//
// TODO teste do modulo roda com estes — sem rede e sem banco. Isso nao e preferencia de teste:
// e a PROVA EXECUTAVEL de que o desacoplamento existe. Se um teste precisar de infraestrutura,
// a porta esta mal desenhada ou falta o adapter de memoria.
//
// Relogio e geradorId sao FIXOS aqui de proposito: e o que torna o motor testavel sem congelar
// o relogio do sistema, e o que prova que o dominio nao chama `new Date()` escondido.
import type {
  Auditoria,
  DependenciasModulo,
  GeradorId,
  Relogio,
  Repositorio,
} from '../../core/ports/index.js';
import type { Registro } from '../../core/domain/index.js';
import type { Auth } from '../../api/src/middlewares/index.js';

const INSTANTE_FIXO = '2024-01-01T00:00:00.000Z';

export function createInMemoryRepository(iniciais: Registro[] = []): Repositorio {
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

export function createInMemoryAudit(): Auditoria & { eventos: unknown[] } {
  const eventos: unknown[] = [];
  return {
    eventos,
    async record(evento) {
      eventos.push(evento);
    },
  };
}

export function createFixedClock(instante = INSTANTE_FIXO): Relogio {
  return { now: () => instante };
}

/** Sequencial e previsivel: teste que depende de sorteio nao e teste. */
export function createSequentialGenerator(): GeradorId {
  let proximo = 0;
  return {
    hash() {
      proximo += 1;
      return String(10000 + proximo);
    },
  };
}

export function createDependencies(iniciais: Registro[] = []): DependenciasModulo {
  return {
    repositorio: createInMemoryRepository(iniciais),
    auditoria: createInMemoryAudit(),
    relogio: createFixedClock(),
    geradorId: createSequentialGenerator(),
  };
}

/** Auth que aceita um token conhecido. Qualquer outro e negado — deny by default. */
export function createAuth(permissoes: string[], tokenValido = 'token-de-teste'): Auth {
  return {
    async verify(token) {
      return token === tokenValido ? { permissoes } : null;
    },
  };
}

export function recordExample(sobrescrever: Partial<Registro> = {}): Registro {
  return { hash: '10001', titulo: 'Exemplo', status: 'rascunho', criadoEm: INSTANTE_FIXO, ...sobrescrever };
}
