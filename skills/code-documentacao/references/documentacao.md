# Padrão de Documentação Sarak

Material do **pilar documentação** desta skill. A norma espelha o padrão modular: documentação é uma
**fatia que viaja com o que descreve**. Não redefine a doc de contrato — essa já é norma em `padrao-escrita`
("o `api/` de cada módulo é documentado") e no `04-regras.md` §4.5, que a cobra por máquina. **A doutrina
técnica (arquitetura, decisões, contexto) é do fluxo SDD, em `specs/`** — esta skill não a descreve, aponta
para lá (§4 abaixo).

## Princípios
- **Co-localizada** — a doc mora junto do que documenta (README do módulo no módulo; doc de contrato no `api/`). Viaja com o módulo → microservice-ready.
- **Explica o porquê**, não o quê (igual aos comentários do padrão — `padrao-escrita/references/comentarios.md`).
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
- **Arquitetura modular** — inventário dos módulos (`modules/<m>`) e o que cada um faz; a anatomia
  genérica é ponteiro para `specs/arquitetura/01-modulo.md`, não conteúdo repetido.
- **API** — ponteiro para o contrato de cada módulo (`modules/<m>/contract/openapi.yaml`).
- **Testes** — como rodar; meta de cobertura (~80%, sinal de saúde).
- **Licença e Autoria** — seção que `code-licenca`/`code-assinatura` preenchem.

### 2. `README.md` por módulo *(recomendado)*
Em `modules/<m>/`: o que o módulo faz, seu contrato `api/`, suas tabelas `<m>_*` e suas env vars
`<MODULO>_*`. Reforça a fatia vertical e facilita extrair o módulo depois.

### 3. Documentação de contrato (`api/`)
Já exigida pelo padrão. Por módulo, o contrato descreve cada rota: **método, path, entrada/saída em
camelCase, erros**. É o material de quem consome o módulo. O **artefato canônico é o OpenAPI**
(`contract/openapi.yaml`), de responsabilidade da skill `test-api-contrato` (que o define, linta e
testa); aqui a documentação apenas **verifica que ele existe** e está apontado no README.

### 4. `specs/` (raiz) — substitui o antigo `docs/`
Transversal ao repo: decisões de arquitetura (ADR), contexto e especificações técnicas vivem no
fluxo **SDD** (`specs/adr/`, `specs/arquitetura/`, `specs/00-contexto.md`) — não numa pasta `docs/`
separada. Esta skill **não descreve** arquitetura nem decisão técnica; só **aponta** o README para lá.

### 5. `CHANGELOG.md` (raiz) *(opcional)*
Para projetos versionados/publicados: formato Keep a Changelog + SemVer (Added/Changed/Fixed/Removed).

### 6. Comentários de código
Explicam o **porquê** de decisões não óbvias — nunca parafraseiam o código. Norma completa em
`padrao-escrita/references/comentarios.md`; não redefinida aqui.

## Como esta skill aplica
- `auditar_docs.py` reporta lacunas (README ausente, seções faltando, sem `specs/`, sem `LICENSE`,
  módulos sem README).
- O `README.md` é **gerado/atualizado** a partir do template, preenchendo o que é factual (nome, stack, módulos, comandos).
- O que exige conhecimento de negócio (visão, decisões, contrato detalhado) é **apontado como lacuna** ao usuário — não se inventa.
