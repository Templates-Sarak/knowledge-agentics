# Ferramentas de Teste por Stack

Idiomas da linguagem vêm de `padrao-python` / `padrao-typescript`. Testes ficam em `tests/` do módulo (`padrao-escrita` §9).

## Python — `pytest`
```bash
<SARAK_PYTHON_VENV> -m pytest                          # roda a suíte (consulte a Tabela de Roteamento)
<SARAK_PYTHON_VENV> -m pytest --cov=<modulo> --cov-report=term-missing   # cobertura (pytest-cov)
```
- **Fixtures** (`@pytest.fixture`) para arrange reutilizável; `tmp_path` para fs.
- **Mock**: `monkeypatch` (patch leve) ou `unittest.mock`/`pytest-mock` (`mocker`).
- Parametrização: `@pytest.mark.parametrize` para edge cases.

## TypeScript/JavaScript — `vitest` (ou `jest`)
```bash
<SARAK_NODE_BIN>/vitest run                      # roda a suíte (jest: <SARAK_NODE_BIN>/jest)
vitest run --coverage           # cobertura (v8/istanbul)
```
- **Mock**: `vi.mock('modulo')` / `vi.fn()` (jest: `jest.mock`/`jest.fn`).
- **Fake timers**: `vi.useFakeTimers()` para controlar tempo.
- Componentes React: Testing Library (`@testing-library/react`) — testar comportamento, não markup.

## Go — `go test`
```bash
go test ./...                   # roda a suíte
go test -cover ./...            # cobertura por pacote (coverage: NN% of statements)
```
- **Table-driven tests** (slice de casos `{nome, entrada, esperado}`) para edge cases.
- Mock por interface (injete a dependência); `httptest` para HTTP.

## Java — `JUnit` + `JaCoCo`
```bash
mvn test                        # roda a suíte (JUnit 5)
mvn jacoco:report               # gera target/site/jacoco/jacoco.csv|html (cobertura)
```
- Mock: Mockito (`@Mock`/`when(...).thenReturn(...)`); só I/O externo.
- Gradle: `./gradlew test jacocoTestReport`.

## Integração
- Suba o real do módulo (`api/`+`domain/`+`data/`) contra um **DB de teste** (container/sqlite/em memória), não mocks.
- Resete o estado entre testes (transação com rollback ou recriar schema).

## Cobertura
- Meta **~80% por módulo** (sinal de saúde, não gate dogmático). Olhe `term-missing`/relatório para caminhos críticos descobertos.
- Cobertura alta com asserts fracos não vale — priorize asserts significativos.
- **Gate no push (hook `test-cobertura`)**: o mínimo vem de `hooks/config.json → cobertura.minima` (default 80).
  No modo `ask` (default), abaixo do mínimo o push **pede aprovação do usuário** — não é bloqueio dogmático.
  Comandos acima são os que o hook usa para medir; mantenha-os funcionando para o gate medir certo.
