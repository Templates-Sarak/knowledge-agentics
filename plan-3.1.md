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

> ## ⚠️ A regra que governa os Blocos AF e AG: **isto é TESTE, não instalação**
>
> **O objetivo não é obter um repositório funcionando — é obter um VEREDITO sobre se a instalação
> acontece como esperado.** O artefato produzido é descartável; o que se entrega é a medição.
>
> **Três consequências, e nenhuma é negociável:**
>
> 1. **Nada se conserta no caminho.** Divergência entre o que a skill/script faz e o que deveria fazer
>    é **defeito**, e defeito se registra e se conserta **na origem** — na skill, no script, no molde.
>    Contorno local ("ajustei aqui e segui") é a única coisa que este teste não pode produzir: o
>    template vai ser reusado dezenas de vezes, e o contorno não viaja junto — **o defeito viaja.**
> 2. **O executor não ajuda a skill.** Responda a entrevista como um usuário normal responderia, com
>    respostas plausíveis. Onde a skill perguntar algo ambíguo, pedir o que já sabe, ou fizer o passo
>    errado, **isso É o achado** — não é algo a suavizar respondendo "do jeito que ela espera".
> 3. **Conserto na origem obriga a REEXECUÇÃO DO ZERO.** Consertou? Descarte o alvo e rode de novo,
>    limpo. Consertar no meio e seguir valida um caminho que nenhum usuário vai percorrer — e o que
>    interessa é justamente o caminho do primeiro uso.
>
> **O critério de sucesso não é "o repositório subiu".** É: *um usuário que só responde a entrevista,
> sem saber nada do que está por baixo, chega ao primeiro commit verde sem intervenção fora do roteiro.*
> Qualquer intervenção que ele não teria como fazer sozinho é defeito, mesmo que o resultado final
> funcione.

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

- [x] Rodar **`/sarak:meta-iniciar-repositorio` de verdade**, num alvo novo, respondendo a entrevista
      **como usuário**, não como quem conhece o script por dentro
- [x] Acrescentar o segundo módulo pela **skill `code-modulo`**, não pelo `criar-modulo.mjs` direto
- [x] **O DIÁRIO DA EXECUÇÃO é entregável, e vale tanto quanto a árvore.** Registre, na ordem em que
      acontecerem: cada pergunta feita, cada resposta dada, cada momento em que você **soube** o que
      responder por conhecer o interno — esse é o ponto exato onde um usuário real teria travado —, e
      cada intervenção fora do roteiro. **Intervenção fora do roteiro é DEFEITO**, mesmo que o resultado
      final funcione
- [x] **Conserto na origem, e reexecução do zero.** Achou defeito? Conserte na skill/script/molde,
      **descarte o alvo** e rode de novo limpo. O aceite é a execução **sem nenhum conserto no meio** —
      a que ainda tiver conserto no meio não é a execução que fecha o bloco
- [x] **Diferenciar a árvore** contra a que o script produz sozinho. Divergência é uma de duas coisas, e
      as duas importam: prosa desatualizada em relação ao script, ou passo que a skill faz e o script
      não sabe fazer
- [x] Conferir o que só a skill entrega: ADRs do projeto registrados, pendências de HITL comunicadas,
      engate do `spec-fundacao` e do `git-commit-inicial`
- [x] **Limite a declarar:** este bloco é verificação **humana/agente**, não automatizável — a entrevista
      é conversa. O que dá para automatizar é a **comparação de árvore**, e é só isso que vira script

> **Achado pendente de decisão do dono — NÃO consertado.** `init_repo.py:criar_modulos()` tem duas
> facetas do mesmo problema, e são a mesma causa: o atalho em lote (`--modulos <id> [<id>...]`) não
> pergunta nada, então **chuta** o que a entrevista da `code-modulo` pergunta de verdade.
>
> ```python
> papel = "conector" if modulo == "conector" else "dominio"
> ```
>
> 1. **`--sem-artefato` nunca é passado** — todo módulo criado em lote sai com `generatesArtifact: true`,
>    mesmo um `conector` (medido no Bloco AF: `core/engine`, `core/templates`, a tabela de migration do
>    artefato e `generated/.gitkeep` sobram no `conector` só-script, ausentes no `conector` da skill).
> 2. **O papel é adivinhado pelo NOME do id, não perguntado.** Só `id == "conector"` vira `conector`;
>    qualquer outro id — inclusive um claramente `gateway`, como `gateway-pagamentos` — sai com
>    `role: dominio` em silêncio, sem erro, sem aviso.
>
> **A conclusão que falta tomar:** ou o atalho em lote passa a perguntar (papel + geraArtefato) por
> módulo, tornando-se um Fluxo B de verdade só sem HITL, ou o script **declara explicitamente** — na
> ajuda do `--modulos` e no `SKILL.md` — que ele entrega só o default (`dominio`, com artefato) e nada
> além disso, e que qualquer módulo `gateway`/`conector`/sem-artefato criado em lote precisa ser
> corrigido à mão depois. As duas são consertos legítimos; qual delas é **decisão de desenho do atalho**,
> não do executor.

---

## Bloco AG — as migrations nos outros dois bindings

> O Bloco Y do `plan-2.2` reescreveu os três runners para ter estado (tabela de controle por módulo,
> `up` que pula o aplicado, `down` que reverte o último). **Só o `migrations.mjs` do TypeScript foi
> provado contra Postgres real.** O de JavaScript e o `migrations.py` têm o mesmo desenho novo e nenhum
> deles tocou um banco.
>
> **E o Bloco K não cobre, por decisão:** ele não tem banco. Então hoje ninguém roda.

- [x] Postgres efêmero em Docker, e o ciclo completo nos **dois bindings restantes**:
      `up` → `up` (tem de dizer *"nada pendente"*, não falhar) → `down` → `up` → `ciclo`
- [x] Conferir no banco: as tabelas do molde, o **índice**, o `unique`, o **RLS ligado**, e a tabela de
      controle **declarada em `dados.tabelas`** — foi essa declaração que manteve `tabela-declarada` e
      `tabela-alheia` sem exceção
- [x] **Onde isto passa a rodar sempre.** Decidido: vira passo de CI (`.github/workflows/autoteste-template.yml`,
      job `verificar-migrations`, novo — service container `postgres:16-alpine`, os dois bindings). O
      YAML valida (`yaml.safe_load`) e os comandos são a tradução literal do que rodou manualmente
      contra o Postgres efêmero, mas isso é o desenho, **não a prova** — a decisão fica
      **PENDENTE DE PROVA até o primeiro `workflow_dispatch` real**, mesma classe de "verde neste
      worktree não vale": um YAML que nunca disparou é tão não-medido quanto um script que nunca rodou

> **Achado — É a campanha, rastreado por commit.** `scripts/migrations.py` tinha `--autoteste`
> **quebrado desde sempre**: as quatro funções de fixture devolviam a chave `"name"` (inglês) e as
> quatro leituras em `_run_selftest()` liam `caso['nome']` (português) — `KeyError: 'nome'` na primeira
> linha, sempre. `git blame` por commit: `b8d64fb` (AD.1) 0 ocorrências · `3d98906` (AD.2) 0 ·
> **`0b657e9` (AD.3) 14** · `cee117c` 0. **É o AD.3** — `nome→name` é a chave nº 1 das 19 do rename de
> manifesto, e o rename varreu esta fixture de teste (um dicionário Python solto, não um `module.json`)
> junto, sem checar se o alvo era manifesto de verdade.
>
> **A causa generalizável, e é o que vale guardar:** o mesmo rename bateu nos dois runners irmãos, com
> sintaxes diferentes e resultado oposto:
> | Binding | Sintaxe da chave | O que aconteceu |
> |---|---|---|
> | JavaScript (`migrations.mjs`) | `nome: '...'` — chave **NUA** (identificador, sem aspas) | o rename **recusou** — o tipo `chave` do inventário só troca string entre aspas, e uma chave nua não bate no padrão. Protegido **por acidente**: a regra existe por outro motivo (distinguir chave de manifesto de string solta), não para blindar fixture de teste |
> | Python (`migrations.py`) | `"name": "..."` — string **entre aspas**, sintaxe idêntica à de uma chave de manifesto de verdade | o rename **trocou** — nada no `chave` distinguia "isto é uma fixture de teste" de "isto é `module.json`" |
>
> **Não é falha do executor nem contorno: é limite conhecido do tipo `chave` do inventário de rename,
> e agora está medido** — ele generaliza mal quando o mesmo texto (`"nome"`) aparece em dois lugares
> com significado diferente (manifesto vs. dado de teste) e só um dos dois tem proteção sintática.
>
> **Raio já medido (pelo revisor, não refeito aqui):** os 14 pontos de `--autoteste` do template —
> todos verdes, exceto `composicao.py` (só roda dentro de projeto instanciado, não é achado). O raio
> deste defeito é **um arquivo só**, `migrations.py`, e está consertado.
>
> **Conserto na origem:** as 14 ocorrências de `"name":` viraram `"nome":` — alinha com as 4 leituras
> E com o runner irmão (`migrations.mjs` usa `nome` nos mesmos casos, já provado contra Postgres real
> no TypeScript). Reexecutei do zero (descartei o alvo, rodei `init_repo.py` de novo) antes de repetir
> o ciclo contra o banco — a mesma disciplina do AF. `--autoteste` 14/14 depois do conserto, confirmado
> também pelo revisor direto no container.

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
- [x] Em arquivo de mapeador, **toda função exportada** ou segue a convenção de saída (`to<Algo>`) ou a
      de conversão de banco (`<algo>To<Algo>`). Qualquer outro nome exportado ali **reprova**, com a
      mensagem oferecendo os dois consertos que a lei autoriza: **renomeie**, ou **mova para fora do
      mapeador**. Implementada em `tools/gate/rules/contract.mjs` como `mapeador-nomenclatura`
- [x] Fronteira com quem já cobra: ela **não** julga o conteúdo da projeção (isso é `projecao-contrato`)
      nem o caixa (`payload-camelcase`). Julga **só o nome**, e é por isso que não tem heurística
- [x] Caso próprio nos três bindings, nos dois sentidos — e o chamariz de não-acusação para
      `<algo>To<Algo>`, que é a forma que **precisa calar**. 4 casos novos em `cases.mjs`: positivo
      (`buildResponse`), a forma `export const` (TS/JS), e os dois chamarizes (saída `to<Algo>` e banco
      `<algo>To<Algo>` acrescentados por MUTAÇÃO nova, não só o molde intocado)
- [x] **Preço já conhecido, e foi exatamente esse:** linha no `04-regras.md` §4.5 (mais o conserto do
      `para*`/`para_*` obsoleto na descrição de `projecao-contrato` — resíduo do AD.2, achado no
      caminho) · 4 casos em `cases.mjs` (2 exigiram `tambem` em casos JÁ existentes que usavam nome fora
      da convenção como controle negativo — `naoPublica`, `logarChamariz` — porque agora são co-achados
      LEGÍTIMOS) · limite no §7.2 · autoteste do gate: **122/122·122/122·119/119 → 126/126 (typescript) ·
      126/126 (javascript) · 122/122 (python)**, 75 regras com caso (era 74), zero `FALHA` nos três
- [x] **Contraprova que fecha o item:** reproduzida em `C:\tmp\ah-cpf-repro` — `cpf` publicado por
      `buildResponse` (fora da convenção). **Antes** (`contract.mjs` do HEAD, sem a regra):
      ```
      clientes: 0 erro(s), 0 aviso(s)
      conformidade: OK — 1 modulo(s) + a raiz, 0 erro(s)
      ```
      **Depois** (com `mapeador-nomenclatura`):
      ```
      clientes: 1 erro(s), 0 aviso(s)
        x [mapeador-nomenclatura] api/src/mappers/index.ts: funcao exportada "buildResponse" nao segue
        a convencao do mapeador (saida: to<Algo>/to_<algo>; banco: <algo>To<Algo>/<algo>_to_<algo>) —
        renomeie, ou mova esta funcao para fora do mapeador
      conformidade: REPROVADO — 1 erro(s)
      ```

### AH.2 — o §3, e agora ele tem como virar verdade
- [x] A frase *"o gate cobra consistência dentro do projeto"* foi **reescrita para dizer exatamente o
      que a regra nova cobre** — nome de função exportada em arquivo de mapeador, e nada além. Não virou
      "consistência" genérica: o parágrafo agora nomeia `mapeador-nomenclatura` e para por aí
- [x] **O que ela NÃO cobre está declarado no §7.2 e no corpo do §3**: não há regra de idioma nem de
      consistência de nomenclatura fora do mapeador — a mais próxima segue sendo `rota-nomenclatura`
      (kebab-case e verbo em rota, nunca idioma). Método de classe/propriedade de objeto também
      declarado fora, com o exemplo (`chaveDeCache`) que já vive em `cases.mjs`

---

## Bloco AJ — mudou de escopo ao fechar o AH: dois itens, não um

### AJ.0 — o corte por identificador distintivo *(achado ao fechar o AH — três resíduos do AD.2
que a leitura achou e a varredura não, mais um quarto no `padrao-python` que nem tinha sido tocado)*

> **A dúvida que o AD.4 fechou como opção B era real, mas mal recortada.** `--depois` cru afirma
> "zero ocorrência de nome antigo" — inalcançável: `raiz` sozinho eram 407/1863, e a mesma palavra é
> prosa legítima **dentro** do escopo, não só fora. O corte proposto **não** escopa por caminho (o
> mesmo erro medido em 360 falsos positivos na Rodada AB) — escopa pela **forma do nome antigo**:
> camelCase interno, `snake_case`, extensão de arquivo ou hífen é **identificador distintivo**;
> palavra comum do léxico português nunca é.

- [x] `distintivo(nome)` implementada em `verify-citations.mjs` (núcleo puro, `--autoteste` prova)
- [x] **Medido contra o inventário e o corpus reais, não só proposto:** 271/330 itens do inventário
      são distintivos · 4508 achados brutos de `--depois` → **308** sobrevivem ao corte, em **~65
      arquivos** — `rotaBase` (47×), `lerTexto` (43×), `envRequerido` (36×), `rodarAutoteste` (21×),
      `modulo.json` (15×), `geraArtefato` (14×)... ~93% do bruto era ruído de palavra comum
- [x] **`--depois-estrito [--gravar-linha-base]`** implementado, com linha de base versionada —
      `tests/citation-baseline.json`, mesma disciplina de `rename-refusals.json` (Bloco AI): cresce só
      por decisão explícita, achado novo reprova nomeando arquivo e linha
- [x] **Corte 2, acrescentado por você ao aprovar o primeiro passe:** `distintivo` sozinho ainda
      contava `lerTexto`/`rodarAutoteste`/`envRequerido` DENTRO de `tools/`/`tests/` — símbolo que
      está exatamente onde a decisão 4 da fronteira manda ficar em português, não resíduo. Reusei
      `itemAplicaAoArquivo` (`apply-rename.mjs`) — item tipo `simbolo` só conta em `bindings/` +
      `doutrina/` + docs vivas da raiz, a MESMA fronteira que a campanha de rename já usa. Medido:
      **177 das 308/317 saíam — 56%.** Linha de base final, depois dos dois cortes e das citações da
      própria prosa de documentação (mesma classe, instância hipotética): **200 achados.**
      **Resultado hoje: VERDE contra a linha de base** — não nasce vermelho
- [x] **Contraprova nos dois sentidos, para os dois cortes:** `paraContrato` numa linha de
      `04-regras.md` (fora do escopo excluído) → reprova nomeando arquivo:linha; `resolverDependencias`
      em `tools/affected.mjs` (dentro do escopo excluído pelo corte 2) → **não aparece**, nem como
      achado nem como alerta. Os dois revertidos → `0 achados novos, exit 0`
- [x] Registrado em `04-regras.md` §7.2, com os dois cortes e os números, ao lado do parágrafo da
      opção B — nenhum dos dois a reabre: o argumento dela vale para palavra comum, nunca para
      identificador. Declarado também o que os dois **não** fecham: identificador que também é
      palavra de dicionário (`dominio`) fica de fora — capturar por contexto reabriria o mesmo
      problema dos 360/407
- [x] **Um resíduo consertado no caminho** (não parte da campanha, achado ao investigar):
      `skills/padrao-python/references/idioms.md` ainda citava `mapeadores.py`/`modulo.json:consome`
- [x] **Correção ao relatório anterior, não ao artefato:** eu tinha atribuído os +2 achados de uma
      rodada de gravação a "deslocamento de linha" — errado. O deslocamento (`ci-security.mjs`,
      204→205, 205→206) somava zero; os +2 eram duas citações NOVAS em `tests/run-all-selftests.mjs`
      (arquivo que eu tinha acabado de criar). A ação (aceitar) estava certa — `rodarAutoteste` em
      `tests/` fica em português pela decisão 4, igual a `tools/`; o motivo que citei, não
- [x] **NÃO ataquei os 200/305/317 restantes** — decisão do dono: entram como entrada dos Blocos BB/BC
      do `plan-3.0`, que já vão reescrever exatamente esses arquivos. Zero rodada extra aqui.

### AJ.1 — a região sem rede: `tools/**` *(achado ao fechar o AD.3, escopo original deste bloco)*

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

- [x] **Medido primeiro, com `c8`/V8 coverage de verdade** (não estimativa): rodei TODOS os
      `--autoteste` de `tools/**` (`affected` 19/19, `ci-dependencies` 19/19, `ci-security` 12/12,
      `contract-compatible` 12/12, `package` 5/5, `verify-commit` 6/6), o autoteste do gate nos 3
      bindings (126/126·126/126·122/122) e o Bloco K completo (13/13×3), sob `NODE_V8_COVERAGE`.
      Resultado: **10198 linhas em `tools/**`, 9135 cobertas — 1063 NUNCA executadas por nada disso
      (10,4%)**; 586 funções, 496 cobertas — **90 nunca chamadas**. O pior arquivo:
      `package.mjs` — **45,51% de linhas, só 22,22% das funções** cobertas
- [x] **Decisão: (a), `// @ts-check`-equivalente via `checkJs`** — não (b). Com o gap medido em mãos,
      (a) é a única que alcança ramo não executado (a pergunta que abriu o bloco), e não mexe em
      nenhuma decisão da fronteira — não precisei voltar ao dono
- [x] **Implementado como `checkJs` + `tsconfig.tools-check.json`** (não JSDoc por função): com
      `noImplicitAny: false, strict: false`, `tsc` pega `TS2304 Cannot find name` — símbolo
      inexistente, em QUALQUER ramo — sem exigir anotar tipo em cada função das 29. Medido: molde
      limpo, **zero erros** nas 29; 2 achados reais de tipagem (não bugs de runtime, mas heurística
      correta) consertados no caminho — `VOCABULARIO_VALOR` sem tupla explícita (`ci-security.mjs`) e
      `causa.code` em `Error` sem o tipo estendido (`gate/tests/run.mjs`, 2×)
- [x] **Contraprova por reversão:** símbolo inexistente injetado em `acharRaizProjeto`
      (`package.mjs`, 0% de cobertura de função) — `package.mjs --autoteste` continua **verde** (não
      alcança), `npm run typecheck:tools` **acusa nomeando arquivo:linha**. Revertido, limpo
- [x] **`npm run typecheck:tools`** — novo script, `tsc --project tsconfig.tools-check.json`

### AJ.1b — o achado do AG generalizado: `--autoteste` que nada invoca *(acrescentado por decisão do
dono ao aprovar o AJ.0)*

> **Não é só `tools/**`.** `migrations.py` ficou com `--autoteste` quebrado por dois commits, gate
> verde, Bloco K verde — porque nada no template roda `--autoteste` de ninguém automaticamente.
> `--autoteste` que ninguém invoca é indistinguível de não existir, e mais caro: alguém confiou nele.

- [x] **Medido, não só um exemplo:** 13 arquivos com `--autoteste` de verdade em `tools/**`,
      `tests/**` e `bindings/<binding>/root/**` — só `autoteste:template` (Bloco K) e
      `verificar:citacoes:*` estavam wired (npm script ou CI). **11 dos 13 eram órfãos**, inclusive o
      próprio `--autoteste` (núcleo puro) do `template-self-test.mjs` — o DRIVER do Bloco K tem um
      modo interno que nem o Bloco K aciona
- [x] **`tests/run-all-selftests.mjs`** — novo, por DESCOBERTA (varre `tools/**`, `tests/**`,
      `bindings/<binding>/root/**` atrás do padrão `--autoteste` em posição de comparação de CLI, não
      menção em prosa), comparado contra um REGISTRO explícito: achado sem entrada no registro é
      **ÓRFÃO e reprova sozinho**, antes de rodar qualquer teste — a mesma lista não pode apodrecer
      como o problema que resolve. `composicao.py` fica declarado FORA (só roda dentro de projeto
      instanciado), não escondido
- [x] **Contraprova dupla:** (1) `--autoteste` de `affected.mjs` corrompido de propósito → `FALHA`
      nomeando o caso; revertido → 13/13. (2) arquivo novo com `--autoteste` criado em `tools/` →
      `ÓRFÃO` acusado antes de rodar nada; removido → 13/13
- [x] **`npm run autoteste:tudo`** — novo script. Os dois (`typecheck:tools` primeiro,
      `autoteste:tudo` depois — ambos em segundos, sem scaffold) entram em
      `.github/workflows/autoteste-template.yml`, antes do Bloco K (que custa minutos)

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
