"""diagnose_terrain.py — diagnostico mecanico do terreno antes da campanha de adequacao modular.

    python diagnose_terrain.py --root <target> [--modules <pasta> ...] [--json]
        (sem `--modules`, os candidatos sao DESCOBERTOS varrendo a raiz de modulos)
    python diagnose_terrain.py --selftest

Responde, sem julgamento nenhum, as perguntas que "meta-adequacao-modular" precisa antes de abrir a boca:
em que FASE a campanha esta (A planejar / B conferir / IN_PROGRESS), qual dos dois CAMINHOS de entrada
(com ou sem specs SDD), se o APARATO DO TEMPLATE ja esta instalado ali (nada / parcial / completo — e
quais pecas faltam, no caso parcial), se o repositorio colide com o que o scaffold do template escreveria
(SO quando o aparato ainda nao existe — ver abaixo), se ele carrega marcas de uma GERACAO ANTIGA do
proprio template (nao e legado puro — e outro problema), se ja tem workspaces/hooks proprios que vao
precisar de composicao manual, e — para cada pasta candidata a modulo que o chamador ja apontou — se o
nome bate `^[a-z][a-z0-9-]*$` e qual seria o kebab-case sugerido.

**Por que `template_installed` existe.** Sem ele, um projeto 100% conforme (gerado pelo proprio
`create-project.mjs`/`create-module.mjs`) era diagnosticado como legado: `root_collision` acusava
`package.json`/`.gitignore` — que sao o PROPRIO scaffold do template, copiados por
`bindings/<binding>/root/` — e `legacy_workspaces` acusava `["modules/[a-z]*", "packages/*",
"adapters/*"]`, que e exatamente o `workspaces` que o template escreve. Os dois apontavam o usuario para
o portao de HITL mais caro (`--force`) sobre um repositorio que nao precisava de nada. Medido, nao
suposto: rodar este script contra a saida de `create-project.mjs --binding typescript` +
`create-module.mjs catalogo --role domain` reproduzia os dois falsos positivos byte a byte.

**Por que a descoberta de candidatos existe.** `module_candidates` avaliava SO o que viesse em
`--modules`, enquanto o `SKILL.md` documentava a invocacao sem a flag e prometia que "o script sugere" o
nome. Quem seguia a skill ao pe da letra recebia `[]` e ficava sem insumo no portao de HITL CENTRAL (a
lista de modulos e o nome de cada um). Medido num legado real (ERP): quatro modulos em `modulos/`,
`module_candidates: []`. Agora, sem a flag, a casca varre a raiz de modulos — `modules/` e os nomes de
GERACAO ANTIGA que apontam para ela (`modulos/`), vocabulario que este mesmo arquivo ja fecha em
OLD_GENERATION_MARKERS. `--modules` continua vencendo, como override explicito, e `modules_origin` diz
qual dos dois produziu a lista: `[]` com origem `varredura` significa "nao ha candidato", `[]` com origem
`flag` significa "ninguem apontou" — dois fatos diferentes que antes eram indistinguiveis.

**Por que `branch` existe.** "NUNCA trabalhe em `main`" e regra da skill desde sempre, e nada a verificava
— o proprio legado que motivou esta versao estava com a campanha inteira em `main`, com delecoes ja
staged. Pela lei do ecossistema, regra sem verificador nao e regra. `branch.atual` vazio significa
**nao foi possivel determinar** (nao e repo git), e `"(destacado)"` significa HEAD destacado: nos dois
casos pergunte, nunca presuma que esta seguro. `dirty_tree` e tri-estado de proposito — `null` e
"nao consegui rodar `git status`", NUNCA "esta limpa" (fail-open e o defeito que se evita aqui).

NAO decide topologia (isso e code-diagnostico/code1-auditar): a descoberta olha UMA raiz conhecida de
modulos, nunca infere fronteira de modulo em monolito, por-camadas ou `apps/`. Para esses, aponte as
pastas com `--modules`.

**Por que `suspected_equivalents` existe.** `template_installed` classifica por PRESENCA DE CAMINHO
canonico — e um legado localizado tem o aparato sob outro nome. Medido: um alvo com
`<alvo>/scripts/validar-modulos.mjs`, `packages/portas/` e `adapters/memoria/` saia com `faltando:
["memory_adapters","gate","root_manifest","ports"]`, acusando como ausente o que ja existia sob nome
traduzido. `generate_equivalent_candidates` gera, por vocabulario fechado, os nomes alternativos possiveis
de cada marcador; `read_suspected_equivalents` testa em disco so os marcadores que estao em `faltando`. O
campo e insumo de HITL — nunca afirma equivalencia, e nunca muda `template_installed`: as pastas em ingles
continuam normativas, e classificar pelo nome traduzido faria a campanha nunca renomear.

**Por que `path` virou tri-estado, com `sdd_signals`.** `detect_path` exigia indice E pasta de
plans, caindo em "no-specs" caso contrario — e um alvo com specs SDD completas, cujo mapa de leitura se
chamava `specs/INDEX.md` em vez de `specs/00-indice.md`, era classificado "no-specs" como se a campanha
ainda nao tivesse specs, quando na verdade tinha estrutura SDD divergente da canonica. `sdd_signals` (via
`read_sdd_signals`) diz especificamente quais nomes de sinal foram achados sob `specs/`, para o revisor
conferir o que e de fato antes de instalar specs por cima de specs.

Nucleo puro (nunca toca disco): `detect_phase`, `detect_path`, `evaluate_template_installed`,
`kebabize`, `evaluate_module_id`, `detect_old_generation`, `detect_root_collision`,
`detect_legacy_workspaces`, `detect_legacy_hooks`, `module_roots`, `evaluate_branch`,
`generate_equivalent_candidates` — e o que o `--selftest` prova com fixtures em memoria. A CASCA
(`read_template_markers`, `read_xx_plans_status`, `read_root_entries`, `read_package_json`,
`read_module_dirs`, `read_current_branch`, `read_dirty_tree`, `read_sdd_signals`,
`read_suspected_equivalents`, `main`) e a unica parte que le disco — ou, nas duas de branch/arvore, que
chama `git`.
"""

import argparse
import itertools
import json
import re
import subprocess
import sys
from pathlib import Path

OLD_GENERATION_MARKERS = {
    "ferramentas": "tools",
    "modulos": "modules",
    "projeto.json": "project.json",
}

COLLISION_ENTRIES = ("package.json", "pyproject.toml", ".gitignore")

# Vocabulario FECHADO de branch padrao. Deliberadamente curto: nao existe forma barata e confiavel de
# descobrir a branch padrao de um repositorio sem falar com o remoto (`origin/HEAD` pode nem estar
# resolvido no clone). Consequencia assumida, e declarada: um repositorio cuja branch principal se chame
# outra coisa (`trunk`, `develop`) NAO e acusado — falso negativo. A direcao do erro e a segura: acusar
# `develop` como "padrao" pararia uma campanha legitima.
DEFAULT_BRANCHES = ("main", "master")

# As oito pecas do aparato do template (SKILL.md, Passo 3.2) — caminho relativo a raiz do projeto.
# Deliberadamente SEM "package.json"/"pyproject.toml"/".gitignore": esses tres sao os mesmos nomes que
# COLLISION_ENTRIES verifica, e um marcador nao pode ser o proprio arquivo que ele explica (senao
# "esta presente" vira circular).
#
# "scaffolder" (tools/create-module.mjs) e "module_template" (modules/_template) substituem o antigo
# "modules_root" (a pasta `modules/` sozinha, que existiu ate esta versao). Nao e enxugamento: e a
# correcao de uma fraqueza medida. `modules/` sozinho era o marcador MENOS especifico dos sete que
# existiam — qualquer projeto JS generico pode ter uma pasta de topo com esse nome por motivo proprio, e
# so por acaso disso `evaluate_template_installed` saia de "not-installed", o que ja bastava para
# `detect_root_collision` parar de acusar `package.json`/`.gitignore` mesmo que nada mais do template
# estivesse ali. `module_template` responde a mesma pergunta com marcador FORTE: todo projeto nascido do
# template ganha `modules/_template` copiado do binding (`specs/_estrutura_modulos/tools/
# create-project.mjs`, funcao `copyTemplate`) — presenca que um legado nao replica por acidente.
# "scaffolder" fecha a lacuna irma: o script conferia que o gate existia mas nunca que
# `create-module.mjs` existia — e um legado real terminou uma campanha com `pnpm criar-modulo <id>`
# produzindo modulo que nao compila, sem nada acusar.
TEMPLATE_MARKERS = {
    "gate": "tools/gate/validate.mjs",
    "scaffolder": "tools/create-module.mjs",
    "root_manifest": "project.json",
    "ports": "packages/ports",
    "memory_adapters": "adapters/memory",
    "root_config": "config",
    "githooks": ".githooks",
    "module_template": "modules/_template",
}

# Vocabulario FECHADO de segmento canonico -> nomes alternativos em legado localizado. "" como
# alternativa significa "o legado nao tem essa camada de pasta" e some do caminho gerado — e o que
# produz `<alvo>/scripts/validar-modulos.mjs` a partir de `tools/gate/validate.mjs` (duas substituicoes
# e uma supressao ao mesmo tempo). Prefere falso negativo a falso positivo: um segmento fora deste mapa
# so produz ele mesmo, nunca e "adivinhado".
#
# `.githooks` -> `.husky` aqui SOBREPOE o que `detect_legacy_hooks` ja acusa. E proposital, nao
# deduplique: sao duas perguntas diferentes — "ha gerenciador de hook legado a compor?" (legacy_hooks)
# e "algo ja faz o papel de `.githooks`?" (suspected_equivalents).
EQUIVALENT_SEGMENTS = {
    "tools": ("scripts", "ferramentas"),
    "modules": ("modulos",),
    "packages": ("pacotes",),
    "adapters": ("adaptadores",),
    "ports": ("portas",),
    "memory": ("memoria",),
    "config": ("configuracao", "conf"),
    "gate": ("", "validacao"),
    "validate.mjs": ("validar.mjs", "validar-modulos.mjs", "validate.js"),
    "create-module.mjs": ("criar-modulo.mjs", "create-module.js"),
    "project.json": ("projeto.json",),
    "_template": ("_modelo", "_molde"),
    ".githooks": ("githooks", ".husky"),
}

# Sinais de estrutura SDD (`specs/_estrutura_base/`) que, se achados sob `specs/` do alvo SEM o par
# indice+plan/ completo, classificam o caminho como "divergent-specs" em vez de "no-specs" — ver
# `detect_path`. "INDEX.md" (mapa de leitura) e "00-indice.md" (fila de execucao) NAO sao
# sinonimos: os dois existem em `specs/_estrutura_base/` e fazem coisas diferentes.
SDD_SIGNALS = (
    "INDEX.md",
    "00-contexto.md",
    "00-knowledge.md",
    "00-indice.md",
    "00-prompt-revisor.md",
    "00-prompt-executor.md",
    "adr",
    "arquitetura",
    "plan",
    "specs",
    "_templates",
)

COMPLIANT_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")

# `workspaces` que o proprio create-project.mjs escreve no package.json gerado (medido nos tres
# bindings) — uma entrada que bate aqui NAO e workspace legado, e um monorepo legado real jamais
# produz este trio exato por acidente (o segmento "[a-z]*" e sintaxe de glob do proprio template).
TEMPLATE_CANONICAL_WORKSPACES = frozenset(
    {"modules/[a-z]*", "packages/*", "adapters/*"}
)

CLOSED_STATUSES = {"🟢 Aprovada", "⚪ Sintetizada", "🟢", "⚪"}


def detect_phase(xx_plans: list) -> str:
    """`xx_plans` e uma lista de status (string) das plans cujo nome comeca com "xx-". Vazia -> Fase A
    (campanha nao comecou). Todas encerradas (aprovada/sintetizada) -> Fase B (pronta para conferir).
    Qualquer uma ainda ativa -> IN_PROGRESS (nem planejar de novo, nem conferir ainda)."""
    if not xx_plans:
        return "A"
    if all(status in CLOSED_STATUSES for status in xx_plans):
        return "B"
    return "IN_PROGRESS"


def detect_path(has_index: bool, has_plan_dir: bool, sdd_signals=()) -> str:
    """Tri-estado. "with-specs" continua exigindo as DUAS coisas — indice e pasta de plans. Sem os
    dois, mas com algum nome de `SDD_SIGNALS` achado sob `specs/` (`sdd_signals` nao vazio) -> o alvo TEM
    estrutura SDD, so nao a canonica: "divergent-specs", nunca "no-specs" (que instalaria specs por
    cima de specs). Nenhum dos dois -> "no-specs" de verdade."""
    if has_index and has_plan_dir:
        return "with-specs"
    if sdd_signals:
        return "divergent-specs"
    return "no-specs"


def kebabize(name: str) -> str:
    """PascalCase/camelCase/snake_case/espacos -> kebab-case minusculo. Pura fronteira de palavra:
    letra minuscula seguida de maiuscula, ou minuscula/numero seguido de maiuscula em sequencia,
    ganham hifen; '_'/'.'/espaco viram hifen; hifens repetidos colapsam; bordas sao aparadas."""
    with_boundaries = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", name)
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", with_boundaries).lower()
    collapsed = re.sub(r"-+", "-", normalized)
    return collapsed.strip("-")


def evaluate_module_id(dir_name: str) -> dict:
    """Um candidato a modulo: o id atual (nome da pasta), se ja conforme, e o sugerido."""
    compliant = bool(COMPLIANT_ID_PATTERN.fullmatch(dir_name))
    return {
        "dir": dir_name,
        "current_id": dir_name,
        "compliant": compliant,
        "suggested_id": dir_name if compliant else kebabize(dir_name),
    }


def detect_old_generation(root_entries: set) -> list:
    """Marcadores de DUAS renomeacoes atras do proprio template — nao e legado puro, e migracao de
    versao. Vocabulario fechado (OLD_GENERATION_MARKERS); ordem estavel para saida determinística."""
    findings = []
    for old, current in OLD_GENERATION_MARKERS.items():
        if old in root_entries:
            findings.append({"found": old, "current": current})
    return findings


def evaluate_template_installed(present_markers: set) -> dict:
    """`present_markers` e o subconjunto das CHAVES de TEMPLATE_MARKERS que a casca ja
    resolveu em disco (uma por caminho relativo checado). Classifica os tres estados que importam
    para a skill: nenhum marcador -> "not-installed" (legado puro, o fluxo de hoje esta certo);
    todos -> "completo" (nada a instalar); uns sim outros nao -> "parcial", com `faltando` listando
    exatamente as pecas que sobram — o estado que mais engana se tratado como "nada instalado"."""
    all_keys = set(TEMPLATE_MARKERS)
    present = sorted(present_markers & all_keys)
    missing = sorted(all_keys - present_markers)
    if not present:
        state = "not-installed"
    elif not missing:
        state = "complete"
    else:
        state = "partial"
    return {"state": state, "present": present, "missing": missing}


def generate_equivalent_candidates(marker: str) -> list:
    """Quebra o caminho canonico de `marcador` (em TEMPLATE_MARKERS) em segmentos por "/" e devolve
    o produto cartesiano das opcoes de cada segmento — cada segmento oferece ele mesmo mais as
    alternativas de EQUIVALENT_SEGMENTS (segmento fora do vocabulario so produz ele mesmo) — MENOS o
    proprio caminho canonico. Uma alternativa "" suprime aquele segmento do caminho gerado (junta os
    demais pulando o vazio). Ordenado e deterministico. Custo por marcador: produto do tamanho das
    opcoes de cada segmento (o pior caso hoje, "gate" com tres segmentos 3x3x4, fica bem abaixo de 40)."""
    canonical = TEMPLATE_MARKERS[marker]
    options_per_segment = [
        (segment,) + EQUIVALENT_SEGMENTS.get(segment, ())
        for segment in canonical.split("/")
    ]
    candidates = set()
    for combination in itertools.product(*options_per_segment):
        path = "/".join(part for part in combination if part)
        if path and path != canonical:
            candidates.add(path)
    return sorted(candidates)


def detect_root_collision(root_entries: set, template_state: str) -> list:
    """Manifestos que o create-project/create-module abortariam ao encontrar sem `--force` — SO
    quando o aparato do template ainda nao existe ali (`template_state == "not-installed"`). Uma vez
    que qualquer peca do template ja esta presente (parcial ou completo), `package.json`/`.gitignore`/
    `pyproject.toml` sao o PROPRIO scaffold do template (copiados por `bindings/<binding>/root/`), nao
    legado colidindo — sinalizar colisao ali aponta o usuario para o `--force` sobre nada."""
    if template_state != "not-installed":
        return []
    return sorted(root_entries & set(COLLISION_ENTRIES))


def detect_legacy_workspaces(package_json: dict) -> list:
    """`workspaces` ja declarado, MENOS as entradas que sao o proprio padrao canonico do template
    (TEMPLATE_CANONICAL_WORKSPACES) — essas nunca precisam de merge humano, sao o que o template
    escreveria de qualquer jeito. O que sobra e legado de verdade precisando de decisao."""
    workspaces = package_json.get("workspaces", [])
    if isinstance(workspaces, dict):
        workspaces = workspaces.get("packages", [])
    if not isinstance(workspaces, list):
        return []
    return [w for w in workspaces if w not in TEMPLATE_CANONICAL_WORKSPACES]


def detect_legacy_hooks(root_entries: set, package_json: dict) -> bool:
    """Husky/lint-staged proprios — o terceiro caso de composicao de pre-commit que `compor_pre_commit`
    ainda nao cobre (ele resolve so gate-de-segredos + verify-commit.mjs, um-com-um)."""
    if ".husky" in root_entries:
        return True
    deps = {
        **package_json.get("dependencies", {}),
        **package_json.get("devDependencies", {}),
    }
    return "husky" in deps or "lint-staged" in deps


def module_roots(root_entries: set) -> list:
    """Nomes de pasta, na raiz, que valem como RAIZ DE MODULOS para a descoberta de candidatos: a
    canonica `modules/` mais os nomes de geracao antiga que apontam para ela (`modulos/`) — o mesmo
    vocabulario fechado de OLD_GENERATION_MARKERS, nunca uma segunda lista a manter em sincronia.
    Ordem estavel para saida deterministica."""
    names = {"modules"} | {
        old
        for old, current in OLD_GENERATION_MARKERS.items()
        if current == "modules"
    }
    return sorted(name for name in names if name in root_entries)


def evaluate_branch(current_branch: str, dirty_tree) -> dict:
    """Classifica o estado de branch para o portao de HITL da skill. `current_branch` vazio = nao foi
    possivel determinar (nao e repo git); `"(destacado)"` = HEAD destacado. Nos dois casos `is_default`
    sai False, e o `SKILL.md` manda PERGUNTAR em vez de presumir — o valor nunca afirma "seguro", so
    diz o que se sabe. `dirty_tree` e repassado como veio (True/False/None): `None` e "nao consegui
    verificar", jamais "limpa"."""
    return {
        "current": current_branch,
        "is_default": current_branch in DEFAULT_BRANCHES,
        "dirty_tree": dirty_tree,
    }


def diagnose(
    root_entries: set,
    package_json: dict,
    xx_plans: list,
    has_index: bool,
    has_plan_dir: bool,
    candidate_dirs: list,
    template_markers: set,
    current_branch: str = "",
    dirty_tree=None,
    modules_origin: str = "flag",
    sdd_signals=(),
    suspected_equivalents: dict = None,
) -> dict:
    """Une os doze diagnosticos num relatorio so. Pura: nao le nada, so combina o que ja foi lido.
    `template_installed` e calculado ANTES de `root_collision` porque esta depende daquele — a colisao
    so faz sentido contra o que e legado, nunca contra o proprio scaffold do template. Os cinco
    ultimos parametros tem default para que um chamador antigo (fixture, script de terceiro) continue
    valendo — o relatorio, esse, sempre traz as doze chaves. `suspected_equivalents` chega ja
    resolvido pela casca (`read_suspected_equivalents`) porque depende de disco; aqui so e repassado."""
    template_installed = evaluate_template_installed(template_markers)
    return {
        "phase": detect_phase(xx_plans),
        "path": detect_path(has_index, has_plan_dir, sdd_signals),
        "sdd_signals": sorted(sdd_signals),
        "branch": evaluate_branch(current_branch, dirty_tree),
        "template_installed": template_installed,
        "root_collision": detect_root_collision(
            root_entries, template_installed["state"]
        ),
        "old_generation": detect_old_generation(root_entries),
        "legacy_workspaces": detect_legacy_workspaces(package_json),
        "legacy_hooks": detect_legacy_hooks(root_entries, package_json),
        "module_candidates": [evaluate_module_id(p) for p in candidate_dirs],
        "modules_origin": modules_origin,
        "suspected_equivalents": suspected_equivalents or {},
    }


# ================================================================================================
# CASCA — unica parte que toca disco.
# ================================================================================================


def read_root_entries(root: Path) -> set:
    if not root.is_dir():
        return set()
    return {p.name for p in root.iterdir()}


def read_package_json(root: Path) -> dict:
    path = root / "package.json"
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def read_xx_plans_status(root: Path) -> list:
    """Status (frontmatter `status:`) de toda plan cujo NOME comeca com "xx-" em specs/plan/."""
    plan_dir = root / "specs" / "plan"
    if not plan_dir.is_dir():
        return []
    found_statuses = []
    for file in sorted(plan_dir.glob("xx-*.md")):
        text = file.read_text(encoding="utf-8", errors="replace")
        found_match = re.search(r'^status:\s*"?([^"\n]+)"?', text, re.MULTILINE)
        found_statuses.append(found_match.group(1).strip() if found_match else "")
    return found_statuses


def read_sdd_signals(root: Path) -> list:
    """Quais nomes de SDD_SIGNALS existem como entrada direta de `root/specs/` — alimenta o tri-estado
    de `detect_path` quando indice+plan/ nao estao os dois presentes."""
    specs_dir = root / "specs"
    if not specs_dir.is_dir():
        return []
    entries = {p.name for p in specs_dir.iterdir()}
    return sorted(entries & set(SDD_SIGNALS))


def read_template_markers(root: Path) -> set:
    """Quais chaves de TEMPLATE_MARKERS existem de fato sob `root` — a UNICA funcao que resolve
    esse sinal em disco; `evaluate_template_installed` (nucleo) so classifica o conjunto ja lido."""
    return {
        key
        for key, relative in TEMPLATE_MARKERS.items()
        if (root / relative).exists()
    }


def read_suspected_equivalents(root: Path, missing: list) -> dict:
    """Para cada marcador em `faltando`, testa em disco os candidatos que `generate_equivalent_candidates`
    gera e devolve so os que existem de fato — chaves e valores ordenados, marcador sem acerto nenhum
    fica de fora (nao aparece com lista vazia). Nunca altera `template_installed`: e insumo de HITL,
    "va olhar aqui", nunca afirma equivalencia."""
    findings = {}
    for marker in sorted(missing):
        seen = [
            candidate
            for candidate in generate_equivalent_candidates(marker)
            if (root / candidate).exists()
        ]
        if seen:
            findings[marker] = seen
    return findings


def read_module_dirs(root: Path, root_names: list) -> list:
    """Subpastas de cada raiz de modulos — os candidatos que o chamador nao precisou apontar. Ignora
    entrada oculta e `_template`/`_adapter` (moldes do proprio template, nunca modulo). Devolve nome
    de pasta, nao caminho: e o mesmo contrato que `--modules` ja tinha, e `evaluate_module_id` julga o
    NOME. Sem deduplicar entre raizes: se `modules/` e `modulos/` coexistem, ver o nome duas vezes e
    o achado, nao ruido."""
    findings = []
    for root_name in root_names:
        dir_path = root / root_name
        if not dir_path.is_dir():
            continue
        for entry in sorted(dir_path.iterdir()):
            if entry.is_dir() and not entry.name.startswith((".", "_")):
                findings.append(entry.name)
    return findings


def read_current_branch(root: Path) -> str:
    """Branch por LEITURA de `.git/HEAD` — nao chama `git`, e por isso funciona com git ausente do
    PATH. Vazio = nao e repo git (ou HEAD ilegivel); `"(destacado)"` = HEAD aponta para um commit, nao
    para um ref. Nao resolve worktree/submodulo (`.git` como ARQUIVO): tambem devolve vazio, e o
    `SKILL.md` manda perguntar — limite declarado, nao silencio."""
    head = root / ".git" / "HEAD"
    if not head.is_file():
        return ""
    try:
        content = head.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return ""
    if content.startswith("ref: refs/heads/"):
        return content[len("ref: refs/heads/") :].strip()
    return "(detached)" if content else ""


def read_dirty_tree(root: Path):
    """True/False pelo `git status --porcelain`; **None quando nao deu para saber** (git ausente,
    diretorio nao versionado, chamada falhou). None NUNCA vira False: "nao verifiquei" e "esta limpa"
    sao fatos diferentes, e confundi-los e exatamente o fail-open que esta skill cobra dos outros."""
    if not (root / ".git").exists():
        return None
    try:
        proc = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=30,
            check=False,  # o returncode e tratado abaixo: != 0 vira None ("nao sei"), nunca False
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    return bool(proc.stdout.strip())


def get_args():
    parser = argparse.ArgumentParser(
        description="Mechanical diagnosis of the modular-adequacy terrain."
    )
    parser.add_argument("--root", default=".", help="Root of the target repository")
    parser.add_argument(
        "--modules", nargs="*", default=(), help="Candidate module folders (names)"
    )
    parser.add_argument(
        "--json", action="store_true", help="JSON output (default: readable)"
    )
    parser.add_argument("--selftest", action="store_true")
    return parser.parse_args()


def _selftest_cases() -> list:
    return [
        {
            "name": "detect_phase: no xx- plans -> A",
            "fn": lambda: detect_phase([]) == "A",
        },
        {
            "name": "detect_phase: all closed -> B",
            "fn": lambda: detect_phase(["🟢 Aprovada", "⚪ Sintetizada"]) == "B",
        },
        {
            "name": "detect_phase: one active -> IN_PROGRESS",
            "fn": lambda: (
                detect_phase(["🟢 Aprovada", "🟡 Em execução"]) == "IN_PROGRESS"
            ),
        },
        {
            "name": "detect_path: index and plan/ -> with-specs",
            "fn": lambda: detect_path(True, True) == "with-specs",
        },
        {
            "name": "detect_path: index only, with SDD signal -> divergent-specs (was no-specs)",
            "fn": lambda: (
                detect_path(True, False, ("00-indice.md",)) == "divergent-specs"
            ),
        },
        {
            "name": "detect_path: isolated SDD signal (INDEX.md) -> divergent-specs",
            "fn": lambda: (
                detect_path(False, False, ("INDEX.md",)) == "divergent-specs"
            ),
        },
        {
            "name": "detect_path: no hint -> no-specs",
            "fn": lambda: detect_path(False, False) == "no-specs",
        },
        {
            "name": "kebabize: PascalCase",
            "fn": lambda: kebabize("Proposals") == "proposals",
        },
        {
            "name": "kebabize: compound",
            "fn": lambda: kebabize("NotaFiscal") == "nota-fiscal",
        },
        {
            "name": "kebabize: snake_case",
            "fn": lambda: kebabize("nota_fiscal") == "nota-fiscal",
        },
        {
            "name": "kebabize: already kebab with double hyphen",
            "fn": lambda: kebabize("Contracts--Legacy") == "contracts-legacy",
        },
        {
            "name": "evaluate_module_id: compliant suggests nothing else",
            "fn": lambda: (
                evaluate_module_id("catalog")
                == {
                    "dir": "catalog",
                    "current_id": "catalog",
                    "compliant": True,
                    "suggested_id": "catalog",
                }
            ),
        },
        {
            "name": "evaluate_module_id: non-compliant suggests kebab",
            "fn": lambda: (
                evaluate_module_id("Proposals")["suggested_id"] == "proposals"
                and evaluate_module_id("Proposals")["compliant"] is False
            ),
        },
        {
            "name": "detect_old_generation: finds the three markers",
            "fn": lambda: (
                detect_old_generation(
                    {"ferramentas", "modulos", "projeto.json", "README.md"}
                )
                == [
                    {"found": "ferramentas", "current": "tools"},
                    {"found": "modulos", "current": "modules"},
                    {"found": "projeto.json", "current": "project.json"},
                ]
            ),
        },
        {
            "name": "detect_old_generation: current template flags nothing",
            "fn": lambda: (
                detect_old_generation({"tools", "modules", "project.json"}) == []
            ),
        },
        {
            "name": "evaluate_template_installed: nothing present -> not-installed",
            "fn": lambda: (
                evaluate_template_installed(set())["state"] == "not-installed"
            ),
        },
        {
            "name": "evaluate_template_installed: all keys present -> complete",
            "fn": lambda: (
                evaluate_template_installed(set(TEMPLATE_MARKERS))
                == {
                    "state": "complete",
                    "present": sorted(TEMPLATE_MARKERS),
                    "missing": [],
                }
            ),
        },
        {
            "name": "evaluate_template_installed: subset -> partial, with what is missing",
            "fn": lambda: (
                evaluate_template_installed({"gate", "root_manifest"})
                == {
                    "state": "partial",
                    "present": ["gate", "root_manifest"],
                    "missing": sorted(
                        set(TEMPLATE_MARKERS) - {"gate", "root_manifest"}
                    ),
                }
            ),
        },
        {
            "name": "evaluate_template_installed: only module_template -> partial",
            "fn": lambda: (
                evaluate_template_installed({"module_template"})["state"] == "partial"
            ),
        },
        {
            "name": "evaluate_template_installed: modules_root does not return to the vocabulary",
            "fn": lambda: "modules_root" not in TEMPLATE_MARKERS,
        },
        {
            "name": "generate_equivalent_candidates: gate suggests scripts/validar-modulos.mjs",
            "fn": lambda: (
                "scripts/validar-modulos.mjs" in generate_equivalent_candidates("gate")
            ),
        },
        {
            "name": "generate_equivalent_candidates: ports suggests packages/portas",
            "fn": lambda: "packages/portas" in generate_equivalent_candidates("ports"),
        },
        {
            "name": "generate_equivalent_candidates: module_template suggests modulos/_template",
            "fn": lambda: (
                "modulos/_template" in generate_equivalent_candidates("module_template")
            ),
        },
        {
            "name": "generate_equivalent_candidates: canonical never appears in its own output",
            "fn": lambda: all(
                TEMPLATE_MARKERS[marker]
                not in generate_equivalent_candidates(marker)
                for marker in TEMPLATE_MARKERS
            ),
        },
        {
            "name": "generate_equivalent_candidates: output is sorted and deterministic",
            "fn": lambda: (
                generate_equivalent_candidates("gate")
                == sorted(generate_equivalent_candidates("gate"))
                and generate_equivalent_candidates("gate")
                == generate_equivalent_candidates("gate")
            ),
        },
        {
            "name": "detect_root_collision: not-installed flags existing package.json",
            "fn": lambda: (
                detect_root_collision({"package.json", "src"}, "not-installed")
                == ["package.json"]
            ),
        },
        {
            "name": "detect_root_collision: not-installed and nothing collides",
            "fn": lambda: (
                detect_root_collision({"src", "README.md"}, "not-installed") == []
            ),
        },
        {
            "name": "detect_root_collision: partial does NOT flag (it is the scaffold itself)",
            "fn": lambda: (
                detect_root_collision({"package.json", ".gitignore"}, "partial") == []
            ),
        },
        {
            "name": "detect_root_collision: complete does NOT flag (it is the scaffold itself)",
            "fn": lambda: (
                detect_root_collision({"package.json", ".gitignore"}, "complete") == []
            ),
        },
        {
            "name": "detect_legacy_workspaces: direct list, non-canonical",
            "fn": lambda: (
                detect_legacy_workspaces({"workspaces": ["backend/*"]})
                == ["backend/*"]
            ),
        },
        {
            "name": "detect_legacy_workspaces: object form (npm/yarn)",
            "fn": lambda: (
                detect_legacy_workspaces({"workspaces": {"packages": ["apps/*"]}})
                == ["apps/*"]
            ),
        },
        {
            "name": "detect_legacy_workspaces: absent -> empty",
            "fn": lambda: detect_legacy_workspaces({}) == [],
        },
        {
            "name": "detect_legacy_workspaces: template canonical trio -> no legacy",
            "fn": lambda: (
                detect_legacy_workspaces(
                    {"workspaces": ["modules/[a-z]*", "packages/*", "adapters/*"]}
                )
                == []
            ),
        },
        {
            "name": "detect_legacy_workspaces: canonical + legacy -> only the legacy remains",
            "fn": lambda: (
                detect_legacy_workspaces(
                    {
                        "workspaces": [
                            "Modules/*",
                            "modules/[a-z]*",
                            "packages/*",
                            "adapters/*",
                        ]
                    }
                )
                == ["Modules/*"]
            ),
        },
        {
            "name": "detect_legacy_hooks: .husky folder",
            "fn": lambda: detect_legacy_hooks({".husky"}, {}) is True,
        },
        {
            "name": "detect_legacy_hooks: lint-staged in devDependencies",
            "fn": lambda: (
                detect_legacy_hooks(
                    set(), {"devDependencies": {"lint-staged": "^15.0.0"}}
                )
                is True
            ),
        },
        {
            "name": "detect_legacy_hooks: no signal",
            "fn": lambda: (
                detect_legacy_hooks({"src"}, {"dependencies": {"express": "^4.0.0"}})
                is False
            ),
        },
        {
            "name": "diagnose: pure legacy (nothing of the template present) flags collision normally",
            "fn": lambda: (
                diagnose(
                    {"package.json", "Proposals"},
                    {"workspaces": ["apps/*"]},
                    [],
                    False,
                    False,
                    ["Proposals"],
                    set(),
                )
                == {
                    "phase": "A",
                    "path": "no-specs",
                    "sdd_signals": [],
                    "branch": {
                        "current": "",
                        "is_default": False,
                        "dirty_tree": None,
                    },
                    "template_installed": {
                        "state": "not-installed",
                        "present": [],
                        "missing": sorted(TEMPLATE_MARKERS),
                    },
                    "root_collision": ["package.json"],
                    "old_generation": [],
                    "legacy_workspaces": ["apps/*"],
                    "legacy_hooks": False,
                    "module_candidates": [
                        {
                            "dir": "Proposals",
                            "current_id": "Proposals",
                            "compliant": False,
                            "suggested_id": "proposals",
                        }
                    ],
                    "modules_origin": "flag",
                    "suspected_equivalents": {},
                }
            ),
        },
        {
            "name": "diagnose: 100% compliant project does NOT flag collision nor legacy workspace",
            "fn": lambda: (
                diagnose(
                    {"package.json", ".gitignore"},
                    {"workspaces": ["modules/[a-z]*", "packages/*", "adapters/*"]},
                    [],
                    False,
                    False,
                    [],
                    set(TEMPLATE_MARKERS),
                )
                == {
                    "phase": "A",
                    "path": "no-specs",
                    "sdd_signals": [],
                    "branch": {
                        "current": "",
                        "is_default": False,
                        "dirty_tree": None,
                    },
                    "template_installed": {
                        "state": "complete",
                        "present": sorted(TEMPLATE_MARKERS),
                        "missing": [],
                    },
                    "root_collision": [],
                    "old_generation": [],
                    "legacy_workspaces": [],
                    "legacy_hooks": False,
                    "module_candidates": [],
                    "modules_origin": "flag",
                    "suspected_equivalents": {},
                }
            ),
        },
        {
            "name": "module_roots: canonical name",
            "fn": lambda: module_roots({"modules", "src"}) == ["modules"],
        },
        {
            "name": "module_roots: old-generation name (the ERP finding)",
            "fn": lambda: module_roots({"modulos", "src"}) == ["modulos"],
        },
        {
            "name": "module_roots: both coexisting -> both, sorted",
            "fn": lambda: (
                module_roots({"modules", "modulos"}) == ["modules", "modulos"]
            ),
        },
        {
            "name": "module_roots: no root -> empty",
            "fn": lambda: module_roots({"src", "app"}) == [],
        },
        {
            "name": "evaluate_branch: main is the default branch",
            "fn": lambda: evaluate_branch("main", False)["is_default"] is True,
        },
        {
            "name": "evaluate_branch: campaign branch is not default",
            "fn": lambda: (
                evaluate_branch("adequacao-modular", False)["is_default"] is False
            ),
        },
        {
            "name": "evaluate_branch: undetermined is not asserted default (nor safe)",
            "fn": lambda: (
                evaluate_branch("", None)["is_default"] is False
                and evaluate_branch("(detached)", None)["is_default"] is False
            ),
        },
        {
            "name": "evaluate_branch: dirty_tree None does NOT become False (fail-open)",
            "fn": lambda: evaluate_branch("main", None)["dirty_tree"] is None,
        },
    ]


def run_selftest() -> int:
    failures = 0
    for test_case in _selftest_cases():
        ok = bool(test_case["fn"]())
        print(f"  {'ok   ' if ok else 'FAIL'} {test_case['name']}")
        if not ok:
            failures += 1

    total = len(_selftest_cases())
    print(f"\nselftest (diagnose_terrain): {total - failures}/{total} ok")
    return 0 if failures == 0 else 1


def print_readable(report: dict) -> None:
    print(f"phase: {report['phase']}")
    print(f"path: {report['path']}")
    print(f"sdd_signals: {report['sdd_signals'] or '(none)'}")
    branch = report["branch"]
    current = branch["current"] or "(undetermined)"
    warning = (
        "  <- STOP: the campaign does not run on the default branch" if branch["is_default"] else ""
    )
    print(f"branch: {current}{warning}")
    dirty = {True: "yes", False: "no", None: "(not checked)"}[branch["dirty_tree"]]
    print(f"dirty_tree: {dirty}")
    template = report["template_installed"]
    print(f"template_installed: {template['state']}", end="")
    if template["state"] == "partial":
        print(f" (missing: {', '.join(template['missing'])})")
    else:
        print()
    print(f"root_collision: {report['root_collision'] or '(none)'}")
    print(f"old_generation: {report['old_generation'] or '(none)'}")
    print(f"legacy_workspaces: {report['legacy_workspaces'] or '(none)'}")
    print(f"legacy_hooks: {report['legacy_hooks']}")
    print(
        f"suspected_equivalents: {report['suspected_equivalents'] or '(none)'}"
    )
    print(f"module_candidates ({report['modules_origin']}):")
    for candidate in report["module_candidates"]:
        mark = "ok" if candidate["compliant"] else f"-> {candidate['suggested_id']}"
        print(f"  {candidate['dir']}: {mark}")


def _resolve_module_candidates(root: Path, args, root_entries: set):
    """`--modules` vence, sempre: e o override explicito de quem ja sabe onde os modulos estao. Sem
    ela, varre a raiz de modulos — e `modules_origin` preserva a diferenca entre "nao ha candidato" e
    "ninguem apontou", que antes eram o mesmo `[]`."""
    if args.modules:
        return list(args.modules), "flag"
    candidate_dirs = read_module_dirs(root, module_roots(root_entries))
    return candidate_dirs, "scan"


def main() -> int:
    args = get_args()
    if args.selftest:
        return run_selftest()

    root = Path(args.root).resolve()
    root_entries = read_root_entries(root)
    package_json = read_package_json(root)
    xx_plans = read_xx_plans_status(root)
    has_index = (root / "specs" / "00-indice.md").is_file()
    has_plan_dir = (root / "specs" / "plan").is_dir()
    sdd_signals = read_sdd_signals(root)
    template_markers = read_template_markers(root)
    missing = evaluate_template_installed(template_markers)["missing"]
    suspected_equivalents = read_suspected_equivalents(root, missing)
    candidate_dirs, modules_origin = _resolve_module_candidates(
        root, args, root_entries
    )

    report = diagnose(
        root_entries,
        package_json,
        xx_plans,
        has_index,
        has_plan_dir,
        candidate_dirs,
        template_markers,
        read_current_branch(root),
        read_dirty_tree(root),
        modules_origin,
        sdd_signals,
        suspected_equivalents,
    )

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_readable(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
