# Plano 2.1 — o projeto gerado se explica sozinho

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **O que este plano é.** O `plan-2.md` fechou com 121 itens e respondeu *"o padrão se sustenta quando o
> template é usado N vezes?"* — verificação. Este responde a pergunta seguinte, que só aparece quando
> alguém **usa** o resultado: **"o repositório gerado consegue se explicar a quem chega nele?"**
>
> Três dos quatro blocos são sobre o que o **projeto gerado** sabe sobre si mesmo. O quarto é o único
> defeito de comportamento, e é no caminho de entrada — o `meta-iniciar-repositorio`.
>
> **O gatilho foi uma observação do dono:** *"as skills do plugin não viajam com o repositório."* Está
> certo, e é a raiz de dois dos quatro blocos: hoje a lei instalada aponta para skills que o projeto
> não tem, e o manual do diretório fica na base.

**Regras herdadas, e continuam valendo:**
- **Regra permanente do `plan-2`:** todo bloco que toca esqueleto ou ferramenta só fecha com o **Bloco K
  verde nos três bindings**.
- **Regra permanente do `plan.md`:** regra nova exige caso próprio em `casos.mjs` e linha no catálogo
  (§4.x), mais o limite no §7.2. *(Nenhum bloco deste plano acrescenta regra.)*
- **Quem marca ITEM é o executor; quem marca BLOCO é o revisor.**
- **Citação é por `§`, nunca por número de linha.**

> **Este documento é executável de ponta a ponta.** A única decisão de desenho que existia — a ordem de
> preenchimento de um módulo — foi **tomada pelo dono** e está no Bloco V, com a recusada registrada.

---

## Estado — medido, com o comando ao lado

| Métrica | Valor | Confira com |
|---|---|---|
| `plan-2.md` | **121 itens fechados · 1 aberto** (candidata de catálogo) | `grep -c '^- \[x\]' plan-2.md` |
| Autoteste do gate | `122/122` · `122/122` · `119/119`, 74 regras | `node ferramentas/gate/testes/executar.mjs --binding <b>` |
| Bloco K | 11 passos, 3 bindings | `npm run autoteste:template` |
| **`pre-commit` sobrevive ao `meta-iniciar-repositorio`?** | **NÃO — sobrescrito** | Bloco T |
| **A lei instalada tem índice?** | **NÃO — 1.741 linhas, zero mapa** | Bloco U |
| **`01-modulo.md` §8 concorda consigo mesma?** | **NÃO** | Bloco V |
| `funcionamento-esperado.md` reflete o Bloco S? | **NÃO — 3 linhas** | Bloco W |

**Meta ao fim:** um agente (ou uma pessoa) que abre o repositório gerado, **sem o plugin `sarak`**,
encontra em `specs/arquitetura/` o que fazer e em que ordem — e o `pre-commit` cobra as duas coisas que
ele deve cobrar.

---

## O que este plano NÃO faz

- **Não acrescenta regra ao catálogo.** As 74 continuam 74. O único item que acrescentaria regra — a
  convenção de nome do mapeador — segue aberto no `plan-2.md` e é decisão de catálogo.
- **Não escreve conteúdo normativo novo.** O Bloco U instala um **índice**; o Bloco V **corrige** uma
  contradição dentro de uma seção que já existe. Nenhum dos dois inventa lei.
- **Não mexe no gate.** Nenhum arquivo de `ferramentas/gate/` é tocado.

---

## Bloco T — o `pre-commit` composto, não sobrescrito

> **O defeito, e é o único deste plano que pode morder em produção.**
> `skills/meta-iniciar-repositorio/scripts/init_repo.py`, em `instalar_hooks_git`:
>
> ```python
> caminho_hook = githooks / "pre-commit"
> caminho_hook.write_text(HOOK_PRE_COMMIT, encoding="utf-8")   # sobrescreve, sem ler
> ```
>
> O passo 2 do fluxo instala o `.githooks/pre-commit` do **template** (gate de conformidade nos módulos
> afetados + env + schemas + formato + lint). O passo 6 o **sobrescreve** com o dele (gate de segredos +
> auto-índice de `.agents/`). O `pre-push` sobrevive; só o `pre-commit` colide.
>
> **A skill sabe disso e conserta em prosa:** o Handoff manda o agente rodar um heredoc Python que
> recompõe os dois. Isso é um passo manual, sem verificador, num fluxo que existe para deixar o
> repositório pronto. Se o agente pular — ou se a prosa derivar —, o projeto fica **só com o gate de
> segredos** e perde a cobrança de conformidade no commit, **em silêncio**.
>
> É a classe que o `plan-2` eliminou em todo o resto: *declaração sem verificador*. E a própria skill
> enuncia a lei que ela viola — *"o script só acrescenta ou mescla"*.

- [ ] **`instalar_hooks_git` passa a COMPOR**: lê o `pre-commit` existente e acrescenta o que falta, em
      vez de escrever por cima. Ordem: **segredo primeiro** (fail-closed, é o estágio 0), **conformidade
      depois**. Idempotente — rodar duas vezes não duplica linha
- [ ] **Núcleo puro + `--autoteste`, no precedente de toda ferramenta deste ecossistema**
      (`afetados.mjs`, `ci-seguranca.mjs`, `contrato-compativel.mjs`): `compor_pre_commit(existente,
      nosso) -> str` é **pura**, não toca disco, e tem caso para os quatro estados:
      *(a)* não existe → escreve o nosso · *(b)* existe só o do template → compõe os dois ·
      *(c)* existe só o nosso → acrescenta a cadeia do template · *(d)* já tem os dois → **não muda nada**
- [ ] **O heredoc SAI da skill.** Com o script compondo, o passo 6 do Handoff deixa de existir — e o
      checklist deixa de pedir ao agente que confirme algo que o script garante. *Passo manual que o
      script pode fazer é passo que uma hora não vai ser feito*
- [ ] **O `--chmod=+x` cobre os DOIS hooks.** A skill hoje cita só o `pre-commit`; o `pre-push` tem o
      mesmo problema no Windows com `core.filemode=false`, e o `criar-projeto.mjs` já imprime os dois
- [ ] **Trava por máquina, e ela não é o Bloco K.** O K exercita o **template**, não a skill — ele nunca
      roda `init_repo.py`. A trava é o `--autoteste` do item acima, mais uma verificação no passo 5 da
      skill: `grep -c "verificar-commit.mjs" <alvo>/.githooks/pre-commit` **e**
      `grep -c "verificar_commit.py"` — os dois têm de dar 1

**Critério de aceite:** rodar o fluxo completo num alvo limpo e num alvo que já tem `pre-commit` produz,
nos dois casos, um hook com as **duas** partes, na ordem certa, executável. **Limite a declarar:** o hook
segue opt-in por clone (`core.hooksPath` é config local) e `--no-verify` fura — é o §7 do
`funcionamento-esperado.md`, e este bloco não muda isso.

---

## Bloco V — a lei que se contradiz numa linha

> **Medido.** `01-modulo.md` §8 escreve a ordem de preenchimento assim:
>
> ```
> core/dominio → contrato/openapi.yaml → api/src/routes → api/src/mapeadores → database/ → web/ → tests/
> ```
>
> e, **na linha seguinte**, afirma: *"O **contrato antes do código** é deliberado."* A seta põe o domínio
> antes do contrato; a frase diz o contrário. E os outros dois documentos seguem a **frase**, não a seta:
>
> | Onde | Ordem |
> |---|---|
> | `01-modulo.md` §8 (**a lei**) | domínio → contrato → borda |
> | skill `code-modulo` (passos 6 e 7) | **contrato** → domínio → borda |
> | `funcionamento-esperado.md` §5.1 (3 e 4) | **contrato** → domínio → borda |
>
> Não é ambiguidade de leitura: é a fonte normativa discordando de si mesma, com dois consumidores
> seguindo a outra metade. Enquanto isso não fechar, o Bloco U apontaria para uma contradição.

- [ ] **DECIDIDO pelo dono: CONTRATO PRIMEIRO.** A seta da §8 passa a ser
      `contrato/openapi.yaml` → `core/dominio` → `api/src/routes` → `api/src/mapeadores` →
      `database/` → `web/src/pages` → `tests/`
- [ ] **O argumento, escrito na própria §8** para ninguém reverter por intuição: o contrato é a **fronteira
      que outros consomem** (`modulo.json:consome`), o gate cobra rota do código × rota da spec **nos dois
      sentidos** (`contrato-sincronizado`), e `contrato-compativel.mjs` compara o contrato contra o
      baseline git. Escrever código primeiro faz a spec ser redigida **para descrever o código** — e aí a
      fonte de verdade inverte sem ninguém decidir isso
- [ ] **Recusada, com o motivo:** domínio primeiro. O argumento dela é real — *"a regra de negócio não
      deve ser moldada pelo transporte"* — e continua valendo **dentro** do passo: `core/dominio` não
      importa nada da `api/`, e o gate cobra isso. O que a decisão fixa é a **ordem de escrita**, não a
      direção da dependência, que já era e continua sendo domínio ← borda
- [ ] **Os outros dois documentos NÃO mudam** — eles já diziam contrato primeiro. Uma edição, num lugar,
      e a divergência fecha. *Confira os três depois de editar: é o que prova que a fonte voltou a ser uma*
- [ ] **Nenhum caso de teste muda**: o gate é estático e não julga ordem de escrita. Este bloco é doutrina
      pura, e o autoteste tem de sair **inalterado** — se mexer no número, algo além da doutrina foi tocado

---

## Bloco U — o mapa instalado

> **O defeito.** A base tem um par: **lei** (`doutrina/*.md`) e **manual do diretório**
> (`README.md` — é assim que o `CLAUDE.md` da base o chama). `criar-projeto.mjs:instalarDoutrina` copia
> **só a lei**. O projeto gerado recebe **1.741 linhas normativas e zero índice**:
>
> ```
> specs/arquitetura/
>   00-arquitetura.md  01-modulo.md  02-contrato-e-dados.md  03-operacao.md  04-regras.md
> ```
>
> **E o conteúdo operacional JÁ ESTÁ LÁ** — a auditoria mediu isto e é o que torna o bloco pequeno:
> `01-modulo.md` §8 (criar) e **§9 (alterar, com sete sub-seções: campo, rota, infraestrutura,
> dependência, variável, tabela, tela)**, cada uma com a tabela arquivo-a-arquivo na ordem obrigatória.
> A §9 abre dizendo *"criar módulo é o caso raro; **alterar é o diário**"* — é a seção mais usada do
> template, e a menos encontrável.
>
> **Nada precisa ser escrito. Falta um índice.**

- [ ] **`specs/arquitetura/README.md`, instalado por `criar-projeto.mjs`** no mesmo passo que a doutrina
- [ ] **Conteúdo: cinco blocos, todos de ponteiro ou comando** — *(1)* qual seção responde a qual
      pergunta, com **`01-modulo.md` §9 em destaque**, sub-seção por sub-seção · *(2)* o laço
      (`verificar` · `iniciar` · `test`, e o que o `pre-commit`/`pre-push` cobram) · *(3)* a ordem ao
      criar módulo, **apontando** para a §8 (Bloco V) · *(4)* os erros que o gate mais pega, cada um
      nomeando a regra que o cobra · *(5)* o que fazer com e sem o plugin `sarak`
- [ ] **A LEI DESTE ARQUIVO — o teste que impede virar segunda lei:** *toda linha ou é um ponteiro (`§`)
      ou é um comando.* Apagar o arquivo inteiro **não pode fazer nenhuma regra desaparecer** — só
      torná-la mais difícil de achar. Escreva isso dentro do próprio arquivo, como a §7.2 faz com os
      próprios limites
- [ ] **Por binding**, porque os comandos diferem (`npm run verificar` × `python verificar.py`).
      **DECIDIDO — gerado a partir de uma fonte só**, com marcadores substituídos na instalação, no
      precedente do `_template`. *Recusada:* três arquivos escritos à mão — é a G.2 outra vez (variantes
      que precisam concordar e nada verifica que concordam)
- [ ] **A trava é o PONTEIRO, não o byte.** `--conferir` byte a byte pegaria edição manual do arquivo
      instalado, que não é o risco real; o risco é **`§` citado que deixou de existir** quando a lei for
      reorganizada. Verificação: cada `§` citado no mapa resolve a um título real do arquivo que ele
      nomeia. É o que o `ponteiros.py` da base já faz para a base — mesma ideia, outro alvo
- [ ] **Entra no Bloco K**: o passo `verificar` do K passa a exigir que o mapa esteja instalado e que a
      verificação de ponteiro passe. **Sem isso o bloco repete a S.1** — um `--conferir` que existe e
      ninguém chama não é verificação
- [ ] **O ponteiro órfão da §8 fecha aqui:** ela termina em *"a skill `code-modulo` conduz esse fluxo"* —
      uma skill que **não viaja com o repositório**. O mapa passa a dar o caminho dos dois lados: com
      plugin, a skill; sem plugin, §8 e §9, que estão ao lado

**Critério de aceite:** num projeto gerado do zero, `specs/arquitetura/README.md` existe, todos os `§`
que ele cita resolvem, e os comandos que ele lista rodam **naquele** binding.

---

## Bloco W — a deriva do `funcionamento-esperado.md`

> Quatro linhas. Três foram criadas pelo próprio Bloco S do `plan-2` — a terceira derivação com
> `--conferir` nasceu e o documento continuou falando em duas.

- [ ] **§3, "Coerência do gerado"** — diz *"`--conferir` nas **duas** ferramentas"*; são **três**:
      `sincronizar-env`, `gerar-config-lint`, `gerar-schemas-portas`
- [ ] **§3, "A cadeia"** — `gate → env → formato → lint → tipos → testes` passa a
      `gate → env → **schemas** → formato → lint → tipos → testes`
- [ ] **§4.4, lista de comandos** — falta `validar:schemas`
- [ ] **§8, "Onde ler mais"** — ganha a linha do mapa do Bloco U, e a frase final (*"no projeto gerado,
      tudo de `doutrina/` está em `specs/arquitetura/`"*) passa a dizer que o índice está lá também

---

## Ordem de dependência

```
T   o hook composto            O ÚNICO que muda comportamento, e o único que pode morder
                               em produção. Independente dos outros três — pode ir sozinho

V   a lei que se contradiz     ANTES do U, senão o mapa aponta para uma contradição
                               decidido: CONTRATO PRIMEIRO

U   o mapa instalado           depende do V · entra no Bloco K · fecha o ponteiro órfão
                               da §8 para uma skill que não viaja

W   a deriva do documento      a qualquer momento

═══ meta: quem abre o repositório gerado SEM o plugin sabe o que fazer e em que ordem,
    e o pre-commit cobra segredo E conformidade ═══
```

**Por que T pode ir sozinho e primeiro:** ele é o único defeito com consequência silenciosa em
repositório real — perder o gate de conformidade no commit sem nada avisar. Os outros três são de
descoberta e coerência, e nenhum deles quebra nada enquanto espera.

---

## Fora deste plano

- **A candidata de catálogo** (regra que cobra a convenção de nome do mapeador) — segue aberta no
  `plan-2.md`, e segue sendo decisão de catálogo: linha em §4.x, caso próprio e limite no §7.2.
- **`npm run migrations` contra Postgres depois do bump do `pg`** — o ciclo up→down→up foi provado na
  F.2g contra banco real e **não** foi re-exercitado após a P. Não é deste plano; é a próxima vez que
  houver um banco à mão.
- **Instalar o `funcionamento-esperado.md` inteiro no projeto** — recusado: ele é a visão de conjunto
  **do template**, escrita para quem mantém a base. O que o projeto precisa é do índice da lei DELE,
  que é o Bloco U. Dois documentos de conjunto em dois lugares é o defeito que este ecossistema evita.

---

## Resumo da execução — 2026-08-10

**Resultado:** Concluído

**O que foi feito**

**Bloco T**
- `skills/meta-iniciar-repositorio/scripts/init_repo.py` — nova `compor_pre_commit(existente, nosso)`,
  pura, com os quatro estados do bloco (não existe / só template / só nosso / os dois), idempotente por
  construção (recompor um resultado já composto cai direto no ramo "os dois", devolvido sem alteração).
  `instalar_hooks_git` passa a ler o hook existente e compor, nunca sobrescrever.
- `_marcar_executavel` (novo) chama `os.chmod` no `pre-commit` **e** no `pre-push`, quando presente —
  antes só o `pre-commit` era marcado.
- `--autoteste` (novo, intercepta `sys.argv` antes do `argparse`, precedente de
  `verificar-commit.mjs`): 4 casos dos estados + 2 de idempotência (recompor um `b`/`c` já composto).
- `skills/meta-iniciar-repositorio/SKILL.md` — o heredoc Python do Handoff (passo 6) foi removido: a
  composição agora é automática. O passo 5 (Verificar) ganhou os dois `grep -c` que a plan pedia como
  trava; o passo 6 (Handoff) descreve o resultado em vez de instruir uma ação manual.

**Bloco V**
- `specs/_estrutura_modulos/doutrina/01-modulo.md` §8 — a seta de preenchimento passou a
  `contrato/openapi.yaml → core/dominio → api/src/routes → api/src/mapeadores → database/ →
  web/src/pages → tests/`, com o argumento (fronteira que outros consomem, `contrato-sincronizado`,
  `contrato-compativel.mjs`) e a recusada (domínio primeiro — direção de dependência não muda)
  escritos na própria seção. `code-modulo/SKILL.md` e `funcionamento-esperado.md` §5.1 já diziam
  contrato primeiro — conferido, não tocados.

**Bloco U**
- `specs/_estrutura_modulos/doutrina/README.md` (novo) — o mapa, cinco blocos (qual seção responde a
  qual pergunta, com §9 em destaque sub-seção a sub-seção; o laço; a ordem ao criar módulo com o
  caminho dos dois lados — com plugin, `code-modulo`; sem plugin, §8/§9 ao lado; os erros mais comuns
  do gate nomeando a regra; com/sem o plugin `sarak`), com a lei do arquivo (ponteiro ou comando)
  declarada dentro dele mesmo. Vive dentro de `doutrina/`, então o laço existente de
  `criar-projeto.mjs:instalarDoutrina` já o copia — nenhuma cópia nova precisou ser escrita.
- `specs/_estrutura_modulos/ferramentas/criar-projeto.mjs` — `instalarDoutrina` passou a receber
  `binding` e substitui `<comando-verificar>`/`<comando-iniciar>` no `README.md` copiado (precedente
  de `<modulo>` em `criar-modulo.mjs`: fonte única, marcador substituído na instalação).
- `specs/_estrutura_modulos/testes/verificar-mapa.mjs` (novo) — `extrairCitacoes`/`extrairSecoes`/
  `pontosOrfaos` puras (precedente de `afetados.mjs`), mais `--conferir <pasta>` e `--autoteste` (9
  casos). A trava é o ponteiro (título real no arquivo citado), não o byte.
- `specs/_estrutura_modulos/testes/autoteste-template.mjs` — novo passo `mapa` (tipo
  `mapa-instalado`), logo depois de `verificar`, nos três bindings — roda
  `verificar-mapa.mjs --conferir <destino>/specs/arquitetura` contra o projeto recém-gerado. Ajustei o
  caso de autoteste do binding Python que assumia `ci-dependencias` como penúltimo passo (agora é o
  `mapa`) e acrescentei um caso novo provando a posição do `mapa`.

**Bloco W**
- `funcionamento-esperado.md`: §3 "Coerência do gerado" agora diz "três ferramentas" (e cita schemas
  de portas); "A cadeia" ganhou o passo `schemas`; §4.4 ganhou `validar:schemas` na lista de comandos;
  §8 ganhou a linha do mapa (`doutrina/README.md`) e a frase final passou a citar que o índice também
  está em `specs/arquitetura/` no projeto gerado.

**Arquivos alterados**
| Arquivo | Natureza | O que mudou |
|---|---|---|
| `skills/meta-iniciar-repositorio/scripts/init_repo.py` | alterado | `compor_pre_commit` pura + `--autoteste`, `_marcar_executavel` cobre os dois hooks, `instalar_hooks_git` compõe |
| `skills/meta-iniciar-repositorio/SKILL.md` | alterado | heredoc do Handoff removido; passo 5 ganhou a trava por `grep -c`; passo 6 descreve, não instrui |
| `specs/_estrutura_modulos/doutrina/01-modulo.md` | alterado | §8: contrato primeiro, com o argumento e a recusada escritos na própria seção |
| `specs/_estrutura_modulos/doutrina/README.md` | criado | o mapa (Bloco U), fonte única com marcadores `<comando-verificar>`/`<comando-iniciar>` |
| `specs/_estrutura_modulos/ferramentas/criar-projeto.mjs` | alterado | `instalarDoutrina(destino, binding)` substitui os marcadores do mapa; `copiarTemplate` passa a passar `binding` adiante |
| `specs/_estrutura_modulos/testes/verificar-mapa.mjs` | criado | verificador de ponteiro do mapa — `--conferir`/`--autoteste` |
| `specs/_estrutura_modulos/testes/autoteste-template.mjs` | alterado | novo passo `mapa` nos três bindings + autoteste da posição; caso do Python ajustado |
| `funcionamento-esperado.md` | alterado | as quatro derivas do Bloco W (§3 ×2, §4.4, §8) |

**Verificações executadas**
- `node skills/../scripts/init_repo.py --autoteste` (via `python init_repo.py --autoteste`) → **6/6 ok**
  (4 estados + 2 de idempotência).
- `node testes/verificar-mapa.mjs --autoteste` → **9/9 ok**.
- `node testes/autoteste-template.mjs --autoteste` (núcleo puro) → **17/17 ok** (era 16, +1 caso novo
  do `mapa`; o caso do binding Python foi ajustado para a nova posição, não removido).
- `node ferramentas/gate/testes/executar.mjs --binding typescript` → **122/122 ok** (igual à linha de
  base do plan-2.md).
- `node ferramentas/gate/testes/executar.mjs --binding javascript` → **122/122 ok** (idem).
- `node ferramentas/gate/testes/executar.mjs --binding python` → **119/119 ok** (idem) — os três
  batem exatamente com o Estado medido no topo desta plan; Bloco V é doutrina pura e não move a
  agulha, como o próprio bloco previa.
- Integração real, três vezes (`node ferramentas/criar-projeto.mjs <tmp> --binding <b> --escopo teste`
  para `typescript`, `javascript` e `python`, pastas apagadas depois): `specs/arquitetura/README.md`
  nasce com os marcadores substituídos pelo comando certo do binding, e
  `node testes/verificar-mapa.mjs --conferir <tmp>/specs/arquitetura` sai **OK** nos três.
- `node ferramentas/gate/validar.mjs --todos` num projeto TypeScript recém-gerado (mesma pasta acima)
  → **0 erro(s), 0 aviso(s)** — a entrada do `README.md` em `specs/arquitetura/` não move o gate.
- `python skills/meta-iniciar-repositorio/scripts/init_repo.py --target <tmp> --binding typescript
  --git-init` (fluxo completo, pasta apagada depois) → `.githooks/pre-commit` saiu **composto**
  (`grep -c verificar-commit.mjs` = 2, `grep -c verificar_commit.py` = 1, ambos executáveis
  `rwxr-xr-x`), confirmando o caso "só o template" em condição real, não só na fixture do autoteste.
  Não repeti a segunda chamada em condição real (`criar-projeto.mjs` aborta ao achar `modulos/` já
  populado — comportamento correto e anterior a este plano, não deste bloco) — a idempotência do
  estado "os dois já presentes" está coberta pelos dois casos dedicados no `--autoteste` (6/6 acima).

**Critérios de aceite**
- [x] Bloco T: hook composto num alvo limpo, com as duas partes na ordem certa e executável —
      evidência: teste de integração acima. Idempotência provada por unidade (`--autoteste`), não
      repetida em condição real pelo motivo já registrado.
- [x] Bloco V: `01-modulo.md` §8 concorda com `code-modulo`/`funcionamento-esperado.md` §5.1 (contrato
      primeiro nos três) — evidência: leitura direta dos três after a edição; nenhum caso de teste do
      gate mudou (122/122 · 122/122 · 119/119, idêntico à linha de base).
- [x] Bloco U: `specs/arquitetura/README.md` existe num projeto gerado do zero, todos os `§` citados
      resolvem (`verificar-mapa.mjs --conferir` → OK nos três bindings), e os comandos que ele lista
      são os do binding — evidência: os três testes de integração acima.
- [x] Bloco W: as quatro linhas — evidência: `grep` mostrado acima, cada uma corrigida.

**Decisões e suposições**
- A checagem de ponteiro do Bloco U ("entra no Bloco K") foi conectada ao passo `mapa` de
  `autoteste-template.mjs`, **não** ao `npm run verificar`/`python verificar.py` do projeto gerado.
  Motivo: a lei instalada é propriedade do **template**, não do projeto — ela não é editada
  localmente, e a D1 do `plan-2.md` já declara que "o template nunca empurra atualização para projeto
  já criado". Logo, apodrecimento de ponteiro (um `§` que deixa de existir porque a doutrina foi
  reorganizada) só acontece do lado da **base**, quando alguém edita `doutrina/` — e é exatamente ali
  que o Bloco K roda. Pôr a checagem na cadeia do projeto gerado cobraria, em todo commit de todo
  projeto, um risco que só existe do lado de cá. `autoteste-template.mjs` (mesma pasta de
  `criar-projeto.mjs`, D3 do próprio arquivo — ferramenta de quem MANTÉM o template) já roda a cada
  geração de projeto na suíte do template, então "entra no Bloco K" fica satisfeito sem impor esse
  custo ao projeto gerado.
- A citação `§` que o `verificar-mapa.mjs` reconhece exige arquivo-entre-crases e `§N[.M]` na MESMA
  linha, com o arquivo mais próximo à esquerda da seção — é o formato que todo o `README.md` novo usa
  (tabela e prosa). Não é uma gramática geral de citação cruzada; documentado no cabeçalho do script.
- `doutrina/README.md` foi colocado dentro de `doutrina/` (em vez de instalado por um passo separado)
  porque `instalarDoutrina` já copia todo arquivo solto daquela pasta — verifiquei que nenhuma
  ferramenta do template assume "exatamente 5 arquivos" ali (gate, `empacotar.mjs`,
  `criar-projeto.mjs` — nenhum enumera por contagem) antes de confiar nisso.

**Achados fora do escopo (não corrigidos)**
- `specs/_estrutura_modulos/ferramentas/criar-projeto.mjs:192` (`principal`) — o hook de padrão de
  escrita acusou "Function 'principal' has too many lines (41). Maximum allowed is 40" ao salvar este
  arquivo. Confirmado por `git diff` que a função não foi tocada por esta execução — é uma violação
  pré-existente, um linha acima do limiar, sem relação com o Bloco U. Não corrigido: fora do escopo
  desta plan (nenhum bloco pede refatorar `principal`), e mexer nela para "resolver de passagem" seria
  a mesma classe de decisão de escopo que o `00-prompt-executor.md` reserva ao revisor. Sugestão: plan
  nova, ou tarefa de baixo risco no próximo `/code3-adequar` que passar por este arquivo.

**Pendências / riscos**
- O `funcionamento-esperado.md` documenta a cadeia real do projeto gerado (`gate → env → schemas →
  formato → lint → tipos → testes`) sem o passo `mapa` — de propósito, pela decisão registrada acima.
  Se um revisor decidir noutra rodada que a checagem de ponteiro DEVE entrar na cadeia real (não só na
  suíte do template), o `funcionamento-esperado.md` precisa de uma quinta correção nesse momento.
- Não recriei a **Tabela "Estado"** no topo desta plan (linhas de `Bloco K | 11 passos` etc.): ela é
  medição de ponto no tempo que o `plan-2.1.md` não me manda atualizar, e o `autoteste-template.mjs`
  agora tem 12 passos por binding (o `mapa` novo) — o revisor decide se remedir e reescrever essa
  tabela é parte do fechamento deste plano ou tarefa dele.

## Resumo da execução (correção 1) — 2026-08-10

**Resultado:** Concluído

Dois ajustes de uma linha cada, pedidos pelo revisor após aprovação do plano. Nenhum comportamento
muda; nenhum arquivo de código entra no diff.

**O que foi feito**
- `skills/meta-iniciar-repositorio/SKILL.md:83-88` — as duas contagens do passo 5 passaram de
  `grep -c "<nome-do-arquivo>"` (conta MENÇÃO) para `grep -c "^<invocação-âncorada>"` (conta CHAMADA):
  `^node ferramentas/verificar-commit.mjs` e `^"\$PY" .githooks/verificar_commit.py`. O critério mudou
  de "1 ou mais" para "exatamente 1" — mais de 1 agora é sinal de hook duplicado.
- `plan-2.1.md` (o parágrafo de "Decisões e suposições" sobre por que a checagem de ponteiro entra no
  Bloco K via `autoteste-template.mjs`, e não na cadeia `verificar` do projeto gerado) — o motivo trocou
  de custo documental (evaporava no dia em que o Bloco W fosse commitado) para propriedade: a lei
  instalada é do template, nunca editada localmente (D1 do `plan-2.md`), então apodrecimento de
  ponteiro só acontece do lado da base — onde o Bloco K roda. A pendência que aponta para uma eventual
  quinta correção do `funcionamento-esperado.md` (parágrafo seguinte) não mudou — ela continua válida
  sob a premissa nova.

**Arquivos alterados**
| Arquivo | Natureza | O que mudou |
|---|---|---|
| `skills/meta-iniciar-repositorio/SKILL.md` | alterado | as duas contagens do passo 5 ancoradas na invocação, critério `== 1` |
| `plan-2.1.md` | alterado | motivo da decisão de não entrar na cadeia `verificar` trocado por propriedade (D1) |

**Verificações executadas**
- Fluxo completo (`init_repo.py --target <tmp-limpo> --binding typescript --git-init`) e leitura do
  `.githooks/pre-commit` real produzido:
  ```
  $ grep -c "^node ferramentas/verificar-commit.mjs" .githooks/pre-commit
  1
  $ grep -c "^\"\$PY\" .githooks/verificar_commit.py" .githooks/pre-commit
  1
  ```
  Pasta temporária apagada depois.
- `python skills/meta-iniciar-repositorio/scripts/init_repo.py --autoteste` → **6/6 ok** (inalterado —
  `compor_pre_commit` não foi tocada nesta rodada).
- `node ferramentas/gate/testes/executar.mjs --binding typescript` → **122/122 ok**.
- `node ferramentas/gate/testes/executar.mjs --binding javascript` → **122/122 ok**.
- `node ferramentas/gate/testes/executar.mjs --binding python` → **119/119 ok**.
  Os três idênticos à linha de base (74 regras com caso de teste) — nenhum código tocado.
- `git diff --stat -- skills/meta-iniciar-repositorio/SKILL.md plan-2.1.md` → só `SKILL.md` aparece
  (17 inserções, 28 remoções). `plan-2.1.md` é **arquivo não rastreado** (`??` desde o início desta
  plan) — `git diff` não mostra arquivo não rastreado, com ou sem alteração; a evidência de que só ele
  mudou, além de `SKILL.md`, é a leitura direta acima. O `git diff --stat` SEM escopo continua listando
  os seis arquivos das rodadas anteriores (`init_repo.py`, `criar-projeto.mjs`,
  `autoteste-template.mjs`, `01-modulo.md`, `funcionamento-esperado.md`, `SKILL.md`) porque nada foi
  commitado entre rodadas — o executor não commita (`00-prompt-executor.md` §7.1). Nenhum desses cinco
  arquivos de código/doutrina foi reaberto nesta rodada; só `SKILL.md` teve edição nova.

**Critérios de aceite**
- [x] `git diff --stat` mostra só `SKILL.md` e `plan-2.1.md` **entre os arquivos tocados nesta
      rodada** — evidência acima; ressalva sobre `plan-2.1.md` ser não rastreado e sobre o diff sem
      escopo carregar as rodadas anteriores (nunca commitadas) documentada, não escondida.
- [x] Fluxo real, duas contagens em exatamente 1 — evidência colada acima.
- [x] Autoteste do gate inalterado (122/122 · 122/122 · 119/119) e `--autoteste` do `init_repo.py`
      inalterado (6/6) — evidência acima.
- [x] Nenhum `.mjs`/`.ts`/`.py` entrou no diff desta rodada — só `SKILL.md` (Markdown) e `plan-2.1.md`
      (Markdown, não rastreado) foram editados pelas minhas ferramentas nesta rodada.

**Decisões e suposições**
- Interpretei "o motivo registrado é o mais fraco dos dois" como pedido para **substituir** o parágrafo
  de justificativa dentro do resumo já escrito na rodada anterior — não como pedido para abrir um novo
  bloco append-only preservando o texto antigo. A rodada trata isso explicitamente como correção
  editorial de um resumo ainda não commitado/aprovado por commit, não como reescrita de veredito do
  revisor — por isso editei a linha, em vez de acrescentar um bloco que contradissesse o anterior.

**Pendências / riscos**
- Nenhuma nova. As duas pendências já registradas no resumo original (quinta correção potencial do
  `funcionamento-esperado.md`; Tabela "Estado" não remedida) continuam de pé, agora com a premissa de
  propriedade em vez do custo documental.

