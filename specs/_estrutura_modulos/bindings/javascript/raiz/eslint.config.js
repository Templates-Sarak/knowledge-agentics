// GERADO por ferramentas/gerar-config-lint.mjs — NAO edite a mao.
// A fonte dos limiares e ferramentas/gate/limiares.mjs (LEI: specs/arquitetura/04-regras.md §4.7).
// Para mudar um limiar, mude a lei e rode o gerador de novo. Editar aqui cria a divergencia que
// este arquivo existe para impedir.

export default [
  { ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', 'gerados/**', '.venv/**', '.agents/**', '.githooks/**', 'ferramentas/**'] },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // gate: limiar-funcao
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      // gate: limiar-aninhamento
      'max-depth': ['error', 3],
      // gate: limiar-parametros
      'max-params': ['error', 4],
      // gate: excecao-engolida
      'no-empty': ['error', { allowEmptyCatch: false }],
      // gate: log
      'no-console': 'error',
    },
  },
  {
    // Teste tem outra economia: fixture longa e `console` de diagnostico sao legitimos ali,
    // e o gate ja isenta arquivo de teste nas mesmas regras (`eTeste`).
    files: ['**/tests/**', '**/*.test.*', '**/*.spec.*'],
    rules: { 'max-lines-per-function': 'off', 'no-console': 'off' },
  },
];
