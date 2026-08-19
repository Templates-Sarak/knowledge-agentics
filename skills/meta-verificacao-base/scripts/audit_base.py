import os
import re
import json
import subprocess
import argparse
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponteiros import alvo_de_caminho, auditar_ponteiros  # noqa: E402
from limiares import (  # noqa: E402
    auditar_limiares,
    divergencias,
    limiares_de_dict_config,
    limiares_de_texto_mjs,
)


def get_args():
    parser = argparse.ArgumentParser(description="Auditoria Sarak X-Skills Base")
    parser.add_argument("--raiz", help="Caminho raiz do repositório X-Skills")
    parser.add_argument(
        "--autoteste",
        action="store_true",
        help="Roda a suite interna, nao toca disco fora do repo",
    )
    return parser.parse_args()


def autoteste():
    """Prova que `alvo_de_caminho` trata caminho de PROJETO GERADO (`specs/arquitetura/`,
    `contract/`, `core/`, `modules/`, `api/`, `tools/` — a mesma lista do comentario acima de
    PREFIXOS_DA_BASE) como fora de alcance, e caminho da BASE como resolvivel."""
    falhas = []
    de_projeto_gerado = (
        "specs/arquitetura/04-regras.md",
        "contract/openapi.yaml",
        "core/domain/item.ts",
        "modules/catalogo/module.json",
        "api/src/index.ts",
        "tools/gate/validate.mjs",
    )
    for token in de_projeto_gerado:
        alvo = alvo_de_caminho(token, dono=None)
        if alvo is not None:
            falhas.append(
                f"caminho de projeto gerado deveria ficar fora de alcance: {token!r} -> {alvo!r}"
            )
    da_base = "skills/git-verificacao-commit/scripts/gerar_config.py"
    if alvo_de_caminho(da_base, dono=None) != da_base:
        falhas.append(f"caminho da base deveria resolver identico: {da_base!r}")

    # Tarefa 1: comparador de limiares (thresholds.mjs vs config.json) tem que pegar divergencia
    # E reprovar quando o formato de thresholds.mjs muda de jeito inesperado (fail-closed).
    mjs_ok = "export const LIMIARES = {\n  linhasFuncao: 40,\n  aninhamento: 3,\n  parametros: 4,\n};\n"
    esperado = {"linhasFuncao": 40, "aninhamento": 3, "parametros": 4}
    if limiares_de_texto_mjs(mjs_ok) != esperado:
        falhas.append(
            "limiares_de_texto_mjs deveria extrair o trio de um thresholds.mjs valido"
        )
    if limiares_de_texto_mjs("export const OUTRACOISA = { x: 1 };") is not None:
        falhas.append(
            "limiares_de_texto_mjs deveria reprovar (None) quando LIMIARES nao existe"
        )
    if (
        limiares_de_texto_mjs("export const LIMIARES = { linhasFuncao: 40 };")
        is not None
    ):
        falhas.append(
            "limiares_de_texto_mjs deveria reprovar (None) quando falta uma das tres chaves"
        )
    config_igual = {"maxFunctionLines": 40, "maxNesting": 3, "maxParams": 4}
    if divergencias(esperado, limiares_de_dict_config(config_igual), "fixture") != []:
        falhas.append("divergencias nao deveria achar nada quando os trios sao iguais")
    config_diferente = {"maxFunctionLines": 50, "maxNesting": 3, "maxParams": 4}
    achado_divergente = divergencias(
        esperado, limiares_de_dict_config(config_diferente), "fixture"
    )
    if len(achado_divergente) != 1 or "linhasFuncao" not in achado_divergente[0]:
        falhas.append(
            "divergencias deveria achar exatamente a chave que diverge (linhasFuncao)"
        )
    if len(divergencias(esperado, None, "fixture")) != 1:
        falhas.append("divergencias deveria reprovar quando o config.json nao resolve")

    for falha in falhas:
        print(f"  falha  {falha}")
    if falhas:
        print(f"autoteste (audit_base): {len(falhas)} falha(s)")
        return 1
    print("autoteste (audit_base): 13/13 ok")
    return 0


def audit_base(base_dir):
    report = {
        "agents": [],
        "commands": [],
        "hooks": [],
        "skills": [],
        "ponteiros": [],
        "vazamentos": [],
        "limiares": [],
    }

    # 1. Agents
    agents_dir = os.path.join(base_dir, "agents")
    if os.path.exists(agents_dir):
        for file in os.listdir(agents_dir):
            if not file.endswith(".md"):
                continue
            path = os.path.join(agents_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            if "EXCLUSIVAMENTE" not in content and "JSON" not in content:
                report["agents"].append(
                    f"[{file}] Faltando contrato estrito de saída JSON."
                )
            if "name:" not in content or "description:" not in content:
                report["agents"].append(
                    f"[{file}] Frontmatter incompleto (name/description)."
                )

    # 2. Commands
    commands_dir = os.path.join(base_dir, "commands")
    if os.path.exists(commands_dir):
        for file in os.listdir(commands_dir):
            if not file.endswith(".md"):
                continue
            path = os.path.join(commands_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            for line in content.split("\n"):
                if line.startswith("description:"):
                    if ": " in line[12:].strip():
                        report["commands"].append(
                            f"[{file}] Armadilha YAML na description (dois pontos seguidos de espaço)."
                        )

    # 3. Hooks
    hooks_dir = os.path.join(base_dir, "hooks")
    if os.path.exists(hooks_dir):
        for file in os.listdir(hooks_dir):
            path = os.path.join(hooks_dir, file)
            if file.endswith(".json"):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        json.load(f)
                except Exception as e:
                    report["hooks"].append(f"[{file}] JSON inválido: {str(e)}")
            elif file.endswith(".js"):
                try:
                    subprocess.run(
                        ["node", "-c", path], check=True, capture_output=True, text=True
                    )
                except subprocess.CalledProcessError as e:
                    report["hooks"].append(
                        f"[{file}] Erro sintático JS: {e.stderr.strip()}"
                    )

    # 4. Skills
    skills_dir = os.path.join(base_dir, "skills")
    if os.path.exists(skills_dir):
        for skill_folder in os.listdir(skills_dir):
            skill_path = os.path.join(skills_dir, skill_folder, "SKILL.md")
            if os.path.exists(skill_path):
                with open(skill_path, "r", encoding="utf-8") as f:
                    content = f.read()
                for line in content.split("\n"):
                    if line.startswith("description:"):
                        if ": " in line[12:].strip():
                            report["skills"].append(
                                f"[{skill_folder}] Armadilha YAML na description."
                            )

    # 5. Ponteiros orfaos (caminho citado e nome de artefato citado) — ver ponteiros.py
    report["ponteiros"] = auditar_ponteiros(base_dir)

    # 5b. Limiares 40/3/4: thresholds.mjs (fonte unica) vs config.json de cada padrao-<linguagem>
    report["limiares"] = auditar_limiares(base_dir)

    # 6. Vazamentos
    patterns = {
        "AWS_AKIA": r"AKIA[0-9A-Z]{16}",
        "PrivateKey": r"-----BEGIN .* PRIVATE KEY-----",
        "GenericSecret": r"(?i)(api_key|secret|password|token)[\"']?\s*[:=]\s*[\"'][a-zA-Z0-9\-_]{16,}[\"']",
    }

    # Este arquivo DEFINE os padroes acima — varre-lo faz cada padrao casar consigo mesmo e
    # reportar um vazamento que nao existe. Auto-deteccao e falso positivo, nao achado.
    eu_mesmo = os.path.abspath(__file__)

    for root, _, files in os.walk(base_dir):
        if (
            ".git" in root
            or "node_modules" in root
            or ".venv" in root
            or "mcp-servers" in root
        ):
            continue
        for file in files:
            if not file.endswith((".md", ".js", ".json", ".py")):
                continue
            path = os.path.join(root, file)
            if os.path.abspath(path) == eu_mesmo:
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    for name, pat in patterns.items():
                        if re.search(pat, content):
                            report["vazamentos"].append(
                                f"{name} encontrado em {os.path.relpath(path, base_dir)}"
                            )
            except:
                pass

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    args = get_args()
    if args.autoteste:
        exit(autoteste())
    if not args.raiz or not os.path.exists(args.raiz):
        print(json.dumps({"error": "Caminho raiz não encontrado"}))
        exit(1)
    audit_base(args.raiz)
