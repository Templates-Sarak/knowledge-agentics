# Idiomas Python + Mapeamento das Regras

Leia ao escrever Python conforme o padrão ou ao interpretar a saída do `validate.py`. As regras
universais estão em `padrao-escrita`; aqui está a **forma Python** de cada uma e **como o validador
a detecta**.

---

## Idiomas

| Elemento | Convenção Python |
|---|---|
| Arquivo/módulo | `snake_case.py` |
| Classe | `PascalCase` |
| Função / variável | `snake_case` |
| Constante | `UPPER_CASE` (número/string fixos aceitáveis; segredo/URL não) |
| Tipos | `type hints` em tudo que é público; checar com `mypy` |
| Privado | prefixo `_` (`_helper`) — sinaliza "não é contrato público" |

- **Borda de serialização:** interno `snake_case` ↔ contrato `camelCase` é convertido na camada `api/`
  (Pydantic alias, serializer, etc.), nunca espalhando o casing do contrato pelo `domain/`.
- **Imports:** dependa só do `api/` de outro módulo (`from users.api.adapter import UsersApi`),
  nunca de `users.domain`/`users.data` — ver `PADRAO-ORGANIZACAO.md`.

---

## Mapeamento regra → forma Python → detecção do validador

| Regra (Nível 0) | Forma Python | Detecção (`validate.py`) | Confiança |
|---|---|---|---|
| Função ≤ 40 linhas | corpo da `def`/`async def` | `end_lineno - lineno + 1 > maxFunctionLines` | alta |
| Aninhamento ≤ 3 | `if/for/while/with/try` aninhados | profundidade de blocos via AST | alta |
| ≤ 4 parâmetros | args da função (menos `self`/`cls`) | contagem de `args` | alta |
| Sem `print` (logger) | `print(...)` | `ast.Call` com `func.id == "print"` | alta |
| Não engolir exceção | `except:` / `except X: pass` | `ExceptHandler` sem tipo ou corpo só `pass` | alta |
| Tipar fronteiras | função pública sem anotação | `returns is None` ou param sem `annotation` | alta |
| Segredo em env | `API_TOKEN = "..."` no código | literal em nome que casa `secretNamePatterns` | alta |
| Zero hardcoded | número mágico / URL no código | número fora do allowlist + fora de constante; string com prefixo de URL | **baixa** (heurística) |

### Sobre a heurística de hardcoded (por que `confianca: baixa`)
- Um número fora de `allowedMagicNumbers` **pode** ser legítimo (ex.: índice, fator matemático). Por isso
  é candidato a revisão, não erro certo. Constantes `UPPER_CASE` são isentas (já são "configuração nomeada").
- URLs/hosts são sinalizados mesmo como constante, porque tipicamente são **valores por-ambiente** que
  deveriam estar em `config.json`/`.env`.
- O agente (ou `code-diagnostico`) decide o que vira violação real e o que é falso positivo.

### O que o validador NÃO faz (fica com o agente / code-diagnostico)
- **SRP** (responsabilidade única) — exige entender o que o código faz.
- **Acoplamento entre módulos / tabelas cross-módulo** — exige conhecer a topologia dos módulos.
- **"É segredo de verdade?"** além do padrão de nome — exige contexto.
- **Cobertura de testes** — é sinal por módulo, consolidado pelo `code-diagnostico`.

---

## Tooling complementar (opcional)
- **`ruff`** — lint/format rápido; cobre muita regra genérica de estilo.
- **`mypy`** — checagem de tipos; reforça a regra de tipagem nas fronteiras.
- Eles **complementam** o validador (que garante exatamente os limiares Sarak), não o substituem.
