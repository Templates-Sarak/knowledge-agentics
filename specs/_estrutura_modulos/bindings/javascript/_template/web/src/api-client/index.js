// Cliente da API do PROPRIO modulo <modulo>. Lei dona: specs/arquitetura/00-arquitetura.md §4.4.
//
// O front de um modulo fala EXCLUSIVAMENTE com /api/v1/<modulo>, por caminho RELATIVO na mesma
// origem. Nunca com o banco, nunca com a api de outro modulo — dado alheio e responsabilidade da
// api/ deste modulo, via core/gateways/. Caminho relativo tambem evita URL literal no bundle.

const ROTA_BASE = '/api/v1/<modulo>';

async function pedir(caminho, opcoes = {}) {
  const resposta = await fetch(`${ROTA_BASE}${caminho}`, {
    ...opcoes,
    headers: { 'content-type': 'application/json', ...(opcoes.headers ?? {}) },
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro?.mensagem ?? `HTTP ${resposta.status}`);
  }
  return resposta.json();
}

export function listarRegistros(pagina, tamanho) {
  return pedir(`/registros?pagina=${pagina}&tamanho=${tamanho}`);
}

export function obterRegistro(hash) {
  return pedir(`/registros/${encodeURIComponent(hash)}`);
}
