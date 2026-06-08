---
name: git-verificacao-commit
description: Gate rápido de segredos por commit — varre só o que está STAGED (segredos + arquivos sensíveis) e bloqueia o commit (pre-commit hook, exit 1). Use ao instalar/configurar o gate, quando bloquear, ou para checar o staged. Histórico é da git-especialista-repositorio. NÃO acione proativamente.
---

# Skill: Verificação de Commit (gate rápido)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita, cyber-segredos`. Consulte-as antes de iniciar.

Barreira **leve e automática** que roda em **todo `git commit`**: varre só o que está **staged** por
segredos e arquivos sensíveis e **bloqueia** o commit antes que o vazamento entre no repositório. É a
primeira linha de defesa — rápida (sem varrer histórico). O check-up profundo do histórico/branches é da
`git-especialista-repositorio`.

> Escopo deliberadamente estreito: **apenas o commit atual**. Os padrões de segredo e nomes sensíveis em
> `scripts/config.json` **derivam do catálogo canônico** da skill `cyber-segredos` (fonte única do ecossistema —
> manter em sincronia). Princípios globais em `CLAUDE.md`.

## Quando usar
- Para **instalar/configurar** o gate num repositório (hook + script).
- Quando o hook **bloqueia** um commit — interpretar o achado e orientar a correção.
- Para rodar a checagem do staged **manualmente** a qualquer momento.
- Roda automaticamente via `git pre-commit` (não precisa de invocação manual no fluxo normal).

## Workflow

### A. Instalar o gate (mutação leve — confirme antes)
1. Crie `.githooks/` no repo-alvo; copie para lá `scripts/verificar_commit.py` e `scripts/config.json`.
2. Copie `assets/pre-commit` para `.githooks/pre-commit` e torne-o executável (`chmod +x`).
3. Aponte o git para a pasta: `git config core.hooksPath .githooks`. Pronto — roda em todo commit.

### B. Quando o gate bloqueia (exit 1)
1. Leia a saída JSON de `verificar_commit.py` (`achados_segredo` mascarados + `arquivos_sensiveis`).
2. **Corrija**: mova o segredo para `.env` (e `.gitignore`), troque por `process.env`/`os.getenv`, e **re-stage**.
3. Se o segredo **já está em commits anteriores/no histórico**, isto aqui não basta → acione a `git-especialista-repositorio` (reescrita + rotação).
4. **Falso positivo**: ajuste a allowlist em `.githooks/config.json` — **nunca** use `--no-verify` para burlar.

### C. Checagem manual
- `python scripts/verificar_commit.py --raiz <repo>` → JSON do staged (exit 1 se houver achado).

## Regras e limites
- **NUNCA** oriente `git commit --no-verify` para passar por cima de um achado real — falso positivo vai para a allowlist do config.
- **NUNCA** escreva o segredo por extenso em log/saída — o script já mascara; mantenha assim.
- **NÃO** tente corrigir histórico/outras branches aqui — escopo é só o staged; histórico é da `git-especialista-repositorio`.
- **NÃO** reescreva os padrões para "passar o commit" — corrija o vazamento, não o detector.
- **NÃO** saia do escopo: limpeza de lixo → `code-limpeza-projeto`; auditoria completa → `git-especialista-repositorio`.

## Checklist "pronta"
- [ ] Hook instalado (`.githooks/pre-commit` executável + `core.hooksPath` apontado)?
- [ ] `verificar_commit.py` + `config.json` presentes em `.githooks/` do repo?
- [ ] Em bloqueio: achados triados, segredo movido para `.env` e re-staged (sem `--no-verify`)?
- [ ] Suspeita de histórico encaminhada à `git-especialista-repositorio`?

## Referências (Camada 3 — leia sob demanda)
- `scripts/verificar_commit.py` + `scripts/config.json` — gate do staged (segredos + arquivos sensíveis; exit 1 bloqueia).
- `assets/pre-commit` — hook `pre-commit` que chama o script (instalado pela `git-commit-inicial`).
