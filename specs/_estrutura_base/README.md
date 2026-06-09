# 🧭 Como usar o diretório de Specs

Este diretório (`specs/`) é o "cérebro" do projeto. É aqui que você define **o que** a IA deve construir e **como** o sistema deve ser estruturado. 

Abaixo explicamos onde cada arquivo deve ser criado e por que certos arquivos NÃO devem entrar aqui.

---

### 1. Specs de Negócio (O "QUÊ") -> `specs/`
- **Onde criar:** Crie arquivos `.md` dentro da pasta `specs/`.
- **Exemplo:** `01-login.md`, `02-pagamento.md`.
- **O que colocar:** Regras de negócio, o que a funcionalidade deve fazer, regras de validação.
- **Natureza:** Documento Vivo. Atualize este arquivo se a regra de negócio mudar.

### 2. Arquitetura e Design (O "COMO") -> `arquitetura/`
- **Onde criar:** Crie arquivos `.md` dentro da pasta `arquitetura/`.
- **Exemplo:** `00-base-python.md` (copiado dos templates do Sarak), `api-design.md`, `diagrama-banco.md`.
- **O que colocar:** O design estrutural do sistema, regras globais de banco de dados, escolhas de bibliotecas do projeto.
- **Natureza:** Documento Vivo. Atualize se a arquitetura mudar.

### 3. Decisões Históricas (O "POR QUÊ") -> `adr/`
- **Onde criar:** Crie arquivos `.md` dentro da pasta `adr/`.
- **Exemplo:** `001-escolha-do-postgres.md`.
- **O que colocar:** Os "Architecture Decision Records" (ADRs). Explique o motivo pelo qual você tomou uma decisão técnica difícil (ex: por que optou por Microserviços ao invés de Monolito).
- **Natureza:** Documento Imutável. Não se altera um ADR. Se a decisão mudar no futuro, crie um ADR novo (`002-migrando-para-monolito.md`).

---

## 🚫 Onde adicionar os Planos de Implementação (Plans)?

**Em NENHUM LUGAR dentro do projeto.**

Os planos (ex: "Passo 1: Criar arquivo X, Passo 2: Criar função Y") são arquivos **efêmeros** (descartáveis). 
Quando você pedir para a IA *"implemente o 01-login.md"*, a própria IA vai gerar um plano temporário na memória interna dela (ou em uma pasta invisível fora do seu repositório). 

**Regra de Ouro:** Não crie arquivos de plano dentro do Git. Assim que a funcionalidade estiver pronta e commitada, o plano perde a validade. Mantenha seu repositório limpo contendo apenas a verdade final do seu sistema (as Specs).
