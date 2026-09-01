# Templates — generalização de módulo

Camada 3 da skill `code-generalizacao-modulo`. Blocos copiáveis, na ordem em que o fluxo os usa.

---

## §1 — Mapa de capacidade (portão de HITL central)

> **Mapa de capacidade — `<capacidade>`**
> Cada item do inventário cai em **uma** coluna. Nada de código antes da sua aprovação.
>
> **NÚCLEO — fica, reimplantado do zero**
> | Item (do inventário) | Por que é genérico |
> |---|---|
> | `<entidade/rota/tabela>` | existiria em qualquer sistema que precise desta capacidade |
>
> **ESPECIALIZAÇÃO — sai, ou vira ponto de extensão**
> | Item | Destino | Por quê |
> |---|---|---|
> | `<campo/regra/termo>` | **sai** | é do ramo de origem e nenhum outro projeto quer |
> | `<campo/regra/termo>` | **ponto de extensão** (`<porta ou config>`) | todo projeto quer, cada um do seu jeito |
>
> **INFRAESTRUTURA — vira porta**
> | Item | Porta | Adapter de referência |
> |---|---|---|
> | `<fornecedor concreto>` | `core/ports/<nome>` | `adapters/memory` (obrigatório) + `<tec>` |
>
> **Cortes declarados:** `<consumes da origem que somem, e por quê>`
>
> ⚠️ **Aprova este mapa?** (dele saem a identidade, o contrato e a denylist)

---

## §2 — Identidade nova (portão de HITL)

> **Identidade — derivada da capacidade, não traduzida da origem**
>
> | Item | Valor | Teste semântico |
> |---|---|---|
> | `id` | `<kebab-case>` | faz sentido num sistema de qualquer ramo? |
> | nome | `<Capacidade>` | — |
> | binding | `typescript` \| `javascript` \| `python` | — |
> | escopo dos packages | `@<escopo>` | — |
> | `role` | `domain` \| `gateway` (nunca `connector`) | — |
> | prefixo de tabela | `<id>_` | — |
> | prefixo de env | `<ID>_` | — |
> | permissões | `<id>:ler`, `<id>:escrever` | — |
> | `basePath` | `/api/v1/<id>` | — |
>
> **Repositório-alvo:** `<caminho absoluto>` — será criado por `meta-iniciar-repositorio`.
>
> ⚠️ **Aprova a identidade e a criação do repositório?**

---

## §3 — Denylist da origem (arquivo, FORA do repositório verificado)

```
# denylist-origem.txt — termos que NÃO podem aparecer no entregável.
# Mora fora do repo verificado: um arquivo com os termos da origem, versionado dentro do
# entregável, É o vazamento que o degrau 6 procura.
# Uma linha por termo. O script casa todas as variantes de escrita (camelCase, snake_case,
# kebab-case, colado) — escreva o termo em linguagem natural.

# 1. Identidade do sistema de origem
<Nome do Sistema>
<nome-do-repositorio>
<marca/produto>
<dominio.com.br>

# 2. Vocabulário de negócio (vem do léxico do inventário, coluna "especialização")
<termo de negócio 1>
<termo de negócio 2>

# 3. Prefixos e chaves antigas
<prefixo_antigo>
<PREFIXO_ANTIGO>

# 4. Pessoas e clientes citados em comentário, fixture ou seed
<nome de cliente>
```

Rode antes da entrega e **releia os achados um a um**: falso positivo existe (um termo de negócio que
também é palavra comum), e a resposta certa é ajustar o termo na denylist, nunca ignorar o achado.

---

## §4 — ADR de pontos de extensão (no repo novo, sem procedência)

```markdown
# ADR-00X — Pontos de extensão e portas de <capacidade>

## Status
🟢 Aceito

## Contexto
O módulo entrega <capacidade> para consumidores de ramos diferentes. Cada consumidor tem
política, campos e provedor próprios; embutir qualquer um deles tornaria o módulo específico.

## Decisão
1. `<assunto>` é uma **porta** (`core/ports/<nome>`) — o provedor é escolhido em
   `config/ports.json` e o módulo nunca conhece o fornecedor.
2. `<assunto>` é **configurável** por `config/<arquivo>.json`, com o valor padrão `<x>`.
3. `<assunto>` fica **fora do escopo** — é responsabilidade de quem consome o módulo.

## Consequências
- O consumidor precisa escolher adapter para cada porta antes de subir (falta de config derruba o boot).
- Regra de negócio específica não entra aqui: entra no módulo do consumidor, que chama este por HTTP.
```

> Escreva **decisão**, nunca história. "Virou porta porque na origem estava acoplado ao provedor X" é
> procedência — viaja na cópia e vaza a origem.

---

## §5 — `config/verificacao.json` (no repo novo — degraus 4 e 5)

```json
{
  "compose": "docker-compose.verificacao.yml",
  "schema": ["npm", "run", "verificar:schema"],
  "contrato": ["npm", "run", "verificar:contrato"]
}
```

No binding Python:

```json
{
  "compose": "docker-compose.verificacao.yml",
  "schema": ["python", "verificar_schema.py"],
  "contrato": ["python", "verificar_contrato.py"]
}
```

Os comandos são **declarados**, não adivinhados: o script não inventa nome de compose nem de script.
Ausente ou incompleto → degraus 4 e 5 voltam `NAO EXECUTADO`, e isso **reprova**.

---

## §6 — `docker-compose.verificacao.yml` (ambiente efêmero)

```yaml
# Ambiente EFÊMERO de verificação — não é empacotamento de produção (isso é deploy-docker).
# Sobe banco + a API do módulo, é usado pelos degraus 4 e 5, e cai com `down -v` ao fim.
services:
  banco:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: verificacao
      POSTGRES_DB: verificacao
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      retries: 30

  api:
    build: .
    depends_on:
      banco:
        condition: service_healthy
    environment:
      <ID>_DB_URL: postgres://postgres:verificacao@banco:5432/verificacao
      <ID>_API_PORT: 3000
    ports: ["3000:3000"]
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/v1/<id>/health || exit 1"]
      interval: 2s
      retries: 30
```

Senha de ambiente efêmero não é segredo (o ambiente nasce e morre no comando), mas **nada aqui vai
para produção** — empacotar é `deploy-docker`.

---

## §7 — Relatório final (portão de HITL de entrega)

> **Módulo genérico `<id>` — pronto para a prateleira**
>
> **Repositório:** `<caminho>` · **binding:** `<b>` · **role:** `<domain|gateway>`
>
> **Capacidade:** `<uma linha>`
> **Superfície:** `<n>` endpoints — `<lista>`
> **Dados:** schema `<schema>`, tabelas `<lista>`
> **Portas:** `<lista>` · **`consumes`:** vazio
>
> **Pontos de extensão** (o que o consumidor decide):
> | Ponto | Como se estende |
> |---|---|
> | `<assunto>` | porta `<nome>` / config `<arquivo>` |
>
> **Verificação:**
> | # | Degrau | Estado |
> |---|---|---|
> | 1 | conforme | verde |
> | 2 | extraível | verde |
> | 3 | funciona sem infra | verde |
> | 4 | o schema funciona | verde |
> | 5 | cumpre o contrato | verde |
> | 6 | é genérico | verde (`<n>` termos na denylist) |
>
> **Pendências:** `.env` da raiz, primeiro commit e remoto (`git-commit-inicial`), `<outras>`
>
> ⚠️ **Aceita a entrega?**
