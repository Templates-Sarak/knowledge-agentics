# Exemplos: code-adequacao

## Exemplo bom — adequação com rede de segurança

### Cenário
Item do backlog: `backend/orders/order_service.py` — função `process` de 70 linhas, timeout `30` fixo,
sem testes.

### Sequência
1. **Caracterização (sem suíte):** testes pela borda pública `process(order)` capturando a saída atual
   para caminho feliz, lista vazia e pedido inválido. Rodou → **verde**.
2. **HITL — Plano:** "Vou extrair o timeout para `config.json`, quebrar `process` em
   `validate` + `persist` + `notify` (cada ≤ 40 linhas) e aplicar guard clauses. Risco: baixo. Os
   testes de caracterização protegem a saída de `process`. Confirma?" → confirmado.
3. **Refatorar (preservando comportamento):**

**Antes:**
```python
def process(order):                       # 70 linhas, timeout mágico, aninhado
    if order:
        if order.items:
            client = Client(timeout=30)   # hardcoded
            ...
```
**Depois:**
```python
# config.json → { "requestTimeout": 30 }
def process(order):                       # < 40 linhas, guard clauses
    if not order or not order.items:      # guard clause
        raise InvalidOrderError()
    client = Client(timeout=config.requestTimeout)   # sem hardcoded
    validated = _validate(order)
    return _persist(validated)
```
4. **Verificar:** mesma suíte de caracterização → **verde** (comportamento preservado).
5. **Reportar:** `{ "id": "orders", "status": "done", "mudancas": ["hardcoded→config", "SRP", "guard clauses"] }`.

**Por que é bom:** rede montada antes; HITL antes de mudar; comportamento preservado e provado por testes
verdes; só as violações do item foram tocadas.

---

## Exemplo ruim — refatorou às cegas

### Estado incorreto
Sem escrever teste nenhum, a função de 70 linhas foi quebrada em 4 funções, o timeout virou config, e
"de quebra" trocou-se um `>=` por `>` que "parecia errado". Commit: "refactor orders".

**Por que é ruim:**
| Problema | Impacto |
|----------|---------|
| Sem testes antes | Não há como saber se a quebra preservou o comportamento. |
| Mudou `>=` → `>` | Alterou comportamento no meio da adequação (mistura bug-fix com refatoração). |
| Sem HITL | Mudança mutativa sem confirmação do usuário. |
| Vários itens de uma vez | Se algo quebrar, não dá pra isolar qual mudança causou. |
| "parecia errado" | Decisão subjetiva sem evidência; pode ter quebrado uma regra de negócio real. |

**Consequência:** regressão silenciosa em produção, difícil de rastrear — exatamente o que a rede de
caracterização + HITL existem para impedir.
