---
name: time-tracking
description: "Rastreamento de tempo. DIRETRIZ MÁXIMA: Ao receber qualquer tarefa (código/planejamento), sua PRIMEIRÍSSIMA AÇÃO, antes de ler arquivos ou pensar, DEVE ser ler `.agents/config.json` e chamar `start_timer` via MCP. Ao entregar a solução final, chame `stop_timer`."
---

# Skill: Time Tracking Automatizado

Esta skill integra o modelo com o provedor de apontamento de horas do projeto atual, garantindo que o tempo de desenvolvimento seja faturado.

## Quando usar
- **Modo Automático:** SEMPRE que o usuário delegar uma tarefa. Você deve acionar o timer logo no primeiro turno de resposta, antes de planejar ou ler o código.
- **Modo Manual:** Quando o usuário usar o comando explícito `/time-timer` ou pedir "inicie o timer para X", especialmente útil para troubleshooting/correção de bugs rápidos.
- O requisito para usar é existir um `.agents/config.json` na raiz do projeto alvo com o bloco `time_tracking`.

## Workflow

1. **Gate: Leitura de Configuração**
   - **Ferramenta:** `Read` (view_file)
   - **Ação:** Leia o arquivo `.agents/config.json` na raiz do repositório auditado.
   - **Critério:** Verifique qual o provedor de tempo (ex: `clockify`, `toggl`) e qual o ID do projeto configurado (`project_id`). Se o arquivo não existir ou não contiver configuração de timer, **NÃO inicie nenhum timer e não avise o usuário** (apenas siga com a tarefa normal).

2. **Ação: Iniciar o Cronômetro**
   - **Ferramenta:** Chamada de MCP (`call_mcp_tool`)
   - **Ação:** Chame a ferramenta `start_timer` do servidor correspondente (`clockify-sarak` ou `toggl-sarak`).
   - **Parâmetros:** 
     - `description`: String com prefixo semântico (ex: "Planejamento: [Nome]", "Desenvolvimento: [Nome]", "Correção de Bug: [Nome]").
     - `project_id`: Extraído do `config.json`.
   - **Critério:** O servidor retornará sucesso. Não interrompa o fluxo de resposta ao usuário para avisar que o timer foi iniciado, apenas coloque no seu resumo no final "*(Timer iniciado: Nome da Tarefa)*".

3. **Ação: Parar o Cronômetro (Fim da Tarefa)**
   - **Ferramenta:** Chamada de MCP (`call_mcp_tool`)
   - **Ação:** Ao terminar DE FATO a tarefa e entregar o código ou artefato final para revisão humana, chame a ferramenta `stop_timer` do provedor configurado.

## Regras
- **NÃO** pergunte ao usuário "posso iniciar o timer?" para tarefas padrão de spec e código. Faça de forma autônoma e invisível.
- **NUNCA** chame o timer se não houver `.agents/config.json` explícito no projeto. O Sarak é opt-in por projeto.

## Checklist
- [ ] O `config.json` foi consultado antes de tentar chamar o MCP?
- [ ] A ferramenta MCP correta foi chamada com os parâmetros mapeados?
