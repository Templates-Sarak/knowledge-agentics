---
name: git-commit-inicial
description: Inicializa um repositório Git do zero — git init, .gitignore, instala o gate de commit, primeiro commit auditado, remoto/push, tag e branch de dev, com HITL. Use quando pedirem para criar um repo novo ou fazer o commit inicial. NÃO acione proativamente.
---

# Skill: Commit Inicial (bootstrap de repositório)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Orquestra a **criação de um repositório do zero** com higiene desde o nascimento: `.gitignore` antes do
primeiro commit, **gate de segredos instalado** (a `git-verificacao-commit` roda em todo commit dali em
diante) e estrutura de branches/tag aprovada pelo usuário. Mutativa → HITL antes de criar.

> O gate e a auditoria não vivem aqui: o gate por commit é da `git-verificacao-commit` (esta skill o
> **instala**); o check-up profundo do histórico é da `git-especialista-repositorio`. Princípios globais em
> `CLAUDE.md`; convenção de mensagens em `assets/convencao_commits.md`.

## Quando usar
- Sob demanda, ao criar um repositório novo / fazer o primeiro commit / subir um projeto ao GitHub pela 1ª vez.
- Mutativa → HITL obrigatório (owner, visibilidade, branches) antes de qualquer comando.

## Workflow
Trate **um repositório por vez**.

1. **HITL — escopo** — pergunte e **aguarde**: **owner** (conta pessoal/organização), **visibilidade** (default **privado**, só público se pedido), **nome da branch principal** (`main`/`master`) e **da branch de dev** (`develop`/`dev`), e confirme a mensagem do commit inicial (sugestão: `commit inicial`).
2. **Inicializar** — `git init` e aplique o `.gitignore` de `assets/gitignore_base.md`, adaptado à stack. Confirme com `git status --ignored` que `.env`/`node_modules` estão ignorados.
3. **Instalar o gate** — crie `.githooks/` no repo; copie para lá `verificar_commit.py` + `config.json` (da `git-verificacao-commit`) e o `pre-commit`; `chmod +x .githooks/pre-commit`; `git config core.hooksPath .githooks`. Dali em diante, todo commit é varrido.
4. **Primeiro commit (auditado)** — `git add .`; o `pre-commit` recém-instalado roda o gate. Se **bloquear** (segredo/arquivo sensível), resolva (mover p/ `.env`) antes de prosseguir. Depois `git commit -m "commit inicial"`.
5. **Remoto + push** — `git branch -M {principal}`; `git remote add origin <url>`; `git push -u origin {principal}`.
6. **Tag + branch de dev** — `git tag v1.0.0` e `git push origin v1.0.0`; `git checkout -b {dev}` e `git push -u origin {dev}`.

> Antes de tornar um repo público pela primeira vez, vale rodar a `git-especialista-repositorio` (auditoria do histórico).

## Regras e limites
- **NUNCA** crie o repositório como público por padrão — **privado**, salvo pedido explícito.
- **NUNCA** rode `git add`/`git commit` antes de instalar o `.gitignore` (passo 2) e o gate (passo 3).
- **NÃO** assuma nomes de branch — o HITL do passo 1 é obrigatório.
- **NÃO** prossiga com o commit se o gate (`pre-commit`) bloquear — resolva o vazamento; nunca use `--no-verify`.
- **NÃO** misture mudanças no commit inicial — ele representa o estado-base coeso do projeto.
- **NÃO** saia do escopo: varrer histórico é da `git-especialista-repositorio`; o gate por commit é da `git-verificacao-commit`.

## Checklist "pronta"
- [ ] HITL feito (owner, visibilidade=privado salvo pedido, branches principal/dev, mensagem)?
- [ ] `git init` + `.gitignore` aplicado e confirmado (`git status --ignored`)?
- [ ] Gate instalado (`.githooks/` com script+config+pre-commit, `core.hooksPath` apontado)?
- [ ] Primeiro commit passou pelo gate (sem segredo) com a mensagem confirmada?
- [ ] Remoto conectado, push da principal, tag `v1.0.0` e branch de dev criados?

## Referências (Camada 3 — leia sob demanda)
- `assets/gitignore_base.md` — `.gitignore` mínimo a aplicar antes do primeiro commit.
- `assets/convencao_commits.md` — convenção de mensagens (Conventional Commits, em português).
