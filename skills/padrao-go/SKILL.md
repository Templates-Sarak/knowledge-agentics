---
name: padrao-go
description: Camada Go (Nível 2) do padrão Sarak — idiomas Go e a aplicação dos limiares via golangci-lint configurado (assets/.golangci.yml). Use ao escrever, revisar ou validar código Go. Regras universais em padrao-escrita.
---

# Skill: Padrão Go (Nível 2)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Traduz o padrão universal (`padrao-escrita`) para **Go**: idiomas da linguagem + a aplicação dos limiares
objetivos via **`golangci-lint`** com a configuração do ecossistema (`assets/.golangci.yml`).

> Regras universais (SRP, zero hardcoded, segredos, modularidade, testes…) vivem em `padrao-escrita` e no
> `CLAUDE.md`. Esta skill **não as redefine** — dá a forma Go e a automação. Diferente de `padrao-python`/
> `padrao-typescript` (validador próprio em AST), aqui o validador é o **linter consagrado configurado**.

## Quando usar
- Proativa: ao escrever ou revisar **código Go**.
- Ao validar conformidade de um pacote Go (rodar o `golangci-lint` com nosso config).

## Idiomas Go do padrão
- **Nomes**: exportado em `CamelCase` (PascalCase), não-exportado em `camelCase`; pacotes curtos minúsculos; sem `stutter` (`orders.Order`, não `orders.OrderStruct`).
- **Erros explícitos**: retornar `error` e tratar (`if err != nil`) — **nunca** ignorar (`errcheck`); `panic` só para erro de programação. Erro embrulhado com `%w`.
- **Formatação**: `gofmt`/`goimports` (não negociável); `go vet` limpo.
- **Estrutura**: interfaces pequenas (definidas pelo consumidor); sem estado global mutável; injeção via parâmetros.
- **Tipagem**: o compilador já garante; sem `interface{}` desnecessário; sem números mágicos (constantes).

## Validador — `golangci-lint` + `assets/.golangci.yml`
```
golangci-lint run --config assets/.golangci.yml ./...
```
O config aplica os **limiares do `padrao-escrita`**: `funlen` (função ≤ **40** linhas), `nestif` (aninhamento ≤ ~3),
`revive argument-limit` (≤ **4** parâmetros), `gocyclo` (complexidade), `errcheck` (erro não tratado), `gosec` (segurança básica).
Se faltar o binário, avise `go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest`.

## Regras e limites
- **NÃO** ignore erro retornado (`_ = f()` sem motivo) — trate ou propague com `%w`; `errcheck` cobra isso.
- **NÃO** embuta limiar no código — eles vêm do `.golangci.yml` (zero hardcoded de regra).
- **NÃO** redefina as regras universais aqui — em dúvida, leia `padrao-escrita`.
- **NÃO** use `panic` para fluxo de erro normal; **NÃO** deixe `gofmt`/`go vet` sujo.
- **NÃO** saia do escopo: dimensões de julgamento (SRP, acoplamento, dados, API) são do `code-diagnostico`, não do linter.

## Checklist "pronta"
- [ ] `gofmt`/`goimports` aplicados e `go vet` limpo?
- [ ] Erros tratados/propagados (sem `errcheck` reclamando)?
- [ ] `golangci-lint run --config assets/.golangci.yml` sem violar funlen/nestif/params?
- [ ] Nomes idiomáticos (export CamelCase, pacote minúsculo, sem stutter)?
- [ ] Sem número mágico/estado global; interfaces pequenas?

## Referências (Camada 3 — leia sob demanda)
- `references/idiomas.md` — idiomas Go detalhados e o mapeamento regra-universal → forma Go / linter que a cobre.
- `assets/.golangci.yml` — configuração do `golangci-lint` com os limiares do `padrao-escrita`.
