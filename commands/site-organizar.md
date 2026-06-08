---
description: Estrutura a arquitetura e a navegação de um site web via o fluxo da skill site-organizacao — rotas hierárquicas semânticas, abas × páginas, identidade da aba e acessibilidade (a11y), com HITL. Mutativo. Use apenas em sites.
argument-hint: [alvo]
allowed-tools: Read, Edit, Write, Grep, Glob
---

# /site-organizar — arquitetura & navegação do site

Alvo: **$1** (se vazio, o diretório atual `.`).

Dispara o fluxo da skill **`site-organizacao`** para definir a **espinha dorsal** do site (rotas, navegação,
a11y). Premissa: web React/Next (App Router). É **mutativo** → HITL antes de aplicar a estrutura.

## Passos (skill `site-organizacao`)
1. **Mapear hierarquia** — árvore de rotas **semânticas e hierárquicas** (`/categoria/subcategoria/slug`); slug semântico, nunca `/p=123`.
2. **Abas × páginas (HITL)** — pergunte: **Abas** (alternar rápido, dados densos, máx. 10) ou **Páginas**? Em ambos, **URL de caminho real** (App Router) — **nunca hash** na navegação principal.
3. **Identidade da aba (HITL)** — pergunte título + favicon (32×32). Proibido publicar com "Next App"/favicon genérico.
4. **Modularização** — extraia Header/Footer/Navbar/Cards em componentes (SRP, dumb component — dados via props), conforme `padrao-escrita`.
5. **Acessibilidade** — `references/a11y.md`: HTML semântico, `alt`, `aria-label`, contraste WCAG ≥ 4.5:1, teclado com foco visível.
6. **Estado & navegação** — estado nos limites certos (local/context/props); breadcrumbs em nível > 1; menu ≤ 7–9 itens.
7. **HITL — plano** — `assets/site_structure.md` (rotas, tipo, componentes, a11y, estado, identidade) → **"⚠️ Confirma a estrutura?"** → aguarde.
8. **Aplicar + reportar** — implemente; reporte o mapa do site; **avise a `site-seo`** de páginas novas (sitemap/breadcrumb).

## Limites
- **NUNCA** URL por ID (`/p=123`) ou hash/query na navegação principal; **NUNCA** título/favicon genérico.
- **NÃO** ultrapasse 10 abas numa visão; **NÃO** ponha lógica de negócio em componente de visualização.
- **NÃO** aplique sem o HITL do passo 7.
- **NÃO** saia do escopo: SEO/sitemap/schema → `site-seo`; performance (imagens/bundle) → `otimizacao-nivel-1`.
