// Estado da listagem do modulo <module>.
// O hook e dono dos TRES estados que toda tela precisa ter (specs/arquitetura/01-modulo.md §9.7):
// carregando, vazio e erro. Tela que so trata o caminho feliz reprova em revisao.
import { useEffect, useState } from 'react';

import { listRecords } from '../api-client/index.js';
import { errorCodeOf } from '../api-client/labels.js';

/**
 * @typedef {'loading' | 'ok' | 'empty' | 'error'} Phase
 *
 * @typedef {object} State
 * @property {Phase} phase
 * @property {import('../../../core/domain/index.js').Entry[]} entries
 * @property {number} total
 * @property {string | null} errorCode
 */

/** @type {State} */
const INITIAL = { phase: 'loading', entries: [], total: 0, errorCode: null };

/**
 * @param {number} page
 * @param {number} pageSize
 * @returns {State}
 */
export function useRecordList(page, pageSize) {
  const [state, setState] = useState(INITIAL);

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
      .catch((cause) => {
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
