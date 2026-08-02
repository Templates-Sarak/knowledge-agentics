// Testes do modulo <modulo>. Lei dona: specs/arquitetura/03-operacao.md §5.
//
// Tudo em `tests/`, espelhando as camadas. Os testes de dominio e de contrato rodam em Node;
// os de tela rodam em jsdom. Nenhum deles toca rede ou banco — as portas sao servidas pelos
// dubles de `tests/fixtures/`, e e isso que prova o desacoplamento.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['tests/web/**', 'jsdom']],
    environment: 'node',
    globals: true,
    restoreMocks: true,
    coverage: {
      include: ['core/**', 'api/src/**', 'web/src/**'],
      exclude: ['**/*.d.ts'],
    },
  },
});
