# Campanha de idioma (ADR-023 a ADR-025) — insumo da propagação

Documentação **da base**: não viaja para projeto gerado (o `decisoes.md` que viaja só tem a lei, o método e o
plano de ondas). Aqui mora o que é específico dos **sistemas do `mapa.json`** e o inventário detalhado da
base — o que a fase de propagação precisa ler antes de levar cada onda a um sistema.

Fontes: `specs/_estrutura_modulos/doutrina/adr/decisoes.md` (`ADR-023` a `ADR-025`) e o `mapa.json`.
Medição feita na onda 0 (2026-10-11/12). Os números envelhecem a cada onda aplicada: **remeça** antes de
citá-los num plan.

## 1. Riscos de propagação, por sistema

### 1.1 Exceções por id em `config/compliance.json` (onda 1)

O gate compara `e.rule === a.regra` por igualdade. Depois do `ADR-024`, uma exceção com id antigo **deixa de
perdoar** o achado. Desde a onda 1 o gate acusa isso (`compliance-declared`, com a tabela
`tools/gate/renamed-rules.json`), mas a **migração do arquivo** é do plan de cada sistema.

Medido na onda 0: 4 sistemas modulares no `mapa.json`; 3 deles têm `config/compliance.json` com exceção
nominal por id — **29 entradas**.

| Sistema (`id` no mapa) | Exceções por id |
|---|---|
| `setup-is-cripto` | 15 |
| `earendel-erp` | 12 |
| `zp-relatorios` | 2 |

Achado lateral: `sarak-lib-login` registra `row-level-security`, que **nunca** foi id do catálogo (o id é
`rls`, hoje `rls` também em B). A exceção já era **inerte** antes da campanha; o gate novo a acusa, sem dica
de renomeação (não há id novo para apontar). O plan do sistema decide: corrigir para `rls` (se a intenção
era essa) ou remover a exceção.

Como migrar: para cada `exceptions[].rule`, trocar pelo id da coluna **B** do `ADR-024` — a mensagem do gate
já diz o par exato (`rule X was renamed to Y (ADR-024)`).

### 1.2 `tools/` vendorizado (ondas 1, 2 e 3)

`propagar.py`: em sistema modular, `tools/` divergente vira `substituir-politica`. Renomear id, símbolo e
mensagem chega ao sistema pela substituição da pasta inteira — **sem migração de dado**, mas com dois
efeitos a conferir no plan:

- o `tools/` novo traz `gate/renamed-rules.json` — arquivo novo na pasta, que o sistema vendoriza junto;
- o gate novo reprova no sistema o que o antigo perdoava calado (exceção com id antigo, 1.1), então o plan de
  `tools/` e o de `config/compliance.json` vão **juntos**, na mesma execução.

### 1.3 Sistema com vocabulário de idioma próprio (onda 6)

`earendel-erp` é o sistema adotante que **já cobra** idioma por regra própria (`identificador-em-portugues`,
vocabulário fechado em `tools/gate/vocabulario.mjs`, 327 termos). A decisão 7 do `ADR-023` fixa **um arquivo
único** de vocabulário no template; na propagação da onda 6 o sistema migra o dele para o do template (a
união dos termos), em vez de manter dois.

### 1.4 O que a doutrina não força

Rename de tabela em produção (onda 4b) é migration decidida pelo dono do sistema, com expand-contract
(`db-migrations`): o template muda o **molde**, nunca o banco de um sistema vivo.

## 2. Inventário detalhado

Medido com um script descartável da onda 0 (**fora do repositório**): árvore sintática real — API do
TypeScript para `.mjs/.js/.ts`, módulo `ast` para `.py` —, vocabulário fechado de **1.186 termos** (327 do
vocabulário do `earendel-erp`, 73 das tabelas dos `ADR-013` a `018`, o resto de um levantamento por
tokenização dos identificadores, revisado). Declaração = nome único por (arquivo, nome, papel).

| # | Categoria | Total medido | Onde |
|---|---|---|---|
| 1 | ids de regra | 81 ids; **1.260 citações em 95 arquivos**: `gate/rules` 297, `cases.mjs`/`run.mjs` 312, doutrina vigente 374/6 arquivos, **skills 95/24**, `tools/**` 65/17, bindings 57/31, tests 19/2, ADR histórico 32/1 (imutável), **dado dos sistemas** 29 exceções em 3 sistemas | 95 |
| 2 | mensagens e saídas ao dev | 873 strings PT de 1.971 em `tools/**` (277 só em `cases.mjs`); 329 de 728 em `tests/**`; chaves de JSON de saída do gate lidas por `commands/code1-auditar.md`, `skills/code-diagnostico` e pelo backlog de `.sarak/audit` | 26 + 7 |
| 3 | símbolos de `tools/**` (aplicado na onda 2) | 1.741 de 2.452 declarações (71%); 903 nomes distintos; top-level 510 de 611; 802 de 1.090 em `tests/**` (74%); 35 símbolos importados entre 19 arquivos; flag `--autoteste` citada em 52 arquivos | 29 + 7 |
| 4a | identificadores de `bindings/**` | 869 de 1.172 locais+parâmetros (74%); 475 de 1.581 de superfície (30%); ts 292/383, js 268/354, py 309/435 | 75 |
| 4b | domínio do molde | ver o `ADR-023` (linha 4b) | 3 bindings |
| 5 | chaves de config/manifesto | template: 18 (16 distintas) em 2 arquivos; **base: 162 (71 distintas) em 16 arquivos** (`skills/*/scripts/config.json`, `.sarak`) | 2 + 16 |
| 6 | código da base | **2.327** declarações PT de 3.761 (62%): `skills/*/scripts` 2.166/3.249, `hooks` 143/407, `plugin` 18/90; **194** chaves de dict/JSON de saída distintas em 34 arquivos; **33** flags PT de 119; **32** de 57 nomes de script; 29 strings `.sarak/` em 5 arquivos; chaves de saída citadas em `.md`: `arquivo` 18 arquivos, `alvo` 13, `risco`/`regra`/`familia`/`catalogo` 11; import real: 23 símbolos em 1 arquivo | 46 |

A flag `--autoteste` e os scripts `autoteste:*` ligavam a base e o template: a varredura literal
(`tests/run-all-selftests.mjs`) descobre todo arquivo que a cita. Por isso a decisão 5 do `ADR-023` pôs os
dois lados no **mesmo commit**, e a **onda 2 os aplicou**: a flag é `--selftest` e as chaves de npm são
`selftest:all`, `selftest:template`, `selftest:template:fast` e `selftest:template:docker`. A contagem de
arquivos descobertos (38) é a mesma antes e depois.

## 3. Como reproduzir a medição

O medidor é versionado desde a onda 4 (`specs/_estrutura_modulos/tests/measure-language.mjs`, seção 7); o
método é este, e qualquer reimplementação que o siga reproduz os totais:

1. **Declarações** — extrair de cada arquivo (`.mjs/.js/.ts` pela API do compilador TypeScript; `.py` pelo
   módulo `ast`) o nome de cada função, classe, constante, variável local, parâmetro e chave de objeto, com
   o papel. Unicidade por (arquivo, nome, papel).
2. **Português** — um nome é PT se algum dos seus termos (quebrado por camelCase, snake_case e kebab-case)
   está na lista fechada de 1.186 termos. Cognatos e termos técnicos (`data`, `status`, `base`, `hash`,
   `config`, `id`…) ficam fora da lista de propósito. Nunca "parece português".
3. **Raio** — ocorrências do nome por arquivo (limite superior) e imports reais entre arquivos (o
   acoplamento verdadeiro).
4. **Ids de regra**, independente do script:
   `grep -h "^\s*id: '" specs/_estrutura_modulos/tools/gate/rules/*.mjs | sort -u | wc -l` → 81. A forma
   pós-onda 1 do catálogo é a que o `audit_base.py` (`ids_citados`) lê do código do gate.
5. **Citações de id** — busca por id com fronteira (`(?<![\w-])id(?![\w-])`); os ids de uma palavra
   (`log`, `manifest`, `contract`…) só contam entre crases ou aspas, e a lista de ambíguos é revista à mão.

6. **Mensagens e strings operacionais** — para a contagem desta onda, extrair literais e trechos de template
   com a API do TypeScript (`.mjs/.js/.ts`) e `ast` (`.py`), e rastrear os valores que chegam a `stdout`, `stderr`, `Usage`/help, erros,
   resumos e relatórios de `tools/**` e `tests/**`. Fazer triagem lexical sem diferenciar acento e revisar cada
   candidato no ponto de emissão. Não contar comentários/docstrings, comentários de arquivos gerados,
   texto de `config/texts.json`, `module.json:name`, fixtures cujo propósito é ler doutrina em português ou
   exercitar a detecção de identificadores/rotas em português, nem valores internos que o serializador
   converte antes da saída. A triagem é candidata, não veredito: registrar a revisão dos casos restantes.

## 4. Onde cada coisa aterrissa

| Item | Onda | Quem aplica nos sistemas |
|---|---|---|
| ids de regra + `config/compliance.json` | 1 | plan de `compliance.json` + substituição de `tools/` (1.1, 1.2) |
| símbolos de `tools/` | 2 | substituição de `tools/` (1.2) |
| mensagens do ferramental e chaves de saída do gate | 3 | substituição de `tools/`; consumidores das chaves de JSON (`code1-auditar`, backlog) |
| `bindings/**` | 4a | plan por binding do sistema |
| domínio do molde | 4b | **migration do dono** (1.4) — nunca automática |
| código da base, `.sarak/` | 5 | a própria base; os projetos recebem as chaves novas nas auditorias novas |
| regra de gate de idioma | 6 | substituição de `tools/` + unificação do vocabulário (1.3) |

## 5. Estado depois da onda 2 (remedição)

Remedido com o método da seção 3 (vocabulário de trabalho de ~640 formas, o mesmo antes e depois;
declaração = nome único por arquivo, nome e papel, incluindo chaves de objeto):

| Área | Declarações em português, antes | Depois |
|---|---|---|
| `tools/**` | 1.788 de 2.440 | 82 de 2.443 |
| `tests/**` | 773 de 1.024 | 45 de 1.032 |

As sobras, todas justificadas:

- **Chaves de objeto que são saída de JSON ou dado externo** (onda 3 e onda 4a): saída do gate e das
  ferramentas (`achados`, `erros`, `regra`, `nivel`, `mensagem`, `modulo`, `escopo`, `arquivo`, `linha`,
  `caminho`, `tipo`, `trecho`, `tudo`, `motivo`, `raiz`, `modulos`, `desde`, `compativel`, `consumidores`,
  `situacao`, `segredos`, `rodou`, `saida`, `ecossistema`, `pacote`, `severidade`, `titulo`, `perdoado`,
  `excecoesProblematicas`); config do autoteste do template (`tetoPorClasseS`, `sondaDocker`, `boot`,
  `desligamento`, `intervaloMs`, `linhasCauda`, …); nomes de cenário e variáveis de ambiente lidas por outro
  processo (`drena`, `estoura`, `SONDA_HI_*`). São 115 das 127 sobras.
- **Chave de objeto que nenhum código lê pelo nome** (dado de fixture): `dominio`/`conector` (papéis
  legados de manifesto antigo), `campoInventado`, `campoOutroChamariz`, `campoChamarizM`, `chaveNuncaLida`,
  `velho`, `vivo`, `artefato` (id de passo), `obrigatorios`, `aviso`/`erro` (valores de `nivel` usados como
  chave de contagem).
- **Fora desta onda** (onda 3): mensagens, ids de passo do autoteste do template (`criar-modulo`,
  `verificar-py`, `composition-autoteste`), flags próprias de PT (`--teto-ms`, `--ate-url`, …), chaves do
  JSON de saída do `shutdown-proof.py`, prefixos de pasta temporária que não citam a flag.

### O que cruza a fronteira de `tools/`

Quem lê o código de `tools/` por nome foi atualizado junto: `eslint.config.mjs` (`THRESHOLDS` e as chaves
`functionLines`/`nesting`/`params`), `skills/meta-verificacao-base/scripts/limiares.py` (o parser do
`thresholds.mjs`), `ids_citados.py` e `audit_base.py` (`EXTRACTION_ID`). Sistema modular recebe tudo isso
pela substituição de `tools/` (seção 1.2); um sistema que **leia** `THRESHOLDS`/`LIMIARES` do `tools/` por
conta própria (como o `eslint.config.mjs` da base) precisa do mesmo ajuste no plan.

## 6. Estado depois da onda 3 (mensagens e saídas)

Baseline histórico informado na onda 0: 873 strings classificadas como português entre 1.971 em `tools/**`
(277 em `gate/tests/cases.mjs`) e 329 entre 728 em `tests/**`. O contador e seu vocabulário exato eram
descartáveis e não foram preservados; por isso, não declarar um novo total de literais como se fosse uma
comparação exata com esses denominadores. Pela triagem e revisão dos pontos de emissão da etapa 6, ficaram
**0 mensagens operacionais em português**: CLI/usage, erros, saídas humanas do gate, resumos de autotestes,
passos/configuração do autoteste, flags próprias e diagnósticos usados pelo desenvolvedor estão em inglês.

Resíduos intencionais revisados:

- `tools/gate/rules/**` e `engine.mjs`: `erro`/`aviso` seguem como enum interno; `serializeFinding` os
  converte para `error`/`warning` e as chaves públicas do JSON do gate são inglesas.
- `tools/gate/tests/cases.mjs`: textos de domínio e snippets em português testam detecção, rotas e
  padrões adversariais; fixtures de `verify-catalog.mjs` e `verify-map.mjs` preservam doutrina portuguesa
  para testar os leitores de Markdown.
- `tools/sync-env.mjs`, `tools/sync-deploy.mjs`, `tools/generate-lint-config.mjs`, schemas e
  `tests/template-self-test.config.json`: strings que viram comentários/documentação gerada ou metadados
  descritivos permanecem em português conforme A4. Snippets de `create-adapter.mjs` preservam a forma
  real do molde que o autoteste substitui.
- `tests/template-self-test.mjs`: `module.json:name` de fixture permanece `Lento`; o id e a rota internos
  do módulo de shutdown foram renomeados para `zz-slow` e `/slow`.
- JSONs de `affected.mjs`, `ci-security.mjs` e `ci-dependencies.mjs` ainda têm chaves internas em português.
  Não são o contrato JSON do gate tratado em A2; migrá-las exigiria outro conjunto de consumidores. Essa
  fronteira foi mantida e deve ser decidida antes de uma onda dedicada a esses contratos.

## 7. Estado depois da onda 4 (bindings e domínio do molde)

**O medidor agora mora no repositório.** `specs/_estrutura_modulos/tests/measure-language.mjs`, com o vocabulário
fechado ao lado (`language-vocabulary.json`: 668 termos, **origem por termo**, 61 cognatos que nunca entram,
palavras funcionais só para texto livre). Não viaja para o projeto gerado. `node tests/measure-language.mjs`
imprime por escopo (`bindings`, `tools`, `tests`), categoria (`decl`, `member`, `string`, `data`) e raiz;
`--list --full` lista cada ocorrência; `--root <pasta>` mede outra árvore (um `git worktree` do commit
anterior dá o "antes" com a **mesma** régua); `--unknown` e `--unknown-strings` listam as palavras que o
vocabulário ainda não conhece, para revisão; `--selftest` está no `run-all-selftests`.

Origem do vocabulário, por termo (campo `origins`): `earendel-gate` (o vocabulário do sistema adotante),
`adr-025-dictionary` (o dicionário do `ADR-025`), `adr-024-ids` (palavras dos ids antigos que nenhum id novo
contém), `adr-023-domain` (o domínio do molde) e `tokenization-review` (levantamento por tokenização dos
identificadores e dos literais, revisado palavra a palavra). Palavra nova só entra com origem — e a falha mais
comum é de **cobertura do vocabulário**, não da régua: a onda 4 descobriu `desligamento`, `iniciado` e
`concluido` pelo `--unknown-strings` depois de a primeira medição dar zero literais.

| Escopo | Categoria | Antes (HEAD da onda 3) | Depois |
|---|---|---|---|
| `bindings/**` | declarações | 1.341 de 2.975 | **0** de 3.023 |
| `bindings/**` | acessos por ponto | 156 de 1.089 | **0** de 1.119 |
| `bindings/**` | literais de texto | 710 de 1.819 | **0** de 1.884 |
| `bindings/**` | palavras de arquivo de dado | 253 de 1.708 | **0** de 1.734 |
| `tools/**` | declarações | 77 de 2.747 | 77 de 2.747 |
| `tools/**` | literais de texto | 408 de 3.957 | 347 de 3.959 |

O vocabulário usado nos dois lados é o final (668 termos); o número "antes" é maior que o da seção 5 por isso.
As sobras de `tools/**` e `tests/**` são as de sempre, nomeadas na seção 6: chaves de objeto internas do
motor do gate (`escopo`, `nivel`, `regra`), chaves de saída de `affected`/`ci-security`/`ci-dependencies`
(`ADR-026`), `SEM_COBERTURA` no harness do gate e fixtures que leem ou exercitam prosa e código em português.

**O que cruza a fronteira e o plano de cada sistema precisa listar** (detalhe no `ADR-027`):
`consumes[].contract` com `GET /resumo`; `permissions` com `:ler`/`:escrever` (no `module.json` e no que o
*auth* devolve); `ui.pacote`; o marcador `<escopo>` (`project.json`, `package.json`, `pyproject.toml`);
a pasta `relatorios/` no `.gitignore`/CI; o código de erro e a mensagem que o front lê; e, para cada
tabela do molde (`<m>_metadados`, `<m>_auditoria`) e coluna (`arquivo`, `aplicada_em`, `titulo`, `acao`,
`sujeito`, `campos_alterados`), a migration que o **dono** do sistema decide (seção 1.4).

| Item | Onda | Quem aplica nos sistemas |
|---|---|---|
| identificadores de `bindings/**` | 4a | plan por binding do sistema (a substituição de `tools/` não os traz) |
| domínio do molde (rota, schema, permissão, código de erro, valor) | 4b | plan do sistema; **tabela e coluna em produção: migration do dono** |
