# Exemplos: meta-adequacao-modular

## 1. Caminho (i) — sem specs SDD, ponta a ponta

**Cenário.** Um ERP com `package.json` na raiz (`workspaces: ["Modulos/*"]`, `husky` + `lint-staged`
instalados) e módulos em `Modulos/Propostas/`, `Modulos/Contratos/` — nenhum `specs/`.

**Diagnóstico mecânico** (`diagnosticar_terreno.py --raiz <alvo> --modulos Propostas Contratos --json`,
rodado sobre um legado sintético construído só para validar esta skill — nenhum sistema real foi tocado):

```json
{
  "fase": "A",
  "caminho": "sem-specs",
  "colisao_raiz": ["package.json"],
  "geracao_antiga": [],
  "workspaces_legado": ["Modulos/*"],
  "hooks_legado": true,
  "modulos_candidatos": [
    {"pasta": "Propostas", "id_atual": "Propostas", "conforme": false, "id_sugerido": "propostas"},
    {"pasta": "Contratos", "id_atual": "Contratos", "conforme": false, "id_sugerido": "contratos"}
  ]
}
```

**O que a skill faz com isto:**
- `fase: "A"` + `caminho: "sem-specs"` → confirma em uma linha e segue para o Passo 1 como **no-op
  declarado** (não havia `plan/`/`specs/` para sintetizar) e o Passo 2 como **instalação** de
  `specs/` (só `00-contexto.md`/`00-indice.md` recebem conteúdo real; os três universais são copiados).
- `colisao_raiz: ["package.json"]` → HITL: mesclar `scripts`/`workspaces` na mão, nunca `--forcar`.
- `hooks_legado: true` → armadilha #3 (§4 do `workflow.md`): decidir com o usuário como o `husky`/
  `lint-staged` existentes convivem com o `pre-commit` do template.
- `modulos_candidatos` → o portão central de HITL: `Propostas`→`propostas`, `Contratos`→`contratos` —
  exatamente o caso medido em `CLAUDE.md` (`Earendel/ERP/Modulos/Propostas`, `Contratos`, `Projetos`),
  nenhum batendo `^[a-z][a-z0-9-]*$` de saída.
- Cada módulo aprovado no HITL recebe uma plan `xx-nn-modulo-<id>` com o template de renomeação de sete
  itens (`templates.md` §2) — prefixo de tabela e chaves de ambiente entram como decisão explícita
  (renomear × exceção), nunca herdados em silêncio.

## 2. Caminho (ii) — com specs SDD divergentes, ponta a ponta

**Cenário.** Um sistema já iniciado com `meta-iniciar-repositorio` há um ano, com `specs/00-indice.md` e
`specs/plan/` populados, mas duas specs em `arquitetura/` descrevem uma rota que o código não tem mais (foi
removida numa correção de bug sem plan de atualização de spec).

**O que muda em relação ao caminho (i):**
- Passo 1 **não** é no-op: se houver alguma `🟢 Aprovada` pendente de síntese, ela é sintetizada primeiro
  (nesta mesma conversa), e depois `spec-atualizar` expurga as `⚪` — `plan/` fica só com o que está ativo.
- Passo 2 é o trabalho de maior valor: cada spec de `arquitetura/` é conferida contra o código real. A rota
  removida gera uma plan `xx-nn-specs-arquitetura-api` (não uma edição direta) que **atualiza** a spec para
  refletir o sistema como ele é hoje.
- O restante do fluxo (Passo 3 em diante) é idêntico ao caminho (i) — a régua entra antes da execução do
  mesmo jeito, e a Fase B usa o mesmo critério mecânico.

## 3. As três fases do diagnóstico mecânico, no mesmo legado sintético

Prova de que `fase` reage ao estado real de `specs/plan/`, e não a uma leitura estática — rodada três vezes
sobre o mesmo legado sintético do exemplo 1, sem tocar em nenhum sistema real:

| Estado de `specs/plan/` | `fase` retornada |
|---|---|
| nenhuma plan `xx-*` | `"A"` |
| `xx-01-modulo-propostas.md` presente, `status: "🔴 A executar"` | `"EM_ANDAMENTO"` |
| a mesma plan, `status: "⚪ Sintetizada"` | `"B"` |

Isto é o que impede a skill de reabrir o planejamento em cima de uma campanha ainda ativa, e de tentar
conferir (Fase B) uma campanha que nunca chegou a rodar.

## 4. O que "pronto" parece na Fase B

Depois da execução (fora desta skill), uma segunda conversa — revisor diferente — roda o critério do §7 do
`SKILL.md` e produz o relatório de `templates.md` §6. Um veredito **reprovado** típico: `validate.mjs
--todos` verde, mas `specs/plan/` ainda tem uma `xx-04-modulo-contratos` em `🟡 Em execução` — a Fase B para
aqui e devolve para `/code3-adequar` terminar, sem fingir que a campanha encerrou.
