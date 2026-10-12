"""
detect_junk.py — Detecta detritos de projeto: arquivos de lixo, marcadores de debug e arquivos grandes.

Uso:
    python detect_junk.py --root . [--config config.json]
    python detect_junk.py --selftest

Retorno:
    JSON com {junk_files, markers, large_files}.

Regras (padrao-escrita): zero hardcoded (limites/padrões no config.json),
responsabilidade única (apenas detecta — a remoção é decisão com HITL).
"""

import argparse
import json
import sys
import tempfile
from fnmatch import fnmatch
from pathlib import Path

# Chaves antigas (config de projetos que já carregam cópia local) -> chaves atuais.
LEGACY_CONFIG_KEYS = {
    "padroes_nome_lixo": "junk_name_patterns",
    "dirs_lixo": "junk_dirs",
    "marcadores": "markers",
    "extensoes_codigo": "code_extensions",
    "ignorar_dirs": "ignore_dirs",
    "tamanho_grande_bytes": "large_size_bytes",
}


def normalize_config(config: dict) -> dict:
    """Aceita as chaves antigas do config, convertendo-as pelo mapa centralizado."""
    return {LEGACY_CONFIG_KEYS.get(key, key): value for key, value in config.items()}


def load_config(path: Path) -> dict:
    return normalize_config(json.loads(path.read_text(encoding="utf-8")))


def is_ignored(path: Path, ignore_dirs) -> bool:
    return any(part in ignore_dirs for part in path.parts)


def detect_junk_files(root, name_patterns, junk_dirs, ignore_dirs) -> list:
    findings = []
    for path in root.rglob("*"):
        if is_ignored(path, ignore_dirs):
            continue
        if path.is_dir() and path.name in junk_dirs:
            findings.append(str(path))
        elif path.is_file() and any(fnmatch(path.name, p) for p in name_patterns):
            findings.append(str(path))
    return findings


def detect_markers(root, markers, extensions, ignore_dirs) -> list:
    findings = []
    for path in root.rglob("*"):
        if not path.is_file() or is_ignored(path, ignore_dirs):
            continue
        if extensions and path.suffix not in extensions:
            continue
        try:
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        for number, line in enumerate(lines, start=1):
            for marker in markers:
                if marker in line:
                    findings.append(
                        {"file": str(path), "line": number, "marker": marker}
                    )
    return findings


def detect_large(root, limit, ignore_dirs) -> list:
    findings = []
    for path in root.rglob("*"):
        if not path.is_file() or is_ignored(path, ignore_dirs):
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size > limit:
            findings.append({"file": str(path), "bytes": size})
    return findings


def run_selftest() -> int:
    """Prova o mapa de chaves antigas e as três detecções com um projeto temporário."""
    failures = []
    legacy = normalize_config(
        {"marcadores": ["TODO"], "tamanho_grande_bytes": 9, "dirs_lixo": ["old"]}
    )
    if legacy != {"markers": ["TODO"], "large_size_bytes": 9, "junk_dirs": ["old"]}:
        failures.append(f"legacy keys not normalized: {legacy}")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "old").mkdir()
        (root / "a.log").write_text("x", encoding="utf-8")
        (root / "b.py").write_text("ok\n# TODO fix\n", encoding="utf-8")
        (root / "big.bin").write_bytes(b"0" * 20)
        junk = detect_junk_files(root, ["*.log"], {"old"}, set())
        if sorted(Path(j).name for j in junk) != ["a.log", "old"]:
            failures.append(f"detect_junk_files: {junk}")
        markers = detect_markers(root, ["TODO"], [".py"], set())
        if [(Path(m["file"]).name, m["line"]) for m in markers] != [("b.py", 2)]:
            failures.append(f"detect_markers: {markers}")
        large = detect_large(root, 18, set())
        if [Path(f["file"]).name for f in large] != ["big.bin"]:
            failures.append(f"detect_large: {large}")
    for failure in failures:
        print(f"[FAIL] {failure}")
    print(
        f"[{'OK' if not failures else 'ERROR'}] selftest of detect_junk: {4 - len(failures)}/4"
    )
    return 1 if failures else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Project junk detector.")
    parser.add_argument("--root", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        sys.exit(run_selftest())

    try:
        config = load_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Error: config not found at '{args.config}'.")
    except json.JSONDecodeError as error:
        sys.exit(f"Error: invalid config ({error}).")

    root = Path(args.root)
    if not root.exists():
        sys.exit(f"Error: root '{root}' does not exist.")
    ignore = set(config.get("ignore_dirs", []))

    result = {
        "junk_files": detect_junk_files(
            root,
            config.get("junk_name_patterns", []),
            set(config.get("junk_dirs", [])),
            ignore,
        ),
        "markers": detect_markers(
            root, config.get("markers", []), config.get("code_extensions", []), ignore
        ),
        "large_files": detect_large(
            root, config.get("large_size_bytes", 5000000), ignore
        ),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
