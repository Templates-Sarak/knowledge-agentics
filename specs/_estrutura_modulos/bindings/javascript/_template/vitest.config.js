// Testes do modulo <modulo>. Lei dona: doutrina/03-operacao.md §5.
//
// Tudo em `tests/`, espelhando as camadas. Os testes de dominio e de contrato rodam em Node;
// os de tela rodam em jsdom. Nenhum deles toca rede ou banco — as portas sao servidas pelos
// dubles de `tests/fixtures/`, e e isso que prova o desacoplamento.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    environmentMatchGlobs: [['tests/web/**', 'jsdom']],
    environment: 'node',
    globals: true,
    restoreMocks: true,
    coverage: {
      include: ['core/**', 'api/src/**', 'web/src/**'],
    },
  },
});
