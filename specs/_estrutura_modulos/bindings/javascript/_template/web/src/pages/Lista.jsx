// Listagem do modulo <modulo>.
// Os TRES estados sao obrigatorios e testados (specs/arquitetura/03-operacao.md §5).
// Nenhum texto literal: todo rotulo vem de config/textos.json (specs/arquitetura/01-modulo.md §4.1).
import textos from '../../../config/textos.json' with { type: 'json' };
import { Aviso } from '../components/Aviso.jsx';
import { useListaDeRegistros } from '../hooks/useListaDeRegistros.js';

const PAGINA_INICIAL = 1;
const TAMANHO_INICIAL = 20;

export function Lista() {
  const estado = useListaDeRegistros(PAGINA_INICIAL, TAMANHO_INICIAL);

  if (estado.situacao === 'carregando') return <Aviso>{textos.carregando}</Aviso>;
  if (estado.situacao === 'erro') return <Aviso tom="erro">{textos.erroGenerico}</Aviso>;
  if (estado.situacao === 'vazio') return <Aviso>{textos.listaVazia}</Aviso>;

  return (
    <section>
      <h1>{textos.titulo}</h1>
      <ul>
        {estado.registros.map((registro) => (
          <li key={registro.hash}>
            <a href={`/<modulo>/${registro.hash}`}>{registro.titulo}</a>
            <span>{registro.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
