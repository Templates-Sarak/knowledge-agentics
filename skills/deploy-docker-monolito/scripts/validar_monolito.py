"""
validar_monolito.py — valida o empacotamento Docker de um monólito modular composto: Dockerfile do
backend, front.Dockerfile, compose local, compose de produção e .dockerignore. Só reporta (não
builda nada). Complementa — não repete — o validar_docker.py genérico da deploy-docker-microsservico
(não-root, sem :latest, sem segredo em build).

Uso:
    python validar_monolito.py --raiz <projeto> [--config config.json]
    python validar_monolito.py --selftest

Retorno:
    JSON {root, ok, blockers:[{rule, file, line, detail}], warnings:[...], files:{...}}.
    Exit 1 quando há bloqueio; 0 caso contrário.

Regras (padrao-escrita): zero hardcoded (listas e nomes no config.json), responsabilidade única
(só valida e reporta), stdlib apenas.
"""

import argparse
import fnmatch
import json
import re
import sys
from pathlib import Path
from typing import Any, Callable

Finding = dict[str, Any]
Config = dict[str, Any]

DEFAULT_CONFIG = Path(__file__).parent / "config.json"
DEFAULT_RE = re.compile(r"(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-|-)")
SERVICE_RE = re.compile(r"^([A-Za-z0-9_.-]+):\s*$")


def finding(rule: str, file: Any, line: int, detail: str) -> Finding:
    return {"rule": rule, "file": str(file), "line": line, "detail": detail}


# ================================================================================================
# Dockerfile — instruções lógicas e estágios
# ================================================================================================


def logical_instructions(text: str) -> list[tuple[int, str, str]]:
    """Junta continuações com `\\` e descarta comentário. Devolve [(linha, INSTR, argumentos)]."""
    result, buffer, start = [], "", 0
    for number, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if not buffer and (stripped == "" or stripped.startswith("#")):
            continue
        start = start or number
        buffer += " " + stripped.rstrip("\\")
        if stripped.endswith("\\"):
            continue
        parts = buffer.strip().split(None, 1)
        result.append((start, parts[0].upper(), parts[1] if len(parts) > 1 else ""))
        buffer, start = "", 0
    return result


def split_stages(
    instructions: list[tuple[int, str, str]],
) -> list[list[tuple[int, str, str]]]:
    stages = []
    for item in instructions:
        if item[1] == "FROM":
            stages.append([])
        if stages:
            stages[-1].append(item)
    return stages


def rule_multistage(stages: list, path: Any) -> list[Finding]:
    if len(stages) >= 2:
        return []
    return [
        finding(
            "backend_single_stage",
            path,
            0,
            "Dockerfile do backend precisa de 2+ estágios (FROM)",
        )
    ]


def rule_healthcheck(final: list, path: Any) -> list[Finding]:
    if any(
        instr == "HEALTHCHECK" and not args.upper().startswith("NONE")
        for _, instr, args in final
    ):
        return []
    return [finding("backend_no_healthcheck", path, 0, "estágio final sem HEALTHCHECK")]


def rule_revision_label(final: list, path: Any, config: Config) -> list[Finding]:
    label = config["revision_label"]
    if any(instr == "LABEL" and label in args for _, instr, args in final):
        return []
    return [
        finding(
            "backend_no_revision_label", path, 0, f"estágio final sem LABEL {label}"
        )
    ]


def copy_all_sources(args: str) -> list[str]:
    tokens = [t for t in args.split() if not t.startswith("--")]
    return [t for t in tokens[:-1] if t in (".", "./", "*", "./*")]


def rule_copy_all(final: list, path: Any) -> list[Finding]:
    found = []
    for line, instr, args in final:
        if instr in ("COPY", "ADD") and "--from" not in args and copy_all_sources(args):
            found.append(
                finding(
                    "backend_copy_all_in_final",
                    path,
                    line,
                    f"{instr} {args} no estágio final",
                )
            )
    return found


def rule_runtime_tokens(final: list, path: Any, config: Config) -> list[Finding]:
    found = []
    for line, instr, args in final:
        if instr not in ("CMD", "ENTRYPOINT"):
            continue
        for token in config["forbidden_runtime_tokens"]:
            if re.search(rf"(?<![\w-]){re.escape(token)}(?![\w-])", args):
                found.append(
                    finding(
                        "backend_runs_source_in_production",
                        path,
                        line,
                        f"{instr} usa {token}",
                    )
                )
    return found


def check_backend_dockerfile(text: str, path: Any, config: Config) -> list[Finding]:
    stages = split_stages(logical_instructions(text))
    final = stages[-1] if stages else []
    return (
        rule_multistage(stages, path)
        + rule_healthcheck(final, path)
        + rule_revision_label(final, path, config)
        + rule_copy_all(final, path)
        + rule_runtime_tokens(final, path, config)
    )


def rule_front_base(stages: list, path: Any, config: Config) -> list[Finding]:
    image = stages[-1][0][2].split()[0] if stages[-1][0][2] else ""
    if config["front_base_marker"] in image:
        return []
    detail = f"base final '{image}' não é {config['front_base_marker']}"
    return [finding("front_base_not_unprivileged", path, stages[-1][0][0], detail)]


def rule_front_destination(stages: list, path: Any, config: Config) -> list[Finding]:
    found: list[Finding] = []
    for line, instr, args in stages[-1]:
        if instr not in ("COPY", "ADD"):
            continue
        destination = args.split()[-1] if args.split() else ""
        for forbidden in config["front_forbidden_destinations"]:
            if destination.rstrip("/").startswith(forbidden):
                detail = f"{instr} para {destination} mescla com o index.html da imagem base"
                found.append(finding("front_copies_to_default_html_root", path, line, detail))
    return found


def check_front_dockerfile(text: str, path: Any, config: Config) -> list[Finding]:
    stages = split_stages(logical_instructions(text))
    if not stages:
        return [finding("front_not_a_dockerfile", path, 0, "sem FROM")]
    return rule_front_base(stages, path, config) + rule_front_destination(stages, path, config)


# ================================================================================================
# Compose — blocos de serviço por indentação (sem YAML: stdlib apenas)
# ================================================================================================


def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def service_blocks(text: str) -> dict[str, list[tuple[int, str]]]:
    """{nome: [(linha, texto)]} dos serviços sob `services:`."""
    blocks, current, service_indent, inside = {}, None, None, False
    for number, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if stripped == "" or stripped.startswith("#"):
            continue
        if indent_of(raw) == 0:
            inside = stripped == "services:"
            continue
        if not inside:
            continue
        service_indent = indent_of(raw) if service_indent is None else service_indent
        match = SERVICE_RE.match(stripped)
        if match and indent_of(raw) == service_indent:
            current = blocks.setdefault(match.group(1), [])
        if current is not None:
            current.append((number, raw))
    return blocks


def nested_block(lines: list[tuple[int, str]], key: str) -> list[tuple[int, str]]:
    """Linhas aninhadas sob `key:` dentro do bloco de um serviço (a própria linha inclusa)."""
    collected, base = [], None
    for number, raw in lines:
        stripped = raw.strip()
        if base is None:
            if stripped.startswith(f"{key}:"):
                base = indent_of(raw)
                collected.append((number, stripped))
            continue
        if stripped != "" and indent_of(raw) <= base:
            break
        collected.append((number, stripped))
    return collected


def port_items(block: list[tuple[int, str]]) -> list[tuple[int, list[str]]]:
    """Agrupa as linhas de `ports:` por item `- ...`. Devolve [(linha, [textos])]."""
    items = []
    for number, text in block[1:]:
        if text.startswith("- "):
            items.append((number, [text[2:].strip()]))
        elif items and text:
            items[-1][1].append(text)
    return items


def is_loopback_item(texts: list[str], loopback_hosts: list[str]) -> bool:
    first = texts[0].strip("'\"")
    if re.match(r"^[A-Za-z_]+:", first):
        return any(
            t.replace(" ", "").strip("'\"") in [f"host_ip:{h}" for h in loopback_hosts]
            for t in texts
        )
    return any(first.startswith(f"{host}:") for host in loopback_hosts)


def rule_loopback_ports(blocks: dict, path: Any, config: Config) -> list[Finding]:
    found = []
    for name, lines in blocks.items():
        for number, texts in port_items(nested_block(lines, "ports")):
            if not is_loopback_item(texts, config["loopback_hosts"]):
                found.append(
                    finding(
                        "compose_port_not_loopback", path, number, f"{name}: {texts[0]}"
                    )
                )
    return found


def is_infra_variable(name: str, config: Config) -> bool:
    upper = name.upper()
    if any(upper.endswith(suffix) for suffix in config["allowed_default_suffixes"]):
        return False
    return any(marker in upper for marker in config["infra_variable_markers"])


def rule_infra_default(text: str, path: Any, config: Config) -> list[Finding]:
    found = []
    for number, raw in enumerate(text.splitlines(), start=1):
        if raw.strip().startswith("#"):
            continue
        for match in DEFAULT_RE.finditer(raw):
            if is_infra_variable(match.group(1), config):
                found.append(
                    finding(
                        "compose_infra_variable_with_default",
                        path,
                        number,
                        match.group(0) + "...}",
                    )
                )
    return found


def check_local_compose(text: str, path: Any, config: Config) -> list[Finding]:
    return rule_loopback_ports(service_blocks(text), path, config) + rule_infra_default(
        text, path, config
    )


# ================================================================================================
# Compose de produção
# ================================================================================================


def image_value(lines: list[tuple[int, str]]) -> tuple[int, str | None]:
    for number, raw in lines:
        stripped = raw.strip()
        if stripped.startswith("image:"):
            return number, stripped[len("image:") :].strip().strip("'\"")
    return 0, None


def rule_digest_image(name: str, lines: list, path: Any) -> list[Finding]:
    number, value = image_value(lines)
    if value is None:
        return [
            finding(
                "prod_service_without_image",
                path,
                0,
                f"{name}: produção usa imagem do registry, nunca build",
            )
        ]
    if "@sha256:" in value or "@${" in value:
        return []
    return [finding("prod_image_not_digest", path, number, f"{name}: {value}")]


def rule_hardening(name: str, lines: list, path: Any, config: Config) -> list[Finding]:
    found = []
    cap_text = " ".join(t for _, t in nested_block(lines, "cap_drop"))
    if not re.search(rf"\b{config['required_cap_drop']}\b", cap_text):
        found.append(
            finding(
                "prod_cap_drop_all_missing",
                path,
                0,
                f"{name}: cap_drop sem {config['required_cap_drop']}",
            )
        )
    sec_text = " ".join(t for _, t in nested_block(lines, "security_opt"))
    if config["required_security_opt"] not in sec_text.replace(" ", ""):
        found.append(
            finding(
                "prod_no_new_privileges_missing",
                path,
                0,
                f"{name}: security_opt sem {config['required_security_opt']}",
            )
        )
    if nested_block(lines, "ports"):
        found.append(
            finding(
                "prod_ports_published",
                path,
                0,
                f"{name}: produção não publica porta no host",
            )
        )
    return found


def check_production_compose(text: str, path: Any, config: Config) -> list[Finding]:
    found = []
    for name, lines in service_blocks(text).items():
        found += rule_digest_image(name, lines, path) + rule_hardening(
            name, lines, path, config
        )
    return found


# ================================================================================================
# .dockerignore e presença do front
# ================================================================================================


def normalize_ignore(line: str) -> str:
    value = line.strip()
    for prefix in ("**/", "/"):
        value = value[len(prefix) :] if value.startswith(prefix) else value
    for suffix in ("/**", "/"):
        value = value[: -len(suffix)] if value.endswith(suffix) else value
    return value


def check_dockerignore(text: str, path: Any, config: Config) -> list[Finding]:
    lines = [
        l.strip()
        for l in text.splitlines()
        if l.strip() and not l.strip().startswith("#")
    ]
    found = []
    if not any(l in config["dockerignore_env_patterns"] for l in lines):
        found.append(
            finding(
                "dockerignore_env_not_covered", path, 0, "nenhum padrão cobre .env*"
            )
        )
    if not any(l in config["dockerignore_env_exception_patterns"] for l in lines):
        found.append(
            finding("dockerignore_env_example_not_kept", path, 0, "falta !.env.example")
        )
    normalized = {normalize_ignore(l) for l in lines}
    for name in config["dockerignore_required"]:
        if name not in normalized:
            found.append(
                finding("dockerignore_missing_entry", path, 0, f"falta {name}")
            )
    return found


def modules_with_web(root: Path, config: Config) -> list[str]:
    result = []
    for base in config["manifest_dirs"]:
        for manifest in sorted((root / base).glob(f"*/{config['manifest_name']}")):
            if manifest.parent.name in config["ignore_dirs"]:
                continue
            data = json.loads(manifest.read_text(encoding="utf-8-sig"))
            if data.get("webPath"):
                result.append(manifest.parent.name)
    return result


# ================================================================================================
# Descoberta e orquestração
# ================================================================================================


def matches_any(name: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatch(name, g) for g in globs)


def classify_file(path: Path, config: Config) -> str | None:
    if matches_any(path.name, config["front_dockerfile_globs"]):
        return "front"
    if matches_any(path.name, config["backend_dockerfile_globs"]):
        return "backend"
    if not matches_any(path.name, config["compose_globs"]):
        return None
    is_prod = any(m in path.name for m in config["production_compose_markers"])
    return "compose_production" if is_prod else "compose_local"


def is_ignored(path: Path, root: Path, config: Config) -> bool:
    return any(p in config["ignore_dirs"] for p in path.relative_to(root).parts[:-1])


def classify_files(root: Path, config: Config) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = {
        "backend": [],
        "front": [],
        "compose_local": [],
        "compose_production": [],
    }
    for path in sorted(root.rglob("*")):
        if not path.is_file() or is_ignored(path, root, config):
            continue
        kind = classify_file(path, config)
        if kind is not None:
            groups[kind].append(path)
    return groups


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig", errors="ignore")


def run_checks(checker: Callable, paths: list[Path], config: Config) -> list[Finding]:
    found = []
    for path in paths:
        found += checker(read(path), path, config)
    return found


def check_presence(root: Path, groups: dict, config: Config) -> list[Finding]:
    found: list[Finding] = []
    if not groups["backend"]:
        found.append(
            finding(
                "backend_dockerfile_missing",
                root,
                0,
                "nenhum Dockerfile de backend encontrado",
            )
        )
    web_modules = modules_with_web(root, config)
    if web_modules and not groups["front"]:
        detail = f"módulos com webPath: {', '.join(web_modules)}"
        found.append(finding("front_dockerfile_missing", root, 0, detail))
    return found


def check_ignore_file(root: Path, config: Config) -> list[Finding]:
    ignore_path = root / config["dockerignore_name"]
    if not ignore_path.exists():
        return [finding("dockerignore_missing", ignore_path, 0, "arquivo ausente")]
    return check_dockerignore(read(ignore_path), ignore_path, config)


def validate(root: Path, config: Config) -> dict[str, Any]:
    groups = classify_files(root, config)
    blockers = check_presence(root, groups, config)
    blockers += run_checks(check_backend_dockerfile, groups["backend"], config)
    blockers += run_checks(check_front_dockerfile, groups["front"], config)
    blockers += run_checks(check_local_compose, groups["compose_local"], config)
    blockers += run_checks(
        check_production_compose, groups["compose_production"], config
    )
    blockers += check_ignore_file(root, config)
    warnings: list[Finding] = []
    if not groups["compose_local"]:
        warnings.append(
            finding("compose_local_missing", root, 0, "nenhum compose local encontrado")
        )
    files: dict[str, Any] = {k: [str(p) for p in v] for k, v in groups.items()}
    files["modules_with_web"] = modules_with_web(root, config)
    return {
        "root": str(root),
        "ok": not blockers,
        "blockers": blockers,
        "warnings": warnings,
        "files": files,
    }


# ================================================================================================
# Autoteste — casos positivos e negativos contra fixtures em memória
# ================================================================================================

GOOD_BACKEND = """FROM node:22.12.0-bookworm-slim AS build
COPY . .
RUN npm ci
FROM node:22.12.0-bookworm-slim AS runtime
ARG APP_VERSION=""
LABEL org.opencontainers.image.revision=$APP_VERSION
COPY --from=build /out/ ./
USER node
HEALTHCHECK --interval=30s \\
  CMD node -e "process.exit(0)"
CMD ["node", "dist/src/composition.js"]
"""
GOOD_FRONT = (
    "FROM node:22.12.0-bookworm-slim AS build\n"
    "FROM nginxinc/nginx-unprivileged:1.27.3-alpine\n"
    "COPY --from=build /site /srv/site\n"
)
GOOD_LOCAL = """services:
  db:
    image: postgres:16.6-alpine
    ports:
      - "127.0.0.1:${DB_PORT:?}:5432"
  front:
    build: .
    args:
      APP_VERSION: ${APP_VERSION:-}
    ports:
      - target: 8080
        published: 8080
        host_ip: 127.0.0.1
"""
GOOD_PROD = """services:
  app:
    image: "reg/app@${APP_DIGEST:?}"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
  front:
    image: reg/front@sha256:abc
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
"""
GOOD_IGNORE = (
    ".env\n.env.*\n!.env.example\nnode_modules\n**/dist\n.git\ntests/\nspecs\n"
)


def rules_of(findings: list[Finding]) -> set[str]:
    return {f["rule"] for f in findings}


Case = tuple[str, set[str], set[str]]


def backend_cases(config: Config) -> list[Case]:
    def check(text: str) -> set[str]:
        return rules_of(check_backend_dockerfile(text, "Dockerfile", config))

    return [
        ("backend bom passa", check(GOOD_BACKEND), set()),
        (
            "backend single-stage",
            check("FROM node:22.12.0-bookworm-slim\nUSER node\n"),
            {
                "backend_single_stage",
                "backend_no_healthcheck",
                "backend_no_revision_label",
            },
        ),
        (
            "backend sem healthcheck",
            check(GOOD_BACKEND.replace("HEALTHCHECK", "RUN echo")),
            {"backend_no_healthcheck"},
        ),
        (
            "backend sem label de revisão",
            check(GOOD_BACKEND.replace("org.opencontainers.image.revision", "x.y")),
            {"backend_no_revision_label"},
        ),
        (
            "backend COPY . . no final",
            check(GOOD_BACKEND.replace("COPY --from=build /out/ ./", "COPY . .")),
            {"backend_copy_all_in_final"},
        ),
    ]


def runtime_cases(config: Config) -> list[Case]:
    def check(text: str) -> set[str]:
        return rules_of(check_backend_dockerfile(text, "Dockerfile", config))

    transform = GOOD_BACKEND.replace('"node", "dist', '"node", "--experimental-transform-types", "dist')
    tsx = GOOD_BACKEND.replace('["node", "dist/src/composition.js"]', '["npx", "tsx", "src/composition.ts"]')
    rule = {"backend_runs_source_in_production"}
    return [
        ("backend CMD com tsx", check(tsx), rule),
        ("backend CMD com transform-types", check(transform), rule),
    ]


def front_cases(config: Config) -> list[Case]:
    def check(text: str) -> set[str]:
        return rules_of(check_front_dockerfile(text, "front.Dockerfile", config))

    return [
        ("front nginx-unprivileged passa", check(GOOD_FRONT), set()),
        (
            "front com nginx comum",
            check("FROM nginx:1.27-alpine\n"),
            {"front_base_not_unprivileged"},
        ),
        (
            "front copia para o html padrao",
            check(GOOD_FRONT.replace("/srv/site", "/usr/share/nginx/html")),
            {"front_copies_to_default_html_root"},
        ),
        (
            "front copia para subpasta do html padrao",
            check(GOOD_FRONT.replace("/srv/site", "/usr/share/nginx/html/app/")),
            {"front_copies_to_default_html_root"},
        ),
    ]


def local_cases(config: Config) -> list[Case]:
    def check(text: str) -> set[str]:
        return rules_of(check_local_compose(text, "compose.yml", config))

    open_port = GOOD_LOCAL.replace("127.0.0.1:${DB_PORT:?}", "${DB_PORT:?}")
    long_open = GOOD_LOCAL.replace("host_ip: 127.0.0.1", "protocol: tcp")
    with_default = GOOD_LOCAL.replace("${DB_PORT:?}", "${DB_PORT:-5432}")
    return [
        ("compose local bom passa", check(GOOD_LOCAL), set()),
        ("compose local porta aberta", check(open_port), {"compose_port_not_loopback"}),
        (
            "compose local porta longa sem host_ip",
            check(long_open),
            {"compose_port_not_loopback"},
        ),
        (
            "compose local default em infra",
            check(with_default),
            {"compose_infra_variable_with_default"},
        ),
    ]


def production_cases(config: Config) -> list[Case]:
    def check(text: str) -> set[str]:
        return rules_of(
            check_production_compose(text, "compose.production.yml", config)
        )

    by_tag = GOOD_PROD.replace("reg/front@sha256:abc", "reg/front:1.2.3")
    no_cap = GOOD_PROD.replace("- ALL", "- NET_RAW")
    no_priv = GOOD_PROD.replace("- no-new-privileges:true", "- seccomp:unconfined")
    with_ports = GOOD_PROD.replace(
        "  front:\n", '  front:\n    ports:\n      - "80:80"\n'
    )
    return [
        ("compose prod bom passa", check(GOOD_PROD), set()),
        ("compose prod imagem por tag", check(by_tag), {"prod_image_not_digest"}),
        ("compose prod sem cap_drop ALL", check(no_cap), {"prod_cap_drop_all_missing"}),
        (
            "compose prod sem no-new-privileges",
            check(no_priv),
            {"prod_no_new_privileges_missing"},
        ),
        ("compose prod com ports", check(with_ports), {"prod_ports_published"}),
    ]


def ignore_cases(config: Config) -> list[Case]:
    def check(text: str) -> set[str]:
        return rules_of(check_dockerignore(text, ".dockerignore", config))

    no_env = GOOD_IGNORE.replace(".env\n.env.*\n", "")
    no_exception = GOOD_IGNORE.replace("!.env.example\n", "")
    return [
        ("dockerignore bom passa", check(GOOD_IGNORE), set()),
        ("dockerignore sem .env", check(no_env), {"dockerignore_env_not_covered"}),
        (
            "dockerignore sem exceção do exemplo",
            check(no_exception),
            {"dockerignore_env_example_not_kept"},
        ),
        (
            "dockerignore sem specs",
            check(GOOD_IGNORE.replace("specs\n", "")),
            {"dockerignore_missing_entry"},
        ),
    ]


def selftest_cases(config: Config) -> list[Case]:
    groups = (backend_cases, runtime_cases, front_cases, local_cases, production_cases, ignore_cases)
    return [case for group in groups for case in group(config)]


def run_selftest(config: Config) -> int:
    failures = 0
    cases = selftest_cases(config)
    for name, got, expected in cases:
        ok = got == expected
        failures += 0 if ok else 1
        sys.stdout.write(f"  {'ok   ' if ok else 'FALHA'} {name}\n")
        if not ok:
            sys.stdout.write(
                f"       esperado: {sorted(expected)} obtido: {sorted(got)}\n"
            )
    sys.stdout.write(f"\nautoteste: {len(cases) - failures}/{len(cases)} ok\n")
    return 0 if failures == 0 else 1


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(
        description="Valida o empacotamento Docker de um monólito modular."
    )
    parser.add_argument("--raiz", default=".")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()

    try:
        config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        sys.exit(f"Erro: config inválido em '{args.config}' ({error}).")
    if args.selftest:
        sys.exit(run_selftest(config))
    root = Path(args.raiz)
    if not root.is_dir():
        sys.exit(f"Erro: raiz '{root}' não existe.")
    result = validate(root, config)
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
