---
name: time-tracking
description: "Rastreamento de tempo. DIRETRIZ MÁXIMA: Ao receber qualquer tarefa (código/planejamento), sua PRIMEIRÍSSIMA AÇÃO DEVE ser chamar `ping_activity` via MCP. Se ele retornar 'paused_by_idle', dispare o HITL perguntando se retoma a tarefa anterior ou cria nova. Caso contrário, leia o `.agents/config.json` e chame `start_timer`. Ao finalizar a entrega, chame `stop_timer`."
---

# Skill: Time Tracking Automatizado

Esta skill integra o modelo com o provedor de apontamento de horas (`clockify-sarak` ou `toggl-sarak`), garantindo apontamento padronizado de nível empresarial. 

## Regras de Taxonomia e Nomenclatura (Padrão Estrito)
A empresa exige formatação estrita para faturamento. O parâmetro `description` DEVE sempre seguir o formato:
`[{Categoria}] {Branch_ou_Módulo} — {Resumo_da_Tarefa}`
*(Ex: `[Feat] feature/login — Implementação de middleware JWT`)*

**Categorias Automáticas (A IA deve deduzir do prompt):**
- `[Plan]` — Arquitetura, especificação, documentação.
- `[Feat]` — Escrita de código novo e funcionalidades.
- `[Fix]` — Resolução de erros e bugs.
- `[Refactor]` — Adequação a padrões ou refatoração.
- `[Test]` — Coberturas e testes (ex: unitários, integração).
- `[Audit]` — Diagnósticos e segurança.
- `[DevOps]` — Infraestrutura, pipelines e DB.
- `[Meta]` — Trabalho interno no ecossistema Sarak.

**Categorias Manuais (Usadas via comando interativo):**
A IA deve reconhecer se o usuário usar inglês ou português e SEMPRE mapear para o padrão estrito em INGLÊS nos colchetes:
- Planejamento Estrutural / Design -> `[Arch]`
- Reuniões / Calls -> `[Meeting]`
- Consultoria / Suporte -> `[Consulting]`

## Metadados Passivos (Tags)
Além do formato da descrição, a IA DEVE enviar uma array de `tags` (string) ao MCP contendo:
1. Todas as tags contidas em `tags_default` no arquivo `.agents/config.json`.
2. Uma tag dinâmica informando qual skill está sendo usada (ex: `test-ws-realtime`), quando aplicável, para permitir auditoria posterior no relatório do cliente.

## Workflow

**0. O Ping de Sobrevivência (Watchdog de Inatividade)**
   - Toda vez que você for iniciar a resposta para uma nova solicitação do usuário, a sua PRIMEIRA ferramenta chamada DEVE ser `ping_activity` (presente em `clockify-sarak` e `toggl-sarak`).
   - O servidor MCP verificará o Watchdog. Se ele retornar um JSON indicando `{"status": "paused_by_idle", "last_task": "..."}`, **PAUSE** toda a sua lógica de código e dispare imediatamente o **Gate HITL de Retomada**:
     *"Notei um período de inatividade e pausei o cronômetro para proteger suas horas. Deseja **Retomar** a tarefa anterior (`{last_task}`) ou iniciar uma **Nova Implementação**?"*
   - Prossiga (iniciando o timer correto) apenas após a resposta do usuário.

1. **Gate: Leitura de Contexto**
   - Leia `.agents/config.json`. Se não houver configuração `time_tracking`, não inicie o timer. Extraia `project_id` e `tags_default`.
   - Se for uma tarefa automatizada em um repositório Git, execute de forma silenciosa `git branch --show-current` para obter o {Branch_ou_Módulo} para compor a Descrição. Se falhar, use o nome da pasta alvo.

2. **Ação: Iniciar o Cronômetro**
   - Chame a ferramenta `start_timer` do provedor (MCP `clockify-sarak` ou `toggl-sarak`).
   - Parâmetros: `description` (formatada), `project_id`, `tags` (array de strings: tags default + skill atual).
   - Não avise o usuário explicitamente da criação num parágrafo longo; apenas coloque silenciosamente no rodapé da sua resposta "*(Timer iniciado: [Categoria])*".

3. **Ação: Parar o Cronômetro (Fim da Tarefa)**
   - Ao terminar DE FATO a tarefa e entregar o código, chame a ferramenta `stop_timer`.

*(Nota: Para tarefas lançadas retroativamente ou offline, utilize o assistente manual via rota de comando `/time`, que dispõe de uma etapa HITL para usar a ferramenta `add_time_entry`).*
