// Cliente da API do PROPRIO modulo <module>. Lei dona: specs/arquitetura/00-arquitetura.md §4.4.
//
// O front de um modulo fala EXCLUSIVAMENTE com /api/v1/<module>, por caminho RELATIVO na mesma
// origem. Nunca com o banco, nunca com a api de outro modulo — dado alheio e responsabilidade da
// api/ deste modulo, via core/gateways/. Caminho relativo tambem evita URL literal no bundle.

const BASE_ROUTE = '/api/v1/<module>';

export interface Entry {
  hash: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface Collection {
  items: Entry[];
  page: number;
  pageSize: number;
  total: number;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

/**
 * Erro da API com o CODIGO estavel do envelope. A mensagem da API e em ingles e e para quem depura:
 * quem fala com o usuario e o front, que traduz o codigo por `config/texts.json:errorLabels`.
 */
export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_ROUTE}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorEnvelope;
    throw new ApiClientError(
      body.error?.code ?? 'INTERNAL',
      body.error?.message ?? `HTTP ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export function listRecords(page: number, pageSize: number): Promise<Collection> {
  return request<Collection>(`/entries?page=${page}&pageSize=${pageSize}`);
}

export function getRecord(hash: string): Promise<Entry> {
  return request<Entry>(`/entries/${encodeURIComponent(hash)}`);
}
