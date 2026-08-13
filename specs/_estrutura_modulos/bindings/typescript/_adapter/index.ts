// Adapter <provedor> para a porta "<porta>". Lei dona: specs/arquitetura/01-modulo.md §5.2.
//
// Gerado por `create-adapter.mjs` a partir deste molde. Implemente aqui os metodos da interface
// da porta "<porta>" (packages/ports/index.ts) — o TODO abaixo e o unico lugar que falta.
//
// Adapter NAO conhece dominio: nao existe `if (module === 'catalogo')` aqui dentro.

/**
 * TODO: troque `Record<string, unknown>` pela interface real da porta "<porta>"
 * (packages/ports/index.ts) depois de implementar os metodos dela aqui.
 */
export function createAdapter(): Record<string, unknown> {
  throw new Error('TODO: implemente os metodos da porta "<porta>" em adapters/<provedor>/index.ts');
}
