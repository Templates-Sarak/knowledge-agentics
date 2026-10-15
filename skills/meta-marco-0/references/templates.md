# Templates de preenchimento — meta-marco-0

Blocos copiáveis. O molde de plan em si é o do fluxo SDD (`specs/_estrutura_base/_templates/template-plan.md`)
— não duplicado aqui; abaixo está o que esta skill acrescenta.

## 1. Nome e frontmatter de uma plan do marco-0

```
specs/plan/m0-<nn>-<descricao-kebab>.md        # m0-01-codigo · m0-02-migrations · m0-03-specs …
```

```yaml
tags: ["plan", "marco-0"]
status: "🔴 A executar"
destino_sintese: "—"        # m0-03 usa arquitetura/FF.NN-*.md · specs/FF.NN-*.md · 00-contexto.md
```

## 2. Corpo mínimo por frente (o que a plan DEVE declarar além do molde)

```markdown
# 3.1 Dentro — remoções NOMINAIS
| Alvo | Classe | Prova de ausência de referência | Recriado automaticamente? |
|---|---|---|---|
| `src/old/legacy-report.ts` | código morto | `Grep` sem ocorrências | não |

# 3.2 Fora — preservado
- `.env`, `marco-0.protect`, templates de recriação, ADR-000 e ADRs com exceção viva.

# Critério de aceite (mecânico)
- build, testes e gate verdes; `git diff --stat` coincide com a tabela de 3.1.
```

Plan `m0-02` acrescenta a tabela de migrations (arquivo · classe · aplicada em quais ambientes — **dado
do dev**) e o comando de `schema_parity.py`. Plan `m0-05` acrescenta a saída do `check_publish.py`.

## 3. Manifesto `marco-0.protect`

```
# Uma entrada por linha (caminho ou glob). Nada aqui é removido pelo marco-0.
templates/**
db/seeds/required/**
tests/fixtures/**
```

## 4. Prompt direto ao executor (uma plan por vez)

```
Você é o EXECUTOR. Leia specs/00-prompt-executor.md e a plan specs/plan/m0-<nn>-<slug>.md.
Branch de trabalho: marco-0. Remova SÓ o que a tabela 3.1 lista, com Grep antes de cada remoção.
Ao fim: build, testes e gate verdes; status → 🟠 Em revisão. Não toque em .env nem em marco-0.protect.
```

## 5. HITL do fim da Fase A

```
## Plano do marco-0 — <sistema>
- Plans: m0-01 … m0-05 (links)
- Remoções nominais: <n> arquivos · <n> migrations nunca aplicadas · <n> ADRs absorvidas
- Preservado: <manifesto + .env + ADR-000>
- Riscos: <workflows de tag · paridade não provada · testes ausentes>
⚠️ Confirma o plano do marco-0?
```
