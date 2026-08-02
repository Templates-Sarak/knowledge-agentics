---
tipo: "arquitetura"
titulo: "Arquitetura Base: Python"
dominio: "Infraestrutura / Design"
status: "🟢 Vigente"
tags: ["arquitetura", "python", "binding"]
relacionados: ["[[00-arquitetura]]", "[[04-regras]]", "[[00-base-typescript]]"]
---

# 1. Propósito

A fundação **da linguagem** neste repositório: stack, ferramental e convenções de Python.

> **O que este documento NÃO define:** a arquitetura de módulos. Anatomia, manifesto, contrato, dados e
> isolamento são das leis vizinhas em `specs/arquitetura/` — `00-arquitetura.md` a `04-regras.md`. Aqui está
> só o que **muda por linguagem**.

# 2. Onde a lei vira código

| Camada | Onde | Papel |
|---|---|---|
| Lei (agnóstica) | `specs/arquitetura/00-arquitetura.md` … `04-regras.md` | o que vale em qualquer linguagem |
| **Binding** | `specs/_estrutura_modulos/bindings/python/` | como a lei se materializa aqui |
| Molde de módulo | `bindings/python/_template/` | validado pelo gate **como módulo real** (ADR-006) |
| Esqueleto de raiz | `bindings/python/raiz/` | `packages/portas`, `adapters/memoria`, `src/composicao`, `verificar.py` |

Módulo novo **não se escreve à mão**: `node ferramentas/criar-modulo.mjs <id> --binding python`,
conduzido pela skill `code-modulo`.

**O binding Python nasce backend-only** (`rotaWeb: null`): o front do ecossistema é sempre TypeScript. Módulo
Python que precise de tela usa o `web/` do binding TS — a doutrina não muda por causa disso.

# 3. Skills obrigatórias

| Skill | Papel |
|---|---|
| `padrao-escrita` | **Nível 0** — SRP, limiares, zero hardcoded, segredos, erro, log, testes |
| `padrao-python` | **Nível 2** — idiomas Python + validador self-contained (`scripts/validate.py`, stdlib `ast`) |

O **Nível 1** (arquitetura de módulos) é cobrado por máquina: `node ferramentas/gate/validar.mjs`.

# 4. Stack

- **Linguagem**: Python 3.11+, com type hints nas assinaturas públicas.
- **Paradigma**: funções puras onde couber; injeção de dependências pelo bootstrap — o módulo **recebe** os
  adapters, nunca os cria.
- **Dependências**: `pyproject.toml` + ambiente virtual local (`.venv`) isolado.
- **API**: FastAPI. **Testes**: pytest.

# 5. Qualidade e tooling

Duas categorias, e confundi-las é o que enche o repositório-alvo de lixo:

| Categoria | Quem declara | Exemplos |
|---|---|---|
| **Ferramenta do projeto** | o `pyproject.toml`, em `[project.optional-dependencies] dev` | `ruff`, `mypy`, `pytest`, `httpx` |
| **Auditor do Sarak** | ninguém no projeto — roda pelo contexto global | `bandit`, `safety`, os validadores das skills |

O linter e o type checker **são do projeto**: sem eles declarados, o módulo extraído para um repositório
próprio perde a própria verificação — exatamente o que a arquitetura existe para impedir. Os auditores do
Sarak, ao contrário, não pertencem ao projeto e nunca entram no manifesto dele.

Preparar o ambiente: `python -m venv .venv && .venv/bin/pip install -e ".[dev]"`.

| Verificação | Comando |
|---|---|
| Tudo, na ordem certa | `python verificar.py` — gate + `.env.example` + `ruff` + `mypy` + pytest por módulo |
| Só conformidade de arquitetura | `node ferramentas/gate/validar.mjs --todos` |
| Limiares e idiomas | `ruff` (do projeto) · validador da `padrao-python` (do Sarak) |
| Testes de um módulo | `pytest`, **a partir da pasta do módulo** |

O `ruff` do projeto **não lê** `.agents/` nem `.githooks/`: é ferramental de agente vendorizado, mantido na
base Sarak. Linter não julga código cujo dono é outro repositório.

Rodar o pytest de dentro da pasta do módulo não é detalhe: é o que prova que ele roda **isolado** — a
condição prática de "pronto para extração".

Cobertura-alvo ~80% nos caminhos críticos — **alvo de equipe, não regra**.

## 5.1 O gate é Node, e o projeto não o declara

O gate é a **mesma** ferramenta nos três bindings, de propósito: um verificador por linguagem divergiria do
outro e a doutrina deixaria de ter uma única leitura.

O projeto Python **não declara Node** — sem `package.json`, sem `devDependency`. O gate é ferramenta de
**auditoria**: roda pelo ferramental de quem desenvolve, não pelo manifesto do projeto. Quem usa a base Sarak
já tem Node, do mesmo modo que já tem Python. Override explícito: `SARAK_NODE=<caminho-do-binário>`.

**Sem Node, o passo reprova** — "não verificado" nunca é reportado como `ok`.

# 6. Segurança

- Zero segredo hardcoded (`cyber-segredos`); gate de commit pela `git-verificacao-commit`.
- Segredo só em `.env`, nunca em `config/*.json` (versionado).
- `.env.example` é **gerado** de `modulo.json:envRequerido` (`node ferramentas/sincronizar-env.mjs`).
- Query **sempre** parametrizada, e sempre dentro do adapter — nenhum SQL de fornecedor no módulo.
