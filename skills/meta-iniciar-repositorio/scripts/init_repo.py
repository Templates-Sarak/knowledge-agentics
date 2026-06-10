import os
import sys
import shutil
import argparse
from pathlib import Path

def get_args():
    parser = argparse.ArgumentParser(description="Inicializa Sarak local em um repositório-alvo.")
    parser.add_argument("--target", required=True, help="Caminho do repositório-alvo.")
    parser.add_argument("--langs", nargs='*', help="Linguagens da arquitetura (ex: python typescript go java)", default=[])
    parser.add_argument("--name", help="Nome do sistema", default="Sistema Sarak")
    return parser.parse_args()

def main():
    args = get_args()
    target_path = Path(args.target).resolve()
    
    if not target_path.exists():
        print(f"[ERRO] Diretório alvo não existe: {target_path}")
        sys.exit(1)
        
    print(f"\n--- Iniciando Scaffold Sarak em: {target_path} ---")
    
    agents_dir = target_path / ".agents"
    agents_dir.mkdir(exist_ok=True)
    
    # 1. Cria subpastas
    for sub in ["skills", "commands", "agents", "hooks"]:
        (agents_dir / sub).mkdir(exist_ok=True)
    print("[OK] Estrutura de diretórios criada.")
    
    xskills_root = Path(__file__).parent.parent.parent.parent.resolve()
    
    # 2. Cópia da meta-create-skill
    source_create_skill = xskills_root / "skills" / "meta-create-skill"
    dest_create_skill = agents_dir / "skills" / "meta-create-skill"
    
    if source_create_skill.exists():
        if dest_create_skill.exists():
            shutil.rmtree(dest_create_skill)
        shutil.copytree(source_create_skill, dest_create_skill)
        print("[OK] Skill 'meta-create-skill' injetada localmente.")
    else:
        print(f"[AVISO] Não foi possível encontrar a meta-create-skill na base global ({source_create_skill}).")

    # 3. Gerador de Índice (gerar_indice.py)
    gerador_code = """import os
import re
from pathlib import Path

def extrair_description(skill_md_path):
    try:
        with open(skill_md_path, 'r', encoding='utf-8') as f:
            content = f.read()
            match = re.search(r'^description:\\s*(.+)$', content, re.MULTILINE)
            if match:
                return match.group(1).strip()
    except Exception:
        pass
    return "Descrição não encontrada."

def main():
    base_dir = Path(__file__).parent
    skills_dir = base_dir / "skills"
    commands_dir = base_dir / "commands"
    index_file = base_dir / "index.md"
    
    lines = ["# Catálogo de Inteligência Local (.agents)\\n"]
    lines.append("Este arquivo é auto-gerado. Ele lista todas as regras de negócio deste projeto para as IAs.\\n")
    
    lines.append("## Skills\\n")
    if skills_dir.exists():
        for skill_folder in sorted(os.listdir(skills_dir)):
            skill_md = skills_dir / skill_folder / "SKILL.md"
            if skill_md.exists():
                desc = extrair_description(skill_md)
                lines.append(f"- **{skill_folder}**: {desc}\\n  - *Caminho*: `.agents/skills/{skill_folder}/SKILL.md`\\n")
                
    lines.append("\\n## Comandos Customizados\\n")
    if commands_dir.exists():
        for cmd_file in sorted(os.listdir(commands_dir)):
            if cmd_file.endswith(".md"):
                cmd_name = "/" + cmd_file[:-3]
                lines.append(f"- **{cmd_name}**: `.agents/commands/{cmd_file}`\\n")
                
    agents_dir = base_dir / "agents"
    lines.append("\\n## Subagentes\\n")
    if agents_dir.exists():
        for agent_file in sorted(os.listdir(agents_dir)):
            if agent_file.endswith(".md"):
                lines.append(f"- **{agent_file[:-3]}**: `.agents/agents/{agent_file}`\\n")
                
    with open(index_file, 'w', encoding='utf-8') as f:
        f.write("\\n".join(lines))
        
    print("[OK] Índice gerado com sucesso em .agents/index.md")

if __name__ == "__main__":
    main()
"""
    with open(agents_dir / "gerar_indice.py", "w", encoding="utf-8") as f:
        f.write(gerador_code)
    print("[OK] Script gerador_indice.py criado.")

    # 4. Entrypoint CLAUDE.md
    claude_md = target_path / "CLAUDE.md"
    pointer_text = "\n\n> **Atenção (IA):** Sou um projeto Sarak modular. Sempre que atuar aqui, leia as regras de negócio listadas em `.agents/index.md` antes de codificar.\n"
    mode = "a" if claude_md.exists() else "w"
    with open(claude_md, mode, encoding="utf-8") as f:
        f.write(pointer_text)
    print(f"[OK] Entrypoint atualizado ({claude_md.name}).")
    
    # 5. Git Pre-Commit Hook Unificado (Segurança + Auto-Index)
    if (target_path / ".git").exists():
        githooks_dir = target_path / ".githooks"
        githooks_dir.mkdir(exist_ok=True)
        
        # 5.1 Copiar ferramentas de segurança do Sarak
        verificacao_src = xskills_root / "skills" / "git-verificacao-commit" / "scripts"
        if verificacao_src.exists():
            shutil.copy2(verificacao_src / "verificar_commit.py", githooks_dir / "verificar_commit.py")
            shutil.copy2(verificacao_src / "config.json", githooks_dir / "config.json")
            print("[OK] Ferramentas de segurança copiadas para .githooks/")
        
        # 5.2 Criar o hook pre-commit combinado
        pre_commit_path = githooks_dir / "pre-commit"
        hook_script = """#!/bin/sh
# --- Sarak Git Hook (Pre-Commit) ---
if command -v python >/dev/null 2>&1; then PY=python; else PY=python3; fi

# 1. Gate de Segurança (Diff Rápido)
echo "[Sarak] Verificando vazamento de segredos no staged..."
"$PY" .githooks/verificar_commit.py --raiz .
status=$?

if [ "$status" -ne 0 ]; then
  echo ""
  echo "⛔ COMMIT BLOQUEADO — segredo ou arquivo sensível detectado no staged."
  echo "   Corrija: mova o segredo para .env (e adicione ao .gitignore) e re-stage."
  exit 1
fi

# 2. Auto-Indexador da Inteligência Local
echo "[Sarak] Atualizando indice local de agentes..."
"$PY" .agents/gerar_indice.py
git add .agents/index.md

exit 0
"""
        with open(pre_commit_path, "w", encoding="utf-8") as f:
            f.write(hook_script)
            
        try:
            os.chmod(pre_commit_path, 0o755)
        except Exception:
            pass
            
        # 5.3 Ativar o hooksPath no Git local
        import subprocess
        try:
            subprocess.run(["git", "-C", str(target_path), "config", "core.hooksPath", ".githooks"], check=True)
            print("[OK] Git configurado para usar a pasta .githooks/")
        except Exception as e:
            print(f"[AVISO] Não foi possível rodar git config: {e}")
            
    else:
        print("[AVISO] Pasta .git não encontrada. Os hooks de segurança não foram amarrados. Execute 'git init' primeiro se desejar o hook.")
        
    # 6. Montagem da Arquitetura Lego (specs/)
    specs_target_dir = target_path / "specs"
    specs_target_dir.mkdir(exist_ok=True)
    
    # 6.1 Copiar estrutura base
    estrutura_base_src = xskills_root / "specs" / "_estrutura_base"
    if estrutura_base_src.exists():
        shutil.copytree(estrutura_base_src, specs_target_dir, dirs_exist_ok=True)
        print("[OK] Estrutura agnóstica de specs injetada.")
        
        # Injetar o nome do sistema no INDEX.md
        index_spec = specs_target_dir / "INDEX.md"
        if index_spec.exists():
            with open(index_spec, "r", encoding="utf-8") as f:
                content = f.read()
            content = content.replace("# 🧭 Mapa de Especificações (Bússola da IA)", f"# 🧭 Mapa de Especificações: {args.name}")
            with open(index_spec, "w", encoding="utf-8") as f:
                f.write(content)
    
    # 6.2 Copiar as bases de linguagem
    if args.langs:
        arquitetura_target_dir = specs_target_dir / "arquitetura"
        arquitetura_target_dir.mkdir(exist_ok=True)
        bases_src = xskills_root / "specs" / "_bases_arquiteturais"
        
        for lang in args.langs:
            lang_lower = lang.lower()
            base_file = bases_src / f"00-base-{lang_lower}.md"
            if base_file.exists():
                dest_file = arquitetura_target_dir / base_file.name
                shutil.copy2(base_file, dest_file)
                
                # Injetar o nome do sistema no cabeçalho
                with open(dest_file, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                
                if lines and lines[0].startswith("# Arquitetura Base:"):
                    original_lang_title = lines[0].replace("# Arquitetura Base: ", "").strip()
                    lines[0] = f"# Arquitetura: {args.name} ({original_lang_title})\n"
                    with open(dest_file, "w", encoding="utf-8") as f:
                        f.writelines(lines)
                
                print(f"[OK] Arquitetura base injetada: {base_file.name}")
            else:
                print(f"[AVISO] Arquitetura base não encontrada para a linguagem: {lang}")

    print("\n--- Repositório Sarak-Ready! ---")

if __name__ == "__main__":
    main()
