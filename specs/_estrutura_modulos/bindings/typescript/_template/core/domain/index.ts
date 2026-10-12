// Dominio do modulo <module>: tipos e validacao. Lei dona: specs/arquitetura/01-modulo.md §2.
//
// Regras desta camada:
//   - ZERO I/O. Nada de rede, banco, arquivo ou env.
//   - ZERO nao-determinismo: `new Date()` e `Math.random()` sao PROIBIDOS aqui — o instante e o
//     identificador chegam pelas portas `clock` e `idGenerator` (specs/arquitetura/01-modulo.md §5.1).
//   - ZERO literal de vocabulario: os status validos vem de config/domain.json.

/** Registro do dominio, na caixa do contrato (camelCase). */
export interface Entry {
  hash: string;
  title: string;
  status: string;
  createdAt: string;
}

/** O que a borda aceita para criar um registro. */
export interface NewEntry {
  title: string;
  status?: string;
}

/** Falha de validacao do dominio. A borda a traduz para VALIDACAO (400). */
export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function requireTitle(title: unknown): string {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new ValidationError('title', 'title is required');
  }
  return title.trim();
}

function requireStatus(status: unknown, validStatuses: readonly string[]): string {
  const defaultStatus = validStatuses[0];
  if (defaultStatus === undefined) {
    throw new ValidationError('status', 'config/domain.json:validStatuses is empty');
  }
  if (status === undefined) return defaultStatus;
  if (typeof status !== 'string' || !validStatuses.includes(status)) {
    throw new ValidationError('status', `status must be one of: ${validStatuses.join(', ')}`);
  }
  return status;
}

/**
 * Valida a entrada externa e devolve o registro do dominio.
 * O `hash` e o `createdAt` vem de fora (portas), nunca daqui — e o que mantem o dominio deterministico.
 */
export function buildRecord(
  input: NewEntry,
  validStatuses: readonly string[],
  hash: string,
  createdAt: string,
): Entry {
  return {
    hash,
    title: requireTitle(input.title),
    status: requireStatus(input.status, validStatuses),
    createdAt,
  };
}
