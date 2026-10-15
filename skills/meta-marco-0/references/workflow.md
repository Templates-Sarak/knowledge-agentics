# Workflow — meta-marco-0

As quatro fases em detalhe. O `SKILL.md` resolve o caminho comum; aqui estão os passos finos e os portões.

## Fase A — planejar (revisor, uma conversa)

1. **Diagnosticar.** `python scripts/diagnose_terrain.py --root <alvo> --json`. Leia `blockers` primeiro:

   | blocker | o que fazer |
   |---|---|
   | `on-default-branch` | PARE. Crie `marco-0` (nome em `config.json`) e só então siga. |
   | `branch-undetermined` | pergunte ao usuário; nunca presuma que está seguro. |
   | `worktree-not-clean-or-unknown` | peça commit/stash; não limpe sobre mudança alheia. |
   | `no-tests-found` | `/code2-caracterizar` antes — sem rede, "manter funcionalidade" não é verificável. |
   | `workflow-triggers-on-tag-or-release` | não é bloqueio; anote para a Fase D. |

2. **Pré-requisito de segurança.** `/git1-auditar` sobre o histórico. Segredo no histórico não bloqueia o
   marco-0 (não há reescrita), mas o usuário decide ciente: o histórico segue público no GitHub.
3. **Linha de base.** Rode build, testes e o gate (`node tools/gate/validate.mjs --all`, se houver o
   template) e registre o resultado — é o "antes" que a Fase C compara.
4. **Mapear as cinco frentes** (uma plan cada, modelo em `templates.md`):

   | plan | frente | skill/ferramenta chamada |
   |---|---|---|
   | `m0-01-codigo` | comentários obsoletos, código morto, artefatos de dev, deps | `code-limpeza-projeto` |
   | `m0-02-migrations` | classificação, paridade de schema | `db-migrations`, `schema_parity.py` |
   | `m0-03-specs` | ADRs, specs de arquitetura e do sistema | `spec-write`, `spec-revisao` |
   | `m0-04-entrega` | versão 1.0.0, CHANGELOG, licença, autoria | `code-entrega` |
   | `m0-05-publicacao` | PR, tag, `develop`, proteção, Release | `check_publish.py` |

5. **Manifesto `marco-0.protect`** na raiz do alvo (uma entrada por linha, `#` comenta): templates que o
   sistema usa para recriar coisas, seeds necessárias, fixtures de teste. O diagnóstico o lê.
6. **HITL** — apresente: plans + lista **nominal** do que será removido + manifesto + riscos.
   "⚠️ Confirma o plano do marco-0?" Nada é escrito no código antes disso.

## Fase B — executar (executor)

- Uma plan por vez; status `🔴 → 🟡 → 🟠 → 🟢` (legenda do `00-indice.md`). Commit por plan, na `marco-0`.
- Antes de apagar: `Grep` da referência viva. Depois de cada plan: build + testes + gate verdes — vermelho
  reverte aquela remoção, não a plan inteira.
- Achado fora do escopo (bug, feature) vira registro, não correção.
- Plan `🟠 Em revisão` entrega ao revisor da Fase C; quem aprova (`🟢`) é ele, não o executor.

## Fase C — conferir (outro revisor, outra conversa)

1. `diagnose_terrain.py --json` → `phase` deve ser `C`.
2. `python scripts/schema_parity.py --schema-file <schema> --migrations-dir <dir>`. Só `proven` segue.
   `not-proven` ou `divergent`: **avise o usuário e exija a correção** antes de qualquer outro passo.
3. Build, testes e gate comparados com a linha de base da Fase A.
4. `spec-revisao`: as specs afirmam o que o sistema faz.
5. Nenhuma entrada do manifesto sumiu; nenhum `.env` removido; `git diff --stat` coerente com as plans.
6. Veredito por critério mecânico em `assets/relatorio-marco-0.md`. Reprovou → prompt de correção, volta à B.

## Fase D — publicar (HITL severo, por ato externo)

Detalhe e comandos em `git-github.md`. Ordem: `check_publish.py` → PR com squash → tag anotada →
`develop` → proteção → Release (opcional). Cada ato que sai da máquina pede confirmação própria.
