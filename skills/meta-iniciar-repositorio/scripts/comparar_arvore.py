"""comparar_arvore.py — diferenca duas arvores de arquivos (uso: Bloco AF, plan-3.1.md).

    python comparar_arvore.py <arvore-a> <arvore-b> [--ignorar <glob> ...]
    python comparar_arvore.py --autoteste

Pensado para a pergunta do Bloco AF: a arvore que a skill produz (com a entrevista do code-modulo no
meio) diverge da que o script produz sozinho (init_repo.py rodando os dois modulos de uma vez)? A
resposta certa nao e binaria — cada divergencia e "so em A", "so em B" ou "presente nos dois com
conteudo diferente", e o item do plano manda classificar cada uma: prosa desatualizada, ou passo que
a skill faz e o script nao sabe fazer.

`comparar` e PURA: opera em dict {caminho-relativo: conteudo}, nunca toca disco — e o que o
`--autoteste` prova com fixtures em memoria. `ler_arvore` e a unica funcao que le disco, e so ela.
"""
import argparse
import fnmatch
import sys
from pathlib import Path

IGNORADOS_PADRAO = (".git", "node_modules", "__pycache__", ".ruff_cache", ".pytest_cache", ".mypy_cache")


def comparar(arvore_a: dict, arvore_b: dict) -> dict:
    """So_a: caminhos so em A. So_b: caminhos so em B. Difere: presente nos dois, conteudo diferente.
    Nenhuma das tres listas depende de disco — so dos dicts recebidos."""
    caminhos_a = set(arvore_a)
    caminhos_b = set(arvore_b)
    return {
        "so_a": sorted(caminhos_a - caminhos_b),
        "so_b": sorted(caminhos_b - caminhos_a),
        "difere": sorted(c for c in caminhos_a & caminhos_b if arvore_a[c] != arvore_b[c]),
    }


def _ignorado(partes: tuple, padroes: tuple) -> bool:
    return any(parte in IGNORADOS_PADRAO or any(fnmatch.fnmatch(parte, p) for p in padroes) for parte in partes)


def ler_arvore(raiz: Path, padroes_ignorados: tuple = ()) -> dict:
    """Unica funcao com I/O: percorre `raiz` e devolve {caminho-relativo-posix: conteudo-ou-None}.
    `None` marca binario/ilegivel como utf-8 — ainda conta para so_a/so_b, so nao para `difere`
    por conteudo (dois arquivos binarios com o mesmo caminho relativo sempre "diferem", de proposito:
    comparar binario byte a byte nao e o que este script existe para responder)."""
    arvore = {}
    for caminho in raiz.rglob("*"):
        if not caminho.is_file():
            continue
        relativo = caminho.relative_to(raiz)
        if _ignorado(relativo.parts, padroes_ignorados):
            continue
        try:
            conteudo = caminho.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            conteudo = None
        arvore[relativo.as_posix()] = conteudo
    return arvore


def _casos_de_autoteste() -> list:
    return [
        {
            "nome": "arvores identicas -> nenhuma divergencia",
            "a": {"x.txt": "1", "dir/y.txt": "2"},
            "b": {"x.txt": "1", "dir/y.txt": "2"},
            "esperado": {"so_a": [], "so_b": [], "difere": []},
        },
        {
            "nome": "arquivo so em A",
            "a": {"x.txt": "1", "extra.txt": "9"},
            "b": {"x.txt": "1"},
            "esperado": {"so_a": ["extra.txt"], "so_b": [], "difere": []},
        },
        {
            "nome": "arquivo so em B",
            "a": {"x.txt": "1"},
            "b": {"x.txt": "1", "extra.txt": "9"},
            "esperado": {"so_a": [], "so_b": ["extra.txt"], "difere": []},
        },
        {
            "nome": "mesmo caminho, conteudo diferente -> difere",
            "a": {"module.json": '{"generatesArtifact": false}'},
            "b": {"module.json": '{"generatesArtifact": true}'},
            "esperado": {"so_a": [], "so_b": [], "difere": ["module.json"]},
        },
        {
            "nome": "combinado: so_a + so_b + difere ao mesmo tempo",
            "a": {"comum.txt": "1", "so-a.txt": "a"},
            "b": {"comum.txt": "2", "so-b.txt": "b"},
            "esperado": {"so_a": ["so-a.txt"], "so_b": ["so-b.txt"], "difere": ["comum.txt"]},
        },
    ]


def rodar_autoteste() -> int:
    falhas = 0
    for caso in _casos_de_autoteste():
        resultado = comparar(caso["a"], caso["b"])
        ok = resultado == caso["esperado"]
        print(f"  {'ok   ' if ok else 'FALHA'} {caso['nome']}")
        if not ok:
            print(f"        esperado={caso['esperado']} obtido={resultado}")
            falhas += 1

    total = len(_casos_de_autoteste())
    print(f"\nautoteste (comparar_arvore): {total - falhas}/{total} ok")
    return 0 if falhas == 0 else 1


def get_args():
    parser = argparse.ArgumentParser(description="Diferenca duas arvores de arquivos.")
    parser.add_argument("arvore_a", nargs="?", help="Caminho da arvore A")
    parser.add_argument("arvore_b", nargs="?", help="Caminho da arvore B")
    parser.add_argument("--ignorar", nargs="*", default=(), help="Padroes glob extras a ignorar")
    parser.add_argument("--autoteste", action="store_true")
    return parser.parse_args()


def imprimir_resultado(resultado: dict) -> None:
    for rotulo, chave in (("so em A", "so_a"), ("so em B", "so_b"), ("difere (mesmo caminho)", "difere")):
        itens = resultado[chave]
        print(f"\n{rotulo}: {len(itens)}")
        for item in itens:
            print(f"  {item}")


def main() -> int:
    args = get_args()
    if args.autoteste:
        return rodar_autoteste()
    if not args.arvore_a or not args.arvore_b:
        print("uso: comparar_arvore.py <arvore-a> <arvore-b> [--ignorar <glob> ...]", file=sys.stderr)
        return 1

    arvore_a = ler_arvore(Path(args.arvore_a).resolve(), tuple(args.ignorar))
    arvore_b = ler_arvore(Path(args.arvore_b).resolve(), tuple(args.ignorar))
    resultado = comparar(arvore_a, arvore_b)
    imprimir_resultado(resultado)
    total_divergencias = len(resultado["so_a"]) + len(resultado["so_b"]) + len(resultado["difere"])
    print(f"\ntotal de divergencias: {total_divergencias}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
