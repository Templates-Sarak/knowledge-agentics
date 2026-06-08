---
name: site-seo
description: SEO técnico + SEO local (GEO) + otimização para IA (AEO/GSO) — robots/sitemap, JSON-LD, metadados/OG, NAP e conteúdo answer-ready, com auditoria (auditar_seo.py). Use APENAS em sites, quando pedirem SEO/GEO ou Schema.org. NÃO acione proativamente.
---

# Skill: SEO & GEO (Descoberta)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Torna um site **encontrável e indexável** — por buscadores tradicionais (SEO técnico), por busca local
(GEO) e por motores de resposta de IA (AEO/GSO). Mutativa → HITL antes de aplicar.

> Premissa de stack: **web (React/Next-first)**. **Performance (Core Web Vitals, WebP/lazy/defer)** é da
> `otimizacao-nivel-1` — aqui se **referencia**, não se duplica. A **hierarquia de rotas** (base do
> BreadcrumbList) vem da `site-organizacao`. Princípios globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao publicar um site, em auditoria/queda de tráfego orgânico, ou ao adicionar localidades/serviços.
- Quando o usuário pede SEO/GEO, Schema.org, ou melhorar visibilidade.
- Mutativa → HITL obrigatório antes de aplicar.

## Workflow
Trate **um site por vez**. Catálogo de schema/GEO/AEO em `references/schema-geo.md`.

1. **Auditar** — rode `python scripts/auditar_seo.py --raiz <projeto>` (robots/sitemap, `<title>`/meta description, OG/Twitter, JSON-LD, canonical, `lang`, `<img>` sem `alt`). Para performance (CWV), use a `otimizacao-nivel-1` (não audite aqui).
2. **Rastreio: robots & sitemap** — `robots.txt` (libera geral, bloqueia admin, aponta o sitemap; regra opcional p/ `GPTBot`); `sitemap.xml` dinâmico/no build, só URLs 200.
3. **Dados estruturados (JSON-LD)** — injete do `assets/`: `Organization`, `LocalBusiness` (NAP + geo + horários — base do GEO), `BreadcrumbList` (reflete as rotas da `site-organizacao`), `FAQPage` (featured snippets/IA).
4. **Metadados & canonical** — `<title>` e meta description únicos por página (revisão humana p/ CTR/tom); `<link rel="canonical">`; `<html lang>`.
5. **Social** — OpenGraph (`og:title/description/image/url/type`) e Twitter (`summary_large_image`); imagem 1200×630.
6. **GEO local** — **NAP idêntico** em todo o site; páginas locais só com **conteúdo real** (cidade trocada e vazia = spam); rotas `/[servico]/[cidade]` conforme a `site-organizacao`.
7. **AEO/GSO (IA)** — chunks temáticos curtos com subtítulos; resposta direta no início (pirâmide invertida); tabelas/listas para dados (fáceis de raspar); fatos em texto limpo (não em imagem).
8. **HITL — plano** → resumo (robots/sitemap, schemas, metadados, social, GEO, AEO) → "⚠️ Confirma as otimizações?". **Aguarde.**
9. **Aplicar + reportar** — implemente o aprovado; valide os schemas no Rich Results Test; reporte mudanças e impacto esperado.

## Regras e limites
- **NUNCA** faça keyword stuffing nem cloaking (`display:none` só para robôs) — penalidade severa.
- **NÃO** crie página GEO sem **conteúdo real e útil** (cidade trocada e vazia = spam).
- **NÃO** altere URL existente sem **redirect 301** — perda de link equity é inaceitável.
- **NÃO** automatize metadados sem **revisão humana** (tom/persuasão/CTR).
- **NUNCA** garanta NAP inconsistente entre páginas — endereço/telefone/nome idênticos.
- **NÃO** aplique sem o HITL do passo 8.
- **NÃO** saia do escopo: performance/imagens → `otimizacao-nivel-1`; rotas/navegação/a11y → `site-organizacao`; bug de código → `code-diagnostico`/`code-adequacao`.

## Checklist "pronta"
- [ ] `auditar_seo.py` rodado e a saída triada (robots/sitemap/meta/OG/JSON-LD/alt)?
- [ ] `robots.txt` + `sitemap.xml` corretos (só URLs 200)?
- [ ] JSON-LD aplicado (Organization/LocalBusiness/Breadcrumb/FAQ) e validado no Rich Results Test?
- [ ] `<title>`/meta description únicos + canonical + `lang`?
- [ ] OG/Twitter com imagem 1200×630?
- [ ] NAP consistente; páginas locais com conteúdo real?
- [ ] Conteúdo answer-ready (chunks, resposta direta, tabelas) para AEO/GSO?
- [ ] HITL confirmado; schemas validados; mudanças reportadas?

## Referências (Camada 3 — leia sob demanda)
- `references/schema-geo.md` — catálogo de tipos JSON-LD + guia de GEO local e AEO/GSO + validadores.
- `scripts/auditar_seo.py` + `scripts/auditar_seo.config.json` — auditoria determinística de SEO on-page.
- `assets/` — templates JSON-LD: `local_business_schema.json`, `organization_schema.json`, `faq_schema.json`.
