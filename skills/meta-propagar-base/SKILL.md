---
name: meta-propagar-base
description: Propaga as atualizações da base Sarak aos sistemas do mapa.json — nesta versão, gera só o PLANO por sistema (o que mudaria, por quê e com que risco), sem escrever em sistema nenhum. Use quando pedirem para levar uma mudança da base aos sistemas, conferir o quanto cada sistema está defasado ou preparar uma propagação. NÃO acione proativamente.
---

# Skill: Propagar a base aos sistemas (meta-propagar-base)

Compara cada sistema do `mapa.json` com uma **instalação de referência** — o que a base instalaria hoje,
gerada em pasta temporária **pelos próprios instaladores da base** — e classifica cada arquivo por categoria.
O resultado é um **plano** por sistema. **Aplicar ainda não existe.**

> **Dependência:** lê o `mapa.json` e o carimbo `.sarak/base.json` definidos pela `meta-iniciar-repositorio`
> (`scripts/carimbo.py`), e reproduz a instalação chamando os instaladores dela e do template de módulos.
> A tabela de categorias e o mapa de fontes, com a fonte de cada linha, vivem num lugar só:
> `scripts/propagar.py` (`REGRAS`, `FONTES`, `SEM_FONTE_DIRETA`).

> **Arquivos personalizados NUNCA são alterados** — nem por este plano, nem pelo aplicar futuro: os moldes de
> processo presentes no sistema (`00-contexto`, `00-indice`, `00-backlog`, `panorama/00-planejamento`) e todo
> conteúdo do projeto (`specs/specs/`, `specs/arquitetura/` fora dos nomes reservados, `specs/adr/` exceto o
> 000, `specs/plan/`). Molde de processo **ausente** é adicionado; conteúdo ausente, nunca.

## Quando usar
- Depois de atualizar a base (`meta-atualizar-base`), para ver o que cada sistema receberia.
- Para medir a defasagem de um sistema (`--id`) ou preparar uma propagação para revisão humana.
- Sob demanda. É **somente leitura**: nenhum arquivo de sistema é escrito, nem o carimbo, nem o `status` do mapa.

## Workflow

1. **Ler o mapa** — *leitura.* `mapa.json` da raiz da base. Sistemas em `adocao-posterior` são pulados.
   **Critério:** cada sistema ativo tem `caminho`, `tipo`, `modular`, `bindings` e `status`.
2. **Exigir a base limpa** — *terminal.* `git status --porcelain` da base vazio. **Critério:** suja → pare e
   peça commit ou descarte — o plano compara com o HEAD.
3. **Gerar o plano** — *terminal.* Rode `scripts/propagar.py --plano` (todos) ou `--plano --id <id>` (um),
   `--json` para máquina (caminho relativo à skill, resolvido a partir de onde ela foi carregada).
   **Critério:** por sistema, `status (status_base)`, `carimbo · atrás do HEAD`, as contagens por ação, as
   listas e as lacunas; no fim, o consolidado. Os instaladores rodam num `git worktree` do HEAD (e do commit do
   carimbo, quando há), em temporário apagado ao final.
4. **Apresentar** — *resposta ao usuário.* O consolidado primeiro; depois, por sistema, `conflito`,
   `divergente` (com o motivo: sem fonte direta, ou sem versão igual no histórico), `adicionar?`,
   `obsoleto?` e as lacunas. **Critério:** dizer explicitamente que **aplicar ainda não existe** e que nada —
   nem o `status` — foi escrito.

**Ações do plano:** `adicionar` (falta no sistema) · `adicionar?` (lei do template ou ADR 000 ausente **sem
carimbo** — o projeto pode tê-la com outro nome; confirmação humana) · `substituir` (universal
desatualizado sem edição local: pelo carimbo, ou pela **adoção por histórico**) · `conflito` (universal
editado localmente, com carimbo) · `divergente` (universal diferente, sem carimbo e sem versão reconhecida) ·
`obsoleto?` (só com carimbo: estava na referência antiga e saiu da atual) · `reportar-molde` (o sistema ainda
é o molde antigo intocado, e o molde mudou) · `regenerar` (`00-resumo`, pela `spec-panorama`) · `nada`.
**Extras do projeto** (arquivo do sistema que a base não instala) só são contados, nunca listados.

**Adoção por histórico** (sistema sem carimbo): um universal diferente é comparado com **todas as versões**
da sua fonte na base (`git log -- <fonte>`). Igual a alguma → `substituir` (adoção: idêntico à base em
`<commit>`); nenhuma → `divergente`. Arquivo **transformado** pelo instalador (README da doutrina, doutrina
com escopo, ADR 000, `00-base-*`, `gerar_indice.py`) não tem fonte direta e fica `divergente`.
`specs/README.md` e `specs/INDEX.md` são comparados **sem o título** (levam o nome do projeto); o aplicar
futuro preserva o título do sistema.

**Lacunas** — trabalho de uma **plan do revisor no próprio projeto**, nunca da propagação: lei/fundação com
nome fora do reservado · migração de famílias pendente (specs de conteúdo `NN-*` e plans `plan-NN-*`) · molde
em formato antigo (ex.: `00-indice` com `proximo_numero_plan` escalar) · binding sem `00-base-<binding>.md` ·
sem `panorama/00-planejamento.md`.

**Status** (`mapa.json`): `desatualizado` (nunca recebeu propagação nem adoção) · `pendente` (recebeu, mas
sobraram decisões humanas) · `atualizado` (a última propagação fechou sem pendências, ou o sistema acabou de
ser instalado). É o resultado da **última propagação**, não uma comparação ao vivo. O `--plano` só o **lê**;
quem o escreve é o aplicar (e o `carimbo.py --registrar`, na instalação).

## Regras e limites
- **NUNCA** escreva em sistema — nem carimbo, nem `.gitkeep` — nem o `status` do `mapa.json`.
- **NUNCA** altere arquivo personalizado (molde de processo presente, conteúdo do projeto) nem código.
- **NUNCA** apague: o que a base não instala mais é `obsoleto?`, para decisão humana.
- **NÃO** reimplemente instalador — a referência sai dos instaladores da base; se um passo não puder ser
  reproduzido assim, pare e reporte.
- **NÃO** rode com a base suja (`--permitir-base-suja` existe só para teste/desenvolvimento).

## Checklist
- [ ] Base limpa e mapa lido, com `adocao-posterior` pulado?
- [ ] Plano gerado pela referência dos instaladores (nenhuma cópia crua), com a adoção por histórico?
- [ ] Consolidado apresentado, com `conflito`/`divergente`/`adicionar?`/`obsoleto?` e as lacunas destacados?
- [ ] Dito explicitamente que aplicar ainda não existe e que nenhum sistema (nem o status) foi escrito?

## Referências (Camada 3 — leia sob demanda)
- `scripts/propagar.py` — o plano (só leitura). `REGRAS` (categorias), `FONTES`/`SEM_FONTE_DIRETA` (adoção),
  com as fontes citadas; `--autoteste` prova `classificar`/`decidir`/`planejar`/`adotar`/`lacunas` em memória.
