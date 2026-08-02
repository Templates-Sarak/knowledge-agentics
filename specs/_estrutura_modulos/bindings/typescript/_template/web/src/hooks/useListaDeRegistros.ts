// Estado da listagem do modulo <modulo>.
// O hook e dono dos TRES estados que toda tela precisa ter (doutrina/01-modulo.md §9.7):
// carregando, vazio e erro. Tela que so trata o caminho feliz reprova em revisao.
import { useEffect, useState } from 'react';

import { type Registro, listarRegistros } from '../api-client/index.js';

export type Situacao = 'carregando' | 'ok' | 'vazio' | 'erro';

interface Estado {
  situacao: Situacao;
  registros: Registro[];
  total: number;
  mensagemDeErro: string | null;
}

const INICIAL: Estado = { situacao: 'carregando', registros: [], total: 0, mensagemDeErro: null };

export function useListaDeRegistros(pagina: number, tamanho: number): Estado {
  const [estado, setEstado] = useState<Estado>(INICIAL);

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
      .catch((causa: unknown) => {
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
