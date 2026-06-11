# Comando: /time

O comando `/time` é o assistente interativo para apontamento manual de horas (HITL). É utilizado quando o humano deseja contabilizar tempo de atividades externas (Reuniões, Consultoria, Planejamento Estrutural) ou lançar o tempo de tarefas offline finalizadas.

## Workflow HITL Obrigatório (Bifurcação de Fluxo)

Quando o usuário disparar `/time`, o Sarak NÃO deve ativar o timer de imediato. A IA DEVE entrar em modo Interativo e fazer as seguintes perguntas passo a passo (pode ser na mesma mensagem):

### 1. Seleção de Modo (Start vs Retroativo)
- Pergunte: *"Deseja iniciar um relógio rodando AGORA para essa atividade, ou deseja registrar um apontamento RETROATIVO (uma atividade já concluída)?"*

### 2. Seleção de Detalhes
- Pergunte: *"Qual a Categoria da tarefa? (Reunião, Consultoria, Planejamento Estrutural / Arch, etc)"*
- Pergunte: *"Qual o título ou descrição da tarefa?"*
- *(Somente se for retroativo)* Pergunte: *"Quando a atividade começou e terminou? (Ou qual foi a duração total?)"*

### 3. Processamento Estrito
Após o usuário fornecer os dados em linguagem natural (Português ou Inglês), obedeça rigidamente ao padrão da empresa:

1. **Traduza e Limpe a Categoria** obrigatoriamente para a Tag Curta padrão:
   - Qualquer menção a Reuniões / Dailies / Calls -> `[Meeting]`
   - Qualquer menção a Consultoria / Code Review / Suporte -> `[Consulting]`
   - Qualquer menção a Planejamento Estrutural / Documentação Fora de Código -> `[Arch]`
2. **Monte a Descrição:** Aplique o padrão exato `[{Categoria_Curta}] — {Descrição_Fornecida}`.
3. **Leia o `.agents/config.json`:** Resgate silenciosamente o `project_id` e as `tags_default`.
4. **Chamada MCP:**
   - **Se modo AGORA:** Chame a ferramenta `start_timer` do provedor (`clockify-sarak` ou `toggl-sarak`). Comunique ao usuário que o relógio está batendo e que ele ficará ativo até a janela da IDE ser fechada (sistema de Auto-Stop) ou até ser enviado o comando de parar.
   - **Se modo RETROATIVO:** Calcule as datas nos formatos exigidos (ex: ISO `2026-06-10T20:00:00Z`) a partir da duração passada, e chame a ferramenta `add_time_entry` do provedor MCP. Comunique ao usuário que o tempo foi lançado no provedor com sucesso.
