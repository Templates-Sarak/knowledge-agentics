// Logger estruturado do modulo <modulo>. Lei dona: specs/arquitetura/03-operacao.md §3.
//
// Uma linha JSON por evento, com requestId. Campos de `camposSensiveis` sao redigidos AQUI —
// nao e responsabilidade de quem chama lembrar. `console.*` e proibido no modulo (regra `log`);
// a saida vai por process.stdout, que e o unico canal do logger.

const NIVEIS = ['debug', 'info', 'warn', 'error'] as const;
export type Nivel = (typeof NIVEIS)[number];

export interface Logger {
  debug(mensagem: string, dados?: Record<string, unknown>): void;
  info(mensagem: string, dados?: Record<string, unknown>): void;
  warn(mensagem: string, dados?: Record<string, unknown>): void;
  error(mensagem: string, dados?: Record<string, unknown>): void;
}

interface OpcoesLogger {
  modulo: string;
  nivelMinimo: Nivel;
  camposSensiveis: string[];
}

const REDIGIDO = '[REDIGIDO]';

/** Substitui recursivamente o valor de todo campo sensivel. Profundidade limitada por seguranca. */
function redact(valor: unknown, sensiveis: Set<string>, profundidade = 0): unknown {
  if (profundidade > 4 || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((item) => redact(item, sensiveis, profundidade + 1));

  const saida: Record<string, unknown> = {};
  for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
    saida[chave] = sensiveis.has(chave) ? REDIGIDO : redact(conteudo, sensiveis, profundidade + 1);
  }
  return saida;
}

export function createLogger({ modulo, nivelMinimo, camposSensiveis }: OpcoesLogger): Logger {
  const sensiveis = new Set(camposSensiveis);
  const minimo = NIVEIS.indexOf(nivelMinimo);

  const emit = (nivel: Nivel, mensagem: string, dados?: Record<string, unknown>): void => {
    if (NIVEIS.indexOf(nivel) < minimo) return;
    const linha = { nivel, modulo, mensagem, ...(redact(dados ?? {}, sensiveis) as object) };
    process.stdout.write(`${JSON.stringify(linha)}\n`);
  };

  return {
    debug: (mensagem, dados) => emit('debug', mensagem, dados),
    info: (mensagem, dados) => emit('info', mensagem, dados),
    warn: (mensagem, dados) => emit('warn', mensagem, dados),
    error: (mensagem, dados) => emit('error', mensagem, dados),
  };
}
