---
description: Torna um site encontrável e indexável via o fluxo da skill site-seo — SEO técnico + GEO local + AEO/GSO (robots/sitemap, JSON-LD, metadados/OG, NAP, conteúdo answer-ready), com auditoria (auditar_seo.py) e HITL. Mutativo. Use apenas em sites.
argument-hint: [alvo]
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# /site-seo — descoberta (SEO técnico + GEO + AEO/GSO)

Alvo: **$1** (se vazio, o diretório atual `.`).

Dispara o fluxo da skill **`site-seo`** para tornar o site encontrável por buscadores, busca local e motores de
resposta de IA. Premissa: web React/Next. É **mutativo** → HITL antes de aplicar.

## Passos (skill `site-seo`)
1. **Auditar** — `python skills/site-seo/scripts/auditar_seo.py --raiz $1` (robots/sitemap, title/meta, OG/Twitter, JSON-LD, canonical, `lang`, `alt`). Performance (CWV) é da `otimizacao-nivel-1`.
2. **Robots & sitemap** — `robots.txt` (libera geral, bloqueia admin, aponta o sitemap) + `sitemap.xml` (só URLs 200).
3. **JSON-LD** — injete de `assets/`: `Organization`, `LocalBusiness` (NAP + geo + horários), `BreadcrumbList` (rotas da `site-organizacao`), `FAQPage`.
4. **Metadados & canonical** — `<title>`/meta description únicos por página, `canonical`, `<html lang>`.
5. **Social** — OpenGraph + Twitter (`summary_large_image`); imagem 1200×630.
6. **GEO local** — **NAP idêntico** em todo o site; páginas locais só com **conteúdo real**; rotas `/[servico]/[cidade]`.
7. **AEO/GSO** — chunks curtos com subtítulos, resposta direta no início, tabelas/listas, fatos em texto limpo.
8. **HITL — plano** → resumo (robots/sitemap, schemas, metadados, social, GEO, AEO) → **"⚠️ Confirma as otimizações?"** → aguarde.
9. **Aplicar + reportar** — implemente; valide os schemas no Rich Results Test; reporte mudanças e impacto.

## Limites
- **NUNCA** keyword stuffing nem cloaking; **NUNCA** NAP inconsistente entre páginas.
- **NÃO** crie página GEO sem conteúdo real (cidade trocada e vazia = spam).
- **NÃO** altere URL existente sem **redirect 301**; **NÃO** automatize metadados sem revisão humana (tom/CTR).
- **NÃO** aplique sem o HITL do passo 8.
- **NÃO** saia do escopo: performance/imagens → `otimizacao-nivel-1`; rotas/navegação/a11y → `site-organizacao`.
