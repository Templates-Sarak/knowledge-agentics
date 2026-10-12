// Estado da listagem do modulo <module>.
// O hook e dono dos TRES estados que toda tela precisa ter (specs/arquitetura/01-modulo.md §9.7):
// carregando, vazio e erro. Tela que so trata o caminho feliz reprova em revisao.
import { useEffect, useState } from 'react';

import { type Entry, listRecords } from '../api-client/index.js';
import { errorCodeOf } from '../api-client/labels.js';

export type Phase = 'loading' | 'ok' | 'empty' | 'error';

interface State {
  phase: Phase;
  entries: Entry[];
  total: number;
  errorCode: string | null;
}

const INITIAL: State = { phase: 'loading', entries: [], total: 0, errorCode: null };

export function useRecordList(page: number, pageSize: number): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let active = true;
    setState(INITIAL);

    listRecords(page, pageSize)
      .then((collection) => {
        if (!active) return;
        setState({
          phase: collection.items.length === 0 ? 'empty' : 'ok',
          entries: collection.items,
          total: collection.total,
          errorCode: null,
        });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setState({
          phase: 'error',
          entries: [],
          total: 0,
          errorCode: errorCodeOf(cause),
        });
      });

    return () => {
      active = false;
    };
  }, [page, pageSize]);

  return state;
}
