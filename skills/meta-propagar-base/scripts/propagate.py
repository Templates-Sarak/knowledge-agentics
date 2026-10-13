"""propagate.py — o PLANO e a CLI da propagacao da base aos sistemas do `mapa.json`.

    python propagate.py --plan [--id <id>] [--json] [--map <arquivo>] [--allow-dirty-base]
    python propagate.py --report [--id <id>] [--map <arquivo>] [--allow-dirty-base]
    python propagate.py --apply --id <id> [--id <id> ...] [--include-divergent] [--include-add?] [--map <arquivo>]
                        [--adopt <path> ...] [--keep <path> --reason "<text>" ...]
    python propagate.py --undo --id <id> [--id <id> ...] [--map <arquivo>]
    python propagate.py --selftest      prova o nucleo do plano, do apply/undo (`apply.py`) e do report

O `--plan` e o `--report` sao somente leitura (nem o `status` do mapa eles escrevem). O `--report`
(`report.py`) e o resumo objetivo para o HITL de selecao: a atualizacao direta e as plans propostas. O
`--apply` e o `--undo` vivem em `apply.py`: escrevem no sistema, no branch CORRENTE (nao criam
branch), SEM commit, com manifesto.

ARQUIVOS PERSONALIZADOS NUNCA SAO ALTERADOS — nem pelo plano, nem pelo apply: os moldes de processo
presentes no sistema (`00-contexto`, `00-indice`, `00-backlog`, `panorama/00-planejamento`) e todo
conteudo do projeto (`specs/specs/`, `specs/arquitetura/` fora dos nomes reservados, `specs/adr/`
exceto o 000, `specs/plan/`). Molde de processo AUSENTE e adicionado; conteudo ausente, nunca.

A ideia central: o sistema e comparado com uma INSTALACAO DE REFERENCIA — o que a base instalaria,
gerada numa pasta temporaria PELOS PROPRIOS INSTALADORES da base (`init_repo.py`, que chama o
`create-project.mjs`; `install_language_base`; a copia de `_estrutura_base_site/`), com os
parametros do sistema, dentro de um `git worktree` do commit (HEAD, ou o do carimbo). O init_repo de um
commit ANTIGO tem outros nomes (`instalar_base_de_linguagem`, `--escopo`): `installer_api` os escolhe
lendo o proprio script daquela arvore.

Decisao por arquivo: `--adopt` aplica so aquele `divergent`/`conflict`; `--keep ... --reason` nao o escreve e
o registra em `kept` no carimbo `.sarak/base.json` com o sha1 do conteudo NORMALIZADO (CRLF -> LF, sem as
linhas de titulo) do sistema e da referencia. No plano, um `kept` cujos dois sha1 seguem iguais aos atuais
e a acao `kept` (sem pendencia); se o projeto editou de novo ou a base mudou a fonte, a decisao VENCEU e
o arquivo volta a `divergent`/`conflict`.

Titulo do projeto: `specs/README.md`/`specs/INDEX.md` (o H1) e `specs/arquitetura/00-base-*.md` (a linha
`titulo:` do frontmatter e o H1) levam o nome do projeto — sao comparados SEM essas linhas, e o apply
escreve o corpo da referencia preservando as linhas de titulo do sistema.

Adocao por historico (sistema sem carimbo): um universal diferente da referencia e comparado com TODAS
as versoes da sua fonte na base (`git log -- <fonte>`). Igual a alguma -> `replace`. Na doutrina, onde
o `create-project.mjs` aplica o escopo, o escopo do sistema e trocado pelo MARCADOR do proprio
`create-project.mjs` antes de comparar (normalizacao, nao reimplementacao). Sem versao igual: em
`tools/` de sistema modular -> `replace-policy` (ADR-009: vendorizado); fora dele -> `divergent`.

Estado persistido lido (`.sarak/base.json`, `mapa.json`): passa por `stamp.normalize_*` (o mapa
antigo->novo vive no `stamp.py`); aqui so se le, nunca se grava chave antiga.

Nucleo x casca: `classify`, `decide`, `make_plan`, `direct_source`, `matching_version`, `adopt`,
`policy`, `lock`, `gaps`, `scope_marker`, `package_scope`, `comparable_sha1`, `split_kept`,
`apply_kept`, `installer_api`, `load_map`, `stamp_commit_of` e `kept_of` sao PUROS — o `--selftest`
os prova. Git, temporarios e disco sao casca.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# O `stamp.py` vive na skill meta-iniciar-repositorio — reaproveitado, nunca copiado.
_STAMP_DIR = str(
    Path(__file__).resolve().parents[2] / "meta-iniciar-repositorio" / "scripts"
)
if _STAMP_DIR not in sys.path:
    sys.path.insert(0, _STAMP_DIR)
import stamp as stamp_module  # noqa: E402

# ------------------------------------------------------------------ categorias (FONTE UNICA)

UNIVERSAL, LAW, PROCESS, CONTENT, GENERATED, GITKEEP, PROJECT = (
    "universal",
    "law",
    "process",
    "content",
    "generated",
    "gitkeep",
    "project",
)
LANGUAGE_BASE = "language-base"  # universal SO se o binding esta na lista do sistema
APP_ONLY = "app-only"  # universal em app; em site, project (o site nao recebe .agents/)

# Primeira regra que casa vence. Cada uma cita de onde vem a posse — a classificacao nao e suposicao:
#  [A] specs/_estrutura_modulos/tools/create-project.mjs — `installDoctrine` instala as cinco leis e o
#      README da doutrina em specs/arquitetura/ e as decisoes em specs/adr/000-decisoes-do-template.md;
#      o comentario de DIRS_WITH_SCOPE_MARKER: "`tools/` e vendorizado — ninguem edita".
#  [B] doutrina/adr/decisoes.md, ADR-009 linha 4: `tools/` e "ferramental vendorizado — o dono e outro
#      repositorio".
#  [C] specs/_estrutura_base/README.md §1.1: 00-knowledge e os dois prompts sao "Universal";
#      00-contexto, 00-indice e 00-backlog sao "Por projeto"; panorama/00-resumo.md e "Gerado".
#  [D] _templates/template-adr.md: `000-decisoes-do-template.md` "Nao [editavel]. Vem do template";
#      os demais ADRs, "voce escreve".
#  [E] panorama/00-planejamento.md §1: os nomes reservados da familia 00 (lei do template, bases);
#      specs/arquitetura/FF.NN-*, specs/specs/ e plans sao do projeto.
#  [F] skills/meta-iniciar-repositorio/scripts/init_repo.py, `install_agents_structure`: substitui
#      .agents/skills/meta-create-skill e grava .agents/gerar_indice.py a cada execucao (so em app).
# Sem declaracao de posse do template -> PROJECT (fora da propagacao, nunca listado): o esqueleto de
# bindings/<b>/root (package.json, config/, src/, packages/, adapters/, scripts/, .githooks/),
# modules/_template e adapters/_template, AGENTS.md/CLAUDE.md (o init_repo so ANEXA) e .sarak/.
RULES = [
    (r"^tools/", UNIVERSAL),  # A, B
    # F — o instalador grava `generate_index.py`; o projeto criado antes da onda 6 do ADR-023 tem o nome
    # antigo, e a propagação reconhece os dois (não migra: o projeto adota o nome novo sob demanda).
    (r"^\.agents/((generate_index|gerar_indice)\.py$|skills/meta-create-skill/)", APP_ONLY),
    (
        r"^specs/.*/\.gitkeep$",
        GITKEEP,
    ),  # o instalador cria a pasta vazia; pasta com conteudo ja cumpre
    (r"^specs/panorama/00-resumo\.md$", GENERATED),  # C
    (r"^specs/panorama/00-planejamento\.md$", PROCESS),  # C, E
    (r"^specs/00-(contexto|indice|backlog)\.md$", PROCESS),  # C
    (
        r"^specs/(00-knowledge|00-prompt-revisor|00-prompt-executor|README|INDEX)\.md$",
        UNIVERSAL,
    ),  # C
    (r"^specs/_templates/", UNIVERSAL),  # C
    (r"^specs/adr/000-decisoes-do-template\.md$", LAW),  # A, D
    (r"^specs/adr/", CONTENT),  # D
    (
        r"^specs/arquitetura/(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras|README)\.md$",
        LAW,
    ),  # A, E
    (
        r"^specs/arquitetura/00-base-(typescript|javascript|python)\.md$",
        LANGUAGE_BASE,
    ),  # E
    (r"^specs/(arquitetura|specs|plan)/", CONTENT),  # E
]
COMPILED_RULES = [(re.compile(pattern), category) for pattern, category in RULES]

# Fonte de cada arquivo instalado — (instalado, fonte na base, tipos, instalador). A primeira que casa
# vence; `{0}` e o grupo capturado. E o que a adocao por historico percorre.
SOURCES = [
    (
        r"^tools/(.+)$",
        "specs/_estrutura_modulos/tools/{0}",
        ("app",),
        "create-project.mjs copyTemplate (cpSync de tools/)",
    ),
    (
        r"^\.agents/skills/meta-create-skill/(.+)$",
        "skills/meta-create-skill/{0}",
        ("app",),
        "init_repo.py install_agents_structure (copytree)",
    ),
    (
        r"^specs/arquitetura/(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras)\.md$",
        "specs/_estrutura_modulos/doutrina/{0}.md",
        ("app",),
        "create-project.mjs installDoctrine (cpSync + applyScope)",
    ),
    (
        r"^specs/adr/000-decisoes-do-template\.md$",
        "specs/_estrutura_modulos/doutrina/adr/decisoes.md",
        ("app",),
        "create-project.mjs installDoctrine (renomeia + applyScope)",
    ),
    (
        r"^specs/arquitetura/(00-base-[a-z]+\.md)$",
        "specs/_bases_arquiteturais/{0}",
        ("app", "site"),
        "init_repo.py install_language_base (rewrites the title)",
    ),
    (
        r"^specs/(.+)$",
        "specs/_estrutura_base/{0}",
        ("app",),
        "init_repo.py install_specs (copytree)",
    ),
    (
        r"^specs/(.+)$",
        "specs/_estrutura_base_site/{0}",
        ("site",),
        "spec-site-fundacao (copy of the whole tree)",
    ),
]
# Fonte onde o `create-project.mjs` aplica o escopo: `applyScope` percorre DIRS_WITH_SCOPE_MARKER,
# que inclui `specs/` — e, quando ele roda, so a doutrina esta em specs/ (o init_repo instala as specs depois).
SCOPED_SOURCE = "specs/_estrutura_modulos/doutrina/"
CREATE_PROJECT = "specs/_estrutura_modulos/tools/create-project.mjs"
# Arquivo TRANSFORMADO pelo instalador de um jeito que a comparacao nao normaliza: fica divergent.
NO_DIRECT_SOURCE = [
    (
        r"^specs/arquitetura/README\.md$",
        "binding commands (create-project.mjs applyMapCommands)",
    ),
    (r"^\.agents/(generate_index|gerar_indice)\.py$", "embedded in init_repo.py (INDEX_GENERATOR)"),
]
H1_ONLY = ("specs/README.md", "specs/INDEX.md")
BASE_WITH_TITLE = re.compile(r"^specs/arquitetura/00-base-[a-z]+\.md$")

LISTED_ACTIONS = (
    "add",
    "add?",
    "blocked",
    "replace",
    "replace-policy",
    "conflict",
    "divergent",
    "obsolete?",
    "kept",
    "report-template",
    "regenerate",
)
ACTION_ORDER = (*LISTED_ACTIONS, "none", "extra")
RESERVED_LAWS = ("arquitetura", "modulo", "contrato-e-dados", "operacao", "regras")
RESERVED_NAMES = re.compile(
    r"^(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras|00-base-[a-z]+|00-fundacao-tecnologica|README)\.md$"
)
SPEC_NN = re.compile(r"^(\d{2})-([a-z0-9][a-z0-9-]*)\.md$")
PLAN_NN = re.compile(r"^plan-\d+-[a-z0-9].*\.md$")
DOCTRINE_TITLE = re.compile(
    r"^(#|titulo:).*(doutrina|funda[cç][aã]o)", re.IGNORECASE | re.MULTILINE
)
SCALAR_NEXT = re.compile(r'^proximo_numero_plan:\s*"?\d', re.MULTILINE)
MARKER_IN_CREATE_PROJECT = re.compile(r"\.replaceAll\('([^']+)',\s*(?:escopo|scope)\)")
SYSTEM_AREAS = ("specs", "tools", ".agents")
IGNORED_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".ruff_cache",
    ".venv",
    "dist",
    "generated",
}
LIST_LIMIT = 8

# O init_repo de uma arvore: nomes por geracao. Commits antigos da base (carimbo) ainda tem os nomes em PT.
INSTALLER_NAMES = {
    "current": {"language_base": "install_language_base", "scope_flag": "--scope"},
    "legacy": {"language_base": "instalar_base_de_linguagem", "scope_flag": "--escopo"},
}


# ------------------------------------------------------------------ nucleo: estado persistido lido


def load_map(text: str) -> dict:
    """Nucleo: o `mapa.json` (novo OU antigo) na forma nova — via `stamp.normalize_map`."""
    return stamp_module.normalize_map(json.loads(text))


def stamp_commit_of(data: dict) -> str | None:
    """Nucleo: o `base_commit` de um carimbo (novo OU antigo)."""
    return stamp_module.normalize_stamp(data).get("base_commit")


def kept_of(data: dict) -> list:
    """Nucleo: as decisoes `kept` bem formadas de um carimbo (novo OU antigo)."""
    items = stamp_module.normalize_stamp(data).get("kept", [])
    keys = {"path", "reason", "system_sha1", "reference_sha1"}
    return [e for e in items if isinstance(e, dict) and keys <= set(e)]


def installer_api(init_repo_text: str) -> dict:
    """Nucleo: os nomes do init_repo DAQUELA arvore — o atual (`install_language_base`, `--scope`) ou o
    de commits antigos (`instalar_base_de_linguagem`, `--escopo`), lidos do proprio script."""
    current = INSTALLER_NAMES["current"]
    return (
        current
        if f"def {current['language_base']}" in init_repo_text
        else INSTALLER_NAMES["legacy"]
    )


# ------------------------------------------------------------------ nucleo: titulo e comparacao


def normalize(text: str) -> str:
    """Fim de linha nao e diferenca de conteudo: CRLF -> LF antes de comparar."""
    return text.replace("\r\n", "\n")


def title_lines(rel: str, lines: list) -> list:
    """Nucleo: os indices das linhas que levam o nome do projeto — o H1 de README/INDEX; a linha
    `titulo:` do frontmatter e o primeiro H1 de `00-base-*`. Fora desses arquivos, nenhuma."""
    if rel in H1_ONLY:
        return [0] if lines and lines[0].startswith("# ") else []
    if not BASE_WITH_TITLE.match(rel) or not lines or lines[0].strip() != "---":
        return []
    end = next(
        (i for i in range(1, len(lines)) if lines[i].strip() == "---"), len(lines)
    )
    title = [i for i in range(1, end) if lines[i].startswith("titulo:")][:1]
    h1 = [i for i in range(end + 1, len(lines)) if lines[i].startswith("# ")][:1]
    return title + h1


def comparable(rel: str, text: str) -> str:
    """O texto como se compara: LF e sem as linhas de titulo do projeto (ver `title_lines`)."""
    lines = normalize(text).split("\n")
    skipped = set(title_lines(rel, lines))
    return "\n".join(line for i, line in enumerate(lines) if i not in skipped)


# ------------------------------------------------------------------ nucleo: classificar e decidir


def classify(path: str, context: dict) -> str:
    """Nucleo: a categoria de um caminho relativo (com `/`). `context` = {kind, bindings, modular}."""
    for rule, category in COMPILED_RULES:
        found = rule.match(path)
        if not found:
            continue
        if category == LANGUAGE_BASE:
            return (
                UNIVERSAL if found.group(1) in context.get("bindings", []) else PROJECT
            )
        if category == APP_ONLY:
            return UNIVERSAL if context.get("kind") == "app" else PROJECT
        return category
    return PROJECT


def _decide_universal(category: str, facts: dict) -> str:
    if not facts["in_ref"]:
        return "obsolete?" if facts["stamped"] and facts["in_old"] else "extra"
    if not facts["exists"]:
        return "add?" if category == LAW and not facts["stamped"] else "add"
    if facts["equals_ref"]:
        return "none"
    if not facts["stamped"]:
        return "divergent"
    return "replace" if facts["equals_old"] else "conflict"


def _decide_process(facts: dict) -> str:
    if not facts["in_ref"]:
        return "none"
    if not facts["exists"]:
        return "add"
    if not facts["equals_ref"] and facts["equals_old"]:
        return "report-template"
    return "none"


def decide(category: str, facts: dict) -> str | None:
    """Nucleo: a acao para um arquivo. `facts` = {exists, in_ref, equals_ref, stamped, in_old,
    equals_old}. Universal diferente sem carimbo e `divergent`; lei ausente sem carimbo e `add?`
    (o projeto pode te-la com outro nome); conteudo e projeto nunca mudam."""
    if category in (UNIVERSAL, LAW):
        return _decide_universal(category, facts)
    if category == PROCESS:
        return _decide_process(facts)
    if category == GITKEEP:
        return "none" if facts["exists"] or not facts["in_ref"] else "add"
    if category == GENERATED:
        return "regenerate"
    return "none" if category == CONTENT else None


# ------------------------------------------------------------------ nucleo: planejar


def _dir_has_content(rel: str, system_files: dict) -> bool:
    folder = rel.rsplit("/", 1)[0] + "/"
    return any(c.startswith(folder) for c in system_files)


def _facts(rel: str, refs: tuple, system_files: dict, category: str) -> dict:
    ref, old = refs
    exists = rel in system_files or (
        category == GITKEEP and _dir_has_content(rel, system_files)
    )
    text = comparable(rel, system_files[rel]) if rel in system_files else None
    return {
        "exists": exists,
        "in_ref": rel in ref,
        "equals_ref": rel in ref and text == comparable(rel, ref[rel]),
        "stamped": old is not None,
        "in_old": old is not None and rel in old,
        "equals_old": old is not None
        and rel in old
        and text == comparable(rel, old[rel]),
    }


def make_plan(ref: dict, old: dict | None, system_files: dict, context: dict) -> dict:
    """Nucleo: `{acao: [caminhos]}` + `template-changed-in-base`, dados os `{rel: texto}` da referencia
    atual, da do carimbo (`None` = sem carimbo) e do sistema."""
    actions = {action: [] for action in ACTION_ORDER}
    for rel in sorted(set(ref) | set(system_files)):
        category = classify(rel, context)
        action = decide(category, _facts(rel, (ref, old), system_files, category))
        if action and (rel in ref or action in ("obsolete?", "extra")):
            actions[action].append(rel)
    changed = [
        rel
        for rel in sorted(ref)
        if old is not None
        and classify(rel, context) == PROCESS
        and rel in old
        and normalize(old[rel]) != normalize(ref[rel])
    ]
    return {"actions": actions, "template-changed-in-base": changed}


# ------------------------------------------------------------------ nucleo: adocao, politica e trava


def direct_source(rel: str, kind: str) -> tuple:
    """Nucleo: `(fonte, None)` se o arquivo tem fonte comparavel na base, ou `(None, motivo)`."""
    for pattern, reason in NO_DIRECT_SOURCE:
        if re.match(pattern, rel):
            return None, reason
    for pattern, template, kinds, _installer in SOURCES:
        found = re.match(pattern, rel)
        if found and kind in kinds:
            return template.format(*found.groups()), None
    return None, "no installer copies this path"


def scope_marker(create_project_text: str) -> str | None:
    """Nucleo: o marcador que o `create-project.mjs` troca pelo escopo (`applyScope`), lido do proprio
    arquivo — nunca escrito a mao aqui."""
    found = MARKER_IN_CREATE_PROJECT.search(create_project_text or "")
    return found.group(1) if found else None


def matching_version(
    rel: str, text: str, versions: list, swap: tuple | None = None
) -> str | None:
    """Nucleo: o commit da primeira versao da fonte igual ao arquivo do sistema, ou `None`. `swap` =
    (escopo, marcador): tambem tenta o texto do sistema com o escopo trocado pelo marcador."""
    targets = {comparable(rel, text)}
    if swap and swap[0] and swap[1]:
        targets.add(comparable(rel, text.replace(swap[0], swap[1])))
    return next(
        (commit for commit, version in versions if comparable(rel, version) in targets),
        None,
    )


def adopt(plan: dict, system_files: dict, versions: dict, swaps: dict) -> dict:
    """Nucleo: reclassifica os `divergent` pela historia. `versions` = {rel: [(commit, texto)] ou o motivo
    (str) de nao haver fonte}; `swaps` = {rel: (escopo, marcador)} onde o escopo foi aplicado."""
    adoption, no_source, no_version, still = {}, {}, [], []
    for rel in plan["actions"]["divergent"]:
        available = versions.get(rel)
        if isinstance(available, str):
            no_source[rel] = available
            still.append(rel)
            continue
        commit = matching_version(
            rel, system_files[rel], available or [], swaps.get(rel)
        )
        if commit:
            adoption[rel] = commit
        else:
            no_version.append(rel)
            still.append(rel)
    actions = {
        **plan["actions"],
        "divergent": still,
        "replace": sorted(plan["actions"]["replace"] + list(adoption)),
    }
    return {
        **plan,
        "actions": actions,
        "adoption": adoption,
        "no-direct-source": no_source,
        "no-matching-version": no_version,
    }


def policy(plan: dict, context: dict) -> dict:
    """Nucleo: em sistema modular, `tools/` divergent vira `replace-policy` (ADR-009: vendorizado)."""
    if not context.get("modular"):
        return plan
    divergent = plan["actions"]["divergent"]
    tools = [r for r in divergent if r.startswith("tools/")]
    actions = {
        **plan["actions"],
        "divergent": [r for r in divergent if r not in tools],
        "replace-policy": tools,
    }
    return {**plan, "actions": actions}


def lock(plan: dict, gap_map: dict) -> dict:
    """Nucleo: com lei/fundacao fora do reservado no sistema, o `add?` vira `blocked` — a plan do
    revisor no projeto decide antes; nenhuma flag o libera."""
    if not gap_map["law-or-foundation-outside-reserved"]:
        return plan
    actions = {**plan["actions"], "blocked": plan["actions"]["add?"], "add?": []}
    return {**plan, "actions": actions}


# ------------------------------------------------------------------ nucleo: decisoes mantidas


def comparable_sha1(rel: str, text: str) -> str:
    """Nucleo: o sha1 do conteudo como se compara (CRLF -> LF, sem as linhas de titulo do projeto)."""
    return hashlib.sha1(comparable(rel, text).encode("utf-8")).hexdigest()


def _kept_is_valid(entry: dict, system_files: dict, ref: dict) -> bool:
    rel = entry["path"]
    return (
        rel in system_files
        and rel in ref
        and entry.get("system_sha1") == comparable_sha1(rel, system_files[rel])
        and entry.get("reference_sha1") == comparable_sha1(rel, ref[rel])
    )


def split_kept(kept: list, system_files: dict, ref: dict) -> tuple:
    """Nucleo: `(validos, vencidos)` — valido = o arquivo do sistema e a fonte da referencia seguem com os
    mesmos sha1 do momento da decisao. Vencido: o projeto editou de novo ou a base mudou aquela fonte."""
    valid = [e for e in kept if _kept_is_valid(e, system_files, ref)]
    return valid, [e for e in kept if e not in valid]


def apply_kept(plan: dict, system_files: dict, ref: dict, kept: list) -> dict:
    """Nucleo: move para `kept` os `divergent`/`conflict` com decisao valida (sem pendencia). Guarda
    `kept` ({rel: motivo}), `kept-valid` (as entradas, para o carimbo) e `kept-expired`."""
    valid, expired = split_kept(kept, system_files, ref)
    by_path = {e["path"]: e for e in valid}
    actions = dict(plan["actions"])
    decided = sorted(
        r for a in ("divergent", "conflict") for r in actions[a] if r in by_path
    )
    for action in ("divergent", "conflict"):
        actions[action] = [r for r in actions[action] if r not in by_path]
    actions["kept"] = decided
    return {
        **plan,
        "actions": actions,
        "kept": {r: by_path[r]["reason"] for r in decided},
        "kept-valid": valid,
        "kept-expired": [e["path"] for e in expired],
        "no-direct-source": {
            r: m
            for r, m in plan.get("no-direct-source", {}).items()
            if r not in by_path
        },
        "no-matching-version": [
            r for r in plan.get("no-matching-version", []) if r not in by_path
        ],
    }


# ------------------------------------------------------------------ nucleo: lacunas


def _law_or_foundation(name: str, text: str) -> bool:
    """Heuristica DECLARADA: fora dos reservados e (comeca por `00-`, ou o slug sem numero comeca pelo de
    uma lei reservada, ou o titulo fala em doutrina/fundacao)."""
    if RESERVED_NAMES.match(name):
        return False
    found = SPEC_NN.match(name)
    slug = found.group(2) if found else ""
    return (
        name.startswith("00-")
        or slug.startswith(RESERVED_LAWS)
        or bool(DOCTRINE_TITLE.search(text[:600]))
    )


def gaps(system_files: dict, context: dict) -> dict:
    """Nucleo: o que falta ou esta fora do padrao — trabalho de uma plan do revisor, nunca da propagacao.
    `context["sarak_ignored"]` e o fato lido pela casca (`git check-ignore` do `.sarak/base.json`)."""
    architecture = {
        c: t
        for c, t in system_files.items()
        if re.match(r"^specs/arquitetura/[^/]+$", c)
    }
    law = sorted(
        c
        for c, t in architecture.items()
        if _law_or_foundation(c.rsplit("/", 1)[-1], t)
    )
    content = [
        c
        for c in system_files
        if re.match(r"^specs/(specs|arquitetura)/[^/]+$", c) and c not in law
    ]
    old_specs = sorted(
        c
        for c in content
        if SPEC_NN.match(c.rsplit("/", 1)[-1])
        and not RESERVED_NAMES.match(c.rsplit("/", 1)[-1])
    )
    plans = sorted(
        c
        for c in system_files
        if c.startswith("specs/plan/") and PLAN_NN.match(c.rsplit("/", 1)[-1])
    )
    index = system_files.get("specs/00-indice.md", "")
    return {
        "law-or-foundation-outside-reserved": law,
        "family-migration-pending": old_specs + plans,
        "template-in-old-format": ["specs/00-indice.md (scalar proximo_numero_plan)"]
        if SCALAR_NEXT.search(index)
        else [],
        "binding-without-base": [
            b
            for b in context.get("bindings", [])
            if f"specs/arquitetura/00-base-{b}.md" not in system_files
        ],
        "no-planning": "specs/panorama/00-planejamento.md" not in system_files,
        "sarak-ignored": bool(context.get("sarak_ignored")),
    }


def package_scope(package_json_text: str | None, path: str) -> str:
    """Nucleo: o escopo que o instalador usou — o `name` do package.json da raiz (onde o
    create-project grava o escopo); sem ele, o default do proprio create-project (nome da pasta)."""
    try:
        name = json.loads(package_json_text or "{}").get("name")
    except ValueError:
        name = None
    return (
        name
        if isinstance(name, str) and name
        else os.path.basename(path.rstrip("/")).lower()
    )


# ------------------------------------------------------------------ casca: git e temporarios


def base_root() -> Path:
    return Path(__file__).resolve().parents[3]


def run(
    command: list, stdin: bytes | None = None, cwd: Path | None = None
) -> subprocess.CompletedProcess:
    return subprocess.run(
        command, input=stdin, cwd=cwd, capture_output=True, check=False
    )


def git(root: Path, *args) -> str | None:
    result = run(["git", "-C", str(root), *args])
    return (
        result.stdout.decode("utf-8", errors="replace").strip()
        if result.returncode == 0
        else None
    )


def dirty_lines(root: Path) -> list:
    """`git status --porcelain -uall`, uma entrada por arquivo — SEM `strip` da saida: a coluna 1 do
    porcelain pode ser espaco, e o caminho comeca na coluna 4."""
    result = run(["git", "-C", str(root), "status", "--porcelain", "-uall"])
    return [
        line
        for line in result.stdout.decode("utf-8", errors="replace").splitlines()
        if line.strip()
    ]


def open_worktree(root: Path, commit: str, destination: Path) -> bool:
    return (
        run(
            [
                "git",
                "-C",
                str(root),
                "worktree",
                "add",
                "--detach",
                str(destination),
                commit,
            ]
        ).returncode
        == 0
    )


def close_worktree(root: Path, destination: Path) -> None:
    run(["git", "-C", str(root), "worktree", "remove", "--force", str(destination)])
    run(["git", "-C", str(root), "worktree", "prune"])


def _source_blobs(root: Path, source: str) -> list:
    """`[(commit, blob)]` de cada versao da fonte no historico da base (mais nova primeiro)."""
    output, commit, pairs = (
        git(root, "log", "--format=%H", "--raw", "--no-abbrev", "--", source) or "",
        None,
        [],
    )
    for line in output.splitlines():
        if re.fullmatch(r"[0-9a-f]{40}", line):
            commit = line
        elif line.startswith(":") and commit:
            blob = line.split("\t")[0].split()[3]
            pairs += [] if set(blob) == {"0"} else [(commit, blob)]
    return pairs


def _contents(root: Path, blobs: list) -> dict:
    """`{blob: texto}` lidos de uma vez por `git cat-file --batch`."""
    result = run(
        ["git", "-C", str(root), "cat-file", "--batch"],
        "".join(f"{b}\n" for b in blobs).encode(),
    )
    output, pos, texts = result.stdout, 0, {}
    while pos < len(output):
        end = output.index(b"\n", pos)
        sha, _kind, size = output[pos:end].decode().split()
        texts[sha] = output[end + 1 : end + 1 + int(size)].decode(
            "utf-8", errors="replace"
        )
        pos = end + 1 + int(size) + 1
    return texts


def source_versions(root: Path, source: str, cache: dict) -> list:
    """Casca: `[(commit, texto)]` da fonte, com cache por execucao."""
    if source not in cache:
        pairs = _source_blobs(root, source)
        texts = _contents(root, sorted({b for _, b in pairs})) if pairs else {}
        cache[source] = [
            (commit, texts[blob]) for commit, blob in pairs if blob in texts
        ]
    return cache[source]


# ------------------------------------------------------------------ casca: referencia


def _init_repo_api(tree: Path) -> tuple:
    """`(pasta dos scripts, nomes do init_repo)` daquela arvore."""
    scripts = tree / "skills" / "meta-iniciar-repositorio" / "scripts"
    script = scripts / "init_repo.py"
    text = (
        script.read_text(encoding="utf-8", errors="replace") if script.is_file() else ""
    )
    return scripts, installer_api(text)


def _install_bases(tree: Path, target: Path, system: dict) -> None:
    """Os `00-base-<binding>.md` de TODOS os bindings, pela funcao do proprio init_repo daquela arvore
    (subprocesso: cada arvore importa o SEU init_repo, sem cache entre versoes)."""
    scripts, api = _init_repo_api(tree)
    code = (
        "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); import init_repo; "
        f"init_repo.{api['language_base']}(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4], sys.argv[5])"
    )
    for binding in system["bindings"]:
        run(
            [
                sys.executable,
                "-c",
                code,
                str(scripts),
                str(target),
                str(tree),
                binding,
                system["name"],
            ]
        )


def _install_app(tree: Path, target: Path, system: dict, scope: str) -> None:
    scripts, api = _init_repo_api(tree)
    command = [
        sys.executable,
        str(scripts / "init_repo.py"),
        "--target",
        str(target),
        "--name",
        system["name"],
    ]
    if system["modular"] and system["bindings"]:
        command += ["--binding", system["bindings"][0], api["scope_flag"], scope]
    run(command)


def generate_reference(tree: Path, target: Path, system: dict, scope: str) -> dict:
    """Casca: instala, com os instaladores de `tree`, o que a base instalaria neste sistema."""
    target.mkdir(parents=True, exist_ok=True)
    if system["kind"] == "site":
        shutil.copytree(
            tree / "specs" / "_estrutura_base_site",
            target / "specs",
            dirs_exist_ok=True,
        )
    else:
        _install_app(tree, target, system, scope)
    _install_bases(tree, target, system)
    return read_tree(target)


def read_tree(root: Path) -> dict:
    """Casca: `{caminho relativo com /: texto}` das areas que a propagacao conhece."""
    files = {}
    for area in SYSTEM_AREAS:
        for folder, subfolders, names in os.walk(root / area):
            subfolders[:] = [s for s in subfolders if s not in IGNORED_DIRS]
            for name in names:
                path = Path(folder) / name
                files[path.relative_to(root).as_posix()] = path.read_text(
                    encoding="utf-8", errors="replace"
                )
    return files


# ------------------------------------------------------------------ casca: um sistema


def read_text(path: Path) -> str | None:
    return path.read_text(encoding="utf-8") if path.is_file() else None


def _stamp_data(folder: Path) -> dict:
    """O `.sarak/base.json` do sistema como dict ({} se ausente ou invalido)."""
    text = read_text(folder / ".sarak" / "base.json")
    try:
        data = json.loads(text) if text else {}
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def stamp_commit(folder: Path) -> str | None:
    return stamp_commit_of(_stamp_data(folder))


def stamp_kept(folder: Path) -> list:
    """Casca: as decisoes `kept` gravadas no carimbo (so as bem formadas)."""
    return kept_of(_stamp_data(folder))


def sarak_ignored(folder: Path) -> bool:
    """Casca: o `.sarak/base.json` do sistema cai num `.gitignore`? (o carimbo nao seria versionado)."""
    return (
        run(
            ["git", "-C", str(folder), "check-ignore", "-q", ".sarak/base.json"]
        ).returncode
        == 0
    )


def system_scope(root: Path, system: dict) -> str:
    return package_scope(
        read_text(root / system["path"] / "package.json"), system["path"]
    )


def _reference_at_commit(
    root: Path, commit: str, tmp: Path, system: dict
) -> dict | None:
    """Referencia gerada num worktree da base em `commit`; `None` se o commit nao abre."""
    tree = tmp / f"base-{commit[:12]}"
    if not open_worktree(root, commit, tree):
        return None
    try:
        return generate_reference(
            tree, tmp / f"ref-{commit[:12]}", system, system_scope(root, system)
        )
    finally:
        close_worktree(root, tree)


def _references(
    root: Path, system: dict, head: str, stamp_commit_id: str | None
) -> tuple:
    tmp = Path(tempfile.mkdtemp(prefix="sarak-propagate-"))
    try:
        ref = _reference_at_commit(root, head, tmp, system)
        old = (
            (
                ref
                if stamp_commit_id == head
                else _reference_at_commit(root, stamp_commit_id, tmp, system)
            )
            if stamp_commit_id
            else None
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return ref, old


def _divergent_history(root: Path, plan: dict, system: dict, cache: dict) -> tuple:
    """Casca: `(versoes, trocas)` para a adocao — as versoes de cada fonte e, na doutrina, o par
    (escopo do sistema, marcador do create-project.mjs no HEAD)."""
    marker = scope_marker(git(root, "show", f"HEAD:{CREATE_PROJECT}") or "")
    scope, versions, swaps = system_scope(root, system), {}, {}
    for rel in plan["actions"]["divergent"]:
        source, reason = direct_source(rel, system["kind"])
        versions[rel] = (
            reason if source is None else source_versions(root, source, cache)
        )
        if source and source.startswith(SCOPED_SOURCE):
            swaps[rel] = (scope, marker)
    return versions, swaps


def _header(system: dict, stamp_commit_id: str | None, head: str) -> dict:
    return {
        "id": system["id"],
        "path": system["path"],
        "kind": system["kind"],
        "modular": system["modular"],
        "bindings": system["bindings"],
        "status": system.get("status"),
        "status_commit": system.get("status_commit"),
        "stamp": stamp_commit_id,
        "behind_head": None if stamp_commit_id is None else stamp_commit_id != head,
    }


def analyze_system(root: Path, system: dict, head: str, cache: dict) -> tuple:
    """Casca: `(plano, referencia, sistema_lido)` — referencias em temporario (apagado), sistema so lido."""
    folder = (root / system["path"]).resolve()
    if not folder.is_dir():
        return (
            {
                **_header(system, None, head),
                "error": f"path not found: {folder}",
            },
            None,
            None,
        )
    stamp_commit_id = stamp_commit(folder)
    ref, old = _references(root, system, head, stamp_commit_id)
    if ref is None:
        return (
            {
                **_header(system, stamp_commit_id, head),
                "error": "could not open the base HEAD in a worktree",
            },
            None,
            None,
        )
    current = read_tree(folder)
    context = {
        "kind": system["kind"],
        "bindings": system["bindings"],
        "modular": system["modular"],
    }
    plan = make_plan(ref, old, current, context)
    if old is None:
        plan = policy(
            adopt(plan, current, *_divergent_history(root, plan, system, cache)),
            context,
        )
    plan = apply_kept(plan, current, ref, stamp_kept(folder))
    gap_map = gaps(current, {**context, "sarak_ignored": sarak_ignored(folder)})
    return (
        {
            **_header(system, stamp_commit_id, head),
            **lock(plan, gap_map),
            "gaps": gap_map,
        },
        ref,
        current,
    )


def plan_system(root: Path, system: dict, head: str, cache: dict) -> dict:
    """Casca: so o plano de um sistema (o `--plan`)."""
    return analyze_system(root, system, head, cache)[0]


# ------------------------------------------------------------------ casca: relatorio do plano


def short_list(items: list, limit: int = LIST_LIMIT) -> str:
    if len(items) <= limit:
        return ", ".join(items)
    return ", ".join(items[:limit]) + f", … +{len(items) - limit}"


def _with_note(rel: str, plan: dict) -> str:
    commit = plan.get("adoption", {}).get(rel)
    reason = plan.get("kept", {}).get(rel)
    if reason:
        return f"{rel} (kept: {reason})"
    return f"{rel} (adoption: identical to the base at {commit[:7]})" if commit else rel


def _header_lines(plan: dict) -> list:
    kind = f"{plan['kind']}{', modular' if plan['modular'] else ''}"
    behind = {None: "—", True: "yes", False: "no"}[plan.get("behind_head")]
    lines = [
        f"=== {plan['id']} ({kind}, bindings {plan['bindings']}) — {plan['path']}",
        f"  status: {plan.get('status')} ({plan.get('status_commit') or '—'})",
        f"  stamp: {plan.get('stamp') or 'none'} · behind HEAD: {behind}",
    ]
    if plan.get("shares_repo_with"):
        lines.append(
            f"  monorepo: shares the repository with {', '.join(plan['shares_repo_with'])}"
        )
    return lines


def _plan_lines(plan: dict) -> list:
    lines = _header_lines(plan)
    if "error" in plan:
        return [*lines, f"  [ERROR] {plan['error']}"]
    actions = plan["actions"]
    lines.append(
        "  actions: "
        + " · ".join(f"{a} {len(actions[a])}" for a in LISTED_ACTIONS + ("none",))
        + f" · project extras {len(actions['extra'])}"
    )
    lines += [
        f"    {a}: {short_list([_with_note(r, plan) for r in actions[a]])}"
        for a in LISTED_ACTIONS
        if actions[a]
    ]
    if plan.get("no-direct-source"):
        lines.append(
            f"    divergent without direct source: {short_list(list(plan['no-direct-source']))}"
        )
    if plan.get("no-matching-version"):
        lines.append(
            f"    no matching version in history: {short_list(plan['no-matching-version'])}"
        )
    if plan.get("kept-expired"):
        lines.append(
            f"    `kept` decision expired (review again): {short_list(plan['kept-expired'])}"
        )
    if plan["template-changed-in-base"]:
        lines.append(
            f"    template changed in the base (informative): {short_list(plan['template-changed-in-base'])}"
        )
    return lines + gap_lines(plan["gaps"])


GAP_LABELS = {
    "law-or-foundation-outside-reserved": "law/foundation with a non-reserved name",
    "family-migration-pending": "family migration pending",
    "template-in-old-format": "template in old format",
    "binding-without-base": "binding without 00-base",
}


def gap_lines(gap_map: dict) -> list:
    lines = []
    for key, label in GAP_LABELS.items():
        items = [c.rsplit("/", 1)[-1] for c in gap_map[key]]
        if items:
            lines.append(f"  gap: {label} ({len(items)}): {short_list(items, 5)}")
    if gap_map["no-planning"]:
        lines.append("  gap: no panorama/00-planejamento.md")
    if gap_map["sarak-ignored"]:
        lines.append(
            "  gap: .sarak/ ignored by git (--apply refuses: the stamp would not be versioned)"
        )
    return lines


def consolidated(plans: list) -> list:
    valid = [p for p in plans if "error" not in p]
    total = {
        action: sum(len(p["actions"][action]) for p in valid) for action in ACTION_ORDER
    }
    lines = [
        "",
        "=== CONSOLIDATED",
        f"  systems: {len(plans)} ({len(plans) - len(valid)} with error)",
    ]
    lines.append(
        "  "
        + " · ".join(f"{a} {total[a]}" for a in LISTED_ACTIONS + ("none",))
        + f" · project extras {total['extra']}"
    )
    lines.append(
        f"  adoption by history: {sum(len(p.get('adoption', {})) for p in valid)} replace recognized"
    )
    for key, label in GAP_LABELS.items():
        lines.append(
            f"  {label}: {', '.join(p['id'] for p in valid if p['gaps'][key]) or '—'}"
        )
    lines.append(
        f"  no panorama/00-planejamento.md: {', '.join(p['id'] for p in valid if p['gaps']['no-planning']) or '—'}"
    )
    lines.append(
        f"  .sarak/ ignored by git: {', '.join(p['id'] for p in valid if p['gaps']['sarak-ignored']) or '—'}"
    )
    lines.append(
        "  [NOTE] This is only the plan (read-only). Summary for deciding: --report. To apply: --apply --id <id>, after the HITL."
    )
    return lines


# ------------------------------------------------------------------ casca: CLI


def _parser():
    parser = argparse.ArgumentParser(
        description="Plan, apply and undo of the base propagation to the systems of mapa.json."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--plan", action="store_true", help="Generates the plan (read-only)."
    )
    mode.add_argument(
        "--report",
        action="store_true",
        help="Objective report for the selection HITL (read-only).",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Applies to the --id, on the current branch, no commit.",
    )
    mode.add_argument(
        "--undo",
        action="store_true",
        help="Undoes the application of the --id, via the manifest.",
    )
    parser.add_argument(
        "--id", action="append", default=[], help="System of the map (repeatable)."
    )
    parser.add_argument("--json", action="store_true", help="Plan output as JSON.")
    parser.add_argument(
        "--map", help="Another mapa.json (test). Default: the one at the base root."
    )
    parser.add_argument(
        "--include-divergent",
        action="store_true",
        help="Also applies the divergent ones (explicit, per run).",
    )
    parser.add_argument(
        "--include-add?",
        dest="include_add",
        action="store_true",
        help="Also applies the add? ones (never the blocked).",
    )
    parser.add_argument(
        "--adopt",
        action="append",
        default=[],
        metavar="PATH",
        help="Applies only this divergent/conflict (repeatable).",
    )
    parser.add_argument(
        "--keep",
        action="append",
        default=[],
        metavar="PATH",
        help="Does not write this divergent/conflict; records it in `kept` of the stamp (requires --reason).",
    )
    parser.add_argument(
        "--reason",
        action="append",
        default=[],
        help="Reason of the matching --keep (same order).",
    )
    parser.add_argument(
        "--allow-dirty-base",
        action="store_true",
        help="Test/development only (--plan, --report and --apply): the reference comes from HEAD (worktree).",
    )
    return parser


def active_systems(map_data: dict, ids: list) -> list:
    active = [
        s for s in map_data.get("systems", []) if s.get("lifecycle") != "later-adoption"
    ]
    return [s for s in active if s["id"] in ids] if ids else active


def _mark_monorepos(plans: list, systems: list) -> None:
    for plan, system in zip(plans, systems, strict=True):
        siblings = [
            s["id"]
            for s in systems
            if s["id"] != system["id"]
            and s.get("git_root")
            and s.get("git_root") == system.get("git_root")
        ]
        if siblings:
            plan["shares_repo_with"] = siblings


def read_map_file(path: Path) -> dict:
    """Casca: o mapa (novo OU antigo) lido do disco, ja na forma nova."""
    return load_map(path.read_text(encoding="utf-8"))


def _plan_command(args, root: Path) -> int:
    if dirty_lines(root) and not args.allow_dirty_base:
        print(
            "[ERROR] the base has local changes — the plan compares against HEAD; commit or discard first.",
            file=sys.stderr,
        )
        return 2
    map_data = read_map_file(Path(args.map or root / "mapa.json"))
    systems, head, cache = (
        active_systems(map_data, args.id),
        git(root, "rev-parse", "HEAD"),
        {},
    )
    plans = [plan_system(root, system, head, cache) for system in systems]
    _mark_monorepos(plans, systems)
    if args.json:
        print(json.dumps(plans, indent=2, ensure_ascii=False))
        return 0
    for plan in plans:
        print("\n".join(_plan_lines(plan)))
    print("\n".join(consolidated(plans)))
    return 0


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    if "--selftest" in sys.argv[1:]:
        return selftest()
    args, root = _parser().parse_args(), base_root()
    if args.plan:
        return _plan_command(args, root)
    if args.report:
        import report  # so carregado quando pedido

        return report.execute(args, root)
    import apply  # apply/undo: so carregado quando pedido

    return apply.apply(args, root) if args.apply else apply.undo(args, root)


# ------------------------------------------------------------------ selftest

APP = {"kind": "app", "bindings": ["typescript"], "modular": True}
SITE = {"kind": "site", "bindings": [], "modular": False}
NONE_OLD = None


def _actions(
    ref: dict, old: dict | None, system_files: dict, context: dict = APP
) -> dict:
    return make_plan(ref, old, system_files, context)["actions"]


def _case_stamped() -> bool:
    a = _actions(
        {"tools/a.mjs": "new", "tools/b.mjs": "new"},
        {"tools/a.mjs": "old", "tools/b.mjs": "old", "tools/x.mjs": "v"},
        {
            "tools/a.mjs": "old",
            "tools/b.mjs": "edited",
            "tools/x.mjs": "v",
            "tools/meu.mjs": "p",
        },
    )
    return (
        a["replace"] == ["tools/a.mjs"]
        and a["conflict"] == ["tools/b.mjs"]
        and a["obsolete?"] == ["tools/x.mjs"]
        and a["extra"] == ["tools/meu.mjs"]
    )


def _case_unstamped() -> bool:
    a = _actions(
        {
            "tools/a.mjs": "new",
            "specs/arquitetura/04-regras.md": "law",
            "specs/00-knowledge.md": "k",
        },
        NONE_OLD,
        {"tools/a.mjs": "old", "tools/meu.mjs": "p"},
    )
    return (
        a["divergent"] == ["tools/a.mjs"]
        and a["add?"] == ["specs/arquitetura/04-regras.md"]
        and a["add"] == ["specs/00-knowledge.md"]
        and a["obsolete?"] == []
        and a["extra"] == ["tools/meu.mjs"]
    )


def _case_templates() -> bool:
    ref = {
        "specs/00-contexto.md": "m",
        "specs/00-indice.md": "m",
        "specs/specs/03.01-x.md": "m",
        "specs/arquitetura/01.01-y.md": "m",
    }
    a = _actions(ref, NONE_OLD, {"specs/00-contexto.md": "filled"}, SITE)
    return a["add"] == ["specs/00-indice.md"] and sorted(a["none"]) == [
        "specs/00-contexto.md",
        "specs/arquitetura/01.01-y.md",
        "specs/specs/03.01-x.md",
    ]


def _case_title_and_gitkeep() -> bool:
    ref = {
        "specs/INDEX.md": "# Mapa: Ref\nbody\n",
        "specs/adr/.gitkeep": "",
        "specs/plan/.gitkeep": "",
    }
    a = _actions(
        ref,
        NONE_OLD,
        {
            "specs/INDEX.md": "# Mapa: My System\r\nbody\r\n",
            "specs/adr/001-x.md": "d",
        },
    )
    return a["none"] == ["specs/INDEX.md", "specs/adr/.gitkeep"] and a["add"] == [
        "specs/plan/.gitkeep"
    ]


def _empty(**actions) -> dict:
    return {"actions": {**{a: [] for a in ACTION_ORDER}, **actions}}


def _case_adoption() -> bool:
    plan = _empty(
        divergent=["tools/a.mjs", "tools/b.mjs", "specs/arquitetura/README.md"]
    )
    files = {
        "tools/a.mjs": "v1\r\n",
        "tools/b.mjs": "edited",
        "specs/arquitetura/README.md": "x",
    }
    versions = {
        "tools/a.mjs": [("c2" * 20, "v2\n"), ("c1" * 20, "v1\n")],
        "tools/b.mjs": [("c1" * 20, "v1\n")],
        "specs/arquitetura/README.md": "binding commands",
    }
    r = adopt(plan, files, versions, {})
    return (
        r["actions"]["replace"] == ["tools/a.mjs"]
        and r["adoption"] == {"tools/a.mjs": "c1" * 20}
        and r["actions"]["divergent"] == ["tools/b.mjs", "specs/arquitetura/README.md"]
        and r["no-matching-version"] == ["tools/b.mjs"]
    )


def _case_adoption_transformed() -> bool:
    base = '---\ntipo: "arquitetura"\ntitulo: "Arquitetura Base: TypeScript"\n---\n\n# Arquitetura Base\nbody\n'
    system_base = '---\ntipo: "arquitetura"\ntitulo: "Arquitetura: ERP (TypeScript)"\n---\n\n# Arquitetura do ERP\nbody\n'
    doctrine, system_doctrine = "use @<escopo>/x e <escopo>\n", "use @erp/x e erp\n"
    plan = _empty(
        divergent=[
            "specs/arquitetura/00-base-typescript.md",
            "specs/arquitetura/01-modulo.md",
        ]
    )
    files = {
        "specs/arquitetura/00-base-typescript.md": system_base,
        "specs/arquitetura/01-modulo.md": system_doctrine,
    }
    versions = {
        "specs/arquitetura/00-base-typescript.md": [("b" * 40, base)],
        "specs/arquitetura/01-modulo.md": [("d" * 40, doctrine)],
    }
    r = adopt(
        plan, files, versions, {"specs/arquitetura/01-modulo.md": ("erp", "<escopo>")}
    )
    return r["actions"]["divergent"] == [] and sorted(r["adoption"]) == [
        "specs/arquitetura/00-base-typescript.md",
        "specs/arquitetura/01-modulo.md",
    ]


def _case_policy_and_lock() -> bool:
    p = policy(_empty(divergent=["tools/a.mjs", "specs/00-knowledge.md"]), APP)
    not_modular = policy(_empty(divergent=["tools/a.mjs"]), SITE)["actions"][
        "divergent"
    ] == ["tools/a.mjs"]
    missing = {
        "law-or-foundation-outside-reserved": [
            "specs/arquitetura/00-arquitetura-erp.md"
        ]
    }
    t = lock(_empty(**{"add?": ["specs/arquitetura/04-regras.md"]}), missing)
    return (
        p["actions"]["replace-policy"] == ["tools/a.mjs"]
        and p["actions"]["divergent"] == ["specs/00-knowledge.md"]
        and not_modular
        and t["actions"]["blocked"] == ["specs/arquitetura/04-regras.md"]
        and t["actions"]["add?"] == []
    )


def _case_gaps() -> bool:
    files = {
        "specs/arquitetura/00-arquitetura-erp.md": "x",
        "specs/arquitetura/05-regras-e-gate.md": "x",
        "specs/arquitetura/02-interface.md": "x",
        "specs/arquitetura/01-modulo.md": "law",
        "specs/arquitetura/00-fundacao-tecnologica.md": "f",
        "specs/specs/03-login.md": "x",
        "specs/plan/plan-07-y.md": "x",
        "specs/00-indice.md": 'proximo_numero_plan: "05"\n',
    }
    f = gaps(files, APP)
    return (
        f["law-or-foundation-outside-reserved"]
        == [
            "specs/arquitetura/00-arquitetura-erp.md",
            "specs/arquitetura/05-regras-e-gate.md",
        ]
        and f["family-migration-pending"]
        == [
            "specs/arquitetura/02-interface.md",
            "specs/specs/03-login.md",
            "specs/plan/plan-07-y.md",
        ]
        and f["template-in-old-format"]
        and f["binding-without-base"] == ["typescript"]
        and f["no-planning"]
        and not f["sarak-ignored"]
        and gaps(files, {**APP, "sarak_ignored": True})["sarak-ignored"]
    )


OLD_STAMP = {
    "base_repo": "r",
    "base_commit": "c" * 40,
    "base_com_alteracoes_locais": False,
    "data": "2026-01-01",
    "tipo": "app",
    "modular": True,
    "bindings": ["typescript"],
    "pacotes": ["specs-sdd-app", "template-modulos"],
    "mantidos": [
        {
            "caminho": "specs/a.md",
            "motivo": "m",
            "sha1_sistema": "1" * 40,
            "sha1_referencia": "2" * 40,
        }
    ],
}
OLD_MAP_TEXT = json.dumps(
    {
        "_doc": "x",
        "sistemas": [
            {
                "id": "s",
                "nome": "S",
                "caminho": "../S",
                "repo": "r",
                "raiz_git": "../S",
                "tipo": "app",
                "modular": True,
                "bindings": ["python"],
                "situacao": "ativo",
                "status": "desatualizado",
                "status_base": "abc1234",
            }
        ],
    }
)


def _case_legacy_stamp() -> bool:
    new = {**stamp_module.normalize_stamp(OLD_STAMP)}
    return (
        stamp_commit_of(OLD_STAMP) == "c" * 40
        and kept_of(OLD_STAMP)
        == [
            {
                "path": "specs/a.md",
                "reason": "m",
                "system_sha1": "1" * 40,
                "reference_sha1": "2" * 40,
            }
        ]
        and kept_of(new) == kept_of(OLD_STAMP)
        and kept_of({"kept": [{"path": "x"}]}) == []
        and stamp_commit_of({}) is None
    )


def _case_legacy_map() -> bool:
    entry = load_map(OLD_MAP_TEXT)["systems"][0]
    again = load_map(json.dumps({"systems": [entry]}))["systems"][0]
    return (
        (entry["name"], entry["path"], entry["git_root"], entry["kind"])
        == ("S", "../S", "../S", "app")
        and (entry["lifecycle"], entry["status"], entry["status_commit"])
        == ("active", "outdated", "abc1234")
        and again == entry
        and [s["id"] for s in active_systems(load_map(OLD_MAP_TEXT), [])] == ["s"]
    )


def _case_installer_api() -> bool:
    current = "def install_language_base(target, base_dir, binding, name):\n    pass\n"
    legacy = "def instalar_base_de_linguagem(target, xskills_root, binding, nome):\n    pass\n"
    return (
        installer_api(current) == INSTALLER_NAMES["current"]
        and installer_api(legacy) == INSTALLER_NAMES["legacy"]
        and installer_api("") == INSTALLER_NAMES["legacy"]
        and INSTALLER_NAMES["legacy"]["scope_flag"] == "--escopo"
    )


CASES = [
    (
        "tools/ is universal; law is law; ADR 000 is law",
        lambda: (
            classify("tools/x.mjs", APP) == UNIVERSAL
            and classify("specs/arquitetura/04-regras.md", APP) == LAW
            and classify("specs/adr/000-decisoes-do-template.md", APP) == LAW
        ),
    ),
    (
        "process templates and content",
        lambda: (
            classify("specs/00-indice.md", APP) == PROCESS
            and classify("specs/specs/03.01-x.md", SITE) == CONTENT
            and classify("specs/adr/001-x.md", APP) == CONTENT
        ),
    ),
    (
        ".agents is universal in app and project in site",
        lambda: (
            classify(".agents/generate_index.py", APP) == UNIVERSAL
            and classify(".agents/gerar_indice.py", APP) == UNIVERSAL
            and classify(".agents/generate_index.py", SITE) == PROJECT
        ),
    ),
    (
        "listed binding base is universal; another is project",
        lambda: (
            classify("specs/arquitetura/00-base-typescript.md", APP) == UNIVERSAL
            and classify("specs/arquitetura/00-base-python.md", APP) == PROJECT
        ),
    ),
    (
        "gitkeep, generated and code",
        lambda: (
            classify("specs/plan/.gitkeep", APP) == GITKEEP
            and classify("specs/panorama/00-resumo.md", APP) == GENERATED
            and classify("src/x.ts", APP) == PROJECT
        ),
    ),
    ("with stamp: replace, conflict, obsolete? and extra", _case_stamped),
    ("without stamp: divergent, add? (law), add, no obsolete?", _case_unstamped),
    ("missing process template is added; content never", _case_templates),
    ("README/INDEX without the title; gitkeep only in an empty folder", _case_title_and_gitkeep),
    (
        "adoption: old version recognized, local edit and no direct source",
        _case_adoption,
    ),
    (
        "adoption of transformed files: 00-base without title and scoped doctrine -> marker",
        _case_adoption_transformed,
    ),
    ("policy on modular tools/ and add? lock", _case_policy_and_lock),
    (
        "gaps: law outside reserved, families, old format, base, planning, .sarak/ ignored",
        _case_gaps,
    ),
    (
        "untouched old template and template changed -> report-template",
        lambda: (
            _actions(
                {"specs/00-indice.md": "new"},
                {"specs/00-indice.md": "old"},
                {"specs/00-indice.md": "old"},
            )["report-template"]
            == ["specs/00-indice.md"]
        ),
    ),
    (
        "source: copy, doctrine, 00-base, README without source",
        lambda: (
            direct_source("tools/gate/a.mjs", "app")
            == ("specs/_estrutura_modulos/tools/gate/a.mjs", None)
            and direct_source("specs/arquitetura/01-modulo.md", "app")[0]
            == "specs/_estrutura_modulos/doutrina/01-modulo.md"
            and direct_source("specs/arquitetura/00-base-python.md", "site")[0]
            == "specs/_bases_arquiteturais/00-base-python.md"
            and direct_source("specs/arquitetura/README.md", "app")[0] is None
        ),
    ),
    (
        "marker read from create-project.mjs, never hand-written",
        lambda: (
            scope_marker("x.replaceAll('<escopo>', escopo)") == "<escopo>"
            and scope_marker("nothing") is None
        ),
    ),
    (
        "title lines: 00-base has the frontmatter title and H1; other files none",
        lambda: (
            title_lines(
                "specs/arquitetura/00-base-python.md",
                ["---", "tipo: x", 'titulo: "T"', "---", "", "# H"],
            )
            == [2, 5]
            and title_lines("specs/00-knowledge.md", ["# A"]) == []
        ),
    ),
    (
        "scope: name of package.json, else the folder",
        lambda: (
            package_scope('{"name": "erp"}', "../Earendel/ERP") == "erp"
            and package_scope(None, "../ZP/Fresh/") == "fresh"
        ),
    ),
    (
        "compat: old stamp (.sarak/base.json) read — commit and kept",
        _case_legacy_stamp,
    ),
    ("compat: old map file read into new keys and values", _case_legacy_map),
    (
        "compat: init_repo of an old commit (legacy names and scope flag) recognized",
        _case_installer_api,
    ),
]


def selftest() -> int:
    """Prova o nucleo do plano, o do apply/undo (`apply.CASES`) e o do report (`report.CASES`)
    em memoria — sem git, sem disco."""
    import apply
    import report

    cases = CASES + apply.CASES + report.CASES
    failures = [name for name, case in cases if not case()]
    for name in failures:
        print(f"[FAIL] {name}", file=sys.stderr)
    print(
        f"propagate --selftest: {len(cases) - len(failures)}/{len(cases)} case(s) green"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
