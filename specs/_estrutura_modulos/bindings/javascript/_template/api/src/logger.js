// Logger estruturado do modulo <modulo>. Lei dona: specs/arquitetura/03-operacao.md §3.
//
// Uma linha JSON por evento, com requestId. Campos de `camposSensiveis` sao redigidos AQUI —
// nao e responsabilidade de quem chama lembrar. `console.*` e proibido no modulo (regra `log`);
// a saida vai por process.stdout, que e o unico canal do logger.

const NIVEIS = ['debug', 'info', 'warn', 'error'];
const REDIGIDO = '[REDIGIDO]';
const PROFUNDIDADE_MAXIMA = 4;

/** Substitui recursivamente o valor de todo campo sensivel. */
function redact(valor, sensiveis, profundidade = 0) {
  if (profundidade > PROFUNDIDADE_MAXIMA || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((item) => redact(item, sensiveis, profundidade + 1));

  const saida = {};
  for (const [chave, conteudo] of Object.entries(valor)) {
    saida[chave] = sensiveis.has(chave) ? REDIGIDO : redact(conteudo, sensiveis, profundidade + 1);
  }
  return saida;
}

/**
 * @param {{ modulo: string, nivelMinimo: string, camposSensiveis: string[] }} opcoes
 */
export function createLogger({ modulo, nivelMinimo, camposSensiveis }) {
  const sensiveis = new Set(camposSensiveis);
  const minimo = NIVEIS.indexOf(nivelMinimo);

  const emit = (nivel, mensagem, dados) => {
    if (NIVEIS.indexOf(nivel) < minimo) return;
    const linha = { nivel, modulo, mensagem, ...redact(dados ?? {}, sensiveis) };
    process.stdout.write(`${JSON.stringify(linha)}\n`);
  };

  return {
    debug: (mensagem, dados) => emit('debug', mensagem, dados),
    info: (mensagem, dados) => emit('info', mensagem, dados),
    warn: (mensagem, dados) => emit('warn', mensagem, dados),
    error: (mensagem, dados) => emit('error', mensagem, dados),
  };
}
