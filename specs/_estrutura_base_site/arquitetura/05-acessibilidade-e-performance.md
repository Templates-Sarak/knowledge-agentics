---
tipo: "template"
titulo: "Acessibilidade (A11y) e Performance"
dominio: "UI/UX Front-end"
status: "🟡 Pendente"
prioridade: "Média"
tags: ["a11y", "acessibilidade", "performance", "web-vitals"]
---

# 1. Visão Geral
Métricas de qualidade exigidas para a entrega do projeto, visando conformidade legal, indexação por buscadores e conforto do usuário.

# 2. Regras de Acessibilidade (WCAG)
- **Nível de Conformidade Exigido:** [Ex: WCAG 2.1 AA]
- **Contraste de Cores:** [Ex: Garantir contraste mínimo de 4.5:1 para texto normal e 3:1 para grandes]
- **Navegação por Teclado (Focus Trap):** [Ex: Visibilidade clara do "focus" state, especialmente em modais, menus hamburger e mega-menus]
- **Leitores de Tela:** [Ex: Uso adequado de `aria-label`, tags semânticas `<nav>`, `<main>`, `<article>` e textos alternativos em todas as imagens (alt-text)]

# 3. Core Web Vitals (Metas de Performance)
- **LCP (Largest Contentful Paint):** [Ex: Menor que 2.5s]
- **INP (Interaction to Next Paint):** [Ex: Menor que 200ms]
- **CLS (Cumulative Layout Shift):** [Ex: Menor que 0.1 - Ausência de saltos visuais no carregamento de fontes e imagens]

# 4. Estratégias de Otimização Definidas
- **Imagens e Mídia:** [Ex: Uso exclusivo de formatos WebP/AVIF, dimensões declaradas explícitamente, lazy-load abaixo da borda inicial]
- **Carregamento de Fontes:** [Ex: Fontes self-hosted ou carregadas via `next/font` para prevenir Flash of Unstyled Text (FOUT)]
- **Scripts de Terceiros (GTM, Pixels, Analytics):** [Ex: Adiados para carregar somente após interação do usuário (ou carregados via web workers / Partytown)]
