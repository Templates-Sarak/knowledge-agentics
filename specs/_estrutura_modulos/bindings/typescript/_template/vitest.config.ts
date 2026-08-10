// Testes do modulo <modulo>. Lei dona: specs/arquitetura/03-operacao.md §5.
//
// Tudo em `tests/`, espelhando as camadas. Os testes de dominio e de contrato rodam em Node;
// os de tela rodam em jsdom. Nenhum deles toca rede ou banco — as portas sao servidas pelos
// dubles de `tests/fixtures/`, e e isso que prova o desacoplamento.
//
// jsdom NAO e ligado aqui: `environmentMatchGlobs` (a forma de ligar por PASTA) foi REMOVIDO no
// Vitest 3+ — medido, Bloco P (plan-2.md): o campo simplesmente nao existe mais em
// `node_modules/vitest/dist/**`, e o teste de tela falhava com "document is not defined" sem
// avisar que a config tinha ficado morta. Cada teste de `tests/web/**` liga o proprio ambiente
// com o comentario `// @vitest-environment jsdom` na PRIMEIRA linha do arquivo — a forma que
// continua funcionando no Vitest 4, testada empiricamente antes de trocar.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * `cobertura.minima` vem de `config/verificacao.json` da RAIZ do projeto (dois níveis acima do
 * módulo) — a MESMA política que `hooks/test-cobertura.js` lê para o push, uma fonte só. Sem o
 * arquivo (módulo solto, fora de projeto), o vitest não aplica piso nenhum: o gate (`verificacao-declarada`)
 * é quem cobra a ausência da política, não a cobertura.
 */
function minimaDeCobertura() {
  try {
    const { cobertura } = JSON.parse(readFileSync('../../config/verificacao.json', 'utf8'));
    return typeof cobertura?.minima === 'number' ? cobertura.minima : undefined;
  } catch {
    return undefined;
  }
}

const minima = minimaDeCobertura();

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // Default 'node' — tests/web/** liga jsdom por arquivo, comentario `@vitest-environment` (topo deste arquivo).
    environment: 'node',
    globals: true,
    restoreMocks: true,
    coverage: {
      include: ['core/**', 'api/src/**', 'web/src/**'],
      exclude: ['**/*.d.ts'],
      // So ativa com `--coverage` (npm run cobertura) — nunca no `npm test` comum, que nao roda o
      // provider e nao escreve nada em `relatorios/`. reporter/dir moram aqui, nao na CLI, porque
      // sao a MESMA config em toda invocacao — repetir na CLI seria uma segunda fonte pra divergir.
      reporter: ['text', 'lcovonly'],
      reportsDirectory: 'relatorios/cobertura',
      // Abaixo do minimo, o PROPRIO vitest reprova (exit != 0) — reusa o mecanismo de threshold dele
      // em vez de reimplementar leitura de lcov.info aqui. So aplica quando a politica existe.
      thresholds: minima !== undefined ? { lines: minima } : undefined,
    },
  },
});
