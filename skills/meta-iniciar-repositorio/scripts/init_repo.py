"""init_repo.py — inicializacao completa de um repositorio Sarak.

    python init_repo.py --target <caminho> [--binding typescript] [--escopo acme]
                        [--modulos catalogo conector] [--name "Meu Sistema"]
                        [--git-init] [--time-provider clockify --time-project-id 123]

Monta, nesta ordem:

    1. git init (opcional, --git-init)
    2. projeto modular: ferramentas/, packages/, adapters/, src/, modulos/_template
       + a doutrina em specs/arquitetura/ e specs/adr/  (so com --binding)
    3. specs/ do fluxo SDD (00-*, _templates, plan/, adr/)
    4. a base da linguagem em specs/arquitetura/00-base-<binding>.md
    5. os primeiros modulos                              (so com --modulos)
    6. .agents/ + gerador de indice + hook de pre-commit
    7. verificacao: gate --todos

NAO commita e NAO cria remoto: isso e HITL, e fica com a skill (git-commit-inicial).
Sem --binding, roda no modo antigo — so specs e .agents.

Regras (CLAUDE.md): uma responsabilidade por funcao, zero hardcoded de caminho do template
(resolvido em tempo de execucao a partir deste arquivo), nunca sobrescreve trabalho alheio.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

BINDINGS = ("typescript", "javascript", "python")
SUBPASTAS_AGENTS = ("skills", "commands", "agents", "hooks")

GERADOR_INDICE = '''"""gerar_indice.py — catalogo da inteligencia local (.agents). Gerado pelo init_repo do Sarak."""
import os
import re
from pathlib import Path


def extrair_description(skill_md_path: Path) -> str:
    """Le o campo `description` do frontmatter de um SKILL.md."""
    try:
        with open(skill_md_path, "r", encoding="utf-8") as arquivo:
            match = re.search(r'^description:\\s*(.+)$', arquivo.read(), re.MULTILINE)
            return match.group(1).strip() if match else "Descricao nao encontrada."
    except OSError:
        return "Descricao nao encontrada."


def main() -> None:
    base_dir = Path(__file__).parent
    lines = ["# Catalogo de Inteligencia Local (.agents)\\n",
             "Arquivo auto-gerado. Lista as regras de negocio deste projeto para as IAs.\\n",
             "## Skills\\n"]

    skills_dir = base_dir / "skills"
    if skills_dir.exists():
        for skill_folder in sorted(os.listdir(skills_dir)):
            skill_md = skills_dir / skill_folder / "SKILL.md"
            if skill_md.exists():
                desc = extrair_description(skill_md)
                lines.append(f"- **{skill_folder}**: {desc}\\n  - *Caminho*: `.agents/skills/{skill_folder}/SKILL.md`\\n")

    lines.append("\\n## Comandos Customizados\\n")
    commands_dir = base_dir / "commands"
    if commands_dir.exists():
        for cmd_file in sorted(os.listdir(commands_dir)):
            if cmd_file.endswith(".md"):
                lines.append(f"- **/{cmd_file[:-3]}**: `.agents/commands/{cmd_file}`\\n")

    lines.append("\\n## Subagentes\\n")
    agents_dir = base_dir / "agents"
    if agents_dir.exists():
        for agent_file in sorted(os.listdir(agents_dir)):
            if agent_file.endswith(".md"):
                lines.append(f"- **{agent_file[:-3]}**: `.agents/agents/{agent_file}`\\n")

    (base_dir / "index.md").write_text("\\n".join(lines), encoding="utf-8")
    print("[OK] Indice gerado em .agents/index.md")

if __name__ == "__main__":
    main()
'''

HOOK_PRE_COMMIT = """#!/bin/sh
# --- Sarak Git Hook (Pre-Commit) ---
if command -v python >/dev/null 2>&1; then PY=python; else PY=python3; fi

echo "[Sarak] Verificando vazamento de segredos no staged..."
"$PY" .githooks/verificar_commit.py --raiz .
if [ "$?" -ne 0 ]; then
  echo ""
  echo "COMMIT BLOQUEADO - segredo ou arquivo sensivel detectado no staged."
  echo "   Corrija: mova o segredo para .env (e adicione ao .gitignore) e re-stage."
  exit 1
fi

if [ -f .agents/gerar_indice.py ]; then
  echo "[Sarak] Atualizando indice local de agentes..."
  "$PY" .agents/gerar_indice.py
  git add .agents/index.md
fi

exit 0
"""


def get_args():
    parser = argparse.ArgumentParser(description="Inicializa um repositorio Sarak completo.")
    parser.add_argument("--target", required=True, help="Caminho do repositorio-alvo.")
    parser.add_argument("--name", default="Sistema Sarak", help="Nome do sistema")
    parser.add_argument("--binding", choices=BINDINGS, help="Binding do template de modulos")
    parser.add_argument("--escopo", help="Escopo dos packages (ex: acme)")
    parser.add_argument("--modulos", nargs="*", default=[], help="Primeiros modulos a criar")
    parser.add_argument("--git-init", action="store_true", help="Roda git init se nao houver .git")
    parser.add_argument("--forcar", action="store_true", help="Sobrescreve arquivos de raiz existentes")
    parser.add_argument("--time-provider", help="Provedor de apontamento de horas (ex: clockify)")
    parser.add_argument("--time-project-id", help="ID do projeto no provedor de horas")
    return parser.parse_args()


def raiz_da_base() -> Path:
    """Raiz da base Sarak, deduzida deste arquivo. Funciona no repo e no cache do plugin."""
    return Path(__file__).parent.parent.parent.parent.resolve()


def caminho_do_template(xskills_root: Path) -> Path:
    """O template de modulos vive dentro de specs/ — e o unico topo que o sync_ide espelha."""
    return xskills_root / "specs" / "_estrutura_modulos"


def rodar(rotulo: str, comando: list, pasta: Path) -> bool:
    """Executa um comando externo e reporta. Ferramenta ausente e AVISO, nao excecao."""
    if shutil.which(comando[0]) is None:
        print(f"[AVISO] '{comando[0]}' nao encontrado - {rotulo} pulado.")
        return False
    resultado = subprocess.run(comando, cwd=str(pasta), check=False)
    marca = "OK" if resultado.returncode == 0 else "FALHA"
    print(f"[{marca}] {rotulo}")
    return resultado.returncode == 0


def instalar_projeto_modular(target: Path, template: Path, args) -> bool:
    """Passo 2: ferramentas, packages, adapters, molde de modulo e a doutrina em specs/."""
    criar_projeto = template / "ferramentas" / "criar-projeto.mjs"
    if not criar_projeto.exists():
        print(f"[ERRO] Template de modulos nao encontrado em {template}")
        return False
    comando = ["node", str(criar_projeto), ".", "--binding", args.binding]
    if args.escopo:
        comando += ["--escopo", args.escopo]
    if args.forcar:
        comando.append("--forcar")
    return rodar(f"Projeto modular ({args.binding})", comando, target)


def instalar_specs(target: Path, xskills_root: Path, nome: str) -> None:
    """Passo 3: o fluxo SDD. Mescla com specs/arquitetura e specs/adr ja criados pelo passo 2."""
    origem = xskills_root / "specs" / "_estrutura_base"
    if not origem.exists():
        print(f"[AVISO] Estrutura de specs nao encontrada em {origem}")
        return
    destino = target / "specs"
    destino.mkdir(exist_ok=True)
    shutil.copytree(origem, destino, dirs_exist_ok=True)
    print("[OK] Estrutura de specs (SDD) injetada.")

    index_spec = destino / "INDEX.md"
    if index_spec.exists():
        conteudo = index_spec.read_text(encoding="utf-8")
        index_spec.write_text(
            conteudo.replace("# 🧭 Mapa de Especificações (Bússola da IA)", f"# 🧭 Mapa de Especificações: {nome}"),
            encoding="utf-8",
        )


def instalar_base_de_linguagem(target: Path, xskills_root: Path, binding: str, nome: str) -> None:
    """Passo 4: a prosa da linguagem, ao lado das leis, em specs/arquitetura/."""
    origem = xskills_root / "specs" / "_bases_arquiteturais" / f"00-base-{binding}.md"
    if not origem.exists():
        print(f"[AVISO] Base arquitetural nao encontrada para o binding: {binding}")
        return
    pasta = target / "specs" / "arquitetura"
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / origem.name
    conteudo = origem.read_text(encoding="utf-8")
    rotulo = binding.capitalize() if binding != "typescript" else "TypeScript"
    conteudo = conteudo.replace(
        f'titulo: "Arquitetura Base: {rotulo}"', f'titulo: "Arquitetura: {nome} ({rotulo})"'
    )
    destino.write_text(conteudo, encoding="utf-8")
    print(f"[OK] Base arquitetural injetada: {destino.name}")


def criar_modulos(target: Path, template: Path, modulos: list, binding: str) -> None:
    """Passo 5: os primeiros modulos, um por vez. O conector vai por ultimo — ele agrega os outros."""
    criar_modulo = target / "ferramentas" / "criar-modulo.mjs"
    if not criar_modulo.exists():
        criar_modulo = template / "ferramentas" / "criar-modulo.mjs"
    ordenados = sorted(modulos, key=lambda m: m == "conector")
    for modulo in ordenados:
        papel = "conector" if modulo == "conector" else "dominio"
        rodar(
            f"Modulo '{modulo}' ({papel})",
            ["node", str(criar_modulo), modulo, "--binding", binding, "--papel", papel],
            target,
        )


def instalar_estrutura_agents(target: Path, xskills_root: Path) -> Path:
    """Passo 6a: .agents/ com a meta-create-skill injetada e o gerador de indice."""
    agents_dir = target / ".agents"
    agents_dir.mkdir(exist_ok=True)
    for sub in SUBPASTAS_AGENTS:
        (agents_dir / sub).mkdir(exist_ok=True)

    origem = xskills_root / "skills" / "meta-create-skill"
    destino = agents_dir / "skills" / "meta-create-skill"
    if origem.exists():
        if destino.exists():
            shutil.rmtree(destino)
        shutil.copytree(origem, destino)
        print("[OK] Skill 'meta-create-skill' injetada localmente.")
    else:
        print(f"[AVISO] meta-create-skill nao encontrada em {origem}.")

    (agents_dir / "gerar_indice.py").write_text(GERADOR_INDICE, encoding="utf-8")
    print("[OK] Estrutura .agents/ criada.")
    return agents_dir


def configurar_time_tracking(agents_dir: Path, provedor: str, projeto_id: str) -> str:
    """Grava a config de apontamento de horas e devolve o reforco para o CLAUDE.md."""
    config = {"time_tracking": {"provider": provedor, "project_id": projeto_id}}
    (agents_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    print("[OK] Time Tracking configurado em .agents/config.json")
    return (
        "> **Regra de Ouro (Time Tracking):** Este projeto possui apontamento de horas. SEMPRE inicie o "
        "cronometro via MCP (skill `time-tracking`) em background *antes* de executar tarefas.\n"
    )


def escrever_entrypoint(target: Path, reforco: str, modular: bool) -> None:
    """Passo 6b: o ponteiro sempre-ativo do CLAUDE.md do projeto-alvo."""
    texto = (
        "\n\n> **Atencao (IA):** Sou um projeto Sarak. Antes de codificar, leia as regras de negocio "
        "locais em `.agents/index.md`.\n"
    )
    if modular:
        texto += (
            "> **Arquitetura de modulos:** a lei esta em `specs/arquitetura/` (`04-regras.md` e o catalogo "
            "normativo) e e cobrada por maquina: `node ferramentas/gate/validar.mjs --todos`. "
            "Modulo novo so pela skill `code-modulo` — nunca copiando pasta a mao.\n"
        )
    texto += reforco
    claude_md = target / "CLAUDE.md"
    with open(claude_md, "a" if claude_md.exists() else "w", encoding="utf-8") as arquivo:
        arquivo.write(texto)
    print("[OK] Entrypoint CLAUDE.md atualizado.")


def instalar_hooks_git(target: Path, xskills_root: Path) -> None:
    """Passo 6c: gate de segredos + auto-indexador, amarrados via core.hooksPath."""
    if not (target / ".git").exists():
        print("[AVISO] Sem .git - hooks nao amarrados. Use --git-init ou rode 'git init'.")
        return
    githooks = target / ".githooks"
    githooks.mkdir(exist_ok=True)

    origem = xskills_root / "skills" / "git-verificacao-commit" / "scripts"
    if origem.exists():
        shutil.copy2(origem / "verificar_commit.py", githooks / "verificar_commit.py")
        shutil.copy2(origem / "config.json", githooks / "config.json")
        print("[OK] Gate de segredos copiado para .githooks/")

    caminho_hook = githooks / "pre-commit"
    caminho_hook.write_text(HOOK_PRE_COMMIT, encoding="utf-8")
    try:
        os.chmod(caminho_hook, 0o755)
    except OSError as erro:
        print(f"[AVISO] Nao foi possivel marcar o hook como executavel: {erro}")

    rodar("git config core.hooksPath", ["git", "config", "core.hooksPath", ".githooks"], target)


def verificar(target: Path) -> None:
    """Passo 7: o gate global. Reprovar aqui e informacao, nao acidente."""
    validar = target / "ferramentas" / "gate" / "validar.mjs"
    if not validar.exists():
        return
    rodar("Gate de conformidade (--todos)", ["node", str(validar), "--todos"], target)


def proximos_passos(modular: bool) -> None:
    print("\n--- Repositorio Sarak-Ready! ---")
    print("Proximos passos (HITL - nao automatizados de proposito):")
    if modular:
        print("  1. preencher o .env da raiz com os valores reais")
        print("  2. preencher specs/00-contexto.md (primeira plan do repositorio)")
        print("  3. registrar em specs/adr/ as decisoes do projeto (idioma, schema, ui.modo)")
    print("  4. primeiro commit + remoto: skill 'git-commit-inicial'")


def main() -> int:
    args = get_args()
    target = Path(args.target).resolve()
    if not target.exists():
        print(f"[ERRO] Diretorio alvo nao existe: {target}")
        return 1

    xskills_root = raiz_da_base()
    template = caminho_do_template(xskills_root)
    print(f"\n--- Scaffold Sarak em: {target} ---")

    if args.git_init and not (target / ".git").exists():
        rodar("git init", ["git", "init"], target)

    modular = False
    if args.binding:
        modular = instalar_projeto_modular(target, template, args)
        if not modular:
            print("[ERRO] Projeto modular nao instalado - abortando antes de misturar estruturas.")
            return 1

    instalar_specs(target, xskills_root, args.name)
    if args.binding:
        instalar_base_de_linguagem(target, xskills_root, args.binding, args.name)
    if args.binding and args.modulos:
        criar_modulos(target, template, args.modulos, args.binding)

    agents_dir = instalar_estrutura_agents(target, xskills_root)
    reforco = ""
    if args.time_provider and args.time_project_id:
        reforco = configurar_time_tracking(agents_dir, args.time_provider, args.time_project_id)
    escrever_entrypoint(target, reforco, modular)
    instalar_hooks_git(target, xskills_root)

    if modular:
        verificar(target)
    proximos_passos(modular)
    return 0


if __name__ == "__main__":
    sys.exit(main())
