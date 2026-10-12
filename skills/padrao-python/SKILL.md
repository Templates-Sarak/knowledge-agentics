---
name: padrao-python
description: Camada Python (Nível 2) do padrão Sarak — idiomas Python e um validador de limiares self-contained (scripts/validate.py). Use ao escrever, revisar ou validar código Python. Regras universais em padrao-escrita.
---

# Skill: Padrão Python (Nível 2)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Traduz o padrão universal (`padrao-escrita`) para **Python**: idiomas da linguagem + um **validador
executável** que verifica os limiares objetivos e produz um JSON consumível pelo `code-diagnostico` e
pelo futuro hook de conformidade.

> Regras universais (SRP, zero hardcoded, segredos, modularidade, testes…) vivem em `padrao-escrita`.
> Esta skill **não as redefine** — só dá a forma Python e a automação.

## Quando usar
- Proativa: ao escrever ou revisar **código Python**.
- Ao validar conformidade de um arquivo/pasta Python (rodar o validador).
- Como motor das dimensões mecânicas quando o `code-diagnostico` roda sobre um alvo Python.

## Idiomas Python do padrão
- **Arquivos** em `snake_case.py`; **classes** em `PascalCase`; **funções/variáveis** em `snake_case`;
  **constantes** em `UPPER_CASE` (constante de número/string é aceitável; segredo/URL não — vão para `.env`/`config.json`).
- **Type hints** nas assinaturas públicas (`api/`/contratos) e idealmente em tudo; validar com `mypy`.
- **Casing interno snake_case** convive com o **contrato camelCase** — a conversão é explícita no mapeador da borda (`api/src/mapeadores.py`); a lei é o `02-contrato-e-dados.md` §3.
- **Tooling complementar:** `ruff` (lint/format) e `mypy` (tipos) são recomendados, mas o **validador próprio** é a fonte de verdade dos nossos limiares (eles cobrem mais regras genéricas; o nosso garante exatamente o padrão Sarak).

## Validador — `scripts/validate.py`
Self-contained (stdlib `ast`, **zero dependências**); thresholds em `scripts/config.json` (zero hardcoded).

```
python scripts/validate.py <file-or-dir> [--config scripts/config.json]
```
Saída: JSON `{ "target", "findings": [ {path, line, dimension, severity, risk, message, rule, confidence} ] }`. Valores: `severity` high|medium|low, `risk` high|medium|low, `confidence` high|low.

**Dimensões detectadas (mecânicas):**
- `thresholds` — função > maxFunctionLines, aninhamento > maxNesting, params > maxParams.
- `logging` — `print(...)`; exceção engolida (`except:` amplo ou `except ...: pass`).
- `typing` — função pública sem anotação completa (params/retorno).
- `secrets` — literal em nome sensível (`token`, `api_key`, `password`…) → severity **high**.
- `hardcoded` (heurística) — número mágico fora do allowlist (e fora de constante `UPPER_CASE`) e URL/host literal → marcados com `confidence: "low"` (o agente triagem os falsos positivos).

O que exige **julgamento** (SRP, acoplamento entre módulos, "é segredo de verdade?") **não** é do validador — fica com o agente/`code-diagnostico`.

## Regras e limites
- **NÃO** trate a saída de `confidence: "low"` (hardcoded heurístico) como verdade absoluta — é candidato a revisão, pode ser falso positivo.
- **NUNCA** adicione dependência externa ao validador — ele é stdlib puro, roda em qualquer ambiente com Python.
- **NÃO** embuta limiares no script — todos vêm de `config.json`.
- **NÃO** redefina as regras universais aqui — em dúvida, leia `padrao-escrita`.
- **NÃO** saia do escopo: dimensões de julgamento (SRP, acoplamento, dados, API) são consolidadas pelo `code-diagnostico`, não pelo validador.

## Checklist "pronta"
- [ ] Arquivos `snake_case.py`, classes `PascalCase`, constantes `UPPER_CASE`?
- [ ] Assinaturas públicas tipadas (passam no `mypy`)?
- [ ] `validate.py` roda sem dependências externas e lê os limiares do `config.json`?
- [ ] Saída do validador é JSON no formato de dimensões do `backlog-format.md`?
- [ ] Hardcoded heurístico marcado com `confidence: "low"`?

## Referências (Camada 3 — leia sob demanda)
- `references/idioms.md` — idiomas Python detalhados e o mapeamento regra-universal → forma Python / como o validador detecta.
- `scripts/validate.py` + `scripts/config.json` — o validador e seus parâmetros.
