# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "mcp>=1.0.0",
#     "requests>=2.31.0",
# ]
# ///

import os
import requests
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
    # Pega os dados do usuário para encontrar o workspace ativo e o user id
    res = requests.get("https://api.clockify.me/api/v1/user", headers=headers)
    res.raise_for_status()
    user_data = res.json()
    return user_data.get("activeWorkspace"), user_data.get("id")

@mcp.tool()
def start_timer(description: str, project_id: str = None) -> str:
    """
    Inicia um cronômetro no Clockify.
    Args:
        description: A descrição do que você está trabalhando (obrigatório).
        project_id: O ID do projeto no Clockify (opcional).
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
        
        # Se 404, significa que não há timer rodando
        if res.status_code == 404:
            return "Nenhum cronômetro está rodando atualmente."
            
        res.raise_for_status()
        return "Cronômetro parado com sucesso no Clockify."
    except Exception as e:
        return f"Erro ao parar cronômetro no Clockify: {str(e)}"

if __name__ == "__main__":
    mcp.run()
