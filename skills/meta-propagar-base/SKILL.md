---
name: meta-propagar-base
description: Propaga as atualizações da base Sarak aos sistemas do mapa.json pelo fluxo revisor → executor — gera o RELATÓRIO objetivo por sistema (atualização direta + plans propostas), espera o HITL de seleção dos repositórios, escreve o prompt de atualização direta e as plans de adequação no repositório escolhido e confere o que o executor entregar. A atualização direta escreve no branch corrente, sem commit e com desfazer. Use quando pedirem para levar uma mudança da base aos sistemas, conferir o quanto cada sistema está defasado ou preparar/aplicar/desfazer uma propagação. NÃO acione proativamente.
---

# Skill: Propagar a base aos sistemas (meta-propagar-base)

Compara cada sistema do `mapa.json` com uma **instalação de referência** — o que a base instalaria hoje,
gerada em pasta temporária **pelos próprios instaladores da base** — e classifica cada arquivo por categoria.
Dois caminhos saem daí, e **nenhum é uma branch nova**:

- **atualização direta** — o `--apply` escreve o que é mecânico (`add`, `replace`,
  `replace-policy`) **no branch corrente** do sistema, **sem commit**; o `--undo` volta tudo atrás;
- **plans de adequação** — o que exige decisão ou mudança relevante **não é feito pela propagação**: vira
  plan no `specs/plan/` do repositório, no fluxo SDD de lá.

O agente que roda a skill age como **revisor**: escreve o prompt e as plans, e revisa. Quem executa é **outro
agente** (o executor), numa **outra** conversa. Quem commita é o usuário.

> **Dependência:** lê o `mapa.json` e o carimbo `.sarak/base.json` definidos pela `meta-iniciar-repositorio`
> (`scripts/stamp.py`, cujas funções o aplicar reaproveita para carimbar), reproduz a instalação chamando os
> instaladores dela e do template de módulos, e regenera o `00-resumo` pela `spec-panorama`. A tabela de
> categorias e o mapa de fontes vivem num lugar só: `scripts/propagate.py` (`RULES`, `SOURCES`,
> `NO_DIRECT_SOURCE`); a regra lacuna → plan proposta, em `scripts/report.py` (`PLANS`). A forma das
> plans é da `spec-write`; o catálogo de famílias, do `panorama/00-planejamento` do repositório.

> **Arquivos personalizados NUNCA são alterados pela atualização direta** — os moldes de processo presentes
> no sistema (`00-contexto`, `00-indice`, `00-backlog`, `panorama/00-planejamento`), todo conteúdo do projeto
> (`specs/specs/`, `specs/arquitetura/` fora dos nomes reservados, `specs/adr/` exceto o 000, `specs/plan/`)
> e o código. Molde de processo **ausente** é adicionado; conteúdo ausente, nunca. Mexer neles é trabalho
> das plans, no fluxo do repositório.

## Quando usar
- Depois de atualizar a base (`meta-atualizar-base`), para ver o que cada sistema receberia e levar a mudança.
- Para medir a defasagem de um sistema (`--plan --id`) ou aplicar/desfazer a propagação num grupo de repositório.
- Sob demanda. `--plan` e `--report` são **somente leitura**; escrever em repositório só **depois do HITL**.

## Workflow

1. **Analisar** — *terminal.* `git status --porcelain` da base vazio (o aplicar tolera só o `mapa.json`);
   suja → pare e peça commit ou descarte. Rode `scripts/propagate.py --report [--id <id>]` (caminho relativo
   à skill). **Critério:** um bloco por sistema — `<id> · <status> [· ⚠ motivo]`, **Direct update**
   (contagens e até 5 nomes) e **Proposed plans** (`plan-00.NN <título> — <motivo>`; o texto do relatório
   sai em inglês). `⚠` = não se aplica agora (`dirty worktree`, `.sarak/ ignored`, `later-adoption`). Sem escrita. O detalhe de um sistema:
   `--plan --id <id>`.
2. **HITL de seleção** — *resposta ao usuário.* Apresente o relatório **como saiu**. O usuário escolhe os
   repositórios e pode recusar plans propostas. **Critério:** lista explícita de repositórios e de plans
   aceitas; as flags `--include-divergent`/`--include-add?` só se ele pedir, naquela execução.
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
   plan**, e escritas na §3.1 — o executor não decide. A ordem e o `depends_on` seguem o relatório: a
   conversão do `00-indice` (formato antigo) é a primeira e as outras dependem dela.
   Depois de escrever, o **usuário commita** as plans e o índice: o aplicar exige worktree limpo.
4. **Executar** — *outra conversa (o executor).* O usuário leva cada prompt a **outra** conversa. Primeiro o
   de atualização direta; depois cada plan ("leia 00-prompt-executor e execute plan-00.NN"), na ordem de
   `depends_on`, no fluxo SDD do repositório (plan de decisão: um único `--apply --adopt/--keep`). **Você não executa o prompt que escreveu** — nem a atualização direta, nem as plans.
5. **Revisar e aprovar** — *terminal e leitura.*
   - **Atualização direta:** `--plan --id <id>` não mostra mais nada aplicável (`add`, `replace` e
     `replace-policy` = 0); o `git diff` só tem o que estava no relatório; os moldes personalizados estão
     intactos (`git diff` vazio neles); o carimbo `.sarak/base.json` foi gravado.
   - **Plan de decisão:** `--plan --id <id>` mostra os "adotar" fora de `divergent`/`conflict` e os
     "manter" como `kept`, e o `kept` do carimbo tem o motivo de cada um.
   - **Plans:** pelo ritual do `00-prompt-revisor` do repositório (veredito, síntese).
   Aprovado → o **usuário** commita no repositório e commita o `mapa.json` na base. Reprovado → prompt de
   correção, ou `--undo` (só antes do commit).
6. **Fechar** — *terminal.* Com todas as plans sintetizadas e commitadas, um novo `--apply --id <id>` (sem
   mais nada a escrever além do carimbo e do manifesto) grava `updated` — arquivos `kept` não pesam;
   se ainda sobra decisão humana, grava `pending`. O usuário commita o `mapa.json`.

**Aplicar** (rodado pelo **executor**, passo 4): `scripts/propagate.py --apply --id <id> [--id …]
[--include-divergent] [--include-add?] [--adopt <caminho> …] [--keep <caminho> --reason "<texto>" …]`. Pré-condições (falhou → `[ERROR]`, nada escrito): sistemas
`active`; base limpa exceto `mapa.json`; worktree do `git_root` limpo; `.sarak/` fora do `.gitignore` (senão o
carimbo não seria versionado — remover a regra é decisão do usuário); monorepo inteiro na mesma chamada. **O
branch corrente é o que for:** o aplicar não cria, não troca e não confere branch. Por sistema: aplicado,
pendente, gate e manifesto `.sarak/propagation-<curto>.json` (com o `head_at_apply`); `status`/`status_commit`
gravados no mapa.

**Decisão por arquivo** (só em `divergent` ou `conflict`; outro caminho → `[ERROR]`, nada escrito, validado
antes de qualquer escrita): `--adopt <caminho>` aplica **só aquele** arquivo, com a mesma escrita do aplicar
(corpo da referência, título e fim de linha do sistema). `--keep <caminho> --reason "<texto>"` (cada
`--keep` com o seu `--reason`, na mesma ordem) **não escreve** o arquivo: grava em `kept`, no carimbo
`.sarak/base.json`, `{ path, reason, system_sha1, reference_sha1 }` — sha1 do conteúdo normalizado (CRLF →
LF, sem as linhas de título onde elas já são descontadas). Em monorepo o caminho vale para cada sistema
escolhido em que ele está em `divergent`/`conflict`. O aplicar **preserva** os `kept` ao reescrever o
carimbo e descarta os vencidos. Decidir é do usuário: nunca use sem a decisão dele.

**Desfazer** (`--undo --id <os mesmos ids>`): restaura do HEAD o que existia, apaga o criado (manifesto e
carimbo incluídos) e devolve o status anterior; o branch não é tocado. **Recusa** (`[ERROR]`) se o HEAD do
sistema mudou desde o aplicar (o usuário já commitou) ou se o worktree tem mudança alheia ao manifesto —
reverter aí é decisão do usuário.

**Estado antigo continua legível** (ADR-023): o `--undo` e o `--report` leem manifestos
`.sarak/propagacao-<curto>.json` (localizados também pelo nome antigo), `.sarak/base.json` e `mapa.json` com
chaves em português — por um mapa antigo→novo único (`LEGACY_MANIFEST_*` em `scripts/apply.py`; o do carimbo e do
mapa vive no `stamp.py`). Quem grava só grava chaves novas. A referência de um commit **antigo** da base é
gerada pelo `init_repo.py` daquele commit (`installer_api` reconhece os nomes antigos). Fora da propagação:
`.githooks/pre-commit` e `.githooks/verify_commit.py` (`verificar_commit.py` em projeto criado antes da onda 6 do ADR-023) são um **par** (o hook novo chama `--root .`); a
propagação só compara `specs/`, `tools/` e `.agents/`, não os atualiza — adequar o par é trabalho do projeto.

**Ações do plano:** `add` (falta no sistema) · `add?` (lei do template ou ADR 000 ausente **sem
carimbo** — o projeto pode tê-la com outro nome; confirmação humana) · `blocked` (o mesmo, mas o sistema
tem **lei/fundação fora do reservado**: nunca aplicado, nem com flag — a lacuna se resolve antes, na plan do
revisor) · `replace` (universal desatualizado sem edição local: pelo carimbo, ou pela **adoção por
histórico**) · `replace-policy` (em sistema modular, um `tools/` do template que existe nos dois lados
sem versão igual no histórico: o `tools/` é da base, substituído **por política**) · `conflict` (universal
editado localmente, com carimbo) · `divergent` (universal diferente, sem carimbo e sem versão reconhecida) ·
`obsolete?` (só com carimbo: saiu da referência atual) · `kept` (estava em `divergent`/`conflict` e o
usuário decidiu **manter**: o `kept` do carimbo tem a entrada e o `system_sha1` **e** o `reference_sha1`
seguem iguais aos atuais — **não é pendência**; se o projeto editou de novo ou a base mudou aquela fonte, a
decisão venceu e o arquivo **volta** a `divergent`/`conflict`, para revisar) · `report-template` (molde antigo intocado e o molde
mudou) · `regenerate` (`00-resumo`) · `none`. **Extras do projeto** só são contados, nunca listados.

**O aplicar escreve:** `add`, `replace`, `replace-policy` e, **só com a flag explícita da
execução**, `divergent` (`--include-divergent`) e `add?` (`--include-add?`). Nunca escreve
`conflict`, `obsolete?` (nunca apaga), `blocked`, molde de processo ou conteúdo presentes, nem código.
Mais os `--adopt` da execução (e o `--keep`, que só registra a decisão). Depois: carimbo `.sarak/base.json`
com o HEAD da base e os `kept`; `00-resumo` regenerado só **sem migração de famílias
pendente**; gate (`node tools/gate/validate.mjs --all`, só modular — vermelho vira pendência, não desfaz);
`status` = `updated` se nada sobrou, senão `pending` — `kept` não sobra, então um sistema com tudo
decidido (e sem lacuna) fecha `updated`.

**Adoção por histórico** (sistema sem carimbo): um universal diferente é comparado com **todas as versões**
da sua fonte na base (`git log -- <fonte>`). Igual a alguma → `replace`; nenhuma → `divergent`. Arquivos
**transformados** pelo instalador também são adotados: `00-base-*` comparado sem a linha `titulo:` e o H1;
doutrina com escopo (`01-modulo`, `04-regras`, …) com o escopo do sistema trocado pelo marcador lido do
`create-project.mjs`. `specs/README.md` e `specs/INDEX.md` comparam **sem o título**. Sem fonte direta (README
da doutrina, `generate_index.py`, ou `gerar_indice.py` no projeto antigo) → `divergent`. Arquivo com título do projeto é escrito com **o corpo da
referência e as linhas de título do sistema**, no fim de linha do sistema.

**Lacunas** — trabalho de uma **plan do revisor no próprio projeto** (as propostas do relatório), nunca da
propagação: lei/fundação com nome fora do reservado · migração de famílias pendente · molde em formato antigo
· binding sem `00-base-<binding>.md` · `.sarak/` ignorado pelo git (o aplicar recusa). Sem
`panorama/00-planejamento.md` não há plan: o molde ausente é adicionado pela atualização direta.

**Status** (`mapa.json`): `outdated` (nunca recebeu propagação) · `pending` (recebeu, mas sobraram
decisões humanas) · `updated` (a última propagação fechou sem pendências, ou o sistema acabou de ser
instalado). O `--plan` e o `--report` só o **leem**; o `--apply` e o `--undo` o escrevem (com
`stamp.serialize`).

## Regras e limites
- **O agente nunca executa o próprio prompt:** quem escreve revisa; outro agente executa.
- **NUNCA** escreva num repositório não selecionado, nem plan antes do HITL de seleção.
- **NUNCA** crie branch: a propagação escreve no branch corrente; mudança relevante vira plan.
- **NUNCA** aplique com o worktree do sistema sujo — nem contorne a pré-condição.
- **NUNCA** commite nem dê push no sistema: commit é do usuário. Nem na base (o `mapa.json`).
- **NUNCA** altere arquivo personalizado (molde de processo presente, conteúdo do projeto) pela atualização
  direta, nem código; **NUNCA** apague (`obsolete?` é decisão humana); **NUNCA** aplique `blocked`. Esses
  arquivos mudam só por plan, no fluxo do repositório.
- **NÃO** use `--include-divergent`/`--include-add?` sem o usuário pedir, naquela execução; nem
  `--adopt`/`--keep` sem a decisão dele, arquivo a arquivo (o motivo do `--keep` é o dele).
- **NÃO** reimplemente instalador — a referência sai dos instaladores da base; se um passo não puder ser
  reproduzido assim, pare e reporte.
- **NÃO** rode com a base suja (`--allow-dirty-base` existe só para teste/desenvolvimento).

## Checklist
- [ ] Base limpa, `--report` gerado e apresentado como saiu (`later-adoption` e `⚠` à vista)?
- [ ] HITL de seleção feito: repositórios, plans aceitas e flags escolhidos pelo usuário?
- [ ] Por repositório: `00-contexto` e `00-prompt-revisor` dele lidos antes de escrever; prompt de atualização
  direta e plans escritos na forma do repositório (índice e contador da família `00`)?
- [ ] Execução entregue a **outra** conversa; nenhum prompt executado por quem o escreveu?
- [ ] Decisões por arquivo (`--adopt`/`--keep`) tomadas pelo usuário e registradas (`kept` no carimbo)?
- [ ] Revisão feita (`--plan --id` sem aplicável, diff só com o relatado, moldes intactos, carimbo gravado;
  plans pelo ritual do repositório) e o commit deixado ao usuário (repositório e `mapa.json`)?
- [ ] Fechamento: `--apply` final gravou `updated` (ou `pending`, dito com o motivo)?

## Referências (Camada 3 — leia sob demanda)
- `references/prompt-atualizacao.md` — o molde do prompt de atualização direta para o executor.
- `references/plans-de-adequacao.md` — um molde de plan por tipo de proposta (formato do `template-plan`).
- `references/campanha-idioma.md` — insumo da propagação das ondas da campanha de idioma (`ADR-023` a `025`): exceções por id de cada sistema, riscos do `tools/` vendorizado e inventário detalhado da base. Não viaja para projeto.
- `scripts/propagate.py` — o plano e a CLI. `RULES` (categorias), `SOURCES`/`NO_DIRECT_SOURCE` (adoção), com as
  fontes citadas; `split_kept`/`apply_kept` (a ação `kept`); `--selftest` prova o núcleo do plano, do aplicar/desfazer e do relatório em memória.
- `scripts/report.py` — o `--report`: `PLANS` (lacuna/ação → plan proposta: título, destino, ordem e
  `depends_on`),
  `proposals`, `direct_update`, `build_report`.
- `scripts/apply.py` — o aplicar e o desfazer: núcleo puro (`applicable_actions`, `compose`, `pendencies`,
  `preconditions`, `build_manifest`, `undo_plan`, `undo_errors`, `decision_errors`,
  `kept_entry`, `merge_kept`) e a casca de git, disco, gate
  e panorama.
