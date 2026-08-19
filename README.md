# knowledge-agentics — Ecossistema Sarak

> **Este README é o manual do diretório.** Explica **o que** este repositório é, **como as três peças se
> encaixam** (§2) e **como criar/modificar** qualquer artefato sob o mesmo padrão (§4). Toda funcionalidade
> nova nasce seguindo o que está aqui.

## 1. O que é este repositório

A **base de inteligência do ecossistema Sarak**: o cérebro compartilhado que orienta como um agente
(Claude Code, Antigravity, GPT) escreve, organiza, revisa e entrega código — **e** o repositório-modelo
que cada projeto novo recebe como ponto de partida.

Não é o código de um produto. São duas coisas, com destinos diferentes:

- **o que o agente sabe fazer** — fica aqui, e é consumido de fora (plugin/sincronizador);
- **o que o projeto recebe** — é **copiado** para dentro dele e passa a ser dele.

Essa fronteira é a chave para entender o resto. É o que a §2 detalha.

---

## 2. As três peças, e a relação entre elas

| Peça | O que é | Onde mora | Viaja para o projeto? |
|---|---|---|---|
| **Template** | O **repositório-modelo replicável**: esqueleto, lei e verificador de um sistema modular | `specs/_estrutura_modulos/` | **sim** — copiado inteiro |
| **Specs** | A **doutrina** e o fluxo SDD que o projeto adota | `specs/_estrutura_base*/`, `specs/_bases_arquiteturais/` | **sim** — instaladas como `specs/` |
| **Skills** | O **comportamento do agente** — capacidade, método, gatilho | `skills/`, `commands/`, `agents/`, `hooks/` | **não** — ficam na base |

**Nada além de specs e template viaja.** Skills, commands, agents e hooks permanecem aqui e alcançam o
projeto pelo plugin ou pelo sincronizador (§8) — nunca por cópia.

### 2.1 Template — a base replicável

`specs/_estrutura_modulos/` é um **repositório inicial completo, com o verificador viajando dentro dele**.
É a peça de maior uso: quase todo projeto novo nasce dela.

```
doutrina/    a LEI (5 documentos + ADRs) — agnóstica de linguagem
bindings/    o esqueleto concreto: typescript · javascript · python
tools/       o GATE e as ferramentas — zero dependência externa
tests/       manutenção do próprio template — NÃO viaja
```

**O princípio único:** a fronteira física de pastas **é** a fronteira de dependência. Extrair um módulo
para infraestrutura própria é copiar uma pasta e recortar as chaves `<MODULO>_*` do `.env` — nunca
reescrever import.

**Ele se verifica sozinho**, em quatro camadas: o gate cobra o projeto · o gate se testa · o template
prova que gera projeto que passa na própria cadeia · toda ferramenta com `--autoteste` é executada.
Verde significa que verificou — e **76 regras** são cobradas por máquina, não de memória.

No projeto gerado, `doutrina/` chega como **`specs/arquitetura/`**. É o mesmo arquivo, instalado.

### 2.2 Specs — a doutrina e o fluxo

| Diretório | Papel | Vira, no projeto |
|---|---|---|
| `specs/_estrutura_modulos/doutrina/` | a lei do Nível 1 e os ADRs do template | `specs/arquitetura/` · `specs/adr/000-decisoes-do-template.md` |
| `specs/_estrutura_base/` | o fluxo **SDD** — contexto, índice, prompts, plans, ADRs | `specs/` |
| `specs/_estrutura_base_site/` | o mesmo fluxo, para projetos de site | `specs/` |
| `specs/_bases_arquiteturais/` | a base por linguagem | `specs/arquitetura/00-base-<binding>.md` |

O **SDD (Spec-Driven Development)** é a regra de trabalho do projeto instalado: *toda alteração nasce de
uma spec*. Uma plan entra na fila, é executada, revisada, aprovada e então **sintetizada** nas specs
definitivas — e some. As specs refletem a realidade do sistema; a plan é o caminho até ela.

### 2.3 Skills — o comportamento do agente

`skills/` diz **como o agente trabalha**: o método, o passo a passo, os limites, o momento de parar e
perguntar. `commands/` são os gatilhos que **você** dispara; `agents/` isolam varredura pesada em
contexto próprio; `hooks/` garantem o que não pode depender de julgamento.

### 2.4 A regra que amarra as três

> **Skill, command e agent REFERENCIAM a lei. Nunca a duplicam.**

A lei vive num lugar só — o `04-regras.md` — e é cobrada por `tools/gate/validate.mjs`. Uma skill que
copiasse a regra criaria uma segunda fonte, e duas fontes divergem. Por isso `CLAUDE.md`, skills e
commands **apontam**; quem afirma é a doutrina, e quem cobra é o gate.

E os dois níveis não se misturam:

- **Nível 0** — SRP, limiares (≤40 linhas, ≤3 aninhamento, ≤4 parâmetros), zero hardcoded, segredo no
  `.env`. Vale para **qualquer** projeto → skill `padrao-escrita` + `padrao-<linguagem>`.
- **Nível 1** — a arquitetura de módulos. Vale **só** para projeto que adotou o template.

Sem o template, vale o Nível 0 — **não se improvisa meia estrutura modular.**

### 2.5 Os fluxos prontos

| Quero | Caminho |
|---|---|
| Iniciar um repositório do zero | skill `meta-iniciar-repositorio` → `spec-fundacao` → `git-commit-inicial` |
| Criar um módulo, ou um sistema modular | skill `code-modulo` |
| **Adequar um sistema legado ao template** | skill `meta-adequacao-modular` (Fase A planeja · Fase B confere) |
| Adequar código legado ao Nível 0 | `/code1-auditar` → `/code2-caracterizar` → `/code3-adequar` |
| Auditar segurança | `/cyber1-auditar` → `/cyber2-adequar` |
| Auditar o histórico git | `/git1-auditar` → `/git2-adequar` |

### Estado atual

| Bloco | Status |
|---|---|
| `skills/` | ✅ **49** skills por área (§7) |
| `commands/` | ✅ **12** (code/cyber/git auditar→adequar; deploy/site/meta) |
| `agents/` | ✅ **5** (`code-auditor`, `code-adequador`, `code-revisor`, `cyber-auditor`, `git-auditor`) |
| `hooks/` | ✅ **5** garantias (segredo no git, dependências, cobertura, formato, limiares) |
| `specs/` | ✅ template de módulos + fluxo SDD (app e site) + bases por linguagem |
| `plugin/` | ✅ sincronizador de IDEs — ver `plugin/README.md` |

---

## 3. Os blocos de construção (visão rápida)

| Bloco | O que é | Como dispara | Onde mora |
|---|---|---|---|
| **CLAUDE.md** | Inegociáveis sempre no contexto | **Automático** — toda sessão | raiz (projeto) e `~/.claude` (global) |
| **skills/** | Capacidade que o **modelo** usa quando faz sentido | Modelo decide pela `description`, **ou** você digita `/nome` | `skills/<nome>/SKILL.md` (3 camadas) |
| **commands/** | **Atalho** de prompt que **você** dispara | **Manual** — você digita `/nome` | `commands/<nome>.md` |
| **agents/** | **Subagente** com contexto próprio | Modelo **delega** (`Task`) ou você cita pelo nome | `agents/<nome>.md` |
| **hooks/** | Comando shell em **eventos** do harness | **Automático/determinístico** no evento | `hooks/hooks.json` (scripts em `hooks/`) |
| **specs/** | A **doutrina** e o **template** replicável (§2) | Copiado no início do projeto + `validate.mjs` | `specs/` |
| **plugin/** | Sincronizador para IDEs sem marketplace | **Manual** (`sync_ide.py`) | `plugin/` |
| **settings.json** | Configuração (permissões, env, model, hooks) | **Automático** | `.claude/settings.json` |
| **MCP** | Servidores de **ferramentas externas** | Ferramentas ficam disponíveis ao modelo | `.mcp.json` |

> **Regra de ouro do disparo:** **hooks garantem** (determinístico) · **skills/agents o modelo decide**
> (julgamento pela `description`) · **commands você dispara** (`/`) · **CLAUDE.md está sempre on**.

---

## 4. Como criar cada bloco (manual de autoria)

> **Esta é a seção operacional.** Antes de criar qualquer coisa: escolha o **bloco** (§5 guia de decisão) e o
> **nome** (§6 nomenclatura). Depois siga a receita do bloco abaixo.

### 4.0 Princípios transversais (valem para TODO artefato)

1. **DRY — a lógica vive na SKILL.** Command, agent e hook **referenciam** a skill, nunca duplicam o conteúdo.
   Se você está copiando regras, está errado — aponte.
2. **Nomenclatura `<área>-<nome>`** em kebab-case (§6). O prefixo é a **área**, não o tipo.
3. **⚠️ Armadilha do YAML (pega todo mundo):** **nunca** use `: ` (dois-pontos + espaço) dentro de uma
   `description` de frontmatter — quebra o parser (*"mapping values are not allowed here"*). Reescreva:
   use `—`, `(por exemplo, …)` em vez de `(ex.: …)`. Valide com um parser YAML antes de considerar pronto.
4. **Validação:** todo frontmatter parseia como YAML; todo ponteiro (`references/…`, script, asset) resolve.
5. **Ponteiro só existe com conteúdo do outro lado.** Arquivo de Camada 3 que ficou só com o esqueleto do
   scaffold **não** é ponteiro válido — ou preencha, ou apague o arquivo **e** a linha que aponta para ele.
   Um `references/workflow.md` de placeholders manda o agente ler um formulário em branco.

### 4.1 Criar uma SKILL — *a capacidade/conhecimento*

- **Onde:** `skills/<área>-<nome>/SKILL.md` (+ `references/`, `scripts/`, `assets/` **condicionais** — só se houver conteúdo).
- **Padrão completo:** a skill **`meta-create-skill`** (ou o command `/meta-criar-skill`) — é a fonte da verdade. Scaffold: `meta-create-skill/scripts/scaffold_skill.py <nome>`.
- **Frontmatter:** `name` (= pasta) + `description`. A `description` é o **gatilho**: `o quê + quando/gatilho [+ trava "NÃO acione proativamente" se sob demanda]`. Enxuta. Sem o *quando*, é título — e título não dispara.
- **Modelo de 3 camadas:** (1) `name`+`description` (sempre carregado) · (2) corpo do `SKILL.md` denso e auto-suficiente · (3) `references/`/`scripts/`/`assets/` lidos sob demanda via ponteiro.
- **Seções do corpo:** o que é · quando usar · workflow acionável (ferramenta+ação+critério) · regras `NÃO/NUNCA` · checklist · ponteiros de Camada 3.
- **Camada 3 com nome de propósito** (`contract-testing.md`, `estrategia.md`, `hardening.md`) — não o trio genérico do scaffold. Uma skill sem Camada 3 é normal: sete das nove `cyber-*` não têm nenhuma.
- **Script de skill:** se tiver lógica pura, dê-lhe `--autoteste` e **registre** em
  `specs/_estrutura_modulos/tests/run-all-selftests.mjs` — `--autoteste` que ninguém roda reprova como órfão.

### 4.2 Criar um COMMAND — *o gatilho que você dispara*

- **Onde:** `commands/<área>-<verbo>.md`. **Command = verbo** (auditar, adequar, organizar). Vira `/<nome>`.
- **Frontmatter:** `description` (**sem `: `**), `argument-hint`, `allowed-tools`, `model` (opcional, herda a sessão).
- **Corpo = um PROMPT.** É um **gatilho fino que orquestra uma skill** — a lógica vive na skill.
  Use `$1`/`$2`/`$ARGUMENTS`.
- **`allowed-tools`:** liste só o necessário. Inclua **`Task`** se o command for **disparar um agent**.
- **HITL fica no command** (thread principal) — agent não confirma com o humano, então tudo que precisa de
  "⚠️ Confirma?" mora aqui.
- **Numeração:** fluxo sequencial de várias fases → `<área>N-<verbo>`. Command **único** → **sem número**.

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

### 4.3 Criar um AGENT — *o subagente de contexto isolado*

- **Onde:** `agents/<área>-<papel>.md`. **Agent = substantivo de papel** (auditor, adequador, revisor).
- **Frontmatter:** `name`, `description` (**sem `: `**), `tools`, `model`.
- **Corpo = um SYSTEM PROMPT.** Recebe **uma tarefa isolada**, trabalha em **contexto próprio** e devolve
  **só um resumo compacto** à thread principal — é isso que economiza contexto.
- **Read-only por construção:** um auditor **não recebe `Edit`/`Write`**. Quem precisa **persistir**
  artefato recebe `Write` **restrito** a `.sarak/<área>/`.
- **`model`:** `sonnet` para varredura mecânica (barato, roda em paralelo); `opus` quando exige julgamento pesado.
- **Agent NÃO faz HITL** — quem confirma é o command/thread principal. Correção destrutiva **não** vira agente.

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
Retorne **EXCLUSIVAMENTE** um bloco JSON válido.
```

### 4.4 Criar um HOOK — *a garantia determinística*

- **Onde:** script em `hooks/<área>-<nome>.js` + **wiring** em `hooks/hooks.json` (ativo pelo plugin) ou
  `hooks/settings.template.json` (modo manual) + tunables em `hooks/config.json`. Base: `hooks/_lib.js`.
- **Contrato:** lê o payload JSON no **stdin**; decide via JSON no **stdout** (`deny`/`ask` em PreToolUse;
  `block`/`warn` em PostToolUse; sem saída = segue). Runtime **Node**.
- **É o ÚNICO bloco que garante** (roda sempre, no evento). Detalhe completo em **`hooks/README.md`**.

### 4.5 Command vs Agent vs ambos — *a decisão*

| Situação | Bloco |
|---|---|
| Fluxo **mutativo/HITL** ou **setup** (deploy, site, migrations, entrega, correção destrutiva) | **só command** (agent não faz HITL) |
| **Varredura read-only ampla** (auditoria de repo/domínio/histórico) | **command + agent** (isola o churn) |
| **Trabalho paralelizável/isolado de baixo risco** (adequar por tarefa) | **command + agent** (fan-out) |
| **Perspectiva independente recorrente** (revisar um diff) | **agent** (`code-revisor`) |

> **Molde canônico:** `auditar (command + agent read-only → consolida em .sarak/) → adequar (command;
> agent só para baixo risco; HITL para o resto)`. É o que `code-`/`cyber-`/`git-` seguem.

### 4.6 Convenção `.sarak/` (persistência no projeto-alvo)

Auditorias e planos persistem em `.sarak/<área>/` no **projeto auditado** (`audit`, `security`, `git-audit`).
**É versionável — commite.** Padrão: **snapshot congelado** (datado) + **estado vivo** (backlog/achados) +
**log append-only**.

---

## 5. Qual bloco usar? (guia de decisão)

- Precisa **garantir** que algo rode (todo commit/edição)? → **hook**.
- Quer uma **capacidade** que o modelo aplica quando faz sentido? → **skill**.
- Quer um **atalho** que **você** dispara com `/`? → **command**.
- Quer **isolar** uma varredura/tarefa pesada em contexto separado? → **agent**.
- Quer que o **projeto** nasça com estrutura, lei e verificador? → **template** (§2.1).
- Quer **normas sempre ativas**? → **CLAUDE.md**.

---

## 6. Padrão de nomenclatura (vale para TODOS os blocos)

> A **regra canônica de nomes**. É o que mantém o ecossistema navegável: um `grep <área>-*` encontra
> **toda** a superfície de um assunto (skill + hook + command + agent) de uma vez.

**Formato:** `<prefixo-de-área>-<nome-descritivo>`, sempre em **kebab-case**.
**O prefixo é a ÁREA/domínio — não o tipo do bloco.** O tipo já vem da pasta.

O vocabulário fechado de prefixos, com exemplo por área, é **`skills/meta-create-skill/references/nomenclatura.md`**
— fonte única (a skill é o que o agente carrega em qualquer provedor; este README aponta, não duplica).

**O nome varia pela classe gramatical do bloco** — é o que evita colisão dentro da mesma área:

| Bloco | Classe | Exemplos |
|---|---|---|
| **skill** | descritivo (o quê é) | `code-diagnostico`, `cyber-segredos` |
| **command** | **verbo** (a ação) | `/code1-auditar`, `/cyber2-adequar` |
| **agent** | **substantivo de papel** | `code-auditor`, `code-revisor` |

**Numeração em fluxos sequenciais:** `<área>N-<verbo>` ordena no menu `/`. **Verbo único da fase de correção
em todas as áreas: `adequar`.** Command avulso → sem número.

### A mesma área, atravessando os blocos (✅ existe · ⬜ previsto)

| Área | skill | hook | command | agent |
|---|---|---|---|---|
| `code-` | `code-diagnostico`, `code-adequacao`, `code-modulo` … (7) | — | ✅ `/code1-auditar`, `/code2-caracterizar`, `/code3-adequar` | ✅ `code-auditor`, `code-adequador`, `code-revisor` |
| `cyber-` | `cyber-segredos` … `cyber-infra` (9) | `cyber-git-seguro`, `cyber-dependencias` | ✅ `/cyber1-auditar`, `/cyber2-adequar` | ✅ `cyber-auditor` |
| `git-` | `git-especialista-repositorio`, `git-verificacao-commit`, `git-revisao-diff` | _(pre-commit)_ | ✅ `/git1-auditar`, `/git2-adequar` | ✅ `git-auditor` |
| `test-` | `test-unitario` … `test-carga` (6) | `test-cobertura` | ⬜ | ⬜ |
| `deploy-` | `deploy-vercel`, `deploy-docker` | — | ✅ `/deploy-vercel`, `/deploy-docker` | — |
| `site-` | `site-organizacao`, `site-seo`, `site-criacao` | — | ✅ `/site-organizar`, `/site-seo` | — |
| `meta-` | `meta-create-skill`, `meta-iniciar-repositorio`, `meta-adequacao-modular`, `meta-atualizar-base`, `meta-verificacao-base` | — | ✅ `/meta-criar-skill` | — |
| `padrao-` | `padrao-escrita`, `padrao-python`, `padrao-typescript` | `padrao-limiares`, `padrao-format` | ⬜ (subsumido pelo `code-`) | ⬜ |

**Governança:** a criação de **skills** é regida pela `meta-create-skill`. Para commands/agents/hooks,
**§4 deste README é a fonte da verdade**.

---

## 7. Inventário atual

### Skills (49, por área)

| Prefixo | Skills |
|---|---|
| `padrao-` (3) | `padrao-escrita`, `padrao-python`, `padrao-typescript` |
| `code-` (7) | `code-adequacao`, `code-auditoria-padrao`, `code-diagnostico`, `code-documentacao`, `code-entrega`, `code-limpeza-projeto`, `code-modulo` |
| `spec-` (4) | `spec-atualizar`, `spec-fundacao`, `spec-site-fundacao`, `spec-write` |
| `test-` (6) | `test-api-contrato`, `test-carga`, `test-e2e`, `test-integracao-api`, `test-unitario`, `test-ws-realtime` |
| `db-` (1) | `db-migrations` |
| `deploy-` (2) | `deploy-docker`, `deploy-vercel` |
| `otimizacao-` (3) | `otimizacao-nivel-1`, `otimizacao-nivel-2`, `otimizacao-nivel-3` |
| `obs-` (2) | `obs-logs`, `obs-monitoramento` |
| `site-` (3) | `site-criacao`, `site-organizacao`, `site-seo` |
| `git-` (4) | `git-commit-inicial`, `git-especialista-repositorio`, `git-revisao-diff`, `git-verificacao-commit` |
| `cyber-` (9) | `cyber-api`, `cyber-auth`, `cyber-codigo`, `cyber-config`, `cyber-dados`, `cyber-dependencias`, `cyber-ia`, `cyber-infra`, `cyber-segredos` |
| `meta-` (5) | `meta-adequacao-modular`, `meta-atualizar-base`, `meta-create-skill`, `meta-iniciar-repositorio`, `meta-verificacao-base` |

> Só as `padrao-*` e a `spec-write` disparam **proativamente**. As demais são **sob demanda** (você pede ou
> digita `/`), por serem mutativas/sensíveis. Garantia determinística é trabalho de **hook**.

### Commands (12), Agents (5) e Hooks (5)

- **Commands:** `/code1-auditar`, `/code2-caracterizar`, `/code3-adequar`, `/cyber1-auditar`, `/cyber2-adequar`,
  `/git1-auditar`, `/git2-adequar`, `/deploy-vercel`, `/deploy-docker`, `/site-organizar`, `/site-seo`, `/meta-criar-skill`.
- **Agents:** `code-auditor`, `code-adequador`, `code-revisor`, `cyber-auditor`, `git-auditor`.
- **Hooks:** `cyber-git-seguro`, `cyber-dependencias`, `test-cobertura` (PreToolUse) · `padrao-format`,
  `padrao-limiares` (PostToolUse).

### Verificar a integridade da base

```bash
python skills/meta-verificacao-base/scripts/audit_base.py --raiz .   # YAML, contratos, ponteiros órfãos
npm run autoteste:tudo                                              # todo --autoteste registrado
node specs/_estrutura_modulos/tests/verify-routine.mjs               # o template inteiro, ponta a ponta
```

---

## 8. Como instalar

A base é a **fonte da verdade** versionada no GitHub (`Templates-Sarak/knowledge-agentics`). Cada
ferramenta agêntica a consome do seu jeito — os manifestos de cada provedor convivem sem interferir.

### Claude Code — plugin nativo

O repo é, ao mesmo tempo, um **marketplace** e o **plugin `sarak`** (manifestos em `.claude-plugin/`):

```
/plugin marketplace add Templates-Sarak/knowledge-agentics
/plugin install sarak@knowledge-agentics
```

Isso carrega **skills, commands, agents e hooks** nativamente em qualquer projeto — as 5 garantias
(`hooks/hooks.json`) ficam **ativas por padrão**. Atualizar depois:

```
/plugin marketplace update knowledge-agentics
```

> ⚠️ **O cache é o que o agente lê, não o repositório.** As skills vêm de
> `~/.claude/plugins/cache/knowledge-agentics/sarak/<versão>/`. Conserto no repo só alcança o agente
> depois que o cache sincroniza — o `.git/hooks/pre-commit` local roda `plugin/sync_ide.py --target all`
> a cada commit, mas esse hook **não é versionado**: clone novo, outra máquina ou runner de CI não o têm.
> Verificação que rode "pela skill" precisa **confirmar a sincronização antes**, ou estará testando o passado.

> O `CLAUDE.md` (inegociáveis sempre-ativos) **não** viaja no plugin — mantenha-o na raiz do projeto-alvo
> ou em `~/.claude/CLAUDE.md`. O modo manual dos hooks (mesclar `hooks/settings.template.json`) segue
> disponível para quem não usa o plugin.

### Antigravity e outros provedores — sincronizador

Provedores sem marketplace consomem via `plugin/` — detalhe, decisões e limites em **`plugin/README.md`**:

```bash
cd plugin
python sync_ide.py --target all          # Claude + Antigravity
python sync_ide.py --target antigravity  # só o Antigravity
```

### Iniciar um projeto a partir do template

Não se copia pasta à mão. O caminho é a skill **`meta-iniciar-repositorio`**, que instala projeto modular,
fluxo SDD, primeiros módulos, `.agents/` e os hooks de git, e termina com o gate verde:

```bash
python skills/meta-iniciar-repositorio/scripts/init_repo.py \
  --target <caminho> --name "<nome>" --binding typescript --escopo acme \
  --modulos catalogo:domain hub:connector --git-init
```

Depois dele restam quatro pendências de HITL, de propósito: preencher os **valores** do `.env`, escrever
`specs/00-contexto.md`, registrar os ADRs do projeto (`spec-fundacao`) e o primeiro commit
(`git-commit-inicial`).
