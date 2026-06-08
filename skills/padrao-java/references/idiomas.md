# Idiomas Java + Mapeamento das Regras

Leia ao escrever Java conforme o padrão ou ao interpretar a saída do Checkstyle. As regras universais
estão em `padrao-escrita`; aqui está a **forma Java** de cada uma e **qual regra do linter a cobre**.

| Regra universal | Forma em Java | Checkstyle |
|---|---|---|
| Função ≤ 40 linhas | método curto, extrair | `MethodLength` (max 40) |
| Aninhamento ≤ 3 | guard clauses / early return | `NestedIfDepth` (3), `NestedTryDepth` |
| ≤ 4 parâmetros | objeto de parâmetros / builder | `ParameterNumber` (4) |
| Não engolir exceção | tratar/embrulhar/propagar | `EmptyCatchBlock` |
| Sem número mágico | `static final` nomeada | `MagicNumber` |
| Complexidade | quebrar o método | `CyclomaticComplexity` |
| Logger, não print | SLF4J/Logback | `RegexpSingleline` p/ `System.out` (opcional) |

## Nomes
- Classe/interface/enum: `PascalCase`; método/campo/var: `camelCase`; constante: `UPPER_SNAKE_CASE`.
- Pacote: minúsculo, sem `_` (`com.sarak.orders`).

## Exceções
- **Nunca** `catch (Exception e) {}` vazio. Capture o específico, trate, embrulhe (`throw new XxxException("...", e)`) ou propague.
- `try-with-resources` para `Closeable` (conexões, streams).
- Não use exceção para fluxo de controle normal.

## Imutabilidade & null
- `final` em campos/variáveis que não mudam; classes imutáveis quando possível (records em Java moderno).
- `Optional<T>` em retorno onde a ausência é legítima; validar input na borda (`api/`), não confiar.

## Logging
- SLF4J + Logback; níveis corretos (ver `obs-logs`). **Nunca** `System.out.println`/`printStackTrace`.
