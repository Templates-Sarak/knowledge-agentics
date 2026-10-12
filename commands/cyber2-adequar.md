---
description: Fase 2 de segurança — adequa os achados da auditoria por ordem de severidade, roteando cada um à skill cyber dona (secrets/deps/code/auth/api/config/data) com HITL por achado, re-scan de confirmação e atualização do relatório. Toda adequação é HITL na thread principal (sem agente autônomo). Mutativo.
argument-hint: [domain|--severity S]
allowed-tools: Task, Read, Edit, Write, Grep, Glob, Bash
---

# /cyber2-adequar — Fase 2: adequação de segurança (HITL por achado)

Escopo: **$ARGUMENTS** — `<domain>` (só um domínio: `secrets|dependencies|code|auth|api|config|data`) · `--severity S` (só desse nível pra cima: `critical|high|medium|low`) · **vazio** (todos).

Você é o **orquestrador** da adequação. Lê `.sarak/security/findings-<date>.json` e adéqua **um achado por vez**,
na **thread principal** com **HITL** — porque adequar segurança (rotação de credencial, authz, patch) é alto-risco
e às vezes **ação externa do humano**. **Sem agente de adequação.** A lógica é da skill `cyber-<dominio>` dona de
cada achado.

> Pré-requisito: rode `/cyber1-auditar` antes (gera `findings-<date>.json`). Formato/roteador em
> `cyber-config/references/achados-format.md`.

## Passos

1. **Selecionar achados** — abra o `findings-<date>.json` mais recente (relatório antigo em português — `achados-<data>.json`, `severidade`,
   `skillDona`… — é aceito na leitura; mapa em `cyber-config/references/achados-format.md` §Compatibilidade de
   leitura; ao gravar, só as chaves novas); filtre pelo `$ARGUMENTS`; **ordene por
   `severity`** (`critical` → `high` → `medium` → `low`).

2. **Por achado (HITL):** roteie pela `ownerSkill` e aplique a **adequação da skill** correspondente. Apresente o
   **plano** (achado mascarado, local, correção proposta, risco de quebrar) → **"⚠️ Confirma?"** → **aguarde** →
   aplique. Casos especiais (das próprias skills):
   - **secrets** (`cyber-segredos`): mover p/ `.env` (var prefixada) + `.gitignore`/`.env.example`; **rotacionar** a
     credencial — **ação externa**: o command **sinaliza ao usuário** que ele precisa rotacionar. Se já foi
     commitada → encaminhe à **`git-especialista-repositorio`** (reescrita de histórico).
   - **dependencies** (`cyber-dependencias`): `audit fix`/update; **major/`--force` só com HITL**; rode
     **build/testes** logo após (bloqueante — update não pode quebrar a app).
   - **code** (`cyber-codigo`): patch seguro **preservando comportamento**; teste.
   - **auth/api/config/data**: aplique a adequação da skill respectiva (hash/JWT/cookies; authz/rate-limit/CORS;
     headers/TLS/debug; PII/mascaramento/cifra).

3. **Verificar (re-scan)** — **reuse o agente `cyber-auditor`** (via Task, read-only) no **domínio do achado** para
   confirmar que ele sumiu. Vermelho → reavalie. Atualize `findings.json` (`status: resolved`) e
   `report-<date>.md` (status + métricas "depois").

4. **Pendências justificadas** — o que **não** for adequado vai para "Pendências justificadas (aceitas com
   aprovação)" do relatório, com a justificativa técnica e quem aprovou (`status: accepted`).

5. **Encerrar** — resumo: adequados/aceitos/pendentes por severidade; **críticos/high zerados ou justificados**;
   credenciais a **rotacionar** listadas ao usuário.

## Limites
- **NUNCA** rotacione/edite/atualize sem o **HITL** do passo 2 — adequar segurança é sensível.
- **NUNCA** rode `npm audit fix --force` sem confirmação (atravessa majors, quebra a app).
- **NUNCA** exponha segredo por extenso — mascarado em tudo; **nunca** considere segredo commitado seguro só por
  tirá-lo do código (rotacione + histórico).
- **NÃO** delegue a adequação a um agente autônomo — é thread principal + HITL (agente não confirma com o humano).
- **NÃO** saia do escopo: histórico de segredo → `git-especialista-repositorio`; conformidade de código (não-segurança) → fluxo `code-`.
