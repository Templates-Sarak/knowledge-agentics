# Idiomas Go + Mapeamento das Regras

Leia ao escrever Go conforme o padrão ou ao interpretar a saída do `golangci-lint`. As regras universais
estão em `padrao-escrita`; aqui está a **forma Go** de cada uma e **qual linter a cobre**.

| Regra universal | Forma em Go | Linter (config) |
|---|---|---|
| Função ≤ 40 linhas | função curta, extrair | `funlen` (lines: 40) |
| Aninhamento ≤ 3 | guard clauses / early return | `nestif` |
| ≤ 4 parâmetros | agrupar em struct de opções | `revive: argument-limit [4]` |
| Não engolir erro | `if err != nil { return ..., fmt.Errorf("...: %w", err) }` | `errcheck` |
| Sem número mágico | `const` nomeada | `gomnd`/`gocritic` (opcional) |
| Segurança básica | sem `os/exec` com input, etc. | `gosec` |
| Complexidade | quebrar lógica | `gocyclo` |

## Nomes
- Exportado: `CamelCase` (`func NewOrder`); não-exportado: `camelCase`.
- Pacote: curto, minúsculo, singular (`order`, não `orders_utils`). Evite stutter (`order.New`, não `order.NewOrder` se redundante).
- Constantes: `CamelCase` exportada ou `camelCase`; agrupar em `const (...)`.

## Erros
- Sempre tratar/propagar; embrulhar com `%w` para preservar a cadeia; `errors.Is/As` para inspecionar.
- `panic` só em erro de programação (invariante quebrada), não em fluxo esperado.

## Estrutura & idioma
- `gofmt`+`goimports` (formatação canônica) e `go vet` limpo — pré-requisito.
- Interfaces **pequenas**, definidas onde são consumidas; aceite interface, retorne struct.
- Sem estado global mutável; dependências por parâmetro/campo. Concorrência com cuidado (race detector: `go test -race`).
