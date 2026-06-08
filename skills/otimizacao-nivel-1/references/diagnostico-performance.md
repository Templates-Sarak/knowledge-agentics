# Diagnóstico de Performance (medição compartilhada)

Referência **compartilhada** pelos três níveis de otimização — é o **passo 0** de qualquer um deles.
Regra de ouro: **medir → agir → re-medir**. Sem número de baseline e número final, otimização é chute.
`otimizacao-nivel-2` e `otimizacao-nivel-3` apontam para este arquivo (mora em `otimizacao-nivel-1`).

> Cobre **frontend (web) e backend**. As métricas de frontend assumem navegador; as de backend, o servidor/DB.

## 1. Métricas e alvos

**Frontend — Core Web Vitals:**

| Métrica | O que mede | Alvo (bom) |
|---|---|---|
| **LCP** (Largest Contentful Paint) | tempo até o maior elemento visível | ≤ 2.5 s |
| **CLS** (Cumulative Layout Shift) | estabilidade visual (saltos de layout) | ≤ 0.1 |
| **INP** (Interaction to Next Paint) | responsividade à interação | ≤ 200 ms |
| **TBT** (Total Blocking Time) | bloqueio da thread principal (lab) | ≤ 200 ms |

**Backend — latência & vazão:**

| Métrica | O que mede | Alvo (referência) |
|---|---|---|
| **Latência de API p95/p99** | tempo de resposta do endpoint | p95 ≤ 300 ms |
| **Tempo de query** | duração das queries (slow-query log) | sem query > 100 ms recorrente |
| **Throughput** | req/s suportado sem degradar | conforme a carga esperada |
| **N+1** | nº de queries por requisição | constante (não cresce com N) |

## 2. Como medir a baseline (antes de qualquer ação)
**Frontend:**
- **Lighthouse** (Chrome DevTools) ou **PageSpeed Insights** → anote LCP/CLS/INP/TBT e a nota.
- **Bundle:** `npm run build` (tamanho por rota) ou bundle analyzer.
- **Assets/código:** `python scripts/auditar_assets.py --raiz <projeto>` → JSON (`imagens_legadas` PNG/JPG→WebP, `imagens_grandes`, `img_sem_dimensao` risco de CLS, `libs_pesadas`).

**Backend:**
- **Latência (p95/p99):** APM (Datadog/New Relic/OTel — ver `obs-monitoramento`) ou medir nos logs.
- **Query lenta:** ativar o **slow-query log** (Postgres `log_min_duration_statement`, `EXPLAIN ANALYZE`); contar **queries por requisição** (detecta N+1).
- **Throughput:** teste de carga leve (k6/locust) no **próprio app**.

Registre a baseline (números de front **e** back). É contra ela que se mede o ganho.

## 3. Recomendação de nível (rota de escalonamento)
1. **Sempre começe pelo `otimizacao-nivel-1`** (custo zero, sem perda perceptível). Re-meça.
2. Se as metas **não** foram atingidas e há disposição a **sacrificar UX/qualidade** → `otimizacao-nivel-2` (HITL decisivo).
3. Se ainda insuficiente e há **orçamento de infra** (CDN/Edge) → `otimizacao-nivel-3` (HITL de faturamento).

## 4. Re-medição (depois de cada nível)
Repita o passo 2 e compare com a baseline. Só conta como ganho o que aparece no número (LCP/CLS/INP/TBT/bundle).
Regressão (ex.: CLS subiu) = reverter a mudança que causou.
