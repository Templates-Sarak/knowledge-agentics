/**
 * engine.mjs — o registro de regras e a execução delas. Lei dona: specs/arquitetura/04-regras.md
 *
 * Separado do `validate.mjs` de propósito: aquele é a INTERFACE (argumentos, saída, exit code),
 * este é o MOTOR. Assim o autoteste do gate (`tests/run.mjs`) roda as regras sem simular
 * linha de comando nem capturar stdout.
 */
import estrutura from './rules/structure.mjs';
import isolamento from './rules/isolation.mjs';
import dados from './rules/data.mjs';
import configuracao from './rules/configuration.mjs';
import contrato from './rules/contract.mjs';
import operacao from './rules/operation.mjs';
import escrita from './rules/writing.mjs';

export const REGRAS = [
  ...estrutura, ...isolamento, ...dados, ...configuracao, ...contrato, ...operacao, ...escrita,
];

/** Subconjunto que responde "a estrutura permite extrair este módulo hoje?" (specs/arquitetura/03 §6). */
export const REGRAS_DE_EXTRACAO = new Set([
  'import-lateral', 'import-adapter', 'sdk-fornecedor', 'gateway-http', 'gateway-declarado',
  'env-declarado', 'env-exemplo', 'env-modulo', 'contrato',
]);

/**
 * O rótulo do alvo `root` na saída. Não é id de módulo, e os parênteses são o que garante isso —
 * `manifesto` cobra `id` casando `^[a-z][a-z0-9-]*$`, então nenhuma pasta de módulo pode colidir.
 */
export const ALVO_RAIZ = '(root)';

function normalizar(saida, idModulo) {
  return (saida ?? []).map((item) => (
    typeof item === 'string' ? { modulo: idModulo, mensagem: item } : item
  ));
}

/** Regras de escopo `module` sobre um contexto. */
export function rodarRegrasDeModulo(ctx) {
  const achados = [];
  for (const regra of REGRAS.filter((r) => r.escopo === 'module')) {
    for (const item of normalizar(regra.verificar(ctx), ctx.idPasta)) {
      achados.push({ ...item, regra: regra.id, nivel: regra.nivel });
    }
  }
  return achados;
}

/** Regras de escopo `global`, que precisam enxergar todos os módulos. */
export function rodarRegrasGlobais(contextos) {
  const achados = [];
  for (const regra of REGRAS.filter((r) => r.escopo === 'global')) {
    for (const item of normalizar(regra.verificar(contextos), '?')) {
      achados.push({ ...item, regra: regra.id, nivel: regra.nivel });
    }
  }
  return achados;
}

/**
 * Regras de escopo `root` — fatos do PROJETO, e por isso rodam UMA vez, sobre `ctx.projeto`.
 *
 * Se fossem escopo `module` com guarda, o preço seria: um defeito de projeto emitiria uma mensagem
 * POR MÓDULO. Com dois módulos, duas mensagens idênticas; com dez, dez. O escopo próprio conserta
 * isso na ORIGEM — a regra roda uma vez porque o fato é um só —, e não na impressão, que só
 * esconderia a repetição.
 *
 * Global não servia: `analisar` descarta achado global cujo `module` não esteja entre os
 * selecionados, e a raiz não é módulo nenhum.
 */
export function rodarRegrasDeRaiz(projeto) {
  if (projeto === undefined) return [];
  const achados = [];
  for (const regra of REGRAS.filter((r) => r.escopo === 'root')) {
    for (const item of normalizar(regra.verificar(projeto), ALVO_RAIZ)) {
      achados.push({ ...item, regra: regra.id, nivel: regra.nivel });
    }
  }
  return achados;
}

/** Checagens específicas da pergunta de extração, além das regras do catálogo. */
export function checarExtracao(ctx) {
  const achados = [];
  const escolhidas = ctx.configs.ports.valor ?? {};
  for (const porta of ctx.manifesto?.ports ?? []) {
    if (escolhidas[porta] === undefined) {
      achados.push({ modulo: ctx.idPasta, regra: 'extracao', nivel: 'erro', mensagem: `porta "${porta}" sem adapter em config/ports.json` });
    }
  }
  const env = (ctx.manifesto?.requiredEnv ?? []).join(' ');
  for (const { modulo } of ctx.manifesto?.consumes ?? []) {
    if (!env.includes(modulo.toUpperCase().replace(/-/g, '_'))) {
      achados.push({ modulo: ctx.idPasta, regra: 'extracao', nivel: 'aviso', mensagem: `consome "${modulo}" mas nenhuma env aponta a URL base dele` });
    }
  }
  return achados;
}

/** Roda tudo que se aplica e devolve os achados brutos, sem formatar e sem filtrar exceção. */
export function analisar(contextos, selecionados, opcoes = {}) {
  const ids = selecionados.map((c) => c.idPasta);
  // O achado de raiz fica FORA do filtro por `ids` de proposito: ele não pertence a módulo nenhum,
  // e passá-lo por ali o apagaria sempre. Todos os contextos de uma invocação compartilham a mesma
  // `ctx.projeto` (memoizada por raiz), então ler o primeiro é ler o projeto.
  let achados = selecionados.flatMap(rodarRegrasDeModulo)
    .concat(rodarRegrasGlobais(contextos).filter((a) => ids.includes(a.modulo)))
    .concat(rodarRegrasDeRaiz(contextos[0]?.projeto));

  if (opcoes.extracao === true) {
    achados = achados.filter((a) => REGRAS_DE_EXTRACAO.has(a.regra))
      .concat(selecionados.flatMap(checarExtracao));
  }
  return achados;
}
