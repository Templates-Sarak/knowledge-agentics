# Formato do Backlog + Detecção por Dimensão

Leia ao emitir o backlog ou quando precisar do critério detalhado de detecção de uma dimensão.

---

## Esquema JSON do backlog

```json
{
  "alvo": "./meu-repo",
  "geradoEm": "2026-06-03",
  "resumo": { "modulos": 2, "violacoes": 7, "porDimensao": { "hardcoded": 3, "limiares": 2, "acoplamento": 1, "api": 1 }, "modulosSemTestes": 1 },
  "itens": [
    {
      "id": "orders",
      "tipo": "modulo",
      "status": "pending",
      "risco": "baixo",
      "cobertura": "sem-testes",
      "arquivos": [
        {
          "caminho": "backend/orders/order_service.py",
          "violacoes": [
            { "linha": 12, "dimensao": "hardcoded", "severidade": "alta", "risco": "baixo",
              "descricao": "timeout 30 fixo no código", "regra": "zero hardcoded → config.json" },
            { "linha": 45, "dimensao": "limiares", "severidade": "media", "risco": "medio",
              "descricao": "função com 70 linhas", "regra": "função ≤ 40 linhas" }
          ]
        }
      ]
    }
  ]
}
```

Campos obrigatórios por violação: `linha`, `dimensao`, `severidade` (`alta|media|baixa`),
`risco` (`baixo|medio|alto`), `descricao`, `regra` (o trecho do padrão violado).

Campo obrigatório por item/módulo: **`cobertura`** (`sem-testes | parcial | ok`) — módulo sem testes
eleva o risco de qualquer refatoração e sinaliza à `code-adequacao` que precisará de caracterização.

**Ordenação dos `itens`**: por risco ascendente, depois severidade descendente — quick wins primeiro.

---

## Detecção por dimensão (critério = padrao-escrita)

| Dimensão | Como detectar | Severidade típica | Risco de corrigir |
|---|---|---|---|
| **hardcoded** | Literais numéricos/strings de config (timeouts, limites, URLs, paths) e **segredos** (chaves, tokens) embutidos no código | alta (segredo) / média | **baixo** |
| **limiares** | Função > 40 linhas; aninhamento > 3 níveis; > 4 parâmetros; `if` aninhado sem guard clause | média | médio |
| **srp** | Arquivo/função fazendo várias coisas; nomes com "And"/"E"; arquivo muito grande | média | médio |
| **acoplamento** | `import` de `domain/`/`data/` de outro módulo (deveria ser via `api/`) | alta | **alto** |
| **dados** | Tabela sem prefixo de módulo; `JOIN`/`SELECT` em tabela de outro módulo | alta | **alto** |
| **api** | Rota sem `/api/v1/`, com verbo no path, fora do plural kebab-case; payload/query fora de camelCase | média | médio |
| **cobertura** | Módulo/arquivo sem `tests/` cobrindo o comportamento (sinal por módulo, não por linha) | alta | **baixo** (criar teste não muda código) |
| **validacao** | Input externo usado sem validação na borda `api/`; SQL montado por concatenação de string | alta (SQL) | médio |
| **logging** | `print`/`console.log` no lugar de logger; `except`/`catch` vazio (exceção engolida); segredo logado | média | baixo |
| **tipagem** | Assinatura pública (`api/`/contrato) sem type hints / sem tipo de retorno | baixa | baixo |
| **doc-contrato** | `api/` do módulo sem documentação do que recebe/devolve | baixa | baixo |

**Regra de prioridade derivada:** segredos/hardcoded (baixo risco, alto valor) entram no topo do backlog;
desacoplamento estrutural e dados (alto risco) ficam por último, pois exigem testes de caracterização
robustos antes de mexer.

> Não classifique como violação o que o padrão **permite** (ex.: snake_case interno em Python,
> PascalCase em componentes) — só o que viola `padrao-escrita`.
