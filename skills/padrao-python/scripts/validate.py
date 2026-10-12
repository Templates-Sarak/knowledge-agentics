"""
validate.py — valida código Python contra os limiares objetivos do padrao-escrita.

Uso:
    python validate.py <file-or-dir> [--config config.json]

Retorno (stdout):
    JSON { "target": <path>, "findings": [ {path, line, dimension, severity, risk,
    message, rule, confidence} ] } — formato consumível pelo code-diagnostico.

Detecta (mecânico, via stdlib `ast`): thresholds (tamanho de função, aninhamento, nº de parâmetros),
logging (print / exceção engolida), typing (assinatura pública sem anotação), secrets (literal em
nome sensível) e hardcoded heurístico (número mágico / URL) — este marcado com confidence "low".

Regras (padrao-escrita): zero hardcoded (limiares/allowlists/padrões vêm do config.json), zero segredos,
responsabilidade única (só valida e emite JSON — não corrige).
"""

import argparse
import ast
import json
import sys
from pathlib import Path


def load_config(config_path: str) -> dict:
    """Lê os parâmetros externos. Nada hardcoded no código."""
    return json.loads(Path(config_path).read_text(encoding="utf-8"))


def _violation(
    path, line, dimension, severity, risk, message, rule, confidence="high"
) -> dict:
    return {
        "path": path,
        "line": line,
        "dimension": dimension,
        "severity": severity,
        "risk": risk,
        "message": message,
        "rule": rule,
        "confidence": confidence,
    }


def _is_public(name: str) -> bool:
    return not name.startswith("_")


def _count_params(args: ast.arguments, ignore: list) -> int:
    all_args = args.posonlyargs + args.args + args.kwonlyargs
    names = [a.arg for a in all_args if a.arg not in ignore]
    return len(names)


def _depth(node: ast.AST, current: int = 0) -> int:
    """Maior profundidade de aninhamento de blocos de controle dentro de `no`."""
    blocks = (
        ast.If,
        ast.For,
        ast.AsyncFor,
        ast.While,
        ast.With,
        ast.AsyncWith,
        ast.Try,
    )
    max_depth = current
    for child in ast.iter_child_nodes(node):
        next_depth = current + 1 if isinstance(child, blocks) else current
        max_depth = max(max_depth, _depth(child, next_depth))
    return max_depth


class Visitor(ast.NodeVisitor):
    def __init__(self, path: str, config: dict):
        self.path = path
        self.cfg = config
        self.findings: list = []

    # --- funções: limiares + tipagem ---
    def _check_function(self, node):
        name = node.name
        # tamanho
        if (
            node.end_lineno
            and (node.end_lineno - node.lineno + 1) > self.cfg["maxFunctionLines"]
        ):
            self.findings.append(
                _violation(
                    self.path,
                    node.lineno,
                    "thresholds",
                    "medium",
                    "medium",
                    f"function '{name}' with {node.end_lineno - node.lineno + 1} lines",
                    f"function <= {self.cfg['maxFunctionLines']} lines",
                )
            )
        # parâmetros
        param_count = _count_params(node.args, self.cfg["ignoreParamNames"])
        if param_count > self.cfg["maxParams"]:
            self.findings.append(
                _violation(
                    self.path,
                    node.lineno,
                    "thresholds",
                    "medium",
                    "low",
                    f"function '{name}' with {param_count} parameters",
                    f"<= {self.cfg['maxParams']} parameters",
                )
            )
        # aninhamento
        depth = _depth(node)
        if depth > self.cfg["maxNesting"]:
            self.findings.append(
                _violation(
                    self.path,
                    node.lineno,
                    "thresholds",
                    "medium",
                    "medium",
                    f"function '{name}' with nesting of {depth} levels",
                    f"nesting <= {self.cfg['maxNesting']} (use guard clauses)",
                )
            )
        # tipagem (só pública)
        if _is_public(name):
            missing_return = node.returns is None
            params = node.args.posonlyargs + node.args.args + node.args.kwonlyargs
            missing_param = any(
                a.annotation is None
                for a in params
                if a.arg not in self.cfg["ignoreParamNames"]
            )
            if missing_return or missing_param:
                self.findings.append(
                    _violation(
                        self.path,
                        node.lineno,
                        "typing",
                        "low",
                        "low",
                        f"public function '{name}' without complete type annotations",
                        "type public signatures (api/contract)",
                    )
                )

    def visit_FunctionDef(self, node):
        self._check_function(node)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node):
        self._check_function(node)
        self.generic_visit(node)

    # --- logging: print / exceção engolida ---
    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id == "print":
            self.findings.append(
                _violation(
                    self.path,
                    node.lineno,
                    "logging",
                    "medium",
                    "low",
                    "use of print()",
                    "use a structured logger, no print",
                )
            )
        self.generic_visit(node)

    def visit_ExceptHandler(self, node):
        empty_body = len(node.body) == 1 and isinstance(node.body[0], ast.Pass)
        if node.type is None or empty_body:
            self.findings.append(
                _violation(
                    self.path,
                    node.lineno,
                    "logging",
                    "medium",
                    "low",
                    "swallowed exception (broad except or empty body)",
                    "do not swallow exceptions; handle/log explicitly",
                )
            )
        self.generic_visit(node)

    # --- segredos + hardcoded heurístico ---
    def visit_Assign(self, node):
        target_names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        value = node.value
        if isinstance(value, ast.Constant):
            self._check_literal(node.lineno, target_names, value.value)
        self.generic_visit(node)

    def _check_literal(self, line, names, value):
        # segredo: nome sensível com literal não-vazio
        for name in names:
            lowered = name.lower()
            if (
                any(p in lowered for p in self.cfg["secretNamePatterns"])
                and isinstance(value, str)
                and value
            ):
                self.findings.append(
                    _violation(
                        self.path,
                        line,
                        "secrets",
                        "high",
                        "low",
                        f"possible embedded secret in '{name}'",
                        "secrets in .env (prefixed by module), never in code",
                    )
                )
                return
        if not self.cfg.get("hardcodedHeuristic"):
            return
        # hardcoded heurístico (baixa confiança)
        is_constant = (
            all(n.isupper() for n in names) and names
        )  # UPPER_CASE = constante aceitável
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if value not in self.cfg["allowedMagicNumbers"] and not is_constant:
                self.findings.append(
                    _violation(
                        self.path,
                        line,
                        "hardcoded",
                        "low",
                        "low",
                        f"magic number {value!r}",
                        "config values in config.json",
                        confidence="low",
                    )
                )
        elif isinstance(value, str):
            if any(value.startswith(p) for p in self.cfg["urlLikePrefixes"]):
                self.findings.append(
                    _violation(
                        self.path,
                        line,
                        "hardcoded",
                        "medium",
                        "low",
                        f"embedded URL/host {value!r}",
                        "URLs/hosts in config.json/.env",
                        confidence="low",
                    )
                )


def validate_text(path_str: str, text: str, config: dict) -> list:
    """Núcleo: valida um TEXTO Python já lido contra `config`. Puro — não toca `fs`. É o que o
    `--selftest` prova com fixtures em memória."""
    try:
        tree = ast.parse(text)
    except SyntaxError as error:
        return [
            _violation(
                path_str,
                0,
                "parse",
                "high",
                "low",
                f"could not parse: {error}",
                "valid Python file",
            )
        ]
    v = Visitor(path_str, config)
    v.visit(tree)
    return v.findings


def validate_file(path: Path, config: dict) -> list:
    """Casca: lê o arquivo do disco e delega ao núcleo."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        return [
            _violation(
                str(path),
                0,
                "parse",
                "high",
                "low",
                f"could not parse: {error}",
                "valid Python file",
            )
        ]
    return validate_text(str(path), text, config)


def has_parse_failure(findings: list) -> bool:
    """Núcleo: violação de dimensão "parse" é SEMPRE fatal — quem consome esta saída
    (code-adequador, code-auditoria-padrao) lê exit 0 como "conforme"; um parse que falha e
    ainda assim retorna 0 aprovaria qualquer coisa (fail-open, espelha o mesmo conserto em
    validate.mjs — mesmos consumidores, mesmo contrato de exit code). Violação comum (limiar,
    hardcoded etc.) continua exit 0 — só o parse é fatal."""
    return any(v["dimension"] == "parse" for v in findings)


def collect_files(target: Path, skip_dirs: list) -> list:
    if target.is_file():
        return [target] if target.suffix == ".py" else []
    skip = set(skip_dirs)
    return [p for p in target.rglob("*.py") if not skip.intersection(p.parts)]


def _config_fixture() -> dict:
    return {
        "maxFunctionLines": 3,
        "maxNesting": 2,
        "maxParams": 2,
        "ignoreParamNames": ["self", "cls"],
        "allowedMagicNumbers": [0, 1, -1, 2],
        "secretNamePatterns": ["password", "token"],
        "urlLikePrefixes": ["http://", "https://"],
        "hardcodedHeuristic": True,
    }


def selftest() -> int:
    """Núcleo puro contra fixtures em memória — nenhuma linha toca `fs`."""
    failures = []
    cfg = _config_fixture()

    def _has(findings, dimension):
        return any(v["dimension"] == dimension for v in findings)

    large_function = (
        "def f(a, b, c):\n    x = 1\n    y = 2\n    z = 3\n    return x + y + z\n"
    )
    if not _has(validate_text("f.py", large_function, cfg), "thresholds"):
        failures.append(
            "validate_text should find a thresholds violation (large function/parameters)"
        )

    # funcao curta (nao estoura maxFunctionLines/maxParams) so pra isolar a checagem de aninhamento
    nesting_cfg = dict(cfg, maxFunctionLines=10, maxParams=10)
    nested = "def f():\n if 1:\n  if 1:\n   if 1: pass\n"
    nested_findings = validate_text("f.py", nested, nesting_cfg)
    if not any("nesting" in v["message"] for v in nested_findings):
        failures.append(
            "validate_text should find a nesting violation (3 levels > limit 2)"
        )

    untyped = "def public(a):\n    return a\n"
    if not _has(validate_text("f.py", untyped, cfg), "typing"):
        failures.append(
            "validate_text should find a typing violation in a public function without annotations"
        )

    with_print = "def public(a: int) -> int:\n    print(a)\n    return a\n"
    if not _has(validate_text("f.py", with_print, cfg), "logging"):
        failures.append("validate_text should find a logging violation (print)")

    # Concatenado, nao literal: o texto de ORIGEM deste arquivo nao pode conter um segredo-
    # formato contiguo, senao o proprio scan de vazamentos do audit_base.py acha "vazamento"
    # que e so dado de teste (o mesmo cuidado do fixture em scan_secrets.py --selftest).
    secret_value = "sample-value" + "-secret"
    secret = f"token = '{secret_value}'\n"
    if not _has(validate_text("f.py", secret, cfg), "secrets"):
        failures.append(
            "validate_text should find a secrets violation in a sensitive name"
        )

    magic = "limit = 777\n"
    if not _has(validate_text("f.py", magic, cfg), "hardcoded"):
        failures.append(
            "validate_text should find a hardcoded violation (magic number)"
        )

    invalid = "def f(:\n"
    parse_findings = validate_text("f.py", invalid, cfg)
    if len(parse_findings) != 1 or parse_findings[0]["dimension"] != "parse":
        failures.append(
            "validate_text should fail with dimension 'parse' on text with a SyntaxError"
        )

    clean = "def public(a: int) -> int:\n    return a\n"
    if validate_text("f.py", clean, cfg) != []:
        failures.append(
            "validate_text should find nothing in code within the thresholds"
        )

    # Item central do fail-open: texto que nao parseia tem que REPROVAR (exit fatal), nao so
    # aparecer no JSON. has_parse_failure decide o exit code em main() — testa a decisao, nao
    # so que validate_text roda.
    if not has_parse_failure(parse_findings):
        failures.append(
            "has_parse_failure should fail (True) when there is a 'parse' dimension violation"
        )
    if has_parse_failure(validate_text("f.py", clean, cfg)):
        failures.append(
            "has_parse_failure should not fail on clean code without a parse violation"
        )
    large_function_findings = validate_text("f.py", large_function, cfg)
    if has_parse_failure(large_function_findings):
        failures.append(
            "has_parse_failure should not fail on a common violation (thresholds) — only 'parse' is fatal"
        )

    for failure in failures:
        print(f"  failure  {failure}")
    if failures:
        print(f"selftest (validate.py): {len(failures)} failure(s)")
        return 1
    print("selftest (validate.py): 10/10 ok")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validates Python code against the standard's thresholds."
    )
    parser.add_argument("target", nargs="?", help="A .py file or a directory to validate")
    parser.add_argument(
        "--config",
        default=str(Path(__file__).with_name("config.json")),
        help="Path to config.json (default: next to the script)",
    )
    parser.add_argument(
        "--selftest", action="store_true", help="Runs the internal suite, does not touch disk"
    )
    args = parser.parse_args()

    if args.selftest:
        sys.exit(selftest())
    if not args.target:
        parser.error("the 'target' argument is required outside --selftest")

    # Saída sempre em UTF-8, independe da codepage do console (ex.: cp1252 no Windows).
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    config = load_config(args.config)
    target = Path(args.target)
    findings = []
    for file in collect_files(target, config["skipDirs"]):
        findings.extend(validate_file(file, config))

    print(
        json.dumps(
            {"target": str(target), "findings": findings}, ensure_ascii=False, indent=2
        )
    )
    # Fail-open medido: sem isto, um arquivo que falhava ao parsear virava violation "high" no
    # JSON mas o processo saia com 0 mesmo assim (mesmo defeito corrigido em validate.mjs).
    sys.exit(1 if has_parse_failure(findings) else 0)


if __name__ == "__main__":
    main()
