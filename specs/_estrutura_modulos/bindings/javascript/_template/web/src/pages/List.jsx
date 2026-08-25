// Listagem do modulo <module>.
// Os TRES estados sao obrigatorios e testados (specs/arquitetura/03-operacao.md §5).
// Nenhum texto literal: todo rotulo vem de config/texts.json (specs/arquitetura/01-modulo.md §4.1).
import textos from '../../../config/texts.json' with { type: 'json' };
import { Notice } from '../components/Notice.jsx';
import { useRecordList } from '../hooks/useRecordList.js';

const PAGINA_INICIAL = 1;
const TAMANHO_INICIAL = 20;

export function List() {
  const state = useRecordList(PAGINA_INICIAL, TAMANHO_INICIAL);

  if (state.situacao === 'carregando') return <Notice>{textos.loading}</Notice>;
  if (state.situacao === 'erro') return <Notice tom="erro">{textos.genericError}</Notice>;
  if (state.situacao === 'vazio') return <Notice>{textos.emptyList}</Notice>;

  return (
    <section>
      <h1>{textos.title}</h1>
      <ul>
        {state.registros.map((registro) => (
          <li key={registro.hash}>
            <a href={`/<module>/${registro.hash}`}>{registro.titulo}</a>
            <span>{registro.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
