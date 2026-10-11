// Testes de contrato do modulo <module> — cada rota do contract/openapi.yaml.
// Cobre o que a lei exige (specs/arquitetura/03-operacao.md §5): rota declarada, auth NEGADA por padrao,
// e payload malformado rejeitado. Roda sobre o app REAL (Express) com adapters de memoria, SEM socket:
// `light-my-request` entrega a requisicao ao app em processo. Antes cada teste abria uma conexao TCP de
// loopback (`app.listen(0)` + `fetch`) — num host que perde SYN de loopback (medido: `connect ETIMEDOUT
// 127.0.0.1`, 1 em cada 3 rodadas completas do autoteste) o teste reprovava por rede, nao por contrato.
import inject from 'light-my-request';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../api/src/index.js';
import { createAuth, createDependencies, recordExample } from '../fixtures/index.js';

const ROTA_BASE = '/api/v1/<module>';
const CREDENCIAL_DE_TESTE = 'token-de-teste';

const app = createApp({
  deps: createDependencies([recordExample()]),
  auth: createAuth(['<module>:ler', '<module>:escrever'], CREDENCIAL_DE_TESTE),
});

interface Opcoes {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

async function request(caminho: string, opcoes: Opcoes = {}) {
  const resposta = await inject(app, {
    method: (opcoes.method ?? 'GET') as 'GET' | 'POST',
    url: `${ROTA_BASE}${caminho}`,
    headers: { 'content-type': 'application/json', ...(opcoes.headers ?? {}) },
    payload: opcoes.body,
  });
  return { status: resposta.statusCode, json: async (): Promise<unknown> => resposta.json() };
}

function authenticated(caminho: string, opcoes: Opcoes = {}) {
  return request(caminho, {
    ...opcoes,
    headers: { authorization: `Bearer ${CREDENCIAL_DE_TESTE}`, ...(opcoes.headers ?? {}) },
  });
}

describe('rotas obrigatorias', () => {
  it('GET /health responde sem token', async () => {
    const resposta = await request('/health');
    expect(resposta.status).toBe(200);
    await expect(resposta.json()).resolves.toMatchObject({ ok: true });
  });

  it('GET /meta ecoa o manifesto', async () => {
    const corpo = (await (await request('/meta')).json()) as { basePath: string };
    expect(corpo.basePath).toBe(ROTA_BASE);
  });

  it('GET /resumo devolve a contagem', async () => {
    const corpo = (await (await request('/resumo')).json()) as { total: number };
    expect(corpo.total).toBe(1);
  });
});

describe('autenticacao — deny by default', () => {
  it('nega leitura sem token', async () => {
    const resposta = await request('/registros');
    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } });
  });

  it('nega token invalido', async () => {
    const resposta = await request('/registros', { headers: { authorization: 'Bearer errado' } });
    expect(resposta.status).toBe(401);
  });
});

describe('registros', () => {
  it('lista no envelope de colecao', async () => {
    const corpo = (await (await authenticated('/registros')).json()) as { itens: unknown[]; total: number };
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.total).toBe(1);
  });

  it('devolve NAO_ENCONTRADO para hash inexistente', async () => {
    const resposta = await authenticated('/registros/00000');
    expect(resposta.status).toBe(404);
    await expect(resposta.json()).resolves.toMatchObject({ erro: { codigo: 'NAO_ENCONTRADO' } });
  });

  it('cria e devolve so os campos da projecao', async () => {
    const resposta = await authenticated('/registros', {
      method: 'POST',
      body: JSON.stringify({ titulo: 'Novo' }),
    });
    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as Record<string, unknown>;
    expect(Object.keys(corpo).sort()).toEqual(['criadoEm', 'hash', 'status', 'titulo']);
  });

  it('REJEITA campo desconhecido em vez de ignorar', async () => {
    const resposta = await authenticated('/registros', {
      method: 'POST',
      body: JSON.stringify({ titulo: 'Novo', admin: true }),
    });
    expect(resposta.status).toBe(400);
    await expect(resposta.json()).resolves.toMatchObject({ erro: { codigo: 'VALIDACAO' } });
  });

  it('rejeita paginacao invalida', async () => {
    expect((await authenticated('/registros?pagina=0')).status).toBe(400);
  });

  it('rejeita tamanho acima do teto de config/api.json', async () => {
    expect((await authenticated('/registros?tamanho=9999')).status).toBe(400);
  });
});
