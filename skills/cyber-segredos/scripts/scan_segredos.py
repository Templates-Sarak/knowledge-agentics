"""
scan_segredos.py — Varre arquivos do projeto (working tree) em busca de segredos hardcoded.

Lê o CATÁLOGO CANÔNICO de padrões (config.json desta skill) — a mesma fonte que os scanners do git
(git-verificacao-commit, git-especialista-repositorio) referenciam.

Uso:
    python scan_segredos.py --raiz . [--config config.json]
    # para o bundle do front, aponte para a pasta de build: --raiz dist  (ou build/.next)

Retorno:
    JSON {total, achados:[{arquivo, linha, tipo, trecho_mascarado}]}. Segredos sempre mascarados.

Regras (CLAUDE.md): zero hardcoded (padrões no config.json), nenhum segredo exposto no output,
responsabilidade única (apenas detecta — a correção/rotação é decisão com HITL na skill).
"""
import argparse
import json
import re
import sys
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def listar_arquivos(raiz: Path, extensoes, ignorar_dirs, tam_max):
    for caminho in raiz.rglob("*"):
        if not caminho.is_file():
            continue
        if any(parte in ignorar_dirs for parte in caminho.parts):
            continue
        if extensoes and caminho.suffix not in extensoes and caminho.name not in extensoes:
            continue
        try:
            if tam_max and caminho.stat().st_size > tam_max:
                continue
        except OSError:
            continue
        yield caminho


def mascarar(trecho: str) -> str:
    trecho = trecho.strip()
    return "****" if len(trecho) <= 8 else f"{trecho[:4]}...{trecho[-2:]}"


def escanear(caminho: Path, padroes) -> list:
    try:
        linhas = caminho.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return []
    achados = []
    for num, linha in enumerate(linhas, start=1):
        for tipo, regex in padroes:
            m = regex.search(linha)
            if m:
                achados.append({"arquivo": str(caminho), "linha": num, "tipo": tipo,
                                "trecho_mascarado": mascarar(m.group(0))})
                break
    return achados


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Scanner de segredos hardcoded (working tree).")
    parser.add_argument("--raiz", default=".", help="Raiz a varrer (ex.: . ou dist/ para o bundle)")
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

    padroes = [(tipo, re.compile(rx)) for tipo, rx in config["padroes"].items()]
    achados = []
    for caminho in listar_arquivos(raiz, config.get("extensoes_texto", []),
                                   set(config.get("ignorar_dirs", [])),
                                   config.get("tamanho_max_arquivo_bytes")):
        achados.extend(escanear(caminho, padroes))

    print(json.dumps({"total": len(achados), "achados": achados}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
