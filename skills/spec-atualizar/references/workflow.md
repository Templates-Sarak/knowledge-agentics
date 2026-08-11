# Workflow Detalhado: spec-atualizar

Expande o passo-a-passo da skill com exemplos de roteamento, particionamento em blocos, condução do HITL e
fechamento das plans.

---

## Passo 1–2: Levantamento e roteamento (exemplo)

Suponha `specs/plan/executadas/` com 5 plans:

| Plan | Status | `destino_sintese` |
|---|---|---|
| `plan-04-endpoint-sessao.md` | 🟢 Aprovada | `arquitetura/03-api.md` |
| `plan-05-tabela-sessions.md` | 🟢 Aprovada | `arquitetura/04-dados.md` + `adr/003-jwt-vs-sessao.md` |
| `plan-06-tela-login.md` | 🟢 Aprovada | `specs/02-auth.md` |
| `plan-07-corrigir-lcp-home.md` | 🟢 Aprovada | `—` |

Entram no lote: **04, 05, 06, 07**. Não há `plan-03` nesta pasta — foi sintetizada numa rodada anterior e,
como toda plan sintetizada, já foi removida (§6.3); se for preciso consultá-la, é `git log`, não este
diretório. Nada da raiz de `plan/` é tocado — aquelas ainda estão em execução.

## Passo 3: Particionamento em blocos

Um bloco por spec fixa de destino:

- **Bloco 1 — `arquitetura/03-api.md`** (atualiza): `plan-04`
- **Bloco 2 — `arquitetura/04-dados.md`** (atualiza): `plan-05`
- **Bloco 3 — `adr/003-jwt-vs-sessao.md`** (**cria**): `plan-05`
- **Bloco 4 — `specs/02-auth.md`** (atualiza): `plan-06`
- **Bloco 5 — sem destino**: `plan-07` — só status e índice, sem HITL de escrita

Note que a `plan-05` aparece em dois blocos: a parte estrutural em `arquitetura/`, a decisão em `adr/`.

---

## Passo 4: HITL na prática

Uma confirmação por bloco. Seja preciso sobre o que entra e o que sai.

### Bloco que ATUALIZA uma spec existente

```markdown
### 📦 Bloco 1 de 5 — `arquitetura/03-api.md` (atualizar)

**Origem:** `plan-04-endpoint-sessao.md`

**O que será transportado:**
- Novo recurso `POST /api/v1/sessions` e `DELETE /api/v1/sessions/{id}` na tabela de endpoints.
- Contrato de resposta em camelCase, com `expiresAt` em ISO-8601.

**O que muda no arquivo:**
- Seção "2. Endpoints": +2 linhas na tabela.
- Seção "3. Contratos": novo bloco `Session`.
- Nada é removido.

> ⚠️ Confirma a atualização deste bloco?
```

### Bloco que CRIA um ADR

```markdown
### 📦 Bloco 3 de 5 — `adr/003-jwt-vs-sessao.md` (criar)

**Origem:** `plan-05-tabela-sessions.md` (seção Destino da síntese)

**Decisão a registrar:** sessão server-side em tabela, em vez de JWT stateless.
**Contexto:** necessidade de revogação imediata.
**Consequências:** +1 consulta por request; revogação em O(1); acoplamento ao banco.

ADR é imutável — este arquivo nasce como `🟢 Aceito` e não será editado depois.

> ⚠️ Confirma a criação deste ADR?
```

### Bloco sem destino (`—`)

Não pede confirmação de escrita — não há spec a alterar. Informe e siga:

```markdown
### 📦 Bloco 5 de 5 — `plan-07-corrigir-lcp-home.md` — sem destino de síntese

Otimização de LCP sem mudança de regra documentada. Nada a transportar.
Marco a plan como ⚪ Sintetizada, removo o arquivo (`git rm`) e apago a linha no `00-indice`.
```

---

## Passo 5: transporte — narrativa vs. verdade

O erro mais comum é copiar o resumo do executor para dentro da spec fixa. A spec fixa descreve o sistema **no
presente**, não a obra:

| ❌ Narrativa de execução (não vai para a spec) | ✅ Verdade consolidada (vai) |
|---|---|
| "Adicionamos o campo `expiresAt` na resposta" | "A resposta inclui `expiresAt` (ISO-8601, UTC)" |
| "Corrigimos o bug que aceitava e-mail sem `@`" | "O e-mail é validado antes da persistência" |
| "Refatoramos `auth.ts` em três módulos" | (nada — refactor sem mudança de regra tem destino `—`) |
| "O cliente pediu para trocar o roxo pelo teal" | "Cor primária: teal 500 (`#14B8A6`)" |

---

## Passo 6: fechamento de cada plan

Primeiro, bloco acrescentado ao **final** da plan (append-only, nada do que já existia é removido):

```markdown
## Síntese — 2026-08-01

Sintetizada em: `arquitetura/04-dados.md` e `adr/003-jwt-vs-sessao.md`
Observações: a tabela `sessions` e seus índices foram para a spec de dados; a justificativa da escolha
virou ADR. O script de migration em si não foi transportado (é código, vive no repositório).
```

Frontmatter: `status: "⚪ Sintetizada"`.

Em seguida, na **mesma passada**, o arquivo é removido:

```bash
git rm specs/plan/executadas/plan-05-tabela-sessions.md
```

Esse bloco `## Síntese` nunca é lido como arquivo do repositório — sua única sobrevida é como conteúdo do
diff no commit que remove o arquivo (`git show <commit> -- specs/plan/executadas/plan-05-tabela-sessions.md`
mostra o texto completo como linhas removidas). É por isso que ele continua sendo escrito mesmo sabendo que o
arquivo será apagado a seguir: é o que garante que a "justificativa da síntese" fique legível para quem um dia
precisar investigar via `git log`.

E a linha correspondente no `specs/00-indice.md` §4 (Aguardando síntese) é **removida**, não completada:

```diff
- | [plan-05-tabela-sessions](plan/executadas/plan-05-tabela-sessions.md) | 🟢 | 2026-07-28 | `arquitetura/04-dados.md` · `adr/003-jwt-vs-sessao.md` |
```

Nada substitui essa linha. A spec fixa de destino (`arquitetura/04-dados.md`, `adr/003-jwt-vs-sessao.md`) é
agora a única fonte viva dessa verdade.

---

## Passo 7: entrega

```markdown
✅ Síntese concluída.

**Plans sintetizadas e removidas (4):** plan-04, plan-05, plan-06, plan-07
**Specs atualizadas (3):** `arquitetura/03-api.md`, `arquitetura/04-dados.md`, `specs/02-auth.md`
**Specs criadas (1):** `adr/003-jwt-vs-sessao.md`
**Índice:** 4 linhas removidas da §4 (Aguardando síntese).

As alterações — incluindo os `git rm` das plans — estão no worktree, sem commit.
```

Se alguma plan `🟢` ficou de fora, diga qual e o que falta decidir. Silêncio sobre plan pulada é falha —
ela ficaria pendente para sempre sem ninguém saber, e continuaria ocupando `plan/executadas/` até a próxima
rodada.

---

## Sobre "limpar" a pasta plan

A pasta é esvaziada em duas camadas, cada uma com seu próprio dono:

- `specs/plan/` → fila **ativa** (🔴 🟡 🟠 🔵 ⛔). É o que está em jogo agora. Não é tocada por esta skill.
- `specs/plan/executadas/` → só `🟢` aguardando síntese. Ao sintetizar, esta skill **remove** o arquivo — não
  existe estado `⚪` residente no disco; ele existe só entre os passos 6.1–6.2, dentro da mesma passada.

Plan removida **depois de sintetizada** não é decisão perdida: o veredito, o escopo negociado e as suposições
do executor já cumpriram seu papel (formar a spec fixa) e continuam recuperáveis via `git log
--diff-filter=D -- specs/plan/executadas/plan-NN-*.md`. O que se perde é a **conveniência** de encontrá-los
com um `ls` — não o conteúdo, que o Git preserva.

Isto só vale **depois** da síntese aplicada. Uma plan `🟢` ainda não processada, ou qualquer plan na fila
ativa, segue com a mesma proteção de sempre: nunca apagada, nunca renomeada, fora desta rotina.
