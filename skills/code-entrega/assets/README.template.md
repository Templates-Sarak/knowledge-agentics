# [NOME DO PROJETO]

[Uma linha: o que este projeto é/faz.]

## Visão geral
[Propósito, contexto e a quem serve. 1–3 parágrafos.]

## Stack
- [Linguagem/framework principal]
- [Banco / infra relevante]

## Setup & execução
**Pré-requisitos:** [ex.: Node 20+, Python 3.12+]

```bash
# 1. Variáveis de ambiente
cp .env.example .env   # preencha os valores

# 2. Instalar
[npm install | pip install -r requirements.txt]

# 3. Rodar
[npm run dev | uvicorn main:app --reload]

# 4. Build
[npm run build]
```

## Arquitetura modular
Cada módulo é uma fatia vertical em `modulos/<modulo>/`: `api/` é a única superfície pública, `core/` é
interno (`dominio`, `motor`, `portas`, `gateways`), e `contrato/openapi.yaml` é a fonte do contrato.
Dado de outro módulo vem por **HTTP**, num gateway em `core/gateways/`, declarado em `modulo.json:consome` —
nunca por import nem por tabela alheia. Anatomia: `specs/arquitetura/01-modulo.md`. Regras:
`specs/arquitetura/04-regras.md`.

| Módulo | Responsabilidade |
|---|---|
| `modulos/[modulo]` | [o que faz] |
| `frontend/[modulo]` | [o que faz] |

## API
Contratos REST em `/api/v1/<modulo>`, segmentos kebab-case **sem verbo**, payload camelCase — cobrado por
`rota-nomenclatura`. Recurso no plural é convenção, sem verificador (§3.1). Ex.: `GET /api/v1/[modulo]/[recursos]`.
O contrato de cada módulo é `modulos/[modulo]/contrato/openapi.yaml` (ou `docs/`, para a visão de conjunto).

## Testes
```bash
[npm test | <SARAK_PYTHON_VENV> -m pytest | <SARAK_NODE_BIN>/jest]
```
Cobertura-alvo: ~80% por módulo (sinal de saúde, não gate).

## Licença e Autoria
Licença: [SPDX — ex.: MIT]

Autor: [NOME]
Desenvolvido por [NOME]
