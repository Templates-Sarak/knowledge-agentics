// Build do front do modulo <modulo>.
//
// Deliberadamente MINIMO. O front consome `/api/v1/<modulo>` por caminho relativo na mesma
// origem (specs/arquitetura/00-arquitetura.md §4.4), entao nao ha URL de API para configurar aqui —
// mas a raiz de composicao NAO e essa origem: ela so sobe a API (um processo, uma porta), nunca
// o build estatico deste `web/`. Quem publica os dois sob a mesma origem e decisao de DEPLOY
// (reverse proxy, host estatico na frente), fora desta doutrina (§5: "modularidade nao e
// topologia de deploy").
//
// Zero hardcoded vale AQUI TAMBEM (specs/arquitetura/01-modulo.md §4.4): nao acrescente porta, alvo de
// proxy nem endereco literal. Se precisar, a chave vai para .env e e declarada em
// modulo.json:envRequerido — senao o gate reprova (regra `env-declarado`).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
