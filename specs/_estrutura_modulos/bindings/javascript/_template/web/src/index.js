// Superficie publica do front do modulo <modulo>. Lei dona: ADR-007 (specs/adr/000-decisoes-do-template.md).
//
// O web/ e SEMPRE um pacote que exporta suas paginas. Isso permite os dois modelos de composicao
// sobre a MESMA estrutura:
//   - shell unico: importa `@<escopo>/<modulo>-web` e monta as paginas na navegacao dele;
//   - SPA por modulo: `web/src/main.jsx` monta a mesma raiz, servida sob /<modulo>.
//
// Nada aqui conhece o shell. Um modulo nunca importa pagina de outro modulo.
export { Lista } from './pages/Lista.jsx';
export { Aviso } from './components/Aviso.jsx';
export { useListaDeRegistros } from './hooks/useListaDeRegistros.js';

/** Raiz do modulo. E o que o shell monta, e o que `main.jsx` renderiza. */
export { Lista as RaizDoModulo } from './pages/Lista.jsx';
