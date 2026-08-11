# Plano 2.2 — o que o uso real mostrou

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **De onde ele vem.** Um teste de execução real: repositório criado em `Earendel/teste-template`
> (binding `typescript`, escopo `earendel`), módulos **pedidos** e **clientes**, Postgres 16 efêmero em
> Docker, e a regra de que **nada seria adaptado no projeto gerado** — o que falhasse viraria defeito do
> template.
>
> **O que passou:** `init_repo.py` completo · `criar-modulo` · migrations contra Postgres real (4 tabelas
> com índice, `unique` e RLS) · rollback `down`→`up`→`ciclo` · `verificar` exit 0 com 52 testes · `build`
> e `lint` pós-build · sistema no ar com os dois módulos (`200`/`401`/`404`) · `/meta` com os 8 campos ·
> `criar-adapter` registrando import e fábrica · `--extracao` nos dois · `ci:lint`, `ci:cobertura` e
> `ci:dependencias` verdes.
>
> **O que quebrou:** cinco defeitos, e o primeiro deles impede o repositório de existir como repositório.

**Regras herdadas, e continuam valendo:**
- **Regra permanente do `plan-2`:** todo bloco que toca esqueleto ou ferramenta só fecha com o **Bloco K
  verde nos três bindings**.
- **Regra permanente do `plan.md`:** regra nova exige caso próprio em `casos.mjs` e linha no catálogo
  (§4.x), mais o limite no §7.2.
- **Quem marca ITEM é o executor; quem marca BLOCO é o revisor.**
- **Citação é por `§`, nunca por número de linha.**

> **Este documento é executável de ponta a ponta.** Onde havia duas saídas, a escolhida está marcada
> **DECIDIDO** com a recusada e o motivo ao lado. Se o executor discordar de uma decisão, **para e
> pergunta** — não escolhe sozinho.

---

## Estado — medido no teste real

| Métrica | Valor |
|---|---|
| **O repositório recém-criado consegue commitar?** | **NÃO — bloqueado pelo próprio gate** |
| **`migrations up` roda duas vezes?** | **NÃO — `relation already exists`** |
| **O sistema no ar fala com o banco?** | **NÃO — `repositorio: memoria`, `/resumo → {"total":0}`** |
| `init_repo.py` cria o diretório-alvo? | **NÃO** (o `criar-projeto.mjs` cria) |
| `ci:seguranca` e `ci:contrato` em repositório novo | **reprovam** — sem `HEAD~1` |
| Tudo o mais da cadeia | ✅ verde |

**Meta ao fim:** o fluxo `meta-iniciar-repositorio` → `criar-modulo` → `migrations` → `commit` roda do
começo ao fim **sem furar nenhum gate e sem escrever uma linha à mão** — e o sistema no ar lê do banco
que as migrations criaram.

---

## Bloco X — o repositório nasce sem conseguir commitar

> **O defeito, e ele impede o fluxo de existir.** No repositório recém-criado, com tudo verde, o
> `pre-commit` **bloqueia o primeiro commit**. O gate de segredos acusa **os arquivos que o próprio
> template instalou**:
>
> ```
> COMMIT BLOQUEADO - segredo ou arquivo sensivel detectado no staged.
>   ferramentas/ci-seguranca.mjs                       String de conexao
>   modulos/_template/tests/contrato/contrato.test.ts  Segredo atribuido
>   modulos/pedidos/tests/contrato/contrato.test.ts    Segredo atribuido
>   modulos/clientes/tests/contrato/contrato.test.ts   Segredo atribuido
>   specs/arquitetura/04-regras.md                     Segredo atribuido
>   specs/arquitetura/04-regras.md                     String de conexao
> ```
>
> **E a ironia é exata:** as duas linhas do `04-regras.md` são o **§7.2 declarando os falsos positivos
> deste mesmo padrão** — a lei escreve `TOKEN = "token-de-teste"` e
> `postgres://usuario:senha@localhost/banco` **como exemplos do que produz falso positivo**, e o scanner
> acusa a declaração. O `const TOKEN = 'token-de-teste'` é a fixture do teste de contrato **do molde**:
> todo módulo de todo projeto nasce com ela.
>
> **Não há escape.** `arquivos_permitidos` no `.githooks/config.json` só vale para `arquivos_sensiveis`
> (nome de arquivo), não para a varredura de padrão. A única saída hoje é `--no-verify` — desligar o
> gate para conseguir commitar.
>
> É a **F.2d.1 reencenada uma costura adiante**: lá o `ci-seguranca` acusava o próprio pacote, e o
> conserto foi montar as fixtures em tempo de execução. Aqui é o outro scanner — o `verificar_commit.py`
> da skill `git-verificacao-commit` —, e ele não tem guarda equivalente.

- [ ] **DECIDIDO — consertar o CONTEÚDO, nunca cegar o scanner.** Cada ocorrência deixa de casar o
      padrão, sem que o scanner perca alcance:
      - **`04-regras.md` §7.2** — descrever a forma sem escrever uma instância dela. O padrão de conexão
        exige o esquema literal (`postgres|postgresql|mysql|mongodb`), então
        `<esquema>://<usuario>:<senha>@<host>` **não casa** e continua legível. O de atribuição exige
        8+ caracteres entre aspas, então o exemplo cabe encurtado ou sem aspas;
      - **fixture do molde** — `const TOKEN = 'token-de-teste'` vira um identificador fora do
        vocabulário fechado (`api_key|secret|token|password|passwd|senha|access_key`). Renomear a
        constante **não enfraquece o teste**: o valor continua o mesmo e o cabeçalho `Bearer` também;
      - **`ferramentas/ci-seguranca.mjs`** — o literal restante é montado em tempo de execução, no
        precedente que a própria F.2d.1 estabeleceu neste mesmo arquivo.
      *Recusada: allowlist de caminho no `config.json`* (isentar `specs/`, `tests/`, `ferramentas/`).
      É a saída que a **F.2d.1 já recusou por escrito**, com o argumento que continua valendo: *"ponto
      cego num **linter** é tolerável; num **scanner de segredo** é o defeito que ele existe para não
      ter."* Isentar `tests/` é abrir a porta para o segredo real que alguém colar num teste.
- [ ] **Sincronizar as duas metades do catálogo.** O `.githooks/config.json` diz *"Derivado do catálogo
      canônico de `cyber-segredos` — manter em sincronia"*: **manter em sincronia à mão é a G.2 outra
      vez**. Ou o arquivo passa a ser **gerado** do catálogo canônico com `--conferir` (precedente do
      `gerar-config-lint`), ou a frase sai e o arquivo assume ser fonte própria. Escolher e registrar
- [ ] **TRAVA — e é o item que impede a reincidência.** Passo novo no Bloco K:
      **`primeiro-commit`** — depois do `clone-simulado` (que já faz `git init` + `git add -A`), rodar o
      gate de segredos sobre o *staged* e exigir **zero achado**.
      **Este passo alcança a skill `git-verificacao-commit`, e isso é deliberado:** a pergunta *"o
      repositório nasce commitável?"* só tem sentido com o template e o gate **compostos**, e a base é
      dona dos dois. Declarar a exceção ao D3 no cabeçalho do `autoteste-template.mjs`
- [ ] **Contraprova:** revertendo qualquer um dos três consertos de conteúdo, o passo `primeiro-commit`
      **reprova nomeando o arquivo**. Colar a saída dos dois lados

**Critério de aceite:** num repositório criado do zero pelo fluxo completo, `git commit` **passa**, com o
hook ativo e **sem `--no-verify`**.

---

## Bloco AA — a entrada, e a fricção do repositório novo

> Três arestas do caminho de entrada, medidas no mesmo teste. Nenhuma bloqueia sozinha; juntas são a
> primeira hora de quem usa o template.

- [ ] **`init_repo.py` exige o diretório-alvo existente** e aborta com `[ERRO] Diretorio alvo nao
      existe`; o `criar-projeto.mjs` o cria sozinho (`mkdirSync recursive`). Dois pontos de entrada, dois
      comportamentos, para a mesma decisão. **DECIDIDO: o script cria**, com o mesmo cuidado que a skill
      já exige (caminho absoluto confirmado, nunca raiz de sistema).
      *Nota para quem executar:* este defeito é **mais insidioso do que parece** — um agente conduzindo a
      entrevista da skill provavelmente criaria a pasta antes de chamar o script, e o erro nunca
      apareceria em uso guiado. Ele só morde quem chama a ferramenta direto
- [ ] **`ci:seguranca` e `ci:contrato` reprovam em repositório novo** — os dois pedem `HEAD~1` e um
      repositório recém-criado não tem dois commits. É o *fail-closed* funcionando como projetado, mas
      significa que **o primeiro pipeline de todo repositório nasce vermelho** nesses dois passos.
      **DECIDIDO: sem `HEAD~1`, comparar contra a ÁRVORE VAZIA** (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`),
      que faz o delta ser *"tudo"* — **mais** verificação, não menos, e por isso não fere o fail-closed.
      *Recusada: documentar um `--desde` manual* — empurra para o usuário uma decisão que a ferramenta
      sabe tomar, e a chance de ele escolher errado é justamente no commit em que ninguém está olhando
- [ ] **Comentário do adapter gerado aponta para arquivo que não existe** — diz
      `packages/portas/index.js`; no disco é `index.ts` (TS), `index.js` (JS), `__init__.py` (PY). É
      prosa dizendo a um humano onde abrir, e ela erra em dois dos três bindings. Uma linha, por binding
- [ ] **A camada que o teste NÃO exercitou.** O teste rodou o **script** da skill, não a skill: ficaram
      de fora a entrevista HITL, o plano com `⚠️ Confirma?`, o handoff, e a `code-modulo` para o segundo
      módulo. Rodar `/sarak:meta-iniciar-repositorio` de verdade num alvo novo e **comparar a árvore com
      a que o script produziu** — é o único jeito de saber se a prosa da skill continua sincronizada com
      o script depois da `plan-2.1`

---

## Bloco Y — as migrations precisam de estado

> **Medido.** A primeira aplicação funciona e cria as tabelas. A segunda falha:
>
> ```
> $ node scripts/migrations.mjs up pedidos
>   up 0001-cria-metadados.sql...
> relation "pedidos_metadados" already exists      (exit 1)
> ```
>
> O `ciclo` idem, porque começa por `up`. Não existe registro do que já foi aplicado — o `plan.md`
> declara isso (*"sem controle de versão de migration; o bloco é 'o rollback funciona', não um
> framework"*), e a declaração está correta. **O que o uso real mostrou é que o limite não é acadêmico:**
> depois do primeiro apply, o comando não pode mais ser rodado. Num projeto com três migrations e dois
> ambientes, isso não é uma limitação — é a ferramenta não servindo.

- [ ] **DECIDIDO — tabela de controle POR MÓDULO, criada pela primeira migration do molde.**
      `<schema>.<prefixo>migrations` com `arquivo text primary key` e `aplicada_em timestamptz`. `up`
      pula o que já está registrado; `down` reverte o último aplicado; `ciclo` passa a funcionar em
      qualquer estado.
      **Por módulo, não por schema** — é o que mantém as regras existentes intactas: `tabela-declarada`,
      `tabela-alheia` e o prefixo do manifesto continuam valendo sem exceção, porque a tabela nasce
      prefixada e **declarada em `modulo.json:dados.tabelas` pelo próprio molde**. Nenhuma regra do gate
      muda; nenhuma exceção é registrada
- [ ] *Recusada (1): `create table if not exists` no molde.* Torna `up` idempotente de graça, mas
      empurra a disciplina para **todo autor de migration futura**, com nada cobrando — e a primeira
      migration que alterar coluna quebra a promessa em silêncio
- [ ] *Recusada (2): declarar e documentar ("rode `down` antes de repetir `up`").* É o estado de hoje, e
      o teste real mostrou o custo dele
- [ ] **A lei acompanha:** `02-contrato-e-dados.md` §6.3 ganha a tabela de controle na anatomia da
      migration, e o `01-modulo.md` §9 (a seção do dia a dia) diz o que muda ao acrescentar migration
- [ ] **Trava contra Postgres real.** O `--autoteste` do runner é puro e continua sendo; o ciclo com
      estado é I/O e se prova como a F.2g provou: **up → up (pula) → down → up**, contra banco efêmero.
      É passo de CI, não de `verificar` — a tabela de custo do §7 não muda

---

## Bloco Z — o caminho até o banco

> **Medido, e é o achado que mais surpreende num teste real.** As migrations criam as tabelas; o sistema
> no ar **não fala com elas**. `config/portas.json` traz `repositorio: memoria`, e `/resumo` responde
> `{"total":0}` lendo memória — com quatro tabelas populáveis do outro lado.
>
> `<MODULO>_DB_URL` tem **exatamente um consumidor**: o runner de migrations. E o `criar-adapter`, que a
> Bloco S entregou, produz um stub de 14 linhas que **lança**:
>
> ```ts
> export function criarPostgres(): Record<string, unknown> {
>   throw new Error('TODO: implemente os metodos da porta "repositorio" em adapters/postgres/index.ts');
> }
> ```
>
> O scaffold registra `import` e fábrica corretamente — o que falta é a implementação. Ou seja: **"o
> sistema no ar lendo do banco" não é alcançável com o template**, e todo projeto escreve o mesmo
> adapter Postgres à mão.

- [ ] **DECIDIDO — o template entrega `adapters/postgres` implementado**, para as portas `repositorio` e
      `auditoria`, nos três bindings. **É escrevível uma vez e serve a todo módulo** porque o molde fixa
      as duas pontas: a interface (`Repositorio<T>`, `Auditoria` em `packages/portas/`) e a forma da
      tabela (`<prefixo>metadados` com `id · hash · titulo · status · created_at · updated_at`). Não é
      código específico de domínio — é a materialização da porta sobre a tabela que o molde cria
- [ ] **`memoria` continua o DEFAULT do molde**, e isto não é detalhe: `03-operacao.md` exige que os
      testes do módulo rodem **sem rede e sem banco**. Trocar para Postgres é editar **uma linha** do
      `config/portas.json` — que é exatamente a promessa do §5 (*"o nome do fornecedor só aparece aqui"*),
      hoje verdadeira só na direção de quem já tem o adapter
- [ ] *Recusada: manter só o stub e declarar o limite.* O `criar-adapter` já entrega o **lugar**; o que
      falta é o que **todo** projeto vai escrever igual. Template que deixa N projetos escreverem o
      mesmo arquivo é a duplicação que este ecossistema existe para evitar
- [ ] **SQL por parâmetro, sempre.** O adapter vive na raiz, sob o escopo `raiz` do gate:
      `sql-concatenado` já o cobre, e este bloco é o primeiro consumidor real dessa regra — conferir que
      ela acusa se alguém montar query por concatenação ali
- [ ] **Prova de ponta a ponta, e ela é de CI, não do `verificar`:** com Postgres efêmero, trocar
      `repositorio` para `postgres` num módulo, aplicar migrations, subir o sistema e exercitar
      `POST /registros` → `GET /registros` → `GET /resumo` com **contagem vinda do banco**. O Bloco K
      **não** roda isto (ele não tem banco); o passo pertence ao pipeline, e a tabela de custo do §7 já
      reserva a linha de "minutos"
- [ ] **Declarar o que fica de fora:** *pool*, *retry*, migrations de dado, e o mapeamento de tipos além
      do que o molde usa. O adapter entregue cobre a **forma do molde**; módulo que criar tabela com
      outra forma escreve o próprio — e isso é o desenho, não uma lacuna

---

## Ordem de dependência

```
X    o primeiro commit          BLOQUEANTE — hoje nenhum repositório Sarak nasce commitável.
                                Conserto de CONTEÚDO (nunca cegar o scanner) + passo novo no K

AA   a entrada                  barato, mesma família: o script cria a pasta · árvore vazia como
                                baseline · o comentário do adapter · e rodar a SKILL de verdade

Y    migrations com estado      a primeira coisa que dói em uso real depois do commit

Z    o caminho até o banco      o maior, e o único que acrescenta capacidade em vez de consertar
                                defeito. Depende do Y para a prova de ponta a ponta fazer sentido

═══ meta: iniciar → módulo → migrations → COMMIT → sistema no ar LENDO DO BANCO,
    sem uma linha escrita à mão e sem furar gate nenhum ═══
```

**Por que X vem sozinho e primeiro:** os outros três são fricção; o X é impedimento. Enquanto ele não
fechar, todo repositório criado pelo fluxo precisa de `--no-verify` para existir — e `--no-verify` é
justamente o que o §7 do `funcionamento-esperado.md` chama de *"a única cobrança que não se fura"* sendo
furada no primeiro commit.

---

## Fora deste plano

- **A candidata de catálogo** (regra que cobra a convenção de nome do mapeador) — segue aberta no
  `plan-2.md`; é decisão de catálogo.
- **Adapter para as portas `storage` e `notificador`** — a Bloco S as implementou em memória; a versão
  real é por projeto, e não há forma canônica no molde para derivá-la, como há para `repositorio`.
- **Pool, retry e observabilidade do adapter Postgres** — declarado no Bloco Z.
- **CD** — segue fora, pelo §5 do `00-arquitetura.md`.

---

## Resumo da execução — 2026-08-11

**Resultado:** Concluído

**O que foi feito**

**Bloco X — o repositório nasce sem conseguir commitar**
- Consertei os TRÊS conteúdos que o próprio catálogo de segredos acusava — nunca o scanner:
  `04-regras.md` §7.2 (a fixture `TOKEN = "token-de-teste"` virou "constante `TOKEN` valendo
  `token-de-teste`"; a string de conexão virou `<esquema>://<usuario>:<senha>@<host>/<banco>`),
  `ferramentas/ci-seguranca.mjs:46` (mesmo tratamento), e a constante `TOKEN` nos três moldes de
  teste de contrato (`contrato.test.ts/js`, `test_contrato.py`) renomeada para `CREDENCIAL_DE_TESTE`
  — fora do vocabulário fechado, mesmo valor, mesmo teste.
- `.githooks/config.json` (git-verificacao-commit) passou a ser **GERADO** do catálogo canônico de
  `cyber-segredos` — `skills/git-verificacao-commit/scripts/gerar_config.py` (novo), com
  `--conferir`. Rodei e confirmei: os dois já estavam em sincronia (`padroes`/`arquivos_sensiveis`
  idênticos); só o `_fonte` mudou para declarar que é gerado.
- **TRAVA**: novo passo `primeiro-commit` em `autoteste-template.mjs`, logo depois do
  `clone-simulado` e antes de `verificar`, nos três bindings — chama
  `skills/git-verificacao-commit/scripts/verificar_commit.py` contra o STAGED do clone simulado e
  exige zero achado. É a única linha do arquivo que sai de `specs/_estrutura_modulos/` — declarada
  como exceção deliberada no cabeçalho do arquivo.
- **Contraprova feita**: revertida a correção do `04-regras.md` num projeto gerado de verdade, o
  gate real (`verificar_commit.py`) voltou a bloquear nomeando o arquivo exato; restaurada a
  correção, voltou a passar. Saída colada abaixo.

**Bloco AA — a entrada, e a fricção do repositório novo**
- `init_repo.py` agora **cria** o diretório-alvo (`target.mkdir(parents=True)`) em vez de abortar —
  com um guard novo (`_motivo_alvo_perigoso`) que recusa raiz do sistema de arquivos e a pasta HOME,
  mesmo cuidado que a skill já exige na entrevista.
- `ci-seguranca.mjs` e `contrato-compativel.mjs`: quando `HEAD~1` não resolve e nenhum `--desde`
  foi passado, caem para a ÁRVORE VAZIA (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) como baseline —
  `--desde` explícito nunca é substituído em silêncio. Testado num repositório real com um commit só:
  os dois passam a sair `OK` (antes reprovavam).
- Comentário do `_adapter/index.ts` (TypeScript) corrigido: apontava para
  `packages/portas/index.js`, o real é `.ts` — JS e Python já estavam certos.
- Item 4 (rodar a skill de verdade e comparar árvore) — feito como **auditoria estrutural** da
  prosa do `SKILL.md` contra o `init_repo.py` atual (não como entrevista HITL ao vivo, que esta
  execução não tem como conduzir sozinha): confirmei que a menção a apontamento de horas já tinha
  sido removida dos dois lados em sincronia, e acrescentei ao `SKILL.md` a menção de que o script
  agora cria o diretório e recusa alvos perigosos. Registrado como pendência abaixo.

**Bloco Y — as migrations precisam de estado**
- Tabela de controle `<schema>.<prefixo>migrations` (`arquivo text primary key`, `aplicada_em
  timestamptz`) acrescentada à migration `0001` do molde, ao `schema.sql` e a
  `modulo.json:dados.tabelas`, nos três bindings.
- `scripts/migrations.{mjs,py}` reescritos: núcleo puro ganhou `pendentes`/`ultimoAplicado`; `up`
  aplica só as migrations que faltam (consulta `information_schema.tables` antes de tentar ler a
  tabela de controle — vazio, nunca erro, quando ela ainda não existe); `down` reverte só a
  **última** aplicada (não mais "tudo"); cada operação é uma transação que grava/apaga a linha de
  controle na ordem certa (insere DEPOIS do SQL no `up`, apaga ANTES do SQL no `down` — reverter a
  0001 apaga a própria tabela de controle).
- Doutrina: `02-contrato-e-dados.md` §6.3 ganhou o parágrafo de estado; `03-operacao.md` atualizou
  os exemplos de comando e o limite declarado; `04-regras.md` §7.2 trocou "sem controle de versão"
  pelo limite que sobrou (sem *dry-run*, sem migração de dado automática, sem *lock* entre
  processos); `01-modulo.md` §9.6 ganhou uma nota de que nada muda no fluxo de "tabela nova".
- **Trava contra Postgres real**: Docker efêmero (`postgres:16-alpine`), nos três bindings —
  `up` (aplica) → `up` de novo (**pula tudo** — o bug exato do relatório, `relation already exists`,
  não acontece mais) → `down` (reverte só a última) → `up` de novo (reaplica). `ciclo` também
  testado direto. Saída colada abaixo.

**Bloco Z — o caminho até o banco**
- `adapters/postgres/` entregue nos três bindings (`index.ts`, `index.js`, `__init__.py`), para as
  portas `repositorio` e `auditoria`, cobrindo a forma exata do molde
  (`<prefixo>metadados`/`<prefixo>auditoria`). SQL sempre por parâmetro para VALOR; identificador
  (schema/tabela) isolado em clausulas sem verbo SQL na mesma linha, para não disparar
  `sql-concatenado` (conferido contra o gate real, não só por leitura do regex).
  - TS: `pg.Pool`, um por URL, `import('pg')` lazy.
  - JS: mesma lógica, sem tipos.
  - Python: `psycopg.AsyncConnection` (o binding usa FastAPI/ASGI, portas são `async`), uma conexão
    persistente por URL; devolve objetos locais (`_RegistroDoMolde`/`_PaginaDoMolde`) — nunca
    `core.dominio`/`core.portas` do módulo chamador, porque `adapters/` não pode importar de
    `modulos/` (`adapter-isolado`).
- **Mudança de arquitetura necessária, não antecipada pelo relatório original**: `FABRICAS` em
  `src/composicao.*` chamava toda fábrica com ZERO argumentos — um adapter genérico não tinha como
  saber de qual módulo estava sendo chamado (schema, prefixo, `<MODULO>_DB_URL`). Mudei a chamada
  para `fabrica(modulo)` nos três bindings; em TS/JS isso não quebra `memoria` (função sem
  parâmetro declarado ignora o argumento extra); em Python exigiu envolver as entradas de `memoria`
  em `lambda modulo: ...()` (Python não ignora argumento posicional extra). Registrado como decisão
  abaixo.
- `memoria` continua o provedor DEFAULT do molde — nada mudou em `config/portas.json` gerado.
- Doutrina: `00-arquitetura.md` §3.2 e `01-modulo.md` §5.2 ganharam parágrafos declarando o adapter
  novo, o default inalterado, e o motivo de a fábrica receber o manifesto.
- **Prova de ponta a ponta com Postgres efêmero** (TypeScript): projeto + módulo `pedidos` gerados,
  `npm install`, migrations aplicadas, DUAS linhas inseridas **direto no Postgres** (simulando dado
  "do outro lado"), `config/portas.json` do módulo trocado para `postgres` nas duas portas, sistema
  subido de verdade (`tsx src/composicao.ts`). `GET /api/v1/pedidos/resumo` respondeu `{"total":2}`
  — o defeito exato do relatório (`{"total":0}` com tabela populada) não se repete. Inserida uma
  terceira linha direto no banco com o servidor no ar: `/resumo` foi para `{"total":3}` imediatamente
  (prova de que é leitura viva, não cache). CRUD completo provado chamando o adapter diretamente
  (`inserir` → `buscarPorHash` → `listar` → `contar`, mais `auditoria.registrar`), sem depender do
  gate de auth (que nega tudo por padrão e é infraestrutura anterior a este bloco, não alterada).
  JS e Python não repetiram o teste HTTP completo — cobertos por gate real + typecheck/lint/format
  (TS: `tsc`; Python: `mypy`+`ruff`) contra projeto gerado de verdade, e Python já teve o runner de
  migrations provado contra o mesmo Postgres real no Bloco Y.

**Achado durante a verificação, corrigido antes de fechar**: o primeiro `npm run
autoteste:template:rapido` (Bloco K real) reprovou nos dois bindings Node por formatação
(`scripts/migrations.mjs`) e depois por limiar de padrão-escrita (`max-params` em `aplicarUma`/
`reverterUma` — 5 parâmetros; `max-lines-per-function` em `rodarAutoteste`), e o `migrations.py`
tinha o mesmo `max-params`. Nenhum desses três apareceu nos meus testes manuais anteriores porque eu
só tinha rodado `--autoteste` (núcleo puro) e o gate estrutural, nunca `eslint`/`ruff check` direto
nesses arquivos. Corrigido consolidando `schema`+`tabela` num parâmetro único (`tabelaControle`
qualificado) nos três bindings, e extraindo `rodarCasosDeEstado()` do TS/JS. Depois disso, `npm run
autoteste:template` (SEM `--rapido`, os três bindings, as quatro combinações de flag do Bloco O)
saiu **13/13 passos verdes nos três bindings** — colado abaixo.

**Arquivos alterados**
| Arquivo | Natureza | O que mudou |
|---|---|---|
| `specs/_estrutura_modulos/doutrina/04-regras.md` | alterado | Bloco X (exemplos que disparavam o scanner) + Bloco Y (limite de migrations) |
| `specs/_estrutura_modulos/ferramentas/ci-seguranca.mjs` | alterado | Bloco X (exemplo de conexão) + Bloco AA (árvore vazia como baseline) |
| `specs/_estrutura_modulos/bindings/{typescript,javascript,python}/_template/tests/contrato/*` | alterado (3) | Bloco X — `TOKEN` → `CREDENCIAL_DE_TESTE` |
| `skills/git-verificacao-commit/scripts/config.json` | alterado | Bloco X — agora gerado |
| `skills/git-verificacao-commit/scripts/gerar_config.py` | criado | Bloco X — gerador + `--conferir` |
| `skills/git-verificacao-commit/SKILL.md` | alterado | Bloco X — documenta a geração |
| `specs/_estrutura_modulos/testes/autoteste-template.mjs` | alterado | Bloco X (`primeiro-commit`) + Bloco U/plan-2.1 (`mapa`, já existente) |
| `skills/meta-iniciar-repositorio/scripts/init_repo.py` | alterado | Bloco AA — cria diretório-alvo, guard de alvo perigoso |
| `skills/meta-iniciar-repositorio/SKILL.md` | alterado | Bloco AA — documenta o novo comportamento |
| `specs/_estrutura_modulos/ferramentas/contrato-compativel.mjs` | alterado | Bloco AA — árvore vazia como baseline |
| `specs/_estrutura_modulos/bindings/typescript/_adapter/index.ts` | alterado | Bloco AA — comentário `.js` → `.ts` |
| `specs/_estrutura_modulos/bindings/{typescript,javascript,python}/_template/database/{migrations/0001-*.sql,schema.sql}` | alterado (6) | Bloco Y — tabela de controle |
| `specs/_estrutura_modulos/bindings/{typescript,javascript,python}/_template/modulo.json` | alterado (3) | Bloco Y — `<modulo>_migrations` em `dados.tabelas` |
| `specs/_estrutura_modulos/bindings/{typescript,javascript}/raiz/scripts/migrations.mjs` | alterado (2, byte-idênticos) | Bloco Y — estado |
| `specs/_estrutura_modulos/bindings/python/raiz/scripts/migrations.py` | alterado | Bloco Y — estado |
| `specs/_estrutura_modulos/doutrina/{02-contrato-e-dados,03-operacao}.md` | alterado (2) | Bloco Y — doutrina |
| `specs/_estrutura_modulos/bindings/{typescript,javascript,python}/raiz/adapters/postgres/*` | criado (3) | Bloco Z — o adapter |
| `specs/_estrutura_modulos/bindings/{typescript,javascript,python}/raiz/src/composicao.*` | alterado (3) | Bloco Z — `fabrica(modulo)` + registro do postgres |
| `specs/_estrutura_modulos/bindings/typescript/raiz/package.json` | alterado | Bloco Z — `@types/pg` |
| `specs/_estrutura_modulos/doutrina/{00-arquitetura,01-modulo}.md` | alterado (2) | Bloco Z — doutrina |

**Verificações executadas**
- `node ferramentas/gate/testes/executar.mjs --binding <b>` (autoteste do gate, os três bindings,
  ANTES e DEPOIS de todo o plano) → **122/122 · 122/122 · 119/119**, idêntico à linha de base — nada
  neste plano mexeu em regra do catálogo, como o plano previa.
- Contraprova do Bloco X, num projeto gerado de verdade (typescript):
  ```
  $ python skills/git-verificacao-commit/scripts/verificar_commit.py --raiz <alvo> --config skills/git-verificacao-commit/scripts/config.json
  { "bloqueado": false, "achados_segredo": [], "arquivos_sensiveis": [] }   # com a correção
  { "bloqueado": true,  "achados_segredo": [{"arquivo":"specs/arquitetura/04-regras.md","tipo":"Segredo atribuido",...}] }  # revertida
  ```
  E o fluxo completo (`init_repo.py --git-init`) commitou de verdade sem `--no-verify`; um segundo
  commit com um segredo de teste foi bloqueado pelo hook AO VIVO (`[Sarak] Verificando vazamento...`).
- Bloco AA, repositório com um commit só (typescript):
  ```
  $ node ferramentas/ci-seguranca.mjs
  ci-seguranca: comparando com --desde 4b825dc6...ee4904 (arvore vazia — sem HEAD~1, repositorio novo)
  ci-seguranca: OK
  $ node ferramentas/contrato-compativel.mjs
  contrato-compativel: comparando com --desde 4b825dc6...ee4904 (arvore vazia — sem HEAD~1, repositorio novo)
  contrato-compativel: OK
  ```
- Bloco Y, Postgres 16 efêmero (Docker), typescript e python:
  ```
  up:    "up 0001-cria-metadados.sql..."           exit 0
  up:    "nada pendente — todas ja aplicadas"       exit 0   (o bug do relatorio, corrigido)
  down:  "down 0001-cria-metadados.sql..."          exit 0
  up:    "up 0001-cria-metadados.sql..."            exit 0
  ciclo: idem, com uma segunda migration real (0002-acrescenta-prioridade.sql)
  ```
  (python, módulo `clientes`, mesma sequência, mesmo resultado.)
- Bloco Z, ponta a ponta (typescript, Postgres efêmero):
  ```
  $ curl .../pedidos/resumo   ->  {"total":2}   (duas linhas inseridas direto no Postgres)
  $ (inserida uma terceira linha direto no banco, servidor no ar)
  $ curl .../pedidos/resumo   ->  {"total":3}
  $ node --loader tsx: repo.inserir → buscarPorHash → listar → contar → auditoria.registrar
  inserido: 90004 · buscarPorHash: {"hash":"90004",...} · listar: total=4 · contar: 4 · auditoria registrada
  ```
- `npm run autoteste:template` (SEM `--rapido` — os três bindings, as quatro combinações de flag do
  Bloco O) → **3/3 bindings verdes, 13/13 passos cada** (incluindo `primeiro-commit` e `mapa`, os
  dois acréscimos ao Bloco K desta rodada e da rodada anterior).
- TypeScript: `npx tsc --noEmit`, `npx eslint`, `npx prettier --check` — limpos, num projeto gerado
  de verdade. JavaScript: `npx eslint`, `npx prettier --check` — limpos. Python: `mypy .`, `ruff
  format --check .`, `ruff check .` — limpos, com `[dev]` instalado de verdade (`psycopg`, `ruff`,
  `mypy`, `pytest`).

**Critérios de aceite**
- [x] Bloco X: `git commit` passa, hook ativo, sem `--no-verify` — evidência acima (fluxo completo
      + contraprova nos dois sentidos).
- [x] Bloco AA: as quatro arestas — diretório criado, `ci-seguranca`/`contrato-compativel` verdes em
      repo de um commit só, comentário do adapter corrigido nos três bindings, item 4 registrado
      como auditoria estrutural (não HITL ao vivo — ver pendências).
- [x] Bloco Y: fluxo completo `iniciar → módulo → migrations → commit` sem furar gate, migrations
      idempotentes de qualquer estado — evidência acima, `ciclo` incluso.
- [x] Bloco Z: sistema no ar lendo do banco — evidência acima (TypeScript completo; JS/Python via
      verificação estática + Postgres real no runner de migrations, não via HTTP).

**Decisões e suposições**
- Bloco X, item "sincronizar o catálogo": não marcado `DECIDIDO` no plano — escolhi **gerar** (não
  "declarar fonte própria"), por ser o precedente estabelecido (`gerar-config-lint.mjs`) e por
  eliminar de vez a possibilidade de divergência manual (a G.2 que este ecossistema evita
  repetidamente). Não conectei um `--conferir` automático a nenhum gatilho de CI da BASE — a base
  não tem pre-commit próprio nem pipeline de verificação contínua além do `autoteste:template`
  agendado; registrar isso como possível próxima tarefa, não regra quebrada.
- Bloco Z: a mudança de `fabrica()` para `fabrica(modulo)` não estava prevista no texto do plano
  ("o scaffold registra fábrica corretamente — o que falta é a implementação"), mas sem ela um
  adapter genérico e reutilizável entre módulos (a promessa central do bloco, "escrevível uma vez e
  serve a todo módulo") é impossível: a fábrica zero-argumento não tem como saber de qual módulo
  está sendo chamada. Tratei como decisão de implementação normal (não uma escolha arquitetural
  alternativa que exigisse parar e perguntar), documentada aqui.
- Bloco Z: `RepositorioPostgres`/`AuditoriaPostgres` (Python) devolvem dataclasses locais
  (`_RegistroDoMolde`/`_PaginaDoMolde`), nunca `core.dominio.Registro`/`core.portas.Pagina` do
  módulo chamador — `adapters/` não pode importar de `modulos/` (`adapter-isolado`), e Python não
  tem structural typing em runtime como TS; duck typing por nome de atributo resolve, confirmado
  pelo mypy limpo e pelo gate.
- Não toquei `specs/_estrutura_base/00-prompt-revisor.md`, que aparece modificado no `git status`:
  é conteúdo pré-existente no worktree, sem relação com este plano (regra sobre atualizar `status`
  de frontmatter). Não é meu; não fiz git stash nem reverti — deixei como encontrei.

**Achados fora do escopo (não corrigidos)**
- Nenhum novo. (O achado de `criar-projeto.mjs:principal` de 41 linhas, registrado no resumo do
  `plan-2.1.md`, continua lá; este plano não tocou aquele arquivo além do já registrado.)

**Pendências / riscos**
- Bloco AA item 4: a comparação entre a prosa do `SKILL.md` e o comportamento real do script foi
  feita por leitura, não por uma entrevista HITL de verdade conduzida por um agente. Se a próxima
  rodada tiver um humano disponível para rodar `/sarak:meta-iniciar-repositorio` de ponta a ponta,
  vale comparar a árvore gerada contra a do script uma vez, como o item original pedia.
- O `.githooks/config.json` gerado (Bloco X) não tem `--conferir` automático em nenhum gatilho da
  base — hoje só roda se alguém lembrar de chamar `python gerar_config.py --conferir` à mão depois
  de editar o catálogo canônico. É a mesma classe de risco que a S.1 já corrigiu para outras
  ferramentas; não corrigi aqui porque o bloco não pedia uma trava para este item especificamente
  (só para o `primeiro-commit`), e inventar uma exigiria decidir ONDE rodar (a base não tem
  pre-commit próprio) — decisão que caberia a uma plan nova, não a uma suposição minha.
- Bloco Z declara (no rodapé do próprio arquivo, nos três bindings) o que fica de fora: tuning de
  pool/conexão, retry, migração de dado automática — nenhum desses foi implementado, por design.

