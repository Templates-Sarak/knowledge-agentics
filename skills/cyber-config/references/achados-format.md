# Formato dos Achados de Segurança (fila executável da adequação)

Leia ao **consolidar uma auditoria de segurança** (fan-out dos 7 domínios) ou ao consumir os achados na adequação.
Acompanha o `assets/relatorio_seguranca.md` (o relatório legível): aqui está o **`findings[]`** — a **fila máquina**
que `/cyber2-adequar` consome. `cyber-config` é o lar do formato por já ser dona do relatório consolidado cyber.

> Princípio: **segredo SEMPRE mascarado** — no JSON, no relatório, em qualquer log. O `location`/`description` nunca
> trazem a credencial por extenso.

---

## O átomo: `finding`

```jsonc
{
  "id": "sec-001",                 // estável: <dom>-<seq> (sec|dep|code|auth|api|cfg|data)
  "domain": "secrets",             // secrets|dependencies|code|auth|api|config|data
  "severity": "high",              // critical | high | medium | low  — PRIORIZA a adequação
  "location": "backend/orders/db.py:14",  // file:line OU URL (DAST) — sem segredo por extenso
  "description": "chave AKIA****XXXX hardcoded fora do .env",  // SEMPRE mascarado
  "fix": "mover para .env (var prefixada) + rotacionar a credencial exposta",
  "ownerSkill": "cyber-segredos",  // qual cyber-* adéqua — É O ROTEADOR (qual workflow de adequação)
  "status": "open"                 // open | resolved | accepted (pendência justificada)
}
```

Campos obrigatórios: `id`, `domain`, `severity`, `location`, `description` (mascarada), `fix`, `ownerSkill`, `status`.

---

## `severity` + `domain` são o roteador da adequação

Diferente do `code-` (que roteia por `risk` → modelo/modo/HITL), a adequação de segurança roteia por **dois eixos**,
e **toda adequação é HITL na thread principal** (sem agente autônomo — rotação/authz/patch são alto-risco):

| Eixo | Decide |
|---|---|
| **`severity`** | **ordem** da adequação: `critical` → `high` → `medium` → `low` (críticos/high primeiro) |
| **`ownerSkill`** | **qual workflow** de adequação aplicar (o passo de adequação da skill `cyber-<dominio>`) |

Mapa domínio → skill dona (quem adéqua):

| domain | ownerSkill | Nota de adequação |
|---|---|---|
| secrets | `cyber-segredos` | mover p/ `.env` + **rotacionar** (ação externa, sinalizar); commitado → `git-especialista-repositorio` |
| dependencies | `cyber-dependencias` | `audit fix`/update; major/`--force` com HITL; **build/testes** depois |
| code | `cyber-codigo` | patch seguro preservando comportamento |
| auth | `cyber-auth` | hash/JWT/cookies/brute-force |
| api | `cyber-api` | authz/IDOR/rate-limit/CORS/SSRF |
| config | `cyber-config` | headers/TLS/paths/debug |
| data | `cyber-dados` | PII/mascaramento/cifra/retenção (LGPD) |

---

## Consolidado vs por-domínio
- **Por domínio:** `.sarak/security/<domain>/findings.json` — o que cada `cyber-auditor` grava.
- **Consolidado:** `.sarak/security/findings-<date>.json` (fila única, ordenada por severidade) +
  `.sarak/security/report-<date>.md` (preenchendo `assets/relatorio_seguranca.md`). O relatório é **vivo**
  (status `open`→`resolved` e métricas "depois" na Fase 2); o git é o histórico.

---

## Compatibilidade de leitura
Relatórios já persistidos em `.sarak/security/` usam as chaves/valores antigos (português). **Quem lê aceita as duas
formas**; quem grava passa a gravar só a nova. Mapa antigo → novo:

| Antigo | Novo |
|---|---|
| `achados` (lista) / `achados.json` / `achados-<data>.json` | `findings` / `findings.json` / `findings-<date>.json` |
| `relatorio-<data>.md` | `report-<date>.md` |
| `dominio` | `domain` |
| `severidade` | `severity` |
| `local` | `location` |
| `descricao` | `description` |
| `correcao` | `fix` |
| `skillDona` | `ownerSkill` |
| `status`: `aberto` / `adequado` / `aceito` | `open` / `resolved` / `accepted` |
| `severity`: `critica` / `alta` / `media` / `baixa` | `critical` / `high` / `medium` / `low` |
| `domain`: `segredos` / `dependencias` / `codigo` / `dados` | `secrets` / `dependencies` / `code` / `data` |
| prefixo de `id`: `seg` / `cod` / `dad` | `sec` / `code` / `data` |
| pasta `<dominio>/` | `<domain>/` |
