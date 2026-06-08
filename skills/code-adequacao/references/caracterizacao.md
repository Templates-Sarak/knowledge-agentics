# Testes de Caracterização (rede de segurança sem suíte)

Leia ao adequar um item que **não tem testes**. Objetivo: capturar o comportamento **atual** do código
(mesmo que imperfeito) para que a refatoração possa provar que **nada mudou**.

---

## Princípio

Teste de caracterização ≠ teste de especificação. Ele **não** verifica o que o código *deveria* fazer —
verifica o que ele *faz hoje*. Se o legado tem um comportamento estranho, o teste fixa esse comportamento
estranho. Assim, se a refatoração quebrar algo, o teste acende vermelho.

> Se o comportamento atual é claramente um **bug**, **não** o "conserte" aqui: registre como item à
> parte. A adequação preserva comportamento; correção de bug é outra tarefa.

---

## Passo a passo

1. **Achar as bordas do item** — identifique as entradas (funções públicas, rotas, `api/`) e saídas
   (retornos, efeitos, respostas HTTP) do módulo/arquivo. Teste pela **borda pública**, não pelos internals
   (eles vão mudar na refatoração).
2. **Capturar saídas reais** — para entradas representativas (caminho feliz, vazio, erro, limites),
   execute o código atual e **registre a saída observada** como o valor esperado do teste.
3. **Cobrir o que a refatoração vai tocar** — priorize os caminhos das funções/linhas que serão
   refatoradas. Não precisa de 100% — precisa cobrir o comportamento em risco.
4. **Rodar e confirmar verde** — a suíte de caracterização tem que passar **antes** de qualquer
   refatoração. Verde aqui = rede montada.
5. **Refatorar e re-rodar** — após cada mudança, a mesma suíte deve continuar verde. Vermelho = a
   refatoração alterou comportamento → reverter.

---

## Dicas por tipo de borda

- **Função pura** → entrada → saída esperada (snapshot do valor atual).
- **Rota HTTP** → request → status + corpo atuais (snapshot da resposta).
- **Efeito colateral (DB, arquivo, fila)** → use dublê/mocks na borda e asserte a **chamada** feita
  (argumentos), não o estado interno.
- **Saída grande/complexa** → snapshot serializado (golden file) do resultado atual.

---

## Anti-padrões

- ❌ Testar internals que vão sumir na refatoração (acopla o teste ao código velho).
- ❌ Escrever o teste com o comportamento "ideal" — ele falharia antes mesmo de refatorar.
- ❌ Refatorar primeiro e escrever teste depois — perde a referência do comportamento original.
- ❌ "Aproveitar" e corrigir um bug no meio — mistura adequação com mudança funcional.
