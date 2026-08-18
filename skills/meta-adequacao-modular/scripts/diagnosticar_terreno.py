"""diagnosticar_terreno.py — diagnostico mecanico do terreno antes da campanha de adequacao modular.

    python diagnosticar_terreno.py --raiz <alvo> [--modulos <pasta> ...] [--json]
    python diagnosticar_terreno.py --autoteste

Responde, sem julgamento nenhum, as perguntas que "meta-adequacao-modular" precisa antes de abrir a boca:
em que FASE a campanha esta (A planejar / B conferir / EM_ANDAMENTO), qual dos dois CAMINHOS de entrada
(com ou sem specs SDD), se o repositorio colide com o que o scaffold do template escreveria, se ele carrega
marcas de uma GERACAO ANTIGA do proprio template (nao e legado puro — e outro problema), se ja tem
workspaces/hooks proprios que vao precisar de composicao manual, e — para cada pasta candidata a modulo que
o chamador ja apontou — se o nome bate `^[a-z][a-z0-9-]*$` e qual seria o kebab-case sugerido.

NAO decide topologia (isso e code-diagnostico/code1-auditar): so avalia pastas que JA foram apontadas como
candidatas via `--modulos`.

Nucleo puro (nunca toca disco): `detectar_fase`, `detectar_caminho`, `kebabizar`, `avaliar_id_modulo`,
`detectar_geracao_antiga`, `detectar_colisao_raiz`, `detectar_workspaces_legado`, `detectar_hooks_legado` —
e o que o `--autoteste` prova com fixtures em memoria. A CASCA (`ler_plans`, `ler_entradas_raiz`,
`ler_package_json`, `main`) e a unica parte que le disco.
"""

import argparse
import json
import re
import sys
from pathlib import Path

MARCADORES_GERACAO_ANTIGA = {
    "ferramentas": "tools",
    "modulos": "modules",
    "projeto.json": "project.json",
}

ENTRADAS_DE_COLISAO = ("package.json", "pyproject.toml", ".gitignore")

PADRAO_ID_CONFORME = re.compile(r"^[a-z][a-z0-9-]*$")

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


def detectar_colisao_raiz(entradas_raiz: set) -> list:
    """Manifestos que o create-project/create-module abortariam ao encontrar sem `--forcar`."""
    return sorted(entradas_raiz & set(ENTRADAS_DE_COLISAO))


def detectar_workspaces_legado(package_json: dict) -> list:
    """`workspaces` ja declarado pelo legado — precisa de merge humano com o que o template exige."""
    workspaces = package_json.get("workspaces", [])
    if isinstance(workspaces, dict):
        workspaces = workspaces.get("packages", [])
    return list(workspaces) if isinstance(workspaces, list) else []


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


def diagnosticar(
    entradas_raiz: set,
    package_json: dict,
    plans_xx: list,
    tem_indice: bool,
    tem_plan_dir: bool,
    pastas_candidatas: list,
) -> dict:
    """Une os oito diagnosticos num relatorio so. Pura: nao le nada, so combina o que ja foi lido."""
    return {
        "fase": detectar_fase(plans_xx),
        "caminho": detectar_caminho(tem_indice, tem_plan_dir),
        "colisao_raiz": detectar_colisao_raiz(entradas_raiz),
        "geracao_antiga": detectar_geracao_antiga(entradas_raiz),
        "workspaces_legado": detectar_workspaces_legado(package_json),
        "hooks_legado": detectar_hooks_legado(entradas_raiz, package_json),
        "modulos_candidatos": [avaliar_id_modulo(p) for p in pastas_candidatas],
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
            "nome": "detectar_colisao_raiz: package.json existente",
            "fn": lambda: (
                detectar_colisao_raiz({"package.json", "src"}) == ["package.json"]
            ),
        },
        {
            "nome": "detectar_colisao_raiz: nada colide",
            "fn": lambda: detectar_colisao_raiz({"src", "README.md"}) == [],
        },
        {
            "nome": "detectar_workspaces_legado: lista direta",
            "fn": lambda: (
                detectar_workspaces_legado({"workspaces": ["packages/*"]})
                == ["packages/*"]
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
            "nome": "diagnosticar: combina os oito diagnosticos num relatorio so",
            "fn": lambda: (
                diagnosticar(
                    {"package.json", "Propostas"},
                    {"workspaces": ["apps/*"]},
                    [],
                    False,
                    False,
                    ["Propostas"],
                )
                == {
                    "fase": "A",
                    "caminho": "sem-specs",
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
                }
            ),
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
    print(f"colisao_raiz: {relatorio['colisao_raiz'] or '(nenhuma)'}")
    print(f"geracao_antiga: {relatorio['geracao_antiga'] or '(nenhuma)'}")
    print(f"workspaces_legado: {relatorio['workspaces_legado'] or '(nenhum)'}")
    print(f"hooks_legado: {relatorio['hooks_legado']}")
    print("modulos_candidatos:")
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

    relatorio = diagnosticar(
        entradas_raiz,
        package_json,
        plans_xx,
        tem_indice,
        tem_plan_dir,
        list(args.modulos),
    )

    if args.json:
        print(json.dumps(relatorio, ensure_ascii=False, indent=2))
    else:
        imprimir_legivel(relatorio)
    return 0


if __name__ == "__main__":
    sys.exit(main())
