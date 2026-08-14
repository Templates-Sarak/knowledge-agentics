/**
 * ports-vocabulary.mjs — a FONTE ÚNICA do vocabulário de portas. Lei dona:
 * specs/arquitetura/01-modulo.md §5.1.
 *
 * Três lugares têm de concordar, e nada verifica sozinho: `packages/ports/index.ts:PORTAS_CONHECIDAS`,
 * `schemas/config-ports.schema.json:properties` e `schemas/module.schema.json:ports.items.enum`.
 * Acrescentar uma porta editando só dois dos três falha em silêncio numa direção.
 *
 * **Impedir é melhor que acusar** — o template já escolheu isso uma vez ao gerar a config do linter
 * em vez de conferi-la por regra (`generate-lint-config.mjs`). Os DOIS schemas
 * (`tools/gate/schemas/config-ports.schema.json` e a metade `ports.items.enum` de
 * `module.schema.json`) são GERADOS desta lista por `tools/generate-port-schemas.mjs`, com
 * `--conferir` para detectar edição manual — o mesmo padrão do `lint-derivado`.
 *
 * O TERCEIRO lugar, `packages/ports/index.{ts,js,py}` de cada binding, **não é gerado**: é
 * interface de LINGUAGEM de verdade (TS/JS/Python, cada um com a própria sintaxe e as próprias
 * interfaces de porta — `Repositorio`, `Storage`, …), não config mecânica. Continua hand-maintained,
 * e precisa ser mantido IGUAL a esta lista à mão sempre que ela mudar — é o preço de três linguagens
 * não poderem compartilhar um módulo JS.
 *
 * `fila` NÃO ESTÁ no vocabulário — decisão deliberada. Ela arrasta retry, *dead-letter*,
 * idempotência e ordem de entrega — desenho de TOPOLOGIA, e `00-arquitetura.md` §5 já diz que o
 * template não escolhe topologia por quem usa. Nome sem interface é declaração sem efeito (o
 * mesmo argumento que exclui `'dist'` de `ENTRADAS_PERMITIDAS`). Ela volta no dia em que
 * houver um projeto com a decisão tomada — e volta como ADR, não como reinclusão silenciosa aqui.
 */
export const PORTAS_CONHECIDAS = [
  'repositorio',
  'auditoria',
  'relogio',
  'geradorId',
  'storage',
  'auth',
  'notificador',
];
