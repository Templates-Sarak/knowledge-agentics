# hooks/ — garantias determinísticas do ecossistema Sarak

Esta é a **base de inteligência** (importada nos projetos). Os hooks **NÃO rodam aqui** — são uma
biblioteca portátil pronta para ativar no **projeto-destino**. Runtime: **Node.js**. Detecção:
**ferramentas externas**. Tunables (zero hardcoded): **`hooks/config.json`**.

O conjunto serve a **quatro garantias** — nada além (hook só cobre o mecanicamente verificável; o resto
é julgamento da skill `padrao-escrita` + revisão).

> **Escopo/peso:** edição e commit são **incrementais** (só o arquivo editado / só o diff staged).
> O push é varrido **por delta** (`@{u}..HEAD`), não no histórico inteiro. Auditoria de dependências e
> cobertura rodam **só no push**. Nada percorre todo o código a cada ação.

## Garantia 1 — "Nada incorreto vai para o GitHub"  ·  **fail-closed (fixo)**

| Hook | Evento | Garante |
|---|---|---|
| `cyber-git-seguro.js` | PreToolUse(`Bash`: `git commit`/`git push`) | Sem segredo (gitleaks), sem `.env` real versionado, `.env.example` presente quando há `.env` |

Segurança não negocia: sem gitleaks, o commit/push é bloqueado. **Não** depende do `config.json`.

## Garantia 2 — "Padrão de escrita garantido"  ·  **configurável por projeto**

| Hook | Evento | Garante |
|---|---|---|
| `padrao-limiares.js` | PostToolUse(`Write/Edit`) | Função ≤N linhas, aninhamento ≤N, ≤N params; sem `print`/`console.log`; sem exceção engolida |
| `padrao-format.js` | PostToolUse(`Write/Edit`) | Formatação consistente (formatter da linguagem) |

Política em `config.json → qualidade.modo`: **block** (cobra correção) · **warn** (só avisa) · **off**.
`padrao-format` é best-effort (sem formatter, pula). Cobre **Python, JS/TS, Go e Java** — cada um pelo
linter/formatter de `config.json → linguagens` (Java via `checkstyle` com config gerada dos `limiares`, e
`google-java-format`).

## Garantia 3 — "Sem dependência vulnerável no GitHub"  ·  **configurável**

| Hook | Evento | Garante |
|---|---|---|
| `cyber-dependencias.js` | PreToolUse(`Bash`: `git push`) | Audita os ecossistemas presentes (npm/pip-audit/govulncheck); sinaliza vulnerabilidade ≥ severidade mínima |

Política em `config.json → dependencias.modo`: **block** (bloqueia o push) · **warn** (avisa e prossegue) ·
**off**. Roda **só no push** e só se houver manifesto — leve por design. Missing-tool segue o modo
(em `warn`, não trava o dev).

> **Pendência (junto ao CI diferido):** auditoria de dependências **Java** (Maven/Gradle via OWASP
> dependency-check) ainda não tem ramo aqui. A garantia de **qualidade** (limiares/format) já cobre Java.

## Garantia 4 — "Cobertura mínima antes do push"  ·  **configurável**

| Hook | Evento | Garante |
|---|---|---|
| `test-cobertura.js` | PreToolUse(`Bash`: `git push`) | Mede a cobertura dos ecossistemas presentes; abaixo do mínimo, **pede aprovação do usuário** (ou bloqueia/avisa) |

Política em `config.json → cobertura.modo`: **ask** (pede aprovação — default) · **block** (bloqueia o push) ·
**warn** (avisa e prossegue) · **off**. Mínimo em `cobertura.minima` (default **80**, alinhado a
`padrao-escrita` §9). Roda **só no push** e **só onde há ferramenta + testes** — rodar a suíte é mais pesado que
os outros hooks, por isso nunca roda a cada edição. Ferramentas em `cobertura.ferramentas` (pytest/vitest/`go`/jacoco);
Java lê um relatório JaCoCo já gerado (`target/site/jacoco/jacoco.csv`), não dispara o build. Operacionaliza a
norma de testes — **escrever** os testes é da skill `test-unitario`.

### O que NÃO garantem (fica com a skill + revisão)

SRP, nomes descritivos, comentar o "porquê", testes na mesma entrega, encapsulamento de módulo,
convenções REST/camelCase, hardcoded de config **não-secreta** (porta/URL). Julgamento → skills
`padrao-escrita`, `code-adequacao`, `git-revisao-diff`.

## `config.json` — tunables (cada projeto-destino ajusta)

```jsonc
{
  "qualidade": {
    "modo": "warn",                  // block | warn | off
    "limiares": { "linhas": 40, "aninhamento": 3, "parametros": 4 },
    "proibir": { "printConsole": true, "excecaoEngolida": true }
  },
  "formatacao": { "ativo": true },
  "cobertura": {
    "modo": "ask",                   // ask | block | warn | off
    "minima": 80,                    // % mínimo (padrao-escrita §9)
    "ferramentas": { "python": "pytest", "js": "vitest", "go": "go", "java": "jacoco" }
  },
  "dependencias": {
    "modo": "warn",                  // block | warn | off
    "severidadeMinima": "high",      // low | moderate | high | critical (nativo no npm)
    "ferramentas": { "node": "npm", "python": "pip-audit", "go": "govulncheck" }
  },
  "linguagens": {
    "python": { "linter": "ruff", "formatter": "ruff" },
    "js": { "linter": "eslint", "formatter": "prettier" },
    "go": { "linter": "golangci-lint", "formatter": "gofmt" },
    "java": { "linter": "checkstyle", "formatter": "google-java-format" }
  }
}
```

## Como ATIVAR num projeto que importa a base

1. Garanta os scanners da linguagem instalados (tabela abaixo).
2. Mescle `hooks/settings.template.json` (bloco `hooks`) no `.claude/settings.json` do projeto-destino.
3. Ajuste `hooks/config.json` (ex.: `modo: "block"` quando o time estiver pronto).

> Ao empacotar como **plugin** (futuro): troque `$CLAUDE_PROJECT_DIR` por `${CLAUDE_PLUGIN_ROOT}` e
> mova o wiring para o `hooks/hooks.json` do plugin. O resto não muda.

## Pré-requisitos (ferramentas externas)

| Ferramenta | Usada por | Instalar (Windows) |
|---|---|---|
| **gitleaks** | `cyber-git-seguro` (segredos) | `scoop install gitleaks` / `choco install gitleaks` |
| **ruff** | `padrao-limiares` + `padrao-format` (Python) | `pip install ruff` |
| **eslint** | `padrao-limiares` (JS/TS) | `npm i -g eslint` |
| **prettier** | `padrao-format` (JS/TS) | `npm i -g prettier` |
| **gofmt** | `padrao-format` (Go) | incluso no Go toolchain |
| **golangci-lint** | `padrao-limiares` (Go) | `scoop install golangci-lint` |
| **checkstyle** | `padrao-limiares` (Java) | `scoop install checkstyle` / `choco install checkstyle` |
| **google-java-format** | `padrao-format` (Java) | baixar o JAR (release oficial) e expor no PATH |
| **npm** | `cyber-dependencias` (Node) | incluso no Node.js |
| **pip-audit** | `cyber-dependencias` (Python) | `pip install pip-audit` |
| **govulncheck** | `cyber-dependencias` (Go) | `go install golang.org/x/vuln/cmd/govulncheck@latest` |
| **pytest** + **pytest-cov** | `test-cobertura` (Python) | `pip install pytest pytest-cov` |
| **vitest** (ou jest) | `test-cobertura` (JS/TS) | `npm i -D vitest` (jest: `npm i -D jest`) |
| **go** | `test-cobertura` (Go) | incluso no Go toolchain (`go test -cover`) |
| **JaCoCo** | `test-cobertura` (Java) | plugin Maven/Gradle gera `jacoco.csv` (o hook só o lê) |

## Arquivos

- `_lib.js` — base compartilhada (I/O do payload, `loadConfig`, detecção de executável/linguagem, helpers de decisão).
- `config.json` — tunables não-secretos (qualidade + cobertura + dependências).
- `settings.template.json` — wiring para colar no projeto-destino.
- `cyber-git-seguro.js`, `cyber-dependencias.js`, `padrao-limiares.js`, `padrao-format.js`, `test-cobertura.js` — os hooks.

## Convenções de saída (contrato do Claude Code)

- **PreToolUse** nega via `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`.
- **PostToolUse** bloqueia via `{"decision":"block","reason":...}` ou avisa via `{"hookSpecificOutput":{"additionalContext":...}}`.
- Sem decisão → exit 0 sem stdout (segue o fluxo).

## Testar isolado (lê JSON no stdin)

```powershell
'{"tool_input":{"command":"git commit -m x"},"cwd":"."}' | node hooks/cyber-git-seguro.js
'{"tool_input":{"file_path":"a.py"}}' | node hooks/padrao-limiares.js
'{"tool_input":{"command":"git push"},"cwd":"."}' | node hooks/test-cobertura.js
```
