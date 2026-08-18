---
name: code-modulo
description: Cria sistemas modulares e módulos conforme o template de módulos Sarak — scaffold determinístico, manifesto declarado, contrato antes do código e gate verde ao final. Dois fluxos — iniciar um sistema modular do zero, ou acrescentar um módulo a um projeto que já adota o template. Use ao criar módulo ou estruturar um sistema em módulos. Mutativa (cria arquivos) — HITL antes do scaffold. NÃO acione proativamente.
---

# Skill: Módulo

Porta única para o **template de módulos**: cada módulo é uma fatia vertical autossuficiente — dono do
próprio front, da própria API, do próprio motor e da própria fatia de banco. O módulo nasce **extraível**:
virar microsserviço depois é copiar a pasta e recortar as chaves `<MODULO>_*` do `.env`, sem refactor.

> **Fonte normativa:** o catálogo `specs/arquitetura/04-regras.md` **do projeto** (na base Sarak:
> `specs/_estrutura_modulos/doutrina/04-regras.md`). **Não duplique regra aqui.** Esta skill conduz o fluxo;
> quem diz o que é certo é a lei, e quem cobra é o gate.
>
> Aplica também `padrao-escrita` (Nível 0) e a `padrao-<linguagem>` do binding.

> **Não é esta skill:** adequar legado ao padrão → `code-diagnostico` + `code-adequacao`; migration com dado
> real → `db-migrations`; contrato/OpenAPI aprofundado → `test-api-contrato`; inicializar o repositório
> inteiro (git, specs, hooks, remoto) → `meta-iniciar-repositorio`, que chama esta skill no meio.

## Quando usar
- Sob demanda, ao criar um **módulo** ou ao **estruturar um sistema em módulos**.
- Mutativa (cria dezenas de arquivos) → **HITL obrigatório** antes de qualquer scaffold.

## Detecção do caso — antes de perguntar

```
existe tools/create-module.mjs E modules/ na raiz do projeto?
   sim → FLUXO B (módulo novo)          não → FLUXO A (sistema novo)
```

Confirme em **uma linha** e siga: *"Projeto já adota o template (`modules/` com 3 módulos) → vou criar um
módulo novo. Certo?"* Perguntar "você quer A ou B?" quando o repositório já responde é atrito.

**Princípio da entrevista: pergunte só o que não dá para inferir.** Binding, escopo, schema e topologia saem
do projeto quando ele existe — leia `module.json` de um vizinho antes de abrir a boca.

---

## Fluxo A — iniciar um sistema modular

Detalhe de cada passo em `references/workflow.md` §A.

1. **Confirmar o terreno** — diretório vazio ou repositório sem `modules/`. Se já houver `package.json`,
   `pyproject.toml` ou `.gitignore`, o `create-project` **aborta**: decida com o usuário antes de `--forcar`.
2. **Entrevista** — o bloco A de `references/templates.md`:

   | Bloco | Extrai |
   |---|---|
   | Identidade | destino, nome do sistema, escopo dos packages (`@acme`) |
   | Stack | binding — `typescript` \| `javascript` \| `python` |
   | Dados | topologia (schema único ou por módulo) + nome do schema — **nunca `public`** |
   | Interface | `ui.modo` padrão (`proprio` \| `kit`) e o pacote, se `kit` |
   | Decisões registráveis | idioma das pastas (misto EN ou PT puro) → vira ADR no projeto |
   | Primeiros módulos | quais criar já e o papel de cada um (inclui se haverá `conector` e `gateway`) |

3. **HITL — plano** — a árvore que será criada, os módulos, e **o que não será tocado**.
   → "⚠️ Confirma?" **Aguarde.**
4. **Instanciar** — `node <template>/tools/create-project.mjs <destino> --binding <b> --escopo <e>`.
   A doutrina cai em `specs/arquitetura/`; as decisões, em `specs/adr/000-decisoes-do-template.md`.
5. **Registrar as decisões do projeto** — idioma das pastas, topologia de schema e `ui.modo` viram ADR novo
   em `specs/adr/`, não comentário solto.
6. **Criar cada módulo** — repita o Fluxo B para cada um, na ordem: `conector` por último (ele agrega os outros).
7. **Verificar** — `validate.mjs --todos` + o comando `verificar` do binding. **Não encerre vermelho.**
8. **Reportar** — árvore criada, módulos, decisões registradas, o que ficou pendente.

---

## Fluxo B — módulo novo

Detalhe em `references/workflow.md` §B. Trate **um módulo por vez**.

1. **Ler antes de decidir** — `specs/arquitetura/01-modulo.md` (anatomia + manifesto) e `04-regras.md`
   (catálogo). Liste `modules/` — os vizinhos são o vocabulário de `consumes`.
2. **Entrevista** — o bloco B de `references/templates.md`:

   | Bloco | Extrai |
   |---|---|
   | Identidade | `id` (kebab-case), `name`, `description` numa linha, `role` (`domain`\|`gateway`\|`connector` — a mesma palavra na CLI `--role` e no manifesto) |
   | Forma | `generatesArtifact`, `webPath` ou `null`, `ui.modo` |
   | Dados | tabelas do módulo (schema e prefixo **herdados** dos vizinhos) |
   | Dependências | portas de infraestrutura (`ports`); `consumes` de outros módulos — **com checagem de ciclo antes de confirmar** |
   | Segurança | `permissions`, `publicRoutes` (opt-in, **método incluso**), `sensitiveFields`, `requiredEnv` |

3. **HITL — plano** → "⚠️ Confirma a criação do módulo `<id>`?" **Aguarde.**
4. **Scaffold** — `node tools/create-module.mjs <id> --role domain|gateway|connector --binding <b> [--sem-artefato]`.
5. **Declarar no manifesto** — `data`, `requiredEnv`, `ports`, `consumes`, `permissions`, `publicRoutes`,
   `sensitiveFields`, `navigation`. **Não declarado, não existe** — é daqui que o gate lê.
6. **Contrato antes do código** — `contract/openapi.yaml` **primeiro**, com `/health`, `/meta` e `/resumo`.
7. **Preencher nesta ordem** — `core/domain` → `api/src/routes` → `api/src/mappers` (saída por
   **allowlist**) → `database/` (migration com `-- rollback`) → `web/src/pages` → `tests/`.
8. **Sincronizar ambiente** — `node tools/sync-env.mjs`; valores reais no `.env` da **raiz**.
9. **Gate verde** — `validate.mjs modules/<id>` **e** `validate.mjs --extracao modules/<id>`.
10. **Reportar** — id, role, binding, rotas, tabelas, portas, `consumes` e pendências.

---

## Regras e limites
- **NUNCA** crie o módulo copiando a pasta do molde à mão — use o `create-module.mjs`. Módulo manual nasce sem
  manifesto e com nome divergente: as duas coisas que o gate reprova e não consegue consertar sozinho.
- **NUNCA** importe código de outro módulo — nem por package, nem por caminho relativo saindo da pasta. Dado
  alheio vem pelo **contrato HTTP** do dono, em `core/gateways/`, e a dependência se declara em `consumes`.
- **NUNCA** importe SDK de fornecedor (`@supabase/*`, `pg`, `aws-sdk`, `firebase`, `oracledb`) dentro do
  módulo — infraestrutura só por porta; o nome do provedor só aparece em `config/ports.json`.
- **NUNCA** escreva rota antes do `contract/openapi.yaml` — código divergente da spec é erro de gate.
- **NUNCA** declare `data.schema` como `public`, nem tabela sem o prefixo `<id>_`.
- **NUNCA** ponha segredo no `.env` do módulo — ele só aceita `ENV_RAIZ` e chaves `<MODULO>_*`.
- **NUNCA** confirme um `consumes` sem checar ciclo: `A→B` e `B→A` reprova, e o conserto é redesenho.
- **NÃO** use fallback de infraestrutura (`env['X'] ?? 'http://localhost'`) — falta de config **derruba o boot**.
- **NÃO** devolva registro cru na resposta — a saída é montada campo a campo pelo mapeador.
- **NÃO** renomeie pasta da árvore canônica. **Descartar** o que o módulo não usa é permitido; renomear, não.
- **NÃO** registre exceção no `conformidade.json` para fazer o gate passar — exceção exige motivo escrito e
  ADR ratificado, e o gate rejeita exceção sem esse link.
- **NÃO encerre com o gate vermelho.**

## Checklist "pronta"
- [ ] Caso detectado pelo repositório (não perguntado), e confirmado em uma linha?
- [ ] HITL com plano explícito **antes** de qualquer arquivo criado?
- [ ] `id` idêntico em pasta, package, `basePath`, prefixo de tabela e prefixo de env?
- [ ] Manifesto reflete o que o código usa (tabelas, env, portas, `consumes`, permissões)?
- [ ] `contract/openapi.yaml` escrito **antes** do código, com `/health`, `/meta` e `/resumo`?
- [ ] Zero import de outro módulo e zero SDK de fornecedor dentro do módulo?
- [ ] `consumes` sem ciclo, e cada gateway com a sua entrada declarada?
- [ ] `.env.example` gerado pelo script (não editado à mão) e valores no `.env` da raiz?
- [ ] Testes de domínio e de contrato rodando **sem rede e sem banco** (adapters de memória)?
- [ ] `validate <modulo>` e `validate --extracao <modulo>` verdes? (Fluxo A: também `--todos`.)
- [ ] Fluxo A: decisões do projeto (idioma, schema, `ui.modo`) registradas em `specs/adr/`?

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — cada passo dos dois fluxos em detalhe, com o que detectar e como corrigir.
- `references/templates.md` — blocos copiáveis: entrevista A e B, plano HITL, `module.json`, esqueleto do
  `openapi.yaml`, relatório final.
- `references/examples.md` — um módulo criado certo e um errado, com o impacto de cada violação.
