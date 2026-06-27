import os
import re
import json
import subprocess
import argparse

def get_args():
    parser = argparse.ArgumentParser(description="Auditoria Sarak X-Skills Base")
    parser.add_argument("--raiz", required=True, help="Caminho raiz do repositório X-Skills")
    return parser.parse_args()

def audit_base(base_dir):
    report = {
        "agents": [],
        "commands": [],
        "hooks": [],
        "skills": [],
        "vazamentos": []
    }
    
    # 1. Agents
    agents_dir = os.path.join(base_dir, "agents")
    if os.path.exists(agents_dir):
        for file in os.listdir(agents_dir):
            if not file.endswith(".md"):
                continue
            path = os.path.join(agents_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            if "EXCLUSIVAMENTE" not in content and "JSON" not in content:
                report["agents"].append(f"[{file}] Faltando contrato estrito de saída JSON.")
            if "name:" not in content or "description:" not in content:
                report["agents"].append(f"[{file}] Frontmatter incompleto (name/description).")

    # 2. Commands
    commands_dir = os.path.join(base_dir, "commands")
    if os.path.exists(commands_dir):
        for file in os.listdir(commands_dir):
            if not file.endswith(".md"):
                continue
            path = os.path.join(commands_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            for line in content.split("\n"):
                if line.startswith("description:"):
                    if ": " in line[12:].strip():
                        report["commands"].append(f"[{file}] Armadilha YAML na description (dois pontos seguidos de espaço).")
                        
    # 3. Hooks
    hooks_dir = os.path.join(base_dir, "hooks")
    if os.path.exists(hooks_dir):
        for file in os.listdir(hooks_dir):
            path = os.path.join(hooks_dir, file)
            if file.endswith(".json"):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        json.load(f)
                except Exception as e:
                    report["hooks"].append(f"[{file}] JSON inválido: {str(e)}")
            elif file.endswith(".js"):
                try:
                    subprocess.run(["node", "-c", path], check=True, capture_output=True, text=True)
                except subprocess.CalledProcessError as e:
                    report["hooks"].append(f"[{file}] Erro sintático JS: {e.stderr.strip()}")
                    
    # 4. Skills
    skills_dir = os.path.join(base_dir, "skills")
    if os.path.exists(skills_dir):
        for skill_folder in os.listdir(skills_dir):
            skill_path = os.path.join(skills_dir, skill_folder, "SKILL.md")
            if os.path.exists(skill_path):
                with open(skill_path, "r", encoding="utf-8") as f:
                    content = f.read()
                for line in content.split("\n"):
                    if line.startswith("description:"):
                        if ": " in line[12:].strip():
                            report["skills"].append(f"[{skill_folder}] Armadilha YAML na description.")

    # 5. Vazamentos
    patterns = {
        "AWS_AKIA": r"AKIA[0-9A-Z]{16}",
        "PrivateKey": r"-----BEGIN .* PRIVATE KEY-----",
        "GenericSecret": r"(?i)(api_key|secret|password|token)[\"']?\s*[:=]\s*[\"'][a-zA-Z0-9\-_]{16,}[\"']"
    }
    
    for root, _, files in os.walk(base_dir):
        if ".git" in root or "node_modules" in root or ".venv" in root or "mcp-servers" in root:
            continue
        for file in files:
            if not file.endswith((".md", ".js", ".json", ".py")):
                continue
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    for name, pat in patterns.items():
                        if re.search(pat, content):
                            report["vazamentos"].append(f"{name} encontrado em {os.path.relpath(path, base_dir)}")
            except:
                pass
                
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    args = get_args()
    if not os.path.exists(args.raiz):
        print(json.dumps({"error": "Caminho raiz não encontrado"}))
        exit(1)
    audit_base(args.raiz)
