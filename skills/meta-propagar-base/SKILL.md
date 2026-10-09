---
name: meta-propagar-base
description: Propaga as atualizações da base Sarak aos sistemas do mapa.json — nesta versão, gera só o PLANO por sistema (o que mudaria, por quê e com que risco), sem escrever em sistema nenhum. Use quando pedirem para levar uma mudança da base aos sistemas, conferir o quanto cada sistema está defasado ou preparar uma propagação. NÃO acione proativamente.
---

# Skill: Propagar a base aos sistemas (meta-propagar-base)

Compara cada sistema do `mapa.json` com uma **instalação de referência** — o que a base instalaria hoje,
gerada em pasta temporária **pelos próprios instaladores da base** — e classifica cada arquivo por categoria
(universal, molde de projeto, gerado). O resultado é um **plano** por sistema. **Aplicar ainda não existe.**

> **Dependência:** lê o `mapa.json` e o carimbo `.sarak/base.json` definidos pela `meta-iniciar-repositorio`
> (`scripts/carimbo.py`), e reproduz a instalação chamando os instaladores dela e do template de módulos.
> A tabela de categorias, com a fonte de cada uma, vive num lugar só: `scripts/propagar.py` (`REGRAS`).

## Quando usar
- Depois de atualizar a base (`meta-atualizar-base`), para ver o que cada sistema receberia.
- Para medir a defasagem de um sistema (`--id`) ou preparar uma propagação para revisão humana.
- Sob demanda. É **somente leitura**: nenhum arquivo de sistema é escrito, nem o carimbo.

## Workflow

1. **Ler o mapa** — *leitura.* `mapa.json` da raiz da base. Sistemas em `adocao-posterior` são pulados.
   **Critério:** cada sistema ativo tem `caminho`, `tipo`, `modular` e `bindings`.
2. **Exigir a base limpa** — *terminal.* `git status --porcelain` da base vazio. **Critério:** suja → pare e
   peça commit ou descarte — o plano compara com o HEAD.
3. **Gerar o plano** — *terminal.* Rode `scripts/propagar.py --plano` (todos) ou
   `--plano --id <id>` (um), `--json` para máquina (caminho relativo à skill, resolvido a partir de onde ela
   foi carregada). **Critério:** por sistema, as contagens por ação, as listas e as lacunas; no fim, o
   consolidado. Os instaladores rodam num `git worktree` do HEAD (e do commit do carimbo, quando há), em
   temporário apagado ao final.
4. **Apresentar** — *resposta ao usuário.* O consolidado primeiro; depois, por sistema, o que é `conflito` e
   `divergente` (revisão humana com o diff), as lacunas e o que é `obsoleto?`. **Critério:** dizer
   explicitamente que **aplicar ainda não existe** — nada foi nem será escrito por esta versão.

**Ações do plano:** `adicionar` (falta no sistema) · `substituir` (universal desatualizado, sem edição local —
só com carimbo) · `conflito` (universal editado localmente) · `divergente` (universal diferente e **sem
carimbo**: versão antiga ou edição local) · `obsoleto?` (universal que a base não instala mais) ·
`reportar-molde` (o sistema ainda é o molde antigo, e o molde mudou) · `regenerar` (`00-resumo`, pela
`spec-panorama`) · `nada`. Molde de projeto preenchido e código do projeto **nunca** entram como mudança.

**Lacunas** (não são trabalho da propagação): binding sem `00-base-<binding>.md`, specs/plans fora do
formato de famílias (migração pendente — trabalho de uma plan do revisor no próprio projeto) e projeto sem
`panorama/00-planejamento.md`.

## Regras e limites
- **NUNCA** escreva em sistema — nem carimbo, nem `.gitkeep`. Esta versão não tem modo de escrita.
- **NUNCA** marque molde de projeto preenchido ou código do projeto para mudar — são do projeto.
- **NUNCA** apague: o que a base não instala mais é `obsoleto?`, para decisão humana.
- **NÃO** reimplemente instalador — a referência sai dos instaladores da base; se um passo não puder ser
  reproduzido assim, pare e reporte.
- **NÃO** rode com a base suja (`--permitir-base-suja` existe só para teste/desenvolvimento).

## Checklist
- [ ] Base limpa e mapa lido, com `adocao-posterior` pulado?
- [ ] Plano gerado pela referência dos instaladores (nenhuma cópia crua)?
- [ ] Consolidado apresentado, com `conflito`/`divergente`/`obsoleto?` e as lacunas destacados?
- [ ] Dito explicitamente que aplicar ainda não existe e que nenhum sistema foi escrito?

## Referências (Camada 3 — leia sob demanda)
- `scripts/propagar.py` — o plano (só leitura). `REGRAS` é a tabela de categorias com as fontes citadas;
  `--autoteste` prova `classificar`/`decidir`/`planejar`/`lacunas` em memória.
