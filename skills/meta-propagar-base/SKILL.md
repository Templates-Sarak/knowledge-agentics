---
name: meta-propagar-base
description: Propaga as atualizações da base Sarak aos sistemas do mapa.json pelo fluxo revisor → executor — gera o RELATÓRIO objetivo por sistema (atualização direta + plans propostas), espera o HITL de seleção dos repositórios, escreve o prompt de atualização direta e as plans de adequação no repositório escolhido e confere o que o executor entregar. A atualização direta escreve no branch corrente, sem commit e com desfazer. Use quando pedirem para levar uma mudança da base aos sistemas, conferir o quanto cada sistema está defasado ou preparar/aplicar/desfazer uma propagação. NÃO acione proativamente.
---

# Skill: Propagar a base aos sistemas (meta-propagar-base)

Compara cada sistema do `mapa.json` com uma **instalação de referência** — o que a base instalaria hoje,
gerada em pasta temporária **pelos próprios instaladores da base** — e classifica cada arquivo por categoria.
Dois caminhos saem daí, e **nenhum é uma branch nova**:

- **atualização direta** — o `--aplicar` escreve o que é mecânico (`adicionar`, `substituir`,
  `substituir-politica`) **no branch corrente** do sistema, **sem commit**; o `--desfazer` volta tudo atrás;
- **plans de adequação** — o que exige decisão ou mudança relevante **não é feito pela propagação**: vira
  plan no `specs/plan/` do repositório, no fluxo SDD de lá.

O agente que roda a skill age como **revisor**: escreve o prompt e as plans, e revisa. Quem executa é **outro
agente** (o executor), numa **outra** conversa. Quem commita é o usuário.

> **Dependência:** lê o `mapa.json` e o carimbo `.sarak/base.json` definidos pela `meta-iniciar-repositorio`
> (`scripts/carimbo.py`, cujas funções o aplicar reaproveita para carimbar), reproduz a instalação chamando os
> instaladores dela e do template de módulos, e regenera o `00-resumo` pela `spec-panorama`. A tabela de
> categorias e o mapa de fontes vivem num lugar só: `scripts/propagar.py` (`REGRAS`, `FONTES`,
> `SEM_FONTE_DIRETA`); a regra lacuna → plan proposta, em `scripts/relatorio.py` (`PLANS`). A forma das
> plans é da `spec-write`; o catálogo de famílias, do `panorama/00-planejamento` do repositório.

> **Arquivos personalizados NUNCA são alterados pela atualização direta** — os moldes de processo presentes
> no sistema (`00-contexto`, `00-indice`, `00-backlog`, `panorama/00-planejamento`), todo conteúdo do projeto
> (`specs/specs/`, `specs/arquitetura/` fora dos nomes reservados, `specs/adr/` exceto o 000, `specs/plan/`)
> e o código. Molde de processo **ausente** é adicionado; conteúdo ausente, nunca. Mexer neles é trabalho
> das plans, no fluxo do repositório.

## Quando usar
- Depois de atualizar a base (`meta-atualizar-base`), para ver o que cada sistema receberia e levar a mudança.
- Para medir a defasagem de um sistema (`--plano --id`) ou aplicar/desfazer a propagação num grupo de repositório.
- Sob demanda. `--plano` e `--relatorio` são **somente leitura**; escrever em repositório só **depois do HITL**.

## Workflow

1. **Analisar** — *terminal.* `git status --porcelain` da base vazio (o aplicar tolera só o `mapa.json`);
   suja → pare e peça commit ou descarte. Rode `scripts/propagar.py --relatorio [--id <id>]` (caminho relativo
   à skill). **Critério:** um bloco por sistema — `<id> · <status> [· ⚠ motivo]`, **Atualização direta**
   (contagens e até 5 nomes) e **Plans propostas** (`plan-00.NN <título> — <motivo>`). `⚠` = não se aplica
   agora (worktree sujo, `.sarak/` ignorado, `adocao-posterior`). Sem escrita. O detalhe de um sistema:
   `--plano --id <id>`.
2. **HITL de seleção** — *resposta ao usuário.* Apresente o relatório **como saiu**. O usuário escolhe os
   repositórios e pode recusar plans propostas. **Critério:** lista explícita de repositórios e de plans
   aceitas; as flags `--incluir-divergentes`/`--incluir-adicionar?` só se ele pedir, naquela execução.
   Monorepo: o grupo inteiro. **Nenhuma** plan e **nenhuma** escrita antes deste passo — e nunca num
   repositório não selecionado.
3. **Por repositório escolhido, como revisor** — *leitura e escrita no repositório.*
   - Leia o `specs/00-contexto.md` e o `specs/00-prompt-revisor.md` **do repositório** antes de escrever nele.
   - Escreva o **prompt de atualização direta** (molde em `references/prompt-atualizacao.md`) — entregue na
     conversa, em bloco ` ```md `, como o `00-prompt-revisor` do repositório manda para prompts; não vira
     arquivo.
   - Escreva as **plans de adequação aprovadas** em `specs/plan/plan-00.NN-<slug>.md`, com a linha no
     `specs/00-indice.md` e o contador da família `00` incrementado, **na forma daquele repositório** (moldes
     por tipo em `references/plans-de-adequacao.md`). Os `NN` do relatório são sugestão: vale o
     `proximo_numero_plan` lido agora.
   **Critério:** cada plan é executável por quem não tem contexto, lendo só ela e o que ela aponta; ela
   **referencia** a regra (catálogo de famílias, `spec-write`), nunca a copia. Decisões que são do usuário
   (catálogo e mapeamento de famílias; adotar/manter por arquivo) são tomadas **com ele, antes de liberar a
   plan**, e escritas na §3.1 — o executor não decide. A ordem e o `depende_de` seguem o relatório: a
   conversão do `00-indice` (formato antigo) é a primeira e as outras dependem dela.
   Depois de escrever, o **usuário commita** as plans e o índice: o aplicar exige worktree limpo.
4. **Executar** — *outra conversa (o executor).* O usuário leva cada prompt a **outra** conversa. Primeiro o
   de atualização direta; depois cada plan ("leia 00-prompt-executor e execute plan-00.NN"), na ordem de
   `depende_de`, no fluxo SDD do repositório (plan de decisão: um único `--aplicar --adotar/--manter`). **Você não executa o prompt que escreveu** — nem a atualização direta, nem as plans.
5. **Revisar e aprovar** — *terminal e leitura.*
   - **Atualização direta:** `--plano --id <id>` não mostra mais nada aplicável (`adicionar`, `substituir` e
     `substituir-politica` = 0); o `git diff` só tem o que estava no relatório; os moldes personalizados estão
     intactos (`git diff` vazio neles); o carimbo `.sarak/base.json` foi gravado.
   - **Plan de decisão:** `--plano --id <id>` mostra os "adotar" fora de `divergente`/`conflito` e os
     "manter" como `mantido`, e o `mantidos` do carimbo tem o motivo de cada um.
   - **Plans:** pelo ritual do `00-prompt-revisor` do repositório (veredito, síntese).
   Aprovado → o **usuário** commita no repositório e commita o `mapa.json` na base. Reprovado → prompt de
   correção, ou `--desfazer` (só antes do commit).
6. **Fechar** — *terminal.* Com todas as plans sintetizadas e commitadas, um novo `--aplicar --id <id>` (sem
   mais nada a escrever além do carimbo e do manifesto) grava `atualizado` — arquivos `mantido` não pesam;
   se ainda sobra decisão humana, grava `pendente`. O usuário commita o `mapa.json`.

**Aplicar** (rodado pelo **executor**, passo 4): `scripts/propagar.py --aplicar --id <id> [--id …]
[--incluir-divergentes] [--incluir-adicionar?] [--adotar <caminho> …] [--manter <caminho> --motivo "<texto>" …]`. Pré-condições (falhou → `[ERRO]`, nada escrito): sistemas
`ativo`; base limpa exceto `mapa.json`; worktree do `raiz_git` limpo; `.sarak/` fora do `.gitignore` (senão o
carimbo não seria versionado — remover a regra é decisão do usuário); monorepo inteiro na mesma chamada. **O
branch corrente é o que for:** o aplicar não cria, não troca e não confere branch. Por sistema: aplicado,
pendente, gate e manifesto `.sarak/propagacao-<curto>.json` (com o `head_no_aplicar`); `status`/`status_base`
gravados no mapa.

**Decisão por arquivo** (só em `divergente` ou `conflito`; outro caminho → `[ERRO]`, nada escrito, validado
antes de qualquer escrita): `--adotar <caminho>` aplica **só aquele** arquivo, com a mesma escrita do aplicar
(corpo da referência, título e fim de linha do sistema). `--manter <caminho> --motivo "<texto>"` (cada
`--manter` com o seu `--motivo`, na mesma ordem) **não escreve** o arquivo: grava em `mantidos`, no carimbo
`.sarak/base.json`, `{ caminho, motivo, sha1_sistema, sha1_referencia }` — sha1 do conteúdo normalizado (CRLF →
LF, sem as linhas de título onde elas já são descontadas). Em monorepo o caminho vale para cada sistema
escolhido em que ele está em `divergente`/`conflito`. O aplicar **preserva** os `mantidos` ao reescrever o
carimbo e descarta os vencidos. Decidir é do usuário: nunca use sem a decisão dele.

**Desfazer** (`--desfazer --id <os mesmos ids>`): restaura do HEAD o que existia, apaga o criado (manifesto e
carimbo incluídos) e devolve o status anterior; o branch não é tocado. **Recusa** (`[ERRO]`) se o HEAD do
sistema mudou desde o aplicar (o usuário já commitou) ou se o worktree tem mudança alheia ao manifesto —
reverter aí é decisão do usuário.

**Ações do plano:** `adicionar` (falta no sistema) · `adicionar?` (lei do template ou ADR 000 ausente **sem
carimbo** — o projeto pode tê-la com outro nome; confirmação humana) · `bloqueado` (o mesmo, mas o sistema
tem **lei/fundação fora do reservado**: nunca aplicado, nem com flag — a lacuna se resolve antes, na plan do
revisor) · `substituir` (universal desatualizado sem edição local: pelo carimbo, ou pela **adoção por
histórico**) · `substituir-politica` (em sistema modular, um `tools/` do template que existe nos dois lados
sem versão igual no histórico: o `tools/` é da base, substituído **por política**) · `conflito` (universal
editado localmente, com carimbo) · `divergente` (universal diferente, sem carimbo e sem versão reconhecida) ·
`obsoleto?` (só com carimbo: saiu da referência atual) · `mantido` (estava em `divergente`/`conflito` e o
usuário decidiu **manter**: o `mantidos` do carimbo tem a entrada e o `sha1_sistema` **e** o `sha1_referencia`
seguem iguais aos atuais — **não é pendência**; se o projeto editou de novo ou a base mudou aquela fonte, a
decisão venceu e o arquivo **volta** a `divergente`/`conflito`, para revisar) · `reportar-molde` (molde antigo intocado e o molde
mudou) · `regenerar` (`00-resumo`) · `nada`. **Extras do projeto** só são contados, nunca listados.

**O aplicar escreve:** `adicionar`, `substituir`, `substituir-politica` e, **só com a flag explícita da
execução**, `divergente` (`--incluir-divergentes`) e `adicionar?` (`--incluir-adicionar?`). Nunca escreve
`conflito`, `obsoleto?` (nunca apaga), `bloqueado`, molde de processo ou conteúdo presentes, nem código.
Mais os `--adotar` da execução (e o `--manter`, que só registra a decisão). Depois: carimbo `.sarak/base.json`
com o HEAD da base e os `mantidos`; `00-resumo` regenerado só **sem migração de famílias
pendente**; gate (`node tools/gate/validate.mjs --all`, só modular — vermelho vira pendência, não desfaz);
`status` = `atualizado` se nada sobrou, senão `pendente` — `mantido` não sobra, então um sistema com tudo
decidido (e sem lacuna) fecha `atualizado`.

**Adoção por histórico** (sistema sem carimbo): um universal diferente é comparado com **todas as versões**
da sua fonte na base (`git log -- <fonte>`). Igual a alguma → `substituir`; nenhuma → `divergente`. Arquivos
**transformados** pelo instalador também são adotados: `00-base-*` comparado sem a linha `titulo:` e o H1;
doutrina com escopo (`01-modulo`, `04-regras`, …) com o escopo do sistema trocado pelo marcador lido do
`create-project.mjs`. `specs/README.md` e `specs/INDEX.md` comparam **sem o título**. Sem fonte direta (README
da doutrina, `gerar_indice.py`) → `divergente`. Arquivo com título do projeto é escrito com **o corpo da
referência e as linhas de título do sistema**, no fim de linha do sistema.

**Lacunas** — trabalho de uma **plan do revisor no próprio projeto** (as propostas do relatório), nunca da
propagação: lei/fundação com nome fora do reservado · migração de famílias pendente · molde em formato antigo
· binding sem `00-base-<binding>.md` · `.sarak/` ignorado pelo git (o aplicar recusa). Sem
`panorama/00-planejamento.md` não há plan: o molde ausente é adicionado pela atualização direta.

**Status** (`mapa.json`): `desatualizado` (nunca recebeu propagação) · `pendente` (recebeu, mas sobraram
decisões humanas) · `atualizado` (a última propagação fechou sem pendências, ou o sistema acabou de ser
instalado). O `--plano` e o `--relatorio` só o **leem**; o `--aplicar` e o `--desfazer` o escrevem (com
`carimbo.serializar`).

## Regras e limites
- **O agente nunca executa o próprio prompt:** quem escreve revisa; outro agente executa.
- **NUNCA** escreva num repositório não selecionado, nem plan antes do HITL de seleção.
- **NUNCA** crie branch: a propagação escreve no branch corrente; mudança relevante vira plan.
- **NUNCA** aplique com o worktree do sistema sujo — nem contorne a pré-condição.
- **NUNCA** commite nem dê push no sistema: commit é do usuário. Nem na base (o `mapa.json`).
- **NUNCA** altere arquivo personalizado (molde de processo presente, conteúdo do projeto) pela atualização
  direta, nem código; **NUNCA** apague (`obsoleto?` é decisão humana); **NUNCA** aplique `bloqueado`. Esses
  arquivos mudam só por plan, no fluxo do repositório.
- **NÃO** use `--incluir-divergentes`/`--incluir-adicionar?` sem o usuário pedir, naquela execução; nem
  `--adotar`/`--manter` sem a decisão dele, arquivo a arquivo (o motivo do `--manter` é o dele).
- **NÃO** reimplemente instalador — a referência sai dos instaladores da base; se um passo não puder ser
  reproduzido assim, pare e reporte.
- **NÃO** rode com a base suja (`--permitir-base-suja` existe só para teste/desenvolvimento).

## Checklist
- [ ] Base limpa, `--relatorio` gerado e apresentado como saiu (`adocao-posterior` e `⚠` à vista)?
- [ ] HITL de seleção feito: repositórios, plans aceitas e flags escolhidos pelo usuário?
- [ ] Por repositório: `00-contexto` e `00-prompt-revisor` dele lidos antes de escrever; prompt de atualização
  direta e plans escritos na forma do repositório (índice e contador da família `00`)?
- [ ] Execução entregue a **outra** conversa; nenhum prompt executado por quem o escreveu?
- [ ] Decisões por arquivo (`--adotar`/`--manter`) tomadas pelo usuário e registradas (`mantidos` no carimbo)?
- [ ] Revisão feita (`--plano --id` sem aplicável, diff só com o relatado, moldes intactos, carimbo gravado;
  plans pelo ritual do repositório) e o commit deixado ao usuário (repositório e `mapa.json`)?
- [ ] Fechamento: `--aplicar` final gravou `atualizado` (ou `pendente`, dito com o motivo)?

## Referências (Camada 3 — leia sob demanda)
- `references/prompt-atualizacao.md` — o molde do prompt de atualização direta para o executor.
- `references/plans-de-adequacao.md` — um molde de plan por tipo de proposta (formato do `template-plan`).
- `scripts/propagar.py` — o plano e a CLI. `REGRAS` (categorias), `FONTES`/`SEM_FONTE_DIRETA` (adoção), com as
  fontes citadas; `separar_mantidos`/`aplicar_mantidos` (a ação `mantido`); `--autoteste` prova o núcleo do plano, do aplicar/desfazer e do relatório em memória.
- `scripts/relatorio.py` — o `--relatorio`: `PLANS` (lacuna/ação → plan proposta: título, destino, ordem e
  `depende_de`),
  `propostas`, `atualizacao_direta`, `montar_relatorio`.
- `scripts/aplicacao.py` — o aplicar e o desfazer: núcleo puro (`acoes_aplicaveis`, `compor`, `pendencias`,
  `precondicoes`, `montar_manifesto`, `plano_de_desfazer`, `erros_de_desfazer`, `erros_de_decisao`,
  `entrada_mantida`, `mesclar_mantidos`) e a casca de git, disco, gate
  e panorama.
