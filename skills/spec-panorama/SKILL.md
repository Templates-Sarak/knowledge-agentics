---
name: spec-panorama
description: Gera o specs/panorama/00-resumo.md (o estado do projeto de relance) a partir do 00-indice, das plans, do horizonte do 00-planejamento e do 00-backlog, e valida famílias e itens. Use quando o revisor criar, mudar o status ou sintetizar uma plan, editar o horizonte, ou quando o usuário pedir o panorama. NÃO acione proativamente.
---

# Skill: Panorama do projeto (spec-panorama)

Mantém o `specs/panorama/00-resumo.md` — o panorama de agora, em no máximo 70 linhas visuais — e confere a
coerência de famílias e itens. O resumo é **saída de script**: determinístico, nunca escrito à mão.

> **Dependência:** aplica a regra de famílias e de itens do próprio projeto, `specs/panorama/00-planejamento.md`
> (§1 catálogo, §2 horizonte), e a forma de spec/plan da skill `spec-write`. Não redefine nenhuma das duas.

## Quando usar
- O **revisor** acabou de criar uma plan, mudar o status de uma, sintetizar uma ou editar o horizonte —
  o `00-prompt-revisor` manda regenerar o panorama **na mesma ação**.
- O usuário pede o panorama, o progresso ou "onde estamos".
- Sob demanda: é mutativa (escreve um arquivo). O **executor nunca a usa** — `panorama/` é do revisor.

## Workflow

1. **Localizar o projeto** — *listagem de arquivos.* Confirme `specs/panorama/00-planejamento.md`.
   **Critério:** sem ele, pare — o projeto ainda não tem catálogo de famílias; não crie um por conta própria.
2. **Checar** — *terminal.* Rode `scripts/gerar_resumo.py --specs specs --checar` (o caminho do script é
   relativo a esta skill, resolvido a partir de onde ela foi carregada). **Critério:** exit 0 segue para o
   passo 4. Exit 1: leia cada `[PROBLEMA]` e corrija **na origem** — o frontmatter da plan ou da spec, ou o
   horizonte. Só "resumo desatualizado" é resolvido pelo passo 4.
3. **HITL de horizonte** — *resposta ao usuário.* Se a correção pede família nova ou item novo no
   `00-planejamento`, apresente a proposta e **pare** até o usuário aprovar. Corrigir estado (`⬜`/`🔷`/`✅`)
   que diverge das plans é trabalho do revisor e não exige aprovação.
4. **Gerar** — *terminal.* Rode `scripts/gerar_resumo.py --specs specs`. **Critério:** `[OK] … (N linhas)`,
   com N ≤ 70.
5. **Confirmar** — *terminal.* `--checar` de novo. **Critério:** exit 0. O resumo entra no mesmo commit da
   mudança que o motivou.

O que o `--checar` acusa: família (de spec, arquitetura ou plan) fora do catálogo; nome `FF.NN` /
`plan-FF.NN` incoerente com o `familia:` do frontmatter; `item:` que não existe no horizonte, item repetido,
item com família fora do catálogo ou sob o título de outra família; `🔷` sem plan aberta apontando para ele;
plan aberta apontando para item `⬜`/`✅`; e o `00-resumo.md` desatualizado em relação ao que seria gerado.

## Regras e limites
- **NUNCA** edite o `00-resumo.md` à mão — ele é sobrescrito na próxima geração, e o `--checar` acusa a
  divergência.
- **NÃO** invente família nem item para o `--checar` passar — catálogo e horizonte são decisão do usuário.
- **NÃO** conte progresso por plan — a plan some na síntese; a unidade durável é o item do horizonte.
- **NÃO** use esta skill no papel de executor — `panorama/` é do revisor, que a roda na mesma ação da mudança.
- **NÃO** saia do escopo: divergência entre spec e código é da `spec-revisao`; a forma de spec/plan, da
  `spec-write`.

## Checklist
- [ ] `specs/panorama/00-planejamento.md` existe e foi a base da conferência?
- [ ] `--checar` rodado antes, e cada problema corrigido na origem (não no resumo)?
- [ ] Família ou item novos só depois da aprovação do usuário?
- [ ] Resumo regenerado com ≤ 70 linhas e `--checar` final com exit 0?

## Referências (Camada 3 — leia sob demanda)
- `scripts/gerar_resumo.py` — gerador e verificador (só biblioteca padrão). `--autoteste` prova o núcleo
  com fixtures em memória, inclusive um projeto grande truncado dentro das 70 linhas.
