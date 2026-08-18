# Templates de Preenchimento: meta-adequacao-modular

Blocos copiáveis. Placeholders em `<colchetes>`. O molde de plan em si é o padrão do fluxo SDD
(`specs/_estrutura_base/_templates/template-plan.md`) — não duplicado aqui; os blocos abaixo são o que esta
skill acrescenta a ele.

## 1. Nome do arquivo e frontmatter de uma plan de campanha

```
specs/plan/xx-<nn>-<descricao-kebab>.md
```

No frontmatter do `template-plan.md`, preencha `titulo` no infinitivo e `tags` incluindo `"adequacao-modular"`
para que a campanha seja filtrável no `00-indice.md` sem grep manual:

```yaml
tags: ["plan", "adequacao-modular"]
destino_sintese: "arquitetura/NN-<nome>.md"   # ou specs/NN · adr/NNN · 00-contexto.md · —
```

## 2. O template de renomeação de módulo — os sete itens, nenhum opcional

Toda plan que renomeia um módulo (`<antigo>` → `<id>`) resolve estes sete pontos, na ordem — item pulado
reaparece como erro de gate em outro lugar, e o rastro se perde:

```markdown
## Renomeação de módulo: <antigo> → <id>

1. **Pasta** — `modules/<antigo>/` → `modules/<id>/`. `<id>` casa `^[a-z][a-z0-9-]*$`.
2. **Contrato** — `contract/openapi.yaml:servers[0].url` = `/api/v1/<id>` (basePath do `module.json`).
3. **Package** — `@<escopo>/<antigo>` → `@<escopo>/<id>` (e `@<escopo>/<antigo>-<camada>` se houver
   package de camada). Atualize **todo** import dele, em todos os módulos que o consomem.
4. **Web** — `webPath: "/<antigo>"` → `webPath: "/<id>"` (ou `null`); entrada de `navigation` acompanha.
5. **Permissões** — `<antigo>:<verbo>` → `<id>:<verbo>`, em `module.json:permissions` e em todo
   `requirePermission("<antigo>:...")` do código.
6. **Chaves de ambiente** — `<ANTIGO>_*` → `<ID>_*` (kebab→SCREAMING_SNAKE), no `.env`, no
   `.env.example` e em `module.json:requiredEnv`. **Decisão de HITL**: migrar todas as chaves agora, ou
   declarar exceção temporária? Este item não tem meio-termo — `env-modulo` é estrito.
7. **Prefixo de tabela** — `data.prefix` = `<id>` em snake_case + `_`. **Migração com dado real: rotear para
   `db-migrations`** (expand-contract, backup, HITL) — nunca SQL de renomeação improvisado aqui.
   **Decisão de HITL, oferecida primeiro**: declarar exceção permanente em `conformidade.json` com
   `regra: "tabela-prefixo"` e um ADR justificando, **ou** renomear as tabelas de fato.
```

## 3. Exceção nominal em `config/conformidade.json`

```jsonc
{
  "excecoes": [
    {
      "modulo": "<id-ou-(root)>",
      "regra": "<id-da-regra-do-catalogo>",
      "motivo": "<frase objetiva — o que falta e por que ainda não foi feito>",
      "decisao": "ADR-<NNN>"
    }
  ],
  "excecoesCve": []
}
```

`decisao` **tem** de apontar um `## ADR-<NNN>` que existe de verdade em `specs/adr/*.md` — escreva o ADR
antes de declarar a exceção. Achado de escopo `root` (fiação, manifesto de projeto) usa o literal
`"modulo": "(root)"`.

## 4. `.prettierignore` / exclusão de lint na área legada

```
# área legada, fora do escopo desta campanha — ver specs/adr/ADR-<NNN>
# encolhe conforme cada módulo migra e entra no escopo do template
<caminho-da-area-legada>/**
```

Registre a mesma lista (por extenso, não só o padrão glob) no relatório da Fase A — é a "segunda métrica"
da campanha, ao lado do número de exceções em `conformidade.json`.

## 5. HITL — o plano completo (fim da Fase A)

```markdown
## Plano de adequação modular — <nome do sistema>

**Fase/caminho detectados:** Fase A · caminho (<i|ii>) — <justificativa em uma linha>

**Módulos e nomes decididos:**

| Pasta atual | `id` decidido | Prefixo de tabela | Chaves de env | Ordem (nn) |
|---|---|---|---|---|
| <pasta> | <id> | renomear/exceção (ADR-<NNN>) | renomear/exceção | <nn> |

**Fronteira da área legada (fora de lint/tipos):** <lista de caminhos>

**Plans a escrever:** <lista de `xx-nn-descricao`>

⚠️ Aprova este plano de adequação completo?
```

## 6. Relatório da Fase B — critério mecânico + veredito

```markdown
## Veredito da Fase B — <nome do sistema>

| Verificação | Resultado |
|---|---|
| `validate.mjs --todos` | <0 erros / N erros> |
| `verify` / `verificar.py` | <exit 0 / falhou em ...> |
| Exceções em `conformidade.json` | <N previstas / N encontradas — divergência: ...> |
| Caminhos ignorados (lint/prettier) | <== declarado / divergência: ...> |
| `validate.mjs --extracao <modulo>` por módulo tocado | <0 erros / lista> |
| `specs/plan/` sem `xx-*` pendente | <sim / pendentes: ...> |

**Julgamento humano — as specs continuam verdadeiras em relação ao código?** <sim/não + evidência>

**Veredito final:** <aprovado / reprovado, com o motivo>
```
