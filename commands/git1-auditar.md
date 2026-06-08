---
description: Auditoria completa do histórico Git — varre todas as branches e tags atrás de vazamentos (segredos e arquivos sensíveis em qualquer commit) via agente git-auditor, e entrega o relatório em .sarak/git-audit. Read-only (não reescreve histórico); a adequação é o /git2-adequar.
argument-hint: [alvo]
allowed-tools: Task, Write, Read, Glob, Bash
---

# /git1-auditar — auditoria completa do histórico Git

Alvo: **$1** (se vazio, use o diretório atual `.`).

Caça vazamentos no **histórico inteiro** — não basta o último commit estar limpo: um segredo já versionado
**continua no passado**. Dispara **um** agente `git-auditor` (varredura read-only de todas as branches/tags) e
persiste o relatório em `.sarak/git-audit/`. **Não reescreve histórico** — ao achar vazamento, encaminha a
adequação ao `/git2-adequar`.

## Pré-requisitos (opcionais — degradação graciosa)
**gitleaks**/**trufflehog** para cross-check do histórico. Ausentes → o `git-auditor` usa só o `scan_historico.py`
(Sarak) e **registra a lacuna**. Não trava.

## Passos

1. **Delimitar** — confirme que `$1` é um **repo Git** (senão, pare e avise). Capture `<data>` (`Bash date +%F`).

2. **Disparar o `git-auditor`** — via **Task** (Sonnet), **um** agente: varredura completa read-only do histórico
   (`scan_historico.py` + cross-check gitleaks/trufflehog), classificação (vivo/passado/arquivo/entropia) e
   gravação em `.sarak/git-audit/`. Trabalhe com o **resumo** que ele devolve (não re-leia os artefatos inteiros).

3. **Apresentar** — sumário: achados por tipo (conteúdo/arquivo/entropia), nº de branches/tags auditadas, top
   achados **mascarados**, e os caminhos (`.sarak/git-audit/relatorio-<data>.md` + `achados-<data>.json`).

4. **Encaminhar a adequação (se houver achado)** — a próxima fase é o **`/git2-adequar`** (reescrita de histórico +
   rotação, **HITL severo + backup**, que orquestra os passos 4-6 da skill `git-especialista-repositorio`) —
   **este command não adéqua**. Lembre que **toda credencial commitada deve ser rotacionada** no provedor mesmo
   após o expurgo, e que `push --force-with-lease` precisa ser **coordenado** (clones antigos quebram). `.sarak/` é versionável.

## Limites
- **NUNCA** reescreva histórico, rode `filter-repo`/BFG ou `push --force` aqui — só auditoria; a adequação é o `/git2-adequar`.
- **NUNCA** exponha segredo por extenso — tudo mascarado (sumário, relatório).
- **NÃO** modifique código nem histórico — muda só `.sarak/git-audit/`.
- **NÃO** confunda escopo: working tree/staged é da `git-verificacao-commit`; conformidade de código é o fluxo `code-`.
