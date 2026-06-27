# Workflow Detalhado: spec-atualizar

Este documento expande o passo-a-passo da skill, oferecendo exemplos claros de como conduzir o particionamento em blocos e o HITL (Human-In-The-Loop).

## Passo 2: Mapeamento e Particionamento (Exemplo)

Se a pasta `plan/` contiver 4 rascunhos:
- `plan/auth-api.md`
- `plan/auth-db.md`
- `plan/ui-login.md`
- `plan/pagamentos-webhook.md`

O agente deve agrupar de forma lógica:
- **Bloco 1 (Autenticação):** `auth-api.md`, `auth-db.md` e `ui-login.md` vão atualizar a spec existente `specs/02-auth.md`.
- **Bloco 2 (Pagamentos):** `pagamentos-webhook.md` vai gerar uma nova spec `specs/05-pagamentos.md`.

## Passo 3: HITL (Human-In-The-Loop) na prática

A interação com o usuário deve ser precisa. Apresente um alerta ou bloco claro.

### Exemplo de saída do Agente para o Bloco 1:
```markdown
### 📦 Bloco 1 de Atualização: Autenticação

Vou consolidar as implementações de `plan/auth-api.md`, `plan/auth-db.md` e `plan/ui-login.md` na especificação definitiva **`specs/02-auth.md`**.

**Resumo das mudanças propostas:**
- Adição dos novos endpoints REST no contrato.
- Inclusão da estrutura do banco (Users e Sessions).
- Atualização das telas de login com os novos campos.

> ⚠️ Confirma a atualização deste bloco?
```
*(O agente deve aguardar o input do usuário aqui).*

## Passo 5: Limpeza

Após o término, faça uma checagem final:
"Todas as atualizações foram consolidadas com sucesso em `specs/`. Posso apagar com segurança o conteúdo da pasta `specs/plan/` para manter o workspace limpo?"
