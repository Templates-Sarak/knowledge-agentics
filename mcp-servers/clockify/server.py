# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "mcp>=1.0.0",
#     "requests>=2.31.0",
# ]
# ///

import os
import requests
import atexit
import signal
import sys
from datetime import datetime, timezone
from mcp.server.fastmcp import FastMCP

# Cria o servidor MCP
mcp = FastMCP("Clockify Time Tracker")

def get_headers():
    token = os.environ.get("CLOCKIFY_API_KEY")
    if not token:
        raise ValueError("A variável de ambiente CLOCKIFY_API_KEY não está configurada.")
    return {"X-Api-Key": token, "Content-Type": "application/json"}

def get_workspace_and_user():
    headers = get_headers()
    res = requests.get("https://api.clockify.me/api/v1/user", headers=headers)
    res.raise_for_status()
    user_data = res.json()
    return user_data.get("activeWorkspace"), user_data.get("id")

def resolve_tags(workspace_id: str, tag_names: list[str]) -> list[str]:
    """Resolve nomes de tags para seus IDs no Clockify. Cria a tag se não existir."""
    if not tag_names:
        return []
    
    headers = get_headers()
    res = requests.get(f"https://api.clockify.me/api/v1/workspaces/{workspace_id}/tags", headers=headers)
    res.raise_for_status()
    existing_tags = {t["name"]: t["id"] for t in res.json()}
    
    tag_ids = []
    for name in tag_names:
        if name in existing_tags:
            tag_ids.append(existing_tags[name])
        else:
            # Create tag
            res_create = requests.post(
                f"https://api.clockify.me/api/v1/workspaces/{workspace_id}/tags",
                headers=headers,
                json={"name": name}
            )
            if res_create.status_code in (200, 201):
                tag_ids.append(res_create.json()["id"])
    return tag_ids

@mcp.tool()
def start_timer(description: str, project_id: str = None, tags: list[str] = None) -> str:
    """
    Inicia um cronômetro no Clockify.
    Args:
        description: A descrição do que você está trabalhando (obrigatório).
        project_id: O ID do projeto no Clockify (opcional).
        tags: Lista de nomes de tags a serem adicionadas ao registro (opcional).
    """
    try:
        workspace_id, _ = get_workspace_and_user()
        if not workspace_id:
            return "Erro: Workspace ativo não encontrado."
            
        payload = {
            "start": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "description": description
        }
        if project_id:
            payload["projectId"] = project_id
            
        if tags:
            payload["tagIds"] = resolve_tags(workspace_id, tags)
            
        res = requests.post(
            f"https://api.clockify.me/api/v1/workspaces/{workspace_id}/time-entries",
            headers=get_headers(),
            json=payload
        )
        res.raise_for_status()
        return f"Cronômetro iniciado com sucesso para: {description}"
    except Exception as e:
        return f"Erro ao iniciar cronômetro no Clockify: {str(e)}"

@mcp.tool()
def add_time_entry(description: str, start_time_iso: str, end_time_iso: str, project_id: str = None, tags: list[str] = None) -> str:
    """
    Adiciona um registro de tempo finalizado (retroativo) no Clockify.
    Args:
        description: A descrição da tarefa (obrigatório).
        start_time_iso: ISO 8601 string do início (ex: '2026-06-10T20:00:00Z')
        end_time_iso: ISO 8601 string do término (ex: '2026-06-10T21:00:00Z')
        project_id: O ID do projeto no Clockify (opcional).
        tags: Lista de nomes de tags a serem adicionadas (opcional).
    """
    try:
        workspace_id, _ = get_workspace_and_user()
        if not workspace_id:
            return "Erro: Workspace ativo não encontrado."
            
        payload = {
            "start": start_time_iso,
            "end": end_time_iso,
            "description": description
        }
        if project_id:
            payload["projectId"] = project_id
            
        if tags:
            payload["tagIds"] = resolve_tags(workspace_id, tags)
            
        res = requests.post(
            f"https://api.clockify.me/api/v1/workspaces/{workspace_id}/time-entries",
            headers=get_headers(),
            json=payload
        )
        res.raise_for_status()
        return f"Registro retroativo de tempo criado com sucesso para: {description}"
    except Exception as e:
        return f"Erro ao criar registro de tempo retroativo: {str(e)}"

@mcp.tool()
def create_project(name: str) -> str:
    """
    Cria um novo projeto no Clockify e retorna seu ID.
    Args:
        name: O nome do projeto a ser criado.
    """
    try:
        workspace_id, _ = get_workspace_and_user()
        if not workspace_id:
            return "Erro: Workspace ativo não encontrado."
            
        payload = {"name": name}
        res = requests.post(
            f"https://api.clockify.me/api/v1/workspaces/{workspace_id}/projects",
            headers=get_headers(),
            json=payload
        )
        res.raise_for_status()
        data = res.json()
        return data.get("id")
    except Exception as e:
        return f"Erro ao criar projeto no Clockify: {str(e)}"

@mcp.tool()
def stop_timer() -> str:
    """
    Para o cronômetro que está rodando atualmente no Clockify.
    """
    try:
        workspace_id, user_id = get_workspace_and_user()
        if not workspace_id or not user_id:
            return "Erro: Workspace ou Usuário não encontrados."
            
        payload = {
            "end": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        }
        res = requests.patch(
            f"https://api.clockify.me/api/v1/workspaces/{workspace_id}/user/{user_id}/time-entries",
            headers=get_headers(),
            json=payload
        )
        
        if res.status_code == 404:
            return "Nenhum cronômetro está rodando atualmente."
            
        res.raise_for_status()
        return "Cronômetro parado com sucesso no Clockify."
    except Exception as e:
        return f"Erro ao parar cronômetro no Clockify: {str(e)}"

# Handlers para Auto-Stop
def auto_stop_handler():
    try:
        # Se for chamado de forma síncrona sem contexto do event loop, funciona perfeitamente via requests
        stop_timer()
    except:
        pass

atexit.register(auto_stop_handler)

def sigterm_handler(signum, frame):
    sys.exit(0)  # O sys.exit chama os handlers do atexit

signal.signal(signal.SIGTERM, sigterm_handler)
signal.signal(signal.SIGINT, sigterm_handler)

if __name__ == "__main__":
    mcp.run()
