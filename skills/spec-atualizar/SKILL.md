---
name: spec-atualizar
description: Sintetiza as plans aprovadas de specs/plan/executadas/ nas especificações definitivas (adr, arquitetura, specs) com HITL por bloco e, uma vez sintetizada, remove a plan (arquivo + linha do 00-indice). Use APENAS quando o usuário solicitar explicitamente a síntese das plans. NÃO acione proativamente.
---

# Skill: Sintetizar as Plans nas Specs Definitivas

Passo final do ciclo SDD. Esta skill é a **ponte** entre as plans já executadas e aprovadas
(`specs/plan/executadas/`) e as especificações definitivas do repositório (`specs/adr/`,
`specs/arquitetura/`, `specs/specs/`).

O objetivo é manter a **convergência**: as specs fixas devem refletir a realidade exata do repositório, de
modo que qualquer agente se contextualize lendo apenas elas. Cada plan aprovada carrega um pedaço dessa
verdade — esta skill a transporta e, feito isso, **remove a plan**: a spec fixa passa a ser a única fonte
viva; o arquivo da plan não fica retido como arquivo morto.

> **Dependência:** o formato final das specs é regido por `spec-write`. Consulte-a em caso de dúvida sobre
> frontmatter, seções ou nomenclatura.

## Quando usar

- O usuário pediu para **sintetizar/atualizar as specs** com base nas plans executadas.
- Acionada **sob demanda**, tipicamente de forma periódica (a cada N plans aprovadas). **Nunca** dispara sozinha.
- **Não** é usada para executar plan (isso é do agente executor) nem para escrever plan (isso é do revisor).

## O que ela lê

| Local | Status | Papel |
|---|---|---|
| `specs/plan/executadas/` | `🟢 Aprovada` | **A entrada desta skill** — plans verificadas, pendentes de síntese. É a **única** coisa que existe nessa pasta: plans já sintetizadas são removidas (§6), não há `⚪` para "ignorar" |
| `specs/plan/` (raiz) | `🔴 🟡 🟠 🔵 ⛔` | Fila **ativa**. **Nunca** sintetize daqui — a execução não terminou |
| `specs/00-indice.md` | — | Índice a atualizar no fechamento |
| `specs/adr/` · `arquitetura/` · `specs/` | — | Os destinos |

## Workflow

### 1. Levantamento

- Liste `specs/plan/executadas/` e selecione **apenas** as plans com `status: "🟢 Aprovada"`.
- Se não houver nenhuma, **pare** e informe: nada a sintetizar. Não invente trabalho.
- De cada plan selecionada, leia: o campo `destino_sintese` do frontmatter, a seção **Destino da síntese**, o
  **Resumo da execução** e o **Veredito** do revisor.
- Leia `specs/00-indice.md` §4 (Aguardando síntese) para localizar a linha de cada plan.

### 2. Roteamento pelo destino declarado

A plan **já declara** para onde vai — não adivinhe. Agrupe por `destino_sintese`:

| Destino | Ação |
|---|---|
| `arquitetura/NN-*.md` | Atualiza (ou cria) o documento de arquitetura |
| `specs/NN-*.md` | Atualiza (ou cria) a spec de funcionalidade |
| `adr/NNN-*.md` | **Cria** o ADR. ADR é **imutável** — se a decisão substitui outra, preencha `substitui`/`substituido_por`, sem editar o ADR antigo. É o destino certo para a narrativa/justificativa (o "porquê" de um bug ou de uma escolha) — nunca a arquitetura/specs |
| `00-contexto.md` | Atualiza a spec de contexto (regra inegociável, stack, roteamento) |
| `—` | **Nada a sintetizar.** Vai direto ao passo 6 (só muda status e índice) |

- Destino ausente ou incoerente com o conteúdo da plan? **Pare e pergunte ao usuário** — não escolha por conta.
- Destino apontando para spec inexistente = **criar** a spec, usando o molde de `specs/_templates/`.

### 3. Particionamento em blocos

- **Um bloco = uma spec fixa de destino.** Várias plans que convergem para a mesma spec entram no mesmo bloco.
- Uma plan com múltiplos destinos aparece em mais de um bloco (a parte de arquitetura num, o ADR noutro).
- Muitos blocos? Processe em série, um HITL por vez. Não agregue tudo numa única confirmação gigante.

### 4. HITL por bloco — OBRIGATÓRIO

Para **cada** bloco, apresente antes de escrever:

- **Spec afetada** e se será *atualizada* ou *criada*.
- **Plans de origem** (nome dos arquivos).
- **Resumo das mudanças** que serão transportadas.
- **O que sai e o que entra**, quando houver sobrescrita de conteúdo existente.

Pergunte `⚠️ Confirma a atualização deste bloco?` e **aguarde**. Sem resposta positiva, nada é escrito.
Exemplos de formulação em `references/workflow.md`.

### 5. Aplicação

- Escreva a spec fixa no formato de `spec-write`, com o frontmatter completo do molde correspondente.
- Transporte **verdade consolidada**, não narrativa de execução: a spec fixa descreve como o sistema **é**,
  não o que foi feito na terça. "Adicionamos o campo X" → "O cadastro exige o campo X".
- **Foque em funcionalidade, especificação e parte técnica — nunca em "corrigiu o bug X".** A spec fixa não é
  changelog: registra o comportamento e o contrato **atuais**, não o defeito que existia antes nem a história
  de como foi resolvido. Se por trás da correção houver uma decisão de design com trade-off que vale
  preservar (por que assim e não de outro jeito), esse conteúdo é **ADR**, não arquitetura/specs — trate como
  um destino adicional, não como algo a descartar.
- Preserve o que continua válido na spec de destino. Sobrescrever seção inteira sem necessidade apaga história.
- Atualize `status` e `relacionados` do destino quando fizer sentido (ex.: `🔴 A Implementar` → `🟢 Implementado`).

### 6. Fechamento por plan (não deixe pendência)

Para cada plan sintetizada, na mesma passada:

1. **Acrescente** ao final da plan (append-only — isto ainda vale, mesmo que o arquivo seja removido em
   seguida: é o que fica registrado no diff do commit de remoção, a única cópia legível que sobrevive):
   ```markdown
   ## Síntese — AAAA-MM-DD
   Sintetizada em: `<spec fixa atualizada/criada>`
   Observações: <o que foi transportado, o que foi deliberadamente deixado de fora>
   ```
2. Mude o frontmatter para `status: "⚪ Sintetizada"`.
3. **Remova o arquivo** de `specs/plan/executadas/` (`git rm`, sem commit — quem commita é o usuário, como
   sempre). A plan sintetizada não fica retida: seu conteúdo virou verdade consolidada na spec fixa; o rastro
   de como se chegou lá passa a viver só no histórico do Git (`git log --diff-filter=D`), recuperável mas não
   mais um arquivo do repositório.
4. No `specs/00-indice.md`, **remova a linha da plan** da §4 (Aguardando síntese) — não a complete, apague-a.
   A §4 só contém plans ainda não sintetizadas; a linha não sobrevive à síntese.

### 7. Entrega

- Relate: plans sintetizadas, specs fixas atualizadas/criadas, plans que ficaram de fora e por quê.
- Avise que as alterações estão no worktree, **sem commit** — quem commita é o usuário.
- Se alguma plan `🟢` foi pulada (destino ambíguo, conflito), diga qual e o que falta decidir.

## Regras e limites

- **NUNCA remova uma plan antes do HITL do bloco correspondente ter sido aprovado e aplicado.** A remoção
  (§6.3) só acontece **depois** de a spec fixa já ter a verdade transportada — nessa ordem, sempre. Remover
  antes é perda de informação sem contrapartida.
- **NUNCA renomeie nem reaproveite o número de uma plan removida.** A numeração continua vindo de
  `proximo_numero_plan` em `00-indice.md` — a remoção do arquivo não libera o `NN` para reuso.
- **NUNCA** sintetize plan da raiz de `plan/` (ativa) — a execução não terminou.
- **NUNCA** sobrescreva spec definitiva sem o HITL do bloco correspondente.
- **NUNCA** edite um ADR existente — decisão nova é ADR novo.
- **NUNCA** commite, e nunca adicione co-autoria.
- **NÃO** leve código-fonte para as specs — só especificação documental em Markdown. Trecho de código só como
  ilustração de contrato, quando indispensável.
- **NÃO** invente conteúdo que não esteja na plan, no resumo do executor ou no veredito. Lacuna vira pergunta.
- **NÃO** acione esta skill proativamente.

## Checklist "pronta"

- [ ] `specs/plan/executadas/` lido; só as `🟢 Aprovada` entraram no lote.
- [ ] `destino_sintese` respeitado em todas; ambiguidade levada ao usuário.
- [ ] Um HITL por bloco, com resumo do que muda, aprovado antes de escrever.
- [ ] Specs fixas no formato de `spec-write`, descrevendo o estado atual do sistema.
- [ ] Toda plan do lote: bloco `## Síntese` acrescentado + `status: ⚪ Sintetizada` **antes** da remoção.
- [ ] Arquivo de cada plan sintetizada removido (`git rm`) de `specs/plan/executadas/`.
- [ ] `00-indice.md` com a linha correspondente **removida** da §4 — nenhuma sobra `⚪`.
- [ ] Nenhuma plan removida sem HITL do bloco já aplicado. Nenhum commit.

## Referências

- `references/workflow.md` — exemplos de particionamento em blocos, formulação do HITL e do bloco de síntese.
