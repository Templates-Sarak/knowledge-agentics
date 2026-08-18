# Ambiente efêmero — Testcontainers por stack, e a asserção dupla

Molde copiável para os passos 2–4 do `SKILL.md`: subir o banco limpo, rodar as migrations, testar o
endpoint, e provar a persistência lendo direto do banco.

## Setup/teardown por stack

**TypeScript/JavaScript — `testcontainers`**
```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let container;
let dbUrl;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  dbUrl = container.getConnectionUri();
  await executarMigrations(dbUrl);              // aplica database/migrations/*.sql em ordem
});

afterAll(async () => {
  await container.stop();                        // destrói o container — nada persiste entre baterias
});
```

**Python — `testcontainers-python`**
```python
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def banco_efemero():
    with PostgresContainer("postgres:16-alpine") as container:
        aplicar_migrations(container.get_connection_url())
        yield container.get_connection_url()
    # o "with" já destrói o container ao sair do escopo — teardown garantido mesmo com teste falhando
```

**Java — `testcontainers` + JUnit 5**
```java
@Testcontainers
class EndpointIntegrationTest {
  @Container
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

  @BeforeAll
  static void migrar() { Flyway.configure().dataSource(postgres.getJdbcUrl(), ...).load().migrate(); }
  // @Testcontainers + @Container já cuidam do teardown ao fim da classe
}
```

**Go — `testcontainers-go`**
```go
func TestMain(m *testing.M) {
    ctx := context.Background()
    container, _ := postgres.RunContainer(ctx, testcontainers.WithImage("postgres:16-alpine"))
    defer container.Terminate(ctx)               // teardown garantido mesmo com t.Fatal no meio
    aplicarMigrations(container.MustConnectionString(ctx))
    os.Exit(m.Run())
}
```

## A asserção dupla, como código

O passo 4 do `SKILL.md` não é "chame o endpoint e confira o status" — é as duas verificações juntas, ou o
teste não prova persistência nenhuma:

```typescript
test('POST /registros persiste o registro', async () => {
  const resposta = await request(app).post('/api/v1/<modulo>/registros').send({ titulo: 'x' });

  // asserção 1 — o contrato HTTP
  expect(resposta.status).toBe(201);
  expect(resposta.body.hash).toBeDefined();

  // asserção 2 — o estado real no banco, lido DIRETO (sem passar pela API de volta)
  const linha = await db.query('SELECT * FROM <modulo>_registros WHERE hash = $1', [resposta.body.hash]);
  expect(linha.rows).toHaveLength(1);
  expect(linha.rows[0].titulo).toBe('x');
});
```

Só a asserção 1 prova que a API respondeu certo — não prova que persistiu. Só a asserção 2 prova que o
dado existe — não prova que a rota devolveu o contrato certo. As duas juntas são o que esta skill existe
para cobrir, e é o que a diferencia do `test-unitario` (que mocka a persistência) e do `test-e2e` (que
não lê o banco diretamente, só observa através da UI/API).

## Onde isto mora num projeto do template modular — a correção que importa

**Isto não entra em `modules/<modulo>/tests/`.** A árvore de testes do módulo (`domain/`, `contract/`,
`web/`, `fixtures/`) roda **inteira** com `adapters/memory` — é lei, não escolha de estilo
(`specs/arquitetura/03-operacao.md` §5: *"Se um teste do módulo precisa de infraestrutura, a porta está
mal desenhada ou o adapter de memória está faltando"*). Um teste do módulo que suba um Testcontainer
reprovaria a própria doutrina que o gate cobra — não existe pasta `tests/integracao/` no molde, de
propósito (`04-regras.md` §7.1 documenta a remoção explícita dessa regra).

A validação contra banco real, num projeto do template, mora em **dois lugares fora do módulo**:

1. **`adapters/<tecnologia>/`** (ex.: `adapters/postgres/`) — é aqui, na raiz do projeto, que o driver
   real vive (`00-arquitetura.md` §3.2); é o adapter concreto que se testa contra um Testcontainer, não
   o módulo que o consome através da porta.
2. **`scripts/migrations.mjs ciclo <modulo>`** (`03-operacao.md` §9.3) — prova `up → down → up` contra um
   Postgres efêmero de verdade, de qualquer estado inicial. É o comando que já faz o papel de "as
   migrations rodam limpo" que o setup acima replica manualmente.

Fora do template modular — API convencional, sem a fronteira porta/adapter — o padrão desta página vale
literalmente: escreva os testes numa pasta própria (`tests/integration/` é a convenção comum) e rode-os
como uma etapa separada e mais cara da suíte, nunca junto do `test`/`pytest` rápido do dia a dia.
