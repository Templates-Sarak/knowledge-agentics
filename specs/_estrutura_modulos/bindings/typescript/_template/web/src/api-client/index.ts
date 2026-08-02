// Cliente da API do PROPRIO modulo <modulo>. Lei dona: doutrina/00-arquitetura.md §4.4.
//
// O front de um modulo fala EXCLUSIVAMENTE com /api/v1/<modulo>, por caminho RELATIVO na mesma
// origem. Nunca com o banco, nunca com a api de outro modulo — dado alheio e responsabilidade da
// api/ deste modulo, via core/gateways/. Caminho relativo tambem evita URL literal no bundle.

const ROTA_BASE = '/api/v1/<modulo>';

export interface Registro {
  hash: string;
  titulo: string;
  status: string;
  criadoEm: string;
}

export interface Colecao {
  itens: Registro[];
  pagina: number;
  tamanho: number;
  total: number;
}

interface EnvelopeErro {
  erro?: { codigo?: string; mensagem?: string };
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`${ROTA_BASE}${caminho}`, {
    ...opcoes,
    headers: { 'content-type': 'application/json', ...(opcoes.headers ?? {}) },
  });

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => ({}))) as EnvelopeErro;
    throw new Error(corpo.erro?.mensagem ?? `HTTP ${resposta.status}`);
  }
  return (await resposta.json()) as T;
}

export function listarRegistros(pagina: number, tamanho: number): Promise<Colecao> {
  return pedir<Colecao>(`/registros?pagina=${pagina}&tamanho=${tamanho}`);
}

export function obterRegistro(hash: string): Promise<Registro> {
  return pedir<Registro>(`/registros/${encodeURIComponent(hash)}`);
}
