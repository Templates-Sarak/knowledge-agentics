---
name: api-contrato
description: Define e valida o contrato OpenAPI do api/ de cada módulo (REST /api/v1/, plural kebab-case, camelCase) e testa o contrato — provider conforma à spec e consumidores dependem só do contrato (reforça o encapsulamento). Use ao criar/auditar contrato de API, escrever OpenAPI ou montar contract testing. NÃO acione proativamente.
---

# Skill: Contrato de API (OpenAPI + Contract Testing)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Faz do **contrato `api/`** de cada módulo um artefato **explícito, versionado e verificável**: uma spec
OpenAPI alinhada ao padrão (REST `/api/v1/`, recursos no plural kebab-case, payload em camelCase), lintada,
com o **provider conformando à spec** e os **consumidores dependendo só do contrato** — nunca dos internals
(`domain/`/`data/`) do outro módulo. É o que protege na prática o **encapsulamento** que torna o sistema
microservice-ready. Aditiva (cria `openapi.yaml` + testes de contrato) → HITL leve; teste ativo **só no
próprio app/staging**.

> O contrato é **dono** desta skill; a **norma** (REST, plural kebab-case, camelCase, encapsulamento via
> `api/`) vive em `padrao-escrita` → `references/PADRAO-ORGANIZACAO.md` — aqui é o **como** materializar e
> testar. **Segurança** da API (authz/IDOR/rate limit) é da `cyber-api` (preocupação distinta). A
> documentação de contrato na entrega (`code-entrega`) **aponta** para este artefato. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao definir/auditar o contrato de um módulo, escrever/atualizar OpenAPI, ou montar contract
  testing entre módulos (provider/consumer).
- Ao introduzir um consumidor novo de um módulo, ou antes de extrair um módulo como serviço.
- Aditiva (gera spec/testes) → HITL leve (confirme o escopo); teste ativo só no **próprio app**.

## Workflow
Trate **um contrato (um módulo) por vez**. Estrutura OpenAPI em `references/openapi-basico.md`; matriz de
teste em `references/contract-testing.md`; template em `assets/openapi-templates/`.

1. **Mapear o `api/` do módulo** — liste rotas, métodos, entrada/saída e erros do contrato público. A fonte da
   verdade é o `api/` (não o `domain/`). Identifique quem **consome** este módulo.
2. **Escrever/atualizar o OpenAPI** — copie `assets/openapi-templates/openapi.yaml` para o módulo; descreva
   cada rota conforme o padrão: prefixo **`/api/v1/`**, recurso no **plural kebab-case**, **sem verbo no path**
   (o método HTTP é o verbo), filtros via query; **schemas em camelCase**; cada resposta com seu **código** e
   shape de erro. Versione a spec junto do módulo (`api/openapi.yaml`).
3. **Lintar a spec (determinístico)** — `python scripts/validar_contrato.py --raiz <módulo>` (JSON: prefixo
   `/api/v1/`, segmentos kebab-case, sem verbo no path). Complemente com `spectral lint` se disponível
   (regras de estilo OpenAPI). Resolva os alertas.
4. **Teste de contrato — provider** — verifique que a implementação **conforma à spec**: respostas batem com
   o schema/códigos declarados (ex.: validar respostas contra o OpenAPI em testes, ou Schemathesis no próprio
   app). Divergência → corrija o código **ou** a spec (a que estiver errada), nunca ignore.
5. **Teste de contrato — consumer** — para cada consumidor, garanta que ele depende **só do contrato**
   (chama o `api/`, casa com o shape do contrato) e **não** dos internals do provider. Um mock derivado do
   contrato (não da implementação) protege o consumidor de quebra silenciosa.
6. **Versionar mudança de contrato** — breaking change exige **nova versão** (`/api/v2/` ou campo novo
   aditivo/opcional); nunca quebre `/api/v1/` em uso. Documente o que mudou.
7. **HITL — plano** — apresente: rotas no contrato, alertas do lint, divergências provider/consumer e a
   correção (código ou spec), e se há breaking change. → "⚠️ Confirma?". **Aguarde.** Depois aplique e
   re-teste; reporte antes/depois.

## Regras e limites
- **NUNCA** documente/teste o contrato a partir dos internals — a fonte é o **`api/`**; consumidor casa com o
  **contrato**, nunca com `domain/`/`data/` do provider (regra de encapsulamento).
- **NUNCA** ponha **verbo no path** (`/getOrders`, `/createUser`) — recurso no **plural kebab-case**; o verbo
  é o método HTTP. Prefixo sempre **`/api/v1/`**; payload em **camelCase**.
- **NÃO** deixe spec e implementação divergirem — se o teste de contrato acusa, conserte o lado errado; spec
  desatualizada é bug.
- **NÃO** introduza **breaking change** em versão em uso — versione (`/api/v2/`) ou faça mudança aditiva/opcional.
- **NUNCA** rode teste ativo fora do **próprio app/alvo autorizado**.
- **NÃO** aplique correção sem o HITL do passo 7.
- **NÃO** saia do escopo: **segurança** (authz/IDOR/rate limit/CORS) é da `cyber-api`; a doc de entrega é da
  `code-entrega` (que aponta para cá). Aqui só se define e testa o **contrato**.

## Checklist "pronta"
- [ ] Spec OpenAPI por módulo, versionada em `api/`, descrevendo rotas/entrada/saída/erros?
- [ ] Prefixo `/api/v1/`, recursos plural kebab-case, **sem verbo no path**, payload camelCase?
- [ ] `validar_contrato.py` sem alertas (+ `spectral` se disponível)?
- [ ] Provider conforma à spec (respostas batem com schema/códigos)?
- [ ] Cada consumidor depende **só do contrato** (mock derivado do contrato, não da implementação)?
- [ ] Breaking change versionado (`/api/v2/`) e não quebra `/api/v1/` em uso?
- [ ] HITL apresentado; antes/depois reportado; teste ativo só no próprio app?

## Referências (Camada 3 — leia sob demanda)
- `references/openapi-basico.md` — estrutura OpenAPI mínima e nomenclatura alinhada ao padrão (com exemplo).
- `references/contract-testing.md` — matriz provider/consumer, ferramentas por stack e o que cada teste cobre.
- `scripts/validar_contrato.py` + `scripts/config.json` — lint determinístico das rotas do contrato (regras no config).
- `assets/openapi-templates/openapi.yaml` — spec mínima copiável, já no padrão `/api/v1/` + camelCase.
