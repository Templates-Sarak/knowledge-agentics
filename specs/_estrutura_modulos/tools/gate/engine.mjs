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

export const RULES = [
  ...estrutura, ...isolamento, ...dados, ...configuracao, ...contrato, ...operacao, ...escrita,
];

/** O pseudo-id que `checkExtraction` emite fora do catálogo (`--extraction`). */
const EXTRACTION_ID = 'extraction';

/**
 * Todo id que um achado pode carregar — o que uma exceção de `config/compliance.json` pode citar. Chega às
 * regras de escopo `root` como 2º argumento de `verificar`: a regra não importa o motor (import
 * circular) e continua sem tocar disco.
 */
export const CATALOG_IDS = new Set([...RULES.map((rule) => rule.id), EXTRACTION_ID]);

/** Subconjunto que responde "a estrutura permite extrair este módulo hoje?" (specs/arquitetura/03 §6). */
export const EXTRACTION_RULES = new Set([
  'lateral-import', 'import-adapter', 'vendor-sdk', 'gateway-http', 'gateway-declared',
  'env-declared', 'env-example', 'env-module', 'contract',
]);

/**
 * O rótulo do alvo `root` na saída. Não é id de módulo, e os parênteses são o que garante isso —
 * `manifest` cobra `id` casando `^[a-z][a-z0-9-]*$`, então nenhuma pasta de módulo pode colidir.
 */
export const ROOT_TARGET = '(root)';

/** Stable public JSON contract; internal finding fields remain an implementation detail. */
export function serializeFinding(finding) {
  return {
    module: finding.modulo,
    rule: finding.regra,
    severity: finding.nivel === 'erro' ? 'error' : 'warning',
    message: finding.mensagem,
  };
}

function normalize(output, moduleId) {
  return (output ?? []).map((item) => (
    typeof item === 'string' ? { modulo: moduleId, mensagem: item } : item
  ));
}

/** Regras de escopo `module` sobre um contexto. */
export function runModuleRules(ctx) {
  const findings = [];
  for (const rule of RULES.filter((r) => r.escopo === 'module')) {
    for (const item of normalize(rule.check(ctx), ctx.dirId)) {
      findings.push({ ...item, regra: rule.id, nivel: rule.nivel });
    }
  }
  return findings;
}

/** Regras de escopo `global`, que precisam enxergar todos os módulos. */
export function runGlobalRules(contexts) {
  const findings = [];
  for (const rule of RULES.filter((r) => r.escopo === 'global')) {
    for (const item of normalize(rule.check(contexts), '?')) {
      findings.push({ ...item, regra: rule.id, nivel: rule.nivel });
    }
  }
  return findings;
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
export function runRootRules(project) {
  if (project === undefined) return [];
  const findings = [];
  for (const rule of RULES.filter((r) => r.escopo === 'root')) {
    for (const item of normalize(rule.check(project, { ids: CATALOG_IDS }), ROOT_TARGET)) {
      findings.push({ ...item, regra: rule.id, nivel: rule.nivel });
    }
  }
  return findings;
}

/** Checagens específicas da pergunta de extração, além das regras do catálogo. */
export function checkExtraction(ctx) {
  const findings = [];
  const chosen = ctx.configs.ports.value ?? {};
  for (const port of ctx.manifest?.ports ?? []) {
    if (chosen[port] === undefined) {
      findings.push({ modulo: ctx.dirId, regra: EXTRACTION_ID, nivel: 'erro', mensagem: `Port "${port}" has no adapter in config/ports.json` });
    }
  }
  const env = (ctx.manifest?.requiredEnv ?? []).join(' ');
  for (const { modulo: module } of ctx.manifest?.consumes ?? []) {
    if (!env.includes(module.toUpperCase().replace(/-/g, '_'))) {
      findings.push({ modulo: ctx.dirId, regra: EXTRACTION_ID, nivel: 'aviso', mensagem: `Consumes "${module}", but no environment variable points to its base URL` });
    }
  }
  return findings;
}

/** Roda tudo que se aplica e devolve os achados brutos, sem formatar e sem filtrar exceção. */
export function analyze(contexts, selected, options = {}) {
  const ids = selected.map((c) => c.dirId);
  // O achado de raiz fica FORA do filtro por `ids` de proposito: ele não pertence a módulo nenhum,
  // e passá-lo por ali o apagaria sempre. Todos os contextos de uma invocação compartilham a mesma
  // `ctx.projeto` (memoizada por raiz), então ler o primeiro é ler o projeto.
  let findings = selected.flatMap(runModuleRules)
    .concat(runGlobalRules(contexts).filter((a) => ids.includes(a.modulo)))
    .concat(runRootRules(contexts[0]?.project));

  if (options.extraction === true) {
    findings = findings.filter((a) => EXTRACTION_RULES.has(a.regra))
      .concat(selected.flatMap(checkExtraction));
  }
  return findings;
}
