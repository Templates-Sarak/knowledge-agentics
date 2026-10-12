// Build do front do modulo <module>.
//
// Deliberadamente MINIMO. O front consome `/api/v1/<module>` por caminho relativo na mesma
// origem (specs/arquitetura/00-arquitetura.md §4.4), entao nao ha URL de API para configurar aqui —
// mas a raiz de composicao NAO e essa origem: ela so sobe a API (um processo, uma porta), nunca
// o build estatico deste `web/`. Quem publica os dois sob a mesma origem e decisao de DEPLOY
// (reverse proxy, host estatico na frente), fora desta doutrina (§5: "modularidade nao e
// topologia de deploy").
//
// Zero hardcoded vale AQUI TAMBEM (specs/arquitetura/01-modulo.md §4.4): nao acrescente porta, alvo de
// proxy nem endereco literal. Se precisar, a chave vai para .env e e declarada em
// module.json:requiredEnv — senao o gate reprova (regra `env-declared`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `base` vem do `webPath` do PROPRIO manifesto (module.json), nunca de um literal repetido aqui: o
// front e publicado sob `<webPath>/`, e sem `base` o index.html pediria `/assets/...` na raiz do
// host e quebraria. `webPath` nulo (modulo sem front publicado) cai em `/`. Um roteador de cliente
// adicionado depois precisa de `basename` igual a este `webPath` (specs/arquitetura/00-arquitetura.md §4.4).
const root = import.meta.dirname;
const { webPath } = JSON.parse(readFileSync(join(root, '..', 'module.json'), 'utf8').replace(/^﻿/, ''));
const base = typeof webPath === 'string' && webPath !== '' ? `${webPath.replace(/\/+$/, '')}/` : '/';

export default defineConfig({
  root: root,
  base,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
