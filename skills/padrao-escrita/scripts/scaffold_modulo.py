"""
scaffold_modulo.py — Gera o esqueleto de um módulo conforme o Padrão de Organização Sarak
(árvore-padrão de `references/PADRAO-ORGANIZACAO.md`): fatia vertical com `api/` (contrato público),
`domain/` e `data/` (privados) e `tests/`, em `backend/<modulo>` ou `frontend/<modulo>`.

Uso:
    python scaffold_modulo.py <nome-do-modulo> --tipo backend|frontend [--raiz .] [--config config.json]

Retorno:
    Imprime, em JSON, o módulo, o tipo e a lista de arquivos/pastas criados.

Regras (CLAUDE.md): zero hardcoded (a estrutura vem do config.json), zero segredos,
responsabilidade única (apenas cria o esqueleto — não escreve lógica de negócio).
Nunca sobrescreve arquivos existentes.
"""
import argparse
import json
import re
import sys
from pathlib import Path


def carregar_config(caminho_config: Path) -> dict:
    """Lê a definição de estrutura (subpastas, extensão, padrões). Nada é hardcoded no código."""
    return json.loads(caminho_config.read_text(encoding="utf-8"))


def validar_nome(nome: str, padrao_kebab: str) -> None:
    """Garante kebab-case. Lança ValueError se o nome violar o padrão."""
    if not re.fullmatch(padrao_kebab, nome):
        raise ValueError(f"Nome '{nome}' nao esta em kebab-case (padrao: {padrao_kebab}).")


def criar_arquivo(caminho: Path, conteudo: str) -> bool:
    """Cria um arquivo apenas se ele ainda nao existir. Retorna True se criou."""
    if caminho.exists():
        return False
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(conteudo, encoding="utf-8")
    return True


def comentario(ext: str, texto: str) -> str:
    """Linha de comentário no estilo da linguagem do arquivo (# para Python, // para o resto)."""
    marcador = "#" if ext == "py" else "//"
    return f"{marcador} {texto}\n"


def scaffold_estrutura(base: Path, estrutura: dict, ext: str) -> list:
    """Cria as subpastas da fatia vertical: com arquivos definidos vira stub; sem arquivos vira .gitkeep."""
    criados = []
    for subpasta, arquivos in estrutura.items():
        pasta = base / subpasta
        pasta.mkdir(parents=True, exist_ok=True)
        if not arquivos:
            if criar_arquivo(pasta / ".gitkeep", ""):
                criados.append(str(pasta / ".gitkeep"))
            continue
        for arq in arquivos:
            caminho = pasta / f"{arq}.{ext}"
            if criar_arquivo(caminho, comentario(ext, f"{subpasta}/{arq} — responsabilidade unica.")):
                criados.append(str(caminho))
    return criados


def gerar_config_modulo(base: Path, nome_arquivo: str) -> str | None:
    """Cria o config.json (NAO secreto) co-localizado do módulo."""
    arquivo = base / nome_arquivo
    conteudo = json.dumps(
        {"_comentario": "Config NAO secreta do modulo. Segredos vao no .env, nunca aqui."},
        ensure_ascii=False,
        indent=2,
    ) + "\n"
    return str(arquivo) if criar_arquivo(arquivo, conteudo) else None


def main() -> None:
    parser = argparse.ArgumentParser(description="Scaffold de modulo no Padrao de Organizacao Sarak.")
    parser.add_argument("nome", help="Nome do modulo em kebab-case (ex: payment-methods)")
    parser.add_argument("--tipo", required=True, choices=["backend", "frontend"])
    parser.add_argument("--raiz", default=".", help="Raiz do projeto (padrao: diretorio atual)")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"),
                        help="Caminho do config.json que define a estrutura")
    args = parser.parse_args()

    try:
        config = carregar_config(Path(args.config))
        validar_nome(args.nome, config["padrao_kebab"])
    except FileNotFoundError:
        sys.exit(f"Erro: config nao encontrado em '{args.config}'.")
    except ValueError as erro:
        sys.exit(f"Erro: {erro}")

    tipo_cfg = config["tipos"][args.tipo]
    base = Path(args.raiz) / tipo_cfg["pasta_raiz"] / args.nome
    base.mkdir(parents=True, exist_ok=True)

    criados = scaffold_estrutura(base, tipo_cfg["estrutura"], tipo_cfg["extensao"])

    if tipo_cfg.get("config_modulo"):
        config_criado = gerar_config_modulo(base, config["config_modulo_nome"])
        if config_criado:
            criados.append(config_criado)

    print(json.dumps(
        {"modulo": args.nome, "tipo": args.tipo, "criados": criados},
        ensure_ascii=False,
        indent=2,
    ))


if __name__ == "__main__":
    main()
