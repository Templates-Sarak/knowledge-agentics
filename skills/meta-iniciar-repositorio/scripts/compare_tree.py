"""compare_tree.py — diferenca duas arvores de arquivos.

    python compare_tree.py <tree-a> <tree-b> [--ignore <glob> ...]
    python compare_tree.py --selftest

Pensado para a pergunta: a arvore que a skill produz (com a entrevista do code-modulo no
meio) diverge da que o script produz sozinho (init_repo.py rodando os dois modulos de uma vez)? A
resposta certa nao e binaria — cada divergencia e "so em A" (`only_a`), "so em B" (`only_b`) ou
"presente nos dois com conteudo diferente" (`differs`), e o item do plano manda classificar cada
uma: prosa desatualizada, ou passo que a skill faz e o script nao sabe fazer.

`compare` e PURA: opera em dict {caminho-relativo: conteudo}, nunca toca disco — e o que o
`--selftest` prova com fixtures em memoria. `read_tree` e a unica funcao que le disco, e so ela.
"""

import argparse
import fnmatch
import sys
from pathlib import Path

DEFAULT_IGNORED = (
    ".git",
    "node_modules",
    "__pycache__",
    ".ruff_cache",
    ".pytest_cache",
    ".mypy_cache",
)


def compare(tree_a: dict, tree_b: dict) -> dict:
    """only_a: caminhos so em A. only_b: caminhos so em B. differs: presente nos dois, conteudo
    diferente. Nenhuma das tres listas depende de disco — so dos dicts recebidos."""
    paths_a = set(tree_a)
    paths_b = set(tree_b)
    return {
        "only_a": sorted(paths_a - paths_b),
        "only_b": sorted(paths_b - paths_a),
        "differs": sorted(p for p in paths_a & paths_b if tree_a[p] != tree_b[p]),
    }


def _is_ignored(parts: tuple, patterns: tuple) -> bool:
    return any(
        part in DEFAULT_IGNORED or any(fnmatch.fnmatch(part, p) for p in patterns)
        for part in parts
    )


def read_tree(root: Path, ignored_patterns: tuple = ()) -> dict:
    """Unica funcao com I/O: percorre `root` e devolve {caminho-relativo-posix: conteudo-ou-None}.
    `None` marca binario/ilegivel como utf-8 — ainda conta para only_a/only_b, so nao para `differs`
    por conteudo (dois arquivos binarios com o mesmo caminho relativo sempre "diferem", de proposito:
    comparar binario byte a byte nao e o que este script existe para responder)."""
    tree = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if _is_ignored(relative.parts, ignored_patterns):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            content = None
        tree[relative.as_posix()] = content
    return tree


def _selftest_cases() -> list:
    return [
        {
            "name": "identical trees -> no divergence",
            "a": {"x.txt": "1", "dir/y.txt": "2"},
            "b": {"x.txt": "1", "dir/y.txt": "2"},
            "expected": {"only_a": [], "only_b": [], "differs": []},
        },
        {
            "name": "file only in A",
            "a": {"x.txt": "1", "extra.txt": "9"},
            "b": {"x.txt": "1"},
            "expected": {"only_a": ["extra.txt"], "only_b": [], "differs": []},
        },
        {
            "name": "file only in B",
            "a": {"x.txt": "1"},
            "b": {"x.txt": "1", "extra.txt": "9"},
            "expected": {"only_a": [], "only_b": ["extra.txt"], "differs": []},
        },
        {
            "name": "same path, different content -> differs",
            "a": {"module.json": '{"generatesArtifact": false}'},
            "b": {"module.json": '{"generatesArtifact": true}'},
            "expected": {"only_a": [], "only_b": [], "differs": ["module.json"]},
        },
        {
            "name": "combined: only_a + only_b + differs at once",
            "a": {"common.txt": "1", "only-a.txt": "a"},
            "b": {"common.txt": "2", "only-b.txt": "b"},
            "expected": {
                "only_a": ["only-a.txt"],
                "only_b": ["only-b.txt"],
                "differs": ["common.txt"],
            },
        },
    ]


def run_selftest() -> int:
    failures = 0
    for case in _selftest_cases():
        result = compare(case["a"], case["b"])
        ok = result == case["expected"]
        print(f"  {'ok   ' if ok else 'FAIL '} {case['name']}")
        if not ok:
            print(f"        expected={case['expected']} got={result}")
            failures += 1

    total = len(_selftest_cases())
    print(f"\nselftest (compare_tree): {total - failures}/{total} ok")
    return 0 if failures == 0 else 1


def get_args():
    parser = argparse.ArgumentParser(description="Diff two file trees.")
    parser.add_argument("tree_a", nargs="?", help="Path of tree A")
    parser.add_argument("tree_b", nargs="?", help="Path of tree B")
    parser.add_argument(
        "--ignore", nargs="*", default=(), help="Extra glob patterns to ignore"
    )
    parser.add_argument("--selftest", action="store_true")
    return parser.parse_args()


def print_result(result: dict) -> None:
    for label, key in (
        ("only in A", "only_a"),
        ("only in B", "only_b"),
        ("differs (same path)", "differs"),
    ):
        items = result[key]
        print(f"\n{label}: {len(items)}")
        for item in items:
            print(f"  {item}")


def main() -> int:
    args = get_args()
    if args.selftest:
        return run_selftest()
    if not args.tree_a or not args.tree_b:
        print(
            "usage: compare_tree.py <tree-a> <tree-b> [--ignore <glob> ...]",
            file=sys.stderr,
        )
        return 1

    tree_a = read_tree(Path(args.tree_a).resolve(), tuple(args.ignore))
    tree_b = read_tree(Path(args.tree_b).resolve(), tuple(args.ignore))
    result = compare(tree_a, tree_b)
    print_result(result)
    total_divergences = (
        len(result["only_a"]) + len(result["only_b"]) + len(result["differs"])
    )
    print(f"\ntotal divergences: {total_divergences}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
