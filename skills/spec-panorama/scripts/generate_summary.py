"""generate_summary.py — gera `specs/panorama/00-resumo.md` e valida familias e itens do fluxo SDD.

    python generate_summary.py [--specs <dir>]            escreve <dir>/panorama/00-resumo.md
    python generate_summary.py [--specs <dir>] --check   nao escreve; exit 1 se houver problema
    python generate_summary.py --selftest                prova o nucleo com fixtures em memoria

Le de <dir> (a pasta `specs/` do projeto): `panorama/00-planejamento.md` (catalogo §1, horizonte §2),
`00-indice.md` (ordem `#` e motivo), `plan/plan-FF.NN-*.md` (status, titulo, familia, item),
`specs/` e `arquitetura/` (`FF.NN-*.md` e o campo `familia`) e `00-backlog.md` (quantos achados).

A unidade de progresso e o ITEM do horizonte, nao a plan: a plan some na sintese, o item fica ✅.
Saida deterministica (sem data, ordem fixa) — e isso que deixa o `--check` acusar resumo
desatualizado. Teto de 70 linhas: cada lista mostra no maximo N entradas e depois `… +K`.

Nucleo x casca: `build_project`, `checks` e `render` (e o que chamam) sao PURAS — recebem
texto, nunca tocam `fs`; sao o que o `--selftest` prova. `read_texts`/`main` sao a casca. So
biblioteca padrao: o frontmatter e lido por um parser minimo dos campos usados, sem PyYAML.
"""

import argparse
import os
import re
import sys

STATUS = ("🔴", "🟡", "🟠", "🔵", "🟢", "⛔")
IN_PROGRESS = ("🟡", "🟠", "🔵")
LINE_CEILING = 70
# No maximo N entradas por lista antes do `… +K`. Dimensionado para o pior caso caber no teto.
LIMITS = {"now": 8, "next": 8, "families": 12, "blocked": 5, "approved": 5}
FRONTMATTER_FIELDS = ("status", "titulo", "familia", "item")
SUMMARY_FILE = os.path.join("panorama", "00-resumo.md")

HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
CATALOG_ROW = re.compile(r"^\|\s*(\d{2})\s*\|\s*([^|]+?)\s*\|", re.MULTILINE)
FAMILY_HEADING = re.compile(r"^##\s+(\d{2})\s*·\s*(.+?)\s*$")
ITEM_LINE = re.compile(r"^- (⬜|🔷|✅) \*\*R(\d{2})\.(\d+)\*\*\s*(.*)$")
COMPLETION_DATE = re.compile(r"\s*\(✅[^)]*\)\s*$")
PLAN_NAME = re.compile(r"^plan-(\d{2})\.(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
FIXED_NAME = re.compile(r"^(\d{2})\.(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
PLAN_IN_LINE = re.compile(r"plan-(\d{2}\.\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*")
YAML_FIELD = re.compile(r'^(\w+):\s*(?:"([^"]*)"|([^#\n]*?))\s*(?:#.*)?$')
BACKLOG_FINDING = re.compile(r"^\|\s*\d+\s*\|")
NO_POSITION = 10**6


# ------------------------------------------------------------------ nucleo: leitura


def frontmatter(text: str) -> dict:
    """Os campos de `FRONTMATTER_FIELDS` do bloco `---` do topo (aspas e comentario `#` saem)."""
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        return {}
    fields = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        match = YAML_FIELD.match(line)
        if match and match.group(1) in FRONTMATTER_FIELDS:
            value = match.group(2) if match.group(2) is not None else match.group(3)
            fields[match.group(1)] = value.strip()
    return fields


def status_emoji(text: str) -> str:
    """O primeiro emoji de status presente no texto, ou `""`."""
    return next((emoji for emoji in STATUS if emoji in text), "")


def parse_catalog(text: str) -> dict:
    """`{FF: nome}` das linhas da tabela de familias (§1). Comentario HTML nao conta."""
    return dict(CATALOG_ROW.findall(HTML_COMMENT.sub("", text)))


def _item(match, section: str | None) -> dict:
    state, ff, n, rest = match.groups()
    title = COMPLETION_DATE.sub("", rest.split(" — ")[0]).strip()
    return {
        "id": f"R{ff}.{n}",
        "ff": ff,
        "state": state,
        "title": title,
        "section": section,
    }


def parse_items(text: str) -> list:
    """Os itens do horizonte (§2), com a familia do titulo `## FF · Nome` sob o qual estao."""
    items, section = [], None
    for line in HTML_COMMENT.sub("", text).replace("\r\n", "\n").split("\n"):
        title = FAMILY_HEADING.match(line)
        if title:
            section = title.group(1)
            continue
        match = ITEM_LINE.match(line.strip())
        if match:
            items.append(_item(match, section))
    return items


def _position(cell: str) -> int:
    return int(cell) if cell.isdigit() else NO_POSITION


def parse_index(text: str) -> dict:
    """`{FF.NN: {posicao, objetivo, status}}` das linhas da fila do `00-indice`."""
    queue = {}
    for line in text.replace("\r\n", "\n").split("\n"):
        match = PLAN_IN_LINE.search(line) if line.lstrip().startswith("|") else None
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if match and len(cells) >= 6:
            queue[match.group(1)] = {
                "position": _position(cells[0]),
                "objective": cells[2],
                "status": cells[-2],
            }
    return queue


def count_backlog(text: str) -> int:
    """Quantos achados a tabela do `00-backlog` tem (linha cuja primeira celula e um numero)."""
    return sum(
        1 for line in text.split("\n") if BACKLOG_FINDING.match(line.strip())
    )


def _plan(name: str, match, text: str, index: dict) -> dict:
    fields, code = frontmatter(text), f"{match.group(1)}.{match.group(2)}"
    line = index.get(code, {})
    return {
        "code": code,
        "name": name,
        "ff": match.group(1),
        "family": fields.get("familia", ""),
        "item": fields.get("item", ""),
        "status": status_emoji(fields.get("status") or line.get("status", "")),
        "title": fields.get("titulo") or line.get("objective", ""),
        "objective": line.get("objective", ""),
        "position": line.get("position", NO_POSITION),
    }


def parse_plans(plans: dict, index: dict) -> list:
    """As plans em disco (`{nome: texto}`), na ordem da fila do indice."""
    parsed = []
    for name in sorted(plans):
        match = PLAN_NAME.match(name)
        if match:
            parsed.append(_plan(name, match, plans[name], index))
    return sorted(parsed, key=lambda p: (p["position"], p["code"]))


def parse_fixed(fixed: dict) -> list:
    """As specs fixas `FF.NN-*.md` (`{caminho relativo: texto}`); nome reservado da 00 nao casa."""
    parsed = []
    for rel in sorted(fixed):
        match = FIXED_NAME.match(rel.rsplit("/", 1)[-1])
        if match:
            parsed.append(
                {
                    "rel": rel,
                    "ff": match.group(1),
                    "family": frontmatter(fixed[rel]).get("familia", ""),
                }
            )
    return parsed


def build_project(texts: dict) -> dict:
    """Nucleo: o projeto inteiro a partir dos textos ja lidos (ver `read_texts`)."""
    index = parse_index(texts.get("index", ""))
    return {
        "catalog": parse_catalog(texts.get("planning", "")),
        "items": parse_items(texts.get("planning", "")),
        "plans": parse_plans(texts.get("plans", {}), index),
        "fixed": parse_fixed(texts.get("fixed", {})),
        "backlog": count_backlog(texts.get("backlog", "")),
    }


# ------------------------------------------------------------------ nucleo: checagens


def _check_file(label: str, ff: str, family: str, catalog: dict) -> list:
    problems = []
    if ff not in catalog:
        problems.append(f"{label}: family {ff} not in the catalog")
    if family != ff:
        problems.append(
            f"{label}: the name says family {ff}, the frontmatter says familia '{family}'"
        )
    return problems


def _check_families(project: dict) -> list:
    catalog, problems = project["catalog"], []
    for fixed_spec in project["fixed"]:
        problems += _check_file(fixed_spec["rel"], fixed_spec["ff"], fixed_spec["family"], catalog)
    for plan in project["plans"]:
        problems += _check_file(
            f"plan/{plan['name']}", plan["ff"], plan["family"], catalog
        )
    return problems


def _check_items(project: dict) -> list:
    problems, seen = [], set()
    for item in project["items"]:
        if item["id"] in seen:
            problems.append(f"item {item['id']}: ID repetido no horizonte")
        seen.add(item["id"])
        if item["ff"] not in project["catalog"]:
            problems.append(
                f"item {item['id']}: family {item['ff']} not in the catalog"
            )
        if item["section"] != item["ff"]:
            problems.append(
                f"item {item['id']}: sits under the heading of family {item['section']}"
            )
    return problems


def _check_links(project: dict) -> list:
    items = {item["id"]: item for item in project["items"]}
    pointed, problems = set(), []
    for plan in (p for p in project["plans"] if p["item"]):
        pointed.add(plan["item"])
        item = items.get(plan["item"])
        if item is None:
            problems.append(
                f"plan-{plan['code']}: item {plan['item']} does not exist in the horizon"
            )
        elif item["state"] != "🔷":
            problems.append(
                f"plan-{plan['code']}: points to {item['id']}, which is {item['state']} (should be 🔷)"
            )
    for item in items.values():
        if item["state"] == "🔷" and item["id"] not in pointed:
            problems.append(
                f"item {item['id']}: is 🔷 with no open plan pointing to it"
            )
    return problems


def checks(project: dict) -> list:
    """Nucleo: os problemas de familia e de item do projeto (o resumo desatualizado e da casca)."""
    return (
        _check_families(project) + _check_items(project) + _check_links(project)
    )


# ------------------------------------------------------------------ nucleo: resumo


def bar(done: int, total: int, width: int) -> str:
    filled = done * width // total if total else 0
    return "█" * filled + "░" * (width - filled)


def _truncate(lines: list, limit: int, marker) -> list:
    if len(lines) <= limit:
        return lines
    return lines[:limit] + [marker(len(lines) - limit)]


def _as_list(lines: list, limit: int) -> list:
    return _truncate(lines, limit, lambda rest: f"- … +{rest}")


def _plan_line(plan: dict) -> str:
    parts = [plan["status"], f"plan-{plan['code']}", plan["item"], plan["title"]]
    return "- " + " · ".join(part for part in parts if part)


def _progress(items: list) -> list:
    total = len(items)
    if not total:
        return ["sem horizonte definido"]
    done = sum(1 for item in items if item["state"] == "✅")
    return [
        f"{bar(done, total, 10)} {done * 100 // total}% · {done}/{total} itens ✅"
    ]


def _by_status(plans: list, status: tuple, limit: int) -> list:
    return _as_list(
        [_plan_line(p) for p in plans if p["status"] in status], limit
    )


def _family_row(ff: str, name: str, project: dict) -> str | None:
    """A linha da familia na tabela, ou `None` se ela nao tem item nem plan aberta (ruido)."""
    items = [item for item in project["items"] if item["ff"] == ff]
    done = sum(1 for item in items if item["state"] == "✅")
    open_plans = sum(1 for plan in project["plans"] if plan["ff"] == ff)
    if not items and not open_plans:
        return None
    short = bar(done, len(items), 5) if items else "—"
    return f"| {ff} | {name} | {done}/{len(items)} | {short} | {open_plans} |"


def _families(project: dict) -> list:
    candidates = (
        _family_row(ff, name, project)
        for ff, name in sorted(project["catalog"].items())
    )
    lines = [line for line in candidates if line]
    if not lines:
        return []
    header = [
        "| FF | Família | Itens ✅/total | Progresso | Plans abertas |",
        "|---|---|---|---|---|",
    ]
    rest = _truncate(
        lines, LIMITS["families"], lambda k: f"| … | +{k} famílias | | | |"
    )
    return header + rest


def _attention(project: dict, n_problems: int) -> list:
    plans = project["plans"]
    blocked = [
        f"- ⛔ plan-{p['code']} · {p['objective'] or p['title']}"
        for p in plans
        if p["status"] == "⛔"
    ]
    approved = [
        f"- 🟢 plan-{p['code']} · {p['title']} — aguardando síntese"
        for p in plans
        if p["status"] == "🟢"
    ]
    lines = _as_list(blocked, LIMITS["blocked"]) + _as_list(
        approved, LIMITS["approved"]
    )
    if project["backlog"]:
        lines.append(f"- 📋 {project['backlog']} achado(s) no `00-backlog`")
    if n_problems:
        lines.append(
            f"- ⚠️ {n_problems} problema(s) de família/item — rode `generate_summary.py --check`"
        )
    return lines


def _section(title: str, lines: list) -> list:
    return [f"## {title}", *(lines or ["—"]), ""]


HEADER = [
    "---",
    'tipo: "processo"',
    'titulo: "Resumo — Panorama do Projeto"',
    'dominio: "Governança de Specs (SDD)"',
    'status: "🟢 Gerado"',
    'tags: ["processo", "panorama", "resumo", "sdd"]',
    "---",
    "",
    "> Gerado por `spec-panorama` — não edite à mão.",
    "",
    "# Panorama",
    "",
]


def render(project: dict, n_problems: int = 0) -> str:
    """Nucleo: o `00-resumo.md` inteiro. Deterministico: mesma entrada, mesmo texto."""
    plans = project["plans"]
    lines = (
        HEADER
        + _section("Progresso", _progress(project["items"]))
        + _section("Agora", _by_status(plans, IN_PROGRESS, LIMITS["now"]))
        + _section("Próximas", _by_status(plans, ("🔴",), LIMITS["next"]))
        + _section("Por família", _families(project))
        + _section("Atenção", _attention(project, n_problems))
    )
    return "\n".join(lines[:-1]) + "\n"


# ------------------------------------------------------------------ casca


def _read(path: str) -> str:
    if not os.path.isfile(path):
        return ""
    with open(path, encoding="utf-8") as file:
        return file.read()


def _markdowns(dir: str, prefix: str) -> dict:
    if not os.path.isdir(dir):
        return {}
    names = sorted(n for n in os.listdir(dir) if n.endswith(".md"))
    return {f"{prefix}{name}": _read(os.path.join(dir, name)) for name in names}


def read_texts(specs_dir: str) -> dict:
    """Casca: tudo que o nucleo le, a partir da pasta `specs/` do projeto."""
    fixed = {
        **_markdowns(os.path.join(specs_dir, "specs"), "specs/"),
        **_markdowns(os.path.join(specs_dir, "arquitetura"), "arquitetura/"),
    }
    return {
        "planning": _read(os.path.join(specs_dir, "panorama", "00-planejamento.md")),
        "index": _read(os.path.join(specs_dir, "00-indice.md")),
        "backlog": _read(os.path.join(specs_dir, "00-backlog.md")),
        "plans": _markdowns(os.path.join(specs_dir, "plan"), ""),
        "fixed": fixed,
    }


def _check_summary(target: str, content: str, problems: list) -> int:
    if _read(target).replace("\r\n", "\n") != content:
        problems = problems + [
            "panorama/00-resumo.md: outdated — run generate_summary.py without --check"
        ]
    for problem in problems:
        print(f"  [PROBLEM] {problem}")
    print(f"\n[{'ERROR' if problems else 'OK'}] {len(problems)} problem(s)")
    return 1 if problems else 0


def _write(target: str, content: str, problems: list) -> int:
    with open(target, "w", encoding="utf-8", newline="\n") as file:
        file.write(content)
    print(f"[OK] {target} generated ({content.count(chr(10))} lines)")
    if problems:
        print(
            f"[WARNING] {len(problems)} family/item problem(s) — run with --check"
        )
    return 0


def _parser():
    parser = argparse.ArgumentParser(
        description="Generates and checks the SDD flow panorama/00-resumo.md."
    )
    parser.add_argument(
        "--specs", default="specs", help="Project specs/ directory (default: specs)."
    )
    parser.add_argument(
        "--check", action="store_true", help="Does not write; exit 1 on any problem."
    )
    parser.add_argument(
        "--selftest", action="store_true", help="Proves the core with fixtures."
    )
    return parser


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = _parser().parse_args()
    if args.selftest:
        return run_selftest()
    if not os.path.isfile(os.path.join(args.specs, "panorama", "00-planejamento.md")):
        print(
            f"[ERROR] no panorama/00-planejamento.md in {args.specs}", file=sys.stderr
        )
        return 2
    project = build_project(read_texts(args.specs))
    problems = checks(project)
    content = render(project, len(problems))
    target = os.path.join(args.specs, SUMMARY_FILE)
    if args.check:
        return _check_summary(target, content, problems)
    return _write(target, content, problems)


# ------------------------------------------------------------------ autoteste (fixtures em memoria)

PLANNING = """# 1. Famílias
| FF | Família | Escopo |
|---|---|---|
| 00 | Fundação | reservada |
| 01 | Conexão | integrações |
| 02 | Base de dados | schema |

# 2. Horizonte
<!-- - ⬜ **R09.1** exemplo comentado, nao conta -->
## 01 · Conexão
- ✅ **R01.1** Login — por senha (✅ 2026-10-09)
- 🔷 **R01.2** SSO
## 02 · Base de dados
- ✅ **R02.1** Schema inicial
- ⬜ **R02.2** Índices de busca
- ⬜ **R02.3** Particionamento
"""


def _plan_fixture(family: str, status: str, item: str = "") -> str:
    return f'---\ntipo: "plan"\nfamilia: "{family}"\ntitulo: "Title {status}"\nstatus: "{status} x" # options\nitem: "{item}"\n---\n'


def _texts_ok() -> dict:
    return {
        "planning": PLANNING,
        "index": "| 2 | [plan-01.01-sso](plan/plan-01.01-sso.md) | Do SSO | — | 🟡 Em execução | — |\n"
        "| 1 | [plan-02.01-idx](plan/plan-02.01-idx.md) | Waits for the DBA | — | ⛔ Bloqueada | — |\n",
        "backlog": "| # | Achado |\n|---|---|\n| 1 | a |\n| 2 | b |\n| — | _(empty)_ |\n",
        "plans": {
            "plan-01.01-sso.md": _plan_fixture("01", "🟡", "R01.2"),
            "plan-02.01-idx.md": _plan_fixture("02", "⛔"),
        },
        "fixed": {
            "specs/01.01-login.md": '---\nfamilia: "01"\n---\n',
            "arquitetura/04-regras.md": "lei",
        },
    }


def _with(**changes) -> dict:
    texts = _texts_ok()
    texts.update(changes)
    return texts


def _problems(**changes) -> list:
    return checks(build_project(_with(**changes)))


def _big_project() -> dict:
    catalog = "".join(f"| {ff:02d} | Fam {ff} | x |\n" for ff in range(30))
    items = "".join(
        f"## {ff:02d} · Fam\n"
        + "".join(f"- ✅ **R{ff:02d}.{n}** I\n" for n in range(1, 8))
        for ff in range(30)
    )
    plans = {
        f"plan-{ff:02d}.{n:02d}-x.md": _plan_fixture(f"{ff:02d}", s)
        for ff in range(1, 4)
        for n, s in enumerate(STATUS * 4)
    }
    return build_project(
        {"planning": catalog + items, "plans": plans, "backlog": "| 1 | a |\n"}
    )


def _lines(project: dict, n: int = 0) -> list:
    return render(project, n).split("\n")[:-1]


CASES = [
    (
        "catalog reads the table and ignores the header",
        lambda: (
            parse_catalog(PLANNING)
            == {"00": "Fundação", "01": "Conexão", "02": "Base de dados"}
        ),
    ),
    (
        "items: 5, the one in the HTML comment is left out",
        lambda: (
            [i["id"] for i in parse_items(PLANNING)]
            == ["R01.1", "R01.2", "R02.1", "R02.2", "R02.3"]
        ),
    ),
    (
        "item title without phrase and without date",
        lambda: parse_items(PLANNING)[0]["title"] == "Login",
    ),
    (
        "frontmatter strips quotes and comment",
        lambda: (
            frontmatter('---\nstatus: "🔴 To run" # options\nitem: ""\n---\n')
            == {"status": "🔴 To run", "item": ""}
        ),
    ),
    (
        "index: position and objective of the queue",
        lambda: (
            parse_index(_texts_ok()["index"])["02.01"]["objective"] == "Waits for the DBA"
        ),
    ),
    (
        "backlog counts only numbered rows",
        lambda: count_backlog(_texts_ok()["backlog"]) == 2,
    ),
    (
        "progress 40% with a 10-wide bar",
        lambda: (
            _progress(parse_items(PLANNING)) == ["████░░░░░░ 40% · 2/5 itens ✅"]
        ),
    ),
    (
        "no items: no horizon defined",
        lambda: _progress([]) == ["sem horizonte definido"],
    ),
    ("clean project has no problem", lambda: _problems() == []),
    (
        "plans follow the # order of the index",
        lambda: (
            [p["code"] for p in build_project(_texts_ok())["plans"]]
            == ["02.01", "01.01"]
        ),
    ),
    (
        "deterministic summary",
        lambda: (
            render(build_project(_texts_ok()))
            == render(build_project(_texts_ok()))
        ),
    ),
    (
        "empty section becomes —",
        lambda: "## Próximas\n—\n" in render(build_project(_texts_ok())),
    ),
    (
        "now brings status, plan, item and title",
        lambda: (
            "- 🟡 · plan-01.01 · R01.2 · Title 🟡"
            in render(build_project(_texts_ok()))
        ),
    ),
    (
        "attention brings the block reason and the backlog",
        lambda: all(
            t in render(build_project(_texts_ok()))
            for t in ("⛔ plan-02.01 · Waits for the DBA", "📋 2 achado(s)")
        ),
    ),
    (
        "plan family outside the catalog",
        lambda: any(
            "family 07 not in the catalog" in p
            for p in _problems(plans={"plan-07.01-x.md": _plan_fixture("07", "🔴")})
        ),
    ),
    (
        "name inconsistent with the family field",
        lambda: any(
            "frontmatter says familia '02'" in p
            for p in _problems(fixed={"specs/01.01-x.md": '---\nfamilia: "02"\n---\n'})
        ),
    ),
    (
        "item missing from the horizon",
        lambda: any(
            "R01.9 does not exist" in p
            for p in _problems(
                plans={"plan-01.01-sso.md": _plan_fixture("01", "🟡", "R01.9")}
            )
        ),
    ),
    (
        "orphan 🔷 is flagged",
        lambda: any(
            "R01.2: is 🔷 with no open plan" in p for p in _problems(plans={})
        ),
    ),
    (
        "plan pointing to a ⬜ item is flagged",
        lambda: any(
            "which is ⬜" in p
            for p in _problems(
                plans={
                    "plan-02.01-idx.md": _plan_fixture("02", "🟡", "R02.2"),
                    "plan-01.01-sso.md": _plan_fixture("01", "🟡", "R01.2"),
                }
            )
        ),
    ),
    (
        "item under the heading of another family",
        lambda: any(
            "under the heading of family 01" in p
            for p in _problems(
                planning=PLANNING.replace("R02.1", "R02.1").replace(
                    "## 01 · Conexão\n", "## 01 · Conexão\n- ⬜ **R02.9** outside\n"
                )
            )
        ),
    ),
    (
        "big project: fits in 70 lines and truncates",
        lambda: (
            len(_lines(_big_project(), 3)) <= LINE_CEILING
            and "- … +" in render(_big_project())
        ),
    ),
    (
        "big project: families table truncated",
        lambda: "| … | +18 famílias | | | |" in render(_big_project()),
    ),
    (
        "family with no item and no open plan leaves the table",
        lambda: "| 00 | Fundação |" not in render(build_project(_texts_ok())),
    ),
    (
        "family with an item stays in the table",
        lambda: "| 01 | Conexão | 1/2 |" in render(build_project(_texts_ok())),
    ),
    (
        "table with no family with content becomes —",
        lambda: "## Por família\n—\n" in render(build_project({"planning": "| 00 | Fundação | x |\n"})),
    ),
]


def run_selftest() -> int:
    """Prova o nucleo com fixtures em memoria. Exit 0 se todos passarem."""
    failures = [name for name, case in CASES if not case()]
    for name in failures:
        print(f"[FAIL] {name}", file=sys.stderr)
    print(
        f"generate_summary --selftest: {len(CASES) - len(failures)}/{len(CASES)} case(s) green"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
