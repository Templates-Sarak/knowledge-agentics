# Plano 3 — o idioma do template

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **A pergunta que o abriu.** *"O correto, segundo as boas práticas, não seria em inglês?"* — feita
> depois do teste de execução real, olhando `api/src/routes` e `api/src/mapeadores` na mesma pasta.
>
> **A resposta, medida.** A boa prática não é *"tudo em inglês"*: é **vocabulário técnico em inglês,
> vocabulário de domínio no idioma do negócio**. O `04-regras.md` §3 já enuncia exatamente isso — e o
> template **não cumpre a própria regra**: usa português em `modulos`, `ferramentas`, `portas`,
> `mapeadores`, `gerados`, `dominio`, que são vocabulário **estrutural**, e onde nada impõe português.
>
> **O recorte decidido pelo dono:** código e estrutura de pastas em **inglês**; comentários e
> documentação **permanecem em português**. Nenhuma tradução — só rename.

**Regras herdadas, e continuam valendo:**
- **Regra permanente do `plan-2`:** todo bloco que toca esqueleto ou ferramenta só fecha com o **Bloco K
  verde nos três bindings**.
- **Regra permanente do `plan.md`:** regra nova exige caso próprio em `casos.mjs` e linha no catálogo
  (§4.x), mais o limite no §7.2.
- **Quem marca ITEM é o executor; quem marca BLOCO é o revisor.**
- **Citação é por `§`, nunca por número de linha.**

> **Este documento é executável de ponta a ponta.** A fronteira — o que vira inglês e o que fica em
> português — está **decidida item a item no Bloco AC**. Se o executor discordar de uma linha da
> fronteira, **para e pergunta**; não escolhe sozinho e não estende a fronteira por analogia.

---

## Estado — medido antes de decidir

| Métrica | Valor | Como |
|---|---|---|
| Pastas estruturais em português | **9** (~26 diretórios físicos nos 3 bindings) | `modulos ferramentas dominio portas motor contrato gerados mapeadores` |
| Ocorrências como **caminho** | **960** — das quais 215 são `specs/arquitetura/` (documentação, **fica**) | varredura em `.mjs .ts .js .py .json .md .yaml .sql .toml` |
| Funções do **esqueleto** com nome PT | **248 distintas · 409 ocorrências** | `bindings/**` |
| Funções das **ferramentas** com nome PT | **343 distintas · 433 ocorrências** | `ferramentas/**` |
| Citações do vocabulário **em forma de código** | doutrina **330** · comentários **488** | dentro de crase ou com barra |
| Citações **como palavra solta em português** | doutrina **284** · comentários **1.150** | **NÃO se toca** — é português correto |

**A medição que define a estratégia:** nos comentários, **70% das ocorrências são a palavra usada como
conceito**, não como identificador. O perigo desta campanha não é traduzir mal — é **substituir demais**.
A operação segura é a estreita, e o default (não mexer) é o correto.

---

## Bloco AB — o verificador de citação  *(pré-requisito, executado à parte)*

> **O único ponto cego.** Nada confere que um caminho ou identificador citado em TEXTO existe no disco.
> A doutrina pode passar a descrever `core/dominio/` num template que só tem `core/domain/` e tudo fica
> verde — e a doutrina é **copiada para dentro de cada projeto**.

- [ ] `specs/_estrutura_modulos/testes/verificar-citacoes.mjs`, no contrato dos irmãos
      (`--conferir` · `--autoteste` · exit 0/1 · núcleo puro · zero dependência)
- [ ] Três classes: **A** caminho (resolve no disco) · **B** vocabulário fechado (id de regra, chave de
      manifesto — enumerável, sem heurística) · **C** identificador livre, com discriminador
      conservador: **palavra única minúscula é conceito, nunca candidata**
- [ ] **LINHA DE BASE antes de qualquer rename** — é o item que dá sentido ao bloco. Ou ele acha
      apodrecimento já presente e conserta, ou acha zero e **prova que consegue achar** injetando uma
      citação quebrada. *Verificador que nasce verde sem contraprova é o K.0 outra vez*
- [ ] `npm run verificar:citacoes` na base. **Não** entra no Bloco K por binding: o alvo é a **base**,
      não o projeto gerado — quem é por projeto é o `verificar-mapa.mjs`

**Por que antes:** escrito depois, ele é escrito contra a realidade já renomeada — reporta verde e não
consegue achar o que nunca viu quebrado. Escrito antes, produz a **lista de citações que resolvem hoje**,
e depois da campanha a mesma lista tem de resolver de novo. Isso é um *diff*, não uma opinião.

---

## Bloco AC — a fronteira, e ela vira ADR

> *"Código em inglês, documentação em português"* parece uma linha nítida. Ela **atravessa onze
> artefatos** que não são claramente nem um nem outro, e cada um precisa de decisão explícita — senão a
> fronteira volta a ser arbitrária, que é o defeito que esta campanha existe para consertar.

- [ ] **ADR novo no template** (`doutrina/adr/decisoes.md`) registrando a tabela abaixo **e o argumento**:
      *vocabulário técnico em inglês; vocabulário de domínio e de dados no idioma do negócio; a
      documentação é português por decisão, não por inércia.*

| # | Artefato | Decisão | Motivo |
|---|---|---|---|
| 1 | Pastas estruturais | **inglês** — `modules` `tools` `domain` `ports` `engine` `contract` `generated` `mappers` | é o que se lê em cada import |
| 2 | `specs/arquitetura/` | **português** | é a **documentação**, e o nome é vocabulário do fluxo SDD, compartilhado com `_estrutura_base` — renomear sai do template |
| 3 | Funções do **esqueleto** | **inglês** | é o código que o dev escreve todo dia |
| 4 | Funções de **`ferramentas/`** (→ `tools/`) | **português** | *"ferramental vendorizado — o dono é outro repositório"*, e por isso já é **isento do linter** no projeto gerado. A porta em inglês, a sala em português, e a sala é declarada como não-sua |
| 5 | Nomes de arquivo de ferramenta | **inglês** — `create-project.mjs` `validate.mjs` `sync-env.mjs` | é a superfície de CLI que o dev digita |
| 6 | **Ids das 74 regras** | **português** | id de regra é **nome de artigo de lei**, e a lei é portuguesa. É citado muito mais em prosa (§4.x e §7.2) que em código, e a mensagem que o acompanha fica em português — `[raw-output] devolve registro cru` seria a mistura que estamos removendo |
| 7 | **Mensagens** do gate e erros de runtime | **português** | documentação entregue por código; é a UX do template |
| 8 | **Chaves do manifesto** e nome do arquivo | **inglês** — `module.json`, `name` `data` `ports` `requiredEnv` `basePath` … | é config lida por código. **É o item que mais pesa** — e o mais bem guardado: JSON Schema + ~40 regras com caso |
| 9 | Chaves de ambiente | **inglês** — `ROOT_API_PORT`, `<MODULE>_DB_URL` | convenção universal de env |
| 10 | Rotas (`/registros`) e banco (`titulo`, `<mod>_metadados`) | **português** | o §3 já decide: domínio e dados. É a boa prática de DDD, não a exceção |
| 11 | Nomes de **skill** (`code-modulo`, `cyber-segredos`) | **fora do escopo** | é convenção de toda a base Sarak, não do template |

- [ ] **O §3 do `04-regras.md` é reescrito para descrever a fronteira acima** — hoje ele promete
      *"inglês onde a linguagem impõe"*, e o template usa português em seis lugares onde nada impõe.
      Lacuna declarada é aceitável; lacuna escondida não

---

## Bloco AD — a campanha

> **Atômica.** Tem de cair de uma vez nos três bindings, no gate, nos casos e nas citações. Não dá para
> parcelar: o autoteste ou está verde ou não está.

### AD.1 — pastas *(o maior retorno por unidade de trabalho)*
- [ ] Os **26 diretórios** nos três bindings, `_template` e `_adapter`, por `git mv` — o histórico
      importa mais aqui do que em qualquer outro bloco desta família
- [ ] As **constantes de caminho do gate**: `ENTRADAS_PERMITIDAS`, `PASTAS_DE_ARTEFATO`, `NAO_PERCORRER`,
      `CONTEUDO_IGNORADO_MAS_ENTRADA`, o filtro `/mapeador/i` de `chavesDaProjecao`, `areaDoImport`,
      `saiDoModulo`, `temArquivoEm`
- [ ] As **ferramentas**: `criar-projeto` `criar-modulo` `criar-adapter` `empacotar` `afetados`
      `sincronizar-env` `verificar-commit` `ci-*` `gerar-*`
- [ ] Config derivada e ignorada: `IGNORADOS` do `gerar-config-lint`, `.gitignore` (`**/generated/*`),
      `tsconfig`, `vitest.config`, `pyproject`, `workspaces` do `package.json`
- [ ] `casos.mjs` — os **alvos lógicos** por nome de pasta

### AD.2 — funções do esqueleto
- [ ] As **248** dos `bindings/**`, incluindo a fiação de `FABRICAS` e os entrypoints
- [ ] **Os seis âncoras de regra, e eles NÃO são rename — são regra alterada:**
      `paraContrato`/`paraColecao`/`paraMeta` × `linhaParaDominio`/`dominioParaLinha` (o **discriminador
      de direção** de três regras; em inglês a propriedade sobrevive — `toContract` começa com `to`,
      `rowToDomain` não —, mas exige casos novos) · `exigirPermissao` (lido por `permissao-literal`) ·
      `envObrigatoria` e `carregarConfiguracao` (lidos por `env-fora-do-carregador`)
- [ ] **MÉTODO OBRIGATÓRIO nos seis:** trocar o **âncora** e as **fixtures** em passos separados, e
      **provar o estado intermediário vermelho**. Ali o objeto testado e o teste mudam juntos — é o
      cenário clássico em que uma suíte passa sem provar nada

### AD.3 — as citações em texto
- [ ] **Só as ~818 em forma de código** (dentro de crase ou com barra/ponto). As **1.434 como palavra
      solta ficam intactas** — são português correto, e substituí-las é o defeito desta campanha
- [ ] A substituição é **escopada por construção**: o script só troca dentro de crase e em token com
      barra ou extensão. Nada de `sed` no arquivo inteiro
- [ ] `verificar-citacoes` verde ao final, contra a linha de base do Bloco AB

### AD.4 — o que fica declarado FORA, com motivo
- [ ] **As 343 funções de `ferramentas/`** — decisão 4 da fronteira. 433 ocorrências de nomes internos
      que ninguém que usa o template lê, por ganho ~zero
- [ ] **Os planos** (`plan.md`, `plan-2*`, `plan-3*`) — registro histórico. Citam nomes que existiam
      quando foram escritos, e é isso que um registro deve fazer. **Não migram**, e o
      `verificar-citacoes` os ignora por lista explícita, não por acidente
- [ ] **Comentários e doutrina** — permanecem em português. Só as citações mudam

**Critério de aceite da campanha:** autoteste `122/122 · 122/122 · 119/119` · Bloco K **13/13 nos três
bindings** · `verificar-citacoes` verde · `verificar-mapa` verde · e um projeto gerado do zero passando
`verificar` → `build` → `lint` → **primeiro commit**.

---

## Ordem de dependência

```
AB   o verificador de citação    PRÉ-REQUISITO — e com LINHA DE BASE, senão não serve
                                 (executado à parte, antes de tudo)

AC   a fronteira em ADR          antes de tocar arquivo: é ela que impede a fronteira
                                 arbitrária de voltar por analogia

AD   a campanha                  ATÔMICA — pastas + funções do esqueleto + citações,
                                 num movimento. AD.2 tem método próprio nos 6 âncoras

═══ meta: `core/domain/` e `toContract` num template cuja lei e cujos comentários
    seguem em português, e cuja fronteira está escrita num ADR ═══
```

---

## Fora deste plano

- **Traduzir comentários e documentação** — recusado pelo dono, e é a decisão certa: são **4.767 linhas
  de argumento** (26% do código), com medição dentro. Traduzir isso é **autoria**, sem verificação
  possível, e o que se perde não é a palavra — é a ênfase que impede alguém de desfazer um conserto.
- **Nomes de skill do ecossistema** — decisão 11 da fronteira.
- **A verificação prática pendente** (skill real, migrations em JS/Python contra Postgres, a regra da
  convenção de nome do mapeador) — está no **`plan-3.1.md`**, e ela roda **depois** da campanha, porque
  a convenção que a regra vai cobrar muda de `para*` para `to*` aqui.
