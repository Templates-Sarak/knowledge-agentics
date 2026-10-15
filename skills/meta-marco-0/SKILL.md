---
name: meta-marco-0
description: Leva um sistema do desenvolvimento à produção — limpa o legado (comentários e migrations obsoletos, artefatos de dev), prova a paridade do schema, fecha as specs sem ADRs de evolução e publica `v1.0.0` com `develop` como integração. Use quando pedirem o marco-0, o corte para produção ou a faxina integral antes do primeiro deploy. NÃO acione proativamente.
---

# Skill: Marco 0 (corte desenvolvimento → produção)

> **Dependência:** aplica `padrao-escrita` e o fluxo SDD (`spec-write`, `spec-revisao`). Reusa, sem duplicar:
> `code-limpeza-projeto` (órfãos, código morto, deps), `db-migrations` (migrations seguras),
> `cyber-segredos` e `/git1-auditar` (segredos), `code-entrega` (assinatura, licença, documentação) e o gate
> do template (`tools/gate/validate.mjs`). Skill, command e agent **referenciam** a lei, nunca a copiam.

Corta o sistema para produção **mantendo as funcionalidades e o banco intactos**: remove só o que é
obsoleto e não é recriado automaticamente, deixa as specs refletindo a realidade e marca o ponto com a
tag `v1.0.0`. Como a `meta-adequacao-modular`, a skill é o **protocolo**: o revisor escreve plans `m0-*` no
repositório alvo e o executor as cumpre — a skill não limpa nada sozinha.

## Quando usar
- Sob demanda, uma vez por sistema, antes do primeiro deploy (`deploy-*`). **Mutativa e em parte
  irreversível** → HITL em cada portão; **nunca** em `main`/`master`: o trabalho vive na branch `marco-0`.
- **Roda em conversas separadas**: Fase A (revisor planeja) · B (executor limpa) · C (outro revisor
  confere) · D (publicação, HITL severo). O veredito da C só vale se vier de quem não planejou.

## Fase — detecção mecânica, não pergunta
`python scripts/diagnose_terrain.py --root <alvo> --json` responde `phase`, `branch`, `migrations`,
`schema_file`, `tests_present`, `workflow_risks`, `protected_paths`, `adrs` e `blockers`. Confirme em uma
linha e siga; `null` é *"não consegui verificar"*, nunca *"está limpo"*.

```
phase A  → sem plans m0-*            → planejar        (revisor)
phase B  → alguma plan m0-* ativa    → executar        (executor, uma plan por vez)
phase C  → todas 🟢                  → conferir        (outro revisor)
DONE     → tag v1.0.0 existe         → campanha encerrada; aponte e pare
```

## Workflow (detalhe em `references/workflow.md`)
1. **Fase A — pré-requisitos e plans.** Se houver `blockers`, resolva com o usuário: testes ausentes →
   `/code2-caracterizar` antes; segredos → `/git1-auditar`; worktree suja ou em `main` → pare. Crie a branch
   `marco-0`, mapeie as cinco frentes e escreva as plans (molde em `references/templates.md`):
   `m0-01-codigo` · `m0-02-migrations` · `m0-03-specs` · `m0-04-entrega` · `m0-05-publicacao`.
   **HITL:** o conjunto de plans + o que **será removido** (lista nominal) + o manifesto `marco-0.protect`.
2. **Fase B — executar.** Uma plan por vez, status `🔴→🟡→🟠→🟢`. `m0-01` chama `code-limpeza-projeto`
   (`references/limpeza.md`); `m0-02` classifica migrations e roda `scripts/schema_parity.py`
   (`references/migrations.md`); `m0-03` absorve as ADRs e atualiza as specs (`references/specs-absorcao.md`);
   `m0-04` chama `code-entrega`. Todo `Grep` de referência viva **antes** de apagar; o gate e os testes
   verdes **depois**, a cada plan. Dependência removida → build logo em seguida.
3. **Fase C — conferir (outra conversa).** `schema_parity.py` com veredito `proven`; build, testes e gate
   verdes; `spec-revisao` sem divergência; nada do manifesto removido. Devolva o veredito por critério
   mecânico (modelo em `assets/relatorio-marco-0.md`).
   **Paridade `not-proven` ou `divergent` = PARE:** avise o usuário e exija a correção antes de prosseguir.
4. **Fase D — publicar** (`references/git-github.md`). Rode `scripts/check_publish.py`; resolva `fail` e
   leia cada `warn`/`unknown`. **HITL por ato externo**, nesta ordem: PR `marco-0` → `main` com squash →
   tag anotada `v1.0.0` sobre o commit resultante → branch `develop` a partir dele → proteção da `main` →
   Release (opcional, oferecida). Relatório de remoções no corpo do PR.

## Regras e limites
- **NUNCA** apague migration que consta no histórico de algum ambiente — só as **nunca aplicadas**, e a
  lista de ambientes e do aplicado vem do dev, não de inferência.
- **NUNCA** toque em banco vivo, nem "carimbe" o histórico de migrations: o passo é do operador
  (`assets/runbook-operador.md`). A skill só gera a prova e o runbook.
- **NUNCA** remova `.env`, o que o sistema recria automaticamente, templates de recriação ou o que está em
  `marco-0.protect`. Na dúvida, preserve e pergunte.
- **NUNCA** reescreva histórico nem faça force push — corte é tag + `develop`, não commit único.
- **NÃO** apague a ADR-000 do template nem ADR citada por exceção viva do gate: ela é âncora, não rastro.
- **NÃO** rotacione credencial — apenas proponha (lista no relatório); a rotação é decisão do dev.
- **NÃO** prossiga com paridade de schema não provada, nem trate `unknown` como `pass`.
- **NÃO** misture limpeza com correção de bug ou feature — registre o achado e siga atômico.
- **NÃO** saia do escopo: adequar ao padrão é da `code-adequacao`; segurança do histórico, da `/git2-adequar`.

## Checklist "pronta"
- [ ] `blockers` do diagnóstico resolvidos; branch `marco-0`; worktree limpa no início?
- [ ] Plans `m0-*` com remoções nominais e manifesto `marco-0.protect` aprovados no HITL?
- [ ] Cada remoção com `Grep` provando ausência de referência viva; testes e gate verdes após cada plan?
- [ ] `schema_parity.py` = `proven`; migrations aplicadas intactas; runbook do operador entregue?
- [ ] Specs refletem o sistema; ADRs de evolução absorvidas; `plan/` vazia; âncora do gate preservada?
- [ ] `check_publish.py` sem `fail`; workflows de tag/release revisados antes da tag?
- [ ] Tag `v1.0.0` anotada, `develop` criada, `main` protegida (ou lacuna do plano declarada)?

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — as quatro fases passo a passo, com portões de HITL.
- `references/limpeza.md` — o que remove, o que nunca remove, o manifesto de proteção.
- `references/migrations.md` — classes aplicada/nunca aplicada, paridade de schema, runbook.
- `references/specs-absorcao.md` — ADRs: o que fica, o que é absorvido, a âncora do gate.
- `references/git-github.md` — squash, tag, `develop`, proteção, workflows, Release.
- `references/templates.md` — molde das plans `m0-*`, manifesto e prompt do executor.
- `references/examples.md` — plan boa × plan vaga.
- `scripts/diagnose_terrain.py` · `scripts/schema_parity.py` · `scripts/check_publish.py` + `scripts/config.json`
  — diagnóstico, prova de paridade e pré-voo da publicação (`--selftest` em cada um).
- `assets/relatorio-marco-0.md` · `assets/runbook-operador.md` — relatório de remoções e passos do operador.
