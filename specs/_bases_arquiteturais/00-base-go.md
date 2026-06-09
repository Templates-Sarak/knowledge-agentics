# Arquitetura Base: Go

> **Contexto:** Esta é a fundação arquitetural do projeto. Todo o desenvolvimento Go dentro deste repositório deve obedecer às diretrizes aqui definidas.

## 1. Regras do Ecossistema Sarak (Obrigatório)
A IA deve **obrigatoriamente** submeter todo código gerado às seguintes skills globais:
- `padrao-escrita`: Padrão limiar global de Clean Code, Modularidade (compatível com microservices) e Nomenclatura.
- `padrao-go`: Idiomas Go, tratamento de erros rigoroso (sem panic silencioso), uso de structs/interfaces e concorrência segura.

## 2. Stack Tecnológico e Arquitetura
- **Linguagem**: Go 1.21+
- **Paradigma**: Concorrência via goroutines/channels de forma segura, interfaces implícitas, composição sobre herança.
- **Gerenciador de Dependências**: Go Modules (`go.mod`).

## 3. Qualidade e Tooling (Via Sarak Global)
O tooling de IA usa a cadeia de ferramentas do Go acoplada ao Sarak:
- **Testes**: `go test ./...` (Cobertura-alvo ~80% conforme padrao-escrita §9).
- **Auditoria**: `golangci-lint` (utilizando as regras definidas globalmente no Sarak em `assets/.golangci.yml`).

## 4. Segurança
- Tratamento explícito de todos os erros (nada de ignorar com `_ = err` sem justificativa).
- Nenhum dado sensível em código fonte (`cyber-segredos`).
