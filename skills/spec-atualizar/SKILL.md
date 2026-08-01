---
name: spec-atualizar
description: Sintetiza as plans aprovadas de specs/plan/executadas/ nas especificações definitivas (adr, arquitetura, specs) com HITL por bloco, marcando o status e atualizando o 00-indice. Use APENAS quando o usuário solicitar explicitamente a síntese das plans. NÃO acione proativamente.
---

# Skill: Sintetizar as Plans nas Specs Definitivas

Passo final do ciclo SDD. Esta skill é a **ponte** entre as plans já executadas e aprovadas
(`specs/plan/executadas/`) e as especificações definitivas do repositório (`specs/adr/`,
`specs/arquitetura/`, `specs/specs/`).

O objetivo é manter a **convergência**: as specs fixas devem refletir a realidade exata do repositório, de
modo que qualquer agente se contextualize lendo apenas elas. Cada plan aprovada carrega um pedaço dessa
verdade — esta skill a transporta.

> **Dependência:** o formato final das specs é regido por `spec-write`. Consulte-a em caso de dúvida sobre
> frontmatter, seções ou nomenclatura.

## Quando usar

- O usuário pediu para **sintetizar/atualizar as specs** com base nas plans executadas.
- Acionada **sob demanda**, tipicamente de forma periódica (a cada N plans aprovadas). **Nunca** dispara sozinha.
- **Não** é usada para executar plan (isso é do agente executor) nem para escrever plan (isso é do revisor).

## O que ela lê

| Local | Status | Papel |
|---|---|---|
| `specs/plan/executadas/` | `🟢 Aprovada` | **A entrada desta skill** — plans verificadas, pendentes de síntese |
| `specs/plan/executadas/` | `⚪ Sintetizada` | Já processadas. **Ignore** (só consulte se precisar de histórico) |
| `specs/plan/` (raiz) | `🔴 🟡 🟠 🔵 ⛔` | Fila **ativa**. **Nunca** sintetize daqui — a execução não terminou |
| `specs/00-indice.md` | — | Índice a atualizar no fechamento |
| `specs/adr/` · `arquitetura/` · `specs/` | — | Os destinos |

## Workflow

### 1. Levantamento

- Liste `specs/plan/executadas/` e selecione **apenas** as plans com `status: "🟢 Aprovada"`.
- Se não houver nenhuma, **pare** e informe: nada a sintetizar. Não invente trabalho.
- De cada plan selecionada, leia: o campo `destino_sintese` do frontmatter, a seção **Destino da síntese**, o
  **Resumo da execução** e o **Veredito** do revisor.
- Leia `specs/00-indice.md` para localizar a linha de cada plan no histórico.

### 2. Roteamento pelo destino declarado

A plan **já declara** para onde vai — não adivinhe. Agrupe por `destino_sintese`:

| Destino | Ação |
|---|---|
| `arquitetura/NN-*.md` | Atualiza (ou cria) o documento de arquitetura |
| `specs/NN-*.md` | Atualiza (ou cria) a spec de funcionalidade |
| `adr/NNN-*.md` | **Cria** o ADR. ADR é **imutável** — se a decisão substitui outra, preencha `substitui`/`substituido_por`, sem editar o ADR antigo |
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
- Preserve o que continua válido na spec de destino. Sobrescrever seção inteira sem necessidade apaga história.
- Atualize `status` e `relacionados` do destino quando fizer sentido (ex.: `🔴 A Implementar` → `🟢 Implementado`).

### 6. Fechamento por plan (não deixe pendência)

Para cada plan sintetizada, na mesma passada:

1. **Acrescente** ao final da plan (append-only, nada é removido):
   ```markdown
   ## Síntese — AAAA-MM-DD
   Sintetizada em: `<spec fixa atualizada/criada>`
   Observações: <o que foi transportado, o que foi deliberadamente deixado de fora>
   ```
2. Mude o frontmatter para `status: "⚪ Sintetizada"`.
3. **Mantenha o arquivo onde está** — em `specs/plan/executadas/`. A plan é rastro auditável permanente.
4. No `specs/00-indice.md`, complete a linha da plan no histórico com a **data absoluta** da síntese e a spec
   fixa atualizada. Não remova a linha.

### 7. Entrega

- Relate: plans sintetizadas, specs fixas atualizadas/criadas, plans que ficaram de fora e por quê.
- Avise que as alterações estão no worktree, **sem commit** — quem commita é o usuário.
- Se alguma plan `🟢` foi pulada (destino ambíguo, conflito), diga qual e o que falta decidir.

## Regras e limites

- **NUNCA apague, mova ou renomeie uma plan.** Plans são versionadas e permanentes — são o histórico de por que
  o repositório é como é, com os vereditos de revisão. A "limpeza" do diretório é feita pela subpasta
  `executadas/`, não por deleção. Se o usuário pedir para apagar, explique o custo e confirme explicitamente
  antes.
- **NUNCA** sintetize plan da raiz de `plan/` (ativa) nem plan já `⚪ Sintetizada`.
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
- [ ] Toda plan do lote: bloco `## Síntese` acrescentado + `status: ⚪ Sintetizada`.
- [ ] `00-indice.md` com data absoluta e spec de destino em cada linha do histórico.
- [ ] Nenhuma plan apagada, movida ou renomeada. Nenhum commit.

## Referências

- `references/workflow.md` — exemplos de particionamento em blocos, formulação do HITL e do bloco de síntese.
