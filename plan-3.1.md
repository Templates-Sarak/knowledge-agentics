# Plano 3.1 — a verificação prática que ficou pendente

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **O que este plano é.** Quatro regiões que **nenhum verificador cobre hoje** — três que o teste de
> execução real deixou em aberto, e uma (o Bloco AJ) achada ao fechar o `plan-3.md`. Não são defeitos conhecidos — são **regiões não medidas**, que é uma
> categoria diferente e mais desconfortável: ninguém sabe se estão certas.
>
> **O `plan-3.md` está FECHADO** (Bloco AD inteiro, mais AB, AC, AE e AI). Este plano roda agora, e a
> ordem importava por um motivo concreto: a regra do Bloco AH cobra uma convenção de nome que a campanha
> de idioma mudou de `para*` para `to*`. Escrevê-la antes seria escrever a regra errada, com casos que
> precisariam ser refeitos — e agora a convenção está estável.

**Regras herdadas:** as quatro do `plan-3.md`, sem alteração.

> **✅ AS DECISÕES DO DONO ESTÃO TOMADAS — este plano é executável de ponta a ponta.**
>
> | Bloco | Decisão |
> |---|---|
> | **AF** | executar os testes completos |
> | **AG** | executar os testes completos |
> | **AH** | **expandir a validação/cobrança** — a regra do mapeador ENTRA no catálogo (o ramo "Se NÃO" saiu) |
> | **AJ** | **incluir validação** — a saída "declarar e não fazer nada" saiu; sobram `@ts-check` ou ESLint, escolhidos com a medição na mão |
>
> **Só uma coisa volta ao dono:** se o AJ escolher religar o ESLint sobre `tools/**`, isso emenda a
> decisão 4 do ADR-009 e **para** antes de aplicar. Mudança de lei é do dono — precedente registrado no
> `plan-3.md` §AD.3.

---

## Estado — o que não foi medido

| Região | Situação |
|---|---|
| A **camada de skill** do `meta-iniciar-repositorio` | **nunca exercitada** — os dois testes rodaram o *script*, não a skill |
| `migrations` com estado em **JavaScript e Python** | **nunca tocaram um banco** — só o TypeScript foi provado |
| A convenção de nome do mapeador | **descrita na lei, cobrada por ninguém** — três regras dependem dela |
| O §3: *"o gate cobra consistência dentro do projeto"* | **falso** — não existe regra de idioma nem de consistência no catálogo |
| O código de **`tools/**`** (`.mjs`) | **sem lint, sem tipo estático, sem execução garantida** — símbolo inexistente em ramo não exercitado fica verde para sempre (Bloco AJ) |

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

### AH.1 — ✅ **DECIDIDO PELO DONO: SIM — a regra entra no catálogo**

> **Decisão registrada.** *"Vamos expandir a validação/cobrança."* O escape de PII por nome fora da
> convenção **não** vira lacuna declarada: vira regra. O ramo "Se NÃO" está **descartado** e sai do plano.

**A regra mínima, e ela não tem heurística — é por isso que cabe no catálogo:**
- [ ] Em arquivo de mapeador, **toda função exportada** ou segue a convenção de saída (`to<Algo>`) ou a
      de conversão de banco (`<algo>To<Algo>`). Qualquer outro nome exportado ali **reprova**, com a
      mensagem oferecendo os dois consertos que a lei autoriza: **renomeie**, ou **mova para fora do
      mapeador**
- [ ] Fronteira com quem já cobra: ela **não** julga o conteúdo da projeção (isso é `projecao-contrato`)
      nem o caixa (`payload-camelcase`). Julga **só o nome**, e é por isso que não tem heurística
- [ ] Caso próprio nos três bindings, nos dois sentidos — e o chamariz de não-acusação para
      `<algo>To<Algo>`, que é a forma que **precisa calar**
- [ ] **Preço já conhecido, e é fixo:** linha no `04-regras.md` §4.x · caso em `cases.mjs` nos três
      bindings · limite no §7.2 · e o autoteste do gate sobe de 122/122·122/122·119/119 para o número
      novo, nos três
- [ ] **Contraprova que fecha o item, e é a que dá sentido à regra:** o `cpf` publicado por função fora
      da convenção — a medição que abriu este bloco, com o gate dizendo `0 erro(s)` — passa a **reprovar
      nomeando o arquivo e a função**. Cole a saída antes e depois

### AH.2 — o §3, e agora ele tem como virar verdade
- [ ] A frase *"o gate cobra consistência dentro do projeto"* é **reescrita para dizer exatamente o que
      a regra nova cobre** — nome de função exportada em arquivo de mapeador, e nada além. Não a
      generalize para "consistência": seria trocar uma promessa vazia por outra menor, e é a mesma
      classe de defeito que o `plan-2` matou em todo o resto
- [ ] **Diga também o que ela NÃO cobre**, no §7.2: não há regra de idioma nem de consistência de
      nomenclatura fora do mapeador. *Lacuna declarada é aceitável; lacuna escondida não*

---

## Bloco AJ — a região sem rede: `tools/**` *(achado ao fechar o AD.3)*

> **Levantado pelo executor, medido por reinjeção deliberada.** O bug de interpolação de template
> (`` `${nome}.schema.json` `` em JS/TS, `f"{dados['prefixo']}"` em Python) produziu código que
> **compila, roda e passa nos testes** — porque os testes do projeto gerado nascem do mesmo molde
> corrompido e se testam contra si mesmos. Gate verde, Bloco K verde, código errado.
>
> **E a hipótese do revisor caiu na medição.** Eu supus que o `--diferencial` pegaria essa classe. Não
> pega: o token corrompido é cercado por crase, barra, ponto e colchete — **nunca por espaço** —, e é o
> próprio desenho da heurística de prosa que o deixa passar. Quem pegou foi o **tipo estático** do
> Bloco K (`tsc`/`mypy`), que varre TODO arquivo do binding independente de execução; foi assim que o
> defeito do adapter Postgres apareceu.
>
> **O buraco que sobra, e é o item.** Código `.mjs` dentro de `tools/` não tem nenhuma das três redes:
>
> | Rede | Por que não alcança `tools/**` |
> |---|---|
> | Tipo estático | `.mjs` não é TypeScript — não há `tsc` nem `mypy` sobre ele |
> | Lint | `bindings/*/root/eslint.config.js` exclui `tools/**` por decisão (ferramental vendorizado, ADR-009 dec. 4), e não há `no-undef` |
> | Execução | o gate e o Bloco K só exercitam o caminho que algum caso de teste percorre |
>
> Ou seja: **um símbolo inexistente numa ramificação de `tools/` que nenhum caso percorre fica verde
> para sempre.** É a mesma família do que o Bloco AI atacou — verde que não distingue "verificou" de
> "não olhou" —, agora na ferramenta em vez de no dado.

- [ ] **Medir primeiro, decidir depois.** Quantas linhas de `tools/**` nenhum caso de teste percorre
      hoje? Sem esse número a decisão é opinião. `tools/` tem núcleo puro com `--autoteste` em vários
      arquivos (`affected` 19/19, `contract-compatible` 12/12, `apply-rename` 98/98) — a pergunta é o
      que sobra fora deles
- [ ] ✅ **DECIDIDO PELO DONO: entra validação.** *"Devemos incluir validação."* A saída *(c)* — declarar
      a lacuna no §7.2 e não fazer nada — está **descartada**. Sobram duas, e a escolha entre elas é
      técnica, **feita com o número da medição acima na mão**, não antes:
      *(a)* `// @ts-check` + JSDoc nos `.mjs` de `tools/` — dá tipo estático sem virar TypeScript, e é a
      **única que alcança ramo não executado**, que é exatamente o buraco medido;
      *(b)* religar o ESLint sobre `tools/**` só com `no-undef`/`no-unused-vars` — mais barato, pega
      símbolo inexistente, mas **contradiz a decisão 4 da fronteira**
- [ ] ⚠️ **Se a escolha for (b), PARE e volte ao dono antes de aplicar.** Ela exige emenda ao ADR-009
      decisão 4 (*"ferramental vendorizado — o dono é outro repositório"*, e é por isso que `tools/**`
      é isento do linter hoje). **Mudança de lei é do dono, não do executor** — é o precedente registrado
      no `plan-3.md` §AD.3, onde a decisão 8 foi emendada unilateralmente. A (a) não tem esse problema:
      não mexe em nenhuma decisão da fronteira
- [ ] **Se sair (a) ou (b):** contraprova por reversão — introduza um símbolo inexistente num ramo de
      `tools/` que nenhum caso percorre e exija que a rede nova o acuse **nomeando arquivo e linha**.
      É o teste que distingue rede de cerimônia
- [ ] **Fronteira com o que já existe:** isto **não** é o `padrao-limiares` nem o gate. O gate julga o
      código do *usuário*; isto é sobre o código da *ferramenta*, que hoje ninguém julga — e a ferramenta
      é o que viaja dentro de todo módulo extraído

---

## Ordem de dependência

```
(plan-3.md fechado)

AF   a camada que nunca rodou    independente — pode ir primeiro, e é a que mais
                                 provavelmente acha alguma coisa

AG   migrations em JS e Python   independente · precisa de Docker

AH   a convenção + o §3          DEPOIS do plan-3.md, porque a convenção que ela
                                 cobra vira `to*` lá. AH.1 é decisão do dono
                                 — o plan-3 fechou, então AH está liberado

AJ   a região sem rede           independente · MEDIR antes de decidir. Achado ao
     em `tools/**`               fechar o AD.3, com a hipótese do revisor sobre o
                                 `--diferencial` derrubada por medição
```

---

## Fora deste plano

- **DAST, carga, e qualquer teste que precise de ambiente publicado** — não é deste template.
- **Reexecutar o teste de ponta a ponta a cada rodada** — o Bloco K já faz o que dá para automatizar; o
  resto é verificação humana e entra por decisão, não por rotina.
