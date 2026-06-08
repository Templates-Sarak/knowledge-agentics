# Estratégia de Testes

## Pirâmide
- **Base — unitários** (muitos, rápidos): uma unidade/função, isolada de I/O.
- **Meio — integração** (alguns): módulos reais conversando (ex.: `api/` + `domain/` + DB de teste).
- **Topo — e2e** (poucos, lentos): fluxo do usuário ponta-a-ponta → skill `test-e2e`.
> Se está difícil testar, geralmente é acoplamento — refatore (extrair, injeção de dependência), não mocke tudo.

## O que testar (prioridade)
- **Lógica de negócio** e regras (cálculos, validações, máquinas de estado).
- **Edge cases**: vazio, nulo, limite, negativo, duplicado, concorrência.
- **Contratos da borda** (`api/`): entrada inválida rejeitada, saída no formato certo, erros mapeados.

## O que NÃO testar
- Getters/setters triviais, código de framework, libs de terceiros (confie nelas).
- Detalhes de implementação privados (quebram a cada refator sem agregar).

## Padrão AAA
```
# Arrange — prepara dados/dependências
# Act     — executa a unidade
# Assert  — verifica o resultado/efeito
```
Um comportamento por teste; o nome descreve o caso (`deve_rejeitar_pedido_sem_itens`).

## Test doubles (use o mínimo)
- **Stub**: retorna valor fixo. **Mock**: verifica interação. **Fake**: implementação leve (DB em memória). **Spy**: registra chamadas.
- Mocke só **I/O externo** (rede, DB, relógio, fs, terceiros). **Nunca** mocke o alvo do teste.

## Determinismo (anti-flaky)
- Controle **tempo** (injetar `now`), **aleatório** (seed), e dependências de **rede** (fake).
- Testes independentes de ordem; sem `sleep`; sem estado global compartilhado entre testes.
