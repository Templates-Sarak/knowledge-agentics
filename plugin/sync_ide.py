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
        description="Instalador Sarak Ecosystem (Sync IDEs)"
    )
    parser.add_argument(
        "--target",
        choices=["antigravity", "claude", "codex", "all"],
        required=True,
        help="Provedor de IA alvo para instalação do Sarak (all = Claude + Codex + Antigravity)",
    )
    return parser.parse_args()


# As subpastas da base que viajam para todo destino de plugin (Claude, Codex, Antigravity).
SUBPASTAS_DO_PLUGIN = ["skills", "agents", "commands", "hooks", "specs"]


def _sufixado(dest, sufixo):
    """O irmão de `dest` com `sufixo` no nome (`skills` -> `skills.sync-tmp`)."""
    return dest.with_name(dest.name + sufixo)


def _trocar(tmp, dest):
    """Põe `tmp` no lugar de `dest` por renomeação: o antigo vira `.sync-old` e só é apagado DEPOIS
    que o novo está no lugar — se a segunda renomeação falhar, o antigo volta. Lança `OSError`."""
    antigo = _sufixado(dest, ".sync-old")
    shutil.rmtree(antigo, ignore_errors=True)
    if dest.exists():
        dest.rename(antigo)
    try:
        tmp.rename(dest)
    except OSError:
        if antigo.exists():
            antigo.rename(dest)
        raise
    shutil.rmtree(antigo, ignore_errors=True)


def _espelhar_pasta(source, dest):
    """Copia `source` para o irmão temporário `<dest>.sync-tmp` e só então troca pelo `dest`. Falha
    na cópia (ou na troca) apaga o temporário e deixa o `dest` anterior intacto. Devolve se espelhou."""
    tmp = _sufixado(dest, ".sync-tmp")
    try:
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.copytree(source, tmp)
        _trocar(tmp, dest)
    except (OSError, shutil.Error) as e:
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"[ERRO] Falha ao espelhar {source.name}/ em {dest}: {e} — mantida a versão anterior.")
        return False
    print(f"[OK] {source.name}/ espelhado em {dest}")
    return True


def copy_subdirs(xskills_root, dest_root, subdirs):
    """Espelha cada subpasta da base para dest_root, sem janela destrutiva (`_espelhar_pasta`).
    Devolve True só se todas as subpastas existentes na base foram espelhadas."""
    tudo_ok = True
    for name in subdirs:
        source = xskills_root / name
        if not source.exists():
            continue
        tudo_ok = _espelhar_pasta(source, dest_root / name) and tudo_ok
    return tudo_ok


INCOMPLETO = "[ERRO] Espelho incompleto — o destino manteve a versão anterior das pastas que falharam."


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

    Raiz = `CODEX_HOME` quando definida (e não vazia), senão `<home>/.codex`; o cache tem a mesma
    forma do Claude — `<raiz>/plugins/cache/<marketplace>/<plugin>/<versão>`. `meta` é a tupla de
    `read_plugin_meta`."""
    raiz = Path(env["CODEX_HOME"]) if env.get("CODEX_HOME") else Path(home) / ".codex"
    marketplace_name, plugin_name, version = meta
    return raiz / "plugins" / "cache" / marketplace_name / plugin_name / version


def espelhar_plugin(xskills_root, destino_de, preparar):
    """Comum aos alvos de cache (Claude e Codex): lê a meta, monta o destino com `destino_de(meta)`,
    deixa `preparar(destino)` decidir se segue (criar ou exigir o diretório) e espelha as subpastas.
    Devolve a meta quando espelhou TUDO, `None` quando parou ou ficou incompleto (motivo já impresso) —
    e aí o alvo não imprime o `[OK]` final nem as notas."""
    try:
        meta = read_plugin_meta(xskills_root)
    except Exception as e:
        print(f"[ERRO] Falha ao ler manifestos do plugin (.claude-plugin/): {e}")
        return None
    dest_root = destino_de(meta)
    if not preparar(dest_root):
        return None
    if not copy_subdirs(xskills_root, dest_root, SUBPASTAS_DO_PLUGIN):
        print(INCOMPLETO)
        return None
    return meta


def _criar_diretorio(dest_root):
    """Claude: o cache da versão pode nascer aqui."""
    dest_root.mkdir(parents=True, exist_ok=True)
    return True


def _exigir_instalacao_codex(dest_root):
    """Codex: NUNCA cria a instalação — sem o `.git/` e o `.codex-marketplace-install.json` que o
    app grava, um cache criado do nada não seria reconhecido por ele."""
    if dest_root.is_dir():
        return True
    print(
        f"[ERRO] Plugin não instalado no cache do Codex nesta versão: {dest_root}. Instale (ou "
        "atualize para esta versão) o plugin pelo app do Codex — o sync não cria a instalação."
    )
    return False


def sync_claude(xskills_root):
    print("\n--- Sincronizando Cache do Plugin Claude ---")
    home = Path.home()
    plugins_cache = home / ".claude" / "plugins" / "cache"

    if not plugins_cache.exists():
        print(f"[ERRO] Cache de plugins do Claude não encontrado: {plugins_cache}")
        return

    meta = espelhar_plugin(
        xskills_root, lambda m: plugins_cache.joinpath(*m), _criar_diretorio
    )
    if meta is None:
        return
    _, plugin_name, version = meta
    print(f"[OK] Plugin '{plugin_name}' v{version} espelhado no cache do Claude.")
    print(
        "[NOTA] Reinicie a sessão do Claude para o catálogo recarregar as skills novas."
    )


def sync_codex(xskills_root):
    """Espelha a base no cache do plugin já instalado pelo app do Codex. PROVISÓRIO: o cache é do
    app, e a próxima atualização por ele o substitui pela versão do remoto. Não toca em `.git/`,
    em `.codex-marketplace-install.json` nem nos manifestos da raiz — só nas SUBPASTAS_DO_PLUGIN."""
    print("\n--- Sincronizando Cache do Plugin Codex ---")
    meta = espelhar_plugin(
        xskills_root,
        lambda m: cache_codex(os.environ, Path.home(), m),
        _exigir_instalacao_codex,
    )
    if meta is None:
        return
    _, plugin_name, version = meta
    print(f"[OK] Plugin '{plugin_name}' v{version} espelhado no cache do Codex.")
    print("[NOTA] Abra uma conversa nova no Codex para o catálogo recarregar.")
    print(
        "[NOTA] Se hooks/hooks.json mudou, confie nos hooks de novo no app do Codex — sem isso, nenhum roda."
    )
    print(
        "[AVISO] Espelho PROVISÓRIO: a próxima atualização do plugin pelo app substitui este cache "
        "pela versão do remoto. Faça push para tornar a mudança definitiva."
    )


def sync_antigravity(xskills_root):
    print("\n--- Sincronizando Core Local do Antigravity ---")
    home = Path.home()
    plugins_dir = home / ".gemini" / "config" / "plugins"

    if not plugins_dir.exists():
        print(
            f"[ERRO] Diretório de plugins do Antigravity não encontrado: {plugins_dir}"
        )
        return

    # A identidade vem da fonte (.claude-plugin/plugin.json): nome da pasta e manifesto do plugin
    try:
        manifest = read_plugin_identity(xskills_root)
    except (OSError, KeyError, json.JSONDecodeError) as e:
        print(f"[ERRO] Falha ao ler a identidade do plugin (.claude-plugin/plugin.json): {e}")
        return

    sarak_plugin_dir = plugins_dir / manifest["name"]
    sarak_plugin_dir.mkdir(parents=True, exist_ok=True)

    with open(sarak_plugin_dir / "plugin.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    if not copy_subdirs(xskills_root, sarak_plugin_dir, SUBPASTAS_DO_PLUGIN):
        print(INCOMPLETO)


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
                abs_path = str(commands_dir / file).replace("\\", "/")
                table += f"- **{cmd_name}**: `{abs_path}`\n"

    table += "\n## 2. Skills Orgânicas\n"
    table += "Quando o usuário solicitar o uso de uma destas skills (ou você julgar necessário pelo contexto), "
    table += "leia o arquivo SKILL.md correspondente para carregar o seu workflow.\n"
    if skills_dir.exists():
        for skill_folder in sorted(os.listdir(skills_dir)):
            skill_md = skills_dir / skill_folder / "SKILL.md"
            if skill_md.exists():
                abs_path = str(skill_md).replace("\\", "/")
                table += f"- **{skill_folder}**: `{abs_path}`\n"

    table += "\n## 3. Subagentes Especializados\n"
    table += "Agentes que podem ser acionados via ferramentas/tasks (ex: code-auditor). Leia o manifesto para descobrir as regras e os papéis.\n"
    if agents_dir.exists():
        for agent_file in sorted(os.listdir(agents_dir)):
            if agent_file.endswith(".md"):
                abs_path = str(agents_dir / agent_file).replace("\\", "/")
                table += f"- **{agent_file[:-3]}**: `{abs_path}`\n"

    table += "\n## 4. Templates de Documentação\n"
    table += "Modelos oficiais que devem ser usados como molde ao gerar documentação (Specs, ADRs, Arquitetura).\n"
    if specs_dir.exists():
        for tpl_file in sorted(os.listdir(specs_dir)):
            if tpl_file.endswith(".md"):
                abs_path = str(specs_dir / tpl_file).replace("\\", "/")
                table += f"- **{tpl_file[:-3]}**: `{abs_path}`\n"

    table += "\n## 5. Variáveis de Ambiente Globais (Agent Context)\n"
    table += "Sempre que uma skill pedir para você rodar ferramentas como Python, Pytest, Eslint, etc., "
    table += "NÃO use os instaladores locais do repositório. Em vez disso, use EXATAMENTE os caminhos absolutos abaixo:\n"

    python_path = str(
        xskills_root
        / ".venv"
        / ("Scripts" if os.name == "nt" else "bin")
        / ("python.exe" if os.name == "nt" else "python")
    ).replace("\\", "/")
    node_bin_path = str(xskills_root / "node_modules" / ".bin").replace("\\", "/")

    table += f"- **SARAK_PYTHON_VENV**: `{python_path}`\n"
    table += f"- **SARAK_NODE_BIN**: `{node_bin_path}`\n"
    table += f"\n> **Exemplos Práticos de Ferramentas Globais**:\n"
    table += f'> - **Pytest**: `"{python_path}" -m pytest .`\n'
    table += f'> - **Playwright**: `"{node_bin_path}/playwright" test`\n'
    table += f'> - **Artillery**: `"{node_bin_path}/artillery" run test.yml`\n'

    output_file = xskills_root / "plugin" / "sarak_routing_table.md"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(table)

    print(f"[OK] Tabela unificada gerada em: {output_file}")

    print("\n[INSTRUÇÃO ÚNICA DE CONFIGURAÇÃO (SETUP)]")
    print(
        "Cole a frase abaixo nas Regras Globais das suas IDEs (Antigravity e qualquer IDE sem plugin nativo) UMA ÚNICA VEZ:"
    )
    print("-" * 70)
    print(
        f"Sempre que o usuário enviar um comando iniciando com '/', leia silenciosamente o arquivo de rotas centralizado em {str(output_file).replace(chr(92), '/')} para descobrir qual arquivo absoluto executar."
    )
    print("-" * 70)


def autoteste():
    """`--autoteste`: prova `cache_codex` com fixtures em memória — não chama `setup_env`, não
    escreve em disco, não exige `--target`."""
    meta = ("knowledge-agentics", "sarak", "1.0.0")
    home = Path("/home/fixture")
    sufixo = Path("plugins") / "cache" / "knowledge-agentics" / "sarak" / "1.0.0"
    casos = [
        ("com CODEX_HOME -> raiz e a variavel",
         cache_codex({"CODEX_HOME": "/outro/codex"}, home, meta) == Path("/outro/codex") / sufixo),
        ("sem CODEX_HOME -> raiz e <home>/.codex",
         cache_codex({}, home, meta) == home / ".codex" / sufixo),
        ("CODEX_HOME vazio conta como nao definido",
         cache_codex({"CODEX_HOME": ""}, home, meta) == home / ".codex" / sufixo),
        ("montagem: <raiz>/plugins/cache/<marketplace>/<plugin>/<versao>, nessa ordem",
         cache_codex({}, home, ("mkt", "plg", "9.9.9")).parts[-5:] == ("plugins", "cache", "mkt", "plg", "9.9.9")),
    ]
    falhas = 0
    for nome, ok in casos:
        print(f"  {'ok   ' if ok else 'FALHA'} {nome}")
        falhas += 0 if ok else 1
    print(f"\nautoteste (sync_ide.py): {len(casos) - falhas}/{len(casos)} ok")
    return 0 if falhas == 0 else 1


def main():
    if "--autoteste" in sys.argv[1:]:
        sys.exit(autoteste())
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

    if args.target in ["codex", "all"]:
        sync_codex(xskills_root)

    # A tabela é gerada de forma unificada (Antigravity e qualquer IDE sem plugin nativo)
    generate_routing_table(xskills_root)

    print("\nSincronização global concluída com sucesso!")


if __name__ == "__main__":
    main()
