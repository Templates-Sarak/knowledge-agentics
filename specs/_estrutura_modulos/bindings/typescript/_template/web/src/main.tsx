// Entrada standalone do modulo <module> — FINA de proposito (ADR-007, specs/adr/000-decisoes-do-template.md).
//
// Este arquivo so monta a raiz JA exportada por `web/src/index.ts`. Nenhuma logica vive aqui:
// e o que permite ao mesmo modulo ser servido como SPA proprio E ser importado por um shell,
// sem duplicar tela nem bifurcar o template.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ModuleRoot } from './index.js';

const target = document.getElementById('root');
if (target === null) throw new Error('element #root not found in index.html');

createRoot(target).render(
  <StrictMode>
    <ModuleRoot />
  </StrictMode>,
);
