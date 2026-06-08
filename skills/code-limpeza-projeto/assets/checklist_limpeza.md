# Relatório de Limpeza de Projeto

**Projeto:** [NOME]
**Data:** [AAAA-MM-DD]
**Fonte automática:** `detectar_lixo.py` (arquivos de lixo, marcadores, arquivos grandes)

---

## Fase 1 — Estrutural e Espacial
| Item | Achado | Ação (após HITL) |
|---|---|---|
| Arquivos grandes (Top) | [arquivo — tamanho] | [remover / manter / mover p/ storage] |
| Pastas órfãs/backup | [old/, backup/] | [remover] |
| Temporários/logs | [*.log, temp/] | [remover] |
| `.gitignore` | [padrões ausentes] | [adicionar] |

## Fase 2 — Analítica e Segurança
| Item | Achado | Ação |
|---|---|---|
| Segredos (mascarados) | [arquivo:linha] | [mover p/ `.env`] |
| Dependências não usadas | [pacote] | [remover após build] |
| Código morto (confirmado via `Grep`) | [função/import] | [remover] |
| Marcadores `TODO`/`console.log` | [arquivo:linha] | [resolver / remover] |

## Resultado
- Espaço liberado (estimativa): [X MB]
- Arquivos removidos: [N]
- Segredos sanitizados: [N]
- Build pós-limpeza: [✅ passou | ❌ falhou]

> Toda deleção exige confirmação do usuário (HITL). `Grep` obrigatório antes de remover qualquer código.
