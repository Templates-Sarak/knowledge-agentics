# Exemplos: code-diagnostico

## Exemplo bom — backlog priorizado e acionável

### Cenário
Repo `loja` com dois módulos backend (`orders`, `users`), **nenhum com testes**.
`orders/order_service.py` tem timeout fixo, função de 70 linhas e usa `print` para log;
`users/api/routes.py` expõe `POST /api/createUser` e monta SQL por concatenação de input.

### Saída (backlog)
```json
{
  "alvo": "./loja",
  "geradoEm": "2026-06-03",
  "resumo": {
    "modulos": 2,
    "violacoes": 5,
    "porDimensao": { "hardcoded": 1, "limiares": 1, "logging": 1, "api": 1, "validacao": 1 },
    "modulosSemTestes": 2
  },
  "itens": [
    { "id": "orders", "tipo": "modulo", "status": "pending", "risco": "baixo", "cobertura": "sem-testes",
      "arquivos": [{ "caminho": "backend/orders/order_service.py", "violacoes": [
        { "linha": 12, "dimensao": "hardcoded", "severidade": "alta", "risco": "baixo",
          "descricao": "timeout 30 fixo", "regra": "zero hardcoded → config.json" },
        { "linha": 28, "dimensao": "logging", "severidade": "media", "risco": "baixo",
          "descricao": "print() no lugar de logger", "regra": "logger estruturado, sem print" },
        { "linha": 45, "dimensao": "limiares", "severidade": "media", "risco": "medio",
          "descricao": "função de 70 linhas", "regra": "função ≤ 40 linhas" } ]}]},
    { "id": "users", "tipo": "modulo", "status": "pending", "risco": "alto", "cobertura": "sem-testes",
      "arquivos": [{ "caminho": "backend/users/api/routes.py", "violacoes": [
        { "linha": 8, "dimensao": "api", "severidade": "media", "risco": "medio",
          "descricao": "POST /api/createUser — verbo no path, sem /v1", "regra": "REST /api/v1/, sem verbo" },
        { "linha": 15, "dimensao": "validacao", "severidade": "alta", "risco": "medio",
          "descricao": "SQL montado por concatenação de input não validado", "regra": "validar na borda + query parametrizada" } ]}]}
  ]
}
```

**Por que é bom:** agrupado por módulo→arquivo; cada violação com `linha`, dimensão, severidade, risco e a
regra violada; cada módulo com `cobertura` (`sem-testes` aqui — sobe o risco e avisa que a adequação
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
| Sem `arquivo:linha` | A remediação não sabe onde agir; precisa re-investigar tudo. |
| Sem dimensão/regra | Não dá para saber qual padrão foi violado nem como corrigir. |
| Sem severidade/risco | Impossível priorizar; pode-se atacar o item arriscado primeiro e quebrar o sistema. |
| Lista plana (sem módulo) | Perde a unidade de trabalho (módulo→arquivo) que a adequação usa. |
| Sem `cobertura` por módulo | Não sinaliza falta de testes — a adequação não sabe que precisa de caracterização nem ajusta o risco. |
| "código ruim", "por aí" | Vago — diagnóstico subjetivo, não acionável. |
| Não é JSON | A orquestração não consegue consumir programaticamente. |
