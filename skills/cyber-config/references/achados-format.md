# Formato dos Achados de Segurança (fila executável da adequação)

Leia ao **consolidar uma auditoria de segurança** (fan-out dos 7 domínios) ou ao consumir os achados na adequação.
Acompanha o `assets/relatorio_seguranca.md` (o relatório legível): aqui está o **`achados[]`** — a **fila máquina**
que `/cyber2-adequar` consome. `cyber-config` é o lar do formato por já ser dona do relatório consolidado cyber.

> Princípio: **segredo SEMPRE mascarado** — no JSON, no relatório, em qualquer log. O `local`/`descricao` nunca
> trazem a credencial por extenso.

---

## O átomo: `achado`

```jsonc
{
  "id": "seg-001",                 // estável: <dom>-<seq> (seg|dep|cod|auth|api|cfg|dad)
  "dominio": "segredos",           // segredos|dependencias|codigo|auth|api|config|dados
  "severidade": "alta",            // critica | alta | media | baixa  — PRIORIZA a adequação
  "local": "backend/orders/db.py:14",  // arquivo:linha OU URL (DAST) — sem segredo por extenso
  "descricao": "chave AKIA****XXXX hardcoded fora do .env",  // SEMPRE mascarado
  "correcao": "mover para .env (var prefixada) + rotacionar a credencial exposta",
  "skillDona": "cyber-segredos",   // qual cyber-* adéqua — É O ROTEADOR (qual workflow de adequação)
  "status": "aberto"               // aberto | adequado | aceito (pendência justificada)
}
```

Campos obrigatórios: `id`, `dominio`, `severidade`, `local`, `descricao` (mascarada), `correcao`, `skillDona`, `status`.

---

## `severidade` + `dominio` são o roteador da adequação

Diferente do `code-` (que roteia por `risco` → modelo/modo/HITL), a adequação de segurança roteia por **dois eixos**,
e **toda adequação é HITL na thread principal** (sem agente autônomo — rotação/authz/patch são alto-risco):

| Eixo | Decide |
|---|---|
| **`severidade`** | **ordem** da adequação: `critica` → `alta` → `media` → `baixa` (críticos/high primeiro) |
| **`skillDona`** | **qual workflow** de adequação aplicar (o passo de adequação da skill `cyber-<dominio>`) |

Mapa domínio → skill dona (quem adéqua):

| domínio | skillDona | Nota de adequação |
|---|---|---|
| segredos | `cyber-segredos` | mover p/ `.env` + **rotacionar** (ação externa, sinalizar); commitado → `git-especialista-repositorio` |
| dependencias | `cyber-dependencias` | `audit fix`/update; major/`--force` com HITL; **build/testes** depois |
| codigo | `cyber-codigo` | patch seguro preservando comportamento |
| auth | `cyber-auth` | hash/JWT/cookies/brute-force |
| api | `cyber-api` | authz/IDOR/rate-limit/CORS/SSRF |
| config | `cyber-config` | headers/TLS/paths/debug |
| dados | `cyber-dados` | PII/mascaramento/cifra/retenção (LGPD) |

---

## Consolidado vs por-domínio
- **Por domínio:** `.sarak/security/<dominio>/achados.json` — o que cada `cyber-auditor` grava.
- **Consolidado:** `.sarak/security/achados-<data>.json` (fila única, ordenada por severidade) +
  `.sarak/security/relatorio-<data>.md` (preenchendo `assets/relatorio_seguranca.md`). O relatório é **vivo**
  (status `aberto`→`adequado` e métricas "depois" na Fase 2); o git é o histórico.
