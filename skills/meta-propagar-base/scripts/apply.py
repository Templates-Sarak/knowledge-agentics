"""apply.py — o APPLY e o UNDO da propagacao (chamados pela CLI do `propagate.py`).

Apply: no branch CORRENTE do sistema (nunca cria branch), escreve SO o que o plano manda e SEM commit
— `add`, `replace`, `replace-policy` e, com flag explicita por execucao, `divergent` e
`add?`; e, por arquivo, o `divergent`/`conflict` dado em `--adopt`. `--keep ... --reason` nao escreve
o arquivo: registra a decisao em `kept` no carimbo (que o apply preserva, descartando as vencidas).
Nunca: `conflict` sem `--adopt`, `obsolete?` (nunca apaga), `blocked`,
molde de processo/conteudo presentes, codigo do projeto. Depois: carimbo `.sarak/base.json` (pelas
funcoes do `stamp.py`), `00-resumo` (so sem migracao de familias pendente), gate (so modular),
manifesto `.sarak/propagation-<curto>.json` e o `status` no `mapa.json`.

Undo: pelo manifesto — restaura do HEAD o que existia, apaga o que foi criado e restaura o status.
So desfaz se o HEAD do sistema e o mesmo do apply (o manifesto o registra) e se o worktree contem
EXATAMENTE as mudancas do manifesto; commit ou mudanca alheia = erro (reverter e decisao do usuario).

Manifestos ANTIGOS (`.sarak/propagacao-<curto>.json`, chaves em PT) continuam desfazendo: a leitura passa
por `normalize_manifest` (o mapa antigo->novo vive so em `LEGACY_*` abaixo) e o arquivo e localizado
tambem pelo nome antigo (`manifest_names`). Snapshots antigos nao sao reescritos.

Nucleo x casca: `applicable_actions`, `compose`, `remaining_gaps`, `pendencies`, `preconditions`,
`undo_preconditions`, `build_manifest`, `undo_plan`, `undo_errors`, `normalize_manifest` e
`manifest_names` sao PUROS — provados pelo `--selftest` do `propagate.py` (este modulo nao tem CLI propria).
"""

import datetime
import json
import sys
import tempfile
from pathlib import Path

import propagate as pp

ALWAYS_APPLIED = ("add", "replace", "replace-policy")
ALWAYS_PENDING = ("conflict", "blocked", "obsolete?")
DECIDABLE = ("divergent", "conflict")
SUMMARY = "specs/panorama/00-resumo.md"
PLANNING = "specs/panorama/00-planejamento.md"
SARAK_IGNORED = (
    "`.sarak/` is in `.gitignore` — the stamp would not be versioned and the next propagation would see "
    "the system without a stamp; removing the rule is the user's decision"
)
MANIFEST_NAME = "propagation-{short}.json"

# ----------------------------------------------------- compatibilidade com o manifesto antigo (PT)
# Mapa antigo -> novo, centralizado: o que versoes anteriores gravaram em `.sarak/propagacao-<curto>.json`.
# So a LEITURA os aceita; a escrita grava so as chaves novas.
LEGACY_MANIFEST_NAMES = ("propagacao-{short}.json",)
LEGACY_MANIFEST_KEYS = {
    "arquivos": "files",
    "head_no_aplicar": "head_at_apply",
    "status_anterior": "previous_status",
    "status_base_anterior": "previous_status_commit",
}
LEGACY_MANIFEST_FILE_KEYS = {
    "caminho": "path",
    "acao": "action",
    "existia": "existed",
    "no_head": "in_head",
    "anterior": "previous",
}
# Valores antigos de `action` (rotulos de arquivo escrito).
LEGACY_ACTION_VALUES = {
    "adicionar": "add",
    "adicionar?": "add?",
    "substituir": "replace",
    "substituir-politica": "replace-policy",
    "divergente": "divergent",
    "adotar": "adopt",
    "carimbo": "stamp",
    "manifesto": "manifest",
    "regenerar": "regenerate",
}


# ------------------------------------------------------------------ nucleo


def applicable_actions(actions: dict, flags: dict) -> list:
    """Nucleo: `[(rel, acao)]` a escrever. `flags` = {divergent, add, adopt}; `blocked` nunca entra."""
    chosen = [
        *ALWAYS_APPLIED,
        *(["divergent"] if flags.get("divergent") else []),
        *(["add?"] if flags.get("add") else []),
    ]
    general = [(rel, action) for action in chosen for rel in actions.get(action, [])]
    already = {rel for rel, _ in general}
    adopted = [
        (rel, "adopt")
        for action in DECIDABLE
        for rel in actions.get(action, [])
        if rel in flags.get("adopt", ()) and rel not in already
    ]
    return general + adopted


def decidable(actions: dict) -> set:
    """Nucleo: o que aceita decisao por arquivo — os `divergent` e `conflict` do plano."""
    return {rel for action in DECIDABLE for rel in actions.get(action, [])}


def decision_errors(
    adopt: list, keep: list, reasons: list, actions_by_id: dict
) -> list:
    """Nucleo: os erros de `--adopt`/`--keep`/`--reason` (vazio = pode aplicar). Cada caminho precisa estar
    em `divergent`/`conflict` de algum dos sistemas escolhidos; cada `--keep` leva o seu `--reason`."""
    errors = (
        [
            f"each --keep needs its --reason and vice versa ({len(keep)} --keep, {len(reasons)} --reason)"
        ]
        if len(keep) != len(reasons)
        else [f"empty --reason for {c}" for c, m in zip(keep, reasons) if not m.strip()]
    )
    errors += [f"{c}: in --adopt and in --keep" for c in sorted(set(adopt) & set(keep))]
    possible = (
        set().union(*(decidable(a) for a in actions_by_id.values()))
        if actions_by_id
        else set()
    )
    errors += [
        f"{c}: not in divergent/conflict — only those accept --adopt/--keep"
        for c in dict.fromkeys([*adopt, *keep])
        if c not in possible
    ]
    return errors


def system_decisions(actions: dict, adopt: list, keep: list, reasons: list) -> tuple:
    """Nucleo: `(adopt, [(rel, reason)])` que cabem a um sistema (o caminho esta no `divergent`/`conflict` dele)."""
    here = decidable(actions)
    return (
        [r for r in adopt if r in here],
        [(r, m) for r, m in zip(keep, reasons, strict=False) if r in here],
    )


def kept_entry(rel: str, reason: str, system_text: str, ref_text: str) -> dict:
    """Nucleo: a entrada de `kept` no carimbo — o sha1 do conteudo normalizado dos dois lados."""
    return {
        "path": rel,
        "reason": reason,
        "system_sha1": pp.comparable_sha1(rel, system_text),
        "reference_sha1": pp.comparable_sha1(rel, ref_text),
    }


def merge_kept(valid: list, new: list, adopted: list) -> list:
    """Nucleo: os `kept` do carimbo novo — as decisoes validas que seguem de pe (menos as adotadas agora)
    mais as novas (que substituem a antiga do mesmo caminho). As vencidas ja ficaram de fora."""
    by_path = {e["path"]: e for e in valid if e["path"] not in adopted}
    by_path.update({e["path"]: e for e in new})
    return [by_path[c] for c in sorted(by_path)]


def _title_kind(line: str) -> str:
    return "title" if line.startswith("titulo:") else "h1"


def compose(rel: str, ref_text: str, system_text: str | None) -> str:
    """Nucleo: o arquivo a escrever — o corpo da referencia com as linhas de titulo DO SISTEMA (pareadas
    por tipo: `titulo:` com `titulo:`, H1 com H1) e o fim de linha do sistema."""
    if system_text is None:
        return ref_text
    ref, system = (
        pp.normalize(ref_text).split("\n"),
        pp.normalize(system_text).split("\n"),
    )
    from_system = {
        _title_kind(system[i]): system[i] for i in pp.title_lines(rel, system)
    }
    for i in pp.title_lines(rel, ref):
        ref[i] = from_system.get(_title_kind(ref[i]), ref[i])
    output = "\n".join(ref)
    return output.replace("\n", "\r\n") if "\r\n" in system_text else output


def remaining_gaps(gap_map: dict, written: set) -> dict:
    """Nucleo: as lacunas que sobram depois de escrever `written` (o planejamento e as bases adicionados
    resolvem as suas)."""
    return {
        **gap_map,
        "no-planning": gap_map["no-planning"] and PLANNING not in written,
        "binding-without-base": [
            b
            for b in gap_map["binding-without-base"]
            if f"specs/arquitetura/00-base-{b}.md" not in written
        ],
    }


def pendencies(actions: dict, written: set, gap_map: dict, gate: dict | None) -> list:
    """Nucleo: o que sobrou para decisao humana. Vazio -> `updated`; senao `pending`. `written` = o que
    foi escrito ou decidido (`--adopt`/`--keep`) agora; `kept` nunca e pendencia."""
    reasons = []
    for action in ALWAYS_PENDING:
        left = [r for r in actions.get(action, []) if r not in written]
        reasons += [f"{action}: {len(left)}"] if left else []
    for action in ("divergent", "add?"):
        missing = [r for r in actions.get(action, []) if r not in written]
        reasons += [f"{action} not applied: {len(missing)}"] if missing else []
    left_gaps = remaining_gaps(gap_map, written)
    reasons += [f"gap {key}" for key, value in left_gaps.items() if value]
    if gate is not None and gate["code"] != 0:
        reasons.append(f"gate failed (exit {gate['code']})")
    return reasons


def _system_errors(system: dict | None, ident: str) -> list:
    if system is None:
        return [f"{ident}: not in the map"]
    errors = (
        []
        if system.get("lifecycle") == "active"
        else [
            f"{ident}: lifecycle '{system.get('lifecycle')}' (only 'active' receives propagation)"
        ]
    )
    return errors + (
        [] if system.get("git_root") else [f"{ident}: no git_root in the map"]
    )


def _group_errors(ids: list, systems: list) -> list:
    errors = []
    for root in sorted(
        {s["git_root"] for s in systems if s.get("id") in ids and s.get("git_root")}
    ):
        group = sorted(s["id"] for s in systems if s.get("git_root") == root)
        missing = [i for i in group if i not in ids]
        errors += (
            [
                f"monorepo {root}: apply/undo the whole group in the same call — {', '.join(group)} (missing {', '.join(missing)})"
            ]
            if missing
            else []
        )
    return errors


def undo_preconditions(ids: list, systems: list) -> list:
    """Nucleo: ids conhecidos, com git_root, e o grupo de monorepo inteiro."""
    by_id = {s["id"]: s for s in systems}
    errors = [
        e for i in ids for e in _system_errors(by_id.get(i), i) if "lifecycle" not in e
    ]
    return errors + _group_errors(ids, systems)


def preconditions(ids: list, systems: list, facts: dict) -> list:
    """Nucleo: os erros que impedem aplicar. `facts` = {dirty_base: [linhas], ignored: [ids com o
    `.sarak/base.json` num .gitignore], repos: {git_root: {clean, head}}}. Qualquer erro -> nada e escrito."""
    by_id = {s["id"]: s for s in systems}
    errors = [] if ids else ["provide at least one --id"]
    errors += [e for i in ids for e in _system_errors(by_id.get(i), i)]
    errors += [f"{i}: {SARAK_IGNORED}" for i in facts["ignored"]]
    errors += (
        [f"base with local changes besides mapa.json: {', '.join(facts['dirty_base'])}"]
        if facts["dirty_base"]
        else []
    )
    errors += _group_errors(ids, systems)
    for root, repo in sorted(facts["repos"].items()):
        errors += (
            []
            if repo["clean"]
            else [
                f"{root}: dirty worktree — applying over someone else's work is forbidden"
            ]
        )
        errors += (
            [] if repo["head"] else [f"{root}: repository without a commit (HEAD)"]
        )
    return errors


def build_manifest(meta: dict, files: list) -> dict:
    """Nucleo: o manifesto da aplicacao. `meta` = {id, base_commit, head_at_apply,
    previous_status, previous_status_commit}; `files` = [{path, action, existed, in_head, previous}]."""
    return {**meta, "files": sorted(files, key=lambda a: a["path"])}


def _rename(data: dict, renames: dict) -> dict:
    """Chaves traduzidas por `renames`, na mesma posicao; a chave nova ja presente vence a antiga."""
    return {
        renames.get(k, k): v
        for k, v in data.items()
        if renames.get(k, k) == k or renames[k] not in data
    }


def normalize_manifest(data: dict) -> dict:
    """Nucleo: um manifesto de propagacao (novo OU antigo) na forma nova. Nao muta `data`. Traduz as chaves
    do manifesto e de cada arquivo, os valores de `action` e os de `previous_status` (via o mapa de
    valores do `stamp.py`)."""
    result = _rename(data, LEGACY_MANIFEST_KEYS)
    status_values = pp.stamp_module.LEGACY_VALUES["status"]
    if isinstance(result.get("previous_status"), str):
        result["previous_status"] = status_values.get(
            result["previous_status"], result["previous_status"]
        )
    files = []
    for entry in result.get("files", []):
        item = _rename(entry, LEGACY_MANIFEST_FILE_KEYS)
        item["action"] = LEGACY_ACTION_VALUES.get(
            item.get("action"), item.get("action")
        )
        files.append(item)
    result["files"] = files
    return result


def manifest_names(short: str) -> list:
    """Nucleo: os nomes de arquivo do manifesto de `short` — o novo primeiro, depois os antigos."""
    return [
        MANIFEST_NAME.format(short=short),
        *(n.format(short=short) for n in LEGACY_MANIFEST_NAMES),
    ]


def _porcelain_path(line: str) -> str:
    path = line[3:].split(" -> ")[-1]
    return path[1:-1] if path.startswith('"') and path.endswith('"') else path


def undo_plan(manifests: list, dirty: list) -> dict:
    """Nucleo: o que restaurar do HEAD, reescrever (existia fora do HEAD), apagar (criado) — e o que no
    worktree e ALHEIO ao manifesto (erro: so se desfaz exatamente o que se aplicou)."""
    files = {a["path"]: a for m in manifests for a in m["files"]}
    return {
        "restore": sorted(c for c, a in files.items() if a["in_head"]),
        "rewrite": sorted(
            c for c, a in files.items() if a["existed"] and not a["in_head"]
        ),
        "delete": sorted(c for c, a in files.items() if not a["existed"]),
        "foreign": sorted(c for c in map(_porcelain_path, dirty) if c not in files),
    }


def undo_errors(manifests: list, current_head: str | None, dirty: list) -> list:
    """Nucleo: o que impede desfazer um repositorio — o HEAD mudou desde o apply (o usuario ja commitou:
    reverter e decisao dele) ou ha mudanca no worktree alheia ao manifesto."""
    expected = manifests[0]["head_at_apply"]
    errors = (
        [
            f"the system HEAD changed since the apply ({str(expected)[:7]} -> {str(current_head)[:7]}) — the result was already committed; reverting (git revert) is your decision"
        ]
        if current_head != expected
        else []
    )
    foreign = undo_plan(manifests, dirty)["foreign"]
    return errors + (
        [f"changes FOREIGN to the manifest: {', '.join(foreign)}"] if foreign else []
    )


# ------------------------------------------------------------------ casca: apoio


def _read_map(root: Path, args) -> tuple:
    path = Path(args.map or root / "mapa.json")
    return path, pp.read_map_file(path)


def _write_map(path: Path, map_data: dict) -> None:
    path.write_text(pp.stamp_module.serialize(map_data), encoding="utf-8", newline="\n")


def _dirty_beyond_map(root: Path) -> list:
    return [
        line for line in pp.dirty_lines(root) if _porcelain_path(line) != "mapa.json"
    ]


def _repo(root: Path, system: dict) -> Path:
    return (root / system["git_root"]).resolve()


def _repo_facts(repo: Path) -> dict:
    return {
        "clean": not pp.dirty_lines(repo),
        "head": pp.git(repo, "rev-parse", "HEAD"),
    }


def _rel_in_repo(repo: Path, file: Path) -> str:
    return file.resolve().relative_to(repo).as_posix()


def _record(repo: Path, file: Path, action: str) -> dict:
    """Como o arquivo estava ANTES de ser escrito — o que o undo precisa."""
    rel = _rel_in_repo(repo, file)
    existed = file.is_file()
    in_head = existed and pp.git(repo, "cat-file", "-e", f"HEAD:{rel}") is not None
    previous = (
        file.read_text(encoding="utf-8", errors="replace")
        if existed and not in_head
        else None
    )
    return {
        "path": rel,
        "action": action,
        "existed": existed,
        "in_head": in_head,
        "previous": previous,
    }


def _write(repo: Path, file: Path, content: str, action: str) -> dict:
    record = _record(repo, file, action)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(content.encode("utf-8"))
    return record


# ------------------------------------------------------------------ casca: aplicar um sistema


def _raw(file: Path) -> str | None:
    """O texto como esta no disco (o `read_tree` normaliza o fim de linha; o `compose` precisa do original)."""
    return (
        file.read_bytes().decode("utf-8", errors="replace") if file.is_file() else None
    )


def _write_plan(context: dict, plan: dict, ref: dict) -> list:
    folder, repo = context["folder"], context["repo"]
    return [
        _write(repo, folder / rel, compose(rel, ref[rel], _raw(folder / rel)), action)
        for rel, action in applicable_actions(plan["actions"], context["flags"])
    ]


def _write_stamp(context: dict, system: dict, kept: list) -> dict:
    stamp_module = pp.stamp_module
    state = {
        **stamp_module.base_state(context["root"]),
        "dirty": bool(_dirty_beyond_map(context["root"])),
    }
    info = {
        "kind": system["kind"],
        "modular": system["modular"],
        "bindings": system["bindings"],
    }
    data = stamp_module.build_stamp(
        state, info, datetime.datetime.now(datetime.UTC).date().isoformat()
    )
    data.update({"kept": kept} if kept else {})
    return _write(
        context["repo"],
        context["folder"] / ".sarak" / "base.json",
        stamp_module.serialize(data),
        "stamp",
    )


def _regenerate_summary(context: dict, gap_map: dict) -> tuple:
    """`(registro ou None, nota)` — so regenera sem migracao de familias pendente (senao o resumo mentiria)."""
    folder = context["folder"]
    if gap_map["family-migration-pending"]:
        return None, "summary not regenerated: family migration pending"
    if not (folder / PLANNING).is_file():
        return None, "summary not regenerated: no panorama/00-planejamento.md"
    record = _record(context["repo"], folder / SUMMARY, "regenerate")
    script = (
        context["root"] / "skills" / "spec-panorama" / "scripts" / "generate_summary.py"
    )
    pp.run([sys.executable, str(script), "--specs", str(folder / "specs")])
    return record, "summary regenerated"


def _run_gate(folder: Path, system: dict) -> dict | None:
    if not system["modular"]:
        return None
    result = pp.run(["node", "tools/gate/validate.mjs", "--all"], cwd=folder)
    output = (
        (result.stdout + result.stderr)
        .decode("utf-8", errors="replace")
        .strip()
        .splitlines()
    )
    return {"code": result.returncode, "summary": output[-6:]}


def _write_manifest(context: dict, system: dict, files: list) -> Path:
    destination = (
        context["folder"] / ".sarak" / MANIFEST_NAME.format(short=context["short"])
    )
    files = [*files, _record(context["repo"], destination, "manifest")]
    meta = {
        "id": system["id"],
        "base_commit": context["head"],
        "head_at_apply": context["head_repo"],
        "previous_status": system.get("status"),
        "previous_status_commit": system.get("status_commit"),
    }
    destination.write_text(
        pp.stamp_module.serialize(build_manifest(meta, files)),
        encoding="utf-8",
        newline="\n",
    )
    return destination


def apply_system(context: dict, system: dict) -> dict:
    """Casca: aplica num sistema (no branch corrente do repositorio). Devolve o resultado para o report e o mapa."""
    plan, ref, current = context["analyses"][system["id"]]
    if "error" in plan:
        return {"id": system["id"], "error": plan["error"]}
    adopt, keep = system_decisions(plan["actions"], *context["decisions"])
    context = {
        **context,
        "folder": (context["root"] / system["path"]).resolve(),
        "flags": {**context["flags"], "adopt": adopt},
    }
    new = [kept_entry(r, m, current[r], ref[r]) for r, m in keep]
    kept = merge_kept(plan["kept-valid"], new, adopt)
    files = _write_plan(context, plan, ref) + [_write_stamp(context, system, kept)]
    summary, note = _regenerate_summary(context, plan["gaps"])
    files += [summary] if summary else []
    gate = _run_gate(context["folder"], system)
    written = {
        (context["repo"] / a["path"]).relative_to(context["folder"]).as_posix()
        for a in files
    }
    decided = written | {r for r, _ in keep}
    reasons = pendencies(plan["actions"], decided, plan["gaps"], gate)
    manifest = _write_manifest(context, system, files)
    return {
        "id": system["id"],
        "plan": plan,
        "files": files,
        "kept": [r for r, _ in keep],
        "expired": plan["kept-expired"],
        "note": note,
        "gate": gate,
        "pendencies": reasons,
        "status": "pending" if reasons else "updated",
        "manifest": manifest,
    }


# ------------------------------------------------------------------ casca: apply (CLI)


def _print_result(result: dict) -> None:
    if "error" in result:
        print(f"=== {result['id']}\n  [ERROR] {result['error']}")
        return
    counts = {}
    for file in result["files"]:
        counts[file["action"]] = counts.get(file["action"], 0) + 1
    print(f"=== {result['id']} — status: {result['status']}")
    print("  applied: " + " · ".join(f"{a} {n}" for a, n in sorted(counts.items())))
    print(f"  {result['note']}")
    print(f"  kept now: {', '.join(result['kept']) or '—'}")
    if result["expired"]:
        print(f"  `kept` decisions expired (discarded): {', '.join(result['expired'])}")
    gate = result["gate"]
    print(
        "  gate: not applicable (not modular)"
        if gate is None
        else f"  gate: exit {gate['code']} — {' | '.join(gate['summary'][-2:])}"
    )
    print(f"  pending: {'; '.join(result['pendencies']) or '—'}")
    print(f"  manifest: {result['manifest']}")


def _instructions(repos: dict) -> None:
    for root, repo in repos.items():
        print(f"\n--- {root}: git diff --stat (tracked) + new")
        print(pp.git(repo["path"], "diff", "--stat") or "(no change in tracked files)")
        new = [line for line in pp.dirty_lines(repo["path"]) if line.startswith("??")]
        print(f"  new (untracked): {len(new)}")
    print(
        "\nmapa.json (base) and the repository are committed by the user. Next (HITL): the executor checks the diff; the reviewer approves."
    )
    print(
        "To go back before committing: propagate.py --undo --id <the same ids> (refuses if HEAD changed)."
    )


def _facts_to_apply(root: Path, args, systems: list) -> dict:
    """`--allow-dirty-base` existe SO para teste/desenvolvimento: a referencia vem do HEAD (worktree)."""
    chosen = [s for s in systems if s["id"] in args.id and s.get("git_root")]
    repos = {s["git_root"]: _repo_facts(_repo(root, s)) for s in chosen}
    dirty = [] if args.allow_dirty_base else _dirty_beyond_map(root)
    ignored = [
        s["id"] for s in chosen if pp.sarak_ignored((root / s["path"]).resolve())
    ]
    return {"dirty_base": dirty, "ignored": ignored, "repos": repos}


def _base_context(args, root: Path, head: str) -> dict:
    flags = {
        "divergent": args.include_divergent,
        "add": args.include_add,
    }
    return {
        "root": root,
        "head": head,
        "short": head[:7],
        "flags": flags,
        "decisions": (
            [c.replace("\\", "/") for c in args.adopt],
            [c.replace("\\", "/") for c in args.keep],
            list(args.reason),
        ),
        "cache": {},
    }


def _fail(errors: list) -> int:
    print("\n".join(f"[ERROR] {e}" for e in errors), file=sys.stderr)
    return 2


def _decision_errors_of(base: dict, analyses: dict) -> list:
    """Valida `--adopt`/`--keep`/`--reason` contra o plano de TODOS os sistemas, antes de escrever."""
    actions = {i: a[0]["actions"] for i, a in analyses.items() if "error" not in a[0]}
    adopt, keep, reasons = base["decisions"]
    return decision_errors(adopt, keep, reasons, actions)


def apply(args, root: Path) -> int:
    """Casca da CLI `--apply`: pre-condicoes, analise e decisoes validadas ANTES de escrever, aplicacao por
    sistema no branch corrente, status no mapa, report."""
    map_path, map_data = _read_map(root, args)
    head = pp.git(root, "rev-parse", "HEAD")
    facts = _facts_to_apply(root, args, map_data["systems"])
    errors = preconditions(args.id, map_data["systems"], facts)
    if errors:
        return _fail(errors)
    chosen = [s for s in map_data["systems"] if s["id"] in args.id]
    base = _base_context(args, root, head)
    base["analyses"] = {
        s["id"]: pp.analyze_system(root, s, head, base["cache"]) for s in chosen
    }
    errors = _decision_errors_of(base, base["analyses"])
    if errors:
        return _fail(errors)
    repos = {
        r: {"path": (root / r).resolve(), "head": f["head"]}
        for r, f in facts["repos"].items()
    }
    for system in chosen:
        repo = repos[system["git_root"]]
        result = apply_system(
            {**base, "repo": repo["path"], "head_repo": repo["head"]},
            system,
        )
        _print_result(result)
        if "error" not in result:
            system.update({"status": result["status"], "status_commit": head[:7]})
            _write_map(map_path, map_data)
    _instructions(repos)
    return 0


# ------------------------------------------------------------------ casca: undo


def find_manifest(folder: Path, short: str) -> Path | None:
    """Casca: o arquivo do manifesto de `short` em `<folder>/.sarak` — pelo nome novo, senao pelo antigo."""
    for name in manifest_names(short):
        candidate = folder / ".sarak" / name
        if candidate.is_file():
            return candidate
    return None


def _group_manifests(root: Path, systems: list) -> tuple:
    """O manifesto de cada sistema e o do `status_commit` (o curto do ultimo apply, gravado no mapa)."""
    manifests, errors = [], []
    for system in systems:
        short = system.get("status_commit")
        found = (
            find_manifest((root / system["path"]).resolve(), short) if short else None
        )
        if found:
            manifests.append(
                normalize_manifest(json.loads(found.read_text(encoding="utf-8")))
            )
        else:
            errors.append(
                f"{system['id']}: propagation manifest not found (status_commit {short or 'empty'})"
            )
    return manifests, errors


def _delete_with_empty_dirs(repo: Path, rel: str) -> None:
    file = repo / rel
    if file.is_file():
        file.unlink()
    folder = file.parent
    while folder != repo and folder.is_dir() and not any(folder.iterdir()):
        folder.rmdir()
        folder = folder.parent


def _run_undo(repo: Path, plan: dict, manifests: list) -> None:
    if plan["restore"]:
        pp.run(
            [
                "git",
                "-C",
                str(repo),
                "restore",
                "--source=HEAD",
                "--staged",
                "--worktree",
                "--",
                *plan["restore"],
            ]
        )
    outside_head = plan["rewrite"] + plan["delete"]
    if (
        outside_head
    ):  # se o usuario deu `git add`, o arquivo sai do indice antes (senao fica "AD")
        pp.run(
            [
                "git",
                "-C",
                str(repo),
                "rm",
                "-q",
                "--cached",
                "--ignore-unmatch",
                "--",
                *outside_head,
            ]
        )
    previous = {a["path"]: a["previous"] for m in manifests for a in m["files"]}
    for rel in plan["rewrite"]:
        (repo / rel).write_bytes(previous[rel].encode("utf-8"))
    for rel in plan["delete"]:
        _delete_with_empty_dirs(repo, rel)


def _undo_repo(root: Path, group: list) -> tuple:
    """`(manifestos, erros)` de um repositorio; sem erro, ja desfeito no disco (o branch nao e tocado)."""
    repo = _repo(root, group[0])
    manifests, errors = _group_manifests(root, group)
    if not errors:
        dirty = pp.dirty_lines(repo)
        errors = [
            f"{repo}: {e}"
            for e in undo_errors(manifests, pp.git(repo, "rev-parse", "HEAD"), dirty)
        ]
    if errors:
        return [], errors
    _run_undo(repo, undo_plan(manifests, pp.dirty_lines(repo)), manifests)
    return manifests, []


def undo(args, root: Path) -> int:
    """Casca da CLI `--undo`: por repositorio, restaura pelo manifesto e devolve o status anterior."""
    map_path, map_data = _read_map(root, args)
    errors = undo_preconditions(args.id, map_data["systems"]) or (
        [] if args.id else ["provide at least one --id"]
    )
    if errors:
        print("\n".join(f"[ERROR] {e}" for e in errors), file=sys.stderr)
        return 2
    chosen = [s for s in map_data["systems"] if s["id"] in args.id]
    for git_root in sorted({s["git_root"] for s in chosen}):
        manifests, errors = _undo_repo(
            root, [s for s in chosen if s["git_root"] == git_root]
        )
        if errors:
            print("\n".join(f"[ERROR] {e}" for e in errors), file=sys.stderr)
            return 2
        for manifest in manifests:
            system = next(s for s in map_data["systems"] if s["id"] == manifest["id"])
            system.update(
                {
                    "status": manifest["previous_status"],
                    "status_commit": manifest["previous_status_commit"],
                }
            )
        _write_map(map_path, map_data)
        print(
            f"[OK] {git_root}: undone — branch untouched, status restored ({', '.join(m['id'] for m in manifests)})."
        )
    return 0


# ------------------------------------------------------------------ selftest (rodado pelo propagate.py)

_ACTIONS = {
    **{a: [] for a in pp.ACTION_ORDER},
    "add": ["a"],
    "replace": ["s"],
    "replace-policy": ["t"],
    "divergent": ["d"],
    "add?": ["q"],
    "blocked": ["b"],
    "conflict": ["c"],
}
_EMPTY = {a: [] for a in pp.ACTION_ORDER}
_CLEAN_GAPS = {
    "law-or-foundation-outside-reserved": [],
    "family-migration-pending": [],
    "template-in-old-format": [],
    "binding-without-base": [],
    "no-planning": False,
    "sarak-ignored": False,
}
_SYSTEMS = [
    {"id": "x", "lifecycle": "active", "git_root": "../X"},
    {"id": "r1", "lifecycle": "active", "git_root": "../R"},
    {"id": "r2", "lifecycle": "active", "git_root": "../R"},
    {"id": "chat", "lifecycle": "later-adoption", "git_root": "../C"},
]
_REPO_OK = {"clean": True, "head": "a" * 40}


def _errors(
    ids: list, dirty_base: list | None = None, ignored: tuple = (), **repo
) -> list:
    roots = {s["git_root"] for s in _SYSTEMS if s["id"] in ids}
    return preconditions(
        ids,
        _SYSTEMS,
        {
            "dirty_base": dirty_base or [],
            "ignored": list(ignored),
            "repos": {r: {**_REPO_OK, **repo} for r in roots},
        },
    )


def _case_compose() -> bool:
    ref_base = '---\ntitulo: "Arquitetura Base: TypeScript"\n---\n\n# Arquitetura Base\nnew body\n'
    system_base = '---\r\ntitulo: "Arquitetura: ERP (TypeScript)"\r\n---\r\n\r\n# Arquitetura do ERP\r\nold body\r\n'
    composed = compose("specs/arquitetura/00-base-typescript.md", ref_base, system_base)
    readme = compose("specs/README.md", "# Ref\nnew body\n", "# My System\nold body\n")
    return (
        composed
        == '---\r\ntitulo: "Arquitetura: ERP (TypeScript)"\r\n---\r\n\r\n# Arquitetura do ERP\r\nnew body\r\n'
        and readme == "# My System\nnew body\n"
        and compose("specs/00-knowledge.md", "# R\nx\n", "# S\ny\n") == "# R\nx\n"
    )


def _file(path: str, existed: bool, in_head: bool, previous=None) -> dict:
    return {
        "path": path,
        "action": "x",
        "existed": existed,
        "in_head": in_head,
        "previous": previous,
    }


def _case_undo() -> bool:
    manifest = build_manifest(
        {"id": "x"},
        [
            _file("specs/00-knowledge.md", True, True),
            _file(".sarak/base.json", True, False, "{}"),
            _file("specs/panorama/00-planejamento.md", False, False),
        ],
    )
    plan = undo_plan(
        [manifest],
        [
            " M specs/00-knowledge.md",
            "?? specs/panorama/00-planejamento.md",
            " M src/app.ts",
        ],
    )
    return (
        plan["restore"] == ["specs/00-knowledge.md"]
        and plan["rewrite"] == [".sarak/base.json"]
        and plan["delete"] == ["specs/panorama/00-planejamento.md"]
        and plan["foreign"] == ["src/app.ts"]
    )


def _case_undo_errors() -> bool:
    manifest = build_manifest(
        {"id": "x", "head_at_apply": "a" * 40}, [_file("specs/a.md", False, False)]
    )
    own = ["?? specs/a.md"]
    return (
        undo_errors([manifest], "a" * 40, own) == []
        and "HEAD changed" in undo_errors([manifest], "b" * 40, [])[0]
        and "FOREIGN" in undo_errors([manifest], "a" * 40, [" M src/x.ts"])[0]
    )


def _case_decision() -> bool:
    actions = {**_EMPTY, "divergent": ["a", "b"], "conflict": ["c"], "replace": ["s"]}
    every = applicable_actions(actions, {"adopt": ["a", "c", "s"]})
    only_adopt = [(r, x) for r, x in every if x == "adopt"]
    included = applicable_actions(actions, {"divergent": True, "adopt": ["a"]})
    by_id = {"x": actions}
    return (
        only_adopt == [("a", "adopt"), ("c", "adopt")]
        and ("s", "replace") in every
        and [r for r, _ in included].count("a") == 1
        and decision_errors(["a"], ["b"], ["reason"], by_id) == []
        and len(decision_errors(["s"], [], [], by_id)) == 1
        and len(decision_errors([], ["a"], [], by_id)) == 1
        and len(decision_errors(["a"], ["a"], ["m"], by_id)) == 1
        and len(decision_errors([], ["b"], [" "], by_id)) == 1
        and system_decisions(actions, ["a", "z"], ["c"], ["m"]) == (["a"], [("c", "m")])
    )


def _case_kept() -> bool:
    rel = "specs/00-knowledge.md"
    entry = kept_entry(rel, "x", "mine\r\nbody\r\n", "ref\n")
    plan = {"actions": {**_EMPTY, "divergent": [rel], "conflict": ["specs/b.md"]}}
    ref = {rel: "ref\n", "specs/b.md": "r"}
    valid = pp.apply_kept(plan, {rel: "mine\nbody\n", "specs/b.md": "s"}, ref, [entry])
    edited = pp.apply_kept(
        plan, {rel: "mine\nbody2\n", "specs/b.md": "s"}, ref, [entry]
    )
    base_changed = pp.apply_kept(plan, {rel: "mine\nbody\n"}, {rel: "ref2\n"}, [entry])
    renewed = {**entry, "reason": "y"}
    return (
        len(entry["system_sha1"]) == 40
        and valid["actions"]["kept"] == [rel]
        and valid["actions"]["divergent"] == []
        and valid["actions"]["conflict"] == ["specs/b.md"]
        and valid["kept"] == {rel: "x"}
        and edited["actions"]["divergent"] == [rel]
        and edited["kept-expired"] == [rel]
        and base_changed["actions"]["kept"] == []
        and merge_kept([entry], [renewed], []) == [renewed]
        and merge_kept([entry], [], [rel]) == []
    )


def _case_kept_status() -> bool:
    actions = {**_EMPTY, "kept": ["m"], "conflict": ["c"], "divergent": ["d"]}
    without = pendencies(actions, {"c", "d"}, _CLEAN_GAPS, {"code": 0})
    with_pending = pendencies(actions, set(), _CLEAN_GAPS, {"code": 0})
    return without == [] and len(with_pending) == 2


# Manifesto como as versoes anteriores gravaram (chaves em PT, nome `propagacao-<curto>.json`).
LEGACY_MANIFEST = {
    "id": "x",
    "base_commit": "b" * 40,
    "head_no_aplicar": "a" * 40,
    "status_anterior": "desatualizado",
    "status_base_anterior": "abc1234",
    "arquivos": [
        {
            "caminho": "specs/00-knowledge.md",
            "acao": "substituir",
            "existia": True,
            "no_head": True,
            "anterior": None,
        },
        {
            "caminho": ".sarak/base.json",
            "acao": "carimbo",
            "existia": True,
            "no_head": False,
            "anterior": "{}",
        },
        {
            "caminho": "specs/panorama/00-planejamento.md",
            "acao": "adicionar",
            "existia": False,
            "no_head": False,
            "anterior": None,
        },
        {
            "caminho": ".sarak/propagacao-bbbbbbb.json",
            "acao": "manifesto",
            "existia": False,
            "no_head": False,
            "anterior": None,
        },
    ],
}


def _case_legacy_manifest() -> bool:
    manifest = normalize_manifest(LEGACY_MANIFEST)
    again = normalize_manifest(manifest)
    plan = undo_plan(
        [manifest],
        [
            " M specs/00-knowledge.md",
            "?? specs/panorama/00-planejamento.md",
            "?? .sarak/propagacao-bbbbbbb.json",
        ],
    )
    return (
        manifest["head_at_apply"] == "a" * 40
        and (manifest["previous_status"], manifest["previous_status_commit"])
        == ("outdated", "abc1234")
        and "arquivos" not in manifest
        and [f["action"] for f in manifest["files"]]
        == ["replace", "stamp", "add", "manifest"]
        and again == manifest
        and "head_no_aplicar" in LEGACY_MANIFEST
        and plan["restore"] == ["specs/00-knowledge.md"]
        and plan["rewrite"] == [".sarak/base.json"]
        and plan["delete"]
        == [".sarak/propagacao-bbbbbbb.json", "specs/panorama/00-planejamento.md"]
        and plan["foreign"] == []
        and undo_errors([manifest], "a" * 40, [" M specs/00-knowledge.md"]) == []
    )


def _case_manifest_location() -> bool:
    names = manifest_names("abc1234")
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        (folder / ".sarak").mkdir()
        none = find_manifest(folder, "abc1234")
        (folder / ".sarak" / "propagacao-abc1234.json").write_text(
            "{}", encoding="utf-8"
        )
        legacy = find_manifest(folder, "abc1234")
        (folder / ".sarak" / "propagation-abc1234.json").write_text(
            "{}", encoding="utf-8"
        )
        current = find_manifest(folder, "abc1234")
    return (
        names == ["propagation-abc1234.json", "propagacao-abc1234.json"]
        and none is None
        and legacy is not None
        and legacy.name == "propagacao-abc1234.json"
        and current is not None
        and current.name == "propagation-abc1234.json"
    )


def _case_new_manifest_keys() -> bool:
    manifest = build_manifest(
        {
            "id": "x",
            "base_commit": "b" * 40,
            "head_at_apply": "a" * 40,
            "previous_status": "updated",
            "previous_status_commit": None,
        },
        [_file("a.md", True, True)],
    )
    legacy_keys = set(LEGACY_MANIFEST_KEYS) | set(LEGACY_MANIFEST_FILE_KEYS)
    return (
        not legacy_keys & set(manifest)
        and not legacy_keys & set(manifest["files"][0])
        and normalize_manifest(manifest) == manifest
    )


CASES = [
    (
        "apply: only add/replace/replace-policy by default",
        lambda: (
            [a for _, a in applicable_actions(_ACTIONS, {})]
            == ["add", "replace", "replace-policy"]
        ),
    ),
    (
        "apply: flags include divergent and add?, never blocked/conflict",
        lambda: (
            [
                r
                for r, _ in applicable_actions(
                    _ACTIONS, {"divergent": True, "add": True}
                )
            ]
            == ["a", "s", "t", "d", "q"]
        ),
    ),
    (
        "compose: reference body with the system title and its line ending",
        _case_compose,
    ),
    (
        "status: clean and green gate -> no pendency",
        lambda: (
            pendencies(
                {
                    **_ACTIONS,
                    "divergent": [],
                    "add?": [],
                    "blocked": [],
                    "conflict": [],
                },
                set(),
                _CLEAN_GAPS,
                {"code": 0},
            )
            == []
        ),
    ),
    (
        "status: conflict, unapplied divergent, blocked and red gate are pending",
        lambda: len(pendencies(_ACTIONS, {"d"}, _CLEAN_GAPS, {"code": 1})) == 4,
    ),
    (
        "status: planning and base added resolve the gaps",
        lambda: (
            remaining_gaps(
                {
                    **_CLEAN_GAPS,
                    "no-planning": True,
                    "binding-without-base": ["python"],
                },
                {PLANNING, "specs/arquitetura/00-base-python.md"},
            )
            == _CLEAN_GAPS
        ),
    ),
    ("preconditions: all good -> no error", lambda: _errors(["x"]) == []),
    (
        "preconditions: dirty worktree and dirty base (no branch check)",
        lambda: len(_errors(["x"], ["src/a.py"], clean=False)) == 2,
    ),
    (
        "preconditions: any current branch will do, but a commit is required",
        lambda: (
            _errors(["x"], head=None) == ["../X: repository without a commit (HEAD)"]
        ),
    ),
    (
        "preconditions: half a monorepo and later-adoption",
        lambda: (
            any("monorepo ../R" in e for e in _errors(["r1"]))
            and any("later-adoption" in e for e in _errors(["chat"]))
        ),
    ),
    (
        "preconditions: .sarak/ in .gitignore is an error (nothing written)",
        lambda: _errors(["x"], ignored=("x",)) == [f"x: {SARAK_IGNORED}"],
    ),
    ("undo: restores, rewrites, deletes and flags the foreign", _case_undo),
    (
        "decision: --adopt filters divergent/conflict; path and reason errors",
        _case_decision,
    ),
    ("kept: entry with normalized sha1; valid only with both sha1 equal", _case_kept),
    (
        "status: kept is not a pendency; conflict/divergent decided now neither",
        _case_kept_status,
    ),
    ("undo: refuses a changed HEAD and a foreign change", _case_undo_errors),
    (
        "undo: half a monorepo is an error",
        lambda: any("monorepo" in e for e in undo_preconditions(["r2"], _SYSTEMS)),
    ),
    (
        "compat: old manifest (PT keys) read and undone by the undo plan",
        _case_legacy_manifest,
    ),
    (
        "compat: manifest located by the new and by the old name (propagacao-*)",
        _case_manifest_location,
    ),
    (
        "manifest: what is written has only new keys and is idempotent when normalized",
        _case_new_manifest_keys,
    ),
]
