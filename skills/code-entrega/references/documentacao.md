# Padrão de Documentação Sarak

Material do **pilar documentação** da entrega. A norma espelha o padrão modular: documentação é uma
**fatia que viaja com o que descreve**. Não redefine a doc de contrato — essa já é norma em `padrao-escrita`
("o `api/` de cada módulo é documentado") e em `PADRAO-ORGANIZACAO.md` (§8 + pasta `docs/`); aqui ela é
formalizada junto com as demais camadas.

## Princípios
- **Co-localizada** — a doc mora junto do que documenta (README do módulo no módulo; doc de contrato no `api/`). Viaja com o módulo → microservice-ready.
- **Explica o porquê**, não o quê (igual aos comentários do padrão).
- **Em sincronia** — doc desatualizada é bug. Só escreva o que reflete o código atual.
- **Mínima e suficiente** — sem documentação cerimonial; cada artefato ganha o seu lugar.
- **Contrato em camelCase** — a doc de API usa o mesmo casing do contrato.

## Camadas

### 1. `README.md` (raiz) — anatomia fixa
Seções obrigatórias (template em `assets/README.template.md`; o `auditar_docs.py` checa a presença):
- **Título + 1 linha** — o que o projeto é.
- **Visão geral** — propósito e contexto.
- **Stack** — linguagens/frameworks principais.
- **Setup & execução** — pré-requisitos, `.env.example` → `.env`, comandos de install/run/build.
- **Arquitetura modular** — lista dos módulos (`backend/<m>`, `frontend/<m>`) e o que cada um faz.
- **API** — como acessar os contratos (`/api/v1/...`).
- **Testes** — como rodar; meta de cobertura (~80%, sinal de saúde).
- **Licença e Autoria** — seção que o pilar de licença/autoria preenche.

### 2. `README.md` por módulo *(recomendado)*
Em `backend/<m>/` (e equivalente no front): o que o módulo faz, seu contrato `api/`, suas tabelas
`<m>_*` e suas env vars `<MODULO>_*`. Reforça a fatia vertical e facilita extrair o módulo depois.

### 3. Documentação de contrato (`api/`)
Já exigida pelo padrão. Por módulo, o contrato descreve cada rota: **método, path, entrada/saída em
camelCase, erros**. É o material de quem consome o módulo. O **artefato canônico é o OpenAPI**
(`api/openapi.yaml`), de responsabilidade da skill `api-contrato` (que o define, linta e testa); aqui a
entrega apenas **verifica que ele existe** e está apontado no README. Um `api.md` curto pode complementar.

### 4. `docs/` (raiz)
Transversal ao repo: decisões de arquitetura (ADR curto: contexto → decisão → consequência), guias e
diagramas. Já previsto na árvore-padrão (§1).

### 5. `CHANGELOG.md` (raiz) *(opcional)*
Para projetos versionados/publicados: formato Keep a Changelog + SemVer (Added/Changed/Fixed/Removed).

### 6. Comentários de código
Explicam o **porquê** de decisões não óbvias — nunca parafraseiam o código.

## Como o pilar aplica (na skill)
- `auditar_docs.py` reporta lacunas (README ausente, seções faltando, sem `docs/`, sem `LICENSE`, módulos sem README).
- O `README.md` é **gerado/atualizado** a partir do template, preenchendo o que é factual (nome, stack, módulos, comandos).
- O que exige conhecimento de negócio (visão, decisões, contrato detalhado) é **apontado como lacuna** ao usuário — não se inventa.
