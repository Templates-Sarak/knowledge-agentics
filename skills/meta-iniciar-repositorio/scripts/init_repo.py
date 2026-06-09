import os
import sys
import shutil
import argparse
from pathlib import Path

def get_args():
    parser = argparse.ArgumentParser(description="Inicializa Sarak local em um repositório-alvo.")
    parser.add_argument("--target", required=True, help="Caminho do repositório-alvo.")
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
    
    # 2. Cópia da meta-create-skill
    xskills_root = Path(__file__).parent.parent.parent.parent.resolve()
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
    
    # 5. Git Pre-Commit Hook
    git_hooks_dir = target_path / ".git" / "hooks"
    if git_hooks_dir.exists():
        pre_commit_path = git_hooks_dir / "pre-commit"
        hook_script = """#!/bin/bash
# Sarak Auto-Index Hook
echo "[Sarak] Atualizando indice local de agentes..."
python .agents/gerar_indice.py
git add .agents/index.md
"""
        # Append or create
        if pre_commit_path.exists():
            with open(pre_commit_path, "a", encoding="utf-8") as f:
                f.write("\n" + hook_script)
        else:
            with open(pre_commit_path, "w", encoding="utf-8") as f:
                f.write(hook_script)
            
        # Tenta dar permissão de execução
        try:
            os.chmod(pre_commit_path, 0o755)
        except Exception:
            pass
        print("[OK] Hook de pre-commit injetado em .git/hooks/pre-commit.")
    else:
        print("[AVISO] Pasta .git/hooks não encontrada. O auto-indexador não foi amarrado ao git commit. Execute 'git init' primeiro se desejar o hook.")
        
    print("\n--- Repositório Sarak-Ready! ---")

if __name__ == "__main__":
    main()
