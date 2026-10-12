// Logger estruturado do modulo <module>. Lei dona: specs/arquitetura/03-operacao.md §3.
//
// Uma linha JSON por evento, com requestId. Campos de `sensitiveFields` sao redigidos AQUI —
// nao e responsabilidade de quem chama lembrar. `console.*` e proibido no modulo (regra `log`);
// a saida vai por process.stdout, que e o unico canal do logger.

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type Level = (typeof LEVELS)[number];

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

interface LoggerOptions {
  module: string;
  minLevel: Level;
  sensitiveFields: string[];
}

const REDACTED = '[REDACTED]';

/** Substitui recursivamente o valor de todo campo sensivel. Profundidade limitada por seguranca. */
function redact(value: unknown, sensitive: Set<string>, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, sensitive, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, content] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sensitive.has(key) ? REDACTED : redact(content, sensitive, depth + 1);
  }
  return output;
}

export function createLogger({ module, minLevel, sensitiveFields }: LoggerOptions): Logger {
  const sensitive = new Set(sensitiveFields);
  const minimum = LEVELS.indexOf(minLevel);

  const emit = (level: Level, message: string, data?: Record<string, unknown>): void => {
    if (LEVELS.indexOf(level) < minimum) return;
    const line = { level, module, message, ...(redact(data ?? {}, sensitive) as object) };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  };

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  };
}
