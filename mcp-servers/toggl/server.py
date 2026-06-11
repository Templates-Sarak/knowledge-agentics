# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "mcp>=1.0.0",
#     "requests>=2.31.0",
# ]
# ///

import os
import requests
import base64
import time
import atexit
import signal
import sys
from datetime import datetime, timezone
from mcp.server.fastmcp import FastMCP

# Cria o servidor MCP
mcp = FastMCP("Toggl Time Tracker")

def get_headers():
    token = os.environ.get("TOGGL_API_KEY")
    if not token:
        raise ValueError("A variável de ambiente TOGGL_API_KEY não está configurada.")
    # Autenticação Básica do Toggl exige "token:api_token"
    auth_str = f"{token}:api_token"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    return {"Authorization": f"Basic {b64_auth}", "Content-Type": "application/json"}

def get_workspace_id():
    res = requests.get("https://api.track.toggl.com/api/v9/me", headers=get_headers())
    res.raise_for_status()
    data = res.json()
    return data.get("default_workspace_id")

@mcp.tool()
def start_timer(description: str, project_id: int = None, tags: list[str] = None) -> str:
    """
    Inicia um cronômetro no Toggl Track.
    Args:
        description: A descrição do que você está trabalhando (obrigatório).
        project_id: O ID numérico do projeto no Toggl (opcional).
        tags: Lista de nomes de tags a serem adicionadas ao registro (opcional).
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return "Erro: Workspace padrão não encontrado."
            
        start_time = datetime.now(timezone.utc)
        payload = {
            "created_with": "sarak-mcp-agent",
            "description": description,
            "start": start_time.isoformat().replace("+00:00", "Z"),
            # Toggl usa duração negativa (-1 * timestamp) para indicar timer rodando
            "duration": -1 * int(time.time()),
            "workspace_id": workspace_id
        }
        if project_id:
            payload["project_id"] = project_id
        if tags:
            payload["tags"] = tags
            
        res = requests.post(
            f"https://api.track.toggl.com/api/v9/workspaces/{workspace_id}/time_entries",
            headers=get_headers(),
            json=payload
        )
        res.raise_for_status()
        return f"Cronômetro iniciado com sucesso para: {description}"
    except Exception as e:
        return f"Erro ao iniciar cronômetro no Toggl: {str(e)}"

@mcp.tool()
def add_time_entry(description: str, start_time_iso: str, end_time_iso: str, project_id: int = None, tags: list[str] = None) -> str:
    """
    Adiciona um registro de tempo finalizado (retroativo) no Toggl Track.
    Args:
        description: A descrição da tarefa (obrigatório).
        start_time_iso: ISO 8601 string do início (ex: '2026-06-10T20:00:00Z')
        end_time_iso: ISO 8601 string do término (ex: '2026-06-10T21:00:00Z')
        project_id: O ID numérico do projeto no Toggl (opcional).
        tags: Lista de nomes de tags a serem adicionadas (opcional).
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return "Erro: Workspace padrão não encontrado."
            
        start_dt = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end_time_iso.replace("Z", "+00:00"))
        duration_seconds = int((end_dt - start_dt).total_seconds())

        payload = {
            "created_with": "sarak-mcp-agent",
            "description": description,
            "start": start_time_iso,
            "duration": duration_seconds,
            "workspace_id": workspace_id
        }
        if project_id:
            payload["project_id"] = project_id
        if tags:
            payload["tags"] = tags
            
        res = requests.post(
            f"https://api.track.toggl.com/api/v9/workspaces/{workspace_id}/time_entries",
            headers=get_headers(),
            json=payload
        )
        res.raise_for_status()
        return f"Registro retroativo de tempo criado com sucesso para: {description}"
    except Exception as e:
        return f"Erro ao criar registro de tempo retroativo no Toggl: {str(e)}"

@mcp.tool()
def create_project(name: str) -> str:
    """
    Cria um novo projeto no Toggl Track e retorna seu ID (em formato string).
    Args:
        name: O nome do projeto a ser criado.
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return "Erro: Workspace padrão não encontrado."
            
        payload = {"active": True, "name": name}
        res = requests.post(
            f"https://api.track.toggl.com/api/v9/workspaces/{workspace_id}/projects",
            headers=get_headers(),
            json=payload
        )
        res.raise_for_status()
        data = res.json()
        return str(data.get("id"))
    except Exception as e:
        return f"Erro ao criar projeto no Toggl: {str(e)}"

@mcp.tool()
def stop_timer() -> str:
    """
    Para o cronômetro que está rodando atualmente no Toggl Track.
    """
    try:
        headers = get_headers()
        # Encontra o timer que está rodando
        res = requests.get("https://api.track.toggl.com/api/v9/me/time_entries/current", headers=headers)
        res.raise_for_status()
        current = res.json()
        
        if not current:
            return "Nenhum cronômetro está rodando atualmente."
            
        workspace_id = current.get("workspace_id")
        time_entry_id = current.get("id")
        
        stop_res = requests.patch(
            f"https://api.track.toggl.com/api/v9/workspaces/{workspace_id}/time_entries/{time_entry_id}/stop",
            headers=headers
        )
        stop_res.raise_for_status()
        return "Cronômetro parado com sucesso no Toggl."
    except Exception as e:
        return f"Erro ao parar cronômetro no Toggl: {str(e)}"

# Handlers para Auto-Stop
def auto_stop_handler():
    try:
        stop_timer()
    except:
        pass

atexit.register(auto_stop_handler)

def sigterm_handler(signum, frame):
    sys.exit(0)

signal.signal(signal.SIGTERM, sigterm_handler)
signal.signal(signal.SIGINT, sigterm_handler)

if __name__ == "__main__":
    mcp.run()
