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
import threading
import json
from datetime import datetime, timezone
from mcp.server.fastmcp import FastMCP

# Cria o servidor MCP
mcp = FastMCP("Toggl Time Tracker")

# Globals do Watchdog de Inatividade
last_activity_time = time.time()
is_timer_running = False
is_paused_by_idle = False
last_task_description = ""
last_project_id = None
last_tags = None
IDLE_TIMEOUT_MINUTES = 10

def get_headers():
    token = os.environ.get("TOGGL_API_KEY")
    if not token:
        raise ValueError("A variável de ambiente TOGGL_API_KEY não está configurada.")
    auth_str = f"{token}:api_token"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    return {"Authorization": f"Basic {b64_auth}", "Content-Type": "application/json"}

def get_workspace_id():
    res = requests.get("https://api.track.toggl.com/api/v9/me", headers=get_headers())
    res.raise_for_status()
    data = res.json()
    return data.get("default_workspace_id")

def stop_timer_internal():
    """Para o timer do Toggl internamente sem passar pelo @mcp.tool"""
    try:
        headers = get_headers()
        res = requests.get("https://api.track.toggl.com/api/v9/me/time_entries/current", headers=headers)
        if res.status_code == 200:
            current = res.json()
            if current:
                workspace_id = current.get("workspace_id")
                time_entry_id = current.get("id")
                requests.patch(
                    f"https://api.track.toggl.com/api/v9/workspaces/{workspace_id}/time_entries/{time_entry_id}/stop",
                    headers=headers
                )
    except:
        pass

def watchdog_loop():
    global is_timer_running, is_paused_by_idle, last_activity_time
    while True:
        time.sleep(60)
        if is_timer_running:
            if (time.time() - last_activity_time) > (IDLE_TIMEOUT_MINUTES * 60):
                stop_timer_internal()
                is_timer_running = False
                is_paused_by_idle = True

watchdog_thread = threading.Thread(target=watchdog_loop, daemon=True)
watchdog_thread.start()

@mcp.tool()
def ping_activity() -> str:
    """
    Sinaliza que a IA interagiu e verifica se o timer foi pausado por inatividade.
    Deve ser a PRIMEIRA chamada de ferramenta da IA no início de cada turno.
    Retorna uma string JSON com o status do watchdog e a última tarefa rodada.
    """
    global last_activity_time
    last_activity_time = time.time()
    
    return json.dumps({
        "status": "paused_by_idle" if is_paused_by_idle else "active",
        "last_task": last_task_description
    })

@mcp.tool()
def start_timer(description: str, project_id: int = None, tags: list[str] = None) -> str:
    """
    Inicia um cronômetro no Toggl Track.
    """
    global is_timer_running, is_paused_by_idle, last_activity_time, last_task_description, last_project_id, last_tags
    
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return "Erro: Workspace padrão não encontrado."
            
        start_time = datetime.now(timezone.utc)
        payload = {
            "created_with": "sarak-mcp-agent",
            "description": description,
            "start": start_time.isoformat().replace("+00:00", "Z"),
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
        
        # Atualiza globais do watchdog
        last_activity_time = time.time()
        is_timer_running = True
        is_paused_by_idle = False
        last_task_description = description
        last_project_id = project_id
        last_tags = tags
        
        return f"Cronômetro iniciado com sucesso para: {description}"
    except Exception as e:
        return f"Erro ao iniciar cronômetro no Toggl: {str(e)}"

@mcp.tool()
def add_time_entry(description: str, start_time_iso: str, end_time_iso: str, project_id: int = None, tags: list[str] = None) -> str:
    """
    Adiciona um registro de tempo finalizado (retroativo) no Toggl Track.
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
    global is_timer_running
    try:
        headers = get_headers()
        res = requests.get("https://api.track.toggl.com/api/v9/me/time_entries/current", headers=headers)
        res.raise_for_status()
        current = res.json()
        
        is_timer_running = False
        
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

# Handlers para Auto-Stop via fechamento
def auto_stop_handler():
    stop_timer_internal()

atexit.register(auto_stop_handler)

def sigterm_handler(signum, frame):
    sys.exit(0)

signal.signal(signal.SIGTERM, sigterm_handler)
signal.signal(signal.SIGINT, sigterm_handler)

if __name__ == "__main__":
    mcp.run()
