# Últimas atualizações — base Sarak

> **O que este documento é.** O estado corrente do que **mudou** e do que está **aberto**. É o
> substituto vivo da antiga *seção temporária* do `fe-sistema-modular.md`: aquela seção tinha função
> real — dar contexto a quem verifica —, mas vivia dentro de um documento que se descreve como
> permanente, e por isso não tinha data de saída.
>
> **O que este documento NÃO é.** Não é a lei (é `specs/_estrutura_modulos/doutrina/04-regras.md`),
> não é a descrição do sistema (é o `fe-sistema-modular.md`) e **não é o registro da obra** — o
> "por quê" de cada decisão vive no histórico do git e nos ADRs. Aqui fica só o que um agente ou
> pessoa precisa saber **hoje**, antes de mexer.
>
> **A regra de manutenção:** item resolvido **sai daqui** e some — o histórico já o guarda. Item que
> só existe aqui e em lugar nenhum é candidato a virar ADR ou regra, não a envelhecer nesta lista.

**Última verificação completa:** 2026-08-15.

---

## 1. Mudanças aplicadas em 2026-08-15

| # | O que mudou | Por quê |
|---|---|---|
| 1 | `.claude/settings.json` — allowlist de **49 → 7** entradas | 12 apontavam para nomes de duas renomeações atrás (`ferramentas/`, `criar-projeto.mjs`, `validar.mjs`, `modulos/`); o resto era entulho de sessão única (`c:/tmp/rev-*`, `echo ""`, `set -e`). Ficou só o **genérico e recorrente** (venv, ruff, `audit_base.py`, `node -e`) |
| 2 | `.claude/settings.json` — removidos os dois `additionalDirectories` | Um apontava para `_estrutura_base/_templates` na raiz, que **não existe** (o real é `specs/_estrutura_base/_templates`); o outro para `Code/Template/.claude/skills/code-novo-modulo/`, skill superada pela `code-modulo`. Restaurar é uma linha, se algum deles fizer falta |
| 3 | `fe-sistema-modular.md` — removida a seção temporária (**698 → 593 linhas**) | Era 14% do arquivo, auto-declarada como *"remover depois da verificação"*. O que nela era **vivo** (achados abertos) veio para o §2 deste arquivo; o que era **histórico** (campanha de idioma, limpeza, correções funcionais) está no histórico do git |
| 4 | Removidos `mcp-servers/clockify` e `mcp-servers/toggl` | Diretórios vazios e obsoletos. Não restou nenhum diretório vazio no repositório |
| 5 | `fe-sistema-modular.md` — **§11 reescrito** (593 → 682 linhas), mais o §5.2 e uma nota no §4.1 | O roteiro não era executável: **dois comandos falhavam como escritos** (`node tools/create-project.mjs` e a camada 1 do §4.1 — não existe `tools/` na raiz da base, e o documento nunca separava *"rode na base"* de *"rode no projeto"*), a linha do §4.2 **não era um comando** e o caminho óbvio dela produzia divergência falsa, e o roteiro cobria ~1/3 das afirmações medíveis. Agora tem pré-requisitos, marcador `[base]`/`[projeto]`, *exit code* por passo, limpeza no início e no fim, e os checks que faltavam (camada 1, os três `--conferir`, famílias/escopos, `additionalProperties`, `project.json`, `tests/` com 3 arquivos, vazamento de `_estrutura_modulos`). **Rodado ponta a ponta: todos os passos fecham** |
| 6 | `tools/gate/context.mjs` — `carregarExcecoes` resolve `decisao` contra ADRs reais de `specs/adr/*.md` (título `## ADR-NNN`), em vez de aceitar qualquer string truthy | Fechava o único *fail-open* medido: `{"decisao": "vide bilhete na geladeira"}` perdoava uma violação real, exit 0. Agora string inventada e ADR inexistente **reprovam** (mensagem nomeando o motivo); só ADR de verdade perdoa |
| 7 | `plugin/sync_ide.py` — nenhuma mudança de código | Confirmado que `.git/hooks/pre-commit` já roda `python plugin/sync_ide.py --target all` a cada commit, depois do `audit_base.py`. A pergunta do achado antigo era operacional ("isso sincroniza sozinho?"), e a resposta é sim — nada para consertar |
| 8 | `specs/_estrutura_modulos/tests/verify-catalog.mjs` (novo) — compara os ids do `engine.mjs` com as linhas de tabela de `04-regras.md`, registrado em `run-all-selftests.mjs` | Nada amarrava o catálogo da lei ao registro do código — foi o que deixou `tests`/`contract` entrarem na lei sem o gate notar (linha 9). Construído **antes** da correção de propósito: faz a correção nascer verificada, não confiada |
| 9 | `04-regras.md` — ids `tests`→`testes`, `contract`→`contrato` (só a **coluna de id** e citações de **regra**; `contract/openapi.yaml` e `tests/domain/`, que são **pasta**, ficaram como estavam) | Resíduo da campanha de idioma do ADR-009: a lei citava um id que o `engine.mjs` nunca teve. A catraca nova (linha 8) confirma: `catalogo: OK — 76 ids, lei e código batem` |
| 10 | `config/conformidade.json` ganhou schema (`tools/gate/schemas/conformidade.schema.json`) e regra (`conformidade-declarada`, raiz) — **75 → 76 regras**, com caso novo em `gate/tests/cases.mjs` e os números atualizados em `fe-sistema-modular.md`, `04-regras.md`, `adr/decisoes.md` e `skills/padrao-escrita/SKILL.md` | Era o único config sem dono: JSON malformado caía num catch silencioso (exit 0), chave em inglês (`module`/`rule`) falhava calada sem dizer por quê. `decisao` continua sendo resolvido pela regra da linha 6 — este item só cobre a **forma** |
| 11 | `commands/code1-auditar.md:22` — `modulos/*/modulo.json` → `modules/*/module.json` | O `Glob` nunca casava (nomes de duas renomeações atrás); todo projeto template caía na topologia `modular-legado` por acidente, e o arquivo estava meio-migrado — parecia atual sem estar |
| 12 | `specs/_estrutura_modulos/tests/verify-routine.mjs` (novo) — roda o §11.2 inteiro (A–G) como um comando, registrado em `run-all-selftests.mjs` | §11.2 já cobria toda afirmação medível mas dependia de alguém lembrar de rodar. Fecha também a lacuna que a camada 2 sozinha não fechava: `gate/tests/run.mjs` conta *"N regras com caso de teste"* mas nunca comparava contra `REGRAS.length` — agora compara e reprova se divergir |
| 13 | Três contagens de regra corrigidas em `tools/` (`affected.mjs:5` 73→76, `contract-compatible.mjs:12` 74→76, `gate/context.mjs:39` 57→58), mais `gate/README.md:13` (3→4 regras globais, achado durante a varredura). `verify-catalog.mjs` ganhou um terceiro argumento opcional — `--conferir <lei> <engine> <raiz-de-tools>` — que varre `tools/**` atrás de *"N regras com caso"*/*"N regras suas"* defasada | As três (quatro, com o achado extra) defasavam havia campanhas sem verificador nenhum notar — nem a rodada anterior, nem a catraca nova (que só compara ids, não número em prosa). A catraca cresceu só até onde erra para o lado seguro: varre `tools/**` (frase sempre no presente), nunca `.md` — lá a mesma palavra narra transição histórica correta (*"75 → 76 regras"*) que um regex ingênuo acusaria como defeito. Limite documentado em `04-regras.md` §7.2 |

**Mudança de comportamento, desta vez sim.** O gate ganhou uma regra nova (`conformidade-declarada`,
a 76ª) e fechou o *fail-open* de `decisao` nas exceções — os dois achados que a rodada anterior
classificava como bloqueantes de produção (§2 antigo, ①–②). `specs/_estrutura_modulos/doutrina/` e
`tools/` foram tocados de propósito; a lista completa das linhas 6–12 é a mudança inteira.

**Avaliado e mantido de propósito:** `plugin/sarak_routing_table.md` e o mecanismo de sincronização
das IDEs. Foram levantados como defeito, examinados e **decidido manter** — o motivo técnico está no
§3.1, e mexer neles quebraria Antigravity e GPT.

---

## 2. Achados abertos

Os dois primeiros vieram da **revisão da rodada de 2026-08-15** — a execução procede e foi confirmada
por medição (§4), inclusive o *fail-open* sob ataque direto; estes são o que a revisão encontrou por
cima dela. O terceiro é anterior e segue como estava.

**① `conformidade-declarada` é a única regra que cita `(§7.2)` sem ter entrada lá.**
Medido: **33 regras** citam `(§7.2)` na linha de catálogo do `04-regras.md`; **32 têm** a entrada
correspondente. A linha de catálogo da regra nova é densa e já declara o limite principal (*"**Não**
resolve `decisao` contra um ADR de verdade — isso é a própria lista de exceções"*), mas o ponteiro
`(§7.2)` fica pendurado, quebrando a convenção que as outras 32 seguem.

**② Dois no-ops silenciosos da exceção perderam o registro ao serem resolvidos os outros dois.**
O achado antigo listava **quatro** formas quebradas de exceção. A rodada fechou duas; as outras duas
seguem silenciosas — e, ao sair de "achado aberto" para "resolvido" (§1, linha 10), o registro delas
saiu junto. Medido depois da correção:

| Forma | Estado |
|---|---|
| JSON malformado | ✅ `[conformidade-declarada] nao e JSON valido` |
| chaves inglesas (`module`/`rule`) | ✅ `campo obrigatorio ausente` |
| `regra` com id inexistente | ⚠️ **no-op silencioso** — a exceção não perdoa nada e ninguém diz por quê |
| `modulo` inexistente | ⚠️ **no-op silencioso** — idem |

As duas são *fail-closed* (a regra continua acusando, ninguém se machuca) e por isso **não são
urgentes** — mas a lei da casa é explícita: *"lacuna conhecida é aceitável; lacuna escondida não"*
(§7 do `04-regras.md`). Hoje elas não estão em lugar nenhum.

**① e ② fecham juntos**, numa entrada de `conformidade-declarada` no §7.2 que declare os três limites:
não resolve `decisao` (isso é da lista de exceções), e não valida que `regra`/`modulo` existam.

**③ `tools/` viaja com 5 violações do Nível 0 do próprio template.** *(anterior à rodada)*
`max-params` (5 parâmetros) em `create-adapter.mjs` ×3, e funções de 41 e 42 linhas em
`create-project.mjs` e `gate/tests/run.mjs`. **É refatoração, não ponteiro** — precisa de plano
próprio, e por isso não entrou na rodada de 2026-08-15.

### 2.1 Ordem sugerida

**① e ② juntos** — a mesma regra (`conformidade-declarada`), uma entrada só de §7.2 para os três
limites. **③** continua pedindo plano próprio.

---

## 3. Decisões registradas — não são achados

> Esta seção existe para **evitar falso achado**, no mesmo espírito do §8 do `fe-sistema-modular.md`:
> o que está aqui é **decisão tomada, não lacuna**. Um revisor que levante um destes itens como
> defeito está reabrindo assunto fechado — e o motivo técnico está escrito para que não precise.

### 3.1 `plugin/sarak_routing_table.md` fica como está *(decidido em 2026-08-15)*

A tabela é gerada por `plugin/sync_ide.py` com **~40 caminhos absolutos** e é versionada. Foi
levantada como defeito numa revisão e **a decisão é manter**, porque funciona corretamente e porque
a leitura original estava errada em dois pontos:

**O caminho absoluto é necessário, não acidental.** A tabela **não é lida de dentro do repositório**.
O `sync_ide.py` (linhas 162-166) instrui o usuário a colar, **uma única vez**, nas *Regras Globais* de
cada IDE, a frase *"leia o arquivo de rotas centralizado em `<caminho absoluto>`"*. Nesse contexto o
diretório de trabalho é **o projeto-alvo**, nunca a base. Caminho relativo resolveria contra o
projeto errado e falharia **em silêncio** — sem erro, apenas skills que "não existem". Portanto:
**não tornar os caminhos relativos.** Isso quebraria Antigravity e GPT.

**O uso real é local e multi-agente** (Claude, Antigravity, GPT), com uma máquina. O `sync_ide.py`
espelha a base para o cache do Claude (`~/.claude/plugins/cache/…`) e para o Antigravity
(`~/.gemini/config/plugins/sarak/`), e regenera a tabela a cada execução. Versionar a saída é
redundante, não incorreto.

**O limite conhecido, declarado em vez de escondido:** se a pasta da base mudar de lugar, rodar o
`sync_ide.py` regenera a tabela — mas **a frase colada nas Regras Globais de cada IDE continua
apontando para o endereço antigo**, e nada detecta isso. O sintoma é o pior possível: o agente não
acha a tabela e segue sem o roteamento, sem avisar. **Mover a base exige recolar a frase nas IDEs**,
manualmente. Fica registrado aqui porque é o único passo do fluxo sem verificador.

**Divergência menor, aceita:** `skills/meta-verificacao-base/scripts/ponteiros.py` declara a tabela
em `GERADOS` (*"não existem num clone limpo"*), enquanto ela está rastreada. A lista só suprime falso
positivo, então a divergência é inofensiva. Na mesma lista, `antigravity_rules.txt` e
`claude_instructions.txt` constam como gerados mas **o `sync_ide.py` não gera mais nenhum dos dois** —
declaração morta, também sem consequência.

### 3.2 Referência — o que torna um plugin público

Publicar **não** é consequência de usar. Um plugin é um diretório com `.claude-plugin/plugin.json`;
a instalação passa por um *marketplace* (`.claude-plugin/marketplace.json`), que pode ser um
repositório **privado**, um **público** ou um **caminho local** — o desta base aponta `"source": "./"`,
ou seja, ela é o próprio marketplace. **O que determina visibilidade é a origem ser pública, nunca a
existência do manifesto.** A base pode viver como plugin privado indefinidamente.

Se um dia a publicação entrar em pauta, dois pré-requisitos entram junto: os caminhos pessoais saem
da árvore, e o histórico do git passa pelo `/git1-auditar` — caminho pessoal e segredo vazam pelo
mesmo caminho.

---

## 4. Verificado verde em 2026-08-15 *(não repita sem motivo)*

Toda afirmação numérica do `fe-sistema-modular.md` foi conferida contra o repositório, depois das
mudanças das linhas 6–12 do §1, e **confere**:

| Camada | Medido |
|---|---|
| 1 — gate em projeto novo | 0 erros (módulo + raiz) |
| 2 — o gate se testa | **128/128 · 128/128 · 124/124**, 76 regras com caso |
| 3 — o template se testa | **3/3 bindings VERDE, 13/13 passos** |
| 4 — toda ferramenta se testa | **17/17**, zero órfão |
| `typecheck:tools` | sem saída |
| `verify-routine.mjs` (o §11.2 inteiro, automatizado) | **25/25 passos ok** |

Também conferem: 76 regras sem id duplicado, todas com `verificar()`; famílias 21/11/12/11/11/6/4;
escopos 58/14/4; níveis 72 erro / 4 aviso; `module.schema.json` com 19 obrigatórios e
`additionalProperties:false`; `project.json` mínimo; as três rotas obrigatórias; `verify-map: OK`; a
catraca nova (`verify-catalog.mjs`, agora também varrendo contagem em `tools/**`): `catalogo: OK — 76
ids, lei e código batem`; projeto gerado
citando `_estrutura_modulos` em **um** arquivo — exatamente a linha declarada; e os dois erros de
`--modulos` do `init_repo.py` com a mensagem prometida.

**Higiene, medida e limpa:** `tests/` = 80,8 KB em **exatamente 5 arquivos** (`verify-map.mjs`,
`verify-catalog.mjs` e `verify-routine.mjs` — as duas últimas, novas desta rodada —,
`template-self-test.mjs`, `run-all-selftests.mjs`); zero `node_modules`/`.venv` rastreados; zero
resíduo de `TODO`/`FIXME` no template; zero arqueologia em tempo passado; zero ponteiro quebrado na
doutrina; projeto gerado com **106 arquivos** (105 → 106: o schema novo de `conformidade.json` viaja
em `tools/`), sem marcador não substituído e sem harness de teste vazado.

> **Duas armadilhas de medição, registradas para quem repetir a verificação.** Contar escopo de regra
> por `grep` dá **78** — o `grep` pega texto de comentário; a contagem autoritativa é importar o
> `engine.mjs`. E procurar `TODO` no template acusa dezenas de falsos positivos, porque **"todo" é
> palavra portuguesa** (`TODO arquivo de texto`) — o discriminador é o contexto, nunca a palavra.
