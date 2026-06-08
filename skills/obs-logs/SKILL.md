---
name: obs-logs
description: Montagem de logging estruturado — logger JSON, níveis, correlation-id, agregação e retenção, sem segredo/PII. Operacionaliza a norma de logging do padrao-escrita (back e front). Use ao configurar/auditar o logging de um serviço. NÃO acione proativamente.
---

# Skill: Observabilidade — Logs

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Monta o **logging estruturado** do sistema para que dê para investigar incidentes: logs em **JSON**, com
nível certo, **correlation id** ligando uma requisição ponta-a-ponta, e **sem segredo/PII**. Mutativa →
HITL ao mudar config relevante.

> A *norma* "logger estruturado, sem segredo, sem `print`/`console.log`" é do `padrao-escrita`. **Log de
> evento de segurança** e **mascaramento de PII** são do `cyber-dados`/`cyber-segredos`. Aqui é a **montagem
> operacional** (logger, níveis, correlation, agregação). Métricas/tracing/alertas → `obs-monitoramento`.

## Quando usar
- Sob demanda, ao configurar ou auditar o logging de um módulo/serviço, ou ao preparar para produção.
- Mutativa (configura logger/níveis) → HITL antes de mudar config de produção.

## Workflow
Trate **um serviço/módulo por vez**. Padrão detalhado em `references/logging.md`.

1. **Auditar o estado** — há `print`/`console.log` solto? logger estruturado? níveis usados certo? (`Grep`).
2. **Logger estruturado (JSON)** — saída JSON com campos consistentes: `timestamp`, `level`, `message`, `service`, `module`, `correlation_id`, contexto. Python: `structlog`/`logging` JSON; Node: `pino`/`winston`.
3. **Níveis corretos** — `error` (falha que exige ação), `warn` (anômalo recuperável), `info` (evento de negócio), `debug` (diagnóstico, off em prod). Sem `info` para tudo.
4. **Correlation/request id** — gerar/propagar um id por requisição (middleware) e incluí-lo em todo log do fluxo — liga front→back→serviços.
5. **Sem segredo/PII** — nunca logar token/senha/cartão/CPF; mascarar (confirme com o scanner da `cyber-segredos` em `logs/`).
6. **Agregação & retenção** — enviar para um coletor (stdout→plataforma, ELK/Loki/Datadog); definir **retenção** (prazo) e nível por ambiente.
7. **HITL + reportar** — plano → confirmar → aplicar → reportar.

## Regras e limites
- **NUNCA** use `print`/`console.log` para log de aplicação — logger estruturado (norma `padrao-escrita`).
- **NUNCA** logue segredo/PII em texto claro — mascare (ver `cyber-dados`/`cyber-segredos`).
- **NÃO** use `info`/`debug` para tudo — nível reflete severidade; `debug` desligado em produção.
- **NÃO** deixe requisição sem **correlation id** — sem ele, investigar incidente distribuído é inviável.
- **NÃO** logue sem **retenção** definida (custo/compliance) nem em formato não-parseável.
- **NÃO** saia do escopo: métricas/tracing/alertas → `obs-monitoramento`; o que logar de segurança → `cyber-dados`.

## Checklist "pronta"
- [ ] Logger estruturado (JSON) substituindo `print`/`console.log`?
- [ ] Níveis usados corretamente (`error`/`warn`/`info`/`debug`), `debug` off em prod?
- [ ] Correlation/request id gerado e propagado em todo o fluxo?
- [ ] Sem segredo/PII no log (confirmado com scanner em `logs/`)?
- [ ] Agregação configurada e retenção definida por ambiente?
- [ ] HITL feito; reportado?

## Referências (Camada 3 — leia sob demanda)
- `references/logging.md` — formato JSON, campos, níveis, correlation id, ferramentas por stack, agregação/retenção.
