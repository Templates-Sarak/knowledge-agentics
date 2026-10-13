# Campanha de idioma (ADR-023 a ADR-027) — insumo da propagação

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

`propagate.py` (antes `propagar.py`): em sistema modular, `tools/` divergente vira `replace-policy` (antes `substituir-politica`). Renomear id, símbolo e
mensagem chega ao sistema pela substituição da pasta inteira — **sem migração de dado**, mas com dois
efeitos a conferir no plan:

- o `tools/` novo traz `gate/renamed-rules.json` — arquivo novo na pasta, que o sistema vendoriza junto;
- o gate novo reprova no sistema o que o antigo perdoava calado (exceção com id antigo, 1.1), então o plan de
  `tools/` e o de `config/compliance.json` vão **juntos**, na mesma execução.

### 1.3 Sistema com vocabulário de idioma próprio (onda 6 — aplicada na base)

`earendel-erp` é o sistema adotante que **já cobra** idioma por regra própria (`identificador-em-portugues`,
vocabulário fechado em `tools/gate/vocabulario.mjs`, 327 termos). A decisão 7 do `ADR-023` fixa **um arquivo
único** de vocabulário no template, e a onda 6 o entregou: `tools/gate/language-vocabulary.json`, lido pela
regra `portuguese-identifier` (gate), pelo medidor e pelo hook `padrao-idioma`. Na propagação o sistema migra o
dele para o do template (a união dos termos), em vez de manter dois — e, ao trocar a regra própria pela do
template, três consequências a conferir **no plan dele**:

- **o id muda** (`identificador-em-portugues` → `portuguese-identifier`): toda exceção dele em
  `config/compliance.json` citando o id antigo passa a ser **acusada** por `compliance-declared` (id fora do
  catálogo) — a troca de id e a vinda de `tools/` andam na mesma execução (§1.1);
- **o recorte difere do dele**: a regra do template cobre identificador de código e chave de config/manifesto,
  nunca comentário, string, valor de `texts.json` nem `module.json:name`; o que a regra própria cobrava além
  disso precisa ser decidido pelo dono, não herdado;
- **o vocabulário do template é a base**: os termos dele que faltarem entram **com origem** no arquivo único
  (decisão 6), nunca por "parecer português" — e cognato dele que o template já exclui continua excluído.

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
   `grep -h "^\s*id: '" specs/_estrutura_modulos/tools/gate/rules/*.mjs | sort -u | wc -l` → **82** (81 na
   medição da onda 0; a onda 6 acrescentou `portuguese-identifier`). A forma pós-onda 1 do catálogo é a que o
   `audit_base.py` (`cited_ids`, antes `ids_citados`) lê do código do gate.
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
`functionLines`/`nesting`/`params`), `skills/meta-verificacao-base/scripts/thresholds.py` (o parser do
`thresholds.mjs`), `cited_ids.py` e `audit_base.py` (`EXTRACTION_ID`). Sistema modular recebe tudo isso
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
fechado ao lado (`tools/gate/language-vocabulary.json` desde a onda 6; antes `tests/`: 668 termos, **origem por termo**, 61 cognatos que nunca entram,
palavras funcionais só para texto livre). Não viaja para o projeto gerado. `node tests/measure-language.mjs`
imprime por escopo (`bindings`, `tools`, `tests`), categoria (`decl`, `member`, `string`, `data`) e raiz;
`--list --full` lista cada ocorrência; `--root <pasta>` mede outra árvore (um `git worktree` do commit
anterior dá o "antes" com a **mesma** régua); `--unknown` e `--unknown-strings` listam as palavras que o
vocabulário ainda não conhece, para revisão; `--selftest` está no `run-all-selftests`.

Origem do vocabulário, por termo (campo `origins`): `adopter-vocabulary` (o vocabulário do sistema adotante `earendel-erp`; o id se chamava `earendel-gate` até a onda 5, quando passou a rótulo neutro porque o vocabulário viaja),
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

## 8. Estado depois da onda 5 (código da base, `.sarak/` e sobras do ferramental)

Esta seção registra o que a onda 5 aplicou. Ela é **código da base**, não doutrina do template: nada daqui
viaja para projeto gerado.

### 8.1 O medidor cobre a base

`measure-language.mjs` mede agora seis raízes: `bindings`, `tools`, `tests` (relativas ao template) e `skills`
(`skills/*/scripts/**`), `hooks`, `plugin` (relativas à base; `--base-root`). Ganhou `--only <prefixo>`,
`--check` (exit 1 se sobrar ocorrência não declarada) e `--exceptions`. As **exceções declaradas** moram em
`specs/_estrutura_modulos/tests/language-exceptions.json`: cada entrada tem arquivo, categoria, nomes ou trechos
e **motivo** (revisável; mensagem, flag, chave, enum, nome de caso e identificador nunca entram). Não viaja.

| Raiz | Antes (decl / acesso / string / dado) | Depois, não declarado | Declarado |
|---|---|---|---|
| `bindings` | 0 / 0 / 0 / 0 | 0 | 0 |
| `tools` | 77 / 52 / 347 / 70 | 0 | 5 decl, 42 strings, 70 dado |
| `tests` | 19 / 19 / 120 / 0 | 0 | 77 strings |
| `skills/*/scripts` | 1.746 / 60 / 1.810 / 70 | 0 | 96 decl, 277 strings, 8 dado |
| `hooks` | 96 / 17 / 108 / 34 | 0 | 10 decl, 10 strings, 17 dado |
| `plugin` | 12 / 0 / 49 / 0 | 0 | 1 string |

O que ficou declarado é **dado externo**: títulos e frontmatter em português que `generate_summary.py` e
`verify_parity.py` leem da documentação dos projetos; vocabulários de detecção sobre código de usuário (`senha`,
denylist, léxico de negócio); as tabelas `LEGACY_*` de leitura de estado antigo; nomes de pasta de skill e de
doutrina; e fixtures que provam a detecção de português.

### 8.2 Scripts renomeados (`git mv`)

| Antes | Depois |
|---|---|
| `scan_assinaturas.py` | `scan_signatures.py` |
| `auditar_docs.py` (+`.config.json`) | `audit_docs.py` |
| `inventariar_origem.py`, `verificar_entregavel.py`, `verificar_neutralidade.py` | `inventory_source.py`, `verify_deliverable.py`, `verify_neutrality.py` |
| `detectar_lixo.py` | `detect_junk.py` |
| `scan_segredos.py` | `scan_secrets.py` |
| `validar_docker.py`, `validar_monolito.py`, `validar_predeploy.py` | `validate_docker.py`, `validate_monolith.py`, `validate_predeploy.py` |
| `auditar_assets.py`, `auditar_seo.py` (+`.config.json`) | `audit_assets.py`, `audit_seo.py` |
| `scan_historico.py`, `revisar_diff.py` | `scan_history.py`, `review_diff.py` |
| `gerar_config.py`, `verificar_commit.py` | `generate_config.py`, `verify_commit.py` |
| `diagnosticar_terreno.py` | `diagnose_terrain.py` |
| `carimbo.py`, `comparar_arvore.py` | `stamp.py`, `compare_tree.py` |
| `propagar.py`, `aplicacao.py`, `relatorio.py` | `propagate.py`, `apply.py`, `report.py` |
| `ids_citados.py`, `limiares.py`, `contagens.py`, `manifestos.py`, `nomenclatura.py`, `paridade.py`, `ponteiros.py`, `proatividade.py`, `secoes.py` | `cited_ids.py`, `thresholds.py`, `counts.py`, `manifests.py`, `naming.py`, `parity.py`, `pointers.py`, `proactivity.py`, `sections.py` |
| `mapa.py`, `sistemas_nos_viajantes.py` | `map_schema.py`, `systems_in_shipped_files.py` |
| `gerar_resumo.py`, `verificar_paridade.py` | `generate_summary.py`, `verify_parity.py` |
| `.github/workflows/autoteste-template.yml` | `selftest-template.yml` (jobs `base-guard`, `template-selftest`, `template-selftest-docker`, `verify-migrations`) |

Ficam: pastas de skill, commands, agents e arquivos de hook (decisão 4); `init_repo.py`, `audit_base.py`,
`sast_scan.py`, `check_headers.py`, `parse_audit.py`, `scaffold_skill.py`, `validate.py/.mjs`, `sync_ide.py`,
`setup_env.py`. **Nomes instalados em projetos vivos ficam** (contrato com o projeto): `.agents/gerar_indice.py`
e `.githooks/verificar_commit.py` — só o conteúdo foi para o inglês. Renomeá-los exige migração coordenada.

Flags: `--raiz`→`--root` (todos os scanners e `audit_base.py`), `--escopo`→`--scope`, `--modulos`→`--modules`,
`--forcar`→`--force`, `--registrar`→`--register`, `--tipo`→`--kind`, `--nome`→`--name`, `--mapa`→`--map`,
`--conferir`/`--checar`→`--check`, `--arquivo`→`--file`, `--modulo`→`--module`, `--vocabulario`→`--vocabulary`,
`--termo`→`--term`, `--ignorar`→`--ignore`, e as da propagação: `--plano/--relatorio/--aplicar/--desfazer`→
`--plan/--report/--apply/--undo`, `--incluir-divergentes`→`--include-divergent`, `--adotar/--manter/--motivo`→
`--adopt/--keep/--reason`, `--permitir-base-suja`→`--allow-dirty-base`.

### 8.3 Estado persistido (decisão 6) e compatibilidade de leitura

Quem **escreve** grava só as chaves novas; quem **lê** aceita as antigas por um mapa centralizado, com teste
no `--selftest`. Snapshots datados não são reescritos.

| Formato | Quem escreve | Antigo → novo | Mapa de leitura (único) |
|---|---|---|---|
| `.sarak/base.json` | `stamp.py`, `apply.py` | `base_com_alteracoes_locais`→`base_dirty`, `data`→`date`, `tipo`→`kind`, `pacotes`→`packages`, `mantidos`→`kept` (`caminho/motivo/sha1_sistema/sha1_referencia`→`path/reason/system_sha1/reference_sha1`); pacote `template-modulos`→`module-template` | `stamp.normalize_stamp` (`LEGACY_STAMP_KEYS`, `LEGACY_KEPT_KEYS`, `LEGACY_PACKAGE_VALUES`) |
| `mapa.json` (base) | `stamp.py --register`, `apply.py` | `sistemas`→`systems`, `nome`→`name`, `caminho`→`path`, `raiz_git`→`git_root`, `tipo`→`kind`, `situacao`→`lifecycle`, `status_base`→`status_commit`; `ativo/adocao-posterior`→`active/later-adoption`, `desatualizado/pendente/atualizado`→`outdated/pending/updated` | `stamp.normalize_map` e `normalize_map_entry`; `map_schema.LEGACY_FIELDS` só dá a dica no audit |
| `.sarak/propagacao-<curto>.json` | `apply.py` | arquivo `propagation-<short>.json`; chaves em `LEGACY_MANIFEST_KEYS` e `LEGACY_MANIFEST_FILE_KEYS`; ações em `LEGACY_ACTION_VALUES` | `apply.normalize_manifest` e `manifest_names()` (acha o arquivo pelo nome antigo: o `--undo` de uma propagação feita antes continua funcionando) |
| backlog `.sarak/audit` | agentes (`code-diagnostico/references/backlog-format.md`) | `regra`→`rule`, `alvo`→`target`, `risco`→`risk`, `familia`→`family`, `catalogo`→`catalog`, `arquivo`→`file`, `achados`→`findings`…; arquivos `auditoria*`→`audit*`, `backlog-<data>`→`backlog-<date>` | instrução em prosa (nenhum script lê o backlog): **sem teste automático** |
| `.sarak/security`, `.sarak/git-audit` | agentes (`achados-format.md`; `git-especialista-repositorio/SKILL.md`) | `achados-<data>.json`→`findings-<date>.json` etc. (tabela nos próprios formatos) | idem, prosa |
| `config.json` dos scanners, `hooks/config.json` | scripts e projeto | chaves traduzidas (glossário) | `LEGACY_CONFIG_KEYS` por script; `normalizeLegacyKeys` em `hooks/_lib.js` |

### 8.4 Defeitos achados e corrigidos no caminho

- Os hooks liam `modo/ativo/minima/severidadeMinima` enquanto o `config/verification.json` do molde usa
  `mode/active/minimum/minimumSeverity`: a política do projeto era **ignorada em silêncio**. Agora é respeitada.
- `engine.mjs` (`--extraction`) desestruturava `{ modulo }` de `consumes[]`, cujo schema é `module` (lançaria
  erro). Nenhum caso de teste o cobre: recomendado acrescentar um.
- `affected.mjs` passava as opções por uma tabela `desde/raiz` obsoleta; `verify-routine.mjs` e a mensagem de
  `create-module.mjs` ainda usavam `--modulos`/`:artefato`; `padrao-limiares.js` apontava para
  `ferramentas/gerar-config-lint.mjs`, que não existe.
- Cinco scripts de skill ganharam `--selftest` (`scan_signatures`, `audit_docs`, `detect_junk`, `scan_history`,
  `review_diff`) e entram no registro do `run-all-selftests` (de 40 para 45 arquivos).

### 8.5 O que a onda 5 não fez, de propósito

- `tools/gate/renamed-rules.json` (os 70 ids antigos são o dado), `thresholds.mjs`, `EXTRACTION_ID` e
  `functionLines/nesting/params` mantêm o nome: o `eslint.config.mjs` e o `meta-verificacao-base` os leem por nome.
- Marcadores `<comando-verificar>`/`<comando-iniciar>` da doutrina: mudam em par com `create-project.mjs`.
  **Fechado na onda 6** (`<verify-command>`/`<start-command>`).
- `ui.modo` (`proprio|kit`) do `module.json` segue em português nas referências do `code-modulo`. **Fechado na
  onda 6**: o template, o schema e o gate já usavam `ui.mode`/`own` (`ADR-020`); sobravam as referências do
  `code-modulo` e do `init_repo.py`.
- Comentários e prosa emitidos em arquivos gerados (`sync-env`, `sync-deploy`): o `--check` compara com a cópia
  versionada do molde.
- A propagação (`SYSTEM_AREAS`) não compara `.githooks/`: o par `pre-commit`/`verificar_commit.py` de projetos
  vivos não é atualizado por ela. **Continua valendo** — o par agora se chama `verify_commit.py` em projeto
  **novo** (§9.4); em projeto existente o nome antigo segue, e a propagação reconhece os dois.

## 9. Fechamento — a onda 6 (a regra cobrada por máquina)

A lei deixou de ser convenção de leitura humana. Os números abaixo são os do fechamento; **remeça** antes de
citá-los num plan.

### 9.1 O que foi entregue

| Peça | Onde | Observação |
|---|---|---|
| a regra `portuguese-identifier` | `specs/_estrutura_modulos/tools/gate/rules/writing.mjs`; `04-regras.md` §4.7 e §7.2 | erro; **um id, dois territórios** (`check` no módulo, `checkRoot` na fiação e na config da raiz, uma vez por projeto); catálogo **81 → 82** |
| o tokenizador e o casamento | `tools/gate/language.mjs` | zero dependência; o medidor importa as **mesmas** funções |
| o vocabulário (arquivo único) | `tools/gate/language-vocabulary.json` (saiu de `tests/`) | 668 termos com origem por termo, 61 cognatos, 48 palavras funcionais (só texto livre, só o medidor) |
| o aviso do Nível 0 | `hooks/padrao-idioma.js`; `language.mode` em `hooks/config.json` e no schema de `verification.json` | `warn` por padrão; nunca bloqueia sem configuração; sem o par de arquivos, se cala e diz por quê |
| a prova de concordância | `tests/verify-language-parity.mjs` | gate × medidor, por arquivo; registrado no `run-all-selftests` |
| o caso do motor que faltava | `tools/gate/tests/engine-selftest.mjs` | `checkExtraction` com `consumes[]` na forma real (o defeito da onda 5 em §8.4) e o registro de dois territórios |

### 9.2 Concordância tokenizador × medidor

`node tests/verify-language-parity.mjs [--root <template>] [--list]` compara, por arquivo, os nomes em português
que cada lado enxerga. Dois corpos:

| Corpo | Medidor (árvore sintática) | Gate (léxico) | Concordam | Só o medidor | Só o gate |
|---|---:|---:|---:|---:|---:|
| template atual (`bindings`, `tools`, `tests`; sem exceções aplicadas) | 76 | 76 | 76 | 0 | 0 |
| árvore **anterior à campanha** (onde há português de verdade) | 2.943 | 2.968 | 2.943 | **0** | 25 (todas explicadas) |

Cada "só o gate" é o **uso** de um nome em português que o medidor não conta como declaração **naquele**
arquivo, e que ele vê declarado em outro: tipo importado (`Registro`, `Pagina`, `Colecao`), reexportado
(`RaizDoModulo`) ou passado como argumento nomeado (`criado_em=`, `nivel_minimo=`, `dados=` — o `ast` os guarda
como `keyword`, que o medidor põe em `member`). Também aparece o nome em `except … as causa`, que o `ast` guarda
como texto, e não como `Name`: aí o tokenizador é **mais completo** que o medidor. O que o tokenizador **não** vê
e o medidor vê: nada, na árvore medida — os dois casos que apareceram no caminho (atributo anotado
`self.x: T = …` e código dentro de `${…}` de template) foram corrigidos e viraram casos do `--selftest`.

### 9.3 Provas da regra

| Prova | Resultado |
|---|---|
| o molde e o projeto gerado passam limpos | zero erro nos três bindings (`run.mjs`, `selftest:template`) |
| identificador em português plantado no módulo reprova | `portuguese-identifier`, mensagem com arquivo, linha, nome e termo, apontando o `ADR-023` |
| o mesmo nome na fiação reprova contra `(root)` | caso `adapters/memory/` |
| chave de config em português reprova | caso `config key "mensagemVazia"` |
| o mesmo nome em comentário, string ou `texts.json` **não** reprova | chamariz (`strict-structure` esperado; `portuguese-identifier` seria id não declarado) com comentário, string, template, valor de `texts.json`, `module.json:name` e cognatos (`data`, `status`, `base`, `item`, `hash`, `config`) |

Casos novos por binding: **+4** (3 positivos e 1 chamariz) — TS 138 → 142, JS 138 → 142, Python 133 → 137; os
casos "sem cobertura" não mudam (4, 4 e 9). Nenhum caso existente perdeu cobertura: três fixtures de caso
(`linha` → `row`) e o caso de `compliance-declared` com chave `regra` (que **é** uma chave de config em
português, e agora declara o co-achado) foram ajustados.

### 9.4 As sobras da onda 5

- **Marcadores da doutrina** `<comando-verificar>`/`<comando-iniciar>` → `<verify-command>`/`<start-command>`,
  junto de `create-project.mjs`, que os substitui. Nenhum outro marcador **substituído por código** estava em
  português (os `<nome>`/`<caminho>` das referências são placeholder de prosa, documentação).
- **`ui.modo`/`proprio`**: o manifesto, o schema, o gate e a doutrina já eram `ui.mode`/`own` (`ADR-020`);
  as referências do `code-modulo` e a mensagem do `init_repo.py` foram acertadas.
- **Arquivos instalados com nome em português** — para **projeto novo**: `.agents/generate_index.py` e
  `.githooks/verify_commit.py`. **Projeto existente continua funcionando com o que tem** e adota o nome novo sob
  demanda, **sem migração automática**: o `init_repo.py` reconhece o par antigo no `pre-commit` (idempotência) e,
  se o projeto já o tem, reinstala **com o nome antigo** (para o hook dele não quebrar); `propagate.py` classifica
  os dois nomes. Para adotar: renomear os dois arquivos e as duas linhas do `.githooks/pre-commit`, num commit.
  Nenhum outro arquivo instalado tinha nome em português (varredura por vocabulário nos instaladores e no template).
- **Allowlist do gitleaks**: `.gitleaks.toml` dos três bindings passou de `regexTarget = "line"` para
  `"match"`. Medido com o gitleaks real: a URL interpolada passa; a **mesma linha** com `# password=<literal>`
  ao lado era **perdoada** com `line` (0 achados) e é **reportada** com `match` (1 achado). O caso está em
  `template-self-test.mjs` (usa o binário; sem ele, declara PULADO).
- **`.claude/settings.json`**: a regra de permissão do `audit_base.py` usa `--root`.
- **Caso do `--selftest` faltante**: `engine-selftest.mjs` (seis casos de `checkExtraction`).

### 9.5 Remedição final por raiz

Mesmo método da §3, vocabulário e exceções do fechamento. "Declarada" é ocorrência coberta por
`tests/language-exceptions.json` (arquivo + categoria + nome/trecho + **motivo**); **não declarada** é o que
`--check` reprova.

| Escopo | Arquivos | Declarações (PT não declaradas / total · declaradas) | Strings (idem) | Palavras de dado (idem) |
|---|---:|---|---|---|
| `bindings` | 154 | 0 / 3.023 · 0 | 0 / 1.884 · 0 | 0 / 1.734 · 0 |
| `tools` | 43 | 0 / 2.954 · 4 | 0 / 4.197 · 51 | 0 / 743 · 70 |
| `tests` | 8 | 0 / 1.211 · 0 | 0 / 1.616 · 82 | 0 / 23 · 0 |
| `skills` (scripts) | 59 | 0 / 3.764 · 96 | 0 / 5.489 · 273 | 0 / 652 · 8 |
| `hooks` | 10 | 0 / 544 · 10 | 0 / 620 · 17 | 0 / 138 · 20 |
| `plugin` | 2 | 0 / 89 · 0 | 0 / 213 · 1 | 0 / 0 · 0 |

**O que o projeto recebe (`bindings`, `tools`, `tests`): zero ocorrência em português não declarada**, e o
`bindings` — o que vira código do projeto gerado — **não tem nem exceção declarada**. As 227 raízes que restam
nas exceções são nome de pasta/skill/arquivo da base e da doutrina (`modulo` 98, `arquitetura` 70, `estrutura`
70, `padrao` 41, `regra` 40, `indice` 23, `mapa` 19, `arquivo` 16, `titulo` 16…), vocabulário de detecção de
código de usuário e fixtures que **precisam** de português para provar a detecção — cada uma com motivo.
