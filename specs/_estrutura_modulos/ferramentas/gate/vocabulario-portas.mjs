/**
 * vocabulario-portas.mjs — a FONTE ÚNICA do vocabulário de portas. Lei dona:
 * specs/arquitetura/01-modulo.md §5.1.
 *
 * Três lugares precisavam concordar e nada verificava (plan-2.md Bloco S): eram **8 em cada, por
 * sorte** — `packages/portas/index.ts:PORTAS_CONHECIDAS`, `schemas/config-portas.schema.json:properties`
 * e `schemas/modulo.schema.json:portas.items.enum`. Acrescentar uma nona porta editando dois dos
 * três falhava em silêncio numa direção.
 *
 * **Impedir é melhor que acusar** — o template já escolheu isso uma vez ao gerar a config do linter
 * em vez de conferi-la por regra (`gerar-config-lint.mjs`). Os DOIS schemas
 * (`ferramentas/gate/schemas/config-portas.schema.json` e a metade `portas.items.enum` de
 * `modulo.schema.json`) são GERADOS desta lista por `ferramentas/gerar-schemas-portas.mjs`, com
 * `--conferir` para detectar edição manual — o mesmo padrão do `lint-derivado`.
 *
 * O TERCEIRO lugar, `packages/portas/index.{ts,js,py}` de cada binding, **não é gerado**: é
 * interface de LINGUAGEM de verdade (TS/JS/Python, cada um com a própria sintaxe e as próprias
 * interfaces de porta — `Repositorio`, `Storage`, …), não config mecânica. Continua hand-maintained,
 * e precisa ser mantido IGUAL a esta lista à mão sempre que ela mudar — é o preço de três linguagens
 * não poderem compartilhar um módulo JS.
 *
 * `fila` SAIU do vocabulário (plan-2.md Bloco S, DECIDIDO). Ela arrasta retry, *dead-letter*,
 * idempotência e ordem de entrega — desenho de TOPOLOGIA, e `00-arquitetura.md` §5 já diz que o
 * template não escolhe topologia por quem usa. Nome sem interface era declaração sem efeito (o
 * mesmo argumento que apagou `'dist'` de `ENTRADAS_PERMITIDAS` na F.2g). Ela volta no dia em que
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
