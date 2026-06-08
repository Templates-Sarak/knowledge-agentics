"""
validar_predeploy.py — Validacao pre-deploy: config de build, env vars exigidas e segredos versionados.

Uso:
    python validar_predeploy.py --raiz . [--config config.json]

Retorno:
    JSON com {config_build, env_requeridas, alertas}.

Regras (CLAUDE.md): zero hardcoded (listas no config.json),
responsabilidade única (apenas valida e reporta — não publica nada).
"""
import argparse
import json
import re
import sys
from fnmatch import fnmatch
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def checar_config_build(raiz: Path, arquivos) -> dict:
    return {nome: (raiz / nome).exists() for nome in arquivos}


def ler_env_requeridas(raiz: Path, env_example: str) -> list:
    caminho = raiz / env_example
    if not caminho.exists():
        return []
    variaveis = []
    for linha in caminho.read_text(encoding="utf-8", errors="ignore").splitlines():
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            variaveis.append(linha.split("=", 1)[0].strip())
    return variaveis


def detectar_segredos_versionados(raiz: Path, proibidos, padroes, ignorar_dirs) -> list:
    alertas = []
    for caminho in raiz.rglob("*"):
        if any(parte in ignorar_dirs for parte in caminho.parts):
            continue
        if caminho.is_file() and any(fnmatch(caminho.name, p) for p in proibidos):
            alertas.append({"tipo": "arquivo_proibido", "arquivo": str(caminho)})

    regex = [re.compile(rx) for rx in padroes]
    alvo = raiz / "vercel.json"
    if alvo.exists():
        for num, linha in enumerate(alvo.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
            if any(r.search(linha) for r in regex):
                alertas.append({"tipo": "segredo_em_config", "arquivo": str(alvo), "linha": num})
    return alertas


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Validacao pre-deploy Vercel.")
    parser.add_argument("--raiz", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    args = parser.parse_args()

    try:
        config = carregar_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Erro: config nao encontrado em '{args.config}'.")
    except json.JSONDecodeError as erro:
        sys.exit(f"Erro: config invalido ({erro}).")

    raiz = Path(args.raiz)
    if not raiz.exists():
        sys.exit(f"Erro: raiz '{raiz}' nao existe.")

    resultado = {
        "config_build": checar_config_build(raiz, config.get("arquivos_config_build", [])),
        "env_requeridas": ler_env_requeridas(raiz, config.get("env_example", ".env.example")),
        "alertas": detectar_segredos_versionados(
            raiz,
            config.get("arquivos_segredo_proibidos", []),
            config.get("padroes_segredo", []),
            set(config.get("ignorar_dirs", [])),
        ),
    }
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
