# Specs — fechar o marco-0 sem ADRs de evolução

Objetivo: depois do marco-0, `specs/` descreve **o sistema como ele é**, sem rastro de como chegou ali. O
caminho percorrido continua no Git (a opção A não reescreve histórico), então remover não perde o "porquê".

## O que fica e o que sai

| Artefato | Destino |
|---|---|
| ADR-000 do template (`specs/adr/000-decisoes-do-template.md`) | **Fica.** É a âncora das exceções do gate (`tools/create-project.mjs`, `tools/gate/ports-vocabulary.mjs`). |
| ADR citada por exceção viva (`config/compliance.json`, `ci-dependencies` — campo `decision`) | **Fica.** Apagar quebra a exceção. |
| ADR de evolução do sistema (registra o caminho) | **Absorve e remove**: a decisão **vigente** vai para `specs/arquitetura/` ou `specs/`; o ADR sai. |
| Plan `🟢` pendente de síntese | Sintetiza na spec de destino (`destino_sintese`) e remove plan + linha do índice. `plan/` termina vazia. |
| Plan ainda aberta | Não é do marco-0 — fecha ou cancela antes de seguir. |

## Regra de absorção (nada some antes de ter destino)

1. Liste cada ADR com: decisão vigente? citada por exceção? (`Grep` por `ADR-<n>` em código, config e CI).
2. Escreva, na spec de destino, a **regra** (o que vale hoje), sem a história ("passou a…", "antes era…").
3. Só então remova o ADR. Referências quebradas (`[[adr/…]]`, `ADR-nn` em comentários) são corrigidas na mesma ação.
4. A decisão do próprio marco-0 vai em uma linha no `00-contexto.md`: *"as specs documentam a partir do
   marco-0 (`v1.0.0`); o histórico anterior está no Git"*.

## Conferência

- `spec-revisao` sobre `arquitetura/` e `specs/`: cada afirmação bate com o código.
- Gate verde depois (`validate.mjs --all`): confirma que a âncora e as exceções seguem íntegras.
- `00-indice.md` sem linhas órfãs; `00-backlog.md` sem item que aponte para plan removida.

> Forma e vocabulário das specs: `spec-write`. Não reescreva regra de outra skill aqui — referencie.
