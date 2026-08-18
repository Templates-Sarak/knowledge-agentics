# Templates de Preenchimento: code-modulo

Blocos copiáveis dos outputs desta skill. Placeholders em `<colchetes angulares>`.

---

## 0. Entrevista e plano do Fluxo A (sistema novo)

Pergunte só o que não dá para inferir. Nome e escopo saem da pasta e do remoto git, quando existirem.

```markdown
## Plano — iniciar o sistema `<nome>`

**Destino:** <caminho>   ·   **Binding:** <typescript|javascript|python>   ·   **Escopo:** @<escopo>

**Dados**
| Item | Valor |
|---|---|
| Topologia | schema único \| um schema por módulo |
| Schema | `<nome>` — **nunca** `public` |

**Interface:** ui.modo padrão `<proprio\|kit>` <, pacote `@<escopo>/ui-kit`>

**Decisões que virarão ADR em `specs/adr/`**
| # | Decisão | Escolha |
|---|---|---|
| 1 | Idioma das pastas | misto (EN técnico + PT domínio) \| PT puro |
| 2 | Topologia de schema | <acima> |
| 3 | `ui.modo` padrão | <acima> |

**Módulos iniciais**
| id | role | o que faz | generatesArtifact | webPath |
|---|---|---|---|---|
| `<id>` | dominio | <uma linha> | não | `/<id>` |
| `hub` | conector | casca, navegação e agregação | não | `/` |

**Será criado:** `tools/`, `packages/ports`, `adapters/memory`, `src/composicao`,
`modules/{_template,<ids>}`, `specs/arquitetura/` (5 leis), `specs/adr/000-decisoes-do-template.md`,
`config/conformidade.json`, `.env`, `.gitignore`.

**NÃO será tocado:** <listar o que já existe no destino>

⚠️ **Confirma?**
```

---

## 1. Plano HITL do Fluxo B (passo 3 — antes de qualquer arquivo)

```markdown
## Plano — criar o módulo `<id>`

**Identidade**
| Campo | Valor |
|---|---|
| id | `<id>` |
| name | <Nome> |
| role (CLI `--role`, obrigatoria) | domain \| gateway \| connector |
| binding | typescript \| javascript \| python |
| basePath | `/api/v1/<id>` |
| webPath | `/<id>` \| null |
| ui.modo | proprio \| kit |
| generatesArtifact | true \| false |

**Dados** — schema `<schema>` (nunca `public`), prefixo `<id>_`
- `<id>_metadados`, `<id>_auditoria`

**Portas de infraestrutura** — repositorio, auditoria, relogio, geradorId
**Consome (outros módulos)** — `<outro>` via `GET /<recurso>` — motivo: <por quê>
**Env** — `<ID>_API_PORT`, `<ID>_DB_URL`

**Será criado** — `modules/<id>/` com contract, config, core, api, web, database, tests
**Não será tocado** — nenhum módulo existente; `.env` da raiz só ganha chaves novas (valores em branco)

⚠️ Confirma a criação do módulo `<id>`?
```

---

## 2. `module.json`

```jsonc
{
  "id": "<id>",
  "name": "<Nome>",
  "version": "0.1.0",
  "description": "<uma linha sobre o domínio de negócio>",

  "role": "domain",
  "binding": "typescript",

  "basePath": "/api/v1/<id>",
  "webPath": "/<id>",

  "data": {
    "schema": "<schema>",
    "prefix": "<id>_",
    "tables": ["<id>_metadados", "<id>_auditoria"]
  },

  "requiredEnv": ["<ID>_API_PORT", "<ID>_DB_URL"],

  "ports": ["repositorio", "auditoria", "relogio", "geradorId"],

  "consumes": [
    { "module": "<outro>", "contract": "GET /<recurso>", "why": "<motivo de negócio>" }
  ],

  "ui": { "modo": "proprio" },

  "permissions": ["<id>:ler", "<id>:escrever"],
  "publicRoutes": ["GET /health", "GET /meta", "GET /resumo"],
  "sensitiveFields": [],

  "navigation": { "label": "<Nome>", "icon": "Box", "order": 100 },
  "exportsSummary": true,
  "generatesArtifact": true
}
```

**`role` tem UM vocabulário só, o inglês do manifesto** — `--role domain`\|`gateway`\|`connector`, a
mesma forma que `init_repo.py` exige em `--modulos <id>:<role>` e a mesma que sai gravada em
`module.json`. Não há tradução em lugar nenhum do caminho. A flag é **obrigatória**: papel adivinhado
pelo nome do id é o defeito que a exigência fecha.

**Lembretes:** `consumes` vazio é `[]`, não ausente. `sensitiveFields` recebe todo campo com PII — ele nunca sai
em resposta, log ou OpenAPI. `publicRoutes` é **opt-in** e o método faz parte da declaração.

---

## 3. Esqueleto do `contract/openapi.yaml`

```yaml
openapi: 3.1.0
info:
  title: <Nome> — contrato público
  version: 1.0.0
  description: Única superfície pública do módulo <id>.
servers:
  - url: /api/v1/<id>

paths:
  /health:
    get:
      summary: Vivo e com as portas resolvidas
      responses: { '200': { description: ok } }
  /meta:
    get:
      summary: Ecoa o manifesto — é por aqui que o sistema descobre o módulo
      responses: { '200': { description: ok } }
  /resumo:
    get:
      summary: Contagem e indicadores agregados pelo conector
      responses: { '200': { description: ok } }

  /<recursos>:
    get:
      summary: Lista <recursos>
      parameters:
        - { name: pagina, in: query, schema: { type: integer, minimum: 1 } }
        - { name: tamanho, in: query, schema: { type: integer, minimum: 1 } }
      responses:
        '200': { description: coleção paginada }
    post:
      summary: Cria <recurso>
      responses:
        '201': { description: criado }
        '400': { description: VALIDACAO }

  /<recursos>/{hash}:
    get:
      summary: Obtém <recurso> pelo identificador universal
      parameters:
        - { name: hash, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: ok }
        '404': { description: NAO_ENCONTRADO }

components:
  schemas:
    Erro:
      type: object
      properties:
        erro:
          type: object
          properties:
            codigo: { type: string, enum: [VALIDACAO, NAO_AUTENTICADO, NAO_AUTORIZADO, NAO_ENCONTRADO, CONFLITO, LIMITE_EXCEDIDO, DEPENDENCIA_EXTERNA, INTERNO] }
            mensagem: { type: string }
            requestId: { type: string }
```

**Regras de forma:** recurso no **plural kebab-case**, **sem verbo** no path; payload em **camelCase**; o
identificador na URL é o hash universal, nunca o `id` interno do banco.

---

## 4. Primeira migration

```sql
-- modules/<id>/database/migrations/0001-cria-<entidade>.sql
create table "<schema>"."<id>_metadados" (
  id          uuid primary key default gen_random_uuid(),
  hash        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table "<schema>"."<id>_metadados" enable row level security;

-- rollback
-- drop table "<schema>"."<id>_metadados";
```

Toda tabela tem `id`, `hash`, `created_at`, `updated_at`, RLS ligado e bloco `-- rollback`.

---

## 5. Relatório final (passo 10)

```markdown
## Módulo `<id>` criado

| | |
|---|---|
| Papel / binding | <role> / <binding> |
| Rotas expostas | `/api/v1/<id>` — health, meta, resumo, <recursos> |
| Tela | `/<id>` \| sem tela |
| Tabelas | `<id>_metadados`, `<id>_auditoria` (schema `<schema>`) |
| Portas | repositorio, auditoria, relogio, geradorId |
| Consome | `<outro>` via `GET /<recurso>` \| nenhum |
| Env acrescentada | `<ID>_API_PORT`, `<ID>_DB_URL` — **valores pendentes no `.env` da raiz** |

**Gate:** `validate` ✅ · `validate --extracao` ✅

**Pendente**
- [ ] Preencher os valores das chaves novas no `.env` da raiz
- [ ] <regra de negócio ainda não implementada>
```
