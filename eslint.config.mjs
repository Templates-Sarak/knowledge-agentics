// Lint da BASE sobre si mesma (plan-2.md, Bloco L.3 — "ferramentas/ e vendorizado no projeto
// gerado e PROPRIO na base"). O template exclui `ferramentas/` do lint de todo projeto gerado
// (ferramental vendorizado, o dono e outro repositorio) — mas AQUI a base E o dono, e o precedente
// que fecha essa exclusao e a F.2d.1: recusar excluir `ferramentas/` do scanner de segredo com o
// mesmo argumento. Ponto cego num linter e tolerável num projeto que so consome; na casa do
// dono, nao.
//
// So `specs/_estrutura_modulos/ferramentas/**` entra — NAO o repo inteiro. `hooks/`, `skills/`,
// `plugin/`, `mcp-servers/`, `agents/`, `commands/` sao areas com dono e ritmo proprios, fora do
// escopo deste bloco; trazê-las para dentro do mesmo lint seria decidir a limpeza delas sem pedido.
//
// Os tres numeros vem de UMA fonte, a mesma que gera a config de todo projeto criado pelo template
// (`ferramentas/gerar-config-lint.mjs`) — nunca reescritos aqui.
import { LIMIARES } from './specs/_estrutura_modulos/ferramentas/gate/limiares.mjs';

export default [
  { ignores: ['**/node_modules/**'] },
  {
    files: ['specs/_estrutura_modulos/ferramentas/**/*.mjs'],
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
      'specs/_estrutura_modulos/ferramentas/afetados.mjs',
      'specs/_estrutura_modulos/ferramentas/contrato-compativel.mjs',
      'specs/_estrutura_modulos/ferramentas/ci-dependencias.mjs',
    ],
    rules: { 'max-lines-per-function': 'off' },
  },
];
