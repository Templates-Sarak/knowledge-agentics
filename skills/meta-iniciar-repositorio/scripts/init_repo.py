"""init_repo.py — inicializacao completa de um repositorio Sarak.

    python init_repo.py --target <caminho> [--binding typescript] [--scope acme]
                        [--modules catalog:domain hub:connector pagamentos:gateway]
                        [--name "Meu Sistema"] [--git-init] [--register --id meu-sistema]
    python init_repo.py --selftest   prova compose_pre_commit, validate_modules e compose_claude_md
                                      com fixtures em memoria (sem --target)

Cada item de --modules e "<id>:<role>[:artifact]" — o sufixo de papel e OBRIGATORIO (role em
domain|gateway|connector, o vocabulario do proprio manifesto). Sem ele, erro — nunca um papel
adivinhado pelo nome do id. O terceiro token so existe para "domain": presente, o modulo nasce
COM core/engine/core/templates/generated; ausente, nasce sem (a direcao conservadora). Declarar
":artifact" em "gateway"/"connector" reprova — os dois nao geram artefato por arquitetura (agregam
ou traduzem, nunca publicam).

Monta, nesta ordem:

    1. git init (opcional, --git-init)
    2. projeto modular: tools/, packages/, adapters/, src/, modules/_template
       + a doutrina em specs/arquitetura/ e specs/adr/  (so com --binding)
    3. specs/ do fluxo SDD (00-*, _templates, plan/, adr/)
    4. a base da linguagem em specs/arquitetura/00-base-<binding>.md
    5. os primeiros modulos                              (so com --modules)
    6. .agents/ + gerador de indice + entrypoints (AGENTS.md; CLAUDE.md com @AGENTS.md)
       + hook de pre-commit
       + carimbo .sarak/base.json (sempre) e a entrada no mapa.json da base (so com --register)
    7. verificacao: gate --all

NAO commita e NAO cria remoto: isso e HITL, e fica com a skill (git-commit-inicial).
Sem --binding, roda no modo antigo — so specs e .agents.

Regras (padrao-escrita): uma responsabilidade por funcao, zero hardcoded de caminho do template
(resolvido em tempo de execucao a partir deste arquivo), nunca sobrescreve trabalho alheio.
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

import stamp  # mesmo diretorio: carimbo .sarak/base.json + registro no mapa.json da base

BINDINGS = ("typescript", "javascript", "python")
AGENTS_SUBDIRS = ("skills", "commands", "agents", "hooks")
AGENTS_IMPORT_LINE = "@AGENTS.md"

INDEX_GENERATOR = '''"""generate_index.py — catalogo da inteligencia local (.agents). Gerado pelo init_repo do Sarak."""
import os
import re
from pathlib import Path


def extract_description(skill_md_path: Path) -> str:
    """Le o campo `description` do frontmatter de um SKILL.md."""
    try:
        with open(skill_md_path, "r", encoding="utf-8") as file:
            match = re.search(r'^description:\\s*(.+)$', file.read(), re.MULTILINE)
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
                desc = extract_description(skill_md)
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
    print("[OK] Index generated at .agents/index.md")

if __name__ == "__main__":
    main()
'''

HOOK_PRE_COMMIT = """#!/bin/sh
# --- Sarak Git Hook (Pre-Commit) ---
if command -v python >/dev/null 2>&1; then PY=python; else PY=python3; fi

echo "[Sarak] Checking staged files for leaked secrets..."
"$PY" .githooks/verify_commit.py --root .
if [ "$?" -ne 0 ]; then
  echo ""
  echo "COMMIT BLOCKED - secret or sensitive file detected in staged files."
  echo "   Fix: move the secret to .env (and add it to .gitignore), then re-stage."
  exit 1
fi

if [ -f .agents/generate_index.py ]; then
  echo "[Sarak] Updating the local agents index..."
  "$PY" .agents/generate_index.py
  git add .agents/index.md
fi

exit 0
"""

# A linha que o template instala em `.githooks/pre-commit` (raiz/.githooks/pre-commit dos tres
# bindings — byte a byte igual, conforme tools/verify-commit.mjs). Constante aqui porque
# `compose_pre_commit` as vezes precisa dela sem ter o arquivo do template em mao (estado C: so o
# nosso hook existe, nada para extrair).
TEMPLATE_HOOK_LINE = "node tools/verify-commit.mjs pre-commit || exit 1"
OWN_HOOK_SCRIPT = "verify_commit.py"
INDEX_SCRIPT = "generate_index.py"
# Nomes que projetos criados antes da onda 6 do ADR-023 têm instalados. O projeto existente continua
# funcionando com eles (o pre-commit dele os chama) e adota o nome novo sob demanda — nunca por migração
# automática. `compose_pre_commit` reconhece os dois, e o instalador reaproveita o nome que o projeto já usa.
LEGACY_OWN_HOOK_SCRIPT = "verificar_commit.py"
LEGACY_INDEX_SCRIPT = "gerar_indice.py"
OWN_HOOK_MARKERS = (OWN_HOOK_SCRIPT, LEGACY_OWN_HOOK_SCRIPT)
TEMPLATE_HOOK_MARKER = "verify-commit.mjs"


def _strip_shebang(text: str) -> str:
    """Remove a primeira linha se for `#!...` — os dois hooks (nosso e do template) tem a mesma."""
    lines = text.splitlines(keepends=True)
    if lines and lines[0].startswith("#!"):
        return "".join(lines[1:])
    return text


def _strip_final_exit0(text: str) -> str:
    """Remove o `exit 0` final (e a linha em branco antes dele), se houver — para nao duplicar
    quando outro trecho for acrescentado depois."""
    stripped = text.rstrip("\n")
    if stripped.endswith("exit 0"):
        stripped = stripped[: -len("exit 0")].rstrip("\n")
    return stripped + "\n" if stripped else ""


def compose_pre_commit(existing: str | None, ours: str) -> str:
    """Compoe o `.githooks/pre-commit` do template (gate de conformidade) com o nosso (gate de
    segredos + auto-indice de `.agents/`) — nunca um sobrescrevendo o outro. PURA: nao toca disco,
    o `--selftest` prova os quatro estados sem escrever arquivo nenhum.

    Ordem: segredo primeiro (fail-closed, e o estagio 0), conformidade depois. Idempotente — se
    `existente` ja tem as duas marcas, devolve sem alterar (rodar duas vezes nao duplica linha).

    Estados:
      (a) existente is None            -> escreve o nosso
      (b) existente so tem o template  -> compoe os dois (nosso primeiro, template depois)
      (c) existente so tem o nosso     -> acrescenta a cadeia do template antes do exit 0
      (d) existente ja tem os dois     -> nao muda nada
    """
    if existing is None:
        return ours

    has_ours = any(marker in existing for marker in OWN_HOOK_MARKERS)
    has_template = TEMPLATE_HOOK_MARKER in existing

    if has_ours and has_template:
        return existing

    our_body = _strip_final_exit0(_strip_shebang(ours))

    if has_template and not has_ours:
        template_body = _strip_shebang(existing).rstrip("\n")
        return f"#!/bin/sh\n{our_body}{template_body}\n\nexit 0\n"

    existing_body = _strip_final_exit0(_strip_shebang(existing)).rstrip("\n")
    return f"#!/bin/sh\n{existing_body}\n\n{TEMPLATE_HOOK_LINE}\n\nexit 0\n"


def _legacy_hook() -> str:
    """O pre-commit de um projeto criado antes da onda 6 do ADR-023 (os dois nomes antigos)."""
    return HOOK_PRE_COMMIT.replace(OWN_HOOK_SCRIPT, LEGACY_OWN_HOOK_SCRIPT).replace(INDEX_SCRIPT, LEGACY_INDEX_SCRIPT)


def _pre_commit_selftest_cases() -> list[dict]:
    """Os quatro estados exigidos, mais o caso de idempotencia."""
    template_alone = (
        "#!/bin/sh\n"
        "# Sarak - pre-commit (gate de conformidade)\n"
        "node tools/verify-commit.mjs pre-commit || exit 1\n"
    )
    return [
        {
            "name": "(a) does not exist -> writes ours, unchanged",
            "existing": None,
            "expected_equal_to": "ours",
        },
        {
            "name": "(b) only the template hook exists -> composes both, secrets first",
            "existing": template_alone,
            "expected_contains_both": True,
        },
        {
            "name": "(c) only ours exists -> appends the template chain",
            "existing": HOOK_PRE_COMMIT,
            "expected_contains_both": True,
        },
        {
            "name": "(d) already has both -> idempotent, changes nothing",
            "existing": f"{HOOK_PRE_COMMIT}\n{TEMPLATE_HOOK_LINE}\n",
            "expected_equal_to": "existing",
        },
        {
            "name": "(e) existing project, legacy script name + template -> recognized, changes nothing",
            "existing": f"{_legacy_hook()}\n{TEMPLATE_HOOK_LINE}\n",
            "expected_equal_to": "existing",
        },
        {
            "name": "(f) existing project, only the legacy hook -> appends the template chain, keeps the legacy name",
            "existing": _legacy_hook(),
            "expected_markers": (LEGACY_OWN_HOOK_SCRIPT, TEMPLATE_HOOK_MARKER),
        },
    ]


def run_pre_commit_selftest() -> int:
    """`--selftest`: prova `compose_pre_commit` com fixtures em memoria, sem tocar disco."""
    failures = 0
    for case in _pre_commit_selftest_cases():
        result = compose_pre_commit(case["existing"], HOOK_PRE_COMMIT)
        if case.get("expected_equal_to") == "ours":
            ok = result == HOOK_PRE_COMMIT
        elif case.get("expected_equal_to") == "existing":
            ok = result == case["existing"]
        elif "expected_markers" in case:
            ok = all(marker in result for marker in case["expected_markers"]) and result.rstrip("\n").endswith("exit 0")
        else:
            ok = (
                OWN_HOOK_SCRIPT in result
                and TEMPLATE_HOOK_MARKER in result
                and result.index(OWN_HOOK_SCRIPT) < result.index(TEMPLATE_HOOK_MARKER)
                and result.startswith("#!/bin/sh\n")
                and result.rstrip("\n").endswith("exit 0")
            )
        print(f"  {'ok   ' if ok else 'FAIL'} {case['name']}")
        if not ok:
            failures += 1

    # Recompor um resultado ja composto tem de devolver o MESMO texto (idempotencia real, nao so o
    # caso "ja tem os dois" isolado): prova que compor(compor(x)) == compor(x) para os estados b e c.
    for label, existing in (
        ("b recomposed", compose_pre_commit(_pre_commit_selftest_cases()[1]["existing"], HOOK_PRE_COMMIT)),
        ("c recomposed", compose_pre_commit(HOOK_PRE_COMMIT, HOOK_PRE_COMMIT)),
    ):
        second_time = compose_pre_commit(existing, HOOK_PRE_COMMIT)
        ok = second_time == existing
        print(f"  {'ok   ' if ok else 'FAIL'} idempotency: recomposing ({label}) changes nothing")
        if not ok:
            failures += 1

    total = len(_pre_commit_selftest_cases()) + 2
    print(f"\nselftest (compose_pre_commit): {total - failures}/{total} ok")
    return 0 if failures == 0 else 1


def get_args():
    parser = argparse.ArgumentParser(description="Initializes a complete Sarak repository.")
    parser.add_argument("--target", required=True, help="Path of the target repository.")
    parser.add_argument("--name", default="Sarak System", help="System name")
    parser.add_argument("--binding", choices=BINDINGS, help="Binding of the module template")
    parser.add_argument("--scope", help="Scope of the packages (e.g. acme)")
    parser.add_argument(
        "--modules", nargs="*", default=[],
        help='First modules, one "<id>:<role>[:artifact]" per item (role required: '
             "domain|gateway|connector)",
    )
    parser.add_argument("--git-init", action="store_true", help="Runs git init when there is no .git")
    parser.add_argument("--force", action="store_true", help="Overwrites existing root files")
    parser.add_argument("--register", action="store_true", help="Registers the system in the base mapa.json")
    parser.add_argument("--id", help="Kebab-case id of the system in the map (required with --register)")
    return parser.parse_args()


def _dangerous_target_reason(target: Path) -> str | None:
    """`None` quando o alvo e seguro para criar; senao, o motivo para a mensagem de erro nomear
    (o mesmo cuidado que a skill ja exige na entrevista HITL: nunca raiz do
    SO, nunca HOME, so pasta especifica confirmada)."""
    if target.parent == target:
        return "filesystem root"
    if target == Path.home():
        return "user HOME folder"
    return None


def base_root() -> Path:
    """Raiz da base Sarak, deduzida deste arquivo. Funciona no repo e no cache do plugin."""
    return Path(__file__).parent.parent.parent.parent.resolve()


def template_path(base_dir: Path) -> Path:
    """O template de modulos vive dentro de specs/ — e o unico topo que o sync_ide espelha."""
    return base_dir / "specs" / "_estrutura_modulos"


def run(label: str, command: list, folder: Path) -> bool:
    """Executa um comando externo e reporta. Ferramenta ausente e AVISO, nao excecao."""
    if shutil.which(command[0]) is None:
        print(f"[WARNING] '{command[0]}' not found - {label} skipped.")
        return False
    result = subprocess.run(command, cwd=str(folder), check=False)
    mark = "OK" if result.returncode == 0 else "FAIL"
    print(f"[{mark}] {label}")
    return result.returncode == 0


def install_modular_project(target: Path, template: Path, args) -> bool:
    """Passo 2: tools, packages, adapters, molde de modulo e a doutrina em specs/."""
    create_project = template / "tools" / "create-project.mjs"
    if not create_project.exists():
        print(f"[ERROR] Module template not found at {template}")
        return False
    # `args.scope`/`args.force` sao a CLI da skill; o repasse abaixo e para a CLI do template
    # (specs/_estrutura_modulos/), tambem em ingles — "--scope"/"--force".
    command = ["node", str(create_project), ".", "--binding", args.binding]
    if args.scope:
        command += ["--scope", args.scope]
    if args.force:
        command.append("--force")
    return run(f"Modular project ({args.binding})", command, target)


def install_specs(target: Path, base_dir: Path, name: str) -> None:
    """Passo 3: o fluxo SDD. Mescla com specs/arquitetura e specs/adr ja criados pelo passo 2."""
    source = base_dir / "specs" / "_estrutura_base"
    if not source.exists():
        print(f"[WARNING] Specs structure not found at {source}")
        return
    destination = target / "specs"
    destination.mkdir(exist_ok=True)
    shutil.copytree(source, destination, dirs_exist_ok=True)
    print("[OK] Specs structure (SDD) injected.")

    index_spec = destination / "INDEX.md"
    if index_spec.exists():
        content = index_spec.read_text(encoding="utf-8")
        index_spec.write_text(
            content.replace("# 🧭 Mapa de Especificações (Bússola da IA)", f"# 🧭 Mapa de Especificações: {name}"),
            encoding="utf-8",
        )


def install_language_base(target: Path, base_dir: Path, binding: str, name: str) -> None:
    """Passo 4: a prosa da linguagem, ao lado das leis, em specs/arquitetura/."""
    source = base_dir / "specs" / "_bases_arquiteturais" / f"00-base-{binding}.md"
    if not source.exists():
        print(f"[WARNING] Architectural base not found for the binding: {binding}")
        return
    folder = target / "specs" / "arquitetura"
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / source.name
    content = source.read_text(encoding="utf-8")
    label = binding.capitalize() if binding != "typescript" else "TypeScript"
    content = content.replace(
        f'titulo: "Arquitetura Base: {label}"', f'titulo: "Arquitetura: {name} ({label})"'
    )
    destination.write_text(content, encoding="utf-8")
    print(f"[OK] Architectural base injected: {destination.name}")


VALID_ROLES = ("domain", "gateway", "connector")
# UM vocabulario so, do manifesto ao `--role` de create-module.mjs (ADR-009 decisao 8). Aqui havia
# uma tabela PT<->EN traduzindo `domain`->`dominio` na chamada, so para create-module.mjs traduzir
# de volta ao gravar module.json: duas conversoes que se anulavam, e duas portas do mesmo produto
# pedindo palavras diferentes. O role viaja como esta.


def _parse_module_spec(spec: str) -> tuple[str, str, bool] | None:
    """Decompoe um item de --modules ("<id>:<role>[:artifact]"). `None` = formato invalido — o
    chamador imprime o erro e ABORTA antes de criar qualquer modulo (nunca aplica parte da lista)."""
    parts = spec.split(":")
    if len(parts) not in (2, 3):
        return None
    module_id, role = parts[0], parts[1]
    if role not in VALID_ROLES:
        return None
    if len(parts) == 3 and parts[2] != "artifact":
        return None
    return module_id, role, len(parts) == 3


def validate_modules(modules: list) -> list | None:
    """Valida e decompoe cada item de --modules. `None` (com o erro ja impresso) se algum item for
    invalido — a lista so volta preenchida quando TODOS os itens estao corretos, porque criar metade
    dos modulos e abortar no meio deixaria o projeto num estado que ninguem pediu."""
    decomposed = []
    for spec in modules:
        parsed = _parse_module_spec(spec)
        if parsed is None:
            print(
                f'[ERROR] "--modules {spec}" is invalid. Required form: <id>:<role>[:artifact], with '
                f'role in {{{", ".join(VALID_ROLES)}}} — never a bare id (a role guessed '
                "from the name is the defect this form exists to close)."
            )
            return None
        module_id, role, wants_artifact = parsed
        if wants_artifact and role != "domain":
            print(
                f'[ERROR] "--modules {spec}": {role} does not generate an artifact by architecture (it '
                'aggregates or translates, never publishes) — ":artifact" only applies to domain.'
            )
            return None
        decomposed.append((module_id, role, wants_artifact))
    return decomposed


def create_modules(target: Path, template: Path, modules: list, binding: str) -> None:
    """Passo 5: os primeiros modulos, um por vez, na ordem PELO PAPEL declarado — connector por
    ultimo, porque agrega o que os outros publicam. `modulos` ja chegou validado por
    `validate_modules`: cada item e (id, role, wants_artifact), role no vocabulario do manifesto — o
    MESMO que `create-module.mjs --role` exige, entao passa direto, sem traducao."""
    create_module = target / "tools" / "create-module.mjs"
    if not create_module.exists():
        create_module = template / "tools" / "create-module.mjs"
    ordered = sorted(modules, key=lambda m: m[1] == "connector")
    for module_id, role, wants_artifact in ordered:
        command = ["node", str(create_module), module_id, "--binding", binding, "--role", role]
        # `wants_artifact` so e True quando role == "domain" (validate_modules ja recusa ":artifact"
        # em gateway/connector) — entao "nao quer artefato" cobre os dois casos sozinho: domain sem
        # o token, e gateway/connector, que NUNCA geram artefato por arquitetura.
        # Repasse para a CLI do template (ingles desde o ADR-020): "--no-artifact", nao ":artifact".
        if not wants_artifact:
            command.append("--no-artifact")
        run(f"Module '{module_id}' ({role})", command, target)


def _modules_selftest_cases() -> list[dict]:
    """Cobre a contraprova por reversao do defeito original (papel adivinhado pelo nome do id) e as
    duas formas de erro que substituem o chute: sufixo ausente, e ":artifact" fora de "domain"."""
    return [
        {
            "name": "no role suffix -> None, never a silent default",
            "fn": lambda: _parse_module_spec("catalog") is None,
        },
        {
            "name": "role outside the vocabulary -> None",
            "fn": lambda: _parse_module_spec("catalog:invalid-role") is None,
        },
        {
            "name": "id named like an aggregator but WITHOUT a declared role -> None (reversal of the original defect: no longer guesses from the name)",
            "fn": lambda: _parse_module_spec("connector") is None,
        },
        {
            "name": "id that LOOKS like a domain but declares gateway -> respects the declared role, not the name",
            "fn": lambda: _parse_module_spec("catalog:gateway") == ("catalog", "gateway", False),
        },
        {
            "name": "third token ':artifact' on domain -> accepted, wants_artifact=True",
            "fn": lambda: _parse_module_spec("catalog:domain:artifact") == ("catalog", "domain", True),
        },
        {
            "name": "domain without a third token -> wants_artifact=False (conservative direction)",
            "fn": lambda: _parse_module_spec("catalog:domain") == ("catalog", "domain", False),
        },
        {
            "name": "third token that is not 'artifact' -> None",
            "fn": lambda: _parse_module_spec("catalog:domain:x") is None,
        },
        {
            "name": "validate_modules: ':artifact' on connector -> None, gateway/connector do not generate an artifact",
            "fn": lambda: validate_modules(["hub:connector:artifact"]) is None,
        },
        {
            "name": "validate_modules: ':artifact' on gateway -> None",
            "fn": lambda: validate_modules(["pagamentos:gateway:artifact"]) is None,
        },
        {
            "name": "validate_modules: one invalid item rejects the WHOLE list, never applies only the valid ones",
            "fn": lambda: validate_modules(["catalog:domain", "norole"]) is None,
        },
        {
            "name": "validate_modules: fully valid list -> decomposes all, in the typed order",
            "fn": lambda: validate_modules(["catalog:domain", "hub:connector"]) == [
                ("catalog", "domain", False), ("hub", "connector", False),
            ],
        },
        {
            "name": "creation order: connector in the MIDDLE of the list goes to the END (aggregates the others, they must exist)",
            "fn": lambda: [
                m[0] for m in sorted(
                    [("a", "domain", False), ("hub", "connector", False), ("b", "domain", False)],
                    key=lambda m: m[1] == "connector",
                )
            ] == ["a", "b", "hub"],
        },
    ]


def run_modules_selftest() -> int:
    """`--selftest`: prova `_parse_module_spec`/`validate_modules`/a ordem de `create_modules` com
    fixtures em memoria — a contraprova por reversao do defeito original fica registrada aqui, nao
    só no relatorio do bloco, porque relatorio nao roda em CI e --selftest roda."""
    failures = 0
    cases = _modules_selftest_cases()
    for case in cases:
        ok = case["fn"]() is True
        print(f"  {'ok   ' if ok else 'FAIL'} {case['name']}")
        if not ok:
            failures += 1
    print(f"\nselftest (validate_modules/order): {len(cases) - failures}/{len(cases)} ok")
    return 0 if failures == 0 else 1


def install_agents_structure(target: Path, base_dir: Path) -> Path:
    """Passo 6a: .agents/ com a meta-create-skill injetada e o gerador de indice."""
    agents_dir = target / ".agents"
    agents_dir.mkdir(exist_ok=True)
    for sub in AGENTS_SUBDIRS:
        (agents_dir / sub).mkdir(exist_ok=True)

    source = base_dir / "skills" / "meta-create-skill"
    destination = agents_dir / "skills" / "meta-create-skill"
    if source.exists():
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(source, destination)
        print("[OK] Skill 'meta-create-skill' injected locally.")
    else:
        print(f"[WARNING] meta-create-skill not found at {source}.")

    # Projeto que já tem o nome antigo o mantém: o pre-commit dele o chama (adota o novo sob demanda).
    index_name = LEGACY_INDEX_SCRIPT if (agents_dir / LEGACY_INDEX_SCRIPT).exists() else INDEX_SCRIPT
    (agents_dir / index_name).write_text(INDEX_GENERATOR, encoding="utf-8")
    print("[OK] .agents/ structure created.")
    return agents_dir


def compose_claude_md(existing: str | None) -> str | None:
    """Decide o `CLAUDE.md` do projeto-alvo: so o import `@AGENTS.md` (o `AGENTS.md` e a fonte).
    Devolve o conteudo novo, ou `None` quando o import ja existe e nao ha o que mudar."""
    if existing is None:
        return f"{AGENTS_IMPORT_LINE}\n"
    if any(line.strip() == AGENTS_IMPORT_LINE for line in existing.splitlines()):
        return None
    body = existing.rstrip("\n")
    return f"{body}\n\n{AGENTS_IMPORT_LINE}\n" if body else f"{AGENTS_IMPORT_LINE}\n"


def _claude_md_selftest_cases() -> list[dict]:
    """Os tres estados do `CLAUDE.md` no alvo, mais a idempotencia do caso anexado."""
    without_import = "# CLAUDE.md do projeto\n\n- regra local\n"
    return [
        {
            "name": "missing -> creates with only @AGENTS.md",
            "fn": lambda: compose_claude_md(None) == f"{AGENTS_IMPORT_LINE}\n",
        },
        {
            "name": "existing without import -> preserves the content and appends @AGENTS.md",
            "fn": lambda: compose_claude_md(without_import) == f"{without_import}\n{AGENTS_IMPORT_LINE}\n",
        },
        {
            "name": "existing with import -> None, untouched",
            "fn": lambda: compose_claude_md(f"# CLAUDE.md\n\n{AGENTS_IMPORT_LINE}\n") is None,
        },
        {
            "name": "idempotency: recomposing the appended one -> None",
            "fn": lambda: compose_claude_md(compose_claude_md(without_import)) is None,
        },
    ]


def run_claude_md_selftest() -> int:
    """`--selftest`: prova `compose_claude_md` com fixtures em memoria, sem tocar disco."""
    failures = 0
    cases = _claude_md_selftest_cases()
    for case in cases:
        ok = case["fn"]() is True
        print(f"  {'ok   ' if ok else 'FAIL'} {case['name']}")
        if not ok:
            failures += 1
    print(f"\nselftest (compose_claude_md): {len(cases) - failures}/{len(cases)} ok")
    return 0 if failures == 0 else 1


def _write_claude_md(target: Path) -> str:
    """Grava o `CLAUDE.md` do alvo via `compose_claude_md`; devolve o rotulo do que aconteceu."""
    path = target / "CLAUDE.md"
    existing = path.read_text(encoding="utf-8") if path.exists() else None
    new = compose_claude_md(existing)
    if new is None:
        return "already imports @AGENTS.md, untouched"
    path.write_text(new, encoding="utf-8")
    return "created with @AGENTS.md" if existing is None else "@AGENTS.md appended"


def write_entrypoint(target: Path, modular: bool) -> None:
    """Passo 6b: o ponteiro sempre-ativo vai so no `AGENTS.md` (a fonte neutra, lida pelo Codex);
    o `CLAUDE.md` apenas o importa (`@AGENTS.md`), nunca duplica o texto."""
    text = (
        "\n\n> **Atencao (IA):** Sou um projeto Sarak. Antes de codificar, leia as regras de negocio "
        "locais em `.agents/index.md`.\n"
    )
    if modular:
        text += (
            "> **Arquitetura de modulos:** a lei esta em `specs/arquitetura/` (`04-regras.md` e o catalogo "
            "normativo) e e cobrada por maquina: `node tools/gate/validate.mjs --all`. "
            "Modulo novo so pela skill `code-modulo` — nunca copiando pasta a mao.\n"
        )
    agents_path = target / "AGENTS.md"
    with open(agents_path, "a" if agents_path.exists() else "w", encoding="utf-8") as file:
        file.write(text)
    print("[OK] AGENTS.md updated (always-on source).")
    print(f"[OK] CLAUDE.md: {_write_claude_md(target)}.")


def _mark_executable(path: Path) -> None:
    """`--chmod=+x` cobre os DOIS hooks (pre-commit e pre-push) — o segundo tem o mesmo problema
    no Windows com `core.filemode=false`."""
    try:
        os.chmod(path, 0o755)
    except OSError as error:
        print(f"[WARNING] Could not mark '{path.name}' as executable: {error}")


def install_git_hooks(target: Path, base_dir: Path) -> None:
    """Passo 6c: gate de segredos + auto-indexador, COMPOSTO com o pre-commit do template via
    `compose_pre_commit` (nunca um sobrescrevendo o outro), amarrados via core.hooksPath."""
    if not (target / ".git").exists():
        print("[WARNING] No .git - hooks not wired. Use --git-init or run 'git init'.")
        return
    githooks = target / ".githooks"
    githooks.mkdir(exist_ok=True)

    source = base_dir / "skills" / "git-verificacao-commit" / "scripts"
    if source.exists():
        # Projeto novo recebe `verify_commit.py`; o que já tem o pre-commit com o nome antigo mantém o
        # nome que ele chama (`LEGACY_OWN_HOOK_SCRIPT`) — a decisão sai do pre-commit existente.
        pre_commit_text = (githooks / "pre-commit").read_text(encoding="utf-8") if (githooks / "pre-commit").exists() else ""
        installed = LEGACY_OWN_HOOK_SCRIPT if LEGACY_OWN_HOOK_SCRIPT in pre_commit_text else OWN_HOOK_SCRIPT
        shutil.copy2(source / OWN_HOOK_SCRIPT, githooks / installed)
        shutil.copy2(source / "config.json", githooks / "config.json")
        print("[OK] Secrets gate copied to .githooks/")

    pre_commit_path = githooks / "pre-commit"
    existing = pre_commit_path.read_text(encoding="utf-8") if pre_commit_path.exists() else None
    composed = compose_pre_commit(existing, HOOK_PRE_COMMIT)
    pre_commit_path.write_text(composed, encoding="utf-8")
    _mark_executable(pre_commit_path)
    label = "composed (secrets + template conformance)" if existing is not None and TEMPLATE_HOOK_MARKER in existing else "written"
    print(f"[OK] .githooks/pre-commit {label}.")

    pre_push_path = githooks / "pre-push"
    if pre_push_path.exists():
        _mark_executable(pre_push_path)

    run("git config core.hooksPath", ["git", "config", "core.hooksPath", ".githooks"], target)


def verify(target: Path) -> None:
    """Passo 7: o gate global. Reprovar aqui e informacao, nao acidente."""
    validate_path = target / "tools" / "gate" / "validate.mjs"
    if not validate_path.exists():
        return
    # Repasse para a CLI do template (ingles desde o ADR-020): "--all", nao "--todos" (o rotulo
    # abaixo acompanha, para nao divergir do comando que de fato roda).
    run("Conformance gate (--all)", ["node", str(validate_path), "--all"], target)


def next_steps(modular: bool) -> None:
    print("\n--- Sarak-Ready repository! ---")
    print("Next steps (HITL - deliberately not automated):")
    if modular:
        print("  1. fill in the root .env with the real values")
        print("  2. fill in specs/00-contexto.md (the repository's first plan)")
        print("  3. record the project decisions in specs/adr/ (language, schema, ui.mode)")
    print("  4. first commit + remote: skill 'git-commit-inicial'")


def _prepare_target(target: Path, args) -> tuple[bool, list | None]:
    """Antes de escrever qualquer coisa: recusa alvo perigoso, valida `--modules` e `--register`, e
    cria o diretorio. Devolve `(ok, validated_modules)`."""
    danger = _dangerous_target_reason(target)
    if danger is not None:
        print(f"[ERROR] Target refused ({danger}): {target}. Confirm a specific path, never this one.")
        return False, None
    if args.register and not args.id:
        print("[ERROR] --register requires --id (kebab-case, unique in mapa.json).")
        return False, None
    modules = validate_modules(args.modules) if args.modules else None
    if args.modules and modules is None:
        return False, None
    if not target.exists():
        try:
            target.mkdir(parents=True)
        except OSError as error:
            print(f"[ERROR] Could not create the target directory {target}: {error}")
            return False, None
        print(f"[OK] Target directory created: {target}")
    return True, modules


def install_content(target: Path, base_dir: Path, args: argparse.Namespace, modules: list | None) -> None:
    """Passos 3-5: specs do fluxo SDD, base da linguagem e os primeiros modulos (os dois ultimos so
    com `--binding`)."""
    install_specs(target, base_dir, args.name)
    if args.binding:
        install_language_base(target, base_dir, args.binding, args.name)
    if args.binding and modules:
        create_modules(target, template_path(base_dir), modules, args.binding)


def stamp_and_register(target: Path, base_dir: Path, args: argparse.Namespace, modular: bool) -> bool:
    """Passo 6d: o carimbo `.sarak/base.json` sempre; o `mapa.json` da base so com `--register`."""
    info = {"kind": "app", "modular": modular, "bindings": [args.binding] if args.binding else []}
    try:
        stamp.stamp(target, base_dir, info)
        if args.register:
            stamp.register(target, base_dir, {"id": args.id, "name": args.name, **info})
    except (ValueError, OSError) as error:
        print(f"[ERROR] Stamp/registration: {error}")
        return False
    return True


def run_selftests() -> int:
    """`--selftest`: roda todos os blocos em sequencia; reprova se qualquer um reprovar."""
    blocks = (run_pre_commit_selftest, run_modules_selftest, run_claude_md_selftest)
    results = []
    for index, block in enumerate(blocks):
        if index:
            print()
        results.append(block())
    return 0 if all(r == 0 for r in results) else 1


def main() -> int:
    if "--selftest" in sys.argv[1:]:
        return run_selftests()

    args = get_args()
    target = Path(args.target).resolve()

    ok, validated_modules = _prepare_target(target, args)
    if not ok:
        return 1

    base_dir = base_root()
    template = template_path(base_dir)
    print(f"\n--- Sarak scaffold at: {target} ---")

    if args.git_init and not (target / ".git").exists():
        run("git init", ["git", "init"], target)

    modular = False
    if args.binding:
        modular = install_modular_project(target, template, args)
        if not modular:
            print("[ERROR] Modular project not installed - aborting before mixing structures.")
            return 1

    install_content(target, base_dir, args, validated_modules)

    install_agents_structure(target, base_dir)
    write_entrypoint(target, modular)
    install_git_hooks(target, base_dir)
    if not stamp_and_register(target, base_dir, args, modular):
        return 1

    if modular:
        verify(target)
    next_steps(modular)
    return 0


if __name__ == "__main__":
    sys.exit(main())
