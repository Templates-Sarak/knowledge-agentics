// Estado da listagem do modulo <modulo>.
// O hook e dono dos TRES estados que toda tela precisa ter (specs/arquitetura/01-modulo.md §9.7):
// carregando, vazio e erro. Tela que so trata o caminho feliz reprova em revisao.
import { useEffect, useState } from 'react';

import { listRecords } from '../api-client/index.js';

/**
 * @typedef {'carregando' | 'ok' | 'vazio' | 'erro'} Situacao
 *
 * @typedef {object} Estado
 * @property {Situacao} situacao
 * @property {import('../../../core/domain/index.js').Registro[]} registros
 * @property {number} total
 * @property {string | null} mensagemDeErro
 */

/** @type {Estado} */
const INICIAL = { situacao: 'carregando', registros: [], total: 0, mensagemDeErro: null };

/**
 * @param {number} pagina
 * @param {number} tamanho
 * @returns {Estado}
 */
export function useRecordList(pagina, tamanho) {
  const [state, setState] = useState(INICIAL);

  useEffect(() => {
    let ativo = true;
    setState(INICIAL);

    listRecords(pagina, tamanho)
      .then((collection) => {
        if (!ativo) return;
        setState({
          situacao: collection.itens.length === 0 ? 'vazio' : 'ok',
          registros: collection.itens,
          total: collection.total,
          mensagemDeErro: null,
        });
      })
      .catch((causa) => {
        if (!ativo) return;
        setState({
          situacao: 'erro',
          registros: [],
          total: 0,
          mensagemDeErro: causa instanceof Error ? causa.message : String(causa),
        });
      });

    return () => {
      ativo = false;
    };
  }, [pagina, tamanho]);

  return state;
}
