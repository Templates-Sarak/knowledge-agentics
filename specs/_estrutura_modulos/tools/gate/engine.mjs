/**
 * engine.mjs — o registro de regras e a execução delas. Lei dona: specs/arquitetura/04-regras.md
 *
 * Separado do `validate.mjs` de propósito: aquele é a INTERFACE (argumentos, saída, exit code),
 * este é o MOTOR. Assim o autoteste do gate (`tests/run.mjs`) roda as regras sem simular
 * linha de comando nem capturar stdout.
 */
import structure from './rules/structure.mjs';
import isolation from './rules/isolation.mjs';
import data from './rules/data.mjs';
import configuration from './rules/configuration.mjs';
import contract from './rules/contract.mjs';
import operation from './rules/operation.mjs';
import writing from './rules/writing.mjs';

export const RULES = [
  ...structure, ...isolation, ...data, ...configuration, ...contract, ...operation, ...writing,
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
    module: finding.module,
    rule: finding.rule,
    severity: finding.severity,
    message: finding.message,
  };
}

function normalize(output, moduleId) {
  return (output ?? []).map((item) => (
    typeof item === 'string' ? { module: moduleId, message: item } : item
  ));
}

/** Regras de escopo `module` sobre um contexto. */
export function runModuleRules(ctx) {
  const findings = [];
  for (const rule of RULES.filter((r) => r.scope === 'module')) {
    for (const item of normalize(rule.check(ctx), ctx.dirId)) {
      findings.push({ ...item, rule: rule.id, severity: rule.severity });
    }
  }
  return findings;
}

/** Regras de escopo `global`, que precisam enxergar todos os módulos. */
export function runGlobalRules(contexts) {
  const findings = [];
  for (const rule of RULES.filter((r) => r.scope === 'global')) {
    for (const item of normalize(rule.check(contexts), '?')) {
      findings.push({ ...item, rule: rule.id, severity: rule.severity });
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
  for (const rule of RULES) {
    const check = rootCheckOf(rule);
    if (check === null) continue;
    for (const item of normalize(check(project, { ids: CATALOG_IDS }), ROOT_TARGET)) {
      findings.push({ ...item, rule: rule.id, severity: rule.severity });
    }
  }
  return findings;
}

/**
 * A verificação de RAIZ de uma regra, ou `null`. Regra de escopo `root` é a própria `check`; regra de
 * escopo `module` pode ter uma `checkRoot` — o MESMO id, a MESMA lei, outro território. É o caso de
 * `portuguese-identifier`: a lei é uma só (o código é em inglês) e o código dela mora em dois lugares que
 * nenhum contexto enxerga junto (`modules/**` e a fiação). Com dois ids o catálogo teria duas linhas para
 * uma lei, e a exceção nominal (`module` + `rule`) apontaria para ids diferentes.
 */
function rootCheckOf(rule) {
  if (rule.scope === 'root') return rule.check;
  return typeof rule.checkRoot === 'function' ? rule.checkRoot : null;
}

/** Checagens específicas da pergunta de extração, além das regras do catálogo. */
export function checkExtraction(ctx) {
  const findings = [];
  const chosen = ctx.configs.ports.value ?? {};
  for (const port of ctx.manifest?.ports ?? []) {
    if (chosen[port] === undefined) {
      findings.push({ module: ctx.dirId, rule: EXTRACTION_ID, severity: 'error', message: `Port "${port}" has no adapter in config/ports.json` });
    }
  }
  const env = (ctx.manifest?.requiredEnv ?? []).join(' ');
  for (const { module } of ctx.manifest?.consumes ?? []) {
    if (!env.includes(module.toUpperCase().replace(/-/g, '_'))) {
      findings.push({ module: ctx.dirId, rule: EXTRACTION_ID, severity: 'warning', message: `Consumes "${module}", but no environment variable points to its base URL` });
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
    .concat(runGlobalRules(contexts).filter((a) => ids.includes(a.module)))
    .concat(runRootRules(contexts[0]?.project));

  if (options.extraction === true) {
    findings = findings.filter((a) => EXTRACTION_RULES.has(a.rule))
      .concat(selected.flatMap(checkExtraction));
  }
  return findings;
}
