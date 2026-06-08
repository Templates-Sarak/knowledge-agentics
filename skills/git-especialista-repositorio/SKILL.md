---
name: git-especialista-repositorio
description: Auditoria profunda de segurança do repositório inteiro — todos os commits/branches/tags — caçando segredos e arquivos sensíveis no histórico (scan_historico.py) e conduzindo a remediação (reescrita + rotação) sob HITL severo. Use ao auditar a segurança de um repo ou ao suspeitar de segredo no histórico. NÃO acione proativamente.
---

# Skill: Especialista de Repositório (Auditoria de Histórico Completo)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Garante que **nenhum commit, em nenhuma branch ou tag**, deixou vazar segredo ou arquivo sensível — não
basta o último commit estar limpo: um segredo já versionado **continua no histórico** mesmo após ser
removido do código atual. Audita o passado inteiro e conduz a correção (que pode incluir **reescrita de
histórico**), sempre sob **HITL severo**. É a auditoria pesada/sob demanda; o gate rápido por commit é da
`git-verificacao-commit`.

> Padrões/nomes sensíveis em `scripts/config.json` **derivam do catálogo canônico** da skill `cyber-segredos`
> (fonte única do ecossistema — manter em sincronia). Princípios globais em `CLAUDE.md`. Reescrita/rotação detalhadas em
> `references/remediacao.md`.

> **Em escala:** a **varredura** (passos 1-3) é orquestrada pelo command `/git1-auditar` (agente `git-auditor`,
> read-only, persiste em `.sarak/git-audit/`); a **adequação** (passos 4-6: reescrita + rotação) pelo command
> `/git2-adequar` (thread principal, **backup + HITL severo**, sem agente — operação irreversível; re-scan reusa o
> `git-auditor`). Esta skill é a **lógica** que os dois aplicam.

## Quando usar
- Antes de tornar um repo público, do primeiro push, ou em auditoria de segurança de um repo existente.
- Quando há suspeita (ou achado da `git-verificacao-commit`) de segredo já commitado no histórico.
- Mutativa (pode reescrever histórico) → HITL severo obrigatório antes de qualquer alteração.

## Workflow
Trate **um repositório por vez**. Não avance sem concluir a fase anterior.

1. **Delimitar** — confirme que a raiz é repo Git; liste **todas** as branches e tags (`git branch -a`, `git tag`). O escopo é o histórico inteiro (working tree/staged é da `git-verificacao-commit`).
2. **Varrer o histórico** — rode `python scripts/scan_historico.py --raiz <repo>` (JSON: `achados_conteudo` por padrão + branch, `arquivos_sensiveis_historico`, `achados_entropia` com `confianca: baixa`). Opcional: cross-check com `gitleaks detect`/`trufflehog` (ver `references/remediacao.md`).
3. **Classificar** — para cada achado: **segredo vivo** (working tree + histórico), **só no passado**, **arquivo sensível** ou **entropia (triar)**. Tabela em `references/remediacao.md`.
4. **HITL severo (mandatório)** — apresente o plano de `assets/relatorio_auditoria.md`: o que reescrever, **rotação obrigatória** das credenciais, branch(es)/tags afetadas e o **risco** (hashes mudam, exige `push --force-with-lease` coordenado). **Aguarde aprovação inequívoca.**
5. **Remediar** — após o "SIM": working tree → `.env`/`process.env`; histórico → `git filter-repo`/BFG; **rotacionar** cada credencial no provedor; `push --force-with-lease` coordenado. Passo a passo em `references/remediacao.md`.
6. **Confirmar + reportar** — rode o scanner de novo (`total: 0`) e gere o `relatorio_auditoria.md`. Higiene de lixo/dead code é delegada à `code-limpeza-projeto`.

## Regras e limites
- **NUNCA** reescreva histórico, remova ou faça `push --force` sem o **HITL severo** do passo 4.
- **NUNCA** considere um segredo seguro só por removê-lo do histórico — se foi versionado, **rotacione SEMPRE** no provedor.
- **NUNCA** escreva o segredo por extenso no relatório/log — o script mascara; mantenha mascarado.
- **NÃO** faça `push --force` "seco" — use `--force-with-lease` e **coordene** com a equipe (clones antigos quebram).
- **NÃO** trate `achados_entropia` (`confianca: baixa`) como verdade — triar; pode ser hash/build id.
- **NÃO** assuma o escopo de outras skills: o gate por commit é da `git-verificacao-commit`; dead code/lixo é da `code-limpeza-projeto`; migração de banco/refactor não é daqui.

## Checklist "pronta"
- [ ] Todas as branches/tags listadas e o histórico inteiro varrido (`scan_historico.py`)?
- [ ] Arquivos sensíveis no histórico (`.env`/`*.pem`/`id_rsa`) verificados, não só padrões de conteúdo?
- [ ] Cross-check (gitleaks/trufflehog) considerado para não escapar nada?
- [ ] Cada achado classificado (vivo / passado / arquivo / entropia)?
- [ ] HITL severo apresentado (reescrita + **rotação** + risco) e aprovado antes de qualquer comando?
- [ ] Reescrita feita, credenciais **rotacionadas**, `push --force-with-lease` coordenado?
- [ ] Re-scan limpo (`total: 0`) e relatório gerado?

## Referências (Camada 3 — leia sob demanda)
- `scripts/scan_historico.py` + `scripts/config.json` — scanner do histórico (conteúdo + arquivos sensíveis + entropia + branch).
- `references/remediacao.md` — classificação, reescrita (`filter-repo`/BFG), rotação de credenciais e cross-check externo.
- `assets/relatorio_auditoria.md` — template do relatório de auditoria.
