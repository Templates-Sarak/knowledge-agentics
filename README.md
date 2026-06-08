# X-Skills — Ecossistema Sarak

> **Este README é o manual do diretório.** Ele explica **o que** o diretório é, **como funciona** e — o mais
> importante — **como criar/modificar** qualquer artefato (skill, command, agent, hook) sob o mesmo padrão.
> Toda funcionalidade nova nasce seguindo o que está aqui.

## 1. O que é este diretório

Esta é a **base de regras e instruções para desenvolvimento guiado por agentes** do ecossistema Sarak —
o **cérebro compartilhado** que orienta como um agente (Claude Code e equivalentes) escreve, organiza,
revisa e entrega código. Não é o código de um produto: é a **camada de inteligência** que se **importa
em todos os meus projetos** para que qualquer agente, em qualquer repositório, trabalhe sob os mesmos
padrões e garantias.

**Finalidade prática:** centralizar num só lugar — versionável e reutilizável — os blocos que estendem o
agente (normas, capacidades, automações), de forma que cada projeto novo *herde* o mesmo comportamento
em vez de reconfigurar tudo do zero. O destino é empacotar como **plugin** e importá-lo em cada projeto.

> Padrões de **código** vivem no `CLAUDE.md` (→ skill `padrao-escrita`). Padrão de **criação de skills** na
> skill `meta-create-skill`. Este README é a fonte da verdade do **padrão do diretório** (nomes + autoria).

### Estado atual

| Bloco | Status |
|---|---|
| `skills/` | ✅ 34 skills por área |
| `hooks/` | ✅ 4 garantias (segredos, padrão de escrita, dependências, cobertura) |
| `commands/` | ✅ 12 (code/cyber/git auditar→adequar; deploy/site/meta) |
| `agents/` | ✅ 5 (`code-auditor`, `code-adequador`, `code-revisor`, `cyber-auditor`, `git-auditor`) |
| `plugin/` | ✅ Sincronizador Global IDE (Antigravity & Claude Code) |
| `specs/` | ⬜ Convenção a adotar |

---

## 2. Os blocos de construção (visão rápida)

| Bloco | O que é | Como dispara | Onde mora |
|---|---|---|---|
| **CLAUDE.md** | Instruções/memória sempre no contexto | **Automático** — toda sessão | raiz (projeto) e `~/.claude` (global) |
| **skills/** | Capacidade que o **modelo** usa quando faz sentido | Modelo decide pela `description`, **ou** você digita `/nome` | `skills/<nome>/SKILL.md` (3 camadas) |
| **commands/** | **Atalho** de prompt que **você** dispara | **Manual** — você digita `/nome` | `commands/<nome>.md` |
| **agents/** | **Subagente** com contexto próprio | Modelo **delega** (`Task`) ou você cita pelo nome | `agents/<nome>.md` |
| **hooks** | Comando shell em **eventos** do harness | **Automático/determinístico** no evento | `settings.json` (scripts em `hooks/`) |
| **plugin/** | **Instalador Global** (Sincroniza X-Skills nas IDEs) | **Manual** (rodar `sync_ide.py`) | `plugin/sync_ide.py` |
| **specs** | **Convenção** sua: especificações/planos (PRD, design) | Manual (referência humana) | `specs/` (opcional) |
| **settings.json** | Configuração (permissões, env, model, hooks) | **Automático** | `.claude/settings.json` |
| **MCP** | Servidores de **ferramentas externas** (Gmail, DB, APIs) | Ferramentas ficam disponíveis ao modelo | `.mcp.json` |

> **Regra de ouro do disparo:** **hooks garantem** (determinístico) · **skills/agents o modelo decide**
> (julgamento pela `description`) · **commands você dispara** (`/`) · **CLAUDE.md está sempre on**.

---

## 3. Como criar cada bloco (manual de autoria)

> **Esta é a seção operacional.** Antes de criar qualquer coisa: escolha o **bloco** (§4 guia de decisão) e o
> **nome** (§5 nomenclatura). Depois siga a receita do bloco abaixo.

### 3.0 Princípios transversais (valem para TODO artefato)

1. **DRY — a lógica vive na SKILL.** Command, agent e hook **referenciam** a skill, nunca duplicam o conteúdo.
   (O `CLAUDE.md` aponta para `padrao-escrita`; um command aponta para a skill que ele dispara; um agent diz
   "aplico a metodologia da skill X".) Se você está copiando regras, está errado — aponte.
2. **Nomenclatura `<área>-<nome>`** em kebab-case (§5). O prefixo é a **área**, não o tipo.
3. **⚠️ Armadilha do YAML (pega todo mundo):** **nunca** use `: ` (dois-pontos + espaço) dentro de uma
   `description` de frontmatter — quebra o parser (*"mapping values are not allowed here"*). Reescreva:
   use `—`, `(por exemplo, …)` em vez de `(ex.: …)`, etc. Valide com um parser YAML antes de considerar pronto.
4. **Validação:** todo frontmatter parseia como YAML; todo ponteiro (`references/…`, script, asset) resolve;
   nada de ponteiro órfão.

### 3.1 Criar uma SKILL — *a capacidade/conhecimento*

- **Onde:** `skills/<área>-<nome>/SKILL.md` (+ `references/`, `scripts/`, `assets/` **condicionais** — só se houver conteúdo).
- **Padrão completo:** a skill **`meta-create-skill`** (ou o command `/meta-criar-skill`) — é a fonte da verdade. Scaffold: `meta-create-skill/scripts/scaffold_skill.py <nome>`.
- **Frontmatter:** `name` (= pasta) + `description`. A `description` é o **gatilho**: `o quê + quando/gatilho [+ trava "NÃO acione proativamente" se sob demanda]`. Enxuta.
- **Modelo de 3 camadas:** (1) `name`+`description` (sempre carregado) · (2) corpo do `SKILL.md` denso e auto-suficiente (~150–200 linhas) · (3) `references/`/`scripts/`/`assets/` lidos sob demanda via ponteiro.
- **Seções do corpo:** o que é · quando usar · workflow acionável (ferramenta+ação+critério) · regras `NÃO/NUNCA` · checklist · ponteiros de Camada 3.

### 3.2 Criar um COMMAND — *o gatilho que você dispara*

- **Onde:** `commands/<área>-<verbo>.md`. **Command = verbo** (auditar, adequar, organizar). Vira `/<nome>`.
- **Frontmatter:** `description` (**sem `: `**), `argument-hint`, `allowed-tools`, `model` (opcional, herda a sessão).
- **Corpo = um PROMPT.** É um **gatilho fino que orquestra uma skill** — a lógica vive na skill, aqui você
  encadeia os passos dela com argumentos. Use `$1`/`$2`/`$ARGUMENTS`.
- **`allowed-tools`:** liste só o necessário. Inclua **`Task`** se o command for **disparar um agent**.
- **HITL fica no command** (thread principal) — agent não confirma com o humano, então tudo que precisa de
  "⚠️ Confirma?" mora aqui.
- **Numeração:** fluxo sequencial de várias fases → `<área>N-<verbo>` (`/code1-auditar` → `/code2-caracterizar`
  → `/code3-adequar`). Command **único** (sem sequência) → **sem número** (`/deploy-vercel`).

```markdown
---
description: Faz X via o fluxo da skill <área>-<algo> — passo A, passo B, com HITL. Mutativo.
argument-hint: [alvo]
allowed-tools: Read, Edit, Write, Grep, Glob, Bash   # + Task se disparar agent
---
# /<área>-<verbo> — título curto
Alvo: **$1** (se vazio, o diretório atual).
Dispara o fluxo da skill **`<área>-<algo>`** ... (a lógica é da skill; aqui você orquestra).
## Passos
1. ...
## Limites
- **NÃO** saia do escopo: ... → outra skill/command.
```

### 3.3 Criar um AGENT — *o subagente de contexto isolado*

- **Onde:** `agents/<área>-<papel>.md`. **Agent = substantivo de papel** (auditor, adequador, revisor).
- **Frontmatter:** `name`, `description` (**sem `: `**), `tools`, `model`.
- **Corpo = um SYSTEM PROMPT.** O agente recebe **uma tarefa isolada**, faz o trabalho pesado em **contexto
  próprio** e **devolve só um resumo compacto** à thread principal (é isso que economiza contexto).
- **Read-only por construção:** um auditor **não recebe `Edit`/`Write`** (a restrição de ferramentas trava o
  read-only mecanicamente). Quem precisa **persistir** artefato recebe `Write` **restrito** a `.sarak/<área>/`.
- **`model`:** `sonnet` para varredura mecânica (barato, roda em paralelo); `opus` quando exige julgamento pesado.
- **Agent NÃO faz HITL** — quem confirma com o humano é o command/thread principal. Por isso correção
  destrutiva/sensível **não** vira agente.
- **Como dispara:** o modelo **delega** via `Task` — um command instrui ("dispare o agent X"), e a `description`
  do agent ajuda o modelo a escolhê-lo.

```markdown
---
name: <área>-<papel>
description: Faz X read-only — varre Y, classifica Z e devolve achados. Disparado pelo /<área>-<verbo>. NÃO modifica.
tools: Read, Grep, Glob, Bash      # auditor = sem Edit/Write
model: sonnet
---
# Agente: <área>-<papel>
Você é ... Recebe **uma <unidade>** e devolve **só um resumo compacto**.
## Workflow
1. ...
## Regras e limites
- **NUNCA** edite código-fonte ...
## Saída
Retorne **EXCLUSIVAMENTE** um bloco JSON válido. Nenhum texto livre antes ou depois.
```json
{ ... }
```
```

### 3.4 Criar um HOOK — *a garantia determinística*

- **Onde:** script em `hooks/<área>-<nome>.js` + **wiring** no `.claude/settings.json` (template em
  `hooks/settings.template.json`) + tunables em `hooks/config.json`. Base compartilhada: `hooks/_lib.js`.
- **Contrato:** lê o payload JSON no **stdin**; decide via JSON no **stdout** (`deny`/`ask` em PreToolUse;
  `block`/`warn` em PostToolUse; sem saída = segue). Runtime **Node**.
- **É o ÚNICO bloco que garante** (roda sempre, no evento). Detalhe completo em **`hooks/README.md`**.

### 3.5 Command vs Agent vs ambos — *a decisão*

| Situação | Bloco |
|---|---|
| Fluxo **mutativo/HITL** ou **setup** (deploy, site, migrations, entrega, correção destrutiva) | **só command** (thread principal — agent não faz HITL) |
| **Varredura read-only ampla** (auditoria de repo/domínio/histórico) | **command + agent** (o agent isola o churn e devolve o resumo) |
| **Trabalho paralelizável/isolado de baixo risco** (adequar por tarefa, escrever testes por módulo) | **command + agent** (fan-out) |
| **Perspectiva independente recorrente** (revisar um diff) | **agent** (`code-revisor`) |

> **Molde canônico:** `auditar (command + agent read-only → consolida em .sarak/) → adequar (command; agent só
> para baixo risco; HITL para o resto)`. É o que `code-`/`cyber-`/`git-` seguem.

### 3.6 Convenção `.sarak/` (persistência no projeto-alvo)

Auditorias e planos persistem em `.sarak/<área>/` no **projeto auditado** (`audit`, `security`, `git-audit`).
**É versionável — commite** (o git é o histórico). Padrão: **snapshot congelado** (datado) + **estado vivo**
(backlog/achados, status atualizado) + **log append-only**.

---

## 4. Qual bloco usar? (guia de decisão)

- Precisa **garantir** que algo rode (todo commit/edição)? → **hook**.
- Quer uma **capacidade** que o modelo aplica quando faz sentido? → **skill**.
- Quer um **atalho** que **você** dispara com `/`? → **command**.
- Quer **isolar** uma varredura/tarefa pesada em contexto separado? → **agent**.
- Quer **empacotar** tudo para reusar? → **plugin**.
- Quer **normas sempre ativas**? → **CLAUDE.md**.

---

## 5. Padrão de nomenclatura (vale para TODOS os blocos)

> A **regra canônica de nomes** do diretório. É o que mantém o ecossistema navegável: um `grep <área>-*`
> encontra **toda** a superfície de um assunto (skill + hook + command + agent) de uma vez.

**Formato:** `<prefixo-de-área>-<nome-descritivo>`, sempre em **kebab-case**.

**O prefixo é a ÁREA/domínio — não o tipo do bloco.** O tipo já é dado pela **pasta** (`commands/`, `agents/`…);
o prefixo diz *de que assunto* o artefato trata.

| Prefixo | Área |
|---|---|
| `padrao-` | Normas de escrita/organização (sempre referenciadas) |
| `code-` | Operações sobre código |
| `test-` | Testes |
| `db-` | Banco de dados |
| `deploy-` | Publicação/entrega |
| `otimizacao-` | Performance (back+front) |
| `obs-` | Observabilidade |
| `site-` | Construção de site |
| `api-` | Contrato de API (OpenAPI + contract testing) |
| `git-` | Versionamento/repositório |
| `cyber-` | Segurança (por domínio) |
| `meta-` | Ecossistema/governança das próprias funcionalidades |

**O nome (depois do prefixo) varia pela classe gramatical do bloco** — é o que distingue um command de um agent
da mesma área sem colisão:

| Bloco | Classe | Exemplos |
|---|---|---|
| **skill** | descritivo (o quê é) | `code-diagnostico`, `cyber-segredos` |
| **command** | **verbo** (a ação) | `/code1-auditar`, `/cyber2-adequar`, `/site-organizar` |
| **agent** | **substantivo de papel** | `code-auditor`, `code-adequador`, `code-revisor` |

**Numeração em fluxos sequenciais:** quando uma área tem um **pipeline de fases**, os commands ganham número de
ordem — `<área>N-<verbo>` — e ordenam no menu `/`: `code1-auditar → code2-caracterizar → code3-adequar`;
`cyber1-auditar → cyber2-adequar`; `git1-auditar → git2-adequar`. **Verbo único da fase de correção em todas as
áreas: `adequar`** (não "corrigir"/"remediar" — mesma coisa, um nome só). Command **avulso** → sem número.

**Arquivos de apoio** (não são artefatos de área) seguem nome funcional, sem prefixo: prefixo `_` para
interno/compartilhado (`hooks/_lib.js`); nomes diretos para config/ativação (`config.json`, `settings.template.json`).

### A mesma área, atravessando os blocos (✅ existe · ⬜ previsto)

| Área | skill | hook | command | agent |
|---|---|---|---|---|
| `code-` | `code-diagnostico`, `code-adequacao`, `git-revisao-diff` | — | ✅ `/code1-auditar`, `/code2-caracterizar`, `/code3-adequar` | ✅ `code-auditor`, `code-adequador`, `code-revisor` |
| `cyber-` | `cyber-segredos` … `cyber-config` (7) | `cyber-git-seguro`, `cyber-dependencias` | ✅ `/cyber1-auditar`, `/cyber2-adequar` | ✅ `cyber-auditor` |
| `git-` | `git-especialista-repositorio`, `git-verificacao-commit`, `git-revisao-diff` | _(pre-commit)_ | ✅ `/git1-auditar`, `/git2-adequar` | ✅ `git-auditor` |
| `deploy-` | `deploy-vercel`, `deploy-docker` | — | ✅ `/deploy-vercel`, `/deploy-docker` | — |
| `site-` | `site-organizacao`, `site-seo` | — | ✅ `/site-organizar`, `/site-seo` | — |
| `meta-` | `meta-create-skill` | — | ✅ `/meta-criar-skill` | — |
| `padrao-` | `padrao-escrita` | `padrao-limiares`, `padrao-format` | ⬜ (subsumido pelo `code-`) | ⬜ |

> **`code-`/`cyber-`/`git-`** seguem o molde **auditar → adequar**: `/X1-auditar` (agent read-only → `.sarak/`)
> → `/X2-adequar` (HITL; agent só para baixo risco). **`deploy-`/`site-`/`meta-`** são **command-only** (sem
> agente — gatilhos de fluxo na thread principal, sem varredura que justifique agente). Gates por commit do `git-`
> são **hooks de pre-commit** (não harness). `code-revisor` é o único agent **recorrente** (todo diff/PR).

**Governança:** a criação de **skills** é regida pela `meta-create-skill`. Para commands/agents/hooks, **§3 deste
README é a fonte da verdade**. Toda funcionalidade nova nasce já neste padrão.

---

## 6. Inventário atual

### Skills (por área)

| Prefixo | Skills |
|---|---|
| `padrao-` | `padrao-escrita`, `padrao-python`, `padrao-typescript`, `padrao-go`, `padrao-java` |
| `code-` | `code-diagnostico`, `code-adequacao`, `code-limpeza-projeto`, `code-entrega` |
| `test-` | `test-unitario`, `test-e2e` |
| `db-` | `db-migrations` |
| `deploy-` | `deploy-vercel`, `deploy-docker` |
| `otimizacao-` | `otimizacao-nivel-1`, `-nivel-2`, `-nivel-3` |
| `obs-` | `obs-logs`, `obs-monitoramento` |
| `site-` | `site-organizacao`, `site-seo` |
| `api-` | `api-contrato` |
| `git-` | `git-commit-inicial`, `git-verificacao-commit`, `git-revisao-diff`, `git-especialista-repositorio` |
| `cyber-` | `cyber-segredos`, `cyber-dependencias`, `cyber-codigo`, `cyber-auth`, `cyber-api`, `cyber-config`, `cyber-dados` |
| `meta-` | `meta-create-skill` |

> Só as `padrao-*` disparam **proativamente** (toda escrita/revisão). As demais são **sob demanda** (você pede ou
> digita `/`), por serem mutativas/sensíveis. Garantia determinística (rodar sempre) é trabalho de **hook**.

### Commands (12) e Agents (5)

- **Commands:** `/code1-auditar`, `/code2-caracterizar`, `/code3-adequar`, `/cyber1-auditar`, `/cyber2-adequar`,
  `/git1-auditar`, `/git2-adequar`, `/deploy-vercel`, `/deploy-docker`, `/site-organizar`, `/site-seo`, `/meta-criar-skill`.
- **Agents:** `code-auditor`, `code-adequador`, `code-revisor`, `cyber-auditor`, `git-auditor`.

---

## 6. Como Instalar (Sincronizador Global)

O ecossistema Sarak não precisa ser copiado fisicamente para cada projeto novo. Ele funciona como um **Cérebro Global** injetado na sua IDE ou provedor de IA favorito.

Para sincronizar todas as skills e comandos desta pasta para a sua máquina, utilize o script em `plugin/`:

```bash
cd plugin
python sync_ide.py --target all
```

**Alvos Suportados:**
- `--target antigravity`: Copia a base de inteligência e constrói o manifesto nativo do Gemini Antigravity (em `~/.gemini/config/plugins/sarak`).
- `--target claude`: Varre a pasta `commands/` e compila uma tabela de roteamento estática para você colar nas suas `Global Custom Instructions` do Claude Code.
