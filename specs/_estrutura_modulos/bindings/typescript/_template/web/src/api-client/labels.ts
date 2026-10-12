// Rotulos do front do modulo <module>: valor armazenado e codigo de erro viram texto em portugues.
// Lei dona: o dado e em ingles (ADR-023, decisoes 1 e 3); o texto ao usuario mora em
// config/texts.json (specs/arquitetura/01-modulo.md §4.1) — esta e a unica ponte entre os dois.

/** Rotulo de um VALOR armazenado (config/domain.json). Valor sem rotulo declarado aparece como veio. */
export function statusLabel(labels: Readonly<Record<string, string>>, status: string): string {
  return labels[status] ?? status;
}

/** O codigo que um erro carrega, ou `null`. Duck typing de proposito: o cliente pode estar trocado por mock. */
export function errorCodeOf(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return null;
  const { code } = cause as { code: unknown };
  return typeof code === 'string' ? code : null;
}

/** Texto de um CODIGO de erro da API. Sem codigo, ou codigo sem rotulo: o texto generico — nunca a mensagem tecnica. */
export function errorText(
  labels: Readonly<Record<string, string>>,
  code: string | null,
  generic: string,
): string {
  return (code === null ? undefined : labels[code]) ?? generic;
}
