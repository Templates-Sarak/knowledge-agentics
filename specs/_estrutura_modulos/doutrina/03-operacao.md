---
tipo: "doutrina"
titulo: "Operação — Segurança, Log, Erro, Teste e Extração"
status: "🟢 Vigente"
tags: ["seguranca", "log", "teste", "extracao", "operacao"]
relacionados: ["[[00-arquitetura]]", "[[01-modulo]]", "[[02-contrato-e-dados]]", "[[04-regras]]"]
---

# 1. Propósito

As leis anteriores descrevem a forma. Esta descreve o comportamento em execução: como o módulo se defende,
o que ele registra, como é testado, e como se prova que ele está pronto para virar microsserviço.

# 2. Segurança

## 2.1 A cadeia da `api/`

Toda requisição atravessa a mesma cadeia, na mesma ordem, em todo módulo:

```
requestId → headers de segurança → CORS → rate limit → autenticação → autorização → rota → tratador de erro
```

1. **`requestId`** — gerado na entrada, propagado no log e devolvido no envelope de erro. É o que liga o log
   à trilha de auditoria.
2. **Headers** — HSTS, `nosniff`, `frame-deny`, `referrer-policy`, vindos de `config/security.json`.
3. **CORS** — origens **declaradas**. `*` é proibido.
4. **Rate limit** — janela e limites em `config/security.json`, com limites distintos para leitura, escrita
   e operações caras. Estouro devolve `LIMIT_EXCEEDED` com `Retry-After`.
5. **Autenticação — deny by default.** Toda rota exige token, **exceto** as declaradas em
   `module.json:publicRoutes`. Rota pública é **opt-in explícito**, e o método faz parte da declaração:
   abrir a leitura nunca pode abrir a escrita do mesmo caminho por descuido.
6. **Autorização** — a rota exige uma permissão nomeada (`<module>:read`, `<module>:write`), verificada
   contra as claims. Autorização é da `api/` do módulo; RLS no banco é defesa em profundidade, não o controle
   primário.
7. **Validação na borda** — antes do domínio, com allowlist de campos e limite de corpo ([[02-contrato-e-dados]] §3.2).
8. **Tratador de erro** — único lugar que transforma exceção em resposta. Nenhuma rota monta erro à mão.

## 2.2 Segredo

- Segredo **só** em `.env`. Nunca em `config/*.json` (versionado), nunca no código, nunca no bundle do front.
- Variável exposta ao browser tem prefixo próprio do build (`VITE_`, `NEXT_PUBLIC_`) e **nunca** contém chave,
  token ou credencial. O que vai para o browser é público, por definição.
- Credencial de serviço externo pago só existe em módulo com `role: "gateway"` ([[00-arquitetura]] §3.1).
- Rotação de credencial não pode exigir mudança de código.

# 3. Log

- **Estruturado**, uma linha por evento, com `requestId`, `module`, `nivel` e `mensagem`.
- Nível mínimo em `config/api.json`.
- **Campos de `sensitiveFields` são redigidos automaticamente** pelo logger — não é responsabilidade de quem
  chama lembrar.
- **`console.*` é proibido no módulo.** Sempre o logger.
- Mensagem de fornecedor e stack trace vão para o log, nunca para a resposta.

**Log ≠ trilha de auditoria.** O log é operacional e efêmero; a trilha é registro durável de negócio
([[02-contrato-e-dados]] §6.4).

# 4. Erro

- A taxonomia é **fechada** ([[02-contrato-e-dados]] §3.1). Código novo exige mudança na lei, não improviso.
- **Exceção nunca é engolida.** `catch` vazio é erro de gate.
- Erro de adapter é traduzido pelo adapter para a taxonomia; o domínio nunca vê o tipo de erro do fornecedor.
- Erro de gateway (outro módulo indisponível) é `EXTERNAL_DEPENDENCY`, e o módulo consumidor decide se degrada
  ou falha — mas decide **explicitamente**.

# 5. Teste

| Camada | Cobre |
|---|---|
| `tests/domain/` | validação e regras de negócio |
| `tests/contract/` | cada rota do `openapi.yaml`; auth negada por padrão; payload malformado rejeitado |
| `tests/web/` | os três estados de cada tela (`loading`, `empty`, `error`) |
| `tests/fixtures/` | dados compartilhados **dentro** do módulo |

**Tudo roda com adapters de memória, sem rede e sem banco.** Isso não é preferência de teste: é a prova
executável de que o desacoplamento existe. Se um teste do módulo precisa de infraestrutura, a porta está mal
desenhada ou o adapter de memória está faltando.

Módulo com `core/engine` testa **determinismo**: mesma entrada, saída idêntica. É o que garante que
`clock` e `idGenerator` estão sendo usados no lugar de `new Date()` e `Math.random()`.

**Cobertura-alvo ~80% nos caminhos críticos — e isto NÃO é regra.** Medir cobertura exige executar os testes,
e o gate é estático por contrato ([[04-regras]] §7.1). É um alvo de equipe, cobrado em revisão e pelo comando
`verificar` do projeto, nunca pelo gate. Cobertura também não é meta em si: teste que existe só para subir
número é peso morto.

O gate cobra o que **é** estruturalmente verificável: `tests/domain/` e `tests/contract/` existem e não estão
vazios (regra `tests`).

**O bypass de `requiredEnv` sob teste, e por que ele não é silencioso.**
`api/src/config.ts:checkEnvRequired` (TS/JS) e `api/src/config.py:_check_env_required` (Python)
pulam a checagem de variável obrigatória quando o processo está sob teste (`NODE_ENV === 'test'`,
`PYTEST_CURRENT_TEST` definido) — sem isso, todo `it()`/`def test_` cairia antes de rodar, porque nenhum
`.env` real existe em CI nem no ambiente de quem escreve o módulo. **A consequência aceita:** `npm
test`/`pytest` verde, sozinho, **não prova** que a fiação de ambiente do módulo está correta — só o boot
real (`npm run start`, `python verify.py` via boot de verdade) prova isso fim a fim. **O que fecha a
lacuna:** `tests/contract/config.test.ts`/`.js`/`test_config.py` chama a função **diretamente**, com a
flag de teste removida do ambiente só durante a chamada, e afirma que ela DE FATO lança quando falta
variável — a mesma disciplina de "declaração sem verificador não é lei" (`04-regras.md` §1) aplicada ao
código do template, não a uma regra do gate.

# 6. Extração — a prova que justifica tudo

```
node tools/gate/validate.mjs --extraction modules/<module>
```

O comando responde uma pergunta objetiva: **a ESTRUTURA deste módulo permite extraí-lo hoje?** Ele confere que:

- toda porta declarada tem adapter escolhido em `config/ports.json`;
- todo gateway tem entrada em `consumes`, e existe env apontando a URL base do módulo consumido;
- o `.env.example` cobre exatamente o que o manifesto declara;
- nenhum import sai da pasta do módulo, e nenhum SDK de fornecedor está dentro dela;
- o contrato existe e declara os três endpoints obrigatórios.

**O que ele não faz: executar teste.** O gate é estático e sem efeito colateral por contrato — ele lê arquivo
e devolve achado, nunca roda código do módulo. A prova de que os testes passam sem rede é o `npm test` /
`pytest` do módulo, no comando `verificar` do projeto. Confundir as duas coisas foi o que, num sistema real,
fez um comando de extração "passar" sem nunca ter rodado um teste sequer.

**O procedimento de extração**, quando chegar o dia:

1. Copiar `modules/<module>/` para o repositório novo.
2. Copiar os `adapters/<tec>` que ele declara e os `packages/` que ele usa.
3. Recortar as chaves `<MODULE>_*` do `.env` da raiz para o `.env` do módulo, e **apagar a linha `ENV_ROOT`**.
4. Substituir os gateways por chamadas à URL pública dos módulos que ficaram.
5. Copiar `specs/arquitetura/`, `specs/adr/000-decisoes-do-template.md` e `tools/` — a lei e a
   verificabilidade viajam junto.

Nenhum passo é refactor. Se algum for, uma regra foi violada antes e não foi pega.

# 7. Verificação

O verificador é uma **ferramenta que recebe o caminho de um módulo**. Verificação do repositório inteiro é um
laço sobre `modules/*`, não uma capacidade separada — é isso que permite ao módulo extraído continuar
verificável no repositório novo dele.

```
node tools/gate/validate.mjs <caminho-do-modulo>    um módulo
node tools/gate/validate.mjs --all                  laço + as regras globais
node tools/gate/validate.mjs --extraction <caminho> pronto para virar serviço?
node tools/gate/validate.mjs --json <caminho>       saída para máquina
```

Só **duas** regras são genuinamente do repositório e precisam de visão global: `lateral-import` (nenhum módulo
importa outro) e `consumes-cycle` (não há ciclo no grafo). Ambas rodam no `--all`.

**O template não traz pipeline de CI/CD**, de propósito: config de CI é específica de provedor, e a regra não
pode morar num lugar que se perde ao trocar de provedor. O gate é agnóstico e tem contrato estável (recebe
caminho, devolve exit 0/1, opcionalmente JSON). Plugá-lo num executor é uma linha — ver `tools/gate/README.md`.

O que rodar onde é decisão de **custo**, não de importância:

| Custo | Exemplos | Quando |
|---|---|---|
| Milissegundos (lê arquivo) | manifesto, nomenclatura, import lateral, prefixo de tabela, env, schemas de portas | toda invocação |
| Segundos (compila/testa) | build, testes, tipos | sob demanda no local, obrigatório na entrega |
| Dezenas de segundos | integração, scan de dependência | só no executor de entrega |

## 7.1 A fiação local das três camadas

A tabela acima é custo; esta seção é **onde** cada custo roda localmente. `.githooks/pre-commit` e
`.githooks/pre-push` — instalados pelo template em `bindings/<binding>/root/.githooks/` e ativados por
`git config core.hooksPath .githooks` — são git, **não** provedor de CI: eles não se perdem ao trocar
de GitHub Actions para outra coisa, e por isso não contradizem a decisão da ADR-005
(`specs/adr/000-decisoes-do-template.md`). **"O template não traz pipeline de CI/CD" continua
verdadeiro** — pipeline é config de provedor (o `.yml` de um GitHub Actions, o script de um GitLab CI);
hook de git é mecanismo do próprio git, o mesmo `tools/gate/README.md` já cita como exemplo de
"plugar num executor em uma linha".

A fiação, coluna a coluna da tabela de custo:

| Custo | Hook | O que roda | Alimentado por |
|---|---|---|---|
| Milissegundos + segundos | `pre-commit` | gate (`validate.mjs`) nos módulos **afetados** pelo staged, `.env.example` em dia, schemas de portas em dia, formato, lint | `tools/affected.mjs` sobre `git diff --cached --name-only` |
| Dezenas de segundos | `pre-push` | tipos e testes dos módulos **afetados** desde o upstream | `tools/affected.mjs --since @{u}` (sem upstream: primeiro push do branch, verifica tudo) |

A lógica de ambos os hooks mora num lugar só, `tools/verify-commit.mjs` — os arquivos
`.githooks/pre-commit`/`.githooks/pre-push` são idênticos, byte a byte, nos três bindings, e só
delegam para lá. É a mesma razão de o gate ter uma implementação e não três: seis arquivos de hook (três
bindings × dois estágios) com lógica própria divergiriam no primeiro ajuste que alguém fizesse de um
lado só, e nada verificaria que eles concordam.

**O limite, declarado, não escondido.** `pre-commit`/`pre-push` são feedback **rápido e opt-in**: cada
clone precisa rodar `git config core.hooksPath .githooks` para ativá-los (a config é local, não vem no
`clone`), e `--no-verify` fura qualquer um dos dois, por desenho do próprio git — nenhum hook local
impede isso. **Quem cobra sem esse furo é o CI**, nunca o hook local: instalar o hook não substitui
pipeline, antecipa feedback — a mesma frase, e o mesmo motivo, do `hooks/README.md` da base para os
hooks do agente ("Quem protege o repositório independente de quem edita é o CI"). O catálogo cobra o
lado que É verificável sem rodar git: `pre-commit-installed` (04-regras.md §4.4) prova que o artefato
existe e referencia a cadeia; a regra 74. Ativação e furo ficam fora do que um verificador estático
consegue afirmar (04-regras.md §7.2).

## 7.2 Cobertura — por que fica de fora do local, e onde ela mora

`config/verification.json:coverage.minimum` é política real, com verificador real — mas o verificador
não é o gate, não é o `verificar`/`verify.py`, e não é o hook local. É **CI**, e a decisão foi
**medida**, não suposta: `npm run coverage` de um módulo recém-gerado, do zero, levou **~23s** — e a
fatia que domina não é rodar o teste (**~0,5s**), é subir o ambiente de cobertura (**~17s** de
`environment`, istanbul instrumentando `v8`). Multiplicado por módulo, isso estoura em minutos a
promessa de "segundos"/"dezenas de segundos" que `verificar` e os hooks locais fazem (§7, a tabela de
custo) — cobertura entra na própria tabela, na linha "dezenas de segundos: só no executor de entrega",
e é isso que este parágrafo fia.

O comando, por binding:

| Binding | Comando | O que mede | Onde |
|---|---|---|---|
| TS/JS | `npm run coverage` (por módulo) / `npm run ci:coverage` (todos, via workspaces) | `vitest run --coverage`, threshold em `coverage.thresholds.lines` lido de `config/verification.json` | CI |
| Python | `python verify.py --coverage` | `pytest --cov`, piso em `--cov-fail-under` lido da mesma política | CI |

Grava `reports/coverage/lcov.info` (formato lcov, para SonarQube/Codecov/Coveralls) e
`reports/junit.xml` (resultado de teste, formato JUnit). **Nunca** roda em `npm test`/`pytest -q`
comuns — é opt-in por comando próprio, de propósito: relatório escrito a cada teste local é ruído, e
`reports/` é `.gitignore`d nos três bindings. Abaixo do mínimo, a PRÓPRIA ferramenta reprova
(threshold do vitest; `--cov-fail-under` do pytest-cov) — nenhuma reimplementação de leitura de lcov
aqui. Ferramenta de cobertura ausente também reprova, nunca "ok" (lei 7 do gate, `verify.py`).

Lint em formato de máquina segue o mesmo desenho: `npm run ci:lint` (JSON, eslint) e
`python verify.py --lint-report` (SARIF, ruff — nativo na versão pinada, testado). SARIF no
eslint exigiria pacote externo (`@microsoft/eslint-formatter-sarif`); não entregue — ver 04-regras.md
§7.2 pela medição completa.

## 7.3 Segurança e dependências — estágio 0 e o audit

Duas ferramentas de CI, nenhuma delas o gate pode ser (o gate não roda git nem consulta registro
externo, de propósito — é o que o mantém puro e chamável de dentro de um hook):

| Comando | O que faz | Fail-closed? |
|---|---|---|
| `npm run ci:security` / `python verify.py --security` | `.env` real versionado (`git ls-files`) + segredo reconhecido no delta desde `--since` (default `HEAD~1`) | **Sim** — git mudo ou ref inválida REPROVA, nunca "sem problema" |
| `npm run ci:dependencies` / `python verify.py --dependencies` | `npm audit --json` / `pip-audit --format=json` contra `config/verification.json:dependencies.minimumSeverity` | Não no sentido de "furo" — ferramenta ausente é **parte do pacote** (npm embute audit; `pip-audit` é `optional-dependencies`), então "ausente" deixou de ser um caso a tolerar: reprova como qualquer outra ferramenta que falta (lei 7) |

**"Ferramenta ausente REPROVA" matou o fail-open do audit.** A única válvula que sobra é uma exceção
**nominal, ratificada E DATADA** — `config/compliance.json:exceptionsCve` (§8) — para o caso real que
resta: um CVE novo sem correção disponível, que deixaria vermelho um build que ontem estava verde sem
ninguém ter tocado em código.

**Vocabulário fechado de segredo, sem entropia.** `ci-security.mjs` reconhece nome de chave
(`CREDENTIAL_PATTERN`, já usado por `gateway-credential`/`secret-in-public`) atribuído a um literal, e
valor de token com prefixo de fornecedor inequívoco (AWS, GitHub, Google, Slack, Stripe, npm, JWT,
cabeçalho de chave privada) — cópia comentada do catálogo canônico de `skills/cyber-segredos`, sem as
formas genéricas (heurística de entropia, "Bearer" solto, "segredo atribuído" sem sufixo fechado, string
de conexão): essas produzem falso positivo, e a lei 1 não aceita essa direção. O que fica de fora está
declarado em `04-regras.md` §7.2, não escondido — é falso negativo, tolerado porque declarado.

**Nenhum dos dois entra em `pre-commit`/`pre-push`/`verificar` local**: `ci:security` precisa de git
(estado do repositório, não do arquivo em edição) e `ci:dependencies` precisa de rede/registro externo
— o mesmo motivo, com sinal trocado, que já mantém `ci:contract` e `ci:coverage` fora da cadeia local.

## 7.4 Exemplo de fiação de CI — de um provedor, não do template

**A ADR-005 continua valendo:** o template não traz pipeline de CI/CD, traz o contrato (comando,
exit 0/1) para que um executor o chame em uma linha. O que segue é **exemplo de um provedor**
(GitHub Actions, GitLab CI, o que for) — nada aqui é arquivo que `create-project.mjs` instala.

Cada linha é um comando que **já existe** hoje, na ordem em que um pipeline razoável os chamaria —
nada inventado, e onde a escada não tem passo, este exemplo não mostra um:

```
# 1. local, em segundos — o que roda em pre-commit/pre-push
npm run validate          # gate --all
npm run validate:env      # sincronizar-env --check
npm run format
npm run lint
npm run typecheck
npm test

# 2. selecao — so quando o pipeline quer escopar por commit, nao rodar tudo
node tools/affected.mjs --since origin/main

# 3. so CI — custam rede, git de historico, ou dezenas de segundos
npm run ci:contract      # breaking change no contract/openapi.yaml
npm run ci:coverage      # lcov + junit, por modulo
npm run ci:security      # estagio 0, fail-closed
npm run ci:dependencies  # audit + excecao datada

# 4. artefato — so no binding que emite (TypeScript; JS/Python nao tem este passo, §9)
npm run build

# 5. migrations — contra um Postgres efemero, com <MODULE>_DB_URL apontando pra ele. Local: o
#    `compose.yml` do projeto o sobe (§9.5). Em CI: `services:` do provedor.
node scripts/migrations.mjs cycle <module>
```

**O que este exemplo não mostra, de propósito:** o Postgres **de CI** (`services:` do provedor — decisão
de infraestrutura, fora da ADR-005) e a **publicação** das imagens (registry, digest, entrada, servidor —
muda por provedor e por empresa; é da skill `deploy-docker-monolito`, ADR-022). O que o template entrega
é o que é seu: os arquivos de container do projeto (§9.5) e o gate que cobra a presença deles.

# 8. Exceções

`config/compliance.json` na raiz do projeto aceita exceção **nominal**, em duas listas com a mesma
disciplina e donos diferentes:

- **`exceptions`** — ao catálogo do gate: módulo + regra + motivo + `decision` (ADR).
- **`exceptionsCve`** — a `tools/ci-dependencies.mjs` (não é regra, não roda no gate): id do
  CVE/GHSA + motivo + `decision` (ADR) **e `expires`** (`YYYY-MM-DD`). A exceção de CVE tem um jeito a
  mais de não valer que a de regra: **expirada também não vale**, e volta a reprovar sozinha, sem
  ninguém precisar editar nada — é o que impede um "risco aceito" de virar permanente por esquecimento.

**Sem `decisao`, nenhuma das duas vale.** É o mesmo link para `specs/adr/000-decisoes-do-template.md`
que impede a lista de virar depósito de dívida silenciosa — e a data malformada em `expira` **também**
não vale (nunca "válida para sempre" por acidente de formato).

As duas listas começam **vazias**, e esse é o estado correto.

# 9. Build e artefato

**`build` não significa a mesma coisa nos três bindings, e fingir que significa é a lei 10 com outra
roupa** — comando que não faz nada e devolve `0` é tão falso quanto saída vazia contada como sucesso.

| Binding | Backend | Front |
|---|---|---|
| TypeScript | **Emite** — `tsc -p tsconfig.build.json` (raiz e cada módulo) para `dist/`. Todo import já usa a convenção NodeNext (`./config.js` referenciando `config.ts`); sem emitir, só `tsx` resolve isso, e `tsx` nunca é a forma de rodar um artefato publicado | `vite build` por módulo com `web/` (já existia) |
| JavaScript | **Nada** — o fonte já É o artefato; `node` roda `.js` direto, sem passo nenhum entre editar e rodar | idem |
| Python | **Nada** — o processo roda o fonte por natureza da linguagem; não há "emitido" distinto do editado | módulo não tem `web/` neste binding |

`node tools/package.mjs` (`npm run build`) orquestra os dois lados: compila o backend TS onde
há `tsconfig.build.json` — e **diz que não emite**, sem erro, onde não há (JS/Python) — e constrói o
front de todo módulo com `web/vite.config.*`, pulando em silêncio informativo quem não tem (nunca falha
o passo por um módulo sem `web/` — Python molde nenhum, e qualquer módulo criado com `--no-web`).

## 9.1 O artefato backend é autossuficiente, e a prova é rodá-lo sem o fonte

`node tools/package.mjs <destino>` copia, para um diretório **novo**, só o que o processo
composto lê em runtime — nada de `.ts`, nada de `tools/`, nada de `tests/`:

- `module.json` de cada módulo — o único nome fixo, porque é o manifesto canônico;
- `config/*.json` de cada módulo — **todo** `.json` sob `config/`, mecanicamente, nunca por nome
  enumerado. Medido contra o runtime (`api/src/config.ts`): só esses cinco arquivos e `module.json`
  são lidos fora de teste — `contract/openapi.yaml`, `core/templates/*.html` e `database/**` **não**
  são, e por isso ficam de fora do artefato (inchá-lo com o que ninguém lê rodando é o erro oposto);
- `dist/` — o que `tsc` emitiu. A lista de arquivos `.ts` vira lista de ativos de graça: quem decide o
  que compila é o `include` de `tsconfig.build.json`, nunca este script;
- um `package.json` mínimo, com `dependencies` MESCLADAS (raiz + cada módulo + cada `adapters/<provedor>/`
  **que algum módulo escolhe** em `config/ports.json`) — união mecânica de campos já declarados, não uma
  lista escrita à mão que envelhece. **A dependência de um adapter viaja com o adapter**
  (`adapters/postgres/package.json` declara `pg`) **e só entra no artefato se o provedor é escolhido**:
  projeto que fica em `memory` não paga o driver. `react`/`react-dom` são do front (o Vite os empacota no
  build) e ficam em `devDependencies` do módulo — nunca no artefato do backend;
- `package-lock.json`, gerado do lock da **raiz** (`npm install --package-lock-only`, que reaproveita as
  versões já travadas): a instalação de produção (`npm ci --omit=dev`) é reprodutível, inclusive nas
  dependências transitivas, que as versões exatas do topo não cobrem;
- `config/runtime.json` da raiz — o único arquivo de `config/` da raiz lido em runtime (o teto do
  desligamento gracioso, §9.4);
- `.env.example` (documentação das chaves) — **nunca `.env`**: segredo é por ambiente de implantação,
  não um artefato de build que viaja para onde quer que o pacote seja publicado.

**Por binding.** TypeScript empacota o `dist/` emitido. JavaScript **não emite**: o fonte é o artefato, e
`package.mjs` copia o que o processo lê em runtime — `src/` (raiz de composição), `adapters/` (sem o molde
`_template`), `packages/` e, por módulo, `module.json`, `config/`, `api/` e `core/` — pela mesma convenção
mecânica, sem lista de nomes de arquivo. **Python não tem passo de empacotamento**, e isto é uma
declaração, não uma lacuna: o processo roda o fonte (`python -m src.composition`) e se instala com `pip
install` — `pip install .` para o mínimo, `pip install ".[postgres]"` quando algum módulo escolhe o provedor
`postgres` (o extra tem o nome do provedor, a mesma convenção do lado Node). `package.mjs` recusa o
binding Python com mensagem, nunca finge empacotar. As versões do `pyproject.toml` são exatas, e o
equivalente do lock não existe aqui (decisão do ADR-021).

**`importApi` (raiz de composição) resolve por convenção de caminho, não por variável nem
tentativa**: prefere `modules/<id>/dist/api/src/index.js` quando ele existe, e cai para
`modules/<id>/api/src/index.ts` (resolvida por `tsx` em dev) quando não existe. O preço declarado: um
`dist/` desatualizado — fonte mudou, ninguém rodou o build de novo — é servido sem aviso; mitigado por
`package.mjs` sempre recompilar do zero antes de copiar, nunca reaproveitar um `dist/` velho, e por
dev tipicamente não ter `dist/` nenhum na árvore.

## 9.2 O que a emissão não muda

`tsconfig.build.json` (raiz e módulo) **estende** o `tsconfig.json` de tipos — a mesma árvore que é
tipada é a que é emitida, exceto pelo `include` do módulo, que precisa ser redeclarado (`extends` não
mescla `include`/`exclude`, substitui) para excluir `web/` e `tests/`: backend não carrega front, e
teste não viaja com artefato nenhum. `npm run typecheck` de cada módulo continua rodando pelo `tsconfig.json`
de sempre (`noEmit: true`) — o módulo continua compilando **isolado**, a condição prática da extração
(§6 deste documento); a emissão não move nem edita esse arquivo.

## 9.3 Migrations executáveis

`database/migrations/*.sql` (02-contrato-e-dados.md §6.3) não é só texto que o gate cobra a forma —
`scripts/migrations.{mjs,py}` aplica o `up` e reverte o `down`, contra um Postgres de verdade:

```
node scripts/migrations.mjs up <module>       # ou: python scripts/migrations.py up <module>
node scripts/migrations.mjs down <module>     # reverte so a ULTIMA aplicada (bloco "-- rollback")
node scripts/migrations.mjs cycle <module>    # up -> down -> up — prova que o rollback fecha,
                                               # de qualquer estado inicial
```

**Não mora em `tools/`.** Falar com Postgres exige driver, e `tools/**` é zero
dependência externa (§3 do catálogo). O runner usa o driver do adapter — `pg` (Node, declarado em `adapters/postgres/package.json`, workspace) /
`psycopg[binary]` (Python, extra `postgres` e também `dev`) — e por isso viaja com o projeto
(`scripts/`), não com a base. `adapters/` continua sendo só para o
processo composto trocar de provedor em **runtime**; migration é ferramenta de **operação**, nunca
importada por `composition.*` — mudar `adapters/memory` não afeta o caminho de migrations, e
`tools/affected.mjs` não precisa mudar por isso (medido: o runner não importa `adapters/`
em lugar nenhum).

**A URL vem do ambiente, sempre `<MODULE>_DB_URL`** (já em `module.json:requiredEnv` desde o
molde) — o runner não sabe de onde ela veio nem como o Postgres subiu (ADR-005: o template traz o
contrato, não o provedor). Ausente, o runner falha nomeando a chave exata, antes de tentar
conectar.

**Estado por módulo** (02-contrato-e-dados.md §6.3): a migration `0001` do
molde cria `<schema>.<prefix>migrations` — `up` aplica só as pendentes, `down` reverte só a
última. Continua **não** sendo um framework de migração completo (sem *dry-run*, sem migração de
dado automática, sem *lock* multi-processo) — os limites que restam estão em 04-regras.md §7.2.

## 9.4 Escuta e desligamento do processo composto

**Host.** O processo escuta no `ROOT_API_HOST` (chave da raiz, em `project.json:requiredEnv`, lida pelo
`composition.*` nos três bindings): loopback em dev, `0.0.0.0` em container. Sem default embutido — a falta
derruba o boot nomeando a chave (`root-fallback`). A simetria é deliberada: sem a chave, o Express escutaria
em todas as interfaces (expondo o dev na rede local) e o uvicorn só em loopback (inalcançável em container).

**Desligamento gracioso.** Ao receber SIGTERM ou SIGINT (SIGBREAK no Windows, onde o sinal gracioso que
alcança um processo é o CTRL_BREAK do console — `process.kill` o derruba na hora), o processo para de
aceitar conexões, drena as requisições em voo até `config/runtime.json:shutdown.drainTimeoutMs` (tunable
não-secreto, versionado, na raiz) e **sai 0** se drenou. Estourado o teto, loga e **sai ≠ 0**. Os dois
desfechos saem em log estruturado (`resultado: drained | timeout`). O teto fica abaixo do
`stop_grace_period` do orquestrador — e no `compose.yml` do projeto ele é **derivado**, não escrito: o
`sync-deploy` o calcula como `drainTimeoutMs` + `config/deploy.json:shutdown.graceMarginMs` (§9.5). No Python
o `capture_signals` do uvicorn é substituído de propósito: o original reemite o sinal depois de desligar e
o processo morreria **por sinal** (143), nunca com `exit 0`.

## 9.5 Container — o projeto nasce dockerizado

Decisão do ADR-022 (que revisa o ADR-012): a **unidade de release** é **uma imagem de backend do monólito
composto** mais **uma imagem de front** quando algum módulo tem `webPath`. O módulo **extraído** (ADR-001)
continua possível e se publica pela skill `deploy-docker-microsservico`. Todo projeto gerado por
`create-project` traz os arquivos abaixo — não é flag.

| Arquivo (raiz do projeto) | O que é | Quem o escreve |
|---|---|---|
| `Dockerfile` | a imagem do backend: multi-stage, base fixada, não-root, `HEALTHCHECK`, `LABEL …revision`; o artefato vem de `tools/package.mjs` (§9.1) | binding (estático) |
| `front.Dockerfile` | a imagem do front (`nginx-unprivileged`): o build de cada `web/` sob o `webPath` dele. **Só TS/JS** | binding (estático) |
| `.dockerignore` | contexto enxuto, e **nenhum** `.env*` na imagem | binding (estático) |
| `compose.yml` | **profile padrão** = o Postgres de dev; **profile `app`** = paridade (backend + front + banco, em loopback) | binding (estático) |
| `deploy/nginx.conf` | a origem única: cabeçalhos, `/healthz`, `/` → 404, o proxy de `/api/v1/`. **Só TS/JS** | binding (estático; o projeto ajusta) |
| `deploy/.env.example` | as chaves `DEPLOY_*` que **só o compose lê** | binding (estático) |
| `deploy/nginx.modules.conf` | uma `location` por `module.json:webPath` não-nulo + os tunables do proxy | **gerado** (`sync-deploy`) |
| `deploy/compose.modules.yml` | o fragmento do `app` que muda com os módulos: a URL do banco de cada `<MODULE>_DB_URL` e o `stop_grace_period` | **gerado** (`sync-deploy`) |

**O ambiente que só o deploy lê mora em `deploy/.env`** (real, gitignored) **+ `deploy/.env.example`**
(versionado) — nunca no `.env` da raiz, porque o `sync-env` é dono dele e move para a seção `ORFAS` toda chave
que nenhum manifesto exige (ADR-004), e declarar `DEPLOY_*` em `project.json` faria `root-env-declared`
acusar "declarada e sem leitor". `tools/docker-up.mjs` passa os dois `--env-file` na ordem certa (o segundo
vence).

**Rotas e URLs são geradas, não escritas** — `node tools/sync-deploy.mjs` lê `modules/*/module.json` e
`config/runtime.json`, e escreve os dois arquivos `*.modules.*`. O estático **inclui** o gerado
(`include` no nginx, `extends` no compose), então o ajuste do projeto no `nginx.conf` sobrevive à
regeneração. `--check` reprova se divergirem dos manifestos (mesmo modelo de `sync-env --check`) e entra no
`verify`; `create-module` regenera. Os tunables (corpo máximo, timeout do proxy, folga de desligamento) são
**config versionada** em `config/deploy.json` — fora de `config/runtime.json` de propósito: aquele o
**processo** lê e o artefato carrega; este só o deploy lê.

**`ROOT_API_HOST` no container.** O `.env` de dev guarda loopback, e com isso ninguém alcança o processo de
dentro do container. O `compose.yml` o sobrescreve no `environment:` do serviço `app` (`0.0.0.0`): o host de
escuta é **propriedade do container**, não do ambiente, e `environment:` vence `env_file:`. O processo
continua **sem default embutido** (§9.4, `root-fallback`): se a linha sumir, o boot cai nomeando a chave. A
alternativa descartada foi `ENV ROOT_API_HOST=0.0.0.0` no `Dockerfile`: o `env_file` do compose a vence, e o
`.env` de dev voltaria a ser o que o container lê.

**Módulo Python com front.** O molde Python nasce sem `web/`, então não há `front.Dockerfile`, `nginx.conf`
nem serviço `front` no compose — o `app` publica a própria API em loopback (`DEPLOY_APP_PORT`). Se um módulo
Python ganhar `web/` (o front do ecossistema é TypeScript), o projeto copia do binding `typescript`
`front.Dockerfile` e `deploy/nginx.conf`, acrescenta o serviço `front` ao `compose.yml`, `DEPLOY_FRONT_PORT`
ao `deploy/.env.example` e a chave `front` ao `config/deploy.json`; a partir daí `sync-deploy` gera as rotas
(o gatilho é a presença de `deploy/nginx.conf`) e o gate passa a exigir os arquivos de front. Nada disto
muda a doutrina.

**O que o gate cobra** (§4.6 de `04-regras.md`): `container-present`, `compose-variables-declared` e
`dockerignore-secret` (o `.env` — inclusive `modules/<id>/.env` e `deploy/.env` — fica fora do contexto de
build). Dockerfile **bom** — não-root, sem `:latest`, healthcheck, porta em loopback, digest — é da skill
(`validar_monolito.py`, para o legado), não lei do template: depende de decisão por provedor.

**O que fica fora, de propósito:** o compose de **produção** (registry, digests, entrada, servidor) e a
publicação — a skill `deploy-docker-monolito` os traz, porque mudam por provedor. O template também não modela
ambientes (nada de staging/produção, nenhum segredo de produção) e não traz CD (ADR-012, que continua valendo
nessa parte).

## 9.6 Build do backend e configuração segura do container

O `Dockerfile` do backend chama `tools/package.mjs --backend-only`: em uma imagem de backend, o script compila
somente o backend e empacota seu artefato. `npm run build` mantém o comportamento completo — backend e build
Vite dos módulos com `web/`; a imagem de front é dona desse build. Assim o build de front não roda dentro da
imagem de backend e depois é descartado.

O `create-project` executa `tools/sync-env.mjs` depois de copiar o template. O mesmo gerador usado por
`create-module` deriva o `.env.example` da raiz dos manifestos, inclusive quando o projeto ainda não tem um
módulo criado manualmente. O arquivo documenta os nomes das variáveis; valores reais continuam por ambiente.

`deploy/compose.modules.yml` deriva URLs com `${DEPLOY_DB_USER:?required}` e
`${DEPLOY_DB_PASSWORD:?required}`. A verificação de segredos só permite a URL quando usuário e senha são
interpolados de variáveis de ambiente; credencial literal, inclusive quando apenas um dos dois campos é
literal, continua sendo achado. `.gitleaks.toml` contém a mesma permissão restrita para que a varredura do
staged e a verificação local usem o mesmo critério.
