# Plano 3.1 — a verificação prática que ficou pendente

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **O que este plano é.** Três coisas que o teste de execução real deixou em aberto e que **nenhum
> verificador cobre hoje**. Não são defeitos conhecidos — são **regiões não medidas**, que é uma
> categoria diferente e mais desconfortável: ninguém sabe se estão certas.
>
> **Roda DEPOIS do `plan-3.md`**, e por um motivo concreto: a regra do Bloco AH cobra uma convenção de
> nome que a campanha de idioma muda de `para*` para `to*`. Escrevê-la antes seria escrever a regra
> errada, com casos que precisariam ser refeitos.

**Regras herdadas:** as quatro do `plan-3.md`, sem alteração.

> **Este documento tem UMA decisão em aberto, e ela é do dono** — o Bloco AH. As outras duas são
> verificação pura, sem escolha de desenho.

---

## Estado — o que não foi medido

| Região | Situação |
|---|---|
| A **camada de skill** do `meta-iniciar-repositorio` | **nunca exercitada** — os dois testes rodaram o *script*, não a skill |
| `migrations` com estado em **JavaScript e Python** | **nunca tocaram um banco** — só o TypeScript foi provado |
| A convenção de nome do mapeador | **descrita na lei, cobrada por ninguém** — três regras dependem dela |
| O §3: *"o gate cobra consistência dentro do projeto"* | **falso** — não existe regra de idioma nem de consistência no catálogo |

---

## Bloco AF — a camada que nunca rodou

> O teste real rodou `init_repo.py` direto. Ficaram de fora a **entrevista HITL**, o **plano com
> `⚠️ Confirma?`**, o **handoff**, e a **`code-modulo`** para o segundo módulo. Ou seja: a prosa que
> orquestra tudo isso nunca foi executada contra o script que ela chama — e o script mudou muito
> (composição do `pre-commit`, criação do diretório-alvo, guards de raiz/HOME).
>
> **É a metade do fluxo que o usuário realmente usa**, e é a única sem nenhuma prova.

- [ ] Rodar **`/sarak:meta-iniciar-repositorio` de verdade**, num alvo novo, respondendo a entrevista
- [ ] Acrescentar o segundo módulo pela **skill `code-modulo`**, não pelo `criar-modulo.mjs` direto
- [ ] **Diferenciar a árvore** contra a que o script produz sozinho. Divergência é uma de duas coisas, e
      as duas importam: prosa desatualizada em relação ao script, ou passo que a skill faz e o script
      não sabe fazer
- [ ] Conferir o que só a skill entrega: ADRs do projeto registrados, pendências de HITL comunicadas,
      engate do `spec-fundacao` e do `git-commit-inicial`
- [ ] **Limite a declarar:** este bloco é verificação **humana/agente**, não automatizável — a entrevista
      é conversa. O que dá para automatizar é a **comparação de árvore**, e é só isso que vira script

---

## Bloco AG — as migrations nos outros dois bindings

> O Bloco Y do `plan-2.2` reescreveu os três runners para ter estado (tabela de controle por módulo,
> `up` que pula o aplicado, `down` que reverte o último). **Só o `migrations.mjs` do TypeScript foi
> provado contra Postgres real.** O de JavaScript e o `migrations.py` têm o mesmo desenho novo e nenhum
> deles tocou um banco.
>
> **E o Bloco K não cobre, por decisão:** ele não tem banco. Então hoje ninguém roda.

- [ ] Postgres efêmero em Docker, e o ciclo completo nos **dois bindings restantes**:
      `up` → `up` (tem de dizer *"nada pendente"*, não falhar) → `down` → `up` → `ciclo`
- [ ] Conferir no banco: as tabelas do molde, o **índice**, o `unique`, o **RLS ligado**, e a tabela de
      controle **declarada em `dados.tabelas`** — foi essa declaração que manteve `tabela-declarada` e
      `tabela-alheia` sem exceção
- [ ] **Onde isto passa a rodar sempre.** Hoje é manual. Ou vira passo do pipeline de CI (a linha de
      "minutos" do §7 já reserva o lugar, e é onde `service container` existe), ou fica declarado como
      *"provado uma vez, não recorrente"* — e a segunda é honesta, mas é dívida. **Decidir e registrar**

---

## Bloco AH — a convenção de nome, e o §3 que promete o que não existe

> **O defeito, e é de segurança.** Três regras — `projecao-contrato`, `payload-camelcase`,
> `sensivel-em-saida` — só enxergam funções cujo nome segue a convenção do mapeador. Depois do
> `plan-3.md` essa convenção é `to*` (resposta) × `*To*` (banco).
>
> **A doutrina descreve a convenção; nada a cobra.** Um projeto que chame a função de `buildResponse`,
> `serialize` ou `toJSON` escapa das três — **inclusive da que impede vazar PII**. Já medi essa classe:
> um `cpf` publicado por função fora da convenção sai com o gate dizendo `0 erro(s)`.
>
> **E o §3 do `04-regras.md` afirma:** *"o gate cobra **consistência dentro do projeto**, não a
> escolha"*. **Não cobra.** Não existe regra de idioma nem de consistência no catálogo — a mais próxima
> é `rota-nomenclatura`, que julga kebab-case e verbo em rota, não idioma. É declaração sem verificador
> dentro da própria lei.

### AH.1 — a decisão que é do dono
- [ ] **Vale uma regra nova no catálogo para fechar o escape de PII por nome fora da convenção?**
      O preço é fixo e conhecido: linha em `04-regras.md` §4.x · caso próprio em `casos.mjs` **nos três
      bindings** · limite no §7.2. É a única pergunta em aberto desta família

**Se SIM — a regra mínima, e ela não tem heurística:**
- [ ] Em arquivo de mapeador, **toda função exportada** ou segue a convenção de saída (`to<Algo>`) ou a
      de conversão de banco (`<algo>To<Algo>`). Qualquer outro nome exportado ali **reprova**, com a
      mensagem oferecendo os dois consertos que a lei autoriza: **renomeie**, ou **mova para fora do
      mapeador**
- [ ] Fronteira com quem já cobra: ela **não** julga o conteúdo da projeção (isso é `projecao-contrato`)
      nem o caixa (`payload-camelcase`). Julga **só o nome**, e é por isso que não tem heurística
- [ ] Caso próprio nos três bindings, nos dois sentidos — e o chamariz de não-acusação para
      `<algo>To<Algo>`, que é a forma que **precisa calar**

**Se NÃO:**
- [ ] O escape vira **linha no §7.2**, escrita com a forma exata que escapa e com a medição — no padrão
      das outras lacunas declaradas. *Lacuna conhecida é aceitável; lacuna escondida não*

### AH.2 — o §3, de qualquer forma
- [ ] A frase *"o gate cobra consistência dentro do projeto"* **sai ou vira verdade**. Hoje ela promete
      um verificador que não existe, e é a mesma classe de defeito que o `plan-2` matou em todo o resto.
      Se AH.1 for **sim**, a regra nova cobre uma parte e a frase é reescrita para dizer **exatamente**
      o que ela cobre. Se for **não**, a frase sai

---

## Ordem de dependência

```
(plan-3.md fechado)

AF   a camada que nunca rodou    independente — pode ir primeiro, e é a que mais
                                 provavelmente acha alguma coisa

AG   migrations em JS e Python   independente · precisa de Docker

AH   a convenção + o §3          DEPOIS do plan-3.md, porque a convenção que ela
                                 cobra vira `to*` lá. AH.1 é decisão do dono
```

---

## Fora deste plano

- **DAST, carga, e qualquer teste que precise de ambiente publicado** — não é deste template.
- **Reexecutar o teste de ponta a ponta a cada rodada** — o Bloco K já faz o que dá para automatizar; o
  resto é verificação humana e entra por decisão, não por rotina.
