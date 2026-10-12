// Listagem do modulo <module>.
// Os TRES estados sao obrigatorios e testados (specs/arquitetura/03-operacao.md §5).
// Nenhum texto literal: todo rotulo vem de config/texts.json (specs/arquitetura/01-modulo.md §4.1).
import texts from '../../../config/texts.json' with { type: 'json' };
import { errorText, statusLabel } from '../api-client/labels.js';
import { Notice } from '../components/Notice.jsx';
import { useRecordList } from '../hooks/useRecordList.js';

const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 20;

export function List() {
  const state = useRecordList(INITIAL_PAGE, INITIAL_PAGE_SIZE);

  if (state.phase === 'loading') return <Notice>{texts.loading}</Notice>;
  if (state.phase === 'error') {
    return <Notice tone="error">{errorText(texts.errorLabels, state.errorCode, texts.genericError)}</Notice>;
  }
  if (state.phase === 'empty') return <Notice>{texts.emptyList}</Notice>;

  return (
    <section>
      <h1>{texts.title}</h1>
      <ul>
        {state.entries.map((entry) => (
          <li key={entry.hash}>
            <a href={`/<module>/${entry.hash}`}>{entry.title}</a>
            <span>{statusLabel(texts.statusLabels, entry.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
