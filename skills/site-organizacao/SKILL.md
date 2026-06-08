---
name: site-organizacao
description: Arquitetura e navegabilidade de site web — rotas hierárquicas semânticas, abas × páginas, acessibilidade (a11y) e identidade da aba. Use APENAS em sites, quando pedirem para estruturar/organizar o site ou definir rotas. NÃO acione proativamente.
---

# Skill: Organização de Site (Arquitetura & Navegação)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Define a **espinha dorsal** de um site: como a informação se distribui em rotas, como o usuário navega
e como o site é **acessível** desde a fundação. Mutativa → HITL antes de aplicar a estrutura.

> Premissa de stack: **web (React/Next-first, App Router)**. A **modularização** (extrair componente, SRP,
> componente "burro" sem lógica de negócio) é norma de `padrao-escrita` (Nível 1 frontend) — aqui se
> **aplica**, não se redefine. A descoberta (SEO/sitemap/breadcrumb schema) é da `site-seo`. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, na arquitetura inicial de um site, quando a navegação fica confusa, ou ao pedir organização específica ("quero por abas").
- Mutativa → HITL obrigatório antes de aplicar rotas/estrutura.

## Workflow
Trate **um site por vez**.

1. **Mapear hierarquia** — defina a árvore de rotas **semânticas e hierárquicas** (filosofia de sistema de arquivos): `/categoria/subcategoria/slug`. Cada nível tem propósito; slug semântico (nunca `/p=123`).
2. **Abas × páginas (HITL)** — pergunte: "organização por **Abas** (alternar rápido, dados densos/relacionados, máx. 10) ou **Páginas** (conteúdos distintos)?". Em ambos: **URL de caminho real** pelo roteador do framework (App Router) — **nunca hash** para navegação principal (indexável pela `site-seo`).
3. **Identidade da aba (HITL)** — pergunte título e favicon (`.ico`/`.png` 32x32). Proibido publicar com "Next App"/favicon genérico.
4. **Modularização** — extraia seções repetidas (Header/Footer/Navbar/Cards) em componentes, seguindo `padrao-escrita` (SRP, componente sem lógica de negócio — dados via props). Não redefina a regra; aplique-a.
5. **Acessibilidade (a11y)** — audite conforme `references/a11y.md`: HTML semântico (`<main>/<nav>/<section>`), `alt` em imagens, `aria-label` quando o texto não basta, contraste WCAG ≥ 4.5:1, navegação por teclado com foco visível.
6. **Estado & navegação** — minimize estado global: **local** (UI), **context** (auth/tema), **props** (componentes burros). Breadcrumbs em nível > 1; menu principal ≤ 7–9 itens (senão sidebar/submenu).
7. **HITL — plano** — apresente o plano de `assets/site_structure.md` (rotas, tipo, componentes, a11y, estado, identidade). → "⚠️ Confirma a estrutura?". **Aguarde.**
8. **Aplicar + reportar** — implemente o aprovado; reporte o mapa do site. Páginas novas → avise a `site-seo` (sitemap/breadcrumb).

## Regras e limites
- **NUNCA** use URL críptica/por ID (`/p=123`) nem **hash**/query como navegação principal — rotas hierárquicas semânticas, sempre.
- **NÃO** ultrapasse **10 abas** numa visão — acima disso, sub-navegação.
- **NUNCA** publique com **título/favicon genérico** — a identidade da aba (passo 3) é obrigatória.
- **NÃO** ponha lógica de negócio em componente de visualização — isso é regra de `padrao-escrita`; aqui se respeita.
- **NÃO** ignore a a11y — navegação (sobretudo abas) tem que funcionar por teclado, com foco visível.
- **NÃO** aplique estrutura sem o HITL do passo 7.
- **NÃO** saia do escopo: SEO/sitemap/schema → `site-seo`; performance (imagens/bundle) → `otimizacao-nivel-1`; regras de SRP/modularidade → `padrao-escrita`.

## Checklist "pronta"
- [ ] Rotas semânticas e hierárquicas (sem ID/hash na navegação principal)?
- [ ] Abas × páginas decidido com o usuário; URLs de caminho real (sem hash)?
- [ ] Identidade da aba (título + favicon) definida?
- [ ] Componentes repetidos extraídos conforme `padrao-escrita` (sem lógica em dumb components)?
- [ ] a11y auditada (semântica, `alt`, contraste, teclado) — ver `references/a11y.md`?
- [ ] Estado nos limites certos; breadcrumbs (nível > 1) e menu ≤ 7–9?
- [ ] HITL confirmado; mapa do site reportado e `site-seo` avisada de páginas novas?

## Referências (Camada 3 — leia sob demanda)
- `references/a11y.md` — checklist de acessibilidade (WCAG): semântica, ARIA, contraste, teclado.
- `assets/site_structure.md` — template do plano de estrutura (rotas, componentes, UX, a11y).
