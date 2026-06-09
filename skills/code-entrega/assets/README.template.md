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
Cada módulo é uma fatia vertical (`api/` público, `domain/`/`data/` privados). Ver `PADRAO-ORGANIZACAO`.

| Módulo | Responsabilidade |
|---|---|
| `backend/[modulo]` | [o que faz] |
| `frontend/[modulo]` | [o que faz] |

## API
Contratos REST em `/api/v1/` (plural kebab-case, payload camelCase). Ex.: `GET /api/v1/[recursos]`.
Detalhe por módulo em `backend/[modulo]/api/` (ou `docs/`).

## Testes
```bash
[npm test | <SARAK_PYTHON_VENV> -m pytest | <SARAK_NODE_BIN>/jest]
```
Cobertura-alvo: ~80% por módulo (sinal de saúde, não gate).

## Licença e Autoria
Licença: [SPDX — ex.: MIT]

Autor: [NOME]
Desenvolvido por [NOME]
