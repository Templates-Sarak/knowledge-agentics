// Estado da listagem do modulo <modulo>.
// O hook e dono dos TRES estados que toda tela precisa ter (specs/arquitetura/01-modulo.md §9.7):
// carregando, vazio e erro. Tela que so trata o caminho feliz reprova em revisao.
import { useEffect, useState } from 'react';

import { listarRegistros } from '../api-client/index.js';

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
export function useListaDeRegistros(pagina, tamanho) {
  const [estado, setEstado] = useState(INICIAL);

  useEffect(() => {
    let ativo = true;
    setEstado(INICIAL);

    listarRegistros(pagina, tamanho)
      .then((colecao) => {
        if (!ativo) return;
        setEstado({
          situacao: colecao.itens.length === 0 ? 'vazio' : 'ok',
          registros: colecao.itens,
          total: colecao.total,
          mensagemDeErro: null,
        });
      })
      .catch((causa) => {
        if (!ativo) return;
        setEstado({
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

  return estado;
}
