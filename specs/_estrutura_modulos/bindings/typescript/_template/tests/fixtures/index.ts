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
} from '../../core/portas/index.js';
import type { Registro } from '../../core/dominio/index.js';
import type { Auth } from '../../api/src/middlewares/index.js';

const INSTANTE_FIXO = '2024-01-01T00:00:00.000Z';

export function criarRepositorioEmMemoria(iniciais: Registro[] = []): Repositorio {
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

export function criarAuditoriaEmMemoria(): Auditoria & { eventos: unknown[] } {
  const eventos: unknown[] = [];
  return {
    eventos,
    async registrar(evento) {
      eventos.push(evento);
    },
  };
}

export function criarRelogioFixo(instante = INSTANTE_FIXO): Relogio {
  return { agora: () => instante };
}

/** Sequencial e previsivel: teste que depende de sorteio nao e teste. */
export function criarGeradorSequencial(): GeradorId {
  let proximo = 0;
  return {
    hash() {
      proximo += 1;
      return String(10000 + proximo);
    },
  };
}

export function criarDependencias(iniciais: Registro[] = []): DependenciasModulo {
  return {
    repositorio: criarRepositorioEmMemoria(iniciais),
    auditoria: criarAuditoriaEmMemoria(),
    relogio: criarRelogioFixo(),
    geradorId: criarGeradorSequencial(),
  };
}

/** Auth que aceita um token conhecido. Qualquer outro e negado — deny by default. */
export function criarAuth(permissoes: string[], tokenValido = 'token-de-teste'): Auth {
  return {
    async verificar(token) {
      return token === tokenValido ? { permissoes } : null;
    },
  };
}

export function registroDeExemplo(sobrescrever: Partial<Registro> = {}): Registro {
  return { hash: '10001', titulo: 'Exemplo', status: 'rascunho', criadoEm: INSTANTE_FIXO, ...sobrescrever };
}
