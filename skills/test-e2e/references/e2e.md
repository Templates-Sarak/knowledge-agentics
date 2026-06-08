# E2E — ferramentas e práticas

## UI — Playwright (preferido) / Cypress
```bash
npx playwright test            # roda; --headed para ver; --trace on para depurar
npx playwright codegen <url>   # gera o esqueleto interagindo
```
- **Auto-wait**: Playwright espera o elemento ficar acionável — não use `sleep`.
- **Seletores estáveis**: `getByTestId('...')`, `getByRole('button', { name: '...' })`. Evite CSS/texto volátil.
- **Isolamento**: cada teste cria seu estado (login via API/fixture), não depende de outro.
- Cypress é alternativa; mesmos princípios (seletor estável, sem espera fixa).

## API — end-to-end de contrato
- Node: `supertest` contra o app; Python: `httpx`/`requests` contra a instância de teste.
- Cubra a jornada da API: criar → ler → atualizar → erro de permissão (403) → validação (422).

## Dados & ambiente
- **Ambiente próprio**: local ou staging — nunca produção de terceiros.
- **Seed/teardown**: prepare dados no início, limpe no fim (ou banco efêmero por execução).
- Login: prefira autenticar via API/token (rápido) a clicar no formulário em todo teste.

## Anti-flaky
- Espere por **condição/estado** (elemento visível, resposta chegou), nunca `sleep(n)`.
- Sem dependência de ordem; sem rede externa real (mocke serviços de terceiros na borda quando possível).
- Habilite **trace/screenshot/vídeo** em falha para diagnóstico.

## Quanto cobrir
- 3–7 jornadas críticas (login, cadastro, fluxo principal, pagamento). E2E é caro — o resto é `test-unitario`.
