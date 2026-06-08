---
description: Audita a conformidade de um sistema legado ao padrão Sarak (fan-out de um agente code-auditor por módulo) e entrega o plano de adequação persistido em .sarak/audit, com HITL para aprovar o plano. Read-only sobre o código-fonte.
argument-hint: [alvo]
allowed-tools: Task, Write, Read, Glob, Bash
---

# /code1-auditar — auditoria de conformidade (planejamento da adequação)

Alvo: **$1** (se vazio, use o diretório atual `.`).

Você é o **orquestrador** da auditoria. Dispara um agente `code-auditor` **por módulo** (em paralelo),
consolida os achados num **plano de adequação** e **persiste** em `.sarak/audit/`. **Não toca no código-fonte**
— só escreve artefatos de auditoria. A lógica/o formato são da skill `code-diagnostico`; aqui você orquestra.

## Passos

1. **Delimitar módulos** — `Glob` em `backend/*/` e `frontend/*/` (e, na ausência dessa estrutura, trate o alvo
   como um módulo único). Liste os módulos a auditar. Capture a data com `Bash`: `date +%F` (use como `<data>`).

2. **Fan-out (um `code-auditor` por módulo, em paralelo)** — dispare, via **Task**, o agente `code-auditor`
   para **cada módulo**, passando o caminho do módulo. Os agentes rodam em **Sonnet**, são **read-only** sobre o
   source e gravam `.sarak/audit/<modulo>/{backlog.json,auditoria.md}`. Cada um devolve só um **resumo compacto**
   (contagens por dimensão, cobertura, tarefas por onda, top riscos, caminhos). **Não** re-leia os arquivos
   inteiros — trabalhe com os resumos.

3. **Consolidar (julgamento — thread principal)** — a partir dos resumos:
   - `.sarak/audit/backlog-<data>.json` — funda os `tarefas[]` de todos os módulos num único array, **ordenado por
     (`risco` asc, `severidade` desc)** e agrupado por **onda**; mantenha `status: pending`. Inclua um `resumo`
     (módulos, violações por dimensão, módulos sem teste, nº de tarefas por onda).
   - `.sarak/audit/auditoria-<data>.md` — preencha `code-diagnostico/assets/auditoria.template.md`: sumário
     executivo, mapa por módulo, backlog decomposto, **sequenciamento das ondas atravessando módulos**, mapa de
     dependências (`dependeDe`) e recomendações (ADR para acoplamento/dados; bugs ≠ adequação).
   - Este `auditoria-<data>.md` é um **snapshot congelado** (não sobrescreva auditorias antigas — datas coexistem).

4. **HITL — Portão A (aprovar o plano)** — apresente o **sumário executivo + as ondas propostas + os maiores
   riscos** e pergunte: **"⚠️ Aprova o plano / ajusta escopo / descarta módulos?"**. **Aguarde** a resposta.
   Aplique ajustes/descartes no consolidado se pedido.

5. **Finalizar** — aponte os caminhos gerados (`.sarak/audit/...`) e indique o **próximo passo**: a execução em
   ondas (`/code3-adequar`, etapa futura) consome o `backlog-<data>.json`, roteando cada tarefa pelo `risco`.
   Lembre o usuário: **`.sarak/` é versionável — commite** (é o plano/registro da campanha, e o git é o histórico
   do backlog vivo); **não** o coloque no `.gitignore`.

## Limites
- **NÃO** modifique o código-fonte — só escreva sob `.sarak/audit/`. (`git status` deve mostrar mudança só ali.)
- **NÃO** pule o Portão A — nenhuma execução começa sem a aprovação do plano.
- **NÃO** consolide re-lendo arquivos inteiros dos módulos — use os resumos dos agentes (economia de contexto).
- **NÃO** audite segurança/deps a fundo — é das skills `cyber-*`; aqui o critério é `padrao-escrita`.
