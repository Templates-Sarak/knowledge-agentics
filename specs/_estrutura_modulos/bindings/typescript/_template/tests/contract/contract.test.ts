// Testes de contrato do modulo <modulo> — cada rota do contract/openapi.yaml.
// Cobre o que a lei exige (specs/arquitetura/03-operacao.md §5): rota declarada, auth NEGADA por padrao,
// e payload malformado rejeitado. Roda sobre HTTP real, com adapters de memoria.
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../api/src/index.js';
import { createAuth, createDependencies, recordExample } from '../fixtures/index.js';

const ROTA_BASE = '/api/v1/<modulo>';
const CREDENCIAL_DE_TESTE = 'token-de-teste';

let servidor: Server;
let base: string;

beforeAll(async () => {
  const app = createApp({
    deps: createDependencies([recordExample()]),
    auth: createAuth(['<modulo>:ler', '<modulo>:escrever'], CREDENCIAL_DE_TESTE),
  });
  servidor = await new Promise<Server>((resolve) => {
    const criado = app.listen(0, () => resolve(criado));
  });
  const endereco = servidor.address();
  const porta = typeof endereco === 'object' && endereco !== null ? endereco.port : 0;
  base = `http://127.0.0.1:${porta}${ROTA_BASE}`;
});

afterAll(async () => {
  await new Promise((resolve) => servidor.close(resolve));
});

function request(caminho: string, opcoes: RequestInit = {}) {
  return fetch(`${base}${caminho}`, {
    ...opcoes,
    headers: { 'content-type': 'application/json', ...(opcoes.headers ?? {}) },
  });
}

function authenticated(caminho: string, opcoes: RequestInit = {}) {
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
    const corpo = (await (await request('/meta')).json()) as { rotaBase: string };
    expect(corpo.rotaBase).toBe(ROTA_BASE);
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
