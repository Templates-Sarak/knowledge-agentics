import os
import re
import json
import subprocess
import argparse
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pointers import path_target, audit_pointers  # noqa: E402
from counts import (  # noqa: E402
    audit_counts,
    counts_of_text,
    divergences as count_divergences,
    wired_hooks,
)
from thresholds import (  # noqa: E402
    audit_thresholds,
    divergences,
    thresholds_of_config_dict,
    thresholds_of_mjs_text,
)
from naming import (  # noqa: E402
    audit_naming,
    outside_vocabulary,
    prefixes_of_text,
    prefix_root,
)
from parity import audit_parity, divergences as parity_divergences  # noqa: E402
from cited_ids import catalog_ids, invalid_ids  # noqa: E402
from cited_ids import audit_cited_ids  # noqa: E402
from systems_in_shipped_files import (  # noqa: E402
    audit_systems_in_shipped_files,
    is_shipped,
    divergences as systems_divergences,
    system_terms,
)
from map_schema import audit_map, divergences as map_divergences
from manifests import (
    SOURCE as MANIFEST_SOURCE,
    audit_manifests,
    divergences as manifest_divergences,
)
from proactivity import (  # noqa: E402
    PROACTIVE,
    audit_proactivity,
    frontmatter_description,
    skills_without_guard,
)
from sections import REQUIRED_SECTIONS, audit_sections, missing_sections  # noqa: E402


def get_args():
    parser = argparse.ArgumentParser(description="Sarak knowledge-agentics base audit")
    parser.add_argument("--root", help="Root path of the knowledge-agentics repository")
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="Runs the internal suite, does not touch disk outside the repo",
    )
    return parser.parse_args()


_CASES = {"ran": 0, "passed": 0}


def _case(failures, ok, message):
    """Registra UM caso do selftest: conta rodado e aprovado; o reprovado entra em `failures`."""
    _CASES["ran"] += 1
    if ok:
        _CASES["passed"] += 1
    else:
        failures.append(message)


def _selftest_manifests():
    """Manifestos do plugin: identidade igual nao acusa; `version` divergente, `description`
    divergente no marketplace e manifesto ausente acusam, nomeando o arquivo; excecao declarada
    isenta o ausente."""
    failures = []
    codex, root, mkt = ".codex-plugin/plugin.json", "plugin.json", ".claude-plugin/marketplace.json"
    source = {"name": "sarak", "version": "1.0.0", "description": "d", "author": {"name": "a"}}
    equal = {
        MANIFEST_SOURCE: source,
        codex: dict(source),
        root: dict(source),
        mkt: {"plugins": [{"name": "sarak", "description": "d"}]},
    }
    cases = [
        ("equal identity does not report", equal, {}, lambda r: r == []),
        ("divergent version reports the mirror", {**equal, codex: {**source, "version": "2.0.0"}}, {},
         lambda r: len(r) == 1 and "version" in r[0] and codex in r[0]),
        ("divergent description in the marketplace reports", {**equal, mkt: {"plugins": [{"name": "sarak", "description": "x"}]}}, {},
         lambda r: len(r) == 1 and "description" in r[0] and mkt in r[0]),
        ("missing manifest reports", {k: v for k, v in equal.items() if k != root}, {},
         lambda r: len(r) == 1 and root in r[0] and "missing" in r[0]),
        ("declared exception exempts the missing one", {k: v for k, v in equal.items() if k != root}, {root: "reason"},
         lambda r: r == []),
    ]
    for name, manifests, exceptions, expected in cases:
        findings = manifest_divergences(manifests, exceptions=exceptions)
        _case(failures, expected(findings),
              f"divergences (manifests): {name} (found {findings!r})")
    return failures


def _selftest_map():
    """Schema do mapa.json: valido nao acusa; id duplicado, tipo invalido e caminho absoluto acusam."""
    system = {
        "id": "earendel-erp", "name": "ERP", "path": "../Earendel/ERP", "repo": None,
        "git_root": "../Earendel/ERP", "kind": "app", "modular": True, "bindings": ["typescript"],
        "lifecycle": "active", "status": "outdated", "status_commit": None,
    }
    other = {**system, "id": "other", "path": "../Other", "bindings": ["typescript", "python"]}
    cases = [
        ("valid map (list with two bindings) does not report", [system, other], lambda r: r == []),
        ("empty bindings list does not report", [{**system, "bindings": []}], lambda r: r == []),
        ("invalid binding in the list reports", [{**system, "bindings": ["go"]}], lambda r: len(r) == 1 and "outside" in r[0]),
        ("duplicate binding reports", [{**system, "bindings": ["python", "python"]}], lambda r: len(r) == 1 and "duplicate" in r[0]),
        ("legacy binding field reports", [{**system, "binding": "typescript"}], lambda r: len(r) == 1 and "legacy field" in r[0]),
        ("duplicate id reports", [system, {**other, "id": "earendel-erp"}], lambda r: len(r) == 1 and "id 'earendel-erp' duplicate" in r[0]),
        ("invalid kind reports", [{**system, "kind": "lib"}], lambda r: len(r) == 1 and "'kind'" in r[0]),
        ("updated status with short commit does not report", [{**system, "status": "updated", "status_commit": "973a0f5"}], lambda r: r == []),
        ("invalid status reports", [{**system, "status": "ok"}], lambda r: len(r) == 1 and "'status'" in r[0]),
        ("status_commit outside commit form reports", [{**system, "status_commit": "yesterday"}], lambda r: len(r) == 1 and "status_commit" in r[0]),
        ("absolute path reports", [{**system, "path": "C:/Code/Earendel/ERP"}], lambda r: len(r) == 1 and "'path'" in r[0]),
    ]
    failures = []
    for name, systems, expected in cases:
        findings = map_divergences({"systems": systems})
        _case(failures, expected(findings),
              f"divergences (map): {name} (found {findings!r})")
    legacy_system = {
        "id": "old-sys", "nome": "Old", "caminho": "../Old", "repo": None, "raiz_git": None,
        "tipo": "app", "modular": False, "bindings": [], "situacao": "ativo",
        "status": "atualizado", "status_base": None,
    }
    legacy = map_divergences({"sistemas": [legacy_system]})
    _case(failures, len(legacy) > 1 and all("legacy" in item for item in legacy)
          and any("'sistemas'" in item for item in legacy),
          f"divergences (map): legacy keys and values report only as legacy (found {legacy!r})")
    return failures


def _selftest_systems_in_shipped_files():
    """Guarda do vazamento de sistema: arquivo que viaja citando o id OU o nome de um sistema do mapa
    acusa (nomeando arquivo e linha); texto limpo passa; palavra que apenas CONTEM o id nao casa; a
    lista de sistemas vem do mapa lido, nao de constante."""
    map_data = {"systems": [
        {"id": "system-alpha", "name": "Alpha — Panel"},
        {"id": "beta-sys", "name": "Other System"},
    ]}
    terms = system_terms(map_data)
    cases = [
        ("clean text does not report", {"a.md": "no system named here\n"}, lambda r: r == []),
        ("cited id reports, with file and line", {"d/adr.md": "x\nsee `system-alpha` there\n"},
         lambda r: len(r) == 1 and "d/adr.md:2" in r[0] and "system-alpha" in r[0]),
        ("cited name reports (different case too)", {"b.md": "the ALPHA — panel decided\n"},
         lambda r: len(r) == 1 and "b.md:1" in r[0]),
        ("id inside another kebab-case id does not match", {"c.md": "system-alpha-new and other-case\n"}, lambda r: r == []),
        ("new map is covered without touching the module", {"e.md": "Other System\n"}, lambda r: len(r) == 1),
    ]
    failures = []
    for name, texts, expected in cases:
        findings = systems_divergences(texts, terms)
        _case(failures, expected(findings),
              f"systems_in_shipped_files: {name} (found {findings!r})")
    _case(failures, not (system_terms({"systems": []}) != []),
          "systems_in_shipped_files: map without systems should give zero terms (the shell fails it)")
    legacy_terms = system_terms({"sistemas": [{"id": "old-sys", "nome": "Old Name"}]})
    _case(failures, legacy_terms == [("old-sys", "old-sys"), ("Old Name", "old-sys")],
          f"systems_in_shipped_files: legacy map keys are read too (found {legacy_terms!r})")
    tests_dir = "specs/_estrutura_modulos/tests"
    covered = [is_shipped(f"{tests_dir}/language-vocabulary.json"), is_shipped(f"{tests_dir}/x/y.json")]
    _case(failures, all(covered) and not is_shipped("skills/x/SKILL.md")
          and not is_shipped(f"{tests_dir}-other/x.json"),
          f"systems_in_shipped_files: tests/** ships and the rest does not (found {covered!r})")
    with tempfile.TemporaryDirectory() as tmp_base:
        os.makedirs(os.path.join(tmp_base, *tests_dir.split("/")))
        os.makedirs(os.path.join(tmp_base, "skills", "x"))
        with open(os.path.join(tmp_base, "mapa.json"), "w", encoding="utf-8") as f:
            json.dump({"systems": [{"id": "system-alpha", "name": "Alpha — Panel"}]}, f)
        with open(os.path.join(tmp_base, *tests_dir.split("/"), "fixture.json"), "w", encoding="utf-8") as f:
            f.write('{"origin": "system-alpha"}\n')
        with open(os.path.join(tmp_base, "skills", "x", "SKILL.md"), "w", encoding="utf-8") as f:
            f.write("system-alpha is cited here and does not ship\n")
        on_disk = audit_systems_in_shipped_files(tmp_base)
    _case(failures, len(on_disk) == 1 and f"{tests_dir}/fixture.json:1" in on_disk[0],
          f"systems_in_shipped_files: a system named in tests/** is reported (found {on_disk!r})")
    return failures


def _selftest_cited_ids():
    """Id de regra citado em documentacao: id valido passa; id antigo acusa com a dica; id que nunca
    existiu depois de 'regra' acusa sem dica; nome de skill entre crases e id de UMA palavra em prosa
    nao sao citacao; o catalogo e lido do texto do gate."""
    catalog = catalog_ids(
        ["export default [\n  {\n    id: 'manifest',\n  },\n  {\n    id: 'strict-structure',\n  },\n]"],
        "const EXTRACTION_ID = 'extraction';",
    )
    renamed = {"estrutura-estrita": "strict-structure", "estrutura": "structure"}
    non_rules = {"example-skill"}

    def check_against(text):
        return invalid_ids({"skills/x/SKILL.md": text}, catalog, renamed, non_rules)

    cases = [
        ("catalog read from the gate text (includes the pseudo-id)", None, lambda _: catalog == {"manifest", "strict-structure", "extraction"}),
        ("valid id after the rule word passes", "a regra `strict-structure` cobre isto", lambda r: r == []),
        ("old hyphenated id reports, with the new id hint", "see `estrutura-estrita` in the law",
         lambda r: len(r) == 1 and "`strict-structure`" in r[0] and "skills/x/SKILL.md:1" in r[0]),
        ("nonexistent id after the rule word reports, without hint", "the rule `row-level-security` is silent",
         lambda r: len(r) == 1 and "row-level-security" in r[0] and "renomeado" not in r[0]),
        ("enumeration: the second id of the list is checked too", "regras `manifest`, `ghost` e `extraction`",
         lambda r: len(r) == 1 and "ghost" in r[0]),
        ("catalog table line is a citation", "| `invented` | erro | description |", lambda r: len(r) == 1),
        ("skill name in backticks is not a rule id", "use `example-skill` for this", lambda r: r == []),
        ("kebab-case outside a rule context is not a citation", "the file `any-config` exists", lambda r: r == []),
        ("old one-word id in prose does not report", "the contract and the structure of the module", lambda r: r == []),
    ]
    failures = []
    for name, text, expected in cases:
        findings = None if text is None else check_against(text)
        _case(failures, expected(findings),
              f"cited_ids: {name} (found {findings!r})")
    return failures


def selftest():
    """Prova que `path_target` trata caminho de PROJETO GERADO (`specs/arquitetura/`,
    `contract/`, `core/`, `modules/`, `api/`, `tools/` — a mesma lista do comentario acima de
    BASE_PREFIXES) como fora de alcance, e caminho da BASE como resolvivel."""
    _CASES["ran"] = _CASES["passed"] = 0
    failures = []
    generated_project_paths = (
        "specs/arquitetura/04-regras.md",
        "contract/openapi.yaml",
        "core/domain/item.ts",
        "modules/catalog/module.json",
        "api/src/index.ts",
        "tools/gate/validate.mjs",
    )
    for token in generated_project_paths:
        target = path_target(token, owner=None)
        _case(failures, not (target is not None),
              f"generated-project path should stay out of reach: {token!r} -> {target!r}")
    base_path = "skills/example-skill/scripts/tool.py"
    _case(failures, not (path_target(base_path, owner=None) != base_path),
          f"base path should resolve identically: {base_path!r}")

    # Tarefa 1: comparador de limiares (thresholds.mjs vs config.json) tem que pegar divergencia
    # E reprovar quando o formato de thresholds.mjs muda de jeito inesperado (fail-closed).
    mjs_ok = "export const THRESHOLDS = {\n  functionLines: 40,\n  nesting: 3,\n  params: 4,\n};\n"
    expected = {"functionLines": 40, "nesting": 3, "params": 4}
    _case(failures, not (thresholds_of_mjs_text(mjs_ok) != expected),
          "thresholds_of_mjs_text should extract the trio from a valid thresholds.mjs")
    _case(failures, not (thresholds_of_mjs_text("export const OUTRACOISA = { x: 1 };") is not None),
          "thresholds_of_mjs_text should fail (None) when THRESHOLDS does not exist")
    _case(failures, not (thresholds_of_mjs_text("export const THRESHOLDS = { functionLines: 40 };")
        is not None),
          "thresholds_of_mjs_text should fail (None) when one of the three keys is missing")
    config_equal = {"maxFunctionLines": 40, "maxNesting": 3, "maxParams": 4}
    _case(failures, not (divergences(expected, thresholds_of_config_dict(config_equal), "fixture") != []),
          "divergences should find nothing when the trios are equal")
    config_different = {"maxFunctionLines": 50, "maxNesting": 3, "maxParams": 4}
    divergent_finding = divergences(
        expected, thresholds_of_config_dict(config_different), "fixture"
    )
    _case(failures, not (len(divergent_finding) != 1 or "functionLines" not in divergent_finding[0]),
          "divergences should find exactly the key that diverges (functionLines)")
    _case(failures, not (len(divergences(expected, None, "fixture")) != 1),
          "divergences should fail when config.json does not resolve")

    # Tarefa 4: vocabulario de prefixos (nomenclatura.md) tem que pegar nome fora do vocabulario
    # E reprovar (fail-closed) quando o parser extrai ZERO prefixos do arquivo.
    table_ok = "# Naming\n\n| Prefix | Area | Examples |\n|---|---|---|\n| `code-` | X | Y |\n| `cyber-` | Z | W |\n"
    prefixes_ok = prefixes_of_text(table_ok)
    _case(failures, not (prefixes_ok != ["code-", "cyber-"]),
          "prefixes_of_text should extract the two prefixes of the valid table")
    _case(failures, not (prefixes_of_text("# Naming\n\nno table here at all\n") != []),
          "prefixes_of_text should return an empty list when there is no table")
    _case(failures, not (prefix_root("code1-audit") != "code"),
          "prefix_root should drop the digit of the numbered flow (code1- -> code)")
    _case(failures, not (prefix_root("cyber-secrets") != "cyber"),
          "prefix_root should extract the root of a simple prefix")
    outside = outside_vocabulary(
        ["code-diagnose", "api-ghost", "code1-audit"], prefixes_ok
    )
    _case(failures, not (outside != ["api-ghost"]),
          "outside_vocabulary should find only the name with a prefix outside the list "
            f"(found {outside!r})")

    # Tarefa 5: toda skill precisa da trava "NAO acione proativamente", exceto a lista fechada
    # PROACTIVE (com justificativa por entrada).
    with_guard = "description: Does X. Use for Y. NÃO acione proativamente."
    _case(failures, not (frontmatter_description(f"---\nname: x\n{with_guard}\n---\n")
        != with_guard[len("description: ") :]),
          "frontmatter_description should extract the whole description line")
    _case(failures, not (frontmatter_description("---\nname: x\n---\n") is not None),
          "frontmatter_description should return None without a description line")
    pairs = [
        ("code-withguard", "Does X. Use for Y. NÃO acione proativamente."),
        ("code-noguard", "Does X. Use for Y."),
        ("padrao-escrita", "Always-referenced norm, no guard by design."),
        ("code-nodescription", None),
    ]
    missing = skills_without_guard(pairs, PROACTIVE)
    _case(failures, not (missing != ["code-noguard", "code-nodescription"]),
          "skills_without_guard should find only who lacks the guard AND is not in PROACTIVE "
            f"(found {missing!r})")
    _case(failures, not ("padrao-escrita" not in PROACTIVE or "code-auditoria-padrao" not in PROACTIVE),
          "PROACTIVE should list the writing norm and the end-of-task gatekeeper with a justification")

    # Tarefa 6: SKILL.md precisa das secoes obrigatorias do molde (nao cobra "## Workflow" —
    # ver a nota de sections.py sobre as 6 skills legitimas sem essa secao).
    complete_skill = (
        '## Quando usar\nx\n## Regras e limites\nx\n## Checklist "pronta"\nx\n'
    )
    _case(failures, not (missing_sections(complete_skill, REQUIRED_SECTIONS) != []),
          "missing_sections should find nothing in a SKILL.md with the three sections")
    # "## Regras de Ouro" (o molde antigo) casa o prefixo "## Regras" de proposito — o defeito
    # real do molde antigo era a falta de "## Quando usar" (tinha "## O Gatilho") e a falta TOTAL
    # de checklist, nao o nome da secao de regras.
    old_skill = "## O Gatilho\nx\n## Workflow\nx\n## Regras de Ouro\nx\n"
    old_missing = missing_sections(old_skill, REQUIRED_SECTIONS)
    _case(failures, not (old_missing != ["## Quando usar", "## Checklist"]),
          "missing_sections should flag the when-to-use and checklist sections in the old template "
            f"(old template with no checklist) — found {old_missing!r}")
    _case(failures, not (missing_sections(complete_skill, ("## Workflow",)) != ["## Workflow"]),
          "missing_sections should find 'Workflow' missing when only it is required")

    # Tarefa 7: contagem do cabecalho do roteador de capacidades (00-knowledge.md) tem que bater
    # com a contagem real de commands/agents/hooks — e "Hooks" conta pelo wireado em hooks.json,
    # nao por arquivo .js solto (a pasta tem _lib.js, que nao e um hook).
    headers_text = (
        "# 5. Commands (13) — disparo manual\n"
        "# 6. Agents (5) — subagentes\n"
        "# 7. Hooks (5) — garantias\n"
    )
    cited = counts_of_text(headers_text)
    _case(failures, not (cited != {"Commands": 13, "Agents": 5, "Hooks": 5}),
          f"counts_of_text should extract the three headers with a number (found {cited!r})")
    _case(failures, not (counts_of_text("# 4. Catalogo de skills\n") != {}),
          "counts_of_text should find nothing in a header without a number in parentheses")
    no_divergence = count_divergences(
        {"Commands": 13}, {"Commands": 13, "Agents": 5}
    )
    _case(failures, not (no_divergence != []),
          "divergences (counts) should find nothing when the cited number matches")
    with_divergence = count_divergences({"Commands": 12}, {"Commands": 13})
    _case(failures, not (len(with_divergence) != 1 or "Commands" not in with_divergence[0]),
          f"divergences (counts) should find the Commands divergence (found {with_divergence!r})")
    hooks_json_fixture = {
        "hooks": {
            "PreToolUse": [
                {"hooks": [{"command": 'node "${X}/hooks/git-guard.js"'}]}
            ],
            "PostToolUse": [
                {"hooks": [{"command": 'node "${X}/hooks/git-guard.js"'}]},
                {"hooks": [{"command": 'node "${X}/hooks/format-check.js"'}]},
            ],
        }
    }
    with tempfile.TemporaryDirectory() as tmp_hooks:
        os.mkdir(os.path.join(tmp_hooks, "hooks"))
        with open(
            os.path.join(tmp_hooks, "hooks", "hooks.json"), "w", encoding="utf-8"
        ) as f:
            json.dump(hooks_json_fixture, f)
        names = wired_hooks(tmp_hooks)
    _case(failures, not (names != {"git-guard", "format-check"}),
          f"wired_hooks should dedupe the hook repeated in two events (found {names!r})")

    # Tarefa 8: parity entre specs/_estrutura_base e specs/_estrutura_base_site — par identico
    # nao acusa, CRLF vs LF do MESMO conteudo nao e divergencia real, arquivo que so existe de um
    # lado nao acusa (e o desenho, nao defeito), excecao declarada nao acusa mesmo divergindo, e
    # par realmente divergente acusa nomeando o arquivo.
    identical_pair = parity_divergences(
        {"x.md": "same\n"}, {"x.md": "same\n"}, exceptions={}
    )
    _case(failures, not (identical_pair != []),
          f"divergences (parity) should not report an identical pair (found {identical_pair!r})")
    only_line_ending = parity_divergences(
        {"x.md": "one\r\ntwo\r\n"}, {"x.md": "one\ntwo\n"}, exceptions={}
    )
    _case(failures, not (only_line_ending != []),
          f"divergences (parity) should not report CRLF vs LF of the same content (found {only_line_ending!r})")
    one_side_only = parity_divergences(
        {"x.md": "a", "only-here.md": "y"}, {"x.md": "a"}, exceptions={}
    )
    _case(failures, not (one_side_only != []),
          f"divergences (parity) should not report a file that exists on one side only (found {one_side_only!r})")
    exempt = parity_divergences(
        {"README.md": "a"}, {"README.md": "b"}, exceptions={"README.md": "reason"}
    )
    _case(failures, not (exempt != []),
          f"divergences (parity) should not report a file exempt by exception (found {exempt!r})")
    divergent_pair = parity_divergences({"x.md": "a"}, {"x.md": "b"}, exceptions={})
    _case(failures, not (len(divergent_pair) != 1 or "x.md" not in divergent_pair[0]),
          f"divergences (parity) should report a divergent pair, naming the file (found {divergent_pair!r})")
    # Achado da rodada de correção: filtro por extensão ".md" contradizia a docstring ("arquivo
    # compartilhado NOVO nasce COBRADO por default"). Agora o recorte é por PASTA, nunca por
    # extensão — par não-`.md` divergente tem de acusar, texto ou binário (bytes).
    non_md_divergent_pair = parity_divergences(
        {"config.json": '{"a": 1}'}, {"config.json": '{"a": 2}'}, exceptions={}
    )
    _case(failures, not (len(non_md_divergent_pair) != 1 or "config.json" not in non_md_divergent_pair[0]),
          f"divergences (parity) should report a divergent non-.md pair (found {non_md_divergent_pair!r})")

    failures += _selftest_manifests()
    failures += _selftest_map()
    failures += _selftest_systems_in_shipped_files()
    failures += _selftest_cited_ids()

    for failure in failures:
        print(f"  fail  {failure}")
    ran, passed = _CASES["ran"], _CASES["passed"]
    if failures or ran == 0:
        print(f"selftest (audit_base): {passed}/{ran} ok, {len(failures)} failure(s)")
        return 1
    print(f"selftest (audit_base): {passed}/{ran} ok")
    return 0


def audit_base(base_dir):
    report = {
        "agents": [],
        "commands": [],
        "hooks": [],
        "skills": [],
        "pointers": [],
        "counts": [],
        "leaks": [],
        "thresholds": [],
        "naming": [],
        "proactivity": [],
        "sections": [],
        "parity": [],
        "manifests": [],
        "map": [],
        "systems_in_shipped_files": [],
        "cited_ids": [],
    }

    # 1. Agents
    agents_dir = os.path.join(base_dir, "agents")
    if os.path.exists(agents_dir):
        for file in os.listdir(agents_dir):
            if not file.endswith(".md"):
                continue
            path = os.path.join(agents_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            if "EXCLUSIVAMENTE" not in content and "JSON" not in content:
                report["agents"].append(
                    f"[{file}] Missing strict JSON output contract."
                )
            if "name:" not in content or "description:" not in content:
                report["agents"].append(
                    f"[{file}] Incomplete frontmatter (name/description)."
                )

    # 2. Commands
    commands_dir = os.path.join(base_dir, "commands")
    if os.path.exists(commands_dir):
        for file in os.listdir(commands_dir):
            if not file.endswith(".md"):
                continue
            path = os.path.join(commands_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            for line in content.split("\n"):
                if line.startswith("description:"):
                    if ": " in line[12:].strip():
                        report["commands"].append(
                            f"[{file}] YAML trap in description (colon followed by space)."
                        )

    # 3. Hooks
    hooks_dir = os.path.join(base_dir, "hooks")
    if os.path.exists(hooks_dir):
        for file in os.listdir(hooks_dir):
            path = os.path.join(hooks_dir, file)
            if file.endswith(".json"):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        json.load(f)
                except Exception as e:
                    report["hooks"].append(f"[{file}] Invalid JSON: {str(e)}")
            elif file.endswith(".js"):
                try:
                    subprocess.run(
                        ["node", "-c", path], check=True, capture_output=True, text=True
                    )
                except subprocess.CalledProcessError as e:
                    report["hooks"].append(
                        f"[{file}] JS syntax error: {e.stderr.strip()}"
                    )

    # 4. Skills
    skills_dir = os.path.join(base_dir, "skills")
    if os.path.exists(skills_dir):
        for skill_folder in os.listdir(skills_dir):
            skill_path = os.path.join(skills_dir, skill_folder, "SKILL.md")
            if os.path.exists(skill_path):
                with open(skill_path, "r", encoding="utf-8") as f:
                    content = f.read()
                for line in content.split("\n"):
                    if line.startswith("description:"):
                        if ": " in line[12:].strip():
                            report["skills"].append(
                                f"[{skill_folder}] YAML trap in description."
                            )

    # 5. Ponteiros orfaos (caminho citado e nome de artefato citado) — ver pointers.py
    report["pointers"] = audit_pointers(base_dir)

    # 5a. Contagem defasada nos cabecalhos do roteador de capacidades (00-knowledge.md) — ver
    # counts.py. Complementa o pointers.py: aquele cobra NOME citado, este cobra o NUMERO.
    report["counts"] = audit_counts(base_dir)

    # 5b. Limiares 40/3/4: thresholds.mjs (fonte unica) vs config.json de cada padrao-<linguagem>
    report["thresholds"] = audit_thresholds(base_dir)

    # 5c. Nomenclatura: todo skills/*, commands/*, agents/* comeca por um prefixo do vocabulario
    # declarado em skills/meta-create-skill/references/nomenclatura.md (fonte unica)
    report["naming"] = audit_naming(base_dir)

    # 5d. Proatividade: toda skill tem a trava "NAO acione proativamente", exceto a lista fechada
    # e justificada de excecoes (PROACTIVE) em proactivity.py
    report["proactivity"] = audit_proactivity(base_dir)

    # 5e. Secoes obrigatorias do molde: "## Quando usar", "## Regras...", "## Checklist..."
    report["sections"] = audit_sections(base_dir)

    # 5f. Paridade: specs/_estrutura_base/ e specs/_estrutura_base_site/ ensinam o MESMO fluxo
    # SDD — todo .md presente nas duas arvores tem de ser identico, exceto a divergencia
    # declarada em parity.EXCEPTIONS (ver parity.py)
    report["parity"] = audit_parity(base_dir)

    # 5g. Manifestos: a identidade do plugin (name/version/description/author) vive em
    # .claude-plugin/plugin.json; os outros manifestos a repetem (ver manifests.py)
    report["manifests"] = audit_manifests(base_dir)

    # 5h. Mapa de sistemas: schema do mapa.json da raiz (campos, tipos, id/caminho unicos, valores
    # aceitos, caminho relativo com /). Nao cobra que o caminho exista — ver map_schema.py
    report["map"] = audit_map(base_dir)

    # 5i. Sistemas do mapa.json nomeados em arquivo que VIAJA para o projeto gerado (doutrina,
    # bindings, tools, moldes do fluxo SDD) — a lista vem do mapa lido em runtime. Ver
    # systems_in_shipped_files.py
    report["systems_in_shipped_files"] = audit_systems_in_shipped_files(base_dir)

    # 5j. Id de regra citado em skill/command/agent/hook/README que o catalogo do gate nao tem. O
    # catalogo e lido do codigo do gate. Ver cited_ids.py
    report["cited_ids"] = audit_cited_ids(base_dir)

    # 6. Vazamentos
    patterns = {
        "AWS_AKIA": r"AKIA[0-9A-Z]{16}",
        "PrivateKey": r"-----BEGIN .* PRIVATE KEY-----",
        "GenericSecret": r"(?i)(api_key|secret|password|token)[\"']?\s*[:=]\s*[\"'][a-zA-Z0-9\-_]{16,}[\"']",
    }

    # Este arquivo DEFINE os padroes acima — varre-lo faz cada padrao casar consigo mesmo e
    # reportar um vazamento que nao existe. Auto-deteccao e falso positivo, nao achado.
    this_file = os.path.abspath(__file__)

    for root, _, files in os.walk(base_dir):
        if (
            ".git" in root
            or "node_modules" in root
            or ".venv" in root
            or "mcp-servers" in root
        ):
            continue
        for file in files:
            if not file.endswith((".md", ".js", ".json", ".py")):
                continue
            path = os.path.join(root, file)
            if os.path.abspath(path) == this_file:
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    for name, pat in patterns.items():
                        if re.search(pat, content):
                            report["leaks"].append(
                                f"{name} found in {os.path.relpath(path, base_dir)}"
                            )
            except:
                pass

    print(json.dumps(report, indent=2, ensure_ascii=False))
    total = sum(len(findings) for findings in report.values())
    if total > 0:
        print(f"audit_base: {total} finding(s) (exit 1)", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    args = get_args()
    if args.selftest:
        exit(selftest())
    if not args.root or not os.path.exists(args.root):
        print(json.dumps({"error": "Root path not found"}))
        exit(1)
    exit(audit_base(args.root))
