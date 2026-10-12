"""verify_parity.py — a camada MECANICA da contraprova specs x realidade.

    python verify_parity.py --root <repo> [--specs <dir>] [--json]
    python verify_parity.py --selftest

Cobre so o que e deterministico (mesma entrada -> mesma saida) na skill `spec-revisao`:

  1. `dead-pointer`    — caminho citado numa spec que nao existe no repositorio.
  2. `orphan-wikilink`    — `[[nome]]` que nao resolve para nenhuma spec da arvore.
  3. `plan-without-index`   — `plan/plan-FF.NN-*.md` em disco sem linha no `00-indice`.
  4. `index-without-plan`   — linha no `00-indice` cuja plan nao existe mais em disco.
  5. `status-mismatch` — status do frontmatter da plan != status citado no `00-indice`.
  6. `module-without-spec`   — `modules/<m>/module.json` em disco que nenhuma spec cita.
  7. `plan-outside-format` — `plan/plan-*.md` cujo nome nao e `plan-FF.NN-<slug>.md` (ex.: o
     formato antigo `plan-07-x.md`). Sem esta checagem, o arquivo deixaria de casar o regex de plan e
     sumiria das checagens 3-5 em silencio — invisivel e trabalho perdido.

O que este script NAO faz, de proposito: dizer se a REGRA descrita numa spec e a regra que o
codigo executa. Isso e julgamento, fica no agente (SKILL.md, passos 3-5) — script que opinasse
sobre semantica daria falso veredito com cara de verde.

Fora de fence: citacao dentro de bloco ``` e exemplo de comando, nao ponteiro a seguir. Contar
como ponteiro produziria ruido justamente nas specs que ensinam a rodar alguma coisa.

Nucleo x casca: `citations_from_text`, `wikilinks_from_text`, `plans_from_index`,
`status_from_frontmatter`, `plan_divergences` e `plan_outside_format` sao PURAS (recebem texto, nunca tocam `fs`) — sao
o que o `--selftest` prova com fixtures em memoria. `audit_*` sao a casca fina que le o disco.

Read-only por construcao: abre arquivo em modo leitura e nunca escreve. Exit 0 sem achado, 1 com
achado, 2 em erro de uso.
"""

import argparse
import json
import os
import re
import sys

SPEC_EXTENSIONS = (".md",)
# Molde exibe caminho ficticio por oficio (`caminho/do/arquivo.ext`) — mesma isencao que o
# `pointers.py` da `meta-verificacao-base` da a `examples.md`/`templates.md`.
TEMPLATE_DIRS = frozenset({"_templates"})
# Pasta gerada/cache nunca e conteudo do repositorio.
IGNORED_DIRS = frozenset(
    {".git", "node_modules", "__pycache__", ".venv", "dist", ".ruff_cache"}
)
# Um candidato a ponteiro: link markdown `](caminho)` ou trecho em crase com barra/extensao.
MD_LINK = re.compile(r"\]\(([^)\s]+)\)")
IN_BACKTICKS = re.compile(r"`([^`\n]+)`")
WIKILINK = re.compile(r"\[\[([^\]\n|]+)")
# Plan por familia: `plan-FF.NN-<slug>` — dois digitos de familia, ponto, dois digitos de contador.
PLAN_IN_TEXT = re.compile(r"plan-\d{2}\.\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*")
PLAN_FILE = re.compile(r"plan-\d{2}\.\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md")
STATUS_IN_FRONTMATTER = re.compile(r"^status:\s*[\"']?([^\"'\n]+?)[\"']?\s*$", re.M)
FENCE = re.compile(r"^\s*```")
# `.py`/`.env` sozinhos sao a EXTENSAO citada em prosa, nunca um arquivo do repo. E `NN` e o
# placeholder de numeracao do proprio molde (`plan-FF.NN-slug`, `arquitetura/FF.NN-api.md`).
EXTENSION_ONLY = re.compile(r"^\.\w{1,5}$")
# Placeholder, glob e URL nao sao caminho a resolver. Trecho iniciado por `/` tambem nao: numa spec
# de site, `/servicos` e ROTA HTTP, e cobrar um arquivo com esse nome acusaria a spec inteira.
NOT_A_PATH = ("http://", "https://", "<", ">", "*", "$", "{", "…", "...")
CITABLE_EXTENSIONS = (
    ".md",
    ".py",
    ".mjs",
    ".js",
    ".ts",
    ".json",
    ".yaml",
    ".yml",
    ".sql",
)


def _is_candidate(raw):
    """Nucleo: o trecho parece um caminho de arquivo que da para resolver no disco?"""
    target = raw.strip()
    if not target or any(mark in target for mark in NOT_A_PATH):
        return False
    if " " in target or target.startswith(("#", "/")):
        return False
    if "NN" in target or EXTENSION_ONLY.match(target):
        return False
    return "/" in target or target.endswith(CITABLE_EXTENSIONS)


def _lines_outside_fence(text):
    """Nucleo: `(numero, linha)` de cada linha do texto que nao esta dentro de um bloco ```."""
    inside = False
    output = []
    for number, line in enumerate(text.split("\n"), start=1):
        if FENCE.match(line):
            inside = not inside
            continue
        if not inside:
            output.append((number, line))
    return output


def citations_from_text(text: str) -> list[tuple[int, str]]:
    """Nucleo: `[(linha, caminho)]` de todo caminho citado fora de bloco de codigo."""
    findings = []
    for number, line in _lines_outside_fence(text):
        raws = MD_LINK.findall(line) + IN_BACKTICKS.findall(line)
        findings.extend(
            (number, raw.strip()) for raw in raws if _is_candidate(raw)
        )
    return findings


def wikilinks_from_text(text: str) -> list[tuple[int, str]]:
    """Nucleo: `[(linha, nome)]` de cada `[[nome]]` fora de bloco de codigo."""
    findings = []
    for number, line in _lines_outside_fence(text):
        findings.extend((number, name.strip()) for name in WIKILINK.findall(line))
    return findings


def plans_from_index(text: str) -> dict[str, str]:
    """Nucleo: `{plan: status}` das linhas de tabela do `00-indice`.

    Status e a penultima celula da linha (a ultima e o Destino), como manda o molde do indice.
    Linha sem plan reconhecivel nao entra — cabecalho e legenda nao sao fila.
    """
    queue = {}
    for _, line in _lines_outside_fence(text):
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        names = PLAN_IN_TEXT.findall(line)
        if names and len(cells) >= 2:
            queue[names[0]] = cells[-2]
    return queue


def status_from_frontmatter(text: str) -> str | None:
    """Nucleo: o valor do campo `status` do frontmatter YAML, ou `None` se nao houver."""
    match = STATUS_IN_FRONTMATTER.search(text)
    return match.group(1).strip() if match else None


def plan_divergences(
    in_index: dict[str, str], on_disk: dict[str, str]
) -> list[tuple[str, str, str]]:
    """Nucleo: as tres divergencias entre `{plan: status}` do indice e `{plan: status}` do disco."""
    findings = []
    for plan in sorted(set(on_disk) - set(in_index)):
        findings.append(
            ("plan-without-index", plan, "exists in plan/ and is not in 00-indice")
        )
    for plan in sorted(set(in_index) - set(on_disk)):
        findings.append(
            ("index-without-plan", plan, "cited in 00-indice and does not exist in plan/")
        )
    for plan in sorted(set(in_index) & set(on_disk)):
        if in_index[plan] != on_disk[plan]:
            detail = "index says '%s', the plan says '%s'" % (
                in_index[plan],
                on_disk[plan],
            )
            findings.append(("status-mismatch", plan, detail))
    return findings


def plan_outside_format(name: str) -> bool:
    """Nucleo: o arquivo de `plan/` se diz plan (`plan-*.md`) mas nao segue `plan-FF.NN-<slug>.md`?"""
    return name.startswith("plan-") and name.endswith(".md") and not PLAN_FILE.fullmatch(name)


def _finding(kind, file, line, detail):
    return {"kind": kind, "file": file, "line": line, "detail": detail}


def _spec_files(specs_dir):
    """Casca: o caminho absoluto de toda spec da arvore, fora das pastas de molde."""
    found = []
    for dir, subdirs, names in os.walk(specs_dir):
        subdirs[:] = [s for s in subdirs if s not in TEMPLATE_DIRS]
        for name in sorted(names):
            if name.endswith(SPEC_EXTENSIONS):
                found.append(os.path.join(dir, name))
    return sorted(found)


def _repo_basenames(root):
    """Casca: o nome de todo arquivo do repositorio, fora das pastas geradas/cache."""
    names = set()
    for dir, subdirs, files in os.walk(root):
        subdirs[:] = [s for s in subdirs if s not in IGNORED_DIRS]
        names.update(files)
    return names


def _resolve(candidate, bases, basenames):
    """Casca: a citacao aponta para algo que existe?

    Citacao COM barra e caminho: resolve estrito, a partir de cada base. Citacao SEM barra e
    NOME (`04-regras.md`): resolve por basename em qualquer lugar da arvore — cobrar caminho
    exato de quem nao escreveu caminho seria inventar exigencia que a spec nunca fez. Citacao
    TERMINADA em `/` e PASTA (`arquitetura/`): resolve se for diretorio a partir de alguma base —
    a barra final e o sinal; sem ela, vale a regra de arquivo acima.
    """
    target = candidate.rstrip("/")
    if candidate.endswith("/"):
        return any(os.path.isdir(os.path.join(base, target)) for base in bases)
    if "/" not in target:
        return target in basenames
    return any(os.path.exists(os.path.join(base, target)) for base in bases)


def audit_pointers(
    files: list[str], bases: tuple, root: str, basenames: set[str]
) -> list[dict]:
    """Casca: caminho citado numa spec que nao existe a partir de nenhuma base."""
    findings = []
    for path in files:
        text = open(path, encoding="utf-8", errors="replace").read()
        rel = os.path.relpath(path, root)
        for line, cited in citations_from_text(text):
            if not _resolve(cited, bases + (os.path.dirname(path),), basenames):
                findings.append(_finding("dead-pointer", rel, line, cited))
    return findings


def audit_wikilinks(files: list[str], root: str) -> list[dict]:
    """Casca: `[[nome]]` que nao casa com o nome de nenhuma spec da arvore."""
    names = {os.path.splitext(os.path.basename(c))[0] for c in files}
    findings = []
    for path in files:
        text = open(path, encoding="utf-8", errors="replace").read()
        rel = os.path.relpath(path, root)
        for line, target in wikilinks_from_text(text):
            if target not in names:
                findings.append(_finding("orphan-wikilink", rel, line, "[[%s]]" % target))
    return findings


def _plans_on_disk(specs_dir):
    """Casca: `{plan: status}` lido de cada `plan/plan-FF.NN-*.md`."""
    dir = os.path.join(specs_dir, "plan")
    if not os.path.isdir(dir):
        return {}
    on_disk = {}
    for name in sorted(os.listdir(dir)):
        match = PLAN_IN_TEXT.match(name)
        if not match or not name.endswith(".md"):
            continue
        text = open(
            os.path.join(dir, name), encoding="utf-8", errors="replace"
        ).read()
        on_disk[match.group(0)] = status_from_frontmatter(text) or "(no status)"
    return on_disk


def audit_queue(specs_dir: str) -> list[dict]:
    """Casca: confronta o `00-indice` com os arquivos de `plan/`."""
    index = os.path.join(specs_dir, "00-indice.md")
    if not os.path.isfile(index):
        return []
    in_index = plans_from_index(open(index, encoding="utf-8", errors="replace").read())
    triples = plan_divergences(in_index, _plans_on_disk(specs_dir))
    return [
        _finding(kind, "specs/00-indice.md", 0, "%s: %s" % (plan, detail))
        for kind, plan, detail in triples
    ]


def audit_plan_names(specs_dir: str) -> list[dict]:
    """Casca: arquivo de `plan/` fora do formato `plan-FF.NN-<slug>.md` (ex.: o antigo `plan-07-x.md`)."""
    dir = os.path.join(specs_dir, "plan")
    if not os.path.isdir(dir):
        return []
    return [
        _finding("plan-outside-format", f"specs/plan/{name}", 0, "expected plan-FF.NN-<slug>.md")
        for name in sorted(os.listdir(dir))
        if plan_outside_format(name)
    ]


def _modules_on_disk(root):
    """Casca: o nome de cada `modules/<m>/` que tem manifesto."""
    dir = os.path.join(root, "modules")
    if not os.path.isdir(dir):
        return []
    return sorted(
        name
        for name in os.listdir(dir)
        if os.path.isfile(os.path.join(dir, name, "module.json"))
    )


def audit_modules(files: list[str], root: str) -> list[dict]:
    """Casca: modulo com manifesto que nenhuma spec da arvore cita pelo nome."""
    modules = _modules_on_disk(root)
    if not modules:
        return []
    corpus = "\n".join(
        open(c, encoding="utf-8", errors="replace").read() for c in files
    )
    return [
        _finding(
            "module-without-spec",
            "modules/%s/" % module,
            0,
            "no spec cites module '%s'" % module,
        )
        for module in modules
        if module not in corpus
    ]


def audit(root: str, specs_dir: str) -> list[dict]:
    """Casca: as sete checagens, na ordem em que o relatorio as apresenta."""
    files = _spec_files(specs_dir)
    bases = (root, specs_dir, os.path.dirname(specs_dir))
    return (
        audit_pointers(files, bases, root, _repo_basenames(root))
        + audit_wikilinks(files, root)
        + audit_queue(specs_dir)
        + audit_plan_names(specs_dir)
        + audit_modules(files, root)
    )


def _print_human(specs_dir, findings):
    """Relatorio legivel — o `--json` continua sendo a saida para maquina."""
    print("\n--- Mechanical parity: %s ---" % specs_dir)
    for a in findings:
        location = "%s:%s" % (a["file"], a["line"]) if a["line"] else a["file"]
        print("  [%s] %s  %s" % (a["kind"], location, a["detail"]))
    verdict = (
        "no mechanical divergence"
        if not findings
        else "%d divergence(s)" % len(findings)
    )
    print("\n[%s] %s" % ("OK" if not findings else "ERROR", verdict))


# Diretorio desta skill (pai de `scripts/`): ancora real, e somente leitura, para os casos de pasta.
_SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Fixtures do `--selftest`: `(rotulo, predicado)` por invariante de nucleo. Constante de
# modulo, e nao corpo de funcao, para a prova crescer sem estourar o limiar de 40 linhas.
CASES = [
    (
        "citation outside fence",
        lambda: citations_from_text("see `a/b.md` here") == [(1, "a/b.md")],
    ),
    (
        "citation inside fence is ignored",
        lambda: citations_from_text("```\n`a/b.md`\n```") == [],
    ),
    (
        "placeholder is not a candidate",
        lambda: _is_candidate("<path>/x.md") is False,
    ),
    (
        "http route is not a candidate",
        lambda: _is_candidate("/servicos") is False,
    ),
    (
        "name without slash resolves by basename",
        lambda: _resolve("04-regras.md", (), {"04-regras.md"}) is True,
    ),
    (
        "existing dir cited with trailing slash resolves",
        lambda: _resolve("scripts/", (_SKILL_DIR,), set()) is True,
    ),
    (
        "missing dir cited with trailing slash is a dead pointer",
        lambda: _resolve("dir-that-does-not-exist/", (_SKILL_DIR,), set()) is False,
    ),
    (
        "missing name without slash fails",
        lambda: _resolve("99-missing.md", (), {"04-regras.md"}) is False,
    ),
    (
        "wikilink extracted",
        lambda: wikilinks_from_text("see [[00-context]]") == [(1, "00-context")],
    ),
    (
        "index reads plan and status",
        lambda: (
            plans_from_index(
                "| 1 | [plan-01.02-x](plan/plan-01.02-x.md) | ob | - | ROXO | specs/ |"
            )
            == {"plan-01.02-x": "ROXO"}
        ),
    ),
    (
        "frontmatter status",
        lambda: status_from_frontmatter('---\nstatus: "VERDE"\n---\n') == "VERDE",
    ),
    (
        "plan without index",
        lambda: (
            plan_divergences({}, {"plan-01.02-x": "A"})[0][0] == "plan-without-index"
        ),
    ),
    (
        "index without plan",
        lambda: (
            plan_divergences({"plan-01.02-x": "A"}, {})[0][0] == "index-without-plan"
        ),
    ),
    (
        "status mismatch",
        lambda: (
            plan_divergences({"plan-01.02-x": "A"}, {"plan-01.02-x": "B"})[0][0]
            == "status-mismatch"
        ),
    ),
    (
        "status parity is not flagged",
        lambda: plan_divergences({"plan-01.02-x": "A"}, {"plan-01.02-x": "A"}) == [],
    ),
    (
        "plan by family is recognized",
        lambda: PLAN_IN_TEXT.fullmatch("plan-02.07-ajustar-cache") is not None,
    ),
    (
        "old format plan-07-x.md is flagged as outside the format",
        lambda: plan_outside_format("plan-07-x.md") is True,
    ),
    (
        "family format is not flagged",
        lambda: plan_outside_format("plan-02.07-x.md") is False,
    ),
    (
        "file that does not call itself a plan (.gitkeep) is not flagged",
        lambda: plan_outside_format(".gitkeep") is False,
    ),
    (
        "index ignores line in the old format",
        lambda: plans_from_index(
            "| 1 | [plan-07-x](plan/plan-07-x.md) | ob | - | ROXO | specs/ |"
        )
        == {},
    ),
    (
        "template FF.NN placeholder is not a path candidate",
        lambda: _is_candidate("arquitetura/FF.NN-api.md") is False,
    ),
]


def run_selftest() -> int:
    """Prova os nucleos puros com fixtures em memoria. Exit 0 se todos passarem."""
    failures = [name for name, fn in CASES if not fn()]
    for name in failures:
        print("[FAIL] %s" % name, file=sys.stderr)
    print(
        "verify_parity --selftest: %d/%d case(s) green"
        % (len(CASES) - len(failures), len(CASES))
    )
    return 1 if failures else 0


def _parser():
    parser = argparse.ArgumentParser(
        description="Mechanical parity between specs and repository."
    )
    parser.add_argument("--root", help="Root of the target repository.")
    parser.add_argument("--specs", help="Specs directory. Default: <root>/specs.")
    parser.add_argument(
        "--json", action="store_true", help="Prints the findings as JSON."
    )
    parser.add_argument(
        "--selftest", action="store_true", help="Proves the core with fixtures."
    )
    return parser


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = _parser()
    args = parser.parse_args()
    if args.selftest:
        return run_selftest()
    if not args.root:
        parser.error("--root is required (or use --selftest)")

    root = os.path.abspath(args.root)
    specs_dir = (
        os.path.abspath(args.specs) if args.specs else os.path.join(root, "specs")
    )
    if not os.path.isdir(specs_dir):
        print("[ERROR] %s is not a specs directory." % specs_dir, file=sys.stderr)
        return 2

    findings = audit(root, specs_dir)
    if args.json:
        print(
            json.dumps(
                {"total": len(findings), "findings": findings},
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        _print_human(specs_dir, findings)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
