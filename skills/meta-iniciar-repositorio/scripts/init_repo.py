"""init_repo.py — inicializacao completa de um repositorio Sarak.

    python init_repo.py --target <caminho> [--binding typescript] [--escopo acme]
                        [--modulos catalogo conector] [--name "Meu Sistema"]
                        [--git-init]
    python init_repo.py --autoteste   prova compor_pre_commit com fixtures em memoria (sem --target)

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

# A linha que o template instala em `.githooks/pre-commit` (raiz/.githooks/pre-commit dos tres
# bindings — byte a byte igual, conforme ferramentas/verificar-commit.mjs). Constante aqui porque
# `compor_pre_commit` as vezes precisa dela sem ter o arquivo do template em mao (estado C: so o
# nosso hook existe, nada para extrair).
LINHA_HOOK_TEMPLATE = "node ferramentas/verificar-commit.mjs pre-commit || exit 1"
MARCADOR_HOOK_NOSSO = "verificar_commit.py"
MARCADOR_HOOK_TEMPLATE = "verificar-commit.mjs"


def _sem_shebang(texto: str) -> str:
    """Remove a primeira linha se for `#!...` — os dois hooks (nosso e do template) tem a mesma."""
    linhas = texto.splitlines(keepends=True)
    if linhas and linhas[0].startswith("#!"):
        return "".join(linhas[1:])
    return texto


def _sem_exit0_final(texto: str) -> str:
    """Remove o `exit 0` final (e a linha em branco antes dele), se houver — para nao duplicar
    quando outro trecho for acrescentado depois."""
    semquebra = texto.rstrip("\n")
    if semquebra.endswith("exit 0"):
        semquebra = semquebra[: -len("exit 0")].rstrip("\n")
    return semquebra + "\n" if semquebra else ""


def compor_pre_commit(existente: str | None, nosso: str) -> str:
    """Compoe o `.githooks/pre-commit` do template (gate de conformidade) com o nosso (gate de
    segredos + auto-indice de `.agents/`) — nunca um sobrescrevendo o outro. PURA: nao toca disco,
    o `--autoteste` prova os quatro estados sem escrever arquivo nenhum.

    Ordem: segredo primeiro (fail-closed, e o estagio 0), conformidade depois. Idempotente — se
    `existente` ja tem as duas marcas, devolve sem alterar (rodar duas vezes nao duplica linha).

    Estados:
      (a) existente is None            -> escreve o nosso
      (b) existente so tem o template  -> compoe os dois (nosso primeiro, template depois)
      (c) existente so tem o nosso     -> acrescenta a cadeia do template antes do exit 0
      (d) existente ja tem os dois     -> nao muda nada
    """
    if existente is None:
        return nosso

    tem_nosso = MARCADOR_HOOK_NOSSO in existente
    tem_template = MARCADOR_HOOK_TEMPLATE in existente

    if tem_nosso and tem_template:
        return existente

    corpo_nosso = _sem_exit0_final(_sem_shebang(nosso))

    if tem_template and not tem_nosso:
        corpo_template = _sem_shebang(existente).rstrip("\n")
        return f"#!/bin/sh\n{corpo_nosso}{corpo_template}\n\nexit 0\n"

    corpo_existente = _sem_exit0_final(_sem_shebang(existente)).rstrip("\n")
    return f"#!/bin/sh\n{corpo_existente}\n\n{LINHA_HOOK_TEMPLATE}\n\nexit 0\n"


def _casos_de_autoteste_pre_commit() -> list[dict]:
    """Os quatro estados exigidos pela plan-2.1 (Bloco T), mais o caso de idempotencia."""
    template_isolado = (
        "#!/bin/sh\n"
        "# Sarak - pre-commit (gate de conformidade)\n"
        "node ferramentas/verificar-commit.mjs pre-commit || exit 1\n"
    )
    return [
        {
            "nome": "(a) nao existe -> escreve o nosso, sem alteracao",
            "existente": None,
            "esperado_igual_a": "nosso",
        },
        {
            "nome": "(b) existe so o do template -> compoe os dois, segredo primeiro",
            "existente": template_isolado,
            "esperado_contem_ambos": True,
        },
        {
            "nome": "(c) existe so o nosso -> acrescenta a cadeia do template",
            "existente": HOOK_PRE_COMMIT,
            "esperado_contem_ambos": True,
        },
        {
            "nome": "(d) ja tem os dois -> idempotente, nao muda nada",
            "existente": f"{HOOK_PRE_COMMIT}\n{LINHA_HOOK_TEMPLATE}\n",
            "esperado_igual_a": "existente",
        },
    ]


def rodar_autoteste_pre_commit() -> int:
    """`--autoteste`: prova `compor_pre_commit` com fixtures em memoria, sem tocar disco."""
    falhas = 0
    for caso in _casos_de_autoteste_pre_commit():
        resultado = compor_pre_commit(caso["existente"], HOOK_PRE_COMMIT)
        if caso.get("esperado_igual_a") == "nosso":
            ok = resultado == HOOK_PRE_COMMIT
        elif caso.get("esperado_igual_a") == "existente":
            ok = resultado == caso["existente"]
        else:
            ok = (
                MARCADOR_HOOK_NOSSO in resultado
                and MARCADOR_HOOK_TEMPLATE in resultado
                and resultado.index(MARCADOR_HOOK_NOSSO) < resultado.index(MARCADOR_HOOK_TEMPLATE)
                and resultado.startswith("#!/bin/sh\n")
                and resultado.rstrip("\n").endswith("exit 0")
            )
        print(f"  {'ok   ' if ok else 'FALHA'} {caso['nome']}")
        if not ok:
            falhas += 1

    # Recompor um resultado ja composto tem de devolver o MESMO texto (idempotencia real, nao so o
    # caso "ja tem os dois" isolado): prova que compor(compor(x)) == compor(x) para os estados b e c.
    for rotulo, existente in (
        ("b recomposto", compor_pre_commit(_casos_de_autoteste_pre_commit()[1]["existente"], HOOK_PRE_COMMIT)),
        ("c recomposto", compor_pre_commit(HOOK_PRE_COMMIT, HOOK_PRE_COMMIT)),
    ):
        segunda_vez = compor_pre_commit(existente, HOOK_PRE_COMMIT)
        ok = segunda_vez == existente
        print(f"  {'ok   ' if ok else 'FALHA'} idempotencia: recompor ({rotulo}) nao muda nada")
        if not ok:
            falhas += 1

    total = len(_casos_de_autoteste_pre_commit()) + 2
    print(f"\nautoteste (compor_pre_commit): {total - falhas}/{total} ok")
    return 0 if falhas == 0 else 1


def get_args():
    parser = argparse.ArgumentParser(description="Inicializa um repositorio Sarak completo.")
    parser.add_argument("--target", required=True, help="Caminho do repositorio-alvo.")
    parser.add_argument("--name", default="Sistema Sarak", help="Nome do sistema")
    parser.add_argument("--binding", choices=BINDINGS, help="Binding do template de modulos")
    parser.add_argument("--escopo", help="Escopo dos packages (ex: acme)")
    parser.add_argument("--modulos", nargs="*", default=[], help="Primeiros modulos a criar")
    parser.add_argument("--git-init", action="store_true", help="Roda git init se nao houver .git")
    parser.add_argument("--forcar", action="store_true", help="Sobrescreve arquivos de raiz existentes")
    return parser.parse_args()


def _motivo_alvo_perigoso(target: Path) -> str | None:
    """`None` quando o alvo e seguro para criar; senao, o motivo para a mensagem de erro nomear
    (plan-2.2.md Bloco AA — o mesmo cuidado que a skill ja exige na entrevista HITL: nunca raiz do
    SO, nunca HOME, so pasta especifica confirmada)."""
    if target.parent == target:
        return "raiz do sistema de arquivos"
    if target == Path.home():
        return "pasta HOME do usuario"
    return None


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


def escrever_entrypoint(target: Path, modular: bool) -> None:
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
    claude_md = target / "CLAUDE.md"
    with open(claude_md, "a" if claude_md.exists() else "w", encoding="utf-8") as arquivo:
        arquivo.write(texto)
    print("[OK] Entrypoint CLAUDE.md atualizado.")


def _marcar_executavel(caminho: Path) -> None:
    """`--chmod=+x` cobre os DOIS hooks (pre-commit e pre-push) — o segundo tem o mesmo problema
    no Windows com `core.filemode=false`."""
    try:
        os.chmod(caminho, 0o755)
    except OSError as erro:
        print(f"[AVISO] Nao foi possivel marcar '{caminho.name}' como executavel: {erro}")


def instalar_hooks_git(target: Path, xskills_root: Path) -> None:
    """Passo 6c: gate de segredos + auto-indexador, COMPOSTO com o pre-commit do template via
    `compor_pre_commit` (nunca um sobrescrevendo o outro), amarrados via core.hooksPath."""
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

    caminho_pre_commit = githooks / "pre-commit"
    existente = caminho_pre_commit.read_text(encoding="utf-8") if caminho_pre_commit.exists() else None
    composto = compor_pre_commit(existente, HOOK_PRE_COMMIT)
    caminho_pre_commit.write_text(composto, encoding="utf-8")
    _marcar_executavel(caminho_pre_commit)
    rotulo = "composto (segredos + conformidade do template)" if existente is not None and MARCADOR_HOOK_TEMPLATE in existente else "gravado"
    print(f"[OK] .githooks/pre-commit {rotulo}.")

    caminho_pre_push = githooks / "pre-push"
    if caminho_pre_push.exists():
        _marcar_executavel(caminho_pre_push)

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
    if "--autoteste" in sys.argv[1:]:
        return rodar_autoteste_pre_commit()

    args = get_args()
    target = Path(args.target).resolve()

    perigo = _motivo_alvo_perigoso(target)
    if perigo is not None:
        print(f"[ERRO] Alvo recusado ({perigo}): {target}. Confirme um caminho especifico, nunca este.")
        return 1

    if not target.exists():
        try:
            target.mkdir(parents=True)
        except OSError as erro:
            print(f"[ERRO] Nao foi possivel criar o diretorio alvo {target}: {erro}")
            return 1
        print(f"[OK] Diretorio alvo criado: {target}")

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

    instalar_estrutura_agents(target, xskills_root)
    escrever_entrypoint(target, modular)
    instalar_hooks_git(target, xskills_root)

    if modular:
        verificar(target)
    proximos_passos(modular)
    return 0


if __name__ == "__main__":
    sys.exit(main())
