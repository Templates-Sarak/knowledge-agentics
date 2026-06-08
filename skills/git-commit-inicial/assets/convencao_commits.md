# Template: Convenção de Commits (Conventional Commits)

Padrão de mensagens de commit do ecossistema Sarak — em **português**, seguindo Conventional Commits.

## Formato
```
<tipo>(<escopo opcional>): <descrição no imperativo>

[corpo opcional explicando o porquê]
```

## Tipos
| Tipo | Quando usar |
|---|---|
| `feat` | nova funcionalidade |
| `fix` | correção de bug |
| `refactor` | mudança de código sem alterar comportamento |
| `chore` | tarefas de manutenção (config, deps, build) |
| `docs` | documentação |
| `test` | testes |
| `style` | formatação (sem mudança de lógica) |
| `perf` | melhoria de performance |

## Exemplos
```
feat(usuarios): adiciona autenticação por token
fix(pagamentos): corrige cálculo de juros em parcelas
chore(seguranca): move chave da API para variável de ambiente
refactor(pedidos): extrai validação para função dedicada
```

## Regras
- Descrição no imperativo ("adiciona", não "adicionado").
- Sem ponto final na descrição.
- O **commit inicial** do repositório usa a mensagem `commit inicial` (regra da `git-commit-inicial`).
- Um commit = uma mudança coesa (não misture feat + fix no mesmo commit).
