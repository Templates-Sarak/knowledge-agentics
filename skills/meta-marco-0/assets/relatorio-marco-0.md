# Relatório do marco-0 — <sistema>

> Vai no corpo do PR `marco-0` → `main` (os commits da branch somem no squash). Segredos **sempre
> mascarados**; arquivo + natureza, nunca o valor.

## Veredito da conferência (Fase C)

| Critério | Antes (linha de base) | Depois | Resultado |
|---|---|---|---|
| Build | | | |
| Testes | | | |
| Gate (`validate.mjs --all`) | | | |
| Paridade de schema (`schema_parity.py`) | — | `proven` / `divergent` / `not-proven` | |
| `spec-revisao` | | | |
| Manifesto `marco-0.protect` intacto | | | |

> Paridade `not-proven` ou `divergent` → não há PR. Corrija e rode de novo.

## Remoções

| Plan | Alvo | Classe | Prova de ausência de referência |
|---|---|---|---|
| m0-01 | | | |
| m0-02 | | migration nunca aplicada | |
| m0-03 | | ADR absorvida em `<spec>` | |

## Preservado de propósito
- `.env`, templates de recriação, manifesto, ADR-000 e ADRs com exceção viva, migrations aplicadas.

## Propostas para o dev (nada foi executado)
- Credenciais que valeria rotacionar antes de produção: <lista mascarada>.
- Squash de migrations (opcional, por ambiente): ver `runbook-operador.md`.

## Publicação
- `check_publish.py`: <resultado> · tag `v1.0.0` · `develop` · proteção da `main`: <aplicada / lacuna do plano>
