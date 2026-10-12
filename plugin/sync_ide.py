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
    parser = argparse.ArgumentParser(
        description="Sarak Ecosystem installer (Sync IDEs)"
    )
    parser.add_argument(
        "--target",
        choices=["antigravity", "claude", "codex", "all"],
        required=True,
        help="Target AI provider for the Sarak installation (all = Claude + Codex + Antigravity)",
    )
    return parser.parse_args()


# As subpastas da base que viajam para todo destino de plugin (Claude, Codex, Antigravity).
PLUGIN_SUBDIRS = ["skills", "agents", "commands", "hooks", "specs"]


def _suffixed(dest, suffix):
    """O irmão de `dest` com `suffix` no nome (`skills` -> `skills.sync-tmp`)."""
    return dest.with_name(dest.name + suffix)


def _swap(tmp, dest):
    """Põe `tmp` no lugar de `dest` por renomeação: o antigo vira `.sync-old` e só é apagado DEPOIS
    que o novo está no lugar — se a segunda renomeação falhar, o antigo volta. Lança `OSError`."""
    old = _suffixed(dest, ".sync-old")
    shutil.rmtree(old, ignore_errors=True)
    if dest.exists():
        dest.rename(old)
    try:
        tmp.rename(dest)
    except OSError:
        if old.exists():
            old.rename(dest)
        raise
    shutil.rmtree(old, ignore_errors=True)


def _mirror_dir(source, dest):
    """Copia `source` para o irmão temporário `<dest>.sync-tmp` e só então troca pelo `dest`. Falha
    na cópia (ou na troca) apaga o temporário e deixa o `dest` anterior intacto. Devolve se espelhou."""
    tmp = _suffixed(dest, ".sync-tmp")
    try:
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.copytree(source, tmp)
        _swap(tmp, dest)
    except (OSError, shutil.Error) as e:
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"[ERROR] Failed to mirror {source.name}/ into {dest}: {e} — previous version kept.")
        return False
    print(f"[OK] {source.name}/ mirrored into {dest}")
    return True


def copy_subdirs(xskills_root, dest_root, subdirs):
    """Espelha cada subpasta da base para dest_root, sem janela destrutiva (`_mirror_dir`).
    Devolve True só se todas as subpastas existentes na base foram espelhadas."""
    all_ok = True
    for name in subdirs:
        source = xskills_root / name
        if not source.exists():
            continue
        all_ok = _mirror_dir(source, dest_root / name) and all_ok
    return all_ok


INCOMPLETE = "[ERROR] Incomplete mirror — the destination kept the previous version of the folders that failed."


def read_plugin_meta(xskills_root):
    """Lê nome do marketplace, nome e versão do plugin a partir dos manifestos do repo."""
    plugin_json = xskills_root / ".claude-plugin" / "plugin.json"
    marketplace_json = xskills_root / ".claude-plugin" / "marketplace.json"
    with open(plugin_json, "r", encoding="utf-8") as f:
        plugin = json.load(f)
    with open(marketplace_json, "r", encoding="utf-8") as f:
        marketplace = json.load(f)
    return marketplace["name"], plugin["name"], plugin["version"]


def read_plugin_identity(xskills_root):
    """Lê `name` e `description` do plugin da fonte da identidade, `.claude-plugin/plugin.json`."""
    with open(xskills_root / ".claude-plugin" / "plugin.json", "r", encoding="utf-8") as f:
        plugin = json.load(f)
    return {"name": plugin["name"], "description": plugin["description"]}


def cache_codex(env, home, meta):
    """Pura: o diretório da versão instalada do plugin no cache do Codex.

    Raiz (`root`) = `CODEX_HOME` quando definida (e não vazia), senão `<home>/.codex`; o cache tem a mesma
    forma do Claude — `<root>/plugins/cache/<marketplace>/<plugin>/<version>`. `meta` é a tupla de
    `read_plugin_meta`."""
    root = Path(env["CODEX_HOME"]) if env.get("CODEX_HOME") else Path(home) / ".codex"
    marketplace_name, plugin_name, version = meta
    return root / "plugins" / "cache" / marketplace_name / plugin_name / version


def mirror_plugin(xskills_root, dest_of, prepare):
    """Comum aos alvos de cache (Claude e Codex): lê a meta, monta o destino com `dest_of(meta)`,
    deixa `prepare(dest_root)` decidir se segue (criar ou exigir o diretório) e espelha as subpastas.
    Devolve a meta quando espelhou TUDO, `None` quando parou ou ficou incompleto (motivo já impresso) —
    e aí o alvo não imprime o `[OK]` final nem as notas."""
    try:
        meta = read_plugin_meta(xskills_root)
    except Exception as e:
        print(f"[ERROR] Failed to read the plugin manifests (.claude-plugin/): {e}")
        return None
    dest_root = dest_of(meta)
    if not prepare(dest_root):
        return None
    if not copy_subdirs(xskills_root, dest_root, PLUGIN_SUBDIRS):
        print(INCOMPLETE)
        return None
    return meta


def _create_dir(dest_root):
    """Claude: o cache da versão pode nascer aqui."""
    dest_root.mkdir(parents=True, exist_ok=True)
    return True


def _require_codex_install(dest_root):
    """Codex: NUNCA cria a instalação — sem o `.git/` e o `.codex-marketplace-install.json` que o
    app grava, um cache criado do nada não seria reconhecido por ele."""
    if dest_root.is_dir():
        return True
    print(
        f"[ERROR] Plugin not installed in the Codex cache for this version: {dest_root}. Install (or "
        "update to this version) the plugin through the Codex app — the sync does not create the installation."
    )
    return False


def sync_claude(xskills_root):
    print("\n--- Syncing the Claude Plugin Cache ---")
    home = Path.home()
    plugins_cache = home / ".claude" / "plugins" / "cache"

    if not plugins_cache.exists():
        print(f"[ERROR] Claude plugins cache not found: {plugins_cache}")
        return

    meta = mirror_plugin(
        xskills_root, lambda m: plugins_cache.joinpath(*m), _create_dir
    )
    if meta is None:
        return
    _, plugin_name, version = meta
    print(f"[OK] Plugin '{plugin_name}' v{version} mirrored into the Claude cache.")
    print(
        "[NOTE] Restart the Claude session so the catalog reloads the new skills."
    )


def sync_codex(xskills_root):
    """Espelha a base no cache do plugin já instalado pelo app do Codex. PROVISÓRIO: o cache é do
    app, e a próxima atualização por ele o substitui pela versão do remoto. Não toca em `.git/`,
    em `.codex-marketplace-install.json` nem nos manifestos da raiz — só nas PLUGIN_SUBDIRS."""
    print("\n--- Syncing the Codex Plugin Cache ---")
    meta = mirror_plugin(
        xskills_root,
        lambda m: cache_codex(os.environ, Path.home(), m),
        _require_codex_install,
    )
    if meta is None:
        return
    _, plugin_name, version = meta
    print(f"[OK] Plugin '{plugin_name}' v{version} mirrored into the Codex cache.")
    print("[NOTE] Open a new conversation in Codex so the catalog reloads.")
    print(
        "[NOTE] If hooks/hooks.json changed, trust the hooks again in the Codex app — without that, none of them run."
    )
    print(
        "[WARNING] PROVISIONAL mirror: the next plugin update through the app replaces this cache "
        "with the remote version. Push to make the change permanent."
    )


def sync_antigravity(xskills_root):
    print("\n--- Syncing the Antigravity Local Core ---")
    home = Path.home()
    plugins_dir = home / ".gemini" / "config" / "plugins"

    if not plugins_dir.exists():
        print(
            f"[ERROR] Antigravity plugins directory not found: {plugins_dir}"
        )
        return

    # A identidade vem da fonte (.claude-plugin/plugin.json): nome da pasta e manifesto do plugin
    try:
        manifest = read_plugin_identity(xskills_root)
    except (OSError, KeyError, json.JSONDecodeError) as e:
        print(f"[ERROR] Failed to read the plugin identity (.claude-plugin/plugin.json): {e}")
        return

    sarak_plugin_dir = plugins_dir / manifest["name"]
    sarak_plugin_dir.mkdir(parents=True, exist_ok=True)

    with open(sarak_plugin_dir / "plugin.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    if not copy_subdirs(xskills_root, sarak_plugin_dir, PLUGIN_SUBDIRS):
        print(INCOMPLETE)


def generate_routing_table(xskills_root):
    print("\n--- Generating the Unified Routing Table ---")
    commands_dir = xskills_root / "commands"
    skills_dir = xskills_root / "skills"
    agents_dir = xskills_root / "agents"
    specs_dir = xskills_root / "specs" / "_estrutura_base" / "_templates"

    table = "# Sarak Global Routing Table\n\n"
    table += "> **Attention AIs:** This file is the central map of the Sarak ecosystem. "
    table += "It lists the imperative commands (starting with `/`), the Organic Skills, the Subagents and the Templates.\n\n"

    table += "## 1. Commands (Slash Commands)\n"
    table += "When the user sends any command listed below, read the corresponding file before acting.\n"
    if commands_dir.exists():
        for file in sorted(os.listdir(commands_dir)):
            if file.endswith(".md"):
                cmd_name = "/" + file[:-3]
                abs_path = str(commands_dir / file).replace("\\", "/")
                table += f"- **{cmd_name}**: `{abs_path}`\n"

    table += "\n## 2. Organic Skills\n"
    table += "When the user asks for one of these skills (or you judge it necessary from the context), "
    table += "read the corresponding SKILL.md file to load its workflow.\n"
    if skills_dir.exists():
        for skill_folder in sorted(os.listdir(skills_dir)):
            skill_md = skills_dir / skill_folder / "SKILL.md"
            if skill_md.exists():
                abs_path = str(skill_md).replace("\\", "/")
                table += f"- **{skill_folder}**: `{abs_path}`\n"

    table += "\n## 3. Specialized Subagents\n"
    table += "Agents that can be triggered through tools/tasks (e.g. code-auditor). Read the manifest to learn the rules and roles.\n"
    if agents_dir.exists():
        for agent_file in sorted(os.listdir(agents_dir)):
            if agent_file.endswith(".md"):
                abs_path = str(agents_dir / agent_file).replace("\\", "/")
                table += f"- **{agent_file[:-3]}**: `{abs_path}`\n"

    table += "\n## 4. Documentation Templates\n"
    table += "Official models to be used as a mold when generating documentation (Specs, ADRs, Architecture).\n"
    if specs_dir.exists():
        for tpl_file in sorted(os.listdir(specs_dir)):
            if tpl_file.endswith(".md"):
                abs_path = str(specs_dir / tpl_file).replace("\\", "/")
                table += f"- **{tpl_file[:-3]}**: `{abs_path}`\n"

    table += "\n## 5. Global Environment Variables (Agent Context)\n"
    table += "Whenever a skill asks you to run tools such as Python, Pytest, Eslint, etc., "
    table += "do NOT use the repository's local installers. Instead, use EXACTLY the absolute paths below:\n"

    python_path = str(
        xskills_root
        / ".venv"
        / ("Scripts" if os.name == "nt" else "bin")
        / ("python.exe" if os.name == "nt" else "python")
    ).replace("\\", "/")
    node_bin_path = str(xskills_root / "node_modules" / ".bin").replace("\\", "/")

    table += f"- **SARAK_PYTHON_VENV**: `{python_path}`\n"
    table += f"- **SARAK_NODE_BIN**: `{node_bin_path}`\n"
    table += "\n> **Practical Examples of Global Tools**:\n"
    table += f'> - **Pytest**: `"{python_path}" -m pytest .`\n'
    table += f'> - **Playwright**: `"{node_bin_path}/playwright" test`\n'
    table += f'> - **Artillery**: `"{node_bin_path}/artillery" run test.yml`\n'

    output_file = xskills_root / "plugin" / "sarak_routing_table.md"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(table)

    print(f"[OK] Unified table generated at: {output_file}")

    print("\n[ONE-TIME SETUP INSTRUCTION]")
    print(
        "Paste the sentence below into the Global Rules of your IDEs (Antigravity and any IDE without a native plugin) ONCE:"
    )
    print("-" * 70)
    print(
        f"Whenever the user sends a command starting with '/', silently read the centralized routes file at {str(output_file).replace(chr(92), '/')} to find out which absolute file to run."
    )
    print("-" * 70)


def selftest():
    """`--selftest`: prova `cache_codex` com fixtures em memória — não chama `setup_env`, não
    escreve em disco, não exige `--target`."""
    meta = ("knowledge-agentics", "sarak", "1.0.0")
    home = Path("/home/fixture")
    suffix = Path("plugins") / "cache" / "knowledge-agentics" / "sarak" / "1.0.0"
    cases = [
        ("with CODEX_HOME -> root is the variable",
         cache_codex({"CODEX_HOME": "/other/codex"}, home, meta) == Path("/other/codex") / suffix),
        ("without CODEX_HOME -> root is <home>/.codex",
         cache_codex({}, home, meta) == home / ".codex" / suffix),
        ("empty CODEX_HOME counts as undefined",
         cache_codex({"CODEX_HOME": ""}, home, meta) == home / ".codex" / suffix),
        ("assembly: <root>/plugins/cache/<marketplace>/<plugin>/<version>, in that order",
         cache_codex({}, home, ("mkt", "plg", "9.9.9")).parts[-5:] == ("plugins", "cache", "mkt", "plg", "9.9.9")),
    ]
    failures = 0
    for name, ok in cases:
        print(f"  {'ok   ' if ok else 'FAIL '} {name}")
        failures += 0 if ok else 1
    print(f"\nselftest (sync_ide.py): {len(cases) - failures}/{len(cases)} ok")
    return 0 if failures == 0 else 1


def main():
    if "--selftest" in sys.argv[1:]:
        sys.exit(selftest())
    args = get_args()

    xskills_root = Path(__file__).parent.parent.resolve()

    if not (xskills_root / "skills").exists():
        print(f"[ERROR] Skills directory not found at the root: {xskills_root}")
        sys.exit(1)

    # Garante que as dependências globais (Python/Node) estão instaladas antes do sync
    setup_env.run_setup(xskills_root)

    if args.target in ["antigravity", "all"]:
        sync_antigravity(xskills_root)

    if args.target in ["claude", "all"]:
        sync_claude(xskills_root)

    if args.target in ["codex", "all"]:
        sync_codex(xskills_root)

    # A tabela é gerada de forma unificada (Antigravity e qualquer IDE sem plugin nativo)
    generate_routing_table(xskills_root)

    print("\nGlobal sync completed successfully!")


if __name__ == "__main__":
    main()
