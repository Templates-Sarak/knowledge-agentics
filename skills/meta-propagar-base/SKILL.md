---
name: meta-propagar-base
description: Propaga as atualizações da base Sarak aos sistemas do mapa.json — gera o PLANO por sistema (o que mudaria, por quê e com que risco) e, depois de aprovação humana por sistema, APLICA numa branch do sistema, sem commit e com desfazer. Use quando pedirem para levar uma mudança da base aos sistemas, conferir o quanto cada sistema está defasado ou preparar/aplicar/desfazer uma propagação. NÃO acione proativamente.
---

# Skill: Propagar a base aos sistemas (meta-propagar-base)

Compara cada sistema do `mapa.json` com uma **instalação de referência** — o que a base instalaria hoje,
gerada em pasta temporária **pelos próprios instaladores da base** — e classifica cada arquivo por categoria.
O resultado é um **plano** por sistema; aprovado por um humano, o **aplicar** escreve o plano numa branch
`sarak/atualiza-base-<commit curto>` do sistema, **sem commit**, e o **desfazer** volta tudo atrás.

> **Dependência:** lê o `mapa.json` e o carimbo `.sarak/base.json` definidos pela `meta-iniciar-repositorio`
> (`scripts/carimbo.py`, cujas funções o aplicar reaproveita para carimbar), reproduz a instalação chamando os
> instaladores dela e do template de módulos, e regenera o `00-resumo` pela `spec-panorama`. A tabela de
> categorias e o mapa de fontes, com a fonte de cada linha, vivem num lugar só: `scripts/propagar.py`
> (`REGRAS`, `FONTES`, `SEM_FONTE_DIRETA`).

> **Arquivos personalizados NUNCA são alterados** — nem pelo plano, nem pelo aplicar: os moldes de processo
> presentes no sistema (`00-contexto`, `00-indice`, `00-backlog`, `panorama/00-planejamento`), todo conteúdo
> do projeto (`specs/specs/`, `specs/arquitetura/` fora dos nomes reservados, `specs/adr/` exceto o 000,
> `specs/plan/`) e o código. Molde de processo **ausente** é adicionado; conteúdo ausente, nunca.

## Quando usar
- Depois de atualizar a base (`meta-atualizar-base`), para ver o que cada sistema receberia e levar a mudança.
- Para medir a defasagem de um sistema (`--plano --id`) ou aplicar/desfazer a propagação num grupo de repositório.
- Sob demanda. O `--plano` é **somente leitura**; o `--aplicar` só roda **depois do HITL do sistema**.

## Workflow

1. **Ler o mapa** — *leitura.* `mapa.json` da raiz da base. Sistemas em `adocao-posterior` são pulados.
   **Critério:** cada sistema ativo tem `caminho`, `raiz_git`, `tipo`, `modular`, `bindings` e `status`.
2. **Exigir a base limpa** — *terminal.* `git status --porcelain` da base vazio (o aplicar tolera só o
   `mapa.json`). **Critério:** suja → pare e peça commit ou descarte — tudo se compara com o HEAD.
3. **Gerar o plano** — *terminal.* `scripts/propagar.py --plano [--id <id>] [--json]` (caminho relativo à
   skill). **Critério:** por sistema, `status (status_base)`, `carimbo · atrás do HEAD`, as contagens por
   ação, as listas e as lacunas; no fim, o consolidado. Referências em `git worktree` temporário, apagado.
4. **HITL por sistema** — *resposta ao usuário.* Apresente o plano de **um grupo de repositório** (um sistema,
   ou todos os de um monorepo): o que será escrito (`adicionar`, `substituir`, `substituir-politica`), o que
   fica pendente (`conflito`, `divergente`, `adicionar?`, `bloqueado`, `obsoleto?`, lacunas) e se há flag.
   **Critério:** aprovação explícita do usuário para aquele grupo, com as flags que ele escolheu.
5. **Aplicar** — *terminal.* `scripts/propagar.py --aplicar --id <id> [--id …] [--incluir-divergentes]
   [--incluir-adicionar?]`. Pré-condições (falhou → `[ERRO]`, nada escrito): sistemas `ativo`; base limpa
   exceto `mapa.json`; worktree do `raiz_git` limpo; `.sarak/` fora do `.gitignore` (senão o carimbo não
   seria versionado — remover a regra é decisão do usuário); monorepo inteiro na mesma chamada; a branch
   `sarak/atualiza-base-<curto>` não existe em outro estado. **Critério:** por sistema, aplicado, pendente,
   gate e manifesto `.sarak/propagacao-<curto>.json`; `status`/`status_base` gravados no mapa.
6. **Apresentar o resultado** — *resposta ao usuário.* Contagens, pendências com motivo, gate, `git diff
   --stat`. **Critério:** dizer que nada foi commitado e que os próximos passos são do usuário: revisar o
   diff, commitar **na branch** `sarak/...`, push e PR, commitar o `mapa.json` na base — ou desfazer.
7. **Desfazer (se pedido)** — *terminal.* `scripts/propagar.py --desfazer --id <os mesmos ids>`.
   **Critério:** restaura do HEAD o que existia, apaga o criado (manifesto e carimbo incluídos), volta à branch
   anterior, apaga a `sarak/...` e devolve o status anterior. Recusa (`[ERRO]`) se o worktree tem mudança
   alheia ao manifesto ou se a branch já tem commit próprio — aí é `git revert`, decisão do usuário.

**Ações do plano:** `adicionar` (falta no sistema) · `adicionar?` (lei do template ou ADR 000 ausente **sem
carimbo** — o projeto pode tê-la com outro nome; confirmação humana) · `bloqueado` (o mesmo, mas o sistema
tem **lei/fundação fora do reservado**: nunca aplicado, nem com flag — a lacuna se resolve antes, na plan do
revisor) · `substituir` (universal desatualizado sem edição local: pelo carimbo, ou pela **adoção por
histórico**) · `substituir-politica` (em sistema modular, um `tools/` do template que existe nos dois lados
sem versão igual no histórico: o `tools/` é da base, substituído **por política**) · `conflito` (universal
editado localmente, com carimbo) · `divergente` (universal diferente, sem carimbo e sem versão reconhecida) ·
`obsoleto?` (só com carimbo: saiu da referência atual) · `reportar-molde` (molde antigo intocado e o molde
mudou) · `regenerar` (`00-resumo`) · `nada`. **Extras do projeto** só são contados, nunca listados.

**O aplicar escreve:** `adicionar`, `substituir`, `substituir-politica` e, **só com a flag explícita da
execução**, `divergente` (`--incluir-divergentes`) e `adicionar?` (`--incluir-adicionar?`). Nunca escreve
`conflito`, `obsoleto?` (nunca apaga), `bloqueado`, molde de processo ou conteúdo presentes, nem código.
Depois: carimbo `.sarak/base.json` com o HEAD da base; `00-resumo` regenerado só **sem migração de famílias
pendente**; gate (`node tools/gate/validate.mjs --all`, só modular — vermelho vira pendência, não desfaz);
`status` = `atualizado` se nada sobrou, senão `pendente`.

**Adoção por histórico** (sistema sem carimbo): um universal diferente é comparado com **todas as versões**
da sua fonte na base (`git log -- <fonte>`). Igual a alguma → `substituir`; nenhuma → `divergente`. Arquivos
**transformados** pelo instalador também são adotados: `00-base-*` comparado sem a linha `titulo:` e o H1;
doutrina com escopo (`01-modulo`, `04-regras`, …) com o escopo do sistema trocado pelo marcador lido do
`create-project.mjs`. `specs/README.md` e `specs/INDEX.md` comparam **sem o título**. Sem fonte direta (README
da doutrina, `gerar_indice.py`) → `divergente`. Arquivo com título do projeto é escrito com **o corpo da
referência e as linhas de título do sistema**, no fim de linha do sistema.

**Lacunas** — trabalho de uma **plan do revisor no próprio projeto**, nunca da propagação: lei/fundação com
nome fora do reservado · migração de famílias pendente · molde em formato antigo · binding sem
`00-base-<binding>.md` · sem `panorama/00-planejamento.md` · `.sarak/` ignorado pelo git (o aplicar recusa).

**Status** (`mapa.json`): `desatualizado` (nunca recebeu propagação) · `pendente` (recebeu, mas sobraram
decisões humanas) · `atualizado` (a última propagação fechou sem pendências, ou o sistema acabou de ser
instalado). O `--plano` só o **lê**; o `--aplicar` e o `--desfazer` o escrevem (com `carimbo.serializar`).

## Regras e limites
- **UM grupo de repositório por vez**, cada um com HITL — **NUNCA** aplique em lote sem a aprovação de cada grupo.
- **NUNCA** aplique com o worktree do sistema sujo — nem contorne a pré-condição.
- **NUNCA** commite nem dê push no sistema: a branch fica com as mudanças **não commitadas**; commit, push e PR
  são do usuário.
- **NUNCA** altere arquivo personalizado (molde de processo presente, conteúdo do projeto) nem código; **NUNCA**
  apague (`obsoleto?` é decisão humana); **NUNCA** aplique `bloqueado`.
- **NÃO** use `--incluir-divergentes`/`--incluir-adicionar?` sem o usuário pedir, naquela execução.
- **NÃO** reimplemente instalador — a referência sai dos instaladores da base; se um passo não puder ser
  reproduzido assim, pare e reporte.
- **NÃO** rode com a base suja (`--permitir-base-suja` existe só para teste/desenvolvimento).

## Checklist
- [ ] Base limpa, mapa lido, `adocao-posterior` pulado, plano gerado pela referência dos instaladores?
- [ ] HITL do grupo de repositório feito, com as flags escolhidas pelo usuário?
- [ ] Aplicado sem `[ERRO]`, com conflito/divergente/`adicionar?`/bloqueado/obsoleto?/lacunas/gate como pendência?
- [ ] Resultado apresentado, dito que nada foi commitado, e os próximos passos (commit na branch, PR,
  `mapa.json` na base — ou `--desfazer`) entregues ao usuário?

## Referências (Camada 3 — leia sob demanda)
- `scripts/propagar.py` — o plano e a CLI. `REGRAS` (categorias), `FONTES`/`SEM_FONTE_DIRETA` (adoção), com as
  fontes citadas; `--autoteste` prova o núcleo do plano e o do aplicar/desfazer em memória.
- `scripts/aplicacao.py` — o aplicar e o desfazer: núcleo puro (`acoes_aplicaveis`, `compor`, `pendencias`,
  `precondicoes`, `montar_manifesto`, `plano_de_desfazer`) e a casca de git, disco, gate e panorama.
