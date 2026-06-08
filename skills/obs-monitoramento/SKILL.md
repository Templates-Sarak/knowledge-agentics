---
name: obs-monitoramento
description: Montagem de métricas, tracing e alertas — RED/USE, healthchecks, tracing OpenTelemetry, dashboards e alertas/SLO. Use ao instrumentar um serviço, montar dashboards/alertas ou definir SLOs. NÃO acione proativamente.
---

# Skill: Observabilidade — Métricas, Tracing & Alertas

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Dá **visibilidade do comportamento em produção** além dos logs: o que está lento, o que está quebrando, e
**avisa antes do usuário reclamar**. Instrumenta métricas e tracing e configura alertas acionáveis.
Mutativa → HITL ao mexer em config/alertas de produção.

> Logs estruturados são da `obs-logs` (complementar — os 3 pilares: logs, métricas, traces). O que **logar
> de segurança** é do `cyber-dados`. Performance (otimizar o que o monitoramento revelou) → `otimizacao-*`.
> Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao instrumentar um serviço, montar dashboards/alertas, ou definir SLOs.
- Antes/depois de publicar algo crítico (ter sinal para detectar regressão).
- Mutativa (instrumenta/configura alertas) → HITL antes de produção.

## Workflow
Trate **um serviço por vez**. Detalhe em `references/monitoramento.md`.

1. **Definir o que medir** — escolha o modelo: **RED** (Rate, Errors, Duration) para serviços/APIs; **USE** (Utilization, Saturation, Errors) para recursos (CPU/mem/DB). Comece pelos endpoints/fluxos críticos.
2. **Instrumentar métricas** — contadores/histogramas (Prometheus/OpenTelemetry): req/s, taxa de erro, latência (p50/p95/p99). Exponha `/metrics`.
3. **Healthchecks** — `/health` (liveness) e `/ready` (readiness: DB/dependências ok) para orquestrador/load balancer.
4. **Tracing distribuído** — OpenTelemetry: propagar o trace por serviço (reusa o correlation id da `obs-logs`); enxergar a cascata de uma requisição lenta.
5. **Dashboards** — painel com RED dos fluxos críticos + saturação de recursos (Grafana/Datadog).
6. **Alertas / SLO** — defina **SLO** (ex.: p95 < 300ms, erro < 1%) e alerte sobre **sintoma** (erro/latência alta), não sobre causa ruidosa; alerta **acionável** (com runbook), sem fadiga de alerta.
7. **HITL + reportar** — plano de instrumentação/alertas → confirmar → aplicar → reportar.

## Regras e limites
- **NÃO** alerte sobre o que não é **acionável** — alerta sem ação vira fadiga e é ignorado (perde o que importa).
- **NÃO** meça vaidade — meça **RED/USE** ligado a impacto no usuário (latência/erro/disponibilidade).
- **NÃO** instrumente sem **cardinalidade controlada** — label com user_id/ids únicos explode a métrica.
- **NÃO** exponha `/metrics`/healthchecks com dado sensível nem publicamente sem proteção.
- **NÃO** deixe serviço crítico **sem alerta** de erro/latência nem sem healthcheck.
- **NÃO** saia do escopo: logs → `obs-logs`; corrigir a lentidão achada → `otimizacao-*`; o que logar de segurança → `cyber-dados`.

## Checklist "pronta"
- [ ] Métricas RED (serviço) / USE (recursos) dos fluxos críticos expostas?
- [ ] Healthchecks `/health` e `/ready` (com dependências)?
- [ ] Tracing distribuído propagando o id (ligado à `obs-logs`)?
- [ ] Dashboard com RED + saturação?
- [ ] SLO definido e alertas **acionáveis** (com runbook), sem fadiga, sobre sintoma?
- [ ] Cardinalidade controlada; `/metrics` protegido; HITL feito?

## Referências (Camada 3 — leia sob demanda)
- `references/monitoramento.md` — RED/USE, Prometheus/OpenTelemetry, healthchecks, tracing, dashboards e SLO/alertas.
