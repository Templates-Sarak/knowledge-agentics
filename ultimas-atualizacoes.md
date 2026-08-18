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
| 14 | `04-regras.md` §7.2 — nova entrada para `conformidade-declarada`, declarando os três limites da regra: não resolve `decisao` contra ADR de verdade (isso é da lista de exceções, §6), não valida que `regra` exista no catálogo, não valida que `modulo` exista — as duas últimas são *fail-closed* (a regra continua acusando, ninguém se machuca) mas **silenciosas**, e ficavam sem registro em lugar nenhum | `conformidade-declarada` era a única de 33 regras que citava `(§7.2)` na linha de catálogo sem ter entrada lá — os dois no-ops silenciosos tinham sido medidos numa revisão, mas perderam o registro quando as outras duas formas quebradas da exceção foram fechadas (linha 10) |
| 15 | As 5 violações de Nível 0 em `tools/` (`npx eslint specs/_estrutura_modulos/tools/`), a zero. `create-adapter.mjs`: `registrarFabrica{Ts,Js,Py}` agrupam `(porta, provedor, nomeSimbolo, caminhoImport)` num objeto — **e ganharam `--autoteste` primeiro** (14 casos, com fixtures fiéis ao molde real), registrado em `run-all-selftests.mjs` (17/17 → **18/18**, atualizado em `fe-sistema-modular.md` §4.1/§11.2). `gate/tests/run.mjs`: `operacoes` (42 linhas) extraiu o núcleo comum de `manifesto`/`manifestoRaiz`/`config` para `transformarJson`. `create-project.mjs`: `principal` (41 linhas) extraiu o relatório final para `imprimirProximosPassos`. Saída dos três, byte a byte igual à de antes — camada 2 confere **128/128 · 128/128 · 124/124, 76 regras com caso**, iguais | A rede era desigual e `create-adapter.mjs` era o ponto cego real — 3 das 5 violações, exercitado por NADA (nem `--autoteste`, nem a camada 3, nem citado fora de comentário). Construir a rede ANTES do refactor é o que revelou os dois bugs pré-existentes do §2, que não têm relação nenhuma com este refactor |
| 16 | `specs/_estrutura_modulos/tests/verify-routine.mjs` — o passo E (rejeição de forma inválida) trocou caminho fixo em `%TEMP%` por `mkdtemp`, alinhado ao passo F | Duas instâncias simultâneas de `verify-routine.mjs` colidiam no mesmo caminho fixo; a segunda apagava o alvo da primeira no meio do teste e morria sem saída — parecia defeito do template numa revisão e custou tempo real de diagnóstico. O `destino` em si continua **não** pré-criado (só o pai, por `mkdtemp`): a afirmação do passo é que a rejeição não cria o destino, e pré-criá-lo esvaziaria essa afirmação |
| 17 | `create-adapter.mjs` — `registrarFabricaPy`: âncora de importação movida do `)` do import multilinha (só casava sem uma segunda linha de import no meio) para a linha em branco + comentário que sempre a segue, tolerante a qualquer import extra que venha a existir | O molde real já tinha ganho `from adapters.postgres import ...` entre os dois, e a âncora antiga nunca casava — `--binding python` falhava para **qualquer** porta, sempre, não só uma nova. `--autoteste` (casos reescritos para provar sucesso em vez de bug) e a matriz ponta a ponta confirmam |
| 18 | `create-adapter.mjs` — as duas âncoras de "porta nova" (`registrarFabricaTs`, e — achado consertando a de TS — a gêmea em `registrarFabricaPy`) trocaram a assinatura de tipo fixa (`() => unknown`, `Callable[[], Any]`) por um recorte tolerante (`[^>]*`, `.*`) que casa a assinatura real do molde (`(modulo: ManifestoDescoberto) => unknown`, `Callable[[dict[str, Any]], Any]`) sem reabrir o mesmo drift se o parâmetro mudar de novo | `auth` era a única porta sem entrada em `FABRICAS`, e por isso a única que alcançava o ramo — mas o defeito valia para qualquer porta nova. A gêmea em Python **não estava no achado original**: apareceu testando a onda 4 (`verificadorDeToken`), que quebrou em Python pelo mesmo motivo que o TS |
| 19 | `tests/verify-catalog.mjs` ganhou `--conferir-vocabulario <raiz-do-template>`: compara por **conjunto** as cinco fontes que repetem `PORTAS_CONHECIDAS` à mão (`ports-vocabulary.mjs`, os dois schemas gerados dele, os três `packages/ports/index.*`), com ponteiro exato de fonte + porta faltando/sobrando. Registrado em `verify-routine.mjs` (25/25 → **26/26**, atualizado em `fe-sistema-modular.md` §11.2/§4.6). **Sem** cláusula "porta sem `FABRICAS`": exigiria lista de exceção editorial (toda porta sem provedor padrão entraria nela), e a decisão foi não escrevê-la | As cinco fontes nunca foram comparadas — foi essa lacuna que deixou os dois bugs das linhas 17-18 e a colisão de nome da linha 20 chegarem sem verificador nenhum notar. Construída **antes** da renomeação de propósito: a renomeação nasce verificada, não confiada |
| 20 | **ADR-010** (`doutrina/adr/decisoes.md`) — a porta `auth` virou `verificadorDeToken`: o nome, a interface (`interface Auth`/`class Auth(Protocol)`/`@typedef Auth` → `VerificadorDeToken`) e a entrada em `PORTAS_CONHECIDAS`, nos cinco lugares da linha 19, mais `doutrina/01-modulo.md:208` e `doutrina/00-arquitetura.md:118` (a tabela que cita a interface pelo nome). `composicao.ts` e `adapters/memory/index.ts` seguem a interface renomeada só na **anotação de tipo** (`import type { Auth }` → `VerificadorDeToken`) — `resolveAuth()`, `createDenyingAuth()`, o middleware `authentication` e o parâmetro `auth` de `createApp` continuam com o mesmo nome: são a auth **única** da fiação, uma interface **independente** (`_template/api/src/middlewares/index.ts`/`_template/core/ports/__init__.py`), não a porta renomeada | A interface tem um único método (`verify(token)`) — já era um verificador de token. `auth` acomodava também "gerenciar usuários", que na arquitetura Sarak é módulo à parte, alcançado por gateway, nunca por porta (ADR-002); e colidia de nome com a auth da fiação, duas declarações independentes chamadas igual. Matriz ponta a ponta (`repositorio`, `storage`, `notificador`, `verificadorDeToken`, três bindings): **exit 0 nos doze** |
| 21 | `tests/template-self-test.mjs` (camada 3) ganhou `criar-adapter:<porta>` — um passo por porta do vocabulário INTEIRO (`ports-vocabulary.mjs`, 7 hoje), reusando o projeto que os passos anteriores já geram — e `formatar-adapters` (`prettier --write`, só TS/JS) logo depois. Exit 0 **e** conteúdo: cada passo confere que a fábrica apareceu em `src/composicao.*`, não só o exit code. **3/3 bindings VERDE, 13/13 → 21/21 · 21/21 · 20/20 passos** (`fe-sistema-modular.md` §4.1/§11.2, `ultimas-atualizacoes.md` §4). Rodar isto pela primeira vez **exigiu dois consertos reais em `create-adapter.mjs`**, nenhum dos dois no achado original: `adapters/_adapter/__init__.py` (molde Python) ganhou `__init__(self, modulo: dict[str, Any])` — a classe é registrada DIRETO em `FABRICAS` (nunca um lambda), e sem esse construtor todo adapter Python falhava `mypy` na hora de nascer, sempre, para toda porta; e `NOME_GENERICO` (TS/JS) trocou `criarAdapter` por `createAdapter` — o nome REAL que os moldes `_adapter/index.{ts,js}` exportam, contra o qual a rescrita nunca batia, então TODO adapter TS/JS já criado guardava `export function createAdapter` no arquivo enquanto `composicao.*` importava um símbolo (`criarG`) que nunca tinha sido escrito — `tsc` reprovava, mas nada rodava `tsc` depois de um `create-adapter.mjs` real até este passo existir | Nada na cadeia automatizada exercitava `create-adapter.mjs` — só fixtures, cópias do molde, o mesmo mecanismo que produziu os bugs das linhas 17-18. Instalar a matriz achou os dois de cara, no primeiro run real: prova, medida (revertendo `NOME_GENERICO` e confirmando que a camada 3 reprova, depois restaurando), de que a rede pega o que a rede promete pegar |
| 22 | **Achado ① fechado (ADR-011).** `create-adapter.mjs`: chave de objeto CITADA nas duas âncoras de `registrarFabricaTs`/`registrarFabricaJs` (`'${provedor}': () => ...`) — provedor kebab-com-hífen deixou de quebrar sintaxe TS/JS. Python ganhou `pastaAdapter(binding, provedor)`: pasta/import convertem hífen→underscore (`adapters/disco_frio/`, `from adapters.disco_frio import DiscoFrio`), mas a IDENTIDADE continua kebab nos três bindings (CLI, `config/ports.json`, chave string em `FABRICAS`) — o TODO gerado usa um marcador à parte (`<provedor-pasta>`) pra apontar pro caminho físico real, não pra identidade. `template-self-test.mjs`: `provedorDoIndice` passou a gerar provedor COM hífen (`prov-<letra>`, vocabulário inteiro) — antes evitava hífen de propósito, o que escondia o próprio achado. Sweeping o vocabulário com provedor mais longo expôs um segundo achado, menor: `registrarFabricaPy` também escreve tudo numa linha só (mesma classe de `registrarFabricaTs`/`Js`), e isso já estourava os 110 caracteres do `ruff` em Python pra porta com dois provedores, sem folga nenhuma mesmo antes do hífen — Python ganhou o mesmo passo de formatação que TS/JS já tinha (`ruff format src/composicao.py`, `formatar-adapters-py`, logo após o último `criar-adapter`). Provado que a rede pega: revertendo os dois consertos, os três bindings viram VERMELHO (TS/JS no passo `formatar-adapters` — prettier recusa a chave sem aspas —, Python no mesmo passo, com `ruff` acusando `unformatted`/E501); restaurado, os três voltam a VERDE. **3/3 bindings VERDE, 21/21 · 21/21 · 20/20 → 21/21 · 21/21 · 21/21 passos** (`fe-sistema-modular.md` §4.1/§11.2, `ultimas-atualizacoes.md` §4). Limite novo documentado em `04-regras.md` §7.2 | Provedor kebab-com-hífen saía 0 nos três bindings com código gerado quebrado — TS/JS produzia chave de objeto inválida, Python produzia import impossível de resolver (hífen não é identificador). Um usuário seguindo a própria recomendação de `validarOpcoes` ("use kebab-case minusculo", ex.: `aws-s3`) quebrava os três. A alternativa de proibir hífen nos três bindings foi descartada por contradizer essa mesma mensagem de erro |
| 23 | `fe-sistema-modular.md` — três descrições realinhadas ao template: o §4.6 passou a dizer que a camada 3 **também cria um adapter por porta do vocabulário e formata o gerado**; o §2 deixou de afirmar *"exatamente esta árvore"* e agora aponta `ENTRADAS_PERMITIDAS` (`structure.mjs`) como lista normativa, citando as entradas de ambiente/build que o desenho omite; e o §10.4 deixou de ser *"pendência"* — o cache **sincroniza sozinho** onde `.git/hooks/pre-commit` roda `sync_ide.py --target all`, mas esse hook é **local e não versionado**, então o aviso segue valendo para clone novo, outra máquina ou CI | Eram divergências de **prosa**, não de número: as catracas comparam ids, contagens e vocabulário, e **nenhuma delas lê descrição**. O §4.6 escondia justamente a capacidade que derrubou quatro bugs desta campanha; o §2 fazia o leitor achar seis divergências inexistentes ao comparar o desenho com um módulo real; e o §10.4 contradizia a linha 7 deste mesmo §1 — o defeito que a §10.2 do próprio documento enuncia |

**Mudança de comportamento, desta vez sim.** O gate ganhou uma regra nova (`conformidade-declarada`,
a 76ª) e fechou o *fail-open* de `decisao` nas exceções — os dois achados que a rodada anterior
classificava como bloqueantes de produção (§2 antigo, ①–②). `specs/_estrutura_modulos/doutrina/` e
`tools/` foram tocados de propósito; a lista completa das linhas 6–21 é a mudança inteira.

**Avaliado e mantido de propósito:** `plugin/sarak_routing_table.md` e o mecanismo de sincronização
das IDEs. Foram levantados como defeito, examinados e **decidido manter** — o motivo técnico está no
§3.1, e mexer neles quebraria Antigravity e GPT.

---

## 2. Achados abertos

Nenhum no momento. O último fechado (①, provedor com hífen quebrando a geração de código nos três
bindings) está no §1, linha 22.

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
mudanças das linhas 6–21 do §1, e **confere**:

| Camada | Medido |
|---|---|
| 1 — gate em projeto novo | 0 erros (módulo + raiz) |
| 2 — o gate se testa | **128/128 · 128/128 · 124/124**, 76 regras com caso |
| 3 — o template se testa | **3/3 bindings VERDE, 21/21 · 21/21 · 21/21 passos** (achado ① fechado, §1 linha 22) |
| 4 — toda ferramenta se testa | **18/18**, zero órfão |
| `typecheck:tools` | sem saída |
| `verify-routine.mjs` (o §11.2 inteiro, automatizado) | **26/26 passos ok** |

Também conferem: 76 regras sem id duplicado, todas com `verificar()`; famílias 21/11/12/11/11/6/4;
escopos 58/14/4; níveis 72 erro / 4 aviso; `module.schema.json` com 19 obrigatórios e
`additionalProperties:false`; `project.json` mínimo; as três rotas obrigatórias; `verify-map: OK`; a
catraca (`verify-catalog.mjs`): `catalogo: OK — 76 ids, lei e código batem` e `vocabulario: OK — 7
portas, as cinco fontes batem`; projeto gerado citando `_estrutura_modulos` em **um** arquivo —
exatamente a linha declarada; os dois erros de `--modulos` do `init_repo.py` com a mensagem
prometida; e a matriz `create-adapter` (vocabulário inteiro, sete portas × três bindings, com
conteúdo conferido em `src/composicao.*`) **agora instalada na camada 3** — deixou de ser conferência
manual e passa em toda rodada de `npm run autoteste:template`, inclusive a semanal
(`.github/workflows/autoteste-template.yml`).

**Higiene, medida e limpa:** `tests/` = 107,9 KB em **exatamente 5 arquivos** (`verify-map.mjs`,
`verify-catalog.mjs` e `verify-routine.mjs` — as duas últimas, novas de uma rodada anterior —,
`template-self-test.mjs`, `run-all-selftests.mjs`); `npx eslint specs/_estrutura_modulos/tools/` em
**zero**; zero `node_modules`/`.venv` rastreados; zero
resíduo de `TODO`/`FIXME` no template; zero arqueologia em tempo passado; zero ponteiro quebrado na
doutrina; projeto gerado com **106 arquivos** (105 → 106: o schema novo de `conformidade.json` viaja
em `tools/`), sem marcador não substituído e sem harness de teste vazado.

> **Duas armadilhas de medição, registradas para quem repetir a verificação.** Contar escopo de regra
> por `grep` dá **78** — o `grep` pega texto de comentário; a contagem autoritativa é importar o
> `engine.mjs`. E procurar `TODO` no template acusa dezenas de falsos positivos, porque **"todo" é
> palavra portuguesa** (`TODO arquivo de texto`) — o discriminador é o contexto, nunca a palavra.
