// @vitest-environment jsdom
// Testes da listagem do modulo <module> — os TRES estados obrigatorios.
// A lei exige cobrir carregando, vazio e erro (specs/arquitetura/03-operacao.md §5): tela que so trata o
// caminho feliz e a origem mais comum de bug em producao.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import texts from '../../config/texts.json';
import { List } from '../../web/src/pages/List.js';
import { listRecords } from '../../web/src/api-client/index.js';
import { recordExample } from '../fixtures/index.js';

vi.mock('../../web/src/api-client/index.js', () => ({ listRecords: vi.fn() }));

const listMock = vi.mocked(listRecords);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function collection(items: ReturnType<typeof recordExample>[]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}

describe('List', () => {
  it('shows the LOADING state before the response', () => {
    listMock.mockReturnValue(new Promise(() => undefined));
    render(<List />);
    expect(screen.getByText(texts.loading)).toBeDefined();
  });

  it('shows the EMPTY state when there is no entry', async () => {
    listMock.mockResolvedValue(collection([]));
    render(<List />);
    await waitFor(() => expect(screen.getByText(texts.emptyList)).toBeDefined());
  });

  it('shows the ERROR state when the api fails', async () => {
    listMock.mockRejectedValue(new Error('failed'));
    render(<List />);
    await waitFor(() => expect(screen.getByText(texts.genericError)).toBeDefined());
  });

  it('lists the entries on the happy path', async () => {
    listMock.mockResolvedValue(collection([recordExample({ title: 'First' })]));
    render(<List />);
    await waitFor(() => expect(screen.getByText('First')).toBeDefined());
  });

  it('translates an API error code to the Portuguese text', async () => {
    listMock.mockRejectedValue(Object.assign(new Error('entry not found'), { code: 'NOT_FOUND' }));
    render(<List />);
    await waitFor(() => expect(screen.getByText(texts.errorLabels.NOT_FOUND)).toBeDefined());
    expect(screen.queryByText('entry not found')).toBeNull();
  });

  it('shows the Portuguese label of the status, never the stored value', async () => {
    listMock.mockResolvedValue(collection([recordExample({ status: 'draft' })]));
    render(<List />);
    await waitFor(() => expect(screen.getByText(texts.statusLabels.draft)).toBeDefined());
    expect(screen.queryByText('draft')).toBeNull();
  });

  it('does not expose a technical error message to the user', async () => {
    listMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1'));
    render(<List />);
    await waitFor(() => expect(screen.getByText(texts.genericError)).toBeDefined());
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });
});
