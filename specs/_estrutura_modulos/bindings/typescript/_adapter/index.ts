// Adapter <provider> para a porta "<port>". Lei dona: specs/arquitetura/01-modulo.md §5.2.
//
// Gerado por `create-adapter.mjs` a partir deste molde. Implemente aqui os metodos da interface
// da porta "<port>" (packages/ports/index.ts) — o TODO abaixo e o unico lugar que falta.
//
// Adapter NAO conhece dominio: nao existe `if (module === 'catalog')` aqui dentro.

/**
 * TODO: troque `Record<string, unknown>` pela interface real da porta "<port>"
 * (packages/ports/index.ts) depois de implementar os metodos dela aqui.
 */
export function createAdapter(): Record<string, unknown> {
  throw new Error('TODO: implement the methods of port "<port>" in adapters/<provider-folder>/index.ts');
}
