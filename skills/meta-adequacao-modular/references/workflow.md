# Workflow Detalhado: meta-adequacao-modular

Versão expandida do `SKILL.md`. Leia quando precisar do detalhe de um passo — o corpo da skill resolve o
caminho comum sozinho.

## § 0 — o relatório de `diagnosticar_terreno.py`

```json
{
  "fase": "A" | "B" | "EM_ANDAMENTO",
  "caminho": "sem-specs" | "com-specs",
  "colisao_raiz": ["package.json", "..."],
  "geracao_antiga": [{"encontrado": "ferramentas", "atual": "tools"}, "..."],
  "workspaces_legado": ["modules/*", "..."],
  "hooks_legado": true | false,
  "modulos_candidatos": [
    {"pasta": "Propostas", "id_atual": "Propostas", "conforme": false, "id_sugerido": "propostas"}
  ]
}
```

| Campo | O que significa | O que fazer com ele |
|---|---|---|
| `fase` | ver `SKILL.md` — mecânico, a partir de `specs/plan/*xx-*.md` e seus `status` | `EM_ANDAMENTO` → pare, aponte `/code3-adequar`/a plan pendente, não continue |
| `caminho` | `com-specs` exige **os dois**: `specs/00-indice.md` e a pasta `specs/plan/` | decide se os passos 1–2 são no-op ou trabalho real |
| `colisao_raiz` | `package.json`/`pyproject.toml`/`.gitignore` já existem na raiz | HITL — nunca `--forcar` sem autorização; mesclar `scripts`/`workspaces` na mão |
| `geracao_antiga` | achou `ferramentas/`/`modulos/`/`projeto.json` — nomes de **duas renomeações atrás do próprio template** | isto é migração de versão do template, **não** adequação de legado puro — não confunda os dois diagnósticos |
| `workspaces_legado` | o repositório já é um monorepo com `workspaces` declarado | mesclar é do usuário (armadilha #2 abaixo) |
| `hooks_legado` | achou `.husky/` ou `husky`/`lint-staged` no `package.json` | terceiro caso de composição de `pre-commit` (armadilha #3) |
| `modulos_candidatos` | um por pasta informada em `--modulos` (ou achada nas topologias-padrão de `code-diagnostico`) | vira a tabela do portão central de HITL — `id_sugerido` é ponto de partida, não decisão fechada |

O script **não decide topologia** (isso é `code-diagnostico`/`code1-auditar` — `modules/*/module.json` ·
`backend/*|frontend/*|src/modules/*|apps/*|packages/*` · por-camadas · monólito simples). Ele só avalia, para
cada pasta que **já foi apontada** como candidata a módulo, se o nome bate `^[a-z][a-z0-9-]*$` e sugere o
kebab-case correspondente.

## § 1 — sintetizar e limpar `plan/` (Passo 1, detalhe)

**Caminho (i), sem specs SDD:** não há `specs/plan/` para limpar. Diga a frase no-op e siga — inventar uma
plan fantasma para "ter o que sintetizar" é o erro que este passo existe para evitar.

**Caminho (ii), com specs SDD:**
1. Liste `specs/plan/` e separe as `🟢 Aprovada` (síntese pendente) das `⚪ Sintetizada` (resíduo).
2. Toda `🟢` precisa ser sintetizada **antes** de seguir — é o revisor desta própria conversa que sintetiza,
   sob autorização do usuário (o mecanismo é o do ciclo SDD padrão, `00-prompt-revisor.md` §7.3).
3. Rode a skill `spec-atualizar` para expurgar as `⚪` (ela reverifica os quatro portões antes de remover —
   não reimplemente a verificação aqui).
4. Resultado esperado: `plan/` só com o que ainda está ativo (nunca nenhuma `xx-*` — esta campanha ainda não
   começou).

## § 2 — specs vs código (Passo 2, detalhe)

**Caminho (i):** instale a árvore de `specs/` do fluxo SDD (molde `_estrutura_base/`). Só duas specs recebem
conteúdo do alvo:

| Spec | Conteúdo |
|---|---|
| `00-contexto.md` | identidade real do repositório, regras inegociáveis específicas, mapa de roteamento, e a **fronteira declarada**: *"specs documentam deste ponto em diante; o comportamento anterior à adequação está capturado em `tests/`, não em prosa"* |
| `00-indice.md` | fila vazia, `proximo_numero_plan: "01"` |

`00-knowledge.md`, `00-prompt-executor.md` e `00-prompt-revisor.md` são **copiados sem reescrever** — releia
o estado atual deles na base antes de copiar, essa área evolui. `specs/specs/` nasce **vazia**: não
sintetize regra de negócio a partir do código legado — uma spec inferida errada é autoritativa e ninguém a
questiona depois; uma spec ausente é honesta sobre o que não se sabe ainda.

**Caminho (ii):** para cada spec fixa em `specs/`, `arquitetura/` e `adr/`, confira contra o código real que
ela descreve. Toda divergência:
- **não** é corrigida por edição silenciosa — vira uma plan `xx-nn-specs-<assunto>` que atualiza a spec;
- entra em `specs/00-indice.md` como qualquer outra plan da campanha;
- é reportada no HITL final da Fase A junto com as demais.

## § 3 — a régua antes da execução (Passo 3, detalhe)

### A dívida declarada

Depois de instalar `tools/`, `config/`, `project.json`, `packages/ports/`, `adapters/memory/` e
`.githooks/` na raiz de verdade (mesclando, nunca sobrescrevendo), rode:

```
node tools/gate/validate.mjs --todos
```

Isto **vai** dar vermelho — é o resultado correto no dia 1. Cada violação relatada se torna uma linha em
`config/conformidade.json:excecoes`, com as quatro chaves exatas do schema (`modulo`, `regra`, `motivo`,
`decisao`) — nenhuma a mais, nenhuma a menos (o schema tem `additionalProperties: false`). `decisao` aponta
um `## ADR-NNN` **real** dentro de `specs/adr/*.md` — sem ele o gate rejeita a própria exceção. Se o ADR
ainda não existe, escreva-o antes de declarar a exceção; não inverta a ordem.

O gate fica verde por **declaração**, não por mentira. O número de linhas em `excecoes` é a métrica da
campanha — cada módulo migrado apaga as suas próprias, nunca as de outro módulo.

### O buraco `eslint`/`tsc`/`prettier` — e a saída que já existe no template

Estas três ferramentas **não têm** mecanismo de dívida: os limiares são lei
(`tools/gate/thresholds.mjs`), a config é **gerada** a partir deles e não se edita à mão
(`lint-derivado` reprova qualquer edição manual, byte a byte). Um legado de milhares de linhas produz
milhares de violações no dia 1, e não há "exceção nominal" para isso.

A saída não é inventar uma — é usar o que o template **já** oferece:
- **Verificação de tipos é por módulo** (`tipos` roda pelo `tsconfig.json` de cada um) — um módulo novo, bem
  formado, tem tipagem estrita própria sem herdar o passivo do resto do repositório.
- O projeto nasce com `.prettierignore` — ponha ali a área legada inteira, **explicitamente**, com uma linha
  de comentário dizendo desde quando e por quê.
- Para `eslint`/`tsc` na área legada: declare o(s) `include`/`exclude` que a deixam de fora do lint/typecheck
  da raiz, na mesma lista de "caminhos ignorados" que vira a **segunda métrica** da campanha (ao lado do
  número de exceções em `conformidade.json`). Cada módulo que nasce do template traz o próprio escopo de
  volta — a lista só encolhe.

## § 4 — as seis armadilhas medidas

1. **`--forcar` sobrescreve `package.json`.** Todo legado tem um. Nunca use `--forcar` sem autorização
   explícita — mescle `scripts` manualmente na colisão.
2. **`workspaces: ["modules/[a-z]*", ...]` já existe** em monorepo legado. Mesclar com o que o template
   precisa é decisão do usuário, não automatizável — os dois arrays podem convergir ou não.
3. **`core.hooksPath` aceita um valor só.** Se o legado já usa husky/lint-staged, esse é um **terceiro**
   caso de composição de `pre-commit` que `compor_pre_commit` (em `init_repo.py`) hoje não cobre — ele
   resolve dois casos (1+1), medido. Decida com o usuário qual hook vence a cadeia, ou se os dois disparam
   em sequência.
4. **Gerações antigas do próprio template.** `ferramentas/`, `modulos/`, `projeto.json` são nomes de duas
   renomeações atrás — o diagnóstico os reconhece (`geracao_antiga` no relatório) e **não** os trata como
   legado puro. É migração de versão do template, um problema diferente desta campanha.
5. **`create-module.mjs` roda `npm install`** (exige rede) e `--role` é **obrigatório**, em **inglês**
   (`domain`\|`gateway`\|`connector`) — não adivinhe pelo nome do módulo.
6. **`sync-env.mjs` mescla preservando valor preenchido** e manda chave órfã para a seção `ORFAS`
   comentada — use-o para reconciliar o `.env` real do legado com o `.env.example` gerado; nunca reescreva
   o `.env` à mão por cima do que ele produz.

## § 5 — a rede e o cinto, por módulo

Ordem fixa, e as duas campanhas (Nível 1 desta skill, Nível 0 de `code-`) só avançam nesta sequência:

1. **Caracterizar primeiro** (`/code2-caracterizar`, skill `code-adequacao`) — sem rede de testes capturando
   o comportamento atual, "ficou igual" não tem verificador.
2. **Mover para a árvore fechada.** Pastas típicas de legado (`utils/`, `helpers/`, `services/`, `types/`)
   não são entrada válida da árvore do módulo (`estrutura-estrita`, lista normativa em
   `tools/gate/rules/structure.mjs:ENTRADAS_PERMITIDAS`). Mapeie cada uma para o destino certo antes de
   mover — não crie uma pasta nova só para "guardar por enquanto":

   | Pasta legada típica | Destino no template |
   |---|---|
   | `utils/`, `helpers/` (lógica de domínio pura) | `core/domain/` |
   | `services/` (orquestração sem I/O direto) | `core/domain/` ou `core/ports/` (se for a interface de uma infraestrutura) |
   | `types/`, `interfaces/` | `core/domain/` (tipos do domínio) ou `contract/openapi.yaml` (forma da API) |
   | client HTTP para outro domínio interno | `core/gateways/` — só se o alvo também migrar e a chamada for HTTP |
   | acesso a banco direto dentro da regra de negócio | `core/ports/` (interface) + adapter concreto fora do módulo |
3. **Adequar Nível 0** (`/code3-adequar`, consumindo o backlog do `/code1-auditar` — campanha **separada** e
   complementar, não gerada por esta skill).
4. **Gate verde** (`node tools/gate/validate.mjs modules/<id>`).
5. **Apagar as exceções daquele módulo** em `config/conformidade.json` — nunca deixe uma exceção resolvida
   na lista; ela é o que prova que o módulo terminou a migração.

Git: a campanha roda em **branch**, nunca em `main`; o commit é sempre do usuário. Como o repositório vai
ser reestruturado de todo jeito, o passo 0/1 é o momento mais barato para rodar `/git1-auditar` — legado é
onde segredo se esconde no histórico, e descobrir depois custa mais (rotação + reescrita, `/git2-adequar`).
