# Formato do Backlog + Detecção por Dimensão

Leia ao emitir o backlog ou quando precisar do critério detalhado de detecção de uma dimensão.

---

## Esquema JSON do backlog

As chaves e os valores são em inglês (ADR-023) e seguem os nomes que o `validate.py`/`validate.mjs` e o gate
já emitem (`target`, `findings`, `path`, `line`, `dimension`, `severity`, `risk`, `message`, `rule`).

```json
{
  "target": "./meu-repo",
  "generatedAt": "2026-06-03",
  "topology": "legacy-modular",
  "summary": { "modules": 2, "findings": 7, "byDimension": { "hardcoded": 3, "thresholds": 2, "coupling": 1, "api": 1 }, "modulesWithoutTests": 1 },
  "items": [
    {
      "id": "orders",
      "kind": "module",
      "status": "pending",
      "risk": "low",
      "coverage": "untested",
      "files": [
        {
          "path": "backend/orders/order_service.py",
          "findings": [
            { "line": 12, "dimension": "hardcoded", "severity": "high", "risk": "low",
              "message": "timeout 30 fixo no código", "rule": "zero hardcoded → config.json" },
            { "line": 45, "dimension": "thresholds", "severity": "medium", "risk": "medium",
              "message": "função com 70 linhas", "rule": "função ≤ 40 linhas" }
          ]
        }
      ]
    }
  ]
}
```

Campos obrigatórios por achado (`findings[]`): `line`, `dimension`, `severity` (`high|medium|low`),
`risk` (`low|medium|high`), `message`, `rule` (o trecho do padrão violado). `confidence` (`high|low`) é
opcional e vem do validador quando ele a emite.

`topology` guarda a topologia detectada: `template | legacy-modular | layered | simple-monolith`.

### Entrada do gate de módulos

O gate fornece `{ "findings": [...], "errorCount": N }`. Cada finding contém `module`, `rule`,
`severity` (`error|warning`) e `message`. Ao compor o backlog, use `rule` como o valor de `rule` do achado
e traduza `severity` do gate para o vocabulário do backlog (`error` → `high`, `warning` → `medium`).

Campo obrigatório por item/módulo: **`coverage`** (`untested | partial | ok`) — módulo sem testes
eleva o risco de qualquer refatoração e sinaliza à `code-adequacao` que precisará de caracterização.

**Ordenação dos `items`**: por risco ascendente, depois severidade descendente — quick wins primeiro.

---

## Compatibilidade de leitura

Backlogs gravados antes da ADR-023 usam as chaves em português. **Quem lê um backlog aceita as duas formas**
(a nova vence se ambas existirem) e **quem escreve grava só a nova**. Snapshots datados antigos
(`backlog-<data>.json`, `auditoria-<data>.md`) **não são reescritos**.

| Chave/valor antigo | Novo |
|---|---|
| `alvo` | `target` |
| `geradoEm` | `generatedAt` |
| `topologia` | `topology` (`modular-legado` → `legacy-modular`, `por-camadas` → `layered`, `monólito simples` → `simple-monolith`; `template` fica) |
| `resumo` | `summary` |
| `modulos` / `violacoes` / `porDimensao` / `modulosSemTestes` (em `resumo`) | `modules` / `findings` / `byDimension` / `modulesWithoutTests` |
| `itens` | `items` |
| `tipo` (`modulo`) | `kind` (`module`) |
| `risco` (`baixo\|medio\|alto`) | `risk` (`low\|medium\|high`) |
| `cobertura` (`sem-testes\|parcial\|ok`) | `coverage` (`untested\|partial\|ok`) |
| `arquivos` / `caminho` | `files` / `path` |
| `violacoes` (por arquivo) | `findings` |
| `linha` | `line` |
| `dimensao` | `dimension` (valores: `limiares` → `thresholds`, `acoplamento` → `coupling`, `infra-acoplada` → `infra-coupling`, `dados` → `data`, `cobertura` → `coverage`, `validacao` → `validation`, `tipagem` → `typing`, `segredos` → `secrets`, `doc-contrato` → `contract-doc`; `hardcoded`, `srp`, `api`, `logging` ficam) |
| `severidade` (`alta\|media\|baixa`) | `severity` (`high\|medium\|low`) |
| `descricao` | `message` |
| `regra` | `rule` |
| `confianca` (`alta\|baixa`) | `confidence` (`high\|low`) |
| `tarefas` | `tasks` |
| `modulo` / `arquivo` / `linhas` | `module` / `file` / `lines` |
| `estadoAtual` / `estadoAlvo` | `currentState` / `targetState` |
| `precisaCaracterizacao` | `needsCharacterization` |
| `dependeDe` | `dependsOn` |
| `verificacao` | `verification` |
| `onda` | `wave` |
| `status` (`pulada`, `invalidada`, `nova`) | `status` (`skipped`, `invalidated`, `new`; `pending` e `done` ficam) |
| `violacoesPorDimensao` / `tarefasPorOnda` / `topRiscos` / `artefatos` (resumo do `code-auditor`) | `findingsByDimension` / `tasksByWave` / `topRisks` / `artifacts` |
| arquivo `auditoria.md` / `auditoria-<data>.md` | `audit.md` / `audit-<date>.md` |

---

## Detecção por dimensão (critério = padrao-escrita)

| Dimensão | Como detectar | Severidade típica | Risco de corrigir |
|---|---|---|---|
| **hardcoded** | Literais numéricos/strings de config (timeouts, limites, URLs, paths) e **segredos** (chaves, tokens) embutidos no código | alta (segredo) / média | **baixo** |
| **thresholds** | Função > 40 linhas; aninhamento > 3 níveis; > 4 parâmetros; `if` aninhado sem guard clause | média | médio |
| **srp** | Arquivo/função fazendo várias coisas; nomes com "And"/"E"; arquivo muito grande | média | médio |
| **coupling** | Um domínio alcança o **interno** de outro em vez do contrato: `import` de qualquer caminho interno da fatia alheia, ou caminho relativo saindo da própria. No template, o consumo legítimo é HTTP por `core/gateways/` declarado em `consumes` — regras `lateral-import`, `gateway-http`, `gateway-declared` | alta | **alto** |
| **infra-coupling** | SDK de fornecedor (`pg`, `mysql*`, `@supabase/*`, `aws-sdk`, `firebase*`, `mongodb`, `redis`, `openai`) importado dentro da regra de negócio, sem porta. É o que faz "trocar de fornecedor" virar projeto | alta | **alto** |
| **data** | Tabela sem prefixo de módulo; `JOIN`/`SELECT`/FK em tabela de outro módulo; schema `public` | alta | **alto** |
| **api** | Rota sem `/api/v1/`, com verbo no path, fora do plural kebab-case; payload/query fora de camelCase | média | médio |
| **coverage** | Módulo/arquivo sem `tests/` cobrindo o comportamento (sinal por módulo, não por linha) | alta | **baixo** (criar teste não muda código) |
| **validation** | Input externo usado sem validação na borda `api/`; SQL montado por concatenação de string | alta (SQL) | médio |
| **logging** | `print`/`console.log` no lugar de logger; `except`/`catch` vazio (exceção engolida); segredo logado | média | baixo |
| **typing** | Assinatura pública (`api/`/contrato) sem type hints / sem tipo de retorno | baixa | baixo |
| **contract-doc** | `api/` do módulo sem documentação do que recebe/devolve | baixa | baixo |

> O validador de linguagem emite `secrets` para segredo embutido; no backlog ele entra na dimensão
> `hardcoded` (mesmo critério, mesmo risco) ou pode manter `secrets` — ambos são valores válidos de `dimension`.

**Regra de prioridade derivada:** segredos/hardcoded (baixo risco, alto valor) entram no topo do backlog;
desacoplamento estrutural e dados (alto risco) ficam por último, pois exigem testes de caracterização
robustos antes de mexer.

> Não classifique como violação o que o padrão **permite** (ex.: snake_case interno em Python,
> PascalCase em componentes) — só o que viola `padrao-escrita`.
