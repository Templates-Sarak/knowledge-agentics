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

const BASE_ROUTE = '/api/v1/<module>';
const TEST_CREDENTIAL = 'test-token';

const app = createApp({
  deps: createDependencies([recordExample()]),
  auth: createAuth(['<module>:read', '<module>:write'], TEST_CREDENTIAL),
});

async function request(path, options = {}) {
  const response = await inject(app, {
    method: options.method ?? 'GET',
    url: `${BASE_ROUTE}${path}`,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    payload: options.body,
  });
  return { status: response.statusCode, json: async () => response.json() };
}

function authenticated(path, options = {}) {
  return request(path, {
    ...options,
    headers: { authorization: `Bearer ${TEST_CREDENTIAL}`, ...(options.headers ?? {}) },
  });
}

describe('required routes', () => {
  it('GET /health answers without a token', async () => {
    const response = await request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it('GET /meta echoes the manifest', async () => {
    expect((await (await request('/meta')).json()).basePath).toBe(BASE_ROUTE);
  });

  it('GET /summary returns the count', async () => {
    expect((await (await request('/summary')).json()).total).toBe(1);
  });
});

describe('authentication — deny by default', () => {
  it('denies read without a token', async () => {
    const response = await request('/entries');
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('denies an invalid token', async () => {
    expect((await request('/entries', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
  });
});

describe('entries', () => {
  it('lists in the collection envelope', async () => {
    const body = await (await authenticated('/entries')).json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('returns NOT_FOUND for an unknown hash', async () => {
    const response = await authenticated('/entries/00000');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('creates and returns only the projection fields', async () => {
    const response = await authenticated('/entries', {
      method: 'POST',
      body: JSON.stringify({ title: 'New' }),
    });
    expect(response.status).toBe(201);
    expect(Object.keys(await response.json()).sort()).toEqual(['createdAt', 'hash', 'status', 'title']);
  });

  it('REJECTS an unknown field instead of ignoring it', async () => {
    const response = await authenticated('/entries', {
      method: 'POST',
      body: JSON.stringify({ title: 'New', admin: true }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('rejects invalid pagination', async () => {
    expect((await authenticated('/entries?page=0')).status).toBe(400);
  });

  it('rejects a page size above the cap in config/api.json', async () => {
    expect((await authenticated('/entries?pageSize=9999')).status).toBe(400);
  });
});
