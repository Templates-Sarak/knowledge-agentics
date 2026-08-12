// Estado da listagem do modulo <modulo>.
// O hook e dono dos TRES estados que toda tela precisa ter (specs/arquitetura/01-modulo.md §9.7):
// carregando, vazio e erro. Tela que so trata o caminho feliz reprova em revisao.
import { useEffect, useState } from 'react';

import { type Registro, listRecords } from '../api-client/index.js';

export type Situacao = 'carregando' | 'ok' | 'vazio' | 'erro';

interface Estado {
  situacao: Situacao;
  registros: Registro[];
  total: number;
  mensagemDeErro: string | null;
}

const INICIAL: Estado = { situacao: 'carregando', registros: [], total: 0, mensagemDeErro: null };

export function useRecordList(pagina: number, tamanho: number): Estado {
  const [state, setState] = useState<Estado>(INICIAL);

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
      .catch((causa: unknown) => {
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
