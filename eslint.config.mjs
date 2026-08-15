// Lint da BASE sobre si mesma — `tools/` e vendorizado no projeto gerado e PROPRIO na base.
// O template exclui `tools/` do lint de todo projeto gerado (ferramental vendorizado, o dono
// e outro repositorio) — mas AQUI a base E o dono, e o mesmo argumento fecha a exclusao no scanner
// de segredo: recusar excluir `tools/` dele tambem. Ponto cego num linter e tolerável num
// projeto que so consome; na casa do dono, nao.
//
// So `specs/_estrutura_modulos/tools/**` entra — NAO o repo inteiro. `hooks/`, `skills/`,
// `plugin/`, `mcp-servers/`, `agents/`, `commands/` sao areas com dono e ritmo proprios, fora do
// escopo deste bloco; trazê-las para dentro do mesmo lint seria decidir a limpeza delas sem pedido.
//
// Os tres numeros vem de UMA fonte, a mesma que gera a config de todo projeto criado pelo template
// (`tools/generate-lint-config.mjs`) — nunca reescritos aqui.
import { LIMIARES } from './specs/_estrutura_modulos/tools/gate/thresholds.mjs';

export default [
  { ignores: ['**/node_modules/**'] },
  {
    files: ['specs/_estrutura_modulos/tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // gate: limiar-funcao
      'max-lines-per-function': ['error', { max: LIMIARES.linhasFuncao, skipBlankLines: true, skipComments: true }],
      // gate: limiar-aninhamento
      'max-depth': ['error', LIMIARES.aninhamento],
      // gate: limiar-parametros
      'max-params': ['error', LIMIARES.parametros],
      // gate: excecao-engolida
      'no-empty': ['error', { allowEmptyCatch: false }],
      // gate: log
      'no-console': 'error',
    },
  },
  {
    // Fixture de teste (lista de casos) nao e funcao — mesma isencao que `padrao-typescript`/
    // `padrao-python` ja dao a `tests/`. As tres funcoes `casosDeAutoteste` desta base sao dados,
    // nao logica: um array de objetos literais que so cresce quando um caso novo entra.
    files: [
      'specs/_estrutura_modulos/tools/affected.mjs',
      'specs/_estrutura_modulos/tools/contract-compatible.mjs',
      'specs/_estrutura_modulos/tools/ci-dependencies.mjs',
    ],
    rules: { 'max-lines-per-function': 'off' },
  },
];
