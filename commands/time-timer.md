---
description: Comando manual para gerenciar o rastreamento de tempo. Inicia ou para um timer explicitamente no provedor do projeto.
argument-hint: [start/stop] [descrição da tarefa se start]
allowed-tools: Read, call_mcp_tool
---

# /time-timer — Time Tracking Manual

Ação: **$1** (start ou stop)
Alvo/Descrição: **$2** (obrigatório se ação for "start")

Dispara a skill **`time-tracking`** em modo manual, forçando o início ou parada do timer atual para tarefas avulsas (ex: correção de bugs ou reuniões) que a IA não conseguiria iniciar automaticamente.

## Passos
1. Verifique se o arquivo `.agents/config.json` existe no diretório atual. Se não existir, avise o usuário que o rastreamento de tempo não está configurado neste projeto.
2. Extraia do `config.json` o campo `provider` (ex: `clockify` ou `toggl`) e o `project_id`.
3. Se a ação `$1` for `start`: 
   - Chame a ferramenta `start_timer` do servidor correspondente (`clockify-sarak` ou `toggl-sarak`).
   - Use a descrição recebida no `$2`.
4. Se a ação `$1` for `stop`:
   - Chame a ferramenta `stop_timer` do servidor correspondente.

## Limites
- **NÃO** acione nenhum timer se a configuração não existir.
- Avise brevemente o usuário do sucesso ou falha da operação.
