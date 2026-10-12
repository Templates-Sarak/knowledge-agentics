# Exemplos: code-diagnostico

## Exemplo bom — backlog priorizado e acionável

### Cenário
Repo `loja` com dois módulos backend (`orders`, `users`), **nenhum com testes**.
`orders/order_service.py` tem timeout fixo, função de 70 linhas e usa `print` para log;
`users/api/routes.py` expõe `POST /api/createUser` e monta SQL por concatenação de input.

### Saída (backlog)
```json
{
  "target": "./loja",
  "generatedAt": "2026-06-03",
  "summary": {
    "modules": 2,
    "findings": 5,
    "byDimension": { "hardcoded": 1, "thresholds": 1, "logging": 1, "api": 1, "validation": 1 },
    "modulesWithoutTests": 2
  },
  "items": [
    { "id": "orders", "kind": "module", "status": "pending", "risk": "low", "coverage": "untested",
      "files": [{ "path": "backend/orders/order_service.py", "findings": [
        { "line": 12, "dimension": "hardcoded", "severity": "high", "risk": "low",
          "message": "timeout 30 fixo", "rule": "zero hardcoded → config.json" },
        { "line": 28, "dimension": "logging", "severity": "medium", "risk": "low",
          "message": "print() no lugar de logger", "rule": "logger estruturado, sem print" },
        { "line": 45, "dimension": "thresholds", "severity": "medium", "risk": "medium",
          "message": "função de 70 linhas", "rule": "função ≤ 40 linhas" } ]}]},
    { "id": "users", "kind": "module", "status": "pending", "risk": "high", "coverage": "untested",
      "files": [{ "path": "backend/users/api/routes.py", "findings": [
        { "line": 8, "dimension": "api", "severity": "medium", "risk": "medium",
          "message": "POST /api/createUser — verbo no path, sem /v1", "rule": "REST /api/v1/, sem verbo" },
        { "line": 15, "dimension": "validation", "severity": "high", "risk": "medium",
          "message": "SQL montado por concatenação de input não validado", "rule": "validar na borda + query parametrizada" } ]}]}
  ]
}
```

**Por que é bom:** agrupado por módulo→arquivo; cada achado com `line`, dimensão, severidade, risco e a
regra violada; cada módulo com `coverage` (`untested` aqui — sobe o risco e avisa que a adequação
precisará de caracterização); ordenado com os quick wins de baixo risco (hardcoded, logging) antes do
módulo de risco alto; resumo quantitativo por dimensão no topo. A `code-adequacao` pega item a item daqui.

---

## Exemplo ruim — lista plana sem priorização

### Estado incorreto
```
- order_service.py tem código ruim
- routes.py: rota errada
- tem uns valores hardcoded por aí
- a função é grande demais
```

**Por que é ruim:**
| Problema | Impacto |
|----------|---------|
| Sem `file:line` | A remediação não sabe onde agir; precisa re-investigar tudo. |
| Sem dimensão/regra | Não dá para saber qual padrão foi violado nem como corrigir. |
| Sem severidade/risco | Impossível priorizar; pode-se atacar o item arriscado primeiro e quebrar o sistema. |
| Lista plana (sem módulo) | Perde a unidade de trabalho (módulo→arquivo) que a adequação usa. |
| Sem `coverage` por módulo | Não sinaliza falta de testes — a adequação não sabe que precisa de caracterização nem ajusta o risco. |
| "código ruim", "por aí" | Vago — diagnóstico subjetivo, não acionável. |
| Não é JSON | A orquestração não consegue consumir programaticamente. |
