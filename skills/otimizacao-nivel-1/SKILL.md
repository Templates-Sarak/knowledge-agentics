---
name: otimizacao-nivel-1
description: Otimização de performance de custo zero (frontend + backend) — front= Core Web Vitals (WebP, lazy, cache, code-splitting); back= índices, N+1, tuning de query, cache em memória — medindo antes/depois. Use APENAS quando pedirem otimização de performance. NÃO acione proativamente.
---

# Skill: Otimização Nível 1 — Custo Zero

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Primeiro degrau da escada de performance: ganhos de alto impacto **sem custo e sem perda visual
perceptível**, usando recursos nativos do navegador e ferramentas gratuitas. É o nível que se tenta
**sempre primeiro**. Mutativa → HITL antes de aplicar.

> Medição (baseline + re-medição) e a escada de níveis estão em `references/diagnostico-performance.md`
> (compartilhado com os níveis 2 e 3). Cobre **frontend (web) e backend**. Princípios globais em `CLAUDE.md`;
> o tree-shaking aqui é de **bundle** (≠ código morto de repo, que é da `code-limpeza-projeto`); índice por
> performance ≠ modelagem/migration (`db-migrations`).

## Quando usar
- Sob demanda, ao finalizar uma página/seção, quando o Lighthouse/PageSpeed acusa Core Web Vitals baixos, ou no polimento de pré-entrega.
- Mutativa → HITL obrigatório antes de aplicar as otimizações.

## Workflow
Trate **uma página/rota por vez**. Táticas são candidatas — confirme cada uma no HITL.

1. **Medir baseline** — siga `references/diagnostico-performance.md`. **Frontend:** Lighthouse + `python scripts/auditar_assets.py --raiz <projeto>` + peso do build (LCP/CLS/INP/TBT, bundle). **Backend:** latência de API (**p95**), **tempo de query** (slow-query log) e throughput.
2. **Selecionar táticas (custo zero)** pelo que o diagnóstico apontou:
   - **Imagens (front):** PNG/JPG → **WebP/AVIF**; `loading="lazy"` fora da dobra; `fetchpriority="high"` na imagem LCP; **`width`/`height`** (mata CLS).
   - **Cache/dados (front):** SWR/React Query com `staleTime` agressivo; revalidação sob demanda.
   - **Fontes (front):** `font-display: swap`, `preconnect`, `woff2`.
   - **Bundle (front):** code-splitting por rota (`next/dynamic`/`React.lazy`); imports nomeados (tree-shaking); remover libs não usadas.
   - **Backend (custo zero):** criar/ajustar **índices** nas colunas de filtro/junção; corrigir **N+1** (eager/batch load); **tuning de query** (sem `SELECT *`, paginar, projeção); **cache em memória** de dados quentes; **connection pooling**; evitar trabalho redundante (memoização). _Índice = perf; estrutura/migration é da `db-migrations`._
3. **HITL — plano** — apresente o plano de `assets/plano_otimizacao.md` (táticas + ganho **estimado**). → "⚠️ Confirma as otimizações de custo zero?". **Aguarde.**
4. **Aplicar** — só o aprovado, em mudanças pequenas e verificáveis.
5. **Re-medir** — repita o passo 1 e compare com a baseline. Regressão (ex.: CLS subiu) → reverter a mudança.
6. **Reportar + escalar se preciso** — registre antes/depois. Se as metas não foram atingidas, recomende `otimizacao-nivel-2` (concessão de UX) — não suba de nível sozinho.

## Regras e limites
- **NUNCA** aplique otimização sem **baseline medida** — sem número antes/depois é chute (passo 1 é obrigatório).
- **NÃO** degrade a qualidade visual perceptível — isso é do `otimizacao-nivel-2` (com HITL próprio); aqui o ganho é "de graça".
- **NÃO** aplique nada sem o HITL do passo 3.
- **NÃO** aceite regressão de métrica (ex.: lazy na imagem LCP piora o LCP; `<img>` sem dimensão piora o CLS) — re-meça e reverta.
- **NÃO** confunda tree-shaking de bundle com faxina de repo (`code-limpeza-projeto`) nem com a config de deploy (`deploy-vercel`).
- **NÃO** trate a saída de `auditar_assets.py` como verdade absoluta — é candidata; confirme antes de aplicar.
- **NÃO** saia do escopo: concessão de qualidade → `otimizacao-nivel-2`; infra paga → `otimizacao-nivel-3`.

## Checklist "pronta"
- [ ] Baseline medida **antes** de agir? Front: LCP/CLS/INP/TBT + bundle. Back: latência p95/tempo de query/throughput.
- [ ] `auditar_assets.py` rodado (front) e a saída triada?
- [ ] Front: imagens WebP/AVIF com `width`/`height`, lazy + `fetchpriority`; cache/fontes/code-splitting?
- [ ] Back: índices, N+1 corrigido, query tunada, cache em memória, pooling — conforme o diagnóstico?
- [ ] HITL apresentado e só o aprovado aplicado?
- [ ] **Re-medição** feita e ganho confirmado no número (sem regressão)?
- [ ] Antes/depois reportado; escalonamento ao nível 2 recomendado se as metas não bateram?

## Referências (Camada 3 — leia sob demanda)
- `references/diagnostico-performance.md` — medição compartilhada (CWV, como medir, escada de níveis). **Usado pelos 3 níveis.**
- `scripts/auditar_assets.py` + `scripts/auditar_assets.config.json` — auditoria determinística de assets/bundle (limites/libs no config).
- `assets/plano_otimizacao.md` — template do plano de otimização (HITL).
