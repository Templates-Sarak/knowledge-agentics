import os
import sys
import json
import shutil
import argparse
from pathlib import Path

def get_args():
    parser = argparse.ArgumentParser(description="Instalador Sarak Ecosystem (Sync IDEs)")
    parser.add_argument("--target", choices=["antigravity", "claude", "all"], required=True, 
                        help="Provedor de IA alvo para instalação do Sarak")
    return parser.parse_args()

def sync_antigravity(xskills_root):
    print("\n--- Sincronizando com Antigravity ---")
    home = Path.home()
    plugins_dir = home / ".gemini" / "config" / "plugins"
    
    if not plugins_dir.exists():
        print(f"[ERRO] Diretório de plugins do Antigravity não encontrado: {plugins_dir}")
        return
        
    sarak_plugin_dir = plugins_dir / "sarak"
    sarak_plugin_dir.mkdir(parents=True, exist_ok=True)
    
    # Cria o manifesto do plugin
    manifest = {
        "name": "sarak",
        "description": "Ecossistema de Inteligência Sarak (X-Skills)"
    }
    with open(sarak_plugin_dir / "plugin.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        
    # Copia a pasta skills
    source_skills = xskills_root / "skills"
    dest_skills = sarak_plugin_dir / "skills"
    if dest_skills.exists():
        shutil.rmtree(dest_skills)
        
    # Copia a pasta agents
    source_agents = xskills_root / "agents"
    dest_agents = sarak_plugin_dir / "agents"
    if dest_agents.exists():
        shutil.rmtree(dest_agents)
        
    try:
        shutil.copytree(source_skills, dest_skills)
        print(f"[OK] Skills instaladas em {dest_skills}")
        
        if source_agents.exists():
            shutil.copytree(source_agents, dest_agents)
            print(f"[OK] Subagentes instalados em {dest_agents}")
    except Exception as e:
        print(f"[ERRO] Falha ao copiar arquivos para o Antigravity: {e}")
        
    # Roteamento estático dos comandos para injetar em User Rules
    commands_dir = xskills_root / "commands"
    rules_text = "Sarak Routing Table (Insira nas suas User Rules globais do Antigravity):\n\n"
    rules_text += "Sempre que o usuário iniciar o prompt com um dos comandos abaixo, leia silenciosamente o arquivo absoluto correspondente antes de executar qualquer plano:\n"
    
    if commands_dir.exists():
        for file in os.listdir(commands_dir):
            if file.endswith(".md"):
                cmd_name = "/" + file[:-3]
                abs_path = str(commands_dir / file).replace('\\', '/')
                rules_text += f"- Se o comando for '{cmd_name}': Leia {abs_path}\n"
                
    output_rules = xskills_root / "plugin" / "antigravity_rules.txt"
    with open(output_rules, "w", encoding="utf-8") as f:
        f.write(rules_text)
        
    print(f"[OK] Regras de comandos (Antigravity Routing) geradas em: {output_rules}")
    print("[INFO] Copie o conteúdo de 'antigravity_rules.txt' e cole nas 'User Rules' da IDE Antigravity para habilitar os slash commands.")

def sync_claude(xskills_root):
    print("\n--- Sincronizando com Claude Code ---")
    
    # Roteamento dinâmico dos comandos
    commands_dir = xskills_root / "commands"
    routing_table = "Sarak Routing Table (Insira no seu Custom Instruction global do Claude):\n"
    routing_table += "O diretório principal de suas skills é: " + str(xskills_root / "skills").replace('\\', '/') + "\n\n"
    routing_table += "Sempre que o usuário digitar um dos comandos abaixo, leia silenciosamente o arquivo markdown absoluto correspondente e siga as instruções contidas nele antes de realizar qualquer outra ação:\n"
    
    if commands_dir.exists():
        for file in os.listdir(commands_dir):
            if file.endswith(".md"):
                cmd_name = "/" + file[:-3]
                abs_path = str(commands_dir / file).replace('\\', '/')
                routing_table += f"- Se o usuário digitar '{cmd_name}': Leia {abs_path}\n"
                
    output_instructions = xskills_root / "plugin" / "claude_instructions.txt"
    with open(output_instructions, "w", encoding="utf-8") as f:
        f.write(routing_table)
        
    print(f"[OK] Tabela de roteamento de comandos gerada em: {output_instructions}")
    print("[INFO] Para o Claude, copie o conteúdo desse arquivo de texto e cole nas 'Global Custom Instructions' da sua conta/terminal.")

def main():
    args = get_args()
    
    # Diretório raiz do X-Skills (assumindo que o script roda de X-Skills/plugin/)
    xskills_root = Path(__file__).parent.parent.resolve()
    
    if not (xskills_root / "skills").exists():
        print(f"[ERRO] Diretório de skills não encontrado na raiz: {xskills_root}")
        sys.exit(1)
        
    if args.target in ["antigravity", "all"]:
        sync_antigravity(xskills_root)
        
    if args.target in ["claude", "all"]:
        sync_claude(xskills_root)
        
    print("\nSincronização global concluída!")

if __name__ == "__main__":
    main()
