// Dominio do modulo <modulo>: tipos e validacao. Lei dona: specs/arquitetura/01-modulo.md §2.
//
// Regras desta camada:
//   - ZERO I/O. Nada de rede, banco, arquivo ou env.
//   - ZERO nao-determinismo: `new Date()` e `Math.random()` sao PROIBIDOS aqui — o instante e o
//     identificador chegam pelas portas `relogio` e `geradorId` (specs/arquitetura/01-modulo.md §5.1).
//   - ZERO literal de vocabulario: os status validos vem de config/domain.json.

/** Registro do dominio, na caixa do contrato (camelCase). */
export interface Registro {
  hash: string;
  titulo: string;
  status: string;
  criadoEm: string;
}

/** O que a borda aceita para criar um registro. */
export interface NovoRegistro {
  titulo: string;
  status?: string;
}

/** Falha de validacao do dominio. A borda a traduz para VALIDACAO (400). */
export class ErroDeValidacao extends Error {
  constructor(
    public readonly campo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
  }
}

function requireTitle(titulo: unknown): string {
  if (typeof titulo !== 'string' || titulo.trim() === '') {
    throw new ErroDeValidacao('titulo', 'titulo e obrigatorio');
  }
  return titulo.trim();
}

function requireStatus(status: unknown, statusValidos: readonly string[]): string {
  const padrao = statusValidos[0];
  if (padrao === undefined) {
    throw new ErroDeValidacao('status', 'config/domain.json:statusValidos esta vazio');
  }
  if (status === undefined) return padrao;
  if (typeof status !== 'string' || !statusValidos.includes(status)) {
    throw new ErroDeValidacao('status', `status deve ser um de: ${statusValidos.join(', ')}`);
  }
  return status;
}

/**
 * Valida a entrada externa e devolve o registro do dominio.
 * O `hash` e o `criadoEm` vem de fora (portas), nunca daqui — e o que mantem o dominio deterministico.
 */
export function buildRecord(
  entrada: NovoRegistro,
  statusValidos: readonly string[],
  hash: string,
  criadoEm: string,
): Registro {
  return {
    hash,
    titulo: requireTitle(entrada.titulo),
    status: requireStatus(entrada.status, statusValidos),
    criadoEm,
  };
}
