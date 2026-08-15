# Plano 3.2 — a retirada do andaime

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **O que este plano é.** O `plan-3.0` tirou a arqueologia de dentro dos arquivos. Sobrou a camada de
> cima: **os arquivos que só existiram para a campanha**. Ferramenta de renomeação, catraca de limpeza,
> linha de base de citação, sete planos de construção — nada disso serve a quem **recebe** o template.
> São **549 KB** de andaime medido, e um bloco de **64 linhas na lei que viaja para o projeto de todo
> usuário** descrevendo uma ferramenta que ele nunca vai ter.
>
> **O que este plano NÃO é.** Não é continuação da limpeza de comentário — aquilo acabou. Aqui **nada é
> reescrito**: arquivo sai inteiro, ou fica inteiro. As únicas edições são de **ponteiro** — quem citava
> o que saiu.

**A pergunta que decide cada item, e é uma só:**

> **Isso serve a quem RECEBE o template, ou só serviu a quem o CONSTRUIU?**

Não é "isso é útil?" — o `apply-rename.mjs` era utilíssimo, e saiu no Bloco BE porque a campanha dele
acabou. Ferramenta de obra vai embora com a obra. O que fica é o que o template **usa para se provar**.

---

## Estado — medido antes de decidir

| O que | Onde | Tamanho | Veredito |
|---|---|---|---|
| Sete planos de construção | `plan.md`, `plan-2*.md`, `plan-3*.md` | **377 KB** | andaime — o git guarda |
| Aparato do rename | `verify-citations.mjs` + `citation-terms.json` + `citation-baseline.json` | **114 KB** | andaime — inventário fechado, campanha encerrada |
| Aparato da limpeza | `no-comments-diff.mjs` + `no-comments-baseline.json` + `no-comments-exceptions.json` | **58 KB** | andaime — este plano é o último a usá-lo |
| **O §7.2 que descreve o `verify-citations`** | `doutrina/04-regras.md` ~415-478 | **64 linhas** | **andaime que VIAJA** — 4 citações chegam no `specs/arquitetura/` do usuário |
| Scripts `verificar:citacoes:*` | `package.json` (3 + 2 chaves `//`) | — | morrem com a ferramenta |
| Citações de campanha no CI | `.github/workflows/autoteste-template.yml` | **6** | nunca varrido por bloco nenhum |
| `node tools/gate/validar.mjs` | **`CLAUDE.md:22`** | — | **ponteiro morto no gancho sempre-ativo** |
| `validar.mjs` | `README.md:48` | — | ponteiro morto no manual da base |

**O número que define a urgência:** o bloco do `verify-citations` na doutrina **vira lei do usuário**.
Medido: 4 citações a `verify-citations.mjs`/`citation-terms.json`/`citation-baseline.json` dentro de
`specs/arquitetura/04-regras.md` de um projeto gerado agora. Ele descreve uma ferramenta de manutenção
**da base Sarak** — que o projeto não tem, não pode rodar e não deveria conhecer. E os números dela
(`3856`, `261`, `152`) envelhecem a cada rodada: a linha de base já foi 200 → 152 → 131 → 112 → **109**,
e a lei ainda diz 152. **Documentação de artefato móvel dentro de um documento imutável.**

---

## O que NÃO sai — a lista curta, e ela é o freio

- **`tests/template-self-test.mjs`** (Bloco K) — prova que o template gera projeto que passa na própria
  cadeia. É a garantia central. Fica.
- **`tests/verify-map.mjs`** — prova que todo `§` citado no mapa instalado resolve a um título real.
  Ferramenta de manutenção do **template**, não da campanha. Fica.
- **`tests/run-all-selftests.mjs`** — a catraca que impede `--autoteste` órfão. Fica, com o `REGISTRO`
  encolhido.
- **`funcionamento-esperado.md`** — é a visão de conjunto do template, doc viva citada pelo próprio
  ferramental. Fica.
- **`tools/**` inteiro** — é o que viaja. Nada de `tools/` entra neste plano.

---

## Bloco CA — os sete planos de construção ✅ **APROVADO** *(revisado e reproduzido)*

> **377 KB de registro de obra na raiz de um repositório que é distribuído como plugin.** O git guarda o
> histórico inteiro; o que sai é a cópia na árvore de trabalho.

- [x] Remover `plan.md`, `plan-2.md`, `plan-2.1.md`, `plan-2.2.md`, `plan-3.md`, `plan-3.1.md`,
      `plan-3.0.md`
- [x] ⚠️ **`plan-3.2.md` (este arquivo) NÃO sai por sua mão** — é a sua instrução. O dono o remove
      depois de aprovar
- [x] **Quem citava um plano tem de parar de citar.** `verify-citations.mjs` trata `plan*.md` como
      registro histórico numa lista literal; se a ferramenta ainda existir quando você chegar aqui,
      a lista fica órfã. Mapeie antes de remover, não depois

---

## Bloco CB — o aparato do rename, e a lei que o descreve ✅ **APROVADO** *(revisado e reproduzido)*

> **A campanha de idioma acabou no `plan-3` §AD.** O inventário está fechado, os 330 itens foram
> aplicados, e a linha de base existe para segurar o resíduo que sobrou — resíduo que os Blocos BB, BF,
> BI e BJ drenaram de 200 para **109**. O que resta na linha de base é, por decisão registrada, **menção
> deliberada**: o §7.2 citando `rotaBase`/`lerTexto` como exemplos, e a própria ferramenta documentando
> o próprio mecanismo. **Uma catraca cujo conteúdo é só menção deliberada não segura mais nada.**

- [x] Remover `tests/verify-citations.mjs`, `tests/citation-terms.json`, `tests/citation-baseline.json`
- [x] Remover os 3 scripts `verificar:citacoes:*` do `package.json` **e as 2 chaves `//` que os
      documentam** — chave de documentação órfã é pior que script órfão: parece intenção
- [x] Tirar `verify-citations.mjs` do `REGISTRO` do `run-all-selftests.mjs`. **Declare o número novo do
      `autoteste:tudo`** (hoje 17)
- [x] ⚠️ **O BLOCO DA DOUTRINA — é o item de maior consequência do plano.** `doutrina/04-regras.md`,
      dentro do §7.2, tem ~64 linhas descrevendo `verify-citations.mjs`, os dois cortes, os números
      `3856`/`261`/`152` e o artefato `citation-baseline.json`. **Sai inteiro.** Não é reescrita, não é
      atualização de número: a ferramenta descrita não existirá, e o documento **vira o
      `specs/arquitetura/04-regras.md` do usuário**
- [x] **Costure o §7.2 depois do corte.** A subseção `§7.2.1` e a tabela que a antecede continuam; o
      texto tem de ler como se o bloco nunca tivesse estado lá. **Nenhum `§` citado em outro documento
      pode passar a apontar para o vazio** — o `verify-map.mjs` existe exatamente para cobrar isso, e é
      ele que prova este item
- [x] Medido antes: **nada importa `verify-citations.mjs`** (`grep` por import/require: zero). Confirme
      de novo antes de remover — medição de terceiro não é medição sua

---

## Bloco CC — o aparato da limpeza *(o último a sair, e por uma razão mecânica)*

> **`no-comments-diff.mjs` é o instrumento de aceite dos Blocos CA, CB e CD.** Ele prova que remover
> arquivo e consertar ponteiro **não mexeu em código executável**. Se sair antes, os outros três blocos
> ficam sem prova. Ele é a escada: desce por último, e por fora.

- [x] **Só comece este bloco com CA, CB e CD aprovados.** Se algum ainda estiver aberto, PARE
- [x] ⚠️ **Carry-over do CB, no mesmo arquivo que este bloco já edita:** `run-all-selftests.mjs:16` diz
      *"É a mesma disciplina de `citation-baseline.json`"* — artefato que o **CB apagou**, citado num
      arquivo que sobrevive ao plano inteiro. Tratamento do Bloco BH: **o que a frase ensina fica** (o
      artefato tem de ficar menor ou igual ao que a varredura acha), **o precedente sai**
- [x] Remover `tests/no-comments-diff.mjs`, `tests/no-comments-baseline.json`,
      `tests/no-comments-exceptions.json`
- [x] Tirar `no-comments-diff.mjs` do `REGISTRO`. **Declare o número final do `autoteste:tudo`**
- [x] ⚠️ **A prova deste bloco é diferente, porque o instrumento é o que está saindo.** Não há
      `no-comments-diff` para dizer que nada mudou. A prova é: **`git diff --stat` mostrando SOMENTE
      remoção de arquivo e a linha do `REGISTRO`** — zero linha alterada em qualquer outro arquivo —
      mais a suíte verde inteira. *Quando o instrumento sai, a prova vira o diff.*
- [x] **A catraca sai com dívida zerada, não com dívida escondida.** Antes de remover
      `no-comments-exceptions.json`, rode a comparação uma última vez e cole a saída: as entradas
      autorizadas são o registro de tudo que este plano de limpeza mudou em código. **Elas somem porque
      a campanha acabou, não porque alguém desistiu de olhar**

---

## Bloco CD — os ponteiros mortos que ficam ✅ **APROVADO** *(revisado e reproduzido)*

> Estes **não saem** — eles são consertados. São documentos vivos que mandam rodar comando que não
> existe. É a mesma classe que o Bloco BI matou no `README.md` do template, sobrevivendo em três
> arquivos que nenhum bloco reivindicou.

- [x] ⚠️ **`CLAUDE.md:22`** — `node ferramentas/gate/validar.mjs --todos`. É o **gancho sempre-ativo**:
      o primeiro documento que todo agente lê neste repositório manda rodar um caminho que não existe
      desde a campanha de idioma. Vira `node tools/gate/validate.mjs --todos`
- [x] **`README.md:48`** — a coluna "Manual (referência humana) + `validar.mjs`" → `validate.mjs`
- [x] **`.github/workflows/autoteste-template.yml`** — 6 citações de campanha, incluindo o **nome do
      workflow** (*"Autoteste do template (Bloco K)"*) e comentários citando `plan-2.md`/`plan-3.1.md`
      §AJ.1/§AG. O nome vira o que o job faz; os comentários mantêm **o que o job garante** e perdem
      **de que rodada vieram**
- [x] **Feche a classe, não os três sítios.** Varra `CLAUDE.md`, `README.md`, `funcionamento-esperado.md`
      e `.github/` com as quatro varreduras de sempre. Nenhum desses arquivos foi varrido por bloco
      nenhum do `plan-3.0` — é território novo, não revisão fina

---

## Bloco CE — a revisão final, e ela é o produto deste plano ✅ **APROVADO** *(revisado e reproduzido)*

> **O usuário pediu que não sobre lixo, e "não sobrou" é uma afirmação que se mede.** Este bloco não
> remove nada: ele prova que não há mais o que remover.

- [x] **Instale um projeto do zero pela skill** — `meta-iniciar-repositorio`, do jeito que um usuário
      real faria — e varra o projeto gerado inteiro: zero citação a plano, a bloco, a ferramenta da base,
      a arquivo que ele não tem. **É o único teste que enxerga o que o usuário enxerga**
- [x] ⚠️ **Antes disso, sincronize o cache do plugin.** Achado registrado no `plan-3.0`: a skill carrega
      de `~/.claude/plugins/cache/`, que está velho. **Instalar pela skill sem sincronizar testa o
      passado.** Se não puder sincronizar, diga — e então o teste é com o script do repositório, com a
      limitação declarada
- [x] Varredura da base inteira por resíduo de andaime: nome de arquivo removido ainda citado, script
      órfão no `package.json`, `--autoteste` órfão, `REGISTRO` apontando para o que não existe
- [x] **Inventário de `tests/` na entrega:** deve restar **`template-self-test.mjs`, `verify-map.mjs`,
      `run-all-selftests.mjs`** — três arquivos, todos com valor permanente. Qualquer quarto arquivo
      exige justificativa escrita
- [x] `du -sh` de `tests/` antes e depois, e o total do repositório. Número medido, não estimado
- [x] ⚠️ **A varredura de CHAVE DE MANIFESTO ANTIGA, que nenhum bloco fechou** *(medido pelo revisor na
      rodada CE)*: **28 ocorrências** de `envRequerido`/`rotaWeb` em `bindings/` e `tools/` — **92 no
      projeto gerado**, porque o `_template` é copiado por módulo. Nenhuma é código lendo a chave
      (medido: zero acesso por propriedade), mas são **mensagens de erro de runtime**: quem vê
      *"declare em `module.json:envRequerido`"* vai ao manifesto e não acha a chave. É a classe que o
      Bloco BJ abriu ao consertar `permissoes` em 3 arquivos e não fechar nos outros
- [x] ⚠️ **Dois caminhos da BASE dentro do projeto gerado:** `doutrina/adr/decisoes.md` manda rodar
      `node specs/_estrutura_modulos/tests/template-self-test.mjs`, e a tabela de
      `_bases_arquiteturais/00-base-<binding>.md` mistura linha com caminho de projeto e linha com
      caminho de base. Os dois **viajam**

---

## Ordem, e por que ela não é negociável

```
CA  planos da raiz          independente — pode ir primeiro
CB  aparato do rename       + o corte na doutrina (o item que viaja)
CD  ponteiros mortos        depois do CB: o CB muda a doutrina, o CD varre o que sobrou
CC  aparato da limpeza      POR ÚLTIMO — é o instrumento de aceite dos três acima
CE  a revisão final         prova que não há mais o que remover
```

**Um commit por bloco.** O CB muda a lei que viaja; se precisar voltar, tem de voltar sozinho.

---

## Critério de aceite

- [x] `npm run autoteste:template` **3/3 VERDE, 13/13** — a garantia central sobrevive à retirada inteira
- [x] Gate **126/126 · 126/126 · 122/122**, mesmos ids — nenhuma regra muda neste plano
- [x] `npm run autoteste:tudo` no número final declarado, e `npm run typecheck:tools` limpo
- [x] `node tests/verify-map.mjs --conferir <projeto-gerado>` verde — prova que o corte no §7.2 não
      deixou `§` apontando para o vazio
- [x] **Zero script órfão no `package.json`** e **zero entrada morta no `REGISTRO`**
- [x] **Projeto gerado do zero sem uma única citação a ferramenta da base** — é o critério final, e é o
      que o usuário pediu quando disse *"esse é um template que será replicado"*
- [x] `tests/` com **três arquivos**, e o `du -sh` antes/depois colado

---

## Achados registrados, abertos para o dono

- **O `tools/` viaja com 5 violações do Nível 0 do próprio template** — `max-params` em
  `create-adapter.mjs` (3×, 5 parâmetros) e `max-lines-per-function` em `create-project.mjs` (41) e
  `gate/tests/run.mjs` (42). Só ficaram visíveis quando o `eslint.config.mjs` voltou a rodar no Bloco CE
  (importava `ferramentas/gate/limiares.mjs`, morto desde a campanha de idioma). **É refatoração de
  código, não ponteiro** — fora deste plano por decisão, e precisa de plano próprio.
- **`.claude/settings.json`** cita caminhos antigos em padrões de allowlist de permissão. Cache local de
  comandos aprovados, não documentação que engana leitor. Decisão do dono se vale limpar.

---

## Fora deste plano

- **Reescrever qualquer coisa.** Arquivo sai inteiro ou fica inteiro; a única edição autorizada é de
  ponteiro. Achou comentário feio no caminho? **Registra e segue** — a limpeza de prosa acabou no
  `plan-3.0`, e reabri-la aqui é escopo que ninguém revisou.
- **Mexer em `tools/`.** É o que viaja, está limpo, e não tem andaime dentro.
- **Mudar regra do gate.** Nenhuma. Se algum conserto parecer exigir isso, **PARE E PERGUNTE**.
- **Sincronizar o cache do plugin como parte do plano.** É operação do dono, não edição de template —
  mas o Bloco CE **depende** disso para valer, e por isso o item manda declarar se não deu.
