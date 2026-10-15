# Exemplos — plan boa × plan vaga

## Plan vaga (reprova)

> **m0-01 — limpar o projeto.** Remover código antigo, comentários velhos e o que não é mais usado.

Por quê falha: sem alvo nominal, sem prova de ausência de referência, sem critério de aceite. O executor
"limpa" por julgamento — e apaga um template de e-mail que o sistema usa para recriar documentos.

## Plan boa

> **m0-01-codigo — remover 14 arquivos órfãos e 63 comentários obsoletos.**
> 3.1 tabela nominal (alvo · classe · `Grep` sem ocorrência · recriado? não).
> 3.2 fora: `.env`, `templates/**` (manifesto), ADR-000.
> Aceite: build, testes e gate verdes; `git diff --stat` = tabela 3.1; relatório anexado ao PR.

## Migration — decisão boa × ruim

- **Boa:** `20240301_add_index_draft.sql` — consta no manifesto do dev como *nunca aplicada em nenhum
  ambiente*; `Grep` sem referência → removível, com HITL.
- **Ruim:** apagar `20230110_create_orders.sql` porque "o schema.sql já cria `orders`". Está aplicada em
  produção; o histórico perde o ID e a ferramenta passa a acusar drift. Mantém — a paridade prova que o
  schema é fiel, e o histórico segue intacto.
