// Testes de contrato do modulo <modulo> — cada rota do contrato/openapi.yaml.
// Cobre o que a lei exige (specs/arquitetura/03-operacao.md §5): rota declarada, auth NEGADA por padrao,
// e payload malformado rejeitado. Roda sobre HTTP real, com dubles de porta em memoria.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { criarApp } from '../../api/src/index.js';
import { criarAuth, criarDependencias, registroDeExemplo } from '../fixtures/index.js';

const ROTA_BASE = '/api/v1/<modulo>';
const TOKEN = 'token-de-teste';

let servidor;
let base;

beforeAll(async () => {
  const app = criarApp({
    deps: criarDependencias([registroDeExemplo()]),
    auth: criarAuth(['<modulo>:ler', '<modulo>:escrever'], TOKEN),
  });
  servidor = await new Promise((resolver) => {
    const criado = app.listen(0, () => resolver(criado));
  });
  base = `http://127.0.0.1:${servidor.address().port}${ROTA_BASE}`;
});

afterAll(async () => {
  await new Promise((resolver) => servidor.close(resolver));
});

function pedir(caminho, opcoes = {}) {
  return fetch(`${base}${caminho}`, {
    ...opcoes,
    headers: { 'content-type': 'application/json', ...(opcoes.headers ?? {}) },
  });
}

function autenticado(caminho, opcoes = {}) {
  return pedir(caminho, { ...opcoes, headers: { authorization: `Bearer ${TOKEN}`, ...(opcoes.headers ?? {}) } });
}

describe('rotas obrigatorias', () => {
  it('GET /health responde sem token', async () => {
    const resposta = await pedir('/health');
    expect(resposta.status).toBe(200);
    await expect(resposta.json()).resolves.toMatchObject({ ok: true });
  });

  it('GET /meta ecoa o manifesto', async () => {
    expect((await (await pedir('/meta')).json()).rotaBase).toBe(ROTA_BASE);
  });

  it('GET /resumo devolve a contagem', async () => {
    expect((await (await pedir('/resumo')).json()).total).toBe(1);
  });
});

describe('autenticacao — deny by default', () => {
  it('nega leitura sem token', async () => {
    const resposta = await pedir('/registros');
    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } });
  });

  it('nega token invalido', async () => {
    expect((await pedir('/registros', { headers: { authorization: 'Bearer errado' } })).status).toBe(401);
  });
});

describe('registros', () => {
  it('lista no envelope de colecao', async () => {
    const corpo = await (await autenticado('/registros')).json();
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.total).toBe(1);
  });

  it('devolve NAO_ENCONTRADO para hash inexistente', async () => {
    const resposta = await autenticado('/registros/00000');
    expect(resposta.status).toBe(404);
    await expect(resposta.json()).resolves.toMatchObject({ erro: { codigo: 'NAO_ENCONTRADO' } });
  });

  it('cria e devolve so os campos da projecao', async () => {
    const resposta = await autenticado('/registros', { method: 'POST', body: JSON.stringify({ titulo: 'Novo' }) });
    expect(resposta.status).toBe(201);
    expect(Object.keys(await resposta.json()).sort()).toEqual(['criadoEm', 'hash', 'status', 'titulo']);
  });

  it('REJEITA campo desconhecido em vez de ignorar', async () => {
    const resposta = await autenticado('/registros', {
      method: 'POST',
      body: JSON.stringify({ titulo: 'Novo', admin: true }),
    });
    expect(resposta.status).toBe(400);
    await expect(resposta.json()).resolves.toMatchObject({ erro: { codigo: 'VALIDACAO' } });
  });

  it('rejeita paginacao invalida', async () => {
    expect((await autenticado('/registros?pagina=0')).status).toBe(400);
  });

  it('rejeita tamanho acima do teto de config/api.json', async () => {
    expect((await autenticado('/registros?tamanho=9999')).status).toBe(400);
  });
});
