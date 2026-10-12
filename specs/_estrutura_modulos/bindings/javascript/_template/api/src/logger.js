// Logger estruturado do modulo <module>. Lei dona: specs/arquitetura/03-operacao.md §3.
//
// Uma linha JSON por evento, com requestId. Campos de `sensitiveFields` sao redigidos AQUI —
// nao e responsabilidade de quem chama lembrar. `console.*` e proibido no modulo (regra `log`);
// a saida vai por process.stdout, que e o unico canal do logger.

const LEVELS = ['debug', 'info', 'warn', 'error'];
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 4;

/** Substitui recursivamente o valor de todo campo sensivel. */
function redact(value, sensitive, depth = 0) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, sensitive, depth + 1));

  const output = {};
  for (const [key, content] of Object.entries(value)) {
    output[key] = sensitive.has(key) ? REDACTED : redact(content, sensitive, depth + 1);
  }
  return output;
}

/**
 * @param {{ module: string, minLevel: string, sensitiveFields: string[] }} options
 */
export function createLogger({ module, minLevel, sensitiveFields }) {
  const sensitive = new Set(sensitiveFields);
  const minimum = LEVELS.indexOf(minLevel);

  const emit = (level, message, data) => {
    if (LEVELS.indexOf(level) < minimum) return;
    const line = { level, module, message, ...redact(data ?? {}, sensitive) };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  };

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  };
}
