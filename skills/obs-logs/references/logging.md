# Logging Estruturado — padrão

## Formato (JSON) e campos
```json
{ "timestamp": "2026-06-04T12:00:00Z", "level": "info", "message": "pedido criado",
  "service": "orders-api", "module": "orders", "correlation_id": "req-abc123",
  "user_id": "u_42", "order_id": "o_99", "duration_ms": 35 }
```
- Campos **consistentes** entre serviços (facilita query/agregação). `message` humano; contexto em campos, não na string.

## Níveis
| Nível | Quando |
|---|---|
| `error` | falha que exige ação (exceção não tratada, dependência fora) |
| `warn` | anômalo mas recuperado (retry, fallback, deprecation) |
| `info` | evento de negócio (login, pedido criado, pagamento) |
| `debug` | diagnóstico detalhado — **desligado em produção** |
> Nunca engolir exceção; logar com `error` + stack (sem segredo).

## Correlation / request id
- Middleware gera um `correlation_id` por requisição (ou propaga o recebido em header `X-Request-Id`).
- Todo log do fluxo carrega esse id → liga front → API → serviços. Essencial para investigar incidente.

## Ferramentas por stack
- **Python**: `structlog` ou `logging` com formatter JSON; nunca `print`.
- **Node/TS**: `pino` (rápido, JSON nativo) ou `winston`; nunca `console.log` em produção.
- **Front**: erros via um coletor (Sentry/console controlado) — sem dado sensível.

## Sem segredo/PII
- Nunca logar token/senha/cartão/CPF/Authorization. Mascarar PII (`j***@dominio.com`).
- Rode o scanner da `cyber-segredos` em `logs/` para confirmar.

## Agregação & retenção
- App loga em **stdout** (12-factor) → coletor (Loki/ELK/Datadog/CloudWatch).
- **Retenção** por prazo (custo + compliance LGPD — ver `cyber-dados`); nível por ambiente (`info` prod, `debug` dev).
