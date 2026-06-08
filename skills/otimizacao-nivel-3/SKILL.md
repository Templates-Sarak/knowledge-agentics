---
name: otimizacao-nivel-3
description: Otimização de performance por infraestrutura paga (front + back) — Image CDN/edge/ISR; cache gerenciado, read replicas, DB na borda, filas/autoscaling — com HITL de faturamento. Use APENAS quando pedirem otimização com investimento em infraestrutura. NÃO acione proativamente.
---

# Skill: Otimização Nível 3 — Infraestrutura (paga)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita, otimizacao-nivel-2`. Consulte-as antes de iniciar.

Terceiro degrau: quando código (Nível 1) e concessões (Nível 2) não bastam, ganha-se velocidade com
**infraestrutura de ponta paga**, **sem** sacrificar qualidade — movendo entrega e processamento para a
**borda** (Edge/CDN global). Envolve **dinheiro** → HITL de faturamento obrigatório. Mutativa.

> Medição e escada em `references/diagnostico-performance.md` (mora em `otimizacao-nivel-1`). Catálogo de
> serviços (rot-prone) em `references/fornecedores.md`. A parte Vercel (Edge/ISR/env) se conecta ao
> `deploy-vercel` — configure lá o que for de deploy. Cobre **frontend e backend**. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, para público global/múltiplas regiões, ou quando há **orçamento** e Níveis 1–2 não bastaram.
- Quando o volume exige escala automática/descentralizada e a experiência "premium" é inegociável.
- Mutativa (configura serviços e gasta dinheiro) → HITL de faturamento obrigatório.

## Workflow
Trate **um projeto por vez**.

1. **Medir baseline** — `references/diagnostico-performance.md`; foque em **TTFB** (latência de origem), entrega de ativos e latência de DB. Registre os números e o que Níveis 1–2 já entregaram.
2. **Mapear gargalos de origem** — onde o servidor central atrasa: ativos sem CDN, APIs com TTFB alto, DB central distante do usuário.
3. **Selecionar serviços** — escolha do catálogo (`references/fornecedores.md`) conforme o gargalo: **front** — Image CDN (mídia), Edge/Middleware (lógica), ISR/edge render (HTML); **back** — **cache gerenciado** (Redis/Upstash), **read replicas** (escalar leitura), **DB na borda** (dados globais), **fila/worker** (offload async), **autoscaling**.
4. **HITL de faturamento** — apresente a proposta de `assets/plano_investimento.md` (serviço · propósito · **custo estimado/mês** · ganho). → "⚠️ Confirma o investimento?". **Aguarde.**
5. **Configurar** — chaves no **`.env`** (nunca versionar; vars prefixadas por módulo, ver `padrao-escrita`); adaptadores no código (ex.: image loader → CDN); lógica crítica → Edge. Vercel: faça a config de deploy via `deploy-vercel`.
6. **Re-medir** — compare TTFB/LCP/latência globais com a baseline; confirme o ganho. Sem ganho proporcional ao custo → reavaliar o serviço.
7. **Reportar** — novas origens/URLs, métricas pós-investimento e custo recorrente.

## Regras e limites
- **NUNCA** ative serviço pago, contrate plano ou exponha faturamento sem o **HITL** do passo 4.
- **NUNCA** versione chaves/segredos dos serviços — vão no `.env` (`.gitignore`), com `.env.example` (ver `padrao-escrita`/`CLAUDE.md`).
- **NUNCA** otimize sem baseline e re-medição — investir sem provar ganho é desperdício.
- **NÃO** comece por aqui sem ter passado por Níveis 1 e 2 (dinheiro é o último recurso, não o primeiro).
- **NÃO** trate preços/limites do catálogo como fixos — confirme no fornecedor (mudam); `fornecedores.md` é referência, não cotação.
- **NÃO** duplique a config de deploy da Vercel — isso é do `deploy-vercel`; aqui se decide e integra a infra.

## Checklist "pronta"
- [ ] Baseline medida (TTFB/LCP/latência) e Níveis 1–2 esgotados?
- [ ] Gargalos de origem mapeados (ativos/API/DB)?
- [ ] Serviços escolhidos do catálogo conforme o gargalo?
- [ ] HITL de faturamento feito e investimento aprovado?
- [ ] Chaves no `.env` (não versionadas); config de deploy via `deploy-vercel` quando aplicável?
- [ ] Re-medição confirma ganho proporcional ao custo?
- [ ] Origens/métricas/custo recorrente reportados?

## Referências (Camada 3 — leia sob demanda)
- `../otimizacao-nivel-1/references/diagnostico-performance.md` — medição compartilhada (CWV/TTFB, como medir, escada).
- `references/fornecedores.md` — catálogo de serviços (Image CDN, Edge, DB na borda, ISR) com propósito e faixa de custo.
- `assets/plano_investimento.md` — template da proposta de investimento (HITL de faturamento).
