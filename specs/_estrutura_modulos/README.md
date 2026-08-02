# Template de Módulos

Template canônico para sistemas modulares: **uma federação de módulos autossuficientes**, cada um dono do
próprio front, da própria API, do próprio motor e da própria fatia de banco.

A independência não é estética. Ela existe para que **qualquer módulo possa ser extraído para infraestrutura
própria sem refactor**: a fronteira física de pastas **é** a fronteira de dependência. Extrair um módulo é
copiar uma pasta e recortar as chaves `<MODULO>_*` do `.env` — não reescrever import.

## Começar

```bash
# 1. instanciar um projeto novo
node ferramentas/criar-projeto.mjs ../meu-sistema --binding typescript --escopo acme

# 2. criar o primeiro módulo
cd ../meu-sistema
node ferramentas/criar-modulo.mjs catalogo

# 3. verificar
node ferramentas/gate/validar.mjs --todos
```

O projeto nasce com a **doutrina** e as **ferramentas** dentro dele. A verificabilidade viaja junto e não
depende de nenhum provedor de CI.

> **Onde a doutrina cai no projeto.** Ela **não** vira árvore paralela: as cinco leis são instaladas em
> `specs/arquitetura/` e as decisões do template em `specs/adr/000-decisoes-do-template.md`. A doutrina *é*
> a spec de arquitetura do projeto — ter uma pasta `doutrina/` ao lado de `specs/` seria dois lugares de
> documento normativo, exatamente o defeito que este template existe para evitar.
>
> A porta prática é a skill **`meta-iniciar-repositorio`** do ecossistema Sarak, que faz a inicialização
> completa (git, projeto, specs, primeiro módulo, hooks) chamando estas ferramentas.

## As três camadas

| Camada | Onde | Muda por linguagem? |
|---|---|---|
| **0 — Doutrina** | [`doutrina/`](doutrina/) — anatomia, manifesto, contrato, nomenclatura, catálogo de regras | **Não** |
| **1 — Binding** | [`bindings/<linguagem>/`](bindings/) — como a doutrina se materializa numa stack | Sim |
| **2 — Ferramentas** | [`ferramentas/`](ferramentas/) — scaffold, gate, sincronizador de ambiente | Não |

A lei é agnóstica de linguagem; a prova é concreta.

## O que ler, em ordem

| Pergunta | Documento |
|---|---|
| O que é o sistema, de que peças é feito, onde estão as fronteiras? | [`doutrina/00-arquitetura.md`](doutrina/00-arquitetura.md) |
| Como um módulo é por dentro? Como crio e altero um? | [`doutrina/01-modulo.md`](doutrina/01-modulo.md) |
| Qual a forma da API, do erro, do schema, da migration? | [`doutrina/02-contrato-e-dados.md`](doutrina/02-contrato-e-dados.md) |
| Como trato segurança, log, teste e extração? | [`doutrina/03-operacao.md`](doutrina/03-operacao.md) |
| **Qual é a regra, e o que a verifica?** | [`doutrina/04-regras.md`](doutrina/04-regras.md) |
| Por que foi decidido assim? | [`doutrina/adr/decisoes.md`](doutrina/adr/decisoes.md) |

**[`04-regras.md`](doutrina/04-regras.md) é a única fonte normativa.** As demais leis explicam e apontam para
ela. Regra que não está lá não é regra; regra que não pode ser verificada por máquina não entra lá.

## As quatro fronteiras

1. **Código** — nenhum módulo importa código de outro. Lógica de negócio nunca é compartilhada; duplica-se.
2. **Infraestrutura** — o módulo declara `core/portas/` e o provedor é escolhido em `config/portas.json`.
   O nome do fornecedor não aparece em nenhum outro lugar do módulo.
3. **Módulo alheio** — dado de outro módulo vem por `core/gateways/`, **só HTTP**, declarado em `consome`.
4. **Dados** — schema nunca `public`, tabela sempre prefixada `<modulo>_`, sem JOIN ou FK cruzando módulos.

## Ferramentas

```
criar-projeto.mjs <destino> [--binding b] [--escopo e]   instancia um projeto
criar-modulo.mjs <id> [--papel p] [--sem-artefato] [--sem-web]
gate/validar.mjs <caminho-do-modulo>                     valida UM módulo
gate/validar.mjs --todos                                 todos + as regras globais
gate/validar.mjs --extracao <caminho>                    vira microsserviço hoje?
sincronizar-env.mjs [--conferir]                         regenera os .env.example
```

**A unidade de verificação é o módulo, não o repositório.** Se o verificador só funcionasse no repositório
inteiro, o módulo extraído perderia o verificador junto — a conformidade morreria exatamente no momento em que
a arquitetura foi cobrada.

**O template não traz pipeline de CI/CD**, de propósito. Config de CI é específica de provedor, e a regra não
pode morar num lugar que se perde ao trocar de provedor. Plugar o gate em qualquer executor é uma linha — ver
[`ferramentas/gate/README.md`](ferramentas/gate/README.md).

## Bindings

| Binding | Comando de verificação | Estado |
|---|---|---|
| `typescript` | `npm run verificar` | **verde** — gate + env + `tsc` + 24 testes |
| `javascript` | `npm run verificar` | **verde** — gate + env + `tsc --checkJs` (JSDoc) + 24 testes |
| `python` | `python verificar.py` | **verde** — gate + env + ruff + mypy + 19 testes |

Nos três, o projeto instanciado sai com `packages/portas`, `adapters/memoria` (obrigatório — é o que
permite testar sem rede) e `src/composicao` prontos, e o comando de verificação passa de saída.

> **O gate é uma ferramenta Node em todos os bindings — de propósito.** Um verificador por linguagem
> divergiria do outro, e a doutrina deixaria de ter uma única leitura.
>
> **O projeto Python não declara Node** — sem `package.json`, sem `devDependency`. O gate é ferramenta de
> **auditoria**: roda pelo ferramental de quem desenvolve, não pelo manifesto do projeto. Quem usa a base
> Sarak já tem Node (a própria base o exige), do mesmo modo que já tem Python. Override explícito:
> `SARAK_NODE=<caminho-do-binário>`.
>
> Sem Node, o passo **reprova** — "não verificado" nunca é reportado como `ok`.

A anatomia, o manifesto, o contrato e o catálogo de regras são **idênticos** entre bindings. Só a
materialização muda (`package.json` ↔ `pyproject.toml`, Express ↔ FastAPI, Vitest ↔ pytest, `index.ts` ↔
`__init__.py`, anotação de tipo ↔ JSDoc). O binding Python nasce backend-only (`rotaWeb: null`) porque o front
do ecossistema é sempre TypeScript — módulo Python que precise de tela usa o `web/` do binding TS, sem mudar
nada na doutrina.

## O gate se testa

```
node ferramentas/gate/testes/executar.mjs [--binding typescript|javascript|python]
```

Duas afirmações, e o gate só está saudável se as duas valerem: o molde **conforme** produz zero erro, e cada
mutação de `casos.mjs` produz **exatamente** o id de regra esperado. A segunda é a que importa mais — sem ela,
"verde" é indistinguível de "não verificou", e uma regra quebrada passa despercebida para sempre.

Caso que não se aplica a um binding aparece como `SEM COBERTURA`, nunca como `ok`.

## O molde é validado como módulo real

O `_template` de cada binding passa pelo gate exatamente como um módulo de verdade — os marcadores são
substituídos em memória por um id sintético. Não é preciosismo: num sistema real o molde era a única pasta que
o validador pulava, apodreceu sem ninguém notar, e **todo módulo criado a partir dele passava no validador e
não compilava** ([ADR-006](doutrina/adr/decisoes.md)).

## Criar sistema ou módulo pela skill

A skill **`code-modulo`** do ecossistema Sarak conduz os dois fluxos com HITL:

| Fluxo | Quando | O que faz |
|---|---|---|
| **A — sistema novo** | o projeto ainda não tem `ferramentas/` + `modulos/` | `criar-projeto` + N × `criar-modulo` + `verificar` |
| **B — módulo novo** | o projeto já adotou o template | coleta a identidade, roda o scaffold, preenche o manifesto, escreve o contrato **antes** do código |

Nos dois, só encerra com o **gate verde**. A detecção do caso é automática — a skill olha a raiz do projeto
em vez de perguntar o que o repositório já responde.
