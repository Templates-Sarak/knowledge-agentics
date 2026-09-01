---
name: code-generalizacao-modulo
description: Destila um módulo já existente num módulo NOVO, genérico e reutilizável, em repositório próprio — sem regra de negócio, sem marca e sem rastro da origem, provado por seis degraus de verificação. Use ao criar um módulo reutilizável a partir de um que já funciona num sistema real. ≠ adequar legado no lugar (meta-adequacao-modular). NÃO acione proativamente.
---

# Skill: Generalização de Módulo

Pega um módulo que **já funciona** dentro de um sistema real e entrega um módulo **novo, genérico e
autossuficiente, em repositório próprio** — mesma capacidade, zero negócio, zero origem. É como se
constrói uma prateleira de módulos reutilizáveis a partir de trabalho que já foi feito uma vez.

> **Dependência:** aplica `padrao-escrita` (Nível 0), a `padrao-<linguagem>` do binding e o catálogo
> `specs/arquitetura/04-regras.md` do repositório gerado (na base Sarak,
> `specs/_estrutura_modulos/doutrina/04-regras.md` — Nível 1). **Não duplique regra de nenhuma delas
> aqui.** Orquestra `meta-iniciar-repositorio` (o repo novo), `code-modulo` (a anatomia do módulo),
> `db-migrations` (o schema), `test-integracao-api` e `test-api-contrato` (os degraus 4 e 5) e
> `cyber-dados` (dado real em fixture/seed). Esta skill conduz o fluxo; quem diz o que é certo é a
> lei, e quem cobra é o gate.

> **"Generalizar" ≠ "extrair".** Na doutrina (`03-operacao.md` §6), **extrair** é levar o **mesmo**
> módulo para infraestrutura própria copiando a pasta. Aqui é o oposto operacional: **nada se copia** —
> a capacidade é reimplantada limpa. Confundir os dois faz o módulo "genérico" nascer cheio de
> comentário, fixture e exemplo do negócio de origem.

> **Não é esta skill:** módulo novo sem origem para destilar → `code-modulo`; adequar um legado **no
> lugar** → `meta-adequacao-modular`; adequar Nível 0 → `/code1-auditar` → `/code3-adequar`;
> empacotar para produção → `deploy-docker`.

## Quando usar
- Sob demanda, quando o usuário quer transformar um módulo existente em módulo reutilizável de prateleira.
- **Mutativa** (cria um repositório inteiro) → **HITL nos três portões do mapa abaixo**.
- **A origem é read-only, sempre.** Esta skill nunca edita, move ou "limpa" o sistema de onde destila.

## O princípio — a origem é fonte de comportamento, nunca fonte de arquivo

O módulo novo **nasce do scaffold** (`create-module.mjs`, via `meta-iniciar-repositorio`) e é
preenchido lendo a origem. Copiar a pasta arrasta nome de tabela, chave de env, comentário, seed,
exemplo de OpenAPI e vocabulário do negócio — e o "genérico" vira uma caça a strings sem fim.

## Passo 0 — pré-condições mecânicas (antes de qualquer pergunta)

```
node tools/gate/validate.mjs modules/<origem>                → verde
node tools/gate/validate.mjs --extraction modules/<origem>   → verde
o comando `verificar` do projeto de origem                   → verde
docker info                                                  → responde
```

Qualquer um vermelho: **PARE e diga qual**. Módulo inacabado é alvo móvel — generalizar antes de ele
estabilizar é retrabalho garantido. Sem Docker, os degraus 4 e 5 não rodam, e entrega parcial aqui
não existe: *"não verificado" nunca é reportado como `ok`*.

## Fluxo

1. **Inventariar a origem** (read-only) — `python scripts/inventariar_origem.py --modulo <caminho> --json`
   devolve superfície do contrato, tabelas/colunas, chaves de env, `ports`, `consumes`, `permissions`,
   `publicRoutes` e o **léxico**: identificadores por frequência, separando vocabulário de capacidade
   de vocabulário de negócio. Reporte o resultado como fato, em uma linha.
2. **⚠️ HITL — mapa de capacidade** (o portão central; molde em `references/templates.md` §1). Três
   colunas, item a item do inventário:

   | Coluna | O que é | Destino |
   |---|---|---|
   | **Núcleo** | a capacidade que existiria em qualquer sistema | fica, reimplantado |
   | **Especialização** | regra, campo ou vocabulário do negócio de origem | sai — ou vira **ponto de extensão** declarado |
   | **Infraestrutura** | fornecedor concreto (banco, e-mail, fila, provedor de identidade) | vira **porta** em `core/ports/` |

   Nada de código antes deste portão. **"Sai" e "vira ponto de extensão" são decisões diferentes** —
   apagar o que o próximo projeto vai precisar custa tanto quanto carregar o negócio junto.
3. **⚠️ HITL — identidade nova** — `id`, nome da capacidade, escopo dos packages, prefixo de tabela,
   prefixo de env, permissões e rotas. Tudo **derivado da capacidade**, nunca traduzido da origem:
   `pedido_usuario` não vira `order_user`; vira `<id>_usuario`, ou não existe.
4. **Criar o repositório do módulo** — um módulo, um repositório. Via `meta-iniciar-repositorio`:
   ```
   python meta-iniciar-repositorio/scripts/init_repo.py --target <repo> --name "<capacidade>" \
          --binding <typescript|javascript|python> --escopo <escopo> --modulos <id>:<role> --git-init
   ```
   O repo nasce com `tools/`, `packages/ports`, `adapters/memory`, `src/composicao` e
   `specs/arquitetura/` ao redor do módulo — o procedimento de extração da doutrina já vem executado.
5. **Registrar as decisões como desenho** — o mapa do passo 2 vira ADR em `specs/adr/` do repo novo,
   escrito como **decisão de arquitetura** (por que a autenticação é uma porta, quais são os pontos de
   extensão), **nunca como histórico**. Procedência não se registra em lugar nenhum.
6. **Contrato antes do código** — `contract/openapi.yaml` reescrito a partir da capacidade, com
   `/health`, `/meta` e `/resumo` e **exemplos neutros**. Só então: `core/domain` → `api/src/routes` →
   `api/src/mappers` → `database/` (migration **nova**, com `-- rollback`) → `web/` → `tests/`.
7. **Os seis degraus** — `python scripts/verificar_entregavel.py --repo <repo> --modulo <id>`.
8. **Entregar** — ⚠️ HITL final com o relatório dos seis degraus, os pontos de extensão e o que ficou
   pendente. O primeiro commit e o remoto são da `git-commit-inicial`.

## Os seis degraus — cada um afirma uma coisa diferente

| # | Afirmação | Prova |
|---|---|---|
| 1 | **Conforme** | `validate.mjs modules/<id>` |
| 2 | **Extraível** | `validate.mjs --extraction modules/<id>` |
| 3 | **Funciona sem infra** | o comando `verificar` do binding — tipos + testes com `adapters/memory`, sem rede e sem banco |
| 4 | **O schema funciona** | migration `up` **e** `rollback` num banco efêmero (Docker) → `db-migrations` + `test-integracao-api` |
| 5 | **Sobe e cumpre o contrato** | boot no compose efêmero; `/health`, `/meta` e `/resumo` validados contra o `openapi.yaml` → `test-api-contrato` |
| 6 | **É genérico** | `scripts/verificar_neutralidade.py` — denylist em **todo** texto do módulo, zero ocorrência |

O gate (1 e 2) é **estático e sem efeito colateral por contrato**: ele nunca roda o módulo. Tratar
verde de gate como prova de funcionamento é o defeito que `03-operacao.md` §6 registra. Os degraus 4 e
5 compartilham **um** ambiente efêmero, subido e derrubado pelo `verificar_entregavel.py`.

## Invariantes do módulo genérico (cobrados, não lembrados)

- **`consumes` vazio.** Sozinho no repositório, não há vizinho para consumir. Todo `consumes` da origem
  vira porta, entra por parâmetro/claim, ou é **corte declarado** — é aí que o acoplamento de negócio
  se esconde.
- **`role` é `domain` ou `gateway`, nunca `connector`** — conector agrega outros módulos; num repo de
  um módulo só, é contradição.
- **Multi-tenancy é do núcleo, não do negócio.** Se a origem separa dados por empresa/organização, a
  forma é genérica e permanece; o que sai é o *significado* que o negócio dava a ela.
- **Ponto de extensão é porta ou config declarada** — nunca um desvio condicional por tipo, guardado
  no código "por enquanto".

## Mapa de HITL — onde a skill para

| Portão | Por quê |
|---|---|
| mapa de capacidade (núcleo × especialização × infraestrutura) | é julgamento puro, e decide o módulo inteiro |
| identidade nova (`id`, escopo, prefixos, permissões, rotas) | nomear é a decisão que não se desfaz depois do primeiro consumidor |
| relatório final dos seis degraus | aceitar a entrega, e o que fica pendente |

**Onde HITL é desperdício** (a máquina decide e só reporta): degrau verde ou vermelho; quais regras o
gate acusou; quais termos a denylist pegou; se a origem estava estável no passo 0.

## Regras e limites
- **NUNCA** copie a pasta do módulo de origem, nem arquivo dela — nem "só o domínio", nem "só os testes".
  O módulo nasce do scaffold; a origem é lida.
- **NUNCA** toque no sistema de origem. Se ele precisa de conserto, isso é outra campanha
  (`/code1-auditar` → `/code3-adequar`), em outra conversa.
- **NUNCA** cite a origem em lugar nenhum do entregável — código, comentário, teste, ADR, README,
  `openapi.yaml` ou mensagem de commit. Zero procedência é decisão registrada, e o degrau 6 a cobra.
- **NUNCA** traga migration, seed ou fixture da origem com dado real — é vazamento de negócio e de dado
  pessoal ao mesmo tempo. Fixture nova, neutra, inventada. Suspeita de PII → `cyber-dados`.
- **NUNCA** guarde a denylist dentro do repositório verificado — ela lista os termos da origem, e
  versioná-la ali **é** o vazamento que o degrau 6 procura. O script recusa antes de varrer.
- **NUNCA** deixe nome de fornecedor dentro do módulo — infraestrutura só por porta; o provedor só
  aparece em `config/ports.json`.
- **NUNCA** encerre com degrau vermelho **nem com degrau não executado** — "não verificado" reportado
  como verde é pior que vermelho honesto.
- **NÃO** comece a escrever código antes do portão do mapa de capacidade — sem ele, "genérico" é opinião.
- **NÃO** generalize módulo de origem instável (gate ou testes vermelhos): alvo móvel, retrabalho certo.
- **NÃO** commite nem crie remoto por conta própria → `git-commit-inicial`.
- **NÃO** saia do escopo: empacotar para produção é `deploy-docker`; segurança por domínio é `cyber-*`;
  performance é `otimizacao-*`.

## Checklist "pronta"
- [ ] Passo 0 verde nos quatro sinais (gate, `--extraction`, `verificar` da origem, `docker info`)?
- [ ] Inventário rodado **antes** de qualquer pergunta ao usuário?
- [ ] Mapa de capacidade aprovado em HITL, com cada item do inventário em uma das três colunas?
- [ ] Identidade derivada da capacidade (nenhum nome traduzido da origem)?
- [ ] Repositório criado por `meta-iniciar-repositorio`, um módulo, `--modulos <id>:domain|gateway`?
- [ ] `consumes` vazio, `role` ≠ `connector`, nenhum SDK de fornecedor dentro do módulo?
- [ ] Decisões do mapa registradas como ADR de desenho, **sem** procedência?
- [ ] `openapi.yaml` escrito antes do código, com `/health`, `/meta`, `/resumo` e exemplos neutros?
- [ ] Migration nova (com `-- rollback`), nenhuma linha vinda da origem?
- [ ] Os **seis** degraus executados e verdes, nenhum pulado?
- [ ] Relatório final entregue, com pontos de extensão e pendências (`.env`, primeiro commit)?

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — cada passo em detalhe, o que detectar, e as armadilhas medidas.
- `references/templates.md` — mapa de capacidade, plano HITL, denylist, ADR de pontos de extensão,
  `compose` de verificação e relatório final.
- `references/examples.md` — uma generalização certa e uma errada, com o impacto de cada desvio.
- `scripts/inventariar_origem.py` — passo 1, read-only, com `--autoteste`.
- `scripts/verificar_neutralidade.py` — degrau 6, lógica pura, com `--autoteste`.
- `scripts/verificar_entregavel.py` — orquestra os seis degraus e o ambiente efêmero, com `--autoteste`.
