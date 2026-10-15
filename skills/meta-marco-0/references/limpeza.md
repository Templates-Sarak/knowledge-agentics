# Limpeza — o que remove e o que nunca remove

A skill **orquestra**; a mecânica de detectar e deletar é da `code-limpeza-projeto` (`detect_junk.py`,
HITL por fase, `Grep` antes de deletar). Aqui está só o que o marco-0 acrescenta.

## Remove (se obsoleto, sem referência viva e não recriado automaticamente)

| Classe | Critério de "obsoleto" |
|---|---|
| Comentário | cita plan/ticket/tarefa fechada, "removido em…", autor/data, código desativado. Comentário que explica o *porquê* **permanece**. |
| Código | função/export/import sem nenhuma referência (`Grep` em código, testes, config e docs). |
| Marcadores | `TODO`/`FIXME`/`HACK`/`XXX` resolvidos; `console.log`, `print`, `debugger` de depuração. |
| Artefatos de dev | rotas/flags de debug, mocks e fixtures **fora** de `tests/`, seeds só de desenvolvimento, `old/`, `backup/`, `*.log`, `temp/`. |
| Dependências | não usadas; `devDependencies` vazando para a imagem. **Build logo após** cada remoção. |
| Specs | plans sintetizadas e ADRs de evolução (`specs-absorcao.md`). |

## Nunca remove

- **`.env`** (e variantes locais) — jamais nesta etapa. `.env.example` só se atualiza, não se apaga.
- Tudo que o sistema **recria automaticamente** ou usa para recriar: templates (e-mail, documentos,
  scaffolds), seeds necessárias, arquivos gerados por `sync-deploy`/geradores.
- O que está em `marco-0.protect`.
- Arquivos de infraestrutura (`Dockerfile`, `compose.yml`, `package.json`, `.gitignore`, `.github/`).
- A ADR-000 do template e ADRs com exceção viva (`specs-absorcao.md`).

## Resíduos locais (`.sarak/`, `node_modules`, build)

`.sarak/` e artefatos de build **não são versionados**: confira o `.gitignore` em vez de apagar à mão.
Se estiverem versionados por engano, é remoção com `Grep` e HITL como qualquer outra.

## Segredos e credenciais

Segredo no working tree: `cyber-segredos` (mascarado no relatório). **Rotação**: a skill lista as
credenciais que *valeria* rotacionar (as que existiram em dev e vão para produção) e **para aí** —
rotacionar é do dev, no tempo dele.
