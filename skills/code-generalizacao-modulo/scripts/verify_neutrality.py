"""verify_neutrality.py — degrau 6: o modulo generico nao carrega rastro da origem.

    python verify_neutrality.py --root <repo-ou-modulo> --denylist <arquivo> [--json]
    python verify_neutrality.py --root <caminho> --term shop --term "My Shop" [--json]
    python verify_neutrality.py --selftest

Varre TODO texto do entregavel — codigo, teste, fixture, seed, migration, contrato, README, ADR,
`.env.example`, JSON de config — atras dos termos da denylist, e devolve exit 1 na primeira ocorrencia.
E a unica prova mecanica de que "generico" nao e opiniao: sem ela, "sem rastro da origem" e uma
afirmacao que ninguem conferiu, e o rastro que sobrevive e sempre o mesmo — comentario, exemplo de
`openapi.yaml`, nome em fixture e dado de seed, onde ninguem olha depois do primeiro dia.

**Por que casa variante, e nao a string crua.** O termo "My Shop" aparece no codigo como
`myShop`, `my_shop`, `my-shop`, `MY_SHOP` e `myshop`. Uma denylist que so casasse a
forma escrita passaria por todas elas — e daria verde justamente onde o vazamento e mais provavel.
Por isso cada termo vira um padrao com separador opcional entre as palavras, ancorado em fronteira
alfanumerica (para `shop` nao acusar `reshopping`).

**Fail-closed:** denylist vazia REPROVA. Uma varredura sem termo nenhum acha zero ocorrencia e
pareceria verde — o resultado mais perigoso que este script poderia produzir.
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Extensoes de texto que entram na varredura. O resto (binario, imagem, lockfile) fica de fora: nao
# guarda prosa e infla o ruido. `sem sufixo` (Dockerfile, LICENSE) entra pela lista de nomes abaixo.
TEXT_EXTENSIONS = frozenset(
    {
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".py",
        ".sql",
        ".yaml",
        ".yml",
        ".json",
        ".md",
        ".txt",
        ".env",
        ".example",
        ".html",
        ".css",
        ".sh",
        ".toml",
        ".ini",
        ".cfg",
        ".xml",
        ".csv",
    }
)
SUFFIXLESS_NAMES = frozenset(
    {"Dockerfile", "Makefile", ".env.example", ".gitignore", ".dockerignore"}
)
IGNORED_DIRS = frozenset(
    {
        "node_modules",
        "dist",
        "build",
        ".git",
        "__pycache__",
        ".venv",
        "coverage",
        ".ruff_cache",
    }
)

# ==================================================================================================
# NUCLEO — puro. Nada daqui ate a marca "CASCA" toca disco, rede ou processo.
# ==================================================================================================


def variants(term: str) -> str:
    """Padrao que casa o termo em qualquer convencao de escrita de codigo.

    "My Shop" -> casa myShop, my_shop, my-shop, MY SHOP e myshop; NAO casa
    "reshopping" (a ancora exige fronteira alfanumerica dos dois lados).
    """
    words = [re.escape(p) for p in re.split(r"[\s_\-]+", term.strip()) if p]
    if not words:
        return ""
    return r"(?<![A-Za-z0-9])" + r"[\s_\-]?".join(words) + r"(?![A-Za-z0-9])"


def compile_denylist(terms: list[str]) -> list[tuple[str, re.Pattern]]:
    """Cada termo vira (termo original, padrao compilado case-insensitive). Termo vazio e descartado."""
    compiled = []
    for term in terms:
        pattern = variants(term)
        if pattern:
            compiled.append((term.strip(), re.compile(pattern, re.IGNORECASE)))
    return compiled


def scan_text(text: str, denylist: list[tuple[str, re.Pattern]]) -> list[dict]:
    """Ocorrencias de qualquer termo da denylist, com numero de linha e o trecho onde caiu."""
    findings = []
    for number, line in enumerate(text.splitlines(), start=1):
        for term, pattern in denylist:
            if pattern.search(line):
                findings.append(
                    {"line": number, "term": term, "snippet": line.strip()[:120]}
                )
    return findings


def is_text_file(name: str, suffix: str) -> bool:
    """Decide se o arquivo entra na varredura, pelo nome exato ou pela extensao."""
    return name in SUFFIXLESS_NAMES or suffix.lower() in TEXT_EXTENSIONS


def decide_verdict(findings: list[dict], denylist_empty: bool) -> tuple[int, str]:
    """Exit code + frase do veredito. Denylist vazia REPROVA — zero achado ali nao e verde, e cegueira."""
    if denylist_empty:
        return (
            2,
            "REJECTED — empty denylist: a scan with no term proves nothing",
        )
    if findings:
        return 1, f"REJECTED — {len(findings)} occurrence(s) of the source in the deliverable"
    return 0, "OK — no source term found in the deliverable"


# ==================================================================================================
# CASCA — daqui para baixo le disco. Nenhuma decisao: so coleta e imprime.
# ==================================================================================================


def _text_files(root: Path):
    """Todo arquivo de texto sob a raiz, pulando pasta de build e de dependencia."""
    for path in root.rglob("*"):
        if not path.is_file() or IGNORED_DIRS & set(path.parts):
            continue
        if is_text_file(path.name, path.suffix):
            yield path


def scan_tree(root: Path, denylist: list[tuple[str, re.Pattern]]) -> list[dict]:
    """Aplica a denylist a arvore inteira, devolvendo os achados com o caminho relativo de cada um."""
    findings = []
    for path in _text_files(root):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for finding in scan_text(text, denylist):
            findings.append(
                {"file": str(path.relative_to(root)).replace("\\", "/"), **finding}
            )
    return findings


def load_terms(denylist_path: str | None, cli_terms: list[str]) -> list[str]:
    """Termos do arquivo (um por linha, `#` e comentario) somados aos passados em `--term`."""
    terms = list(cli_terms)
    if denylist_path:
        raw = Path(denylist_path).read_text(encoding="utf-8", errors="replace")
        terms += [
            ln.strip()
            for ln in raw.splitlines()
            if ln.strip() and not ln.strip().startswith("#")
        ]
    return terms


def _matching_cases(deny: list[tuple[str, re.Pattern]]) -> list[str]:
    """Casos de casamento — as variantes de escrita que precisam cair, e as que nao podem cair."""
    failures = []

    positives = [
        "const myShop = 1",
        "MY_SHOP=x",
        "-- my-shop",
        "url: myshop.com",
        "// checkout here",
    ]
    for case in positives:
        if not scan_text(case, deny):
            failures.append(f"variant not detected: {case!r}")

    for case in ["const reshopping = 1", "precheckoutx", "shop generic"]:
        if scan_text(case, deny):
            failures.append(f"false positive: {case!r}")

    finding = scan_text("line one\nconst checkout = 2\n", deny)
    if finding != [{"line": 2, "term": "checkout", "snippet": "const checkout = 2"}]:
        failures.append(f"scan_text lost the line number: {finding}")
    return failures


def _verdict_cases() -> list[str]:
    """Casos do veredito — o fail-closed da denylist vazia e os exit codes."""
    failures = []

    if compile_denylist(["", "   "]):
        failures.append("compile_denylist accepted an empty term")

    if decide_verdict([], True)[0] != 2:
        failures.append(
            "empty denylist did not reject — the fail-open this script exists to prevent"
        )
    if (
        decide_verdict([], False)[0] != 0
        or decide_verdict([{"x": 1}], False)[0] != 1
    ):
        failures.append("decide_verdict got the exit code wrong")
    return failures


def run_selftest() -> int:
    """Prova o NUCLEO com fixtures em memoria, sem tocar disco."""
    deny = compile_denylist(["My Shop", "checkout"])
    failures = _matching_cases(deny) + _verdict_cases()
    for failure in failures:
        print(f"[FAIL] {failure}")
    print(
        f"[{'OK' if not failures else 'ERROR'}] selftest of verify_neutrality: {len(failures)} failure(s)"
    )
    return 1 if failures else 0


def _parser() -> argparse.ArgumentParser:
    """CLI do script. Separada do `main` para manter as duas dentro do limiar de tamanho."""
    parser = argparse.ArgumentParser(
        description="Step 6 — proves the deliverable does not cite the source."
    )
    parser.add_argument("--root", help="Repository (or module directory) to scan.")
    parser.add_argument(
        "--denylist", help="File with the source terms, one per line."
    )
    parser.add_argument(
        "--term", action="append", default=[], help="Single term (repeatable)."
    )
    parser.add_argument(
        "--json", action="store_true", help="Print the findings as JSON."
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="Prove the core with in-memory fixtures.",
    )
    return parser


def _print_human(
    root: Path, denylist: list, findings: list[dict], verdict: tuple[int, str]
) -> None:
    """Relatorio legivel dos achados — o `--json` continua sendo a saida para maquina."""
    code, phrase = verdict
    print(f"\n--- Neutrality: {root.name} ({len(denylist)} term(s) in the denylist) ---")
    for finding in findings:
        print(
            f"  {finding['file']}:{finding['line']}  [{finding['term']}]  {finding['snippet']}"
        )
    print(f"\n[{'OK' if code == 0 else 'ERROR'}] {phrase}")


def main() -> int:
    parser = _parser()
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()
    if not args.root:
        parser.error("--root is required (or use --selftest)")

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"[ERROR] {root} is not a directory.", file=sys.stderr)
        return 2

    denylist = compile_denylist(load_terms(args.denylist, args.term))
    findings = scan_tree(root, denylist) if denylist else []
    code, verdict = decide_verdict(findings, not denylist)

    if args.json:
        print(
            json.dumps(
                {"verdict": verdict, "code": code, "findings": findings},
                indent=2,
                ensure_ascii=False,
            )
        )
        return code

    _print_human(root, denylist, findings, (code, verdict))
    return code


if __name__ == "__main__":
    sys.exit(main())
