// Superficie publica do front do modulo <module>. Lei dona: ADR-007 (specs/adr/000-decisoes-do-template.md).
//
// O web/ e SEMPRE um pacote que exporta suas paginas. Isso permite os dois modelos de composicao
// sobre a MESMA estrutura:
//   - shell unico: importa `@<scope>/<module>-web` e monta as paginas na navegacao dele;
//   - SPA por modulo: `web/main.tsx` monta a mesma raiz, servida sob /<module>.
//
// Nada aqui conhece o shell. Um modulo nunca importa pagina de outro modulo.
export { List } from './pages/List.js';
export { Notice } from './components/Notice.js';
export { useRecordList } from './hooks/useRecordList.js';
export type { Collection, Entry } from './api-client/index.js';
export { errorText, statusLabel } from './api-client/labels.js';

/** Raiz do modulo. E o que o shell monta, e o que `main.tsx` renderiza. */
export { List as ModuleRoot } from './pages/List.js';
