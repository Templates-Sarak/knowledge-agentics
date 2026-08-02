// Primitiva visual do modulo <modulo>.
//
// ui.modo = "proprio": o modulo define suas primitivas AQUI e nao importa componente de outro
// modulo. Se o projeto usar ui.modo = "kit", troque o corpo por um componente de
// `packages/ui-kit` — a ARVORE nao muda, so a dependencia (ADR-007, specs/adr/000-decisoes-do-template.md).
import type { ReactNode } from 'react';

type Tom = 'neutro' | 'erro';

interface Props {
  tom?: Tom;
  children: ReactNode;
}

export function Aviso({ tom = 'neutro', children }: Props) {
  return (
    <p role={tom === 'erro' ? 'alert' : 'status'} data-tom={tom}>
      {children}
    </p>
  );
}
