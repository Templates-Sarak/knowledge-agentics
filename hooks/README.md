# hooks/ — garantias determinísticas do ecossistema Sarak

Esta é a **base de inteligência** (importada nos projetos). Os hooks **NÃO rodam aqui** — são uma
biblioteca portátil pronta para ativar no **projeto-destino**. Runtime: **Node.js**. Detecção:
**ferramentas externas**. Tunables (zero hardcoded): **`hooks/config.json`**.

O conjunto serve a **quatro garantias** — nada além (hook só cobre o mecanicamente verificável; o resto
é julgamento da skill `padrao-escrita` + revisão).

> **Escopo/peso:** edição e commit são **incrementais** (só o arquivo editado / só o diff staged).
> O push é varrido **por delta** (`@{u}..HEAD`), não no histórico inteiro. Auditoria de dependências e
> cobertura rodam **só no push**. Nada percorre todo o código a cada ação.

## O que um hook é, e o que ele não é

**Hook é guarda do AGENTE.** Ele intercepta chamada de ferramenta do Claude Code — `Write`, `Edit`,
`Bash`. Quem clona o repositório e edita sem Claude Code não é interceptado por nada: o hook não existe
para essa pessoa.

**Quem protege o repositório independente de quem edita é o CI.** Instalar hook não substitui pipeline —
**antecipa feedback**: o mesmo defeito que o CI reprovaria em minutos aparece no segundo em que o agente
escreve a linha. As duas camadas cobram o mesmo padrão, e é por isso que o hook lê a config do projeto em
vez de carregar números próprios: sem isso, agente e pipeline discordariam sobre o que é conforme.

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

Política em `qualidade.modo`: **block** (cobra correção) · **warn** (só avisa) · **off**.
`padrao-format` é best-effort (sem formatter, pula). Cobre **Python, JS/TS, Go e Java** — cada um pelo
linter/formatter de `linguagens`.

**O limiar não vem daqui, e isso é o desenho.** `padrao-limiares` roda o linter do projeto **com a config
do projeto**, cujos 40/3/4 são derivados de `tools/gate/thresholds.mjs` — a fonte única da lei. Ele
não injeta mais `--rule`/`--config`: enquanto injetava, o número vivia numa quarta cópia dentro de
`hooks/` e essa cópia **vencia** a config gerada, então o hook e o `npm run lint` do mesmo repositório
podiam cobrar valores diferentes. **Projeto sem config de linter** não tem limiar a aplicar: o hook
sinaliza pelo `qualidade.modo` (em `warn`, avisa e segue) e nunca reprova por conta própria — inventar
um número ali seria repor o defeito que a mudança removeu.

**Não há `qualidade.proibir`**, e a ausência é decisão. O gerador emite `no-console`, `no-empty`, `T20`
e `E` **incondicionalmente**, sem ler política: um campo que filtrasse essas regras no hook nunca
acrescentaria cobertura — a única coisa que conseguiria fazer é **esconder do agente um erro que o
`npm run lint` do mesmo repositório acusa**. Quem decide o que é cobrado é a config do projeto; o hook
só decide *com que severidade avisar*, e isso é o `modo`.

> **O custo desta base, declarado.** Como o repositório da base não tem config de linter na raiz, o
> `padrao-limiares` aqui **não verifica limiar nenhum** — ele avisa e segue. Antes da mudança havia
> verificação, porque o hook injetava os próprios números; ela foi trocada pela garantia de que hook e
> lint nunca discordam. É custo aceito: editar `hooks/_lib.js` deixou de ser verificado por qualquer
> coisa automática, e quem cobra o padrão nestes arquivos passa a ser a revisão. Projeto vindo do
> template não paga esse preço — ele nasce com a config gerada.

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

## De onde vem a política

Duas fontes, nesta ordem:

1. **`config/verificacao.json` do projeto**, quando existe — projeto vindo do template de módulos declara
   a política dele ali, e ela vence. O hook acha a raiz por `CLAUDE_PROJECT_DIR` e, na falta dela, subindo
   do `cwd` até achar o arquivo.
2. **`hooks/config.json`** desta base, como fallback — é o caso da própria base (que não tem
   `config/verificacao.json`) e de projeto que não veio do template.

O vocabulário difere de propósito entre os dois: o template nomeia **binding**
(`typescript`/`javascript`/`python`) e usa `formatador`; os hooks nomeiam **área** (`js`/`python`) e usam
`formatter`, porque é assim que a extensão do arquivo é mapeada. A tradução mora em `_lib.js`
(`politicaDoProjeto`), num lugar só.

## `config.json` — tunables (fallback; cada projeto-destino ajusta)

```jsonc
{
  "qualidade": {
    // `modo` e so. `limiares` esta fora (40/3/4 sao LEI, fonte unica em
    // tools/gate/thresholds.mjs) e `proibir` tambem (a config gerada ja emite
    // no-console/no-empty sem ler politica — o campo so escondia erro que o lint acusa)
    "modo": "warn"                   // block | warn | off
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
