"""
auditar_docs.py — Auditoria determinística da documentação de um projeto.

Uso:
    python auditar_docs.py --raiz . [--config auditar_docs.config.json]

Retorno:
    JSON com {readme_presente, secoes_faltando, docs_dir_presente, license_presente, modulos_sem_readme}.

Regras (CLAUDE.md): zero hardcoded (seções/raízes/globs no config.json),
responsabilidade única (apenas audita e reporta — não escreve documentação).
"""
import argparse
import json
import sys
from fnmatch import fnmatch
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def ler_headings(caminho: Path) -> list:
    """Retorna os títulos markdown (linhas iniciadas por #), sem o # e em minúsculas."""
    linhas = caminho.read_text(encoding="utf-8", errors="ignore").splitlines()
    return [l.strip().lstrip("#").strip().lower() for l in linhas if l.lstrip().startswith("#")]


def secoes_faltando(readme: Path, obrigatorias) -> list:
    if not readme.exists():
        return list(obrigatorias)
    headings = ler_headings(readme)
    return [sec for sec in obrigatorias if not any(sec.lower() in h for h in headings)]


def tem_license(raiz: Path, globs) -> bool:
    for p in raiz.iterdir():
        if p.is_file() and any(fnmatch(p.name, g) for g in globs):
            return True
    return False


def modulos_sem_readme(raiz: Path, roots, readme_nome) -> list:
    faltando = []
    for root in roots:
        base = raiz / root
        if not base.is_dir():
            continue
        for mod in base.iterdir():
            if mod.is_dir() and not (mod / readme_nome).exists():
                faltando.append(str(mod))
    return faltando


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Auditoria de documentacao de projeto.")
    parser.add_argument("--raiz", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "auditar_docs.config.json"))
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

    readme_nome = config.get("readme_nome", "README.md")
    readme = raiz / readme_nome

    resultado = {
        "readme_presente": readme.exists(),
        "secoes_faltando": secoes_faltando(readme, config.get("secoes_obrigatorias", [])),
        "docs_dir_presente": (raiz / config.get("docs_dir", "docs")).is_dir(),
        "license_presente": tem_license(raiz, config.get("license_globs", ["LICENSE*"])),
        "modulos_sem_readme": modulos_sem_readme(raiz, config.get("module_roots", []), readme_nome),
    }
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
