"""report.py — o REPORT objetivo da propagacao (o `--report` do `propagate.py`), a entrada do HITL
de selecao: por sistema, o que a atualizacao direta escreveria e as PLANS que o revisor escreveria no
repositorio para o que precisa de adequacao. Somente leitura — nada e escrito, nem o status do mapa.

A regra lacuna -> plan proposta vive num lugar so: a tabela `PLANS` abaixo (titulo, familia `00`, destino
da sintese). Os numeros `NN` saem do `proximo_numero_plan` da familia `00` do `00-indice` do repositorio
(formato novo) ou comecam em `01` (formato antigo, ou sem indice). A proposta e SUGESTAO: quem cria a
plan e o revisor, depois do HITL.

O mapa lido (novo OU antigo) passa por `stamp.normalize_map` (via `propagate.read_map_file`).

Nucleo x casca: `proposals`, `next_in_family`, `direct_update`, `blocking_reasons` e
`build_report` sao PUROS — provados pelo `--selftest` do `propagate.py` (este modulo nao tem CLI
propria). Git, disco e referencias temporarias sao casca.
"""

import re
import sys
from pathlib import Path

import propagate as pp

FAMILY = "00"
NAMES_IN_LIST = 5
NO_TARGET = "—"
FAMILY_COUNTER = re.compile(rf"""["']?{FAMILY}["']?\s*:\s*["']?(\d+)""")

# FONTE UNICA da regra lacuna/acao -> plan proposta: (chave, titulo, destino da sintese, depends_on), na ordem
# em que recebem numero — a ordem tambem e dado: a conversao do `00-indice` e a primeira de qualquer repositorio
# em formato antigo, e as outras dependem dela; a decisao (divergent/conflict) e as familias vem depois da lei.
# `depends_on` = chaves de outras linhas; so valem as que foram propostas. A chave e `gap:<nome da lacuna>` ou
# `action:<nome da acao>`. Sem `panorama/00-planejamento` nao ha plan: e adicionado pela atualizacao direta
# (molde de processo ausente).
INDEX = "gap:template-in-old-format"
LAW = "gap:law-or-foundation-outside-reserved"
PLANS = (
    (
        INDEX,
        "Convert `00-indice` to the per-family counter",
        NO_TARGET,
        (),
    ),
    (
        LAW,
        "Reconcile the renamed template law (unblocks the `blocked` ones)",
        NO_TARGET,
        (INDEX,),
    ),
    (
        "gap:family-migration-pending",
        "Migrate specs and plans to `FF.NN` families and build the catalog",
        NO_TARGET,
        (INDEX, LAW),
    ),
    (
        "action:divergent",
        "Decide file by file: adopt the base version or keep",
        NO_TARGET,
        (INDEX, LAW),
    ),
    (
        "action:conflict",
        "Decide file by file (with stamp): adopt the base version or keep",
        NO_TARGET,
        (INDEX, LAW),
    ),
    (
        "gap:binding-without-base",
        "Create the missing language base",
        "arquitetura/00-base-<binding>.md",
        (INDEX,),
    ),
    (
        "gap:sarak-ignored",
        "Remove `.sarak/` from `.gitignore` (prerequisite of apply)",
        NO_TARGET,
        (INDEX,),
    ),
)


# ------------------------------------------------------------------ nucleo


def next_in_family(index_text: str | None) -> int:
    """Nucleo: o `NN` da proxima plan da familia `00` — o valor dela no mapa `proximo_numero_plan` do
    `00-indice`; `1` no formato antigo (contador escalar), sem entrada da familia ou sem indice."""
    text = index_text or ""
    if pp.SCALAR_NEXT.search(text):
        return 1
    found = FAMILY_COUNTER.search(
        next((l for l in text.splitlines() if l.startswith("proximo_numero_plan")), "")
    )
    return int(found.group(1)) if found else 1


def _plan_reasons(gap_map: dict, actions: dict) -> dict:
    """Nucleo: `{chave: motivo/contagem}` so das propostas que se aplicam."""
    law = gap_map["law-or-foundation-outside-reserved"]
    candidates = {
        "gap:law-or-foundation-outside-reserved": (
            law,
            f"{len(law)} file(s) outside the reserved names"
            + (f" · {len(actions['blocked'])} blocked" if actions["blocked"] else ""),
        ),
        "gap:family-migration-pending": (
            gap_map["family-migration-pending"],
            f"{len(gap_map['family-migration-pending'])} spec(s)/plan(s) outside the `FF.NN` format",
        ),
        "gap:template-in-old-format": (
            gap_map["template-in-old-format"],
            "scalar `proximo_numero_plan`",
        ),
        "action:divergent": (
            actions["divergent"],
            f"{len(actions['divergent'])} base file(s) edited in the project",
        ),
        "action:conflict": (
            actions["conflict"],
            f"{len(actions['conflict'])} file(s) edited in the project and changed in the base",
        ),
        "gap:binding-without-base": (
            gap_map["binding-without-base"],
            f"binding(s) {', '.join(gap_map['binding-without-base'])}",
        ),
        "gap:sarak-ignored": (
            gap_map["sarak-ignored"],
            "the stamp would not be versioned",
        ),
    }
    return {key: reason for key, (active, reason) in candidates.items() if active}


def proposals(gap_map: dict, actions: dict, first: int = 1) -> list:
    """Nucleo: as plans propostas, na ordem de `PLANS`, numeradas a partir de `first` (familia `00`).
    `[{id, title, reason, target, depends_on}]`."""
    reasons, output, numbers = _plan_reasons(gap_map, actions), [], {}
    for key, title, target, depends in PLANS:
        if key not in reasons:
            continue
        numbers[key] = f"plan-{FAMILY}.{first + len(output):02d}"
        output.append(
            {
                "id": numbers[key],
                "title": title,
                "reason": reasons[key],
                "target": target,
                "depends_on": [numbers[d] for d in depends if d in numbers],
            }
        )
    return output


def direct_update(actions: dict) -> dict:
    """Nucleo: o que a atualizacao direta escreve SEM flag — `replace` (arquivos da base),
    `replace-policy` (`tools/`) e `add` (novos) —, com ate `NAMES_IN_LIST` nomes (so o arquivo)."""
    groups = (
        ("from-base", actions["replace"]),
        ("tools", actions["replace-policy"]),
        ("new", actions["add"]),
    )
    names = [rel for _, items in groups for rel in items]
    return {
        **{key: len(items) for key, items in groups},
        "names": [rel.rsplit("/", 1)[-1] for rel in names[:NAMES_IN_LIST]],
        "rest": max(0, len(names) - NAMES_IN_LIST),
    }


def blocking_reasons(system: dict, dirty_worktree: bool, sarak_ignored: bool) -> list:
    """Nucleo: por que o sistema NAO pode ser aplicado agora — as mesmas pre-condicoes do `--apply`,
    avaliadas sem escrever."""
    if system.get("lifecycle") != "active":
        return [str(system.get("lifecycle"))]
    return [
        *([] if system.get("git_root") else ["no git_root in the map"]),
        *(["dirty worktree"] if dirty_worktree else []),
        *([".sarak/ ignored"] if sarak_ignored else []),
    ]


def _direct_lines(direct: dict | None) -> list:
    if direct is None:
        return []
    parts = [
        text
        for total, text in (
            (direct["from-base"], f"{direct['from-base']} from the base"),
            (direct["tools"], f"{direct['tools']} `tools/` by policy"),
            (direct["new"], f"{direct['new']} new"),
        )
        if total
    ]
    if not parts:
        return ["**Direct update:** stamp only"]
    more = f" … +{direct['rest']}" if direct["rest"] else ""
    names = ", ".join(f"`{n}`" for n in direct["names"])
    return [f"**Direct update:** {' · '.join(parts)}", f"{names}{more}"]


def _plan_lines(item: dict) -> list:
    if item.get("direct") is None:
        return []
    if not item["proposals"]:
        return ["**Proposed plans:** none"]
    return ["**Proposed plans:**"] + [
        f"- {p['id']} {p['title']} — {p['reason']}" for p in item["proposals"]
    ]


def _block(item: dict) -> str:
    warning = f" · ⚠ {'; '.join(item['reasons'])}" if item["reasons"] else ""
    lines = [
        f"### {item['id']} · {item['status']}{warning}",
        *_direct_lines(item.get("direct")),
        *_plan_lines(item),
    ]
    return "\n".join(lines)


def build_report(items: list, base: str) -> str:
    """Nucleo: o Markdown do report. `items` = [{id, status, reasons, direct, proposals}] (`direct` e
    `None` quando nao ha analise: later-adoption ou erro); `base` = o commit curto da base."""
    header = f"## Propagation — base {base} · {len(items)} system(s)"
    footer = "Choose the repositories (and the plans you accept); nothing was written."
    return "\n\n".join([header, *(_block(i) for i in items), footer]) + "\n"


# ------------------------------------------------------------------ casca


def _system_repo(root: Path, system: dict) -> Path | None:
    return (root / system["git_root"]).resolve() if system.get("git_root") else None


def _item_without_analysis(system: dict, reasons: list) -> dict:
    return {
        "id": system["id"],
        "status": system.get("status"),
        "reasons": reasons,
        "direct": None,
        "proposals": [],
    }


def _item(root: Path, system: dict, head: str, cache: dict) -> dict:
    """Casca: analisa o sistema (referencia em temporario, sistema so lido) e monta o item do report."""
    if system.get("lifecycle") != "active":
        return _item_without_analysis(system, blocking_reasons(system, False, False))
    plan, _ref, current = pp.analyze_system(root, system, head, cache)
    if "error" in plan:
        return _item_without_analysis(system, [f"error: {plan['error']}"])
    repo = _system_repo(root, system)
    dirty = bool(repo and pp.dirty_lines(repo))
    gap_map = plan["gaps"]
    return {
        "id": system["id"],
        "status": system.get("status"),
        "reasons": blocking_reasons(system, dirty, gap_map["sarak-ignored"]),
        "direct": direct_update(plan["actions"]),
        "proposals": proposals(
            gap_map,
            plan["actions"],
            next_in_family(current.get("specs/00-indice.md")),
        ),
    }


def execute(args, root: Path) -> int:
    """Casca da CLI `--report`: todos os sistemas do mapa (ou os `--id`), somente leitura."""
    if pp.dirty_lines(root) and not args.allow_dirty_base:
        print(
            "[ERROR] the base has local changes — the report compares against HEAD; commit or discard first.",
            file=sys.stderr,
        )
        return 2
    map_data = pp.read_map_file(Path(args.map or root / "mapa.json"))
    systems = [
        s for s in map_data.get("systems", []) if not args.id or s["id"] in args.id
    ]
    head, cache = pp.git(root, "rev-parse", "HEAD"), {}
    items = [_item(root, s, head, cache) for s in systems]
    print(build_report(items, head[:7]), end="")
    return 0


# ------------------------------------------------------------------ selftest (rodado pelo propagate.py)

_GAPS = {
    "law-or-foundation-outside-reserved": [],
    "family-migration-pending": [],
    "template-in-old-format": [],
    "binding-without-base": [],
    "no-planning": False,
    "sarak-ignored": False,
}
_ACTIONS = {a: [] for a in pp.ACTION_ORDER}


def _case_proposals() -> bool:
    gap_map = {
        **_GAPS,
        "law-or-foundation-outside-reserved": [
            "specs/arquitetura/00-arquitetura-erp.md"
        ],
        "binding-without-base": ["python"],
        "sarak-ignored": True,
    }
    actions = {
        **_ACTIONS,
        "blocked": ["a", "b"],
        "divergent": ["x"],
        "conflict": ["y", "z"],
    }
    r = proposals(gap_map, actions, 3)
    return (
        [p["id"] for p in r]
        == ["plan-00.03", "plan-00.04", "plan-00.05", "plan-00.06", "plan-00.07"]
        and r[0]["title"].startswith("Reconcile the renamed template law")
        and "2 blocked" in r[0]["reason"]
        and r[1]["title"].startswith("Decide file by file:")
        and "2 file(s)" in r[2]["reason"]
        and r[3]["target"] == "arquitetura/00-base-<binding>.md"
        and r[4]["title"].startswith("Remove `.sarak/`")
        and proposals(_GAPS, _ACTIONS) == []
        and _order_with_index()
    )


def _order_with_index() -> bool:
    gap_map = {
        **_GAPS,
        "template-in-old-format": ["specs/00-indice.md"],
        "family-migration-pending": ["specs/specs/03-x.md"],
        "law-or-foundation-outside-reserved": [
            "specs/arquitetura/00-arquitetura-erp.md"
        ],
    }
    r = proposals(gap_map, {**_ACTIONS, "divergent": ["x"]}, 1)
    by_title = {p["title"].split()[0]: p for p in r}
    return (
        [p["id"] for p in r] == ["plan-00.01", "plan-00.02", "plan-00.03", "plan-00.04"]
        and r[0]["title"].startswith("Convert `00-indice`")
        and r[0]["depends_on"] == []
        and r[1]["depends_on"] == ["plan-00.01"]
        and by_title["Migrate"]["depends_on"] == ["plan-00.01", "plan-00.02"]
        and by_title["Decide"]["depends_on"] == ["plan-00.01", "plan-00.02"]
        and proposals({**_GAPS, "binding-without-base": ["python"]}, _ACTIONS)[0][
            "depends_on"
        ]
        == []
    )


def _case_next() -> bool:
    new = 'tipo: "processo"\nproximo_numero_plan: { "01": "04", "00": "03" } # mapa\n'
    return (
        next_in_family(new) == 3
        and next_in_family('proximo_numero_plan: { "01": "04" }\n') == 1
        and next_in_family('proximo_numero_plan: "05"\n') == 1
        and next_in_family("proximo_numero_plan: {}\n") == 1
        and next_in_family(None) == 1
    )


def _case_direct() -> bool:
    names = [f"specs/n{i}.md" for i in range(5)]
    d = direct_update(
        {
            **_ACTIONS,
            "replace": ["specs/a.md", "specs/b.md"],
            "replace-policy": ["tools/x.mjs"],
            "add": names,
        }
    )
    empty = direct_update(_ACTIONS)
    return (
        (d["from-base"], d["tools"], d["new"]) == (2, 1, 5)
        and len(d["names"]) == 5
        and d["rest"] == 3
        and empty["rest"] == 0
        and not empty["names"]
    )


def _case_blocking() -> bool:
    active = {"lifecycle": "active", "git_root": "../X"}
    return (
        blocking_reasons(active, False, False) == []
        and blocking_reasons(active, True, True)
        == ["dirty worktree", ".sarak/ ignored"]
        and blocking_reasons({"lifecycle": "later-adoption"}, True, True)
        == ["later-adoption"]
    )


def _case_assembly() -> bool:
    direct = direct_update(
        {**_ACTIONS, "replace": ["specs/a.md"], "add": ["specs/b.md"]}
    )
    proposed = proposals({**_GAPS, "binding-without-base": ["python"]}, _ACTIONS)
    text = build_report(
        [
            {
                "id": "x",
                "status": "outdated",
                "reasons": ["dirty worktree"],
                "direct": direct,
                "proposals": proposed,
            },
            {
                "id": "y",
                "status": "updated",
                "reasons": [],
                "direct": direct_update(_ACTIONS),
                "proposals": [],
            },
            {
                "id": "z",
                "status": "outdated",
                "reasons": ["later-adoption"],
                "direct": None,
                "proposals": [],
            },
        ],
        "abc1234",
    )
    lines = text.splitlines()
    return (
        lines[0] == "## Propagation — base abc1234 · 3 system(s)"
        and "### x · outdated · ⚠ dirty worktree" in lines
        and "**Direct update:** 1 from the base · 1 new" in lines
        and "- plan-00.01 Create the missing language base — binding(s) python" in lines
        and "**Proposed plans:** none" in lines
        and "**Direct update:** stamp only" in lines
        and "### z · outdated · ⚠ later-adoption" in lines
        and text.count("**Proposed plans") == 2
    )


def _case_legacy_map_report() -> bool:
    """O report le o `mapa.json` antigo: `sistemas`/`situacao: ativo` viram `systems`/`lifecycle: active`."""
    old = '{"sistemas": [{"id": "a", "situacao": "ativo", "raiz_git": "../A", "status": "pendente"}, {"id": "b", "situacao": "adocao-posterior"}]}'
    systems = pp.load_map(old)["systems"]
    return [blocking_reasons(s, False, False) for s in systems] == [
        [],
        ["later-adoption"],
    ] and systems[0]["status"] == "pending"


CASES = [
    ("report: proposed plans numbered by the table, in order", _case_proposals),
    (
        "report: counter of family 00 (new format, old, no entry)",
        _case_next,
    ),
    ("report: direct update groups and limits to 5 names", _case_direct),
    ("report: reasons for not applicable now", _case_blocking),
    ("report: Markdown in order — header, direct, plans", _case_assembly),
    (
        "compat: report reads the old map file (keys and values in PT)",
        _case_legacy_map_report,
    ),
]
