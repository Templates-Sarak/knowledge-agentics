import os
import sys
import json
import shutil
import argparse
from pathlib import Path

# Importa o instalador do ambiente global Sarak
try:
    import setup_env
except ImportError:
    # Caso rode diretamente da raiz ou de outra forma, ajusta o path
    sys.path.append(str(Path(__file__).parent))
    import setup_env

def get_args():
    parser = argparse.ArgumentParser(description="Instalador Sarak Ecosystem (Sync IDEs)")
    parser.add_argument("--target", choices=["antigravity", "claude", "all"], required=True, 
                        help="Provedor de IA alvo para instalação do Sarak")
    return parser.parse_args()

def copy_subdirs(xskills_root, dest_root, subdirs):
    """Espelha cada subpasta da base para dest_root (rmtree + copytree). I/O claro."""
    for name in subdirs:
        source = xskills_root / name
        if not source.exists():
            continue
        dest = dest_root / name
        if dest.exists():
            shutil.rmtree(dest)
        try:
            shutil.copytree(source, dest)
            print(f"[OK] {name}/ espelhado em {dest}")
        except Exception as e:
            print(f"[ERRO] Falha ao copiar {name}/ para {dest_root}: {e}")

def read_plugin_meta(xskills_root):
    """Lê nome do marketplace, nome e versão do plugin a partir dos manifestos do repo."""
    plugin_json = xskills_root / ".claude-plugin" / "plugin.json"
    marketplace_json = xskills_root / ".claude-plugin" / "marketplace.json"
    with open(plugin_json, "r", encoding="utf-8") as f:
        plugin = json.load(f)
    with open(marketplace_json, "r", encoding="utf-8") as f:
        marketplace = json.load(f)
    return marketplace["name"], plugin["name"], plugin["version"]

def sync_claude(xskills_root):
    print("\n--- Sincronizando Cache do Plugin Claude ---")
    home = Path.home()
    plugins_cache = home / ".claude" / "plugins" / "cache"

    if not plugins_cache.exists():
        print(f"[ERRO] Cache de plugins do Claude não encontrado: {plugins_cache}")
        return

    try:
        marketplace_name, plugin_name, version = read_plugin_meta(xskills_root)
    except Exception as e:
        print(f"[ERRO] Falha ao ler manifestos do plugin (.claude-plugin/): {e}")
        return

    dest_root = plugins_cache / marketplace_name / plugin_name / version
    dest_root.mkdir(parents=True, exist_ok=True)

    copy_subdirs(xskills_root, dest_root, ["skills", "agents", "commands", "hooks", "specs"])
    print(f"[OK] Plugin '{plugin_name}' v{version} espelhado no cache do Claude.")
    print("[NOTA] Reinicie a sessão do Claude para o catálogo recarregar as skills novas.")

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

    copy_subdirs(xskills_root, sarak_plugin_dir, ["skills", "agents", "commands", "hooks", "specs"])

def generate_routing_table(xskills_root):
    print("\n--- Gerando Tabela de Roteamento Unificada ---")
    commands_dir = xskills_root / "commands"
    skills_dir = xskills_root / "skills"
    agents_dir = xskills_root / "agents"
    specs_dir = xskills_root / "specs" / "_estrutura_base" / "_templates"
    
    table = "# Sarak Global Routing Table\n\n"
    table += "> **Atenção IAs:** Este arquivo é o mapa central do ecossistema Sarak. "
    table += "Ele lista os comandos imperativos (Iniciados com `/`), as Skills Orgânicas, os Subagentes e Templates.\n\n"
    
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
                
    table += "\n## 3. Subagentes Especializados\n"
    table += "Agentes que podem ser acionados via ferramentas/tasks (ex: code-auditor). Leia o manifesto para descobrir as regras e os papéis.\n"
    if agents_dir.exists():
        for agent_file in sorted(os.listdir(agents_dir)):
            if agent_file.endswith(".md"):
                abs_path = str(agents_dir / agent_file).replace('\\', '/')
                table += f"- **{agent_file[:-3]}**: `{abs_path}`\n"

    table += "\n## 4. Templates de Documentação\n"
    table += "Modelos oficiais que devem ser usados como molde ao gerar documentação (Specs, ADRs, Arquitetura).\n"
    if specs_dir.exists():
        for tpl_file in sorted(os.listdir(specs_dir)):
            if tpl_file.endswith(".md"):
                abs_path = str(specs_dir / tpl_file).replace('\\', '/')
                table += f"- **{tpl_file[:-3]}**: `{abs_path}`\n"

    table += "\n## 5. Variáveis de Ambiente Globais (Agent Context)\n"
    table += "Sempre que uma skill pedir para você rodar ferramentas como Python, Pytest, Eslint, etc., "
    table += "NÃO use os instaladores locais do repositório. Em vez disso, use EXATAMENTE os caminhos absolutos abaixo:\n"
    
    python_path = str(xskills_root / ".venv" / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")).replace('\\', '/')
    node_bin_path = str(xskills_root / "node_modules" / ".bin").replace('\\', '/')
    
    table += f"- **SARAK_PYTHON_VENV**: `{python_path}`\n"
    table += f"- **SARAK_NODE_BIN**: `{node_bin_path}`\n"
    table += f"\n> **Exemplo Prático**: Se a skill disser 'Rode o pytest', você deve rodar: `{python_path} -m pytest .`\n"

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
        
    # Garante que as dependências globais (Python/Node) estão instaladas antes do sync
    setup_env.run_setup(xskills_root)
        
    if args.target in ["antigravity", "all"]:
        sync_antigravity(xskills_root)

    if args.target in ["claude", "all"]:
        sync_claude(xskills_root)

    # A tabela é gerada de forma unificada para ambas as IDEs
    generate_routing_table(xskills_root)
        
    print("\nSincronização global concluída com sucesso!")

if __name__ == "__main__":
    main()
