# Arquitetura Base: TypeScript / JavaScript

> **Contexto:** Esta é a fundação arquitetural do projeto. Todo o desenvolvimento TS/JS dentro deste repositório deve obedecer às diretrizes aqui definidas.

## 1. Regras do Ecossistema Sarak (Obrigatório)
A IA deve **obrigatoriamente** submeter todo código gerado às seguintes skills globais:
- `padrao-escrita`: Padrão limiar global de Clean Code, Modularidade (compatível com microservices) e Nomenclatura.
- `padrao-typescript`: Idiomas TS, uso de interfaces/tipos estritos, `eslint`/`prettier` e estruturação.

## 2. Stack Tecnológico e Arquitetura
- **Linguagem**: TypeScript (Node.js / Bun / Frontend React).
- **Paradigma**: Injeção de dependências, tipagem forte, Clean Architecture.
- **Gerenciador de Pacotes**: `npm`, `pnpm` ou `yarn`.

## 3. Qualidade e Tooling (Via Sarak Global)
O tooling de IA roda primariamente via contexto global (evitando poluir o repositório-alvo com scripts desnecessários no package.json):
- **Testes**: `<SARAK_NODE_BIN>/vitest` ou `<SARAK_NODE_BIN>/jest` (Cobertura-alvo ~80%).
- **Linter/Formatador**: `<SARAK_NODE_BIN>/eslint` e `<SARAK_NODE_BIN>/prettier`.

## 4. Segurança
- Tolerância ZERO para segredos hardcoded (`cyber-segredos`).
- Variáveis de ambiente devem estar documentadas em um arquivo `.env.example`.
