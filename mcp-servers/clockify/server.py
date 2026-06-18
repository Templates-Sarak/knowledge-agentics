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
import time
import threading
import json
from datetime import datetime, timezone
from mcp.server.fastmcp import FastMCP

ACTIVITY_FILE = os.path.expanduser("~/.sarak_activity.json")

def update_activity_file(is_running):
    try:
        data = {"is_running": is_running, "last_activity": time.time() * 1000}
        with open(ACTIVITY_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except:
        pass

def read_activity_file():
    try:
        if os.path.exists(ACTIVITY_FILE):
            with open(ACTIVITY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("last_activity", 0) / 1000.0
    except:
        pass
    return 0

# Cria o servidor MCP
mcp = FastMCP("Clockify Time Tracker")

# Globals do Watchdog de Inatividade
last_activity_time = time.time()
is_timer_running = False
is_paused_by_idle = False
last_task_description = ""
last_project_id = None
last_tags = None
IDLE_TIMEOUT_MINUTES = 10

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

def stop_timer_internal():
    """Função interna para parar o timer via watchdog/atexit sem passar pelo FastMCP"""
    try:
        workspace_id, user_id = get_workspace_and_user()
        if not workspace_id or not user_id:
            return
        payload = {"end": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")}
        requests.patch(
            f"https://api.clockify.me/api/v1/workspaces/{workspace_id}/user/{user_id}/time-entries",
            headers=get_headers(),
            json=payload
        )
    except:
        pass

def watchdog_loop():
    global is_timer_running, is_paused_by_idle, last_activity_time
    while True:
        time.sleep(60)
        if is_timer_running:
            hook_activity_sec = read_activity_file()
            if hook_activity_sec > last_activity_time:
                last_activity_time = hook_activity_sec
                
            if (time.time() - last_activity_time) > (IDLE_TIMEOUT_MINUTES * 60):
                stop_timer_internal()
                is_timer_running = False
                is_paused_by_idle = True
                update_activity_file(False)

watchdog_thread = threading.Thread(target=watchdog_loop, daemon=True)
watchdog_thread.start()

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
def start_timer(description: str, project_id: str = None, tags: list[str] = None) -> str:
    """
    Inicia um cronômetro no Clockify.
    Args:
        description: A descrição do que você está trabalhando (obrigatório).
        project_id: O ID do projeto no Clockify (opcional).
        tags: Lista de nomes de tags a serem adicionadas ao registro (opcional).
    """
    global is_timer_running, is_paused_by_idle, last_activity_time, last_task_description, last_project_id, last_tags
    
    try:
        # Garante que qualquer timer anterior seja pausado antes de iniciar um novo
        stop_timer_internal()
        
        workspace_id, _ = get_workspace_and_user()
        if not workspace_id:
            return "Erro: Workspace ativo não encontrado."
            
        payload = {
            "start": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
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
        
        # Atualiza os globals do watchdog
        last_activity_time = time.time()
        is_timer_running = True
        is_paused_by_idle = False
        last_task_description = description
        last_project_id = project_id
        last_tags = tags
        update_activity_file(True)
        
        return f"Cronômetro iniciado com sucesso para: {description}"
    except Exception as e:
        return f"Erro ao iniciar cronômetro no Clockify: {str(e)}"

@mcp.tool()
def add_time_entry(description: str, start_time_iso: str, end_time_iso: str, project_id: str = None, tags: list[str] = None) -> str:
    """
    Adiciona um registro de tempo finalizado (retroativo) no Clockify.
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
    global is_timer_running
    try:
        workspace_id, user_id = get_workspace_and_user()
        if not workspace_id or not user_id:
            return "Erro: Workspace ou Usuário não encontrados."
            
        payload = {
            "end": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        }
        res = requests.patch(
            f"https://api.clockify.me/api/v1/workspaces/{workspace_id}/user/{user_id}/time-entries",
            headers=get_headers(),
            json=payload
        )
        
        is_timer_running = False
        update_activity_file(False)
        
        if res.status_code == 404:
            return "Nenhum cronômetro está rodando atualmente."
            
        res.raise_for_status()
        return "Cronômetro parado com sucesso no Clockify."
    except Exception as e:
        return f"Erro ao parar cronômetro no Clockify: {str(e)}"

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
