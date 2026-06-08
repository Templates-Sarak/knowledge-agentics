---
description: Fase 2 do git — adequa o histórico expurgando os vazamentos achados por /git1-auditar (reescrita com filter-repo/BFG + rotação das credenciais), sob HITL severo e com backup obrigatório antes. Operação IRREVERSÍVEL (muda todos os hashes, exige force-with-lease coordenado). Thread principal, sem agente. Reusa a skill git-especialista-repositorio.
argument-hint: [achado-id|--tipo T]
allowed-tools: Task, Read, Edit, Write, Grep, Glob, Bash
---

# /git2-adequar — Fase 2: adequação de histórico (HITL severo)

Escopo: **$ARGUMENTS** — `<achado-id>` (um achado) · `--tipo T` (conteúdo|arquivo) · **vazio** (todos os confirmados).

⚠️ **A operação mais perigosa do ecossistema.** Reescrever histórico é **irreversível**: muda **todos os hashes**,
exige `push --force-with-lease` **coordenado** e **quebra os clones de todo mundo**. Por isso: **backup antes**,
**HITL severo** (aprovação inequívoca), **sem agente** (adequação destrutiva não vai para agente autônomo). A
**lógica** é a skill `git-especialista-repositorio` (passos 4-6 + `references/remediacao.md`) — aqui você orquestra.

> Pré-requisito: rode `/git1-auditar` antes (gera `.sarak/git-audit/achados-<data>.json`). Sem achado → nada a adequar.

## Passos

1. **Ler os achados** — abra o `achados-<data>.json` mais recente; selecione pelo `$ARGUMENTS`. Separe **segredo
   vivo** / **só passado** / **arquivo sensível** (entropia `confianca: baixa` → triar **antes**, não adequar no escuro).

2. **BACKUP obrigatório (antes de tocar em qualquer coisa)** — crie um espelho do repo:
   `git clone --mirror <repo> <repo>-backup-<data>.git` (ou `git bundle create`). **Sem backup, não prossiga.**

3. **Working tree primeiro (não-destrutivo)** — mova os **segredos vivos** para `.env`/`process.env` (a parte que
   não exige reescrita). Isso é reversível.

4. **HITL SEVERO (a reescrita)** — apresente o plano de `assets/relatorio_auditoria.md`:
   - **o que expurgar** (segredos/arquivos por commit/branch),
   - a **lista de credenciais a ROTACIONAR** (toda credencial exposta),
   - **branches/tags afetadas**,
   - o **risco**: hashes mudam, `force-with-lease` coordenado, clones antigos quebram.
   → **"⚠️ Confirma a reescrita de histórico? (IRREVERSÍVEL)"** → **aguarde aprovação inequívoca**. Sem o "SIM", **pare**.

5. **Reescrever** — após o "SIM": `git filter-repo` (preferível) ou BFG para expurgar segredos/arquivos do histórico
   (passo a passo em `references/remediacao.md`).

6. **Rotacionar (ação externa — sinalizar)** — **rotacione no provedor TODA credencial exposta**. O command **não**
   tem como rotacionar por você → **liste explicitamente ao usuário** o que ele precisa rotacionar. Segredo
   versionado **nunca** é seguro só por expurgo.

7. **Force-push coordenado** — `git push --force-with-lease` nas branches/tags afetadas — **nunca `--force` seco** —
   e **avise a equipe** (todo clone antigo precisa re-clonar). 

8. **Confirmar (re-scan)** — **reuse o agente `git-auditor`** (via Task, read-only) para confirmar `total: 0`.
   Atualize o `relatorio-<data>.md` (seção 5: status final + métricas "depois", credenciais rotacionadas).

## Limites
- **NUNCA** reescreva sem o **backup** (passo 2) e o **HITL inequívoco** (passo 4).
- **NUNCA** rode `push --force` "seco" — sempre `--force-with-lease` + coordenação com a equipe.
- **NUNCA** considere um segredo seguro só por expurgá-lo — **rotacione SEMPRE** (sinalize ao usuário).
- **NÃO** delegue a reescrita a um agente — é thread principal + HITL severo.
- **NÃO** trate entropia (`confianca: baixa`) como certa — triar antes; pode ser hash/build id.
- **NÃO** saia do escopo: dead code/lixo é da `code-limpeza-projeto`; gate por commit é da `git-verificacao-commit`.
