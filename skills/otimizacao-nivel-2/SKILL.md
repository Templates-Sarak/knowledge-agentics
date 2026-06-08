---
name: otimizacao-nivel-2
description: Otimização de performance por concessão (trade-off, front + back) — troca fidelidade/UX/consistência por velocidade (animações/mídia; cache agressivo, denormalização, consistência eventual), com HITL decisivo. Use APENAS quando pedirem otimização agressiva aceitando perda de qualidade. NÃO acione proativamente.
---

# Skill: Otimização Nível 2 — Concessão (Trade-off)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita, otimizacao-nivel-1`. Consulte-as antes de iniciar.

Segundo degrau: quando o custo zero (`otimizacao-nivel-1`) não bastou, troca-se **qualidade/UX por
velocidade** de forma deliberada. Toda concessão é **perceptível** pelo usuário → o HITL aqui é **decisivo**:
nada é sacrificado sem autorização explícita item a item. Mutativa.

> Medição e a escada de níveis estão em `references/diagnostico-performance.md` (mora em `otimizacao-nivel-1`;
> rode o `auditar_assets.py` de lá). Cobre **frontend e backend**. Princípios globais em `CLAUDE.md`.
> Pré-requisito: ter passado pelo `otimizacao-nivel-1` e ainda não bater as metas.

## Quando usar
- Sob demanda, **após** o Nível 1 não atingir as metas, com o usuário disposto a perder qualidade/UX por velocidade.
- Projetos onde velocidade extrema vale mais que estética (mercados de internet lenta, low-end, mobile-first).
- Mutativa → HITL decisivo obrigatório (item a item).

## Workflow
Trate **uma página/rota por vez**. Cada concessão é uma decisão do usuário, não sua.

1. **Medir baseline** — `references/diagnostico-performance.md` (Lighthouse + `auditar_assets.py` do `otimizacao-nivel-1`). Registre LCP/CLS/INP/TBT e bundle, e o que já foi feito no Nível 1.
2. **Auditar concessões** — liste candidatos a sacrifício:
   - **Frontend:** libs de animação pesadas (`framer-motion`, `gsap`), imagens de alta resolução reduzíveis, UI "premium" (sombras/gradientes dinâmicos), scripts 3rd-party não essenciais (chat, analytics granular, mapas, vídeos embed).
   - **Backend:** **cache agressivo com staleness** (servir dado levemente desatualizado), **denormalização** (duplicar p/ evitar JOIN/computação cara), **consistência eventual** (processar async em vez de síncrono), **desligar/limitar feature cara** (relatório pesado, busca ampla), reduzir precisão (amostragem/aproximação).
3. **Custo-benefício por item** — para cada um: **o que o usuário perde** (UX/qualidade) × **ganho estimado** (KB/ms/CPU). Sem isso, não vai ao HITL.
4. **HITL decisivo** — apresente a tabela de `assets/plano_concessoes.md` e pergunte **quais sacrifícios o usuário autoriza**. **Aguarde a seleção.**
5. **Aplicar só o autorizado** — granularmente; após cada remoção, teste que o site ainda cumpre o propósito.
6. **Re-medir** — compare com a baseline; confirme o ganho no número. Se o sacrifício não trouxe ganho real, **reverta** (perdeu UX à toa).
7. **Reportar + escalar** — registre concessões e antes/depois. Se ainda insuficiente e houver orçamento, recomende `otimizacao-nivel-3` (infra).

## Regras e limites
- **NUNCA** execute redução de qualidade ou remoção de UX sem o **HITL decisivo** do passo 4 — autorização é item a item.
- **NUNCA** otimize sem baseline medida — concessão sem ganho comprovado é perda pura (passo 1 + re-medição obrigatórios).
- **NÃO** remova funcionalidade essencial ao propósito do site — só "luxo" técnico; em dúvida, é decisão do usuário.
- **NÃO** mantenha concessão que não moveu o número — reverta no passo 6.
- **NÃO** comece por aqui sem ter esgotado o `otimizacao-nivel-1` (custo zero vem primeiro).
- **NÃO** saia do escopo: ganhos sem perda → `otimizacao-nivel-1`; resolver com infra paga → `otimizacao-nivel-3`.

## Checklist "pronta"
- [ ] Baseline medida e Nível 1 já esgotado?
- [ ] Cada concessão tem sacrifício de UX **e** ganho estimado documentados?
- [ ] HITL decisivo feito e só o autorizado aplicado?
- [ ] Funcionalidade principal testada após as remoções?
- [ ] Re-medição confirma ganho real (concessões sem ganho revertidas)?
- [ ] Concessões e antes/depois reportados; escalonamento ao nível 3 recomendado se preciso?

## Referências (Camada 3 — leia sob demanda)
- `../otimizacao-nivel-1/references/diagnostico-performance.md` — medição compartilhada (CWV, como medir, escada).
- `../otimizacao-nivel-1/scripts/auditar_assets.py` — auditoria de assets/bundle (compartilhada).
- `assets/plano_concessoes.md` — template da tabela de concessões (HITL decisivo).
