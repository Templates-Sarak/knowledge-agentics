// Rotulos do front do modulo <module>: valor armazenado e codigo de erro viram texto em portugues.
// Lei dona: o dado e em ingles (ADR-023, decisoes 1 e 3); o texto ao usuario mora em
// config/texts.json (specs/arquitetura/01-modulo.md §4.1) — esta e a unica ponte entre os dois.

/**
 * Rotulo de um VALOR armazenado (config/domain.json). Valor sem rotulo declarado aparece como veio.
 * @param {Readonly<Record<string, string>>} labels
 * @param {string} status
 * @returns {string}
 */
export function statusLabel(labels, status) {
  return labels[status] ?? status;
}

/**
 * O codigo que um erro carrega, ou `null`. Duck typing de proposito: o cliente pode estar trocado por mock.
 * @param {unknown} cause
 * @returns {string | null}
 */
export function errorCodeOf(cause) {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return null;
  const { code } = /** @type {{ code: unknown }} */ (cause);
  return typeof code === 'string' ? code : null;
}

/**
 * Texto de um CODIGO de erro da API. Sem codigo, ou codigo sem rotulo: o texto generico — nunca a
 * mensagem tecnica.
 * @param {Readonly<Record<string, string>>} labels
 * @param {string | null} code
 * @param {string} generic
 * @returns {string}
 */
export function errorText(labels, code, generic) {
  return (code === null ? undefined : labels[code]) ?? generic;
}
