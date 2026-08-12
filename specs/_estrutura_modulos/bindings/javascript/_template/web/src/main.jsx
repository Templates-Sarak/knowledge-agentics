// Entrada standalone do modulo <modulo> — FINA de proposito (ADR-007, specs/adr/000-decisoes-do-template.md).
//
// Este arquivo so monta a raiz JA exportada por `web/src/index.js`. Nenhuma logica vive aqui:
// e o que permite ao mesmo modulo ser servido como SPA proprio E ser importado por um shell,
// sem duplicar tela nem bifurcar o template.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RaizDoModulo } from './index.js';

const alvo = document.getElementById('root');
if (alvo === null) throw new Error('elemento #raiz nao encontrado em index.html');

createRoot(alvo).render(
  <StrictMode>
    <RaizDoModulo />
  </StrictMode>,
);
