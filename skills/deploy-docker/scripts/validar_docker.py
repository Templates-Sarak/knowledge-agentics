"""
validar_docker.py — Valida a imagem de um modulo: nao-root, .dockerignore, sem tag :latest,
sem segredo/.env na imagem. Apenas reporta (nao builda nada).

Uso:
    python validar_docker.py --raiz . [--config config.json]

Retorno:
    JSON {dockerignore_presente, dockerfiles:[...], alertas:[{tipo, arquivo, linha, trecho}]}.

Regras (CLAUDE.md): zero hardcoded (listas/padroes no config.json), responsabilidade unica
(apenas valida e reporta — build/push e decisao com HITL na skill).
"""
import argparse
import json
import re
import sys
from fnmatch import fnmatch
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def encontrar_dockerfiles(raiz: Path, globs, ignorar) -> list:
    achados = []
    for caminho in raiz.rglob("*"):
        if any(parte in ignorar for parte in caminho.parts):
            continue
        if caminho.is_file() and any(fnmatch(caminho.name, g) for g in globs):
            achados.append(caminho)
    return achados


def _ref_from(linha: str) -> str:
    partes = linha.split()
    return partes[1] if len(partes) > 1 else ""


def _eh_latest(ref: str) -> bool:
    tag = ref.split("@")[0]
    nome = tag.split("/")[-1]
    return tag.endswith(":latest") or ":" not in nome


def analisar_dockerfile(caminho: Path, nomes_segredo) -> dict:
    alertas = []
    tem_naoroot = False
    for num, bruta in enumerate(caminho.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
        linha = bruta.strip()
        chave = linha.split()[0].upper() if linha else ""
        if chave == "FROM" and _eh_latest(_ref_from(linha)):
            alertas.append({"tipo": "tag_latest", "arquivo": str(caminho), "linha": num, "trecho": _ref_from(linha)})
        if chave == "USER":
            alvo = linha.split()[1].lower() if len(linha.split()) > 1 else "root"
            tem_naoroot = tem_naoroot or alvo not in ("root", "0", "0:0")
        if chave in ("COPY", "ADD") and re.search(r"(^|\s)\.env(\s|$)", linha) and ".env.example" not in linha:
            alertas.append({"tipo": "copia_env", "arquivo": str(caminho), "linha": num, "trecho": linha})
        if chave in ("ARG", "ENV") and any(s in linha.lower() for s in nomes_segredo):
            alertas.append({"tipo": "segredo_no_build", "arquivo": str(caminho), "linha": num, "trecho": linha})
    if not tem_naoroot:
        alertas.append({"tipo": "sem_usuario_naoroot", "arquivo": str(caminho), "linha": 0, "trecho": ""})
    return {"arquivo": str(caminho), "alertas": alertas}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Validacao de imagem Docker (nao-root, latest, segredo).")
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

    ignorar = set(config.get("ignorar_dirs", []))
    dockerfiles = encontrar_dockerfiles(raiz, config.get("dockerfile_globs", []), ignorar)
    nomes_segredo = [s.lower() for s in config.get("nomes_segredo_build", [])]
    analises = [analisar_dockerfile(d, nomes_segredo) for d in dockerfiles]

    resultado = {
        "dockerignore_presente": (raiz / ".dockerignore").exists(),
        "dockerfiles": [a["arquivo"] for a in analises],
        "alertas": [al for a in analises for al in a["alertas"]],
    }
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
