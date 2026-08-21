"""diagnosticar_terreno.py — diagnostico mecanico do terreno antes da campanha de adequacao modular.

    python diagnosticar_terreno.py --raiz <alvo> [--modulos <pasta> ...] [--json]
        (sem `--modulos`, os candidatos sao DESCOBERTOS varrendo a raiz de modulos)
    python diagnosticar_terreno.py --autoteste

Responde, sem julgamento nenhum, as perguntas que "meta-adequacao-modular" precisa antes de abrir a boca:
em que FASE a campanha esta (A planejar / B conferir / EM_ANDAMENTO), qual dos dois CAMINHOS de entrada
(com ou sem specs SDD), se o APARATO DO TEMPLATE ja esta instalado ali (nada / parcial / completo — e
quais pecas faltam, no caso parcial), se o repositorio colide com o que o scaffold do template escreveria
(SO quando o aparato ainda nao existe — ver abaixo), se ele carrega marcas de uma GERACAO ANTIGA do
proprio template (nao e legado puro — e outro problema), se ja tem workspaces/hooks proprios que vao
precisar de composicao manual, e — para cada pasta candidata a modulo que o chamador ja apontou — se o
nome bate `^[a-z][a-z0-9-]*$` e qual seria o kebab-case sugerido.

**Por que `template_instalado` existe.** Sem ele, um projeto 100% conforme (gerado pelo proprio
`create-project.mjs`/`create-module.mjs`) era diagnosticado como legado: `colisao_raiz` acusava
`package.json`/`.gitignore` — que sao o PROPRIO scaffold do template, copiados por
`bindings/<binding>/root/` — e `workspaces_legado` acusava `["modules/[a-z]*", "packages/*",
"adapters/*"]`, que e exatamente o `workspaces` que o template escreve. Os dois apontavam o usuario para
o portao de HITL mais caro (`--forcar`) sobre um repositorio que nao precisava de nada. Medido, nao
suposto: rodar este script contra a saida de `create-project.mjs --binding typescript` +
`create-module.mjs catalogo --role domain` reproduzia os dois falsos positivos byte a byte.

**Por que a descoberta de candidatos existe.** `modulos_candidatos` avaliava SO o que viesse em
`--modulos`, enquanto o `SKILL.md` documentava a invocacao sem a flag e prometia que "o script sugere" o
nome. Quem seguia a skill ao pe da letra recebia `[]` e ficava sem insumo no portao de HITL CENTRAL (a
lista de modulos e o nome de cada um). Medido num legado real (ERP): quatro modulos em `modulos/`,
`modulos_candidatos: []`. Agora, sem a flag, a casca varre a raiz de modulos — `modules/` e os nomes de
GERACAO ANTIGA que apontam para ela (`modulos/`), vocabulario que este mesmo arquivo ja fecha em
MARCADORES_GERACAO_ANTIGA. `--modulos` continua vencendo, como override explicito, e `modulos_origem` diz
qual dos dois produziu a lista: `[]` com origem `varredura` significa "nao ha candidato", `[]` com origem
`flag` significa "ninguem apontou" — dois fatos diferentes que antes eram indistinguiveis.

**Por que `branch` existe.** "NUNCA trabalhe em `main`" e regra da skill desde sempre, e nada a verificava
— o proprio legado que motivou esta versao estava com a campanha inteira em `main`, com delecoes ja
staged. Pela lei do ecossistema, regra sem verificador nao e regra. `branch.atual` vazio significa
**nao foi possivel determinar** (nao e repo git), e `"(destacado)"` significa HEAD destacado: nos dois
casos pergunte, nunca presuma que esta seguro. `arvore_suja` e tri-estado de proposito — `null` e
"nao consegui rodar `git status`", NUNCA "esta limpa" (fail-open e o defeito que se evita aqui).

NAO decide topologia (isso e code-diagnostico/code1-auditar): a descoberta olha UMA raiz conhecida de
modulos, nunca infere fronteira de modulo em monolito, por-camadas ou `apps/`. Para esses, aponte as
pastas com `--modulos`.

Nucleo puro (nunca toca disco): `detectar_fase`, `detectar_caminho`, `avaliar_template_instalado`,
`kebabizar`, `avaliar_id_modulo`, `detectar_geracao_antiga`, `detectar_colisao_raiz`,
`detectar_workspaces_legado`, `detectar_hooks_legado`, `raizes_de_modulos`, `avaliar_branch` — e o que o
`--autoteste` prova com fixtures em memoria. A CASCA (`ler_marcadores_template`, `ler_status_plans_xx`,
`ler_entradas_raiz`, `ler_package_json`, `ler_pastas_de_modulos`, `ler_branch_atual`, `ler_arvore_suja`,
`main`) e a unica parte que le disco — ou, nas duas ultimas, que chama `git`.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

MARCADORES_GERACAO_ANTIGA = {
    "ferramentas": "tools",
    "modulos": "modules",
    "projeto.json": "project.json",
}

ENTRADAS_DE_COLISAO = ("package.json", "pyproject.toml", ".gitignore")

# Vocabulario FECHADO de branch padrao. Deliberadamente curto: nao existe forma barata e confiavel de
# descobrir a branch padrao de um repositorio sem falar com o remoto (`origin/HEAD` pode nem estar
# resolvido no clone). Consequencia assumida, e declarada: um repositorio cuja branch principal se chame
# outra coisa (`trunk`, `develop`) NAO e acusado — falso negativo. A direcao do erro e a segura: acusar
# `develop` como "padrao" pararia uma campanha legitima.
BRANCHES_PADRAO = ("main", "master")

# As sete pecas do aparato do template (SKILL.md, Passo 3.2) — caminho relativo a raiz do projeto.
# Deliberadamente SEM "package.json"/"pyproject.toml"/".gitignore": esses tres sao os mesmos nomes que
# ENTRADAS_DE_COLISAO verifica, e um marcador nao pode ser o proprio arquivo que ele explica (senao
# "esta presente" vira circular). "modules_raiz" aqui e a pasta `modules/` do PROJETO em si — nome
# deliberadamente DIFERENTE da chave "modulos" de MARCADORES_GERACAO_ANTIGA (que fala do nome ANTIGO
# `modulos/`, nao do atual) para nao colidir visualmente com semantica diferente. Os dois convivem sem
# colidir tambem em efeito: `modulos_candidatos` avalia pastas especificas apontadas por `--modulos`,
# nunca a propria `modules/`.
#
# Limite conhecido, nao escondido: "modules_raiz" e o marcador MENOS especifico dos sete — um legado
# que por acaso ja tenha uma pasta de topo chamada `modules/` por motivo proprio (nada raro em
# projetos JS genericos) faz `avaliar_template_instalado` sair de "nao-instalado" so por causa dele,
# e isso ja basta para `detectar_colisao_raiz` parar de acusar `package.json`/`.gitignore` mesmo que
# nada mais do template esteja ali. Nao ha uma correcao barata sem mudar o CRITERIO de "parcial" (por
# exemplo exigir 2+ marcadores) — o que nao foi pedido e trocaria o efeito para outro conjunto de
# casos. Registrado aqui, e reportado a parte, em vez de resolvido em silencio.
MARCADORES_TEMPLATE = {
    "gate": "tools/gate/validate.mjs",
    "manifesto_raiz": "project.json",
    "portas": "packages/ports",
    "adapters_memoria": "adapters/memory",
    "config_raiz": "config",
    "githooks": ".githooks",
    "modules_raiz": "modules",
}

PADRAO_ID_CONFORME = re.compile(r"^[a-z][a-z0-9-]*$")

# `workspaces` que o proprio create-project.mjs escreve no package.json gerado (medido nos tres
# bindings) — uma entrada que bate aqui NAO e workspace legado, e um monorepo legado real jamais
# produz este trio exato por acidente (o segmento "[a-z]*" e sintaxe de glob do proprio template).
WORKSPACES_CANONICOS_TEMPLATE = frozenset(
    {"modules/[a-z]*", "packages/*", "adapters/*"}
)

STATUS_ENCERRADOS = {"🟢 Aprovada", "⚪ Sintetizada", "🟢", "⚪"}


def detectar_fase(plans_xx: list) -> str:
    """`plans_xx` e uma lista de status (string) das plans cujo nome comeca com "xx-". Vazia -> Fase A
    (campanha nao comecou). Todas encerradas (aprovada/sintetizada) -> Fase B (pronta para conferir).
    Qualquer uma ainda ativa -> EM_ANDAMENTO (nem planejar de novo, nem conferir ainda)."""
    if not plans_xx:
        return "A"
    if all(status in STATUS_ENCERRADOS for status in plans_xx):
        return "B"
    return "EM_ANDAMENTO"


def detectar_caminho(tem_indice: bool, tem_plan_dir: bool) -> str:
    """Caminho (ii), com specs SDD, exige as DUAS coisas — indice e pasta de plans. Uma sem a outra
    ainda conta como (i): specs SDD pela metade e o mesmo caso de "nada para sintetizar ainda"."""
    return "com-specs" if (tem_indice and tem_plan_dir) else "sem-specs"


def kebabizar(nome: str) -> str:
    """PascalCase/camelCase/snake_case/espacos -> kebab-case minusculo. Pura fronteira de palavra:
    letra minuscula seguida de maiuscula, ou minuscula/numero seguido de maiuscula em sequencia,
    ganham hifen; '_'/'.'/espaco viram hifen; hifens repetidos colapsam; bordas sao aparadas."""
    com_fronteiras = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", nome)
    normalizado = re.sub(r"[^a-zA-Z0-9]+", "-", com_fronteiras).lower()
    colapsado = re.sub(r"-+", "-", normalizado)
    return colapsado.strip("-")


def avaliar_id_modulo(nome_pasta: str) -> dict:
    """Um candidato a modulo: o id atual (nome da pasta), se ja conforme, e o sugerido."""
    conforme = bool(PADRAO_ID_CONFORME.fullmatch(nome_pasta))
    return {
        "pasta": nome_pasta,
        "id_atual": nome_pasta,
        "conforme": conforme,
        "id_sugerido": nome_pasta if conforme else kebabizar(nome_pasta),
    }


def detectar_geracao_antiga(entradas_raiz: set) -> list:
    """Marcadores de DUAS renomeacoes atras do proprio template — nao e legado puro, e migracao de
    versao. Vocabulario fechado (MARCADORES_GERACAO_ANTIGA); ordem estavel para saida determinística."""
    achados = []
    for antigo, atual in MARCADORES_GERACAO_ANTIGA.items():
        if antigo in entradas_raiz:
            achados.append({"encontrado": antigo, "atual": atual})
    return achados


def avaliar_template_instalado(marcadores_presentes: set) -> dict:
    """`marcadores_presentes` e o subconjunto das CHAVES de MARCADORES_TEMPLATE que a casca ja
    resolveu em disco (uma por caminho relativo checado). Classifica os tres estados que importam
    para a skill: nenhum marcador -> "nao-instalado" (legado puro, o fluxo de hoje esta certo);
    todos -> "completo" (nada a instalar); uns sim outros nao -> "parcial", com `faltando` listando
    exatamente as pecas que sobram — o estado que mais engana se tratado como "nada instalado"."""
    todas_chaves = set(MARCADORES_TEMPLATE)
    presentes = sorted(marcadores_presentes & todas_chaves)
    faltando = sorted(todas_chaves - marcadores_presentes)
    if not presentes:
        estado = "nao-instalado"
    elif not faltando:
        estado = "completo"
    else:
        estado = "parcial"
    return {"estado": estado, "presentes": presentes, "faltando": faltando}


def detectar_colisao_raiz(entradas_raiz: set, estado_template: str) -> list:
    """Manifestos que o create-project/create-module abortariam ao encontrar sem `--forcar` — SO
    quando o aparato do template ainda nao existe ali (`estado_template == "nao-instalado"`). Uma vez
    que qualquer peca do template ja esta presente (parcial ou completo), `package.json`/`.gitignore`/
    `pyproject.toml` sao o PROPRIO scaffold do template (copiados por `bindings/<binding>/root/`), nao
    legado colidindo — sinalizar colisao ali aponta o usuario para o `--forcar` sobre nada."""
    if estado_template != "nao-instalado":
        return []
    return sorted(entradas_raiz & set(ENTRADAS_DE_COLISAO))


def detectar_workspaces_legado(package_json: dict) -> list:
    """`workspaces` ja declarado, MENOS as entradas que sao o proprio padrao canonico do template
    (WORKSPACES_CANONICOS_TEMPLATE) — essas nunca precisam de merge humano, sao o que o template
    escreveria de qualquer jeito. O que sobra e legado de verdade precisando de decisao."""
    workspaces = package_json.get("workspaces", [])
    if isinstance(workspaces, dict):
        workspaces = workspaces.get("packages", [])
    if not isinstance(workspaces, list):
        return []
    return [w for w in workspaces if w not in WORKSPACES_CANONICOS_TEMPLATE]


def detectar_hooks_legado(entradas_raiz: set, package_json: dict) -> bool:
    """Husky/lint-staged proprios — o terceiro caso de composicao de pre-commit que `compor_pre_commit`
    ainda nao cobre (ele resolve so gate-de-segredos + verify-commit.mjs, um-com-um)."""
    if ".husky" in entradas_raiz:
        return True
    deps = {
        **package_json.get("dependencies", {}),
        **package_json.get("devDependencies", {}),
    }
    return "husky" in deps or "lint-staged" in deps


def raizes_de_modulos(entradas_raiz: set) -> list:
    """Nomes de pasta, na raiz, que valem como RAIZ DE MODULOS para a descoberta de candidatos: a
    canonica `modules/` mais os nomes de geracao antiga que apontam para ela (`modulos/`) — o mesmo
    vocabulario fechado de MARCADORES_GERACAO_ANTIGA, nunca uma segunda lista a manter em sincronia.
    Ordem estavel para saida deterministica."""
    nomes = {"modules"} | {
        antigo for antigo, atual in MARCADORES_GERACAO_ANTIGA.items() if atual == "modules"
    }
    return sorted(nome for nome in nomes if nome in entradas_raiz)


def avaliar_branch(branch_atual: str, arvore_suja) -> dict:
    """Classifica o estado de branch para o portao de HITL da skill. `branch_atual` vazio = nao foi
    possivel determinar (nao e repo git); `"(destacado)"` = HEAD destacado. Nos dois casos `e_padrao`
    sai False, e o `SKILL.md` manda PERGUNTAR em vez de presumir — o valor nunca afirma "seguro", so
    diz o que se sabe. `arvore_suja` e repassado como veio (True/False/None): `None` e "nao consegui
    verificar", jamais "limpa"."""
    return {
        "atual": branch_atual,
        "e_padrao": branch_atual in BRANCHES_PADRAO,
        "arvore_suja": arvore_suja,
    }


def diagnosticar(
    entradas_raiz: set,
    package_json: dict,
    plans_xx: list,
    tem_indice: bool,
    tem_plan_dir: bool,
    pastas_candidatas: list,
    marcadores_template: set,
    branch_atual: str = "",
    arvore_suja=None,
    modulos_origem: str = "flag",
) -> dict:
    """Une os onze diagnosticos num relatorio so. Pura: nao le nada, so combina o que ja foi lido.
    `template_instalado` e calculado ANTES de `colisao_raiz` porque esta depende daquele — a colisao
    so faz sentido contra o que e legado, nunca contra o proprio scaffold do template. Os tres
    ultimos parametros tem default para que um chamador antigo (fixture, script de terceiro) continue
    valendo — o relatorio, esse, sempre traz as onze chaves."""
    template_instalado = avaliar_template_instalado(marcadores_template)
    return {
        "fase": detectar_fase(plans_xx),
        "caminho": detectar_caminho(tem_indice, tem_plan_dir),
        "branch": avaliar_branch(branch_atual, arvore_suja),
        "template_instalado": template_instalado,
        "colisao_raiz": detectar_colisao_raiz(
            entradas_raiz, template_instalado["estado"]
        ),
        "geracao_antiga": detectar_geracao_antiga(entradas_raiz),
        "workspaces_legado": detectar_workspaces_legado(package_json),
        "hooks_legado": detectar_hooks_legado(entradas_raiz, package_json),
        "modulos_candidatos": [avaliar_id_modulo(p) for p in pastas_candidatas],
        "modulos_origem": modulos_origem,
    }


# ================================================================================================
# CASCA — unica parte que toca disco.
# ================================================================================================


def ler_entradas_raiz(raiz: Path) -> set:
    if not raiz.is_dir():
        return set()
    return {p.name for p in raiz.iterdir()}


def ler_package_json(raiz: Path) -> dict:
    caminho = raiz / "package.json"
    if not caminho.is_file():
        return {}
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def ler_status_plans_xx(raiz: Path) -> list:
    """Status (frontmatter `status:`) de toda plan cujo NOME comeca com "xx-" em specs/plan/."""
    pasta_plan = raiz / "specs" / "plan"
    if not pasta_plan.is_dir():
        return []
    status_encontrados = []
    for arquivo in sorted(pasta_plan.glob("xx-*.md")):
        texto = arquivo.read_text(encoding="utf-8", errors="replace")
        casado = re.search(r'^status:\s*"?([^"\n]+)"?', texto, re.MULTILINE)
        status_encontrados.append(casado.group(1).strip() if casado else "")
    return status_encontrados


def ler_marcadores_template(raiz: Path) -> set:
    """Quais chaves de MARCADORES_TEMPLATE existem de fato sob `raiz` — a UNICA funcao que resolve
    esse sinal em disco; `avaliar_template_instalado` (nucleo) so classifica o conjunto ja lido."""
    return {
        chave
        for chave, relativo in MARCADORES_TEMPLATE.items()
        if (raiz / relativo).exists()
    }


def ler_pastas_de_modulos(raiz: Path, nomes_de_raiz: list) -> list:
    """Subpastas de cada raiz de modulos — os candidatos que o chamador nao precisou apontar. Ignora
    entrada oculta e `_template`/`_adapter` (moldes do proprio template, nunca modulo). Devolve nome
    de pasta, nao caminho: e o mesmo contrato que `--modulos` ja tinha, e `avaliar_id_modulo` julga o
    NOME. Sem deduplicar entre raizes: se `modules/` e `modulos/` coexistem, ver o nome duas vezes e
    o achado, nao ruido."""
    achados = []
    for nome_raiz in nomes_de_raiz:
        pasta = raiz / nome_raiz
        if not pasta.is_dir():
            continue
        for entrada in sorted(pasta.iterdir()):
            if entrada.is_dir() and not entrada.name.startswith((".", "_")):
                achados.append(entrada.name)
    return achados


def ler_branch_atual(raiz: Path) -> str:
    """Branch por LEITURA de `.git/HEAD` — nao chama `git`, e por isso funciona com git ausente do
    PATH. Vazio = nao e repo git (ou HEAD ilegivel); `"(destacado)"` = HEAD aponta para um commit, nao
    para um ref. Nao resolve worktree/submodulo (`.git` como ARQUIVO): tambem devolve vazio, e o
    `SKILL.md` manda perguntar — limite declarado, nao silencio."""
    head = raiz / ".git" / "HEAD"
    if not head.is_file():
        return ""
    try:
        conteudo = head.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return ""
    if conteudo.startswith("ref: refs/heads/"):
        return conteudo[len("ref: refs/heads/") :].strip()
    return "(destacado)" if conteudo else ""


def ler_arvore_suja(raiz: Path):
    """True/False pelo `git status --porcelain`; **None quando nao deu para saber** (git ausente,
    diretorio nao versionado, chamada falhou). None NUNCA vira False: "nao verifiquei" e "esta limpa"
    sao fatos diferentes, e confundi-los e exatamente o fail-open que esta skill cobra dos outros."""
    if not (raiz / ".git").exists():
        return None
    try:
        saida = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(raiz),
            capture_output=True,
            text=True,
            timeout=30,
            check=False,  # o returncode e tratado abaixo: != 0 vira None ("nao sei"), nunca False
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if saida.returncode != 0:
        return None
    return bool(saida.stdout.strip())


def get_args():
    parser = argparse.ArgumentParser(
        description="Diagnostico mecanico do terreno de adequacao modular."
    )
    parser.add_argument("--raiz", default=".", help="Raiz do repositorio-alvo")
    parser.add_argument(
        "--modulos", nargs="*", default=(), help="Pastas candidatas a modulo (nomes)"
    )
    parser.add_argument(
        "--json", action="store_true", help="Saida em JSON (padrao: legivel)"
    )
    parser.add_argument("--autoteste", action="store_true")
    return parser.parse_args()


def _casos_de_autoteste() -> list:
    return [
        {
            "nome": "detectar_fase: sem plans xx- -> A",
            "fn": lambda: detectar_fase([]) == "A",
        },
        {
            "nome": "detectar_fase: todas encerradas -> B",
            "fn": lambda: detectar_fase(["🟢 Aprovada", "⚪ Sintetizada"]) == "B",
        },
        {
            "nome": "detectar_fase: uma ativa -> EM_ANDAMENTO",
            "fn": lambda: (
                detectar_fase(["🟢 Aprovada", "🟡 Em execução"]) == "EM_ANDAMENTO"
            ),
        },
        {
            "nome": "detectar_caminho: indice e plan/ -> com-specs",
            "fn": lambda: detectar_caminho(True, True) == "com-specs",
        },
        {
            "nome": "detectar_caminho: so indice -> sem-specs",
            "fn": lambda: detectar_caminho(True, False) == "sem-specs",
        },
        {
            "nome": "detectar_caminho: nenhum -> sem-specs",
            "fn": lambda: detectar_caminho(False, False) == "sem-specs",
        },
        {
            "nome": "kebabizar: PascalCase",
            "fn": lambda: kebabizar("Propostas") == "propostas",
        },
        {
            "nome": "kebabizar: composto",
            "fn": lambda: kebabizar("NotaFiscal") == "nota-fiscal",
        },
        {
            "nome": "kebabizar: snake_case",
            "fn": lambda: kebabizar("nota_fiscal") == "nota-fiscal",
        },
        {
            "nome": "kebabizar: ja kebab com hifen duplo",
            "fn": lambda: kebabizar("Contratos--Legado") == "contratos-legado",
        },
        {
            "nome": "avaliar_id_modulo: conforme nao sugere outra coisa",
            "fn": lambda: (
                avaliar_id_modulo("catalogo")
                == {
                    "pasta": "catalogo",
                    "id_atual": "catalogo",
                    "conforme": True,
                    "id_sugerido": "catalogo",
                }
            ),
        },
        {
            "nome": "avaliar_id_modulo: nao conforme sugere kebab",
            "fn": lambda: (
                avaliar_id_modulo("Propostas")["id_sugerido"] == "propostas"
                and avaliar_id_modulo("Propostas")["conforme"] is False
            ),
        },
        {
            "nome": "detectar_geracao_antiga: acha os tres marcadores",
            "fn": lambda: (
                detectar_geracao_antiga(
                    {"ferramentas", "modulos", "projeto.json", "README.md"}
                )
                == [
                    {"encontrado": "ferramentas", "atual": "tools"},
                    {"encontrado": "modulos", "atual": "modules"},
                    {"encontrado": "projeto.json", "atual": "project.json"},
                ]
            ),
        },
        {
            "nome": "detectar_geracao_antiga: template atual nao acusa nada",
            "fn": lambda: (
                detectar_geracao_antiga({"tools", "modules", "project.json"}) == []
            ),
        },
        {
            "nome": "avaliar_template_instalado: nada presente -> nao-instalado",
            "fn": lambda: (
                avaliar_template_instalado(set())["estado"] == "nao-instalado"
            ),
        },
        {
            "nome": "avaliar_template_instalado: todas as chaves presentes -> completo",
            "fn": lambda: (
                avaliar_template_instalado(set(MARCADORES_TEMPLATE))
                == {
                    "estado": "completo",
                    "presentes": sorted(MARCADORES_TEMPLATE),
                    "faltando": [],
                }
            ),
        },
        {
            "nome": "avaliar_template_instalado: subconjunto -> parcial, com o que falta",
            "fn": lambda: (
                avaliar_template_instalado({"gate", "manifesto_raiz"})
                == {
                    "estado": "parcial",
                    "presentes": ["gate", "manifesto_raiz"],
                    "faltando": sorted(
                        set(MARCADORES_TEMPLATE) - {"gate", "manifesto_raiz"}
                    ),
                }
            ),
        },
        {
            "nome": "detectar_colisao_raiz: nao-instalado acusa package.json existente",
            "fn": lambda: (
                detectar_colisao_raiz({"package.json", "src"}, "nao-instalado")
                == ["package.json"]
            ),
        },
        {
            "nome": "detectar_colisao_raiz: nao-instalado e nada colide",
            "fn": lambda: (
                detectar_colisao_raiz({"src", "README.md"}, "nao-instalado") == []
            ),
        },
        {
            "nome": "detectar_colisao_raiz: parcial NAO acusa (e o proprio scaffold)",
            "fn": lambda: (
                detectar_colisao_raiz({"package.json", ".gitignore"}, "parcial") == []
            ),
        },
        {
            "nome": "detectar_colisao_raiz: completo NAO acusa (e o proprio scaffold)",
            "fn": lambda: (
                detectar_colisao_raiz({"package.json", ".gitignore"}, "completo") == []
            ),
        },
        {
            "nome": "detectar_workspaces_legado: lista direta, nao-canonica",
            "fn": lambda: (
                detectar_workspaces_legado({"workspaces": ["backend/*"]})
                == ["backend/*"]
            ),
        },
        {
            "nome": "detectar_workspaces_legado: forma objeto (npm/yarn)",
            "fn": lambda: (
                detectar_workspaces_legado({"workspaces": {"packages": ["apps/*"]}})
                == ["apps/*"]
            ),
        },
        {
            "nome": "detectar_workspaces_legado: ausente -> vazio",
            "fn": lambda: detectar_workspaces_legado({}) == [],
        },
        {
            "nome": "detectar_workspaces_legado: trio canonico do template -> nenhum legado",
            "fn": lambda: (
                detectar_workspaces_legado(
                    {"workspaces": ["modules/[a-z]*", "packages/*", "adapters/*"]}
                )
                == []
            ),
        },
        {
            "nome": "detectar_workspaces_legado: canonico + legado -> so o legado sobra",
            "fn": lambda: (
                detectar_workspaces_legado(
                    {
                        "workspaces": [
                            "Modulos/*",
                            "modules/[a-z]*",
                            "packages/*",
                            "adapters/*",
                        ]
                    }
                )
                == ["Modulos/*"]
            ),
        },
        {
            "nome": "detectar_hooks_legado: pasta .husky",
            "fn": lambda: detectar_hooks_legado({".husky"}, {}) is True,
        },
        {
            "nome": "detectar_hooks_legado: lint-staged em devDependencies",
            "fn": lambda: (
                detectar_hooks_legado(
                    set(), {"devDependencies": {"lint-staged": "^15.0.0"}}
                )
                is True
            ),
        },
        {
            "nome": "detectar_hooks_legado: nenhum sinal",
            "fn": lambda: (
                detectar_hooks_legado({"src"}, {"dependencies": {"express": "^4.0.0"}})
                is False
            ),
        },
        {
            "nome": "diagnosticar: legado puro (nada do template presente) acusa colisao normalmente",
            "fn": lambda: (
                diagnosticar(
                    {"package.json", "Propostas"},
                    {"workspaces": ["apps/*"]},
                    [],
                    False,
                    False,
                    ["Propostas"],
                    set(),
                )
                == {
                    "fase": "A",
                    "caminho": "sem-specs",
                    "branch": {
                        "atual": "",
                        "e_padrao": False,
                        "arvore_suja": None,
                    },
                    "template_instalado": {
                        "estado": "nao-instalado",
                        "presentes": [],
                        "faltando": sorted(MARCADORES_TEMPLATE),
                    },
                    "colisao_raiz": ["package.json"],
                    "geracao_antiga": [],
                    "workspaces_legado": ["apps/*"],
                    "hooks_legado": False,
                    "modulos_candidatos": [
                        {
                            "pasta": "Propostas",
                            "id_atual": "Propostas",
                            "conforme": False,
                            "id_sugerido": "propostas",
                        }
                    ],
                    "modulos_origem": "flag",
                }
            ),
        },
        {
            "nome": "diagnosticar: projeto 100% conforme NAO acusa colisao nem workspace legado",
            "fn": lambda: (
                diagnosticar(
                    {"package.json", ".gitignore"},
                    {"workspaces": ["modules/[a-z]*", "packages/*", "adapters/*"]},
                    [],
                    False,
                    False,
                    [],
                    set(MARCADORES_TEMPLATE),
                )
                == {
                    "fase": "A",
                    "caminho": "sem-specs",
                    "branch": {
                        "atual": "",
                        "e_padrao": False,
                        "arvore_suja": None,
                    },
                    "template_instalado": {
                        "estado": "completo",
                        "presentes": sorted(MARCADORES_TEMPLATE),
                        "faltando": [],
                    },
                    "colisao_raiz": [],
                    "geracao_antiga": [],
                    "workspaces_legado": [],
                    "hooks_legado": False,
                    "modulos_candidatos": [],
                    "modulos_origem": "flag",
                }
            ),
        },
        {
            "nome": "raizes_de_modulos: nome canonico",
            "fn": lambda: raizes_de_modulos({"modules", "src"}) == ["modules"],
        },
        {
            "nome": "raizes_de_modulos: nome de geracao antiga (o achado do ERP)",
            "fn": lambda: raizes_de_modulos({"modulos", "src"}) == ["modulos"],
        },
        {
            "nome": "raizes_de_modulos: os dois coexistindo -> os dois, ordenados",
            "fn": lambda: raizes_de_modulos({"modules", "modulos"}) == ["modules", "modulos"],
        },
        {
            "nome": "raizes_de_modulos: nenhuma raiz -> vazio",
            "fn": lambda: raizes_de_modulos({"src", "app"}) == [],
        },
        {
            "nome": "avaliar_branch: main e branch padrao",
            "fn": lambda: avaliar_branch("main", False)["e_padrao"] is True,
        },
        {
            "nome": "avaliar_branch: branch de campanha nao e padrao",
            "fn": lambda: avaliar_branch("adequacao-modular", False)["e_padrao"] is False,
        },
        {
            "nome": "avaliar_branch: indeterminada nao se afirma padrao (nem segura)",
            "fn": lambda: (
                avaliar_branch("", None)["e_padrao"] is False
                and avaliar_branch("(destacado)", None)["e_padrao"] is False
            ),
        },
        {
            "nome": "avaliar_branch: arvore_suja None NAO vira False (fail-open)",
            "fn": lambda: avaliar_branch("main", None)["arvore_suja"] is None,
        },
    ]


def rodar_autoteste() -> int:
    falhas = 0
    for caso in _casos_de_autoteste():
        ok = bool(caso["fn"]())
        print(f"  {'ok   ' if ok else 'FALHA'} {caso['nome']}")
        if not ok:
            falhas += 1

    total = len(_casos_de_autoteste())
    print(f"\nautoteste (diagnosticar_terreno): {total - falhas}/{total} ok")
    return 0 if falhas == 0 else 1


def imprimir_legivel(relatorio: dict) -> None:
    print(f"fase: {relatorio['fase']}")
    print(f"caminho: {relatorio['caminho']}")
    branch = relatorio["branch"]
    atual = branch["atual"] or "(indeterminada)"
    alerta = "  <- PARE: campanha nao roda na branch padrao" if branch["e_padrao"] else ""
    print(f"branch: {atual}{alerta}")
    suja = {True: "sim", False: "nao", None: "(nao verificado)"}[branch["arvore_suja"]]
    print(f"arvore_suja: {suja}")
    template = relatorio["template_instalado"]
    print(f"template_instalado: {template['estado']}", end="")
    if template["estado"] == "parcial":
        print(f" (falta: {', '.join(template['faltando'])})")
    else:
        print()
    print(f"colisao_raiz: {relatorio['colisao_raiz'] or '(nenhuma)'}")
    print(f"geracao_antiga: {relatorio['geracao_antiga'] or '(nenhuma)'}")
    print(f"workspaces_legado: {relatorio['workspaces_legado'] or '(nenhum)'}")
    print(f"hooks_legado: {relatorio['hooks_legado']}")
    print(f"modulos_candidatos ({relatorio['modulos_origem']}):")
    for candidato in relatorio["modulos_candidatos"]:
        marca = "ok" if candidato["conforme"] else f"-> {candidato['id_sugerido']}"
        print(f"  {candidato['pasta']}: {marca}")


def main() -> int:
    args = get_args()
    if args.autoteste:
        return rodar_autoteste()

    raiz = Path(args.raiz).resolve()
    entradas_raiz = ler_entradas_raiz(raiz)
    package_json = ler_package_json(raiz)
    plans_xx = ler_status_plans_xx(raiz)
    tem_indice = (raiz / "specs" / "00-indice.md").is_file()
    tem_plan_dir = (raiz / "specs" / "plan").is_dir()
    marcadores_template = ler_marcadores_template(raiz)

    # `--modulos` vence, sempre: e o override explicito de quem ja sabe onde os modulos estao. Sem ela,
    # varre a raiz de modulos — e `modulos_origem` preserva a diferenca entre "nao ha candidato" e
    # "ninguem apontou", que antes eram o mesmo `[]`.
    if args.modulos:
        pastas_candidatas, modulos_origem = list(args.modulos), "flag"
    else:
        pastas_candidatas = ler_pastas_de_modulos(raiz, raizes_de_modulos(entradas_raiz))
        modulos_origem = "varredura"

    relatorio = diagnosticar(
        entradas_raiz,
        package_json,
        plans_xx,
        tem_indice,
        tem_plan_dir,
        pastas_candidatas,
        marcadores_template,
        ler_branch_atual(raiz),
        ler_arvore_suja(raiz),
        modulos_origem,
    )

    if args.json:
        print(json.dumps(relatorio, ensure_ascii=False, indent=2))
    else:
        imprimir_legivel(relatorio)
    return 0


if __name__ == "__main__":
    sys.exit(main())
