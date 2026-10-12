// Cliente da API do PROPRIO modulo <module>. Lei dona: specs/arquitetura/00-arquitetura.md §4.4.
//
// O front de um modulo fala EXCLUSIVAMENTE com /api/v1/<module>, por caminho RELATIVO na mesma
// origem. Nunca com o banco, nunca com a api de outro modulo — dado alheio e responsabilidade da
// api/ deste modulo, via core/gateways/. Caminho relativo tambem evita URL literal no bundle.

const BASE_ROUTE = '/api/v1/<module>';

/**
 * Erro da API com o CODIGO estavel do envelope. A mensagem da API e em ingles e e para quem depura:
 * quem fala com o usuario e o front, que traduz o codigo por `config/texts.json:errorLabels`.
 */
export class ApiClientError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_ROUTE}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiClientError(
      body.error?.code ?? 'INTERNAL',
      body.error?.message ?? `HTTP ${response.status}`,
    );
  }
  return response.json();
}

export function listRecords(page, pageSize) {
  return request(`/entries?page=${page}&pageSize=${pageSize}`);
}

export function getRecord(hash) {
  return request(`/entries/${encodeURIComponent(hash)}`);
}
