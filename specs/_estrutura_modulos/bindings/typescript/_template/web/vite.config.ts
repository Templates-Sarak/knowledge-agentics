// Build do front do modulo <modulo>.
//
// Deliberadamente MINIMO. O front consome `/api/v1/<modulo>` por caminho relativo na mesma
// origem (doutrina/00-arquitetura.md §4.4), entao nao ha URL de API para configurar aqui —
// quem serve front e api sob a mesma origem e a raiz de composicao, em dev e em producao.
//
// Zero hardcoded vale AQUI TAMBEM (doutrina/01-modulo.md §4.4): nao acrescente porta, alvo de
// proxy nem endereco literal neste arquivo. Se precisar, a chave vai para .env e e declarada
// em modulo.json:envRequerido — senao o gate reprova (regra `env-declarado`).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
