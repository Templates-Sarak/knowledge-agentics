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
    print("\n--- Sincronizando Core Local do Antigravity ---")
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

def generate_routing_table(xskills_root):
    print("\n--- Gerando Tabela de Roteamento Unificada ---")
    commands_dir = xskills_root / "commands"
    skills_dir = xskills_root / "skills"
    
    table = "# Sarak Global Routing Table\n\n"
    table += "> **Atenção IAs:** Este arquivo é o mapa central do ecossistema Sarak. "
    table += "Ele lista os comandos imperativos (Iniciados com `/`) e as Skills Orgânicas disponíveis.\n\n"
    
    table += "## 1. Comandos (Slash Commands)\n"
    table += "Quando o usuário enviar qualquer comando listado abaixo, leia o arquivo correspondente antes de agir.\n"
    if commands_dir.exists():
        for file in sorted(os.listdir(commands_dir)):
            if file.endswith(".md"):
                cmd_name = "/" + file[:-3]
                abs_path = str(commands_dir / file).replace('\\', '/')
                table += f"- **{cmd_name}**: `{abs_path}`\n"
                
    table += "\n## 2. Skills Orgânicas\n"
    table += "Quando o usuário solicitar o uso de uma destas skills (ou você julgar necessário pelo contexto), "
    table += "leia o arquivo SKILL.md correspondente para carregar o seu workflow.\n"
    if skills_dir.exists():
        for skill_folder in sorted(os.listdir(skills_dir)):
            skill_md = skills_dir / skill_folder / "SKILL.md"
            if skill_md.exists():
                abs_path = str(skill_md).replace('\\', '/')
                table += f"- **{skill_folder}**: `{abs_path}`\n"
                
    output_file = xskills_root / "plugin" / "sarak_routing_table.md"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(table)
        
    print(f"[OK] Tabela unificada gerada em: {output_file}")
    
    print("\n[INSTRUÇÃO ÚNICA DE CONFIGURAÇÃO (SETUP)]")
    print("Cole a frase abaixo nas Regras Globais das suas IDEs (Antigravity e Claude) UMA ÚNICA VEZ:")
    print("-" * 70)
    print(f"Sempre que o usuário enviar um comando iniciando com '/', leia silenciosamente o arquivo de rotas centralizado em {str(output_file).replace(chr(92), '/')} para descobrir qual arquivo absoluto executar.")
    print("-" * 70)

def main():
    args = get_args()
    
    xskills_root = Path(__file__).parent.parent.resolve()
    
    if not (xskills_root / "skills").exists():
        print(f"[ERRO] Diretório de skills não encontrado na raiz: {xskills_root}")
        sys.exit(1)
        
    if args.target in ["antigravity", "all"]:
        sync_antigravity(xskills_root)
        
    # A tabela é gerada de forma unificada para ambas as IDEs
    generate_routing_table(xskills_root)
        
    print("\nSincronização global concluída com sucesso!")

if __name__ == "__main__":
    main()
