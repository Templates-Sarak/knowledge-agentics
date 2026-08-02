// Testes da listagem do modulo <modulo> — os TRES estados obrigatorios.
// A lei exige cobrir carregando, vazio e erro (doutrina/03-operacao.md §5): tela que so trata o
// caminho feliz e a origem mais comum de bug em producao.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import textos from '../../config/textos.json' with { type: 'json' };
import { Lista } from '../../web/src/pages/Lista.jsx';
import { listarRegistros } from '../../web/src/api-client/index.js';
import { registroDeExemplo } from '../fixtures/index.js';

vi.mock('../../web/src/api-client/index.js', () => ({ listarRegistros: vi.fn() }));

const listarMock = vi.mocked(listarRegistros);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function colecao(itens) {
  return { itens, pagina: 1, tamanho: 20, total: itens.length };
}

describe('Lista', () => {
  it('mostra o estado CARREGANDO antes da resposta', () => {
    listarMock.mockReturnValue(new Promise(() => undefined));
    render(<Lista />);
    expect(screen.getByText(textos.carregando)).toBeDefined();
  });

  it('mostra o estado VAZIO quando nao ha registro', async () => {
    listarMock.mockResolvedValue(colecao([]));
    render(<Lista />);
    await waitFor(() => expect(screen.getByText(textos.listaVazia)).toBeDefined());
  });

  it('mostra o estado ERRO quando a api falha', async () => {
    listarMock.mockRejectedValue(new Error('falhou'));
    render(<Lista />);
    await waitFor(() => expect(screen.getByText(textos.erroGenerico)).toBeDefined());
  });

  it('lista os registros no caminho feliz', async () => {
    listarMock.mockResolvedValue(colecao([registroDeExemplo({ titulo: 'Primeiro' })]));
    render(<Lista />);
    await waitFor(() => expect(screen.getByText('Primeiro')).toBeDefined());
  });

  it('nao expoe mensagem tecnica de erro ao usuario', async () => {
    listarMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1'));
    render(<Lista />);
    await waitFor(() => expect(screen.getByText(textos.erroGenerico)).toBeDefined());
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });
});
