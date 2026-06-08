"""
validar_contrato.py — Lint determinístico das ROTAS de uma spec OpenAPI contra o padrao Sarak:
prefixo /api/v1, segmentos kebab-case e sem verbo no path. Stdlib-only (regex sobre o texto da spec,
serve YAML e JSON). Apenas reporta — nao corrige.

Uso:
    python validar_contrato.py --raiz . [--config config.json]

Retorno:
    JSON {specs:[...], paths:[...], alertas:[{tipo, arquivo, linha, path, segmento}]}.

Regras (CLAUDE.md): zero hardcoded (prefixo/verbos/globs no config.json), responsabilidade unica
(so valida rotas — camelCase de payload e conformidade ficam para spectral/contract-testing na skill).
"""
import argparse
import json
import re
import sys
from fnmatch import fnmatch
from pathlib import Path

# Captura a chave de path: linha tipo `  /api/v1/orders:` (YAML) ou `"/api/v1/orders": {` (JSON).
RE_PATH = re.compile(r'^\s*["\']?(/[A-Za-z0-9_\-{}/]+)["\']?\s*:')
KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def encontrar_specs(raiz: Path, globs, ignorar) -> list:
    achados = []
    for caminho in raiz.rglob("*"):
        if any(parte in ignorar for parte in caminho.parts):
            continue
        if caminho.is_file() and any(fnmatch(caminho.name, g) for g in globs):
            achados.append(caminho)
    return achados


def extrair_paths(texto: str) -> list:
    paths = []
    for num, linha in enumerate(texto.splitlines(), start=1):
        m = RE_PATH.match(linha)
        if m and m.group(1).startswith("/"):
            paths.append((num, m.group(1)))
    return paths


def validar_path(arq: str, num: int, path: str, prefixo: str, verbos) -> list:
    alertas = []
    if not path.startswith(prefixo):
        alertas.append({"tipo": "prefixo_ausente", "arquivo": arq, "linha": num, "path": path, "segmento": prefixo})
    for seg in path.split("/"):
        if not seg or (seg.startswith("{") and seg.endswith("}")):
            continue
        if seg.lower() in verbos:
            alertas.append({"tipo": "verbo_no_path", "arquivo": arq, "linha": num, "path": path, "segmento": seg})
        elif not KEBAB.match(seg) and seg not in ("api", "v1", "v2", "v3"):
            alertas.append({"tipo": "segmento_nao_kebab", "arquivo": arq, "linha": num, "path": path, "segmento": seg})
    return alertas


def analisar_spec(caminho: Path, prefixo: str, verbos) -> dict:
    texto = caminho.read_text(encoding="utf-8", errors="ignore")
    arq = str(caminho)
    paths = extrair_paths(texto)
    alertas = [a for num, p in paths for a in validar_path(arq, num, p, prefixo, verbos)]
    return {"arquivo": arq, "paths": [p for _, p in paths], "alertas": alertas}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Lint de rotas do contrato OpenAPI (padrao Sarak).")
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

    prefixo = config.get("prefixo_obrigatorio", "/api/v1/")
    verbos = {v.lower() for v in config.get("verbos_proibidos", [])}
    ignorar = set(config.get("ignorar_dirs", []))
    analises = [analisar_spec(s, prefixo, verbos) for s in encontrar_specs(raiz, config.get("spec_globs", []), ignorar)]

    resultado = {
        "specs": [a["arquivo"] for a in analises],
        "paths": [p for a in analises for p in a["paths"]],
        "alertas": [al for a in analises for al in a["alertas"]],
    }
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
