// Primitiva visual do modulo <module>.
//
// ui.mode = "own": o modulo define suas primitivas AQUI e nao importa componente de outro
// modulo. Se o projeto usar ui.mode = "kit", troque o corpo por um componente de
// `packages/ui-kit` — a ARVORE nao muda, so a dependencia (ADR-007, specs/adr/000-decisoes-do-template.md).

export function Notice({ tone = 'neutral', children }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} data-tone={tone}>
      {children}
    </p>
  );
}
