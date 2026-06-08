# Monitoramento — métricas, tracing, alertas

## O que medir
- **RED** (serviços/APIs): **R**ate (req/s), **E**rrors (taxa de erro), **D**uration (latência p50/p95/p99).
- **USE** (recursos): **U**tilization, **S**aturation, **E**rrors (CPU, memória, conexões de DB, fila).
> Comece pelos endpoints/fluxos críticos; meça impacto no usuário, não vaidade.

## Instrumentação
- **Prometheus / OpenTelemetry**: contadores (`http_requests_total`), histogramas (`http_request_duration_seconds`).
- Exponha `/metrics`; scrape pelo Prometheus (ou push via OTel collector).
- **Cardinalidade**: rótulos de baixa cardinalidade (rota, método, status) — **nunca** user_id/ids únicos como label.

## Healthchecks
- `/health` (liveness): o processo está vivo.
- `/ready` (readiness): dependências (DB, cache, fila) respondem → o orquestrador só roteia se pronto.

## Tracing distribuído
- **OpenTelemetry**: cada requisição gera um trace; propague o contexto (header `traceparent`) entre serviços.
- Reuse o **correlation id** da `obs-logs` para casar log ↔ trace.
- Vê a cascata: qual span (DB? serviço externo?) custou a latência.

## Dashboards
- Painel por serviço: RED dos fluxos + saturação de recursos. Ferramenta: Grafana, Datadog, etc.

## SLO & alertas
- **SLO**: meta mensurável (ex.: p95 < 300ms; disponibilidade 99,9%; erro < 1%).
- Alerte sobre **sintoma** (latência/erro/disponibilidade fora do SLO), não sobre causa ruidosa (CPU 80% sozinho).
- Todo alerta é **acionável** (tem runbook: o que fazer). Sem alerta inacionável → evita fadiga.
- Burn-rate de error budget para alertas de SLO (rápido + lento).
