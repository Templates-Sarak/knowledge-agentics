"""Todo id de regra citado em skill, command, agent, hook ou `README.md` existe no catalogo do gate.

O `pointers.py` resolve CAMINHO e nome de artefato; nenhum verificador olhava id de regra. Foi assim
que a renomeacao do `ADR-024` deixaria citacoes apontando para o vazio sem ninguem notar. O catalogo
e lido do CODIGO do gate (`tools/gate/rules/*.mjs` + o pseudo-id do `engine.mjs`), nunca de lista
escrita aqui; os ids antigos vem da tabela que viaja com o gate (`tools/gate/renamed-rules.json`).

Forma INEQUIVOCA — o que conta como citacao, porque "kebab-case entre crases" sozinho casa nome de
skill, de flag e de arquivo:

1. token entre crases que e id ANTIGO com hifen (`estrutura-estrita`): so pode ser a regra;
2. token entre crases logo depois de "regra(s)", "id(s)" ou "rule" — e os que o seguem numa enumeracao
   (`a`, `b` e `c`);
3. primeira coluna de linha de tabela de catalogo (`| \\`id\\` | erro |`).

Fica de fora de proposito: id de UMA palavra fora dessas formas (`contract`, `tests`, `log` aparecem em
prosa comum), e token que e nome de skill/command/agent/hook ou id de sistema do `mapa.json` (o "id"
de `--id <id>` e outro id). Prefere falso negativo a falso positivo, como a familia heuristica do
gate (`04-regras.md` §7.2).

Nucleo x casca: `invalid_ids` e pura; `audit_cited_ids` le o disco.
"""

import json
import os
import re

from map_schema import systems_of

GATE_RULES = "specs/_estrutura_modulos/tools/gate/rules"
GATE_ENGINE = "specs/_estrutura_modulos/tools/gate/engine.mjs"
RENAME_TABLE = "specs/_estrutura_modulos/tools/gate/renamed-rules.json"

AUDITED_DIRS = ("skills", "commands", "agents", "hooks")
AUDITED_FILES = ("README.md",)
EXTENSIONS = {".md", ".py", ".js", ".mjs", ".json"}
IGNORED_DIRS = {"node_modules", ".git", "__pycache__", ".venv", ".ruff_cache"}

# Arquivos que citam id antigo DE PROPOSITO (documentam a renomeacao): caminho -> motivo.
EXCEPTIONS = {
    "skills/meta-propagar-base/references/campanha-idioma.md": "documents the language campaign and cites old and nonexistent ids as history",
    "skills/meta-verificacao-base/scripts/audit_base.py": "the --selftest fixtures cite an old id and a nonexistent id on purpose",
    "skills/meta-verificacao-base/scripts/cited_ids.py": "the docstring cites an old id as an example of the unambiguous form",
}

RULE_ID = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
RE_ID_IN_GATE = re.compile(r"^\s*id:\s*'([a-z][a-z0-9-]*)'", re.MULTILINE)
RE_PSEUDO_ID = re.compile(r"EXTRACTION_ID\s*=\s*'([a-z][a-z0-9-]*)'")
RE_BACKTICKS = re.compile(r"`([^`\s]+)`")
RE_CATALOG_LINE = re.compile(
    r"^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(?:erro|aviso)\s*\|"
)
RE_BEFORE_RULE = re.compile(
    r"\b(?:regras?|ids?|rule)\s+(?:de\s+gate\s+)?$", re.IGNORECASE
)
RE_BETWEEN_CITATIONS = re.compile(r"^(?:\s*,\s*|\s+e\s+|\s+ou\s+|\s*/\s*)$")


def catalog_ids(rule_texts: list, engine_text: str) -> set:
    """Os ids que o gate declara: `id: '...'` de cada arquivo de regras mais o pseudo-id da extracao."""
    ids = set()
    for text in rule_texts:
        ids.update(RE_ID_IN_GATE.findall(text))
    ids.update(RE_PSEUDO_ID.findall(engine_text))
    return ids


def _citations_of_line(line: str, old_with_hyphen: set) -> list:
    """Os tokens da linha que sao citacao inequivoca de id (ver as tres formas no topo do modulo)."""
    in_table = RE_CATALOG_LINE.match(line)
    cited = []
    last_end = None
    last_was_citation = False
    for matched in RE_BACKTICKS.finditer(line):
        token = matched.group(1)
        if not RULE_ID.match(token):
            last_was_citation = False
            continue
        before = line[: matched.start()]
        between = line[last_end : matched.start()] if last_end is not None else None
        is_citation = (
            token in old_with_hyphen
            or RE_BEFORE_RULE.search(before) is not None
            or (
                last_was_citation
                and between is not None
                and RE_BETWEEN_CITATIONS.match(between) is not None
            )
            or (in_table is not None and in_table.group(1) == token)
        )
        if is_citation:
            cited.append(token)
        last_was_citation = is_citation
        last_end = matched.end()
    return cited


def invalid_ids(
    texts_by_file: dict, catalog: set, renamed: dict, non_rules: set
) -> list:
    """Uma mensagem por (arquivo, linha, id) citado que o catalogo nao tem. `renomeados` e
    `{antigo: novo}` (da tabela viajante); `non_rules` e o que NAO e id de regra mesmo entre crases
    (nomes de skill/command/agent/hook, ids de sistema)."""
    old_with_hyphen = {old for old in renamed if "-" in old}
    findings = []
    for file, text in texts_by_file.items():
        if file in EXCEPTIONS:
            continue
        for number, line in enumerate(text.split("\n"), start=1):
            for token in _citations_of_line(line, old_with_hyphen):
                if token in catalog or token in non_rules:
                    continue
                hint = (
                    f" - was renamed to `{renamed[token]}` (ADR-024)"
                    if token in renamed
                    else ""
                )
                findings.append(
                    f"{file}:{number}: rule id `{token}` does not exist in the gate catalog{hint}"
                )
    return findings


def _read(path: str):
    try:
        with open(path, "r", encoding="utf-8") as file:
            return file.read()
    except (OSError, UnicodeDecodeError):
        return None


def _audited_texts(base_dir: str) -> dict:
    texts = {}
    candidates = [os.path.join(base_dir, name) for name in AUDITED_FILES]
    for directory in AUDITED_DIRS:
        for current, subdirs, files in os.walk(os.path.join(base_dir, directory)):
            subdirs[:] = [p for p in subdirs if p not in IGNORED_DIRS]
            candidates += [
                os.path.join(current, n)
                for n in files
                if os.path.splitext(n)[1] in EXTENSIONS
            ]
    for path in candidates:
        text = _read(path)
        if text is not None:
            texts[os.path.relpath(path, base_dir).replace(os.sep, "/")] = text
    return texts


def _non_rule_names(base_dir: str) -> set:
    """Nome de skill/command/agent/hook e id de sistema: tokens kebab-case que NAO sao id de regra."""
    names = set()
    skills = os.path.join(base_dir, "skills")
    if os.path.isdir(skills):
        names.update(
            n for n in os.listdir(skills) if os.path.isdir(os.path.join(skills, n))
        )
    for directory in ("commands", "agents", "hooks"):
        target = os.path.join(base_dir, directory)
        if os.path.isdir(target):
            names.update(os.path.splitext(n)[0] for n in os.listdir(target))
    map_text = _read(os.path.join(base_dir, "mapa.json"))
    try:
        systems = systems_of(json.loads(map_text or "{}"))
    except ValueError:
        systems = []
    names.update(
        s.get("id")
        for s in systems
        if isinstance(s, dict) and isinstance(s.get("id"), str)
    )
    return names


def audit_cited_ids(base_dir: str) -> list:
    """Casca. Fail-closed: catalogo que nao se consegue ler (ou vazio) e achado — sem ele a checagem
    aprovaria toda citacao por nao ter contra o que comparar."""
    directory = os.path.join(base_dir, *GATE_RULES.split("/"))
    if not os.path.isdir(directory):
        return [
            f"{GATE_RULES}: folder not found - the cited ids were not checked"
        ]
    rule_texts = [
        _read(os.path.join(directory, n)) or ""
        for n in sorted(os.listdir(directory))
        if n.endswith(".mjs")
    ]
    catalog = catalog_ids(
        rule_texts,
        _read(os.path.join(base_dir, *GATE_ENGINE.split("/"))) or "",
    )
    if not catalog:
        return [
            f"{GATE_RULES}: no rule id read - the cited ids were not checked"
        ]
    try:
        renamed = json.loads(
            _read(os.path.join(base_dir, *RENAME_TABLE.split("/"))) or "{}"
        ).get("renamed", {})
    except ValueError:
        renamed = {}
    return invalid_ids(
        _audited_texts(base_dir),
        catalog,
        renamed,
        _non_rule_names(base_dir),
    )
