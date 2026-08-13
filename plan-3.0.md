# Plano 3.0 — a limpeza para produção

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **O que este plano é.** O template carrega hoje a **arqueologia da própria construção**: comentários
> que explicam *como era antes*, citações a planos que o leitor não tem, e nomes de caso de teste que
> dizem em que rodada nasceram. Nada disso serve a quem **recebe** o template — serve a quem o
> construiu. Este plano remove essa camada e deixa **só o template**.
>
> **O que este plano NÃO é.** Não muda funcionalidade. Nem regra, nem ferramenta, nem estrutura, nem o
> comportamento de auto-verificação. **Zero linha de código executável muda** — e isso não é promessa,
> é o critério de aceite mecânico do Bloco BA.

**Decisões do dono, tomadas antes de escrever:**
- **Comentário em tom de AVISO permanece.** O que impede alguém de desfazer uma guarda é carga
  estrutural, não ruído.
- **O template segue auto-verificável.** Essa e qualquer outra funcionalidade são preservadas.
- **O resíduo de campanha é REMOVIDO** — o git guarda o histórico.
- **O ADR-009 vira a convenção de nomenclatura deste template**, escrita no presente.

**Regras herdadas:** as quatro do `plan-3.md`, sem alteração.

---

## A regra deste plano, e ela é uma só

> **O comentário tem de ser legível por quem nunca viu este repositório.**
>
> Se a frase diz **o que fazer** ou **o que quebra**, ela **fica** — perdendo só a citação.
> Se ela narra o passado, ou aponta para um documento que o leitor não tem, ela **sai**.

```
FICA — avisa, e o aviso é a carga:
   o prefixo `**/` é obrigatório: sem ele o padrão ancora na pasta do próprio
   .gitignore e `modules/<id>/generated/` não é ignorado

SAI — narra:
   antes eram dois reconhecedores, um por âncora, e o de baixo regrediu (plan-2.md N.2.1)

FICA, sem a citação — a medição é o aviso, a rodada não é:
   antes:  `textoDeCodigo` remove comentário: sem isso, a chave citada num comentário
           virava uso de verdade (medido no Bloco N.1, plan-2.md)
   depois: `textoDeCodigo` remove comentário: sem isso, a chave citada num comentário
           vira uso de verdade
```

**O tempo verbal é o teste mais rápido.** *"virava"* é história; *"vira"* é aviso. Passado narrado sai;
presente que adverte fica.

---

## Estado — medido antes de decidir

| Métrica | Valor |
|---|---|
| Citações a `plan*.md` dentro do template | **137** — `bindings/` 46 · `tools/` 43 · `doutrina/` 24 · `tests/` 23 |
| Referências a *"Bloco X"* | **239** |
| Marcadores de arqueologia (*"antes era"*, *"o defeito"*, *"na rodada"*, *"regrediu"*) | **76** |
| Arquivos afetados | **56** |
| Nomes de caso em `cases.mjs` com marca de rodada | **27** |
| Lacunas do `04-regras.md` §7 que citam plano | **10** |
| `tests/` do template | **1,4 MB** — dos quais **1,16 MB** é `rename-refusals.json` |

**O número que define a urgência:** `create-project.mjs` copia **`tools/` inteiro** para todo projeto
gerado, e a **`doutrina/` vira o `specs/arquitetura/`** dele. Então **67 das 137 citações viajam para
dentro de cada projeto que alguém criar**, apontando para um `plan-2.md` que aquele projeto nunca terá.
Não é dívida da base: é dívida entregue ao usuário.

---

## Bloco BA — a ferramenta de aceite, e ela vem primeiro

> **A prova mecânica de "zero mudança funcional" já existe neste repositório.** `textoDeCodigo`
> (`tools/gate/text.mjs`) remove comentário e docstring de qualquer arquivo. Então a pergunta *"mexi só
> em comentário?"* não precisa de heurística nenhuma — precisa de **igualdade**.
>
> **Por que antes de limpar qualquer coisa:** escrita depois, ela é escrita contra a árvore já mexida e
> não tem linha de base. Mesma lição do Bloco AB do `plan-3.md`, e não é preciso aprendê-la de novo.

- [ ] `tests/no-comments-diff.mjs`, no contrato dos irmãos: **núcleo puro · zero dependência ·
      `--autoteste` · exit 0/1**. Recebe uma árvore de referência e a atual; para todo arquivo de código
      dos dois lados, exige `textoDeCodigo(antes) === textoDeCodigo(depois)`, **byte a byte**
- [ ] **Diferença de um byte reprova, e a mensagem nomeia arquivo e linha.** Não há "diferença
      aceitável" aqui: se o código sem comentário mudou, alguém mexeu em código achando que mexia em
      comentário
- [ ] **Cobre os três bindings e as duas sintaxes de comentário** — `//`, `#`, `--`, bloco `/* */` e
      docstring Python. `textoDeCodigo` já faz isso; o item é provar que faz, com caso de autoteste
- [ ] **Contraprova por reversão:** mude **um identificador** dentro de um arquivo que só deveria ter
      perdido comentário e exija que a ferramenta reprove nomeando-o. Verde que não sabe ficar vermelho
      não provou nada
- [ ] **Linha de base gravada antes do primeiro comentário removido** — é o `antes` de tudo o que vem
      depois

---

## Bloco BB — `tools/` e `bindings/`, as 89 citações que viajam

> São as que entram no projeto do usuário. `tools/` é copiado inteiro; `bindings/<b>/root` vira a raiz
> do projeto e `_template` vira o molde de módulo.

- [ ] As **43 citações em `tools/`** e as **46 em `bindings/`** — comentário por comentário, pela regra
      deste plano. Não é varredura por palavra-chave: cada uma se lê e se decide
- [ ] **O aviso permanece; a proveniência sai.** Onde a frase depende de uma medição, a **medição fica**
      (*"sem isto, `npm run test --workspaces` roda zero testes e sai 0"*); o **onde e quando ela foi
      feita, não**
- [ ] **Cabeçalho de arquivo:** hoje vários abrem com *"Lei dona: … (plan-2.md Bloco S)"*. A **lei dona
      fica** — é ponteiro vivo para a doutrina que viaja junto. O **bloco de plano sai**
- [ ] **Não invente resumo.** Comentário que perder a citação e ficar sem sentido é comentário cujo
      conteúdo estava só na citação — nesse caso ele **sai inteiro**, não vira paráfrase vaga
- [ ] `no-comments-diff` verde ao final deste bloco, contra a linha de base do BA

---

## Bloco BC — `doutrina/`, e o ADR que vira convenção

> A doutrina é **copiada para dentro de cada projeto** como `specs/arquitetura/`. É a lei que o usuário
> lê, e hoje ela cita rodadas de um plano que ele não tem.

- [ ] As **24 citações** nos seis documentos de doutrina, pela mesma regra
- [ ] **As 10 lacunas declaradas do §7** — a lacuna **fica**, com a forma exata que escapa e a medição.
      A referência ao plano **sai**. Lacuna declarada continua sendo o padrão desta casa; o que muda é
      que ela para de depender de um documento externo para ser entendida
- [ ] **O ADR-009 vira a convenção de nomenclatura deste template**, escrita no **presente**: *a árvore
      de arquivos é inglês; o conteúdo dela é português; `specs/arquitetura/` é a única exceção*. Com a
      tabela de fronteira item a item — que é o que o usuário precisa para decidir um caso novo — e
      **sem a narrativa de que houve uma migração**
- [ ] **Os outros ADRs do template** recebem a mesma leitura: decisão e consequência, no presente. ADR
      é registro de **decisão**, não de **processo**
- [ ] ⚠️ **A tabela de mapeamento do ADR-009 (`antigo→novo`) é o alvo natural deste bloco e some com
      ele** — ela existe para documentar uma migração que deixa de ser mencionada. Confirme que nada
      mais aponta para ela antes de removê-la

---

## Bloco BD — os nomes de caso, que são saída de ferramenta

> **27 casos de `cases.mjs` se chamam pela rodada que os produziu**, e esse nome é o que aparece na
> saída do autoteste do gate — a primeira coisa que alguém lê quando o gate reprova.

```
hoje:   'N.2 forma 1 — tipo de retorno inline desvia o extrator antigo'
        'Bloco M — core/domain/ vazio ou ausente'
depois: 'tipo de retorno inline não desvia o extrator'
        'core/domain/ vazio ou ausente'
```

- [ ] Os **27 nomes** passam a dizer **o que o caso prova**, não de onde veio
- [ ] **O `contem:` e a asserção não mudam** — só o rótulo. Se algum caso perder a identidade ao perder
      o prefixo (dois casos com o mesmo nome), o nome estava carregando informação: reescreva o nome,
      não o caso
- [ ] Autoteste do gate continua **122/122 · 122/122 · 119/119**, com os mesmos ids

---

## Bloco BE — o resíduo de campanha

> Campanha encerrada (`plan-3.md`, Bloco AD fechado). O que ela deixou em `tests/` são **artefatos de
> processo**, não do template.

- [ ] **Remover** `tests/apply-rename.mjs` (142 KB), `tests/rename-inventory.json` (47 KB) e
      `tests/rename-refusals.json` (1,16 MB). O git guarda o histórico, e é onde esse tipo de coisa deve
      ficar
- [ ] **Fica o que tem uso corrente:** `template-self-test.mjs` (Bloco K), `verify-map.mjs`,
      `verify-citations.mjs`
- [ ] ⚠️ **`verify-citations.mjs` consome o inventário.** Ou ele perde essa dependência e passa a
      verificar só o que resolve hoje, ou sai junto. **Decidir e registrar** — não deixar um verificador
      apontando para um arquivo removido, que é o defeito que este template inteiro existe para não ter
- [ ] Conferir que nada em `tools/`, `package.json` ou hook chama o que foi removido

---

## Ordem de dependência

```
BA   a ferramenta de aceite      PRIMEIRO, e com LINHA DE BASE — escrita depois, ela
                                 não tem contra o que comparar

BB   tools/ e bindings/          o que viaja para o projeto do usuário
BC   doutrina/ e o ADR           idem — é a lei que ele lê
BD   nomes de caso               saída de ferramenta, independente dos outros
BE   o resíduo de campanha       independente · tem uma decisão dentro (verify-citations)

═══ meta: um template que se explica para quem o recebe, sem contar como foi feito ═══
```

**Este plano roda por ÚLTIMO na família 3.** O `plan-3.1.md` acrescenta uma regra ao catálogo (Bloco AH)
e validação nova (Bloco AJ) — código e doutrina novos, que resujariam a limpeza se viessem depois.
**E o inverso também vale:** o que o `plan-3.1.md` escrever já nasce na regra deste plano — presente,
sem citação de rodada.

---

## Critério de aceite

- [ ] **`no-comments-diff` verde** contra a linha de base do BA — a prova de que **nenhuma linha de
      código executável mudou**. É o item que sustenta todos os outros
- [ ] Autoteste do gate **122/122 · 122/122 · 119/119**, com os **mesmos ids**
- [ ] **Bloco K 13/13 nos três bindings**
- [ ] Zero ocorrência de `plan-*.md` e de *"Bloco \<letra\>"* dentro de `specs/_estrutura_modulos/` —
      **medido, não afirmado**
- [ ] Um projeto gerado do zero: `verify` → `build` → `lint` → **primeiro commit**, e a `specs/arquitetura/`
      dele **não cita documento nenhum que ele não tenha**

---

## Fora deste plano

- **Traduzir comentário ou doutrina.** Continuam em português (`plan-3.md`, Bloco AC decisão 2).
- **Reescrever comentário que já está no presente e instrui.** Se passa na regra, não se toca — reescrita
  gratuita é risco sem ganho, e cada byte tocado é um byte que o `no-comments-diff` tem de julgar.
- **Os planos da raiz** (`plan.md`, `plan-2*`, `plan-3*`) e o `funcionamento-esperado.md`. São da base,
  não do template, e **registro histórico não se limpa** — é a decisão já tomada no `plan-3.md` §AD.5.
- **Qualquer mudança de comportamento**, inclusive "melhoria óbvia" achada no caminho. Achou? Registra e
  segue. Este plano tem uma propriedade que vale mais que qualquer conserto oportunista: **é reversível
  em bloco, porque não muda código.**
