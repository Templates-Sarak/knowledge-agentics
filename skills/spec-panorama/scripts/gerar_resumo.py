"""gerar_resumo.py — gera `specs/panorama/00-resumo.md` e valida familias e itens do fluxo SDD.

    python gerar_resumo.py [--specs <dir>]            escreve <dir>/panorama/00-resumo.md
    python gerar_resumo.py [--specs <dir>] --checar   nao escreve; exit 1 se houver problema
    python gerar_resumo.py --autoteste                prova o nucleo com fixtures em memoria

Le de <dir> (a pasta `specs/` do projeto): `panorama/00-planejamento.md` (catalogo §1, horizonte §2),
`00-indice.md` (ordem `#` e motivo), `plan/plan-FF.NN-*.md` (status, titulo, familia, item),
`specs/` e `arquitetura/` (`FF.NN-*.md` e o campo `familia`) e `00-backlog.md` (quantos achados).

A unidade de progresso e o ITEM do horizonte, nao a plan: a plan some na sintese, o item fica ✅.
Saida deterministica (sem data, ordem fixa) — e isso que deixa o `--checar` acusar resumo
desatualizado. Teto de 70 linhas: cada lista mostra no maximo N entradas e depois `… +K`.

Nucleo x casca: `montar_projeto`, `checagens` e `renderizar` (e o que chamam) sao PURAS — recebem
texto, nunca tocam `fs`; sao o que o `--autoteste` prova. `ler_textos`/`main` sao a casca. So
biblioteca padrao: o frontmatter e lido por um parser minimo dos campos usados, sem PyYAML.
"""

import argparse
import os
import re
import sys

STATUS = ("🔴", "🟡", "🟠", "🔵", "🟢", "⛔")
EM_TRABALHO = ("🟡", "🟠", "🔵")
TETO_DE_LINHAS = 70
# No maximo N entradas por lista antes do `… +K`. Dimensionado para o pior caso caber no teto.
LIMITES = {"agora": 8, "proximas": 8, "familias": 12, "bloqueadas": 5, "aprovadas": 5}
CAMPOS_DE_FRONTMATTER = ("status", "titulo", "familia", "item")
ARQUIVO_DO_RESUMO = os.path.join("panorama", "00-resumo.md")

COMENTARIO_HTML = re.compile(r"<!--.*?-->", re.DOTALL)
LINHA_DO_CATALOGO = re.compile(r"^\|\s*(\d{2})\s*\|\s*([^|]+?)\s*\|", re.MULTILINE)
TITULO_DE_FAMILIA = re.compile(r"^##\s+(\d{2})\s*·\s*(.+?)\s*$")
LINHA_DE_ITEM = re.compile(r"^- (⬜|🔷|✅) \*\*R(\d{2})\.(\d+)\*\*\s*(.*)$")
DATA_DE_CONCLUSAO = re.compile(r"\s*\(✅[^)]*\)\s*$")
NOME_DE_PLAN = re.compile(r"^plan-(\d{2})\.(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
NOME_DE_FIXA = re.compile(r"^(\d{2})\.(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
PLAN_NA_LINHA = re.compile(r"plan-(\d{2}\.\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*")
CAMPO_YAML = re.compile(r'^(\w+):\s*(?:"([^"]*)"|([^#\n]*?))\s*(?:#.*)?$')
ACHADO_DO_BACKLOG = re.compile(r"^\|\s*\d+\s*\|")
SEM_POSICAO = 10**6


# ------------------------------------------------------------------ nucleo: leitura


def frontmatter(texto: str) -> dict:
    """Os campos de `CAMPOS_DE_FRONTMATTER` do bloco `---` do topo (aspas e comentario `#` saem)."""
    linhas = texto.replace("\r\n", "\n").split("\n")
    if not linhas or linhas[0].strip() != "---":
        return {}
    campos = {}
    for linha in linhas[1:]:
        if linha.strip() == "---":
            break
        achado = CAMPO_YAML.match(linha)
        if achado and achado.group(1) in CAMPOS_DE_FRONTMATTER:
            valor = achado.group(2) if achado.group(2) is not None else achado.group(3)
            campos[achado.group(1)] = valor.strip()
    return campos


def emoji_de_status(texto: str) -> str:
    """O primeiro emoji de status presente no texto, ou `""`."""
    return next((emoji for emoji in STATUS if emoji in texto), "")


def parse_catalogo(texto: str) -> dict:
    """`{FF: nome}` das linhas da tabela de familias (§1). Comentario HTML nao conta."""
    return dict(LINHA_DO_CATALOGO.findall(COMENTARIO_HTML.sub("", texto)))


def _item(achado, secao: str | None) -> dict:
    estado, ff, n, resto = achado.groups()
    titulo = DATA_DE_CONCLUSAO.sub("", resto.split(" — ")[0]).strip()
    return {
        "id": f"R{ff}.{n}",
        "ff": ff,
        "estado": estado,
        "titulo": titulo,
        "secao": secao,
    }


def parse_itens(texto: str) -> list:
    """Os itens do horizonte (§2), com a familia do titulo `## FF · Nome` sob o qual estao."""
    itens, secao = [], None
    for linha in COMENTARIO_HTML.sub("", texto).replace("\r\n", "\n").split("\n"):
        titulo = TITULO_DE_FAMILIA.match(linha)
        if titulo:
            secao = titulo.group(1)
            continue
        achado = LINHA_DE_ITEM.match(linha.strip())
        if achado:
            itens.append(_item(achado, secao))
    return itens


def _posicao(celula: str) -> int:
    return int(celula) if celula.isdigit() else SEM_POSICAO


def parse_indice(texto: str) -> dict:
    """`{FF.NN: {posicao, objetivo, status}}` das linhas da fila do `00-indice`."""
    fila = {}
    for linha in texto.replace("\r\n", "\n").split("\n"):
        achado = PLAN_NA_LINHA.search(linha) if linha.lstrip().startswith("|") else None
        celulas = [c.strip() for c in linha.strip().strip("|").split("|")]
        if achado and len(celulas) >= 6:
            fila[achado.group(1)] = {
                "posicao": _posicao(celulas[0]),
                "objetivo": celulas[2],
                "status": celulas[-2],
            }
    return fila


def contar_backlog(texto: str) -> int:
    """Quantos achados a tabela do `00-backlog` tem (linha cuja primeira celula e um numero)."""
    return sum(
        1 for linha in texto.split("\n") if ACHADO_DO_BACKLOG.match(linha.strip())
    )


def _plan(nome: str, achado, texto: str, indice: dict) -> dict:
    campos, codigo = frontmatter(texto), f"{achado.group(1)}.{achado.group(2)}"
    linha = indice.get(codigo, {})
    return {
        "codigo": codigo,
        "nome": nome,
        "ff": achado.group(1),
        "familia": campos.get("familia", ""),
        "item": campos.get("item", ""),
        "status": emoji_de_status(campos.get("status") or linha.get("status", "")),
        "titulo": campos.get("titulo") or linha.get("objetivo", ""),
        "objetivo": linha.get("objetivo", ""),
        "posicao": linha.get("posicao", SEM_POSICAO),
    }


def parse_plans(plans: dict, indice: dict) -> list:
    """As plans em disco (`{nome: texto}`), na ordem da fila do indice."""
    lidas = []
    for nome in sorted(plans):
        achado = NOME_DE_PLAN.match(nome)
        if achado:
            lidas.append(_plan(nome, achado, plans[nome], indice))
    return sorted(lidas, key=lambda p: (p["posicao"], p["codigo"]))


def parse_fixas(fixas: dict) -> list:
    """As specs fixas `FF.NN-*.md` (`{caminho relativo: texto}`); nome reservado da 00 nao casa."""
    lidas = []
    for rel in sorted(fixas):
        achado = NOME_DE_FIXA.match(rel.rsplit("/", 1)[-1])
        if achado:
            lidas.append(
                {
                    "rel": rel,
                    "ff": achado.group(1),
                    "familia": frontmatter(fixas[rel]).get("familia", ""),
                }
            )
    return lidas


def montar_projeto(textos: dict) -> dict:
    """Nucleo: o projeto inteiro a partir dos textos ja lidos (ver `ler_textos`)."""
    indice = parse_indice(textos.get("indice", ""))
    return {
        "catalogo": parse_catalogo(textos.get("planejamento", "")),
        "itens": parse_itens(textos.get("planejamento", "")),
        "plans": parse_plans(textos.get("plans", {}), indice),
        "fixas": parse_fixas(textos.get("fixas", {})),
        "backlog": contar_backlog(textos.get("backlog", "")),
    }


# ------------------------------------------------------------------ nucleo: checagens


def _checar_arquivo(rotulo: str, ff: str, familia: str, catalogo: dict) -> list:
    problemas = []
    if ff not in catalogo:
        problemas.append(f"{rotulo}: família {ff} fora do catálogo")
    if familia != ff:
        problemas.append(
            f"{rotulo}: o nome diz família {ff}, o frontmatter diz familia '{familia}'"
        )
    return problemas


def _checar_familias(projeto: dict) -> list:
    catalogo, problemas = projeto["catalogo"], []
    for fixa in projeto["fixas"]:
        problemas += _checar_arquivo(fixa["rel"], fixa["ff"], fixa["familia"], catalogo)
    for plan in projeto["plans"]:
        problemas += _checar_arquivo(
            f"plan/{plan['nome']}", plan["ff"], plan["familia"], catalogo
        )
    return problemas


def _checar_itens(projeto: dict) -> list:
    problemas, vistos = [], set()
    for item in projeto["itens"]:
        if item["id"] in vistos:
            problemas.append(f"item {item['id']}: ID repetido no horizonte")
        vistos.add(item["id"])
        if item["ff"] not in projeto["catalogo"]:
            problemas.append(
                f"item {item['id']}: família {item['ff']} fora do catálogo"
            )
        if item["secao"] != item["ff"]:
            problemas.append(
                f"item {item['id']}: está sob o título da família {item['secao']}"
            )
    return problemas


def _checar_ligacoes(projeto: dict) -> list:
    itens = {item["id"]: item for item in projeto["itens"]}
    apontados, problemas = set(), []
    for plan in (p for p in projeto["plans"] if p["item"]):
        apontados.add(plan["item"])
        item = itens.get(plan["item"])
        if item is None:
            problemas.append(
                f"plan-{plan['codigo']}: item {plan['item']} não existe no horizonte"
            )
        elif item["estado"] != "🔷":
            problemas.append(
                f"plan-{plan['codigo']}: aponta para {item['id']}, que está {item['estado']} (deveria estar 🔷)"
            )
    for item in itens.values():
        if item["estado"] == "🔷" and item["id"] not in apontados:
            problemas.append(
                f"item {item['id']}: está 🔷 sem nenhuma plan aberta apontando para ele"
            )
    return problemas


def checagens(projeto: dict) -> list:
    """Nucleo: os problemas de familia e de item do projeto (o resumo desatualizado e da casca)."""
    return (
        _checar_familias(projeto) + _checar_itens(projeto) + _checar_ligacoes(projeto)
    )


# ------------------------------------------------------------------ nucleo: resumo


def barra(feitos: int, total: int, largura: int) -> str:
    cheias = feitos * largura // total if total else 0
    return "█" * cheias + "░" * (largura - cheias)


def _truncar(linhas: list, limite: int, marcador) -> list:
    if len(linhas) <= limite:
        return linhas
    return linhas[:limite] + [marcador(len(linhas) - limite)]


def _em_lista(linhas: list, limite: int) -> list:
    return _truncar(linhas, limite, lambda resto: f"- … +{resto}")


def _linha_de_plan(plan: dict) -> str:
    partes = [plan["status"], f"plan-{plan['codigo']}", plan["item"], plan["titulo"]]
    return "- " + " · ".join(parte for parte in partes if parte)


def _progresso(itens: list) -> list:
    total = len(itens)
    if not total:
        return ["sem horizonte definido"]
    feitos = sum(1 for item in itens if item["estado"] == "✅")
    return [
        f"{barra(feitos, total, 10)} {feitos * 100 // total}% · {feitos}/{total} itens ✅"
    ]


def _por_status(plans: list, status: tuple, limite: int) -> list:
    return _em_lista(
        [_linha_de_plan(p) for p in plans if p["status"] in status], limite
    )


def _linha_de_familia(ff: str, nome: str, projeto: dict) -> str | None:
    """A linha da familia na tabela, ou `None` se ela nao tem item nem plan aberta (ruido)."""
    itens = [item for item in projeto["itens"] if item["ff"] == ff]
    feitos = sum(1 for item in itens if item["estado"] == "✅")
    abertas = sum(1 for plan in projeto["plans"] if plan["ff"] == ff)
    if not itens and not abertas:
        return None
    curta = barra(feitos, len(itens), 5) if itens else "—"
    return f"| {ff} | {nome} | {feitos}/{len(itens)} | {curta} | {abertas} |"


def _familias(projeto: dict) -> list:
    candidatas = (
        _linha_de_familia(ff, nome, projeto)
        for ff, nome in sorted(projeto["catalogo"].items())
    )
    linhas = [linha for linha in candidatas if linha]
    if not linhas:
        return []
    cabecalho = [
        "| FF | Família | Itens ✅/total | Progresso | Plans abertas |",
        "|---|---|---|---|---|",
    ]
    resto = _truncar(
        linhas, LIMITES["familias"], lambda k: f"| … | +{k} famílias | | | |"
    )
    return cabecalho + resto


def _atencao(projeto: dict, n_problemas: int) -> list:
    plans = projeto["plans"]
    bloqueadas = [
        f"- ⛔ plan-{p['codigo']} · {p['objetivo'] or p['titulo']}"
        for p in plans
        if p["status"] == "⛔"
    ]
    aprovadas = [
        f"- 🟢 plan-{p['codigo']} · {p['titulo']} — aguardando síntese"
        for p in plans
        if p["status"] == "🟢"
    ]
    linhas = _em_lista(bloqueadas, LIMITES["bloqueadas"]) + _em_lista(
        aprovadas, LIMITES["aprovadas"]
    )
    if projeto["backlog"]:
        linhas.append(f"- 📋 {projeto['backlog']} achado(s) no `00-backlog`")
    if n_problemas:
        linhas.append(
            f"- ⚠️ {n_problemas} problema(s) de família/item — rode `gerar_resumo.py --checar`"
        )
    return linhas


def _secao(titulo: str, linhas: list) -> list:
    return [f"## {titulo}", *(linhas or ["—"]), ""]


CABECALHO = [
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


def renderizar(projeto: dict, n_problemas: int = 0) -> str:
    """Nucleo: o `00-resumo.md` inteiro. Deterministico: mesma entrada, mesmo texto."""
    plans = projeto["plans"]
    linhas = (
        CABECALHO
        + _secao("Progresso", _progresso(projeto["itens"]))
        + _secao("Agora", _por_status(plans, EM_TRABALHO, LIMITES["agora"]))
        + _secao("Próximas", _por_status(plans, ("🔴",), LIMITES["proximas"]))
        + _secao("Por família", _familias(projeto))
        + _secao("Atenção", _atencao(projeto, n_problemas))
    )
    return "\n".join(linhas[:-1]) + "\n"


# ------------------------------------------------------------------ casca


def _ler(caminho: str) -> str:
    if not os.path.isfile(caminho):
        return ""
    with open(caminho, encoding="utf-8") as arquivo:
        return arquivo.read()


def _markdowns(pasta: str, prefixo: str) -> dict:
    if not os.path.isdir(pasta):
        return {}
    nomes = sorted(n for n in os.listdir(pasta) if n.endswith(".md"))
    return {f"{prefixo}{nome}": _ler(os.path.join(pasta, nome)) for nome in nomes}


def ler_textos(specs_dir: str) -> dict:
    """Casca: tudo que o nucleo le, a partir da pasta `specs/` do projeto."""
    fixas = {
        **_markdowns(os.path.join(specs_dir, "specs"), "specs/"),
        **_markdowns(os.path.join(specs_dir, "arquitetura"), "arquitetura/"),
    }
    return {
        "planejamento": _ler(os.path.join(specs_dir, "panorama", "00-planejamento.md")),
        "indice": _ler(os.path.join(specs_dir, "00-indice.md")),
        "backlog": _ler(os.path.join(specs_dir, "00-backlog.md")),
        "plans": _markdowns(os.path.join(specs_dir, "plan"), ""),
        "fixas": fixas,
    }


def _checar(destino: str, conteudo: str, problemas: list) -> int:
    if _ler(destino).replace("\r\n", "\n") != conteudo:
        problemas = problemas + [
            "panorama/00-resumo.md: desatualizado — rode gerar_resumo.py sem --checar"
        ]
    for problema in problemas:
        print(f"  [PROBLEMA] {problema}")
    print(f"\n[{'ERRO' if problemas else 'OK'}] {len(problemas)} problema(s)")
    return 1 if problemas else 0


def _escrever(destino: str, conteudo: str, problemas: list) -> int:
    with open(destino, "w", encoding="utf-8", newline="\n") as arquivo:
        arquivo.write(conteudo)
    print(f"[OK] {destino} gerado ({conteudo.count(chr(10))} linhas)")
    if problemas:
        print(
            f"[AVISO] {len(problemas)} problema(s) de família/item — rode com --checar"
        )
    return 0


def _parser():
    parser = argparse.ArgumentParser(
        description="Gera e confere o panorama/00-resumo.md do fluxo SDD."
    )
    parser.add_argument(
        "--specs", default="specs", help="Pasta specs/ do projeto (padrao: specs)."
    )
    parser.add_argument(
        "--checar", action="store_true", help="Nao escreve; exit 1 se houver problema."
    )
    parser.add_argument(
        "--autoteste", action="store_true", help="Prova o nucleo com fixtures."
    )
    return parser


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = _parser().parse_args()
    if args.autoteste:
        return autoteste()
    if not os.path.isfile(os.path.join(args.specs, "panorama", "00-planejamento.md")):
        print(
            f"[ERRO] sem panorama/00-planejamento.md em {args.specs}", file=sys.stderr
        )
        return 2
    projeto = montar_projeto(ler_textos(args.specs))
    problemas = checagens(projeto)
    conteudo = renderizar(projeto, len(problemas))
    destino = os.path.join(args.specs, ARQUIVO_DO_RESUMO)
    if args.checar:
        return _checar(destino, conteudo, problemas)
    return _escrever(destino, conteudo, problemas)


# ------------------------------------------------------------------ autoteste (fixtures em memoria)

PLANEJAMENTO = """# 1. Famílias
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


def _plan_fixture(familia: str, status: str, item: str = "") -> str:
    return f'---\ntipo: "plan"\nfamilia: "{familia}"\ntitulo: "Titulo {status}"\nstatus: "{status} x" # opcoes\nitem: "{item}"\n---\n'


def _textos_ok() -> dict:
    return {
        "planejamento": PLANEJAMENTO,
        "indice": "| 2 | [plan-01.01-sso](plan/plan-01.01-sso.md) | Fazer SSO | — | 🟡 Em execução | — |\n"
        "| 1 | [plan-02.01-idx](plan/plan-02.01-idx.md) | Aguarda o DBA | — | ⛔ Bloqueada | — |\n",
        "backlog": "| # | Achado |\n|---|---|\n| 1 | algo |\n| 2 | outro |\n| — | _(vazio)_ |\n",
        "plans": {
            "plan-01.01-sso.md": _plan_fixture("01", "🟡", "R01.2"),
            "plan-02.01-idx.md": _plan_fixture("02", "⛔"),
        },
        "fixas": {
            "specs/01.01-login.md": '---\nfamilia: "01"\n---\n',
            "arquitetura/04-regras.md": "lei",
        },
    }


def _com(**mudancas) -> dict:
    textos = _textos_ok()
    textos.update(mudancas)
    return textos


def _problemas(**mudancas) -> list:
    return checagens(montar_projeto(_com(**mudancas)))


def _projeto_grande() -> dict:
    catalogo = "".join(f"| {ff:02d} | Fam {ff} | x |\n" for ff in range(30))
    itens = "".join(
        f"## {ff:02d} · Fam\n"
        + "".join(f"- ✅ **R{ff:02d}.{n}** I\n" for n in range(1, 8))
        for ff in range(30)
    )
    plans = {
        f"plan-{ff:02d}.{n:02d}-x.md": _plan_fixture(f"{ff:02d}", s)
        for ff in range(1, 4)
        for n, s in enumerate(STATUS * 4)
    }
    return montar_projeto(
        {"planejamento": catalogo + itens, "plans": plans, "backlog": "| 1 | a |\n"}
    )


def _linhas(projeto: dict, n: int = 0) -> list:
    return renderizar(projeto, n).split("\n")[:-1]


CASOS = [
    (
        "catalogo le a tabela e ignora o cabecalho",
        lambda: (
            parse_catalogo(PLANEJAMENTO)
            == {"00": "Fundação", "01": "Conexão", "02": "Base de dados"}
        ),
    ),
    (
        "itens: 5, o do comentario HTML fica de fora",
        lambda: (
            [i["id"] for i in parse_itens(PLANEJAMENTO)]
            == ["R01.1", "R01.2", "R02.1", "R02.2", "R02.3"]
        ),
    ),
    (
        "titulo do item sem frase e sem data",
        lambda: parse_itens(PLANEJAMENTO)[0]["titulo"] == "Login",
    ),
    (
        "frontmatter tira aspas e comentario",
        lambda: (
            frontmatter('---\nstatus: "🔴 A executar" # opcoes\nitem: ""\n---\n')
            == {"status": "🔴 A executar", "item": ""}
        ),
    ),
    (
        "indice: posicao e objetivo da fila",
        lambda: (
            parse_indice(_textos_ok()["indice"])["02.01"]["objetivo"] == "Aguarda o DBA"
        ),
    ),
    (
        "backlog conta so linhas numeradas",
        lambda: contar_backlog(_textos_ok()["backlog"]) == 2,
    ),
    (
        "progresso 40% com barra de 10",
        lambda: (
            _progresso(parse_itens(PLANEJAMENTO)) == ["████░░░░░░ 40% · 2/5 itens ✅"]
        ),
    ),
    (
        "sem itens: sem horizonte definido",
        lambda: _progresso([]) == ["sem horizonte definido"],
    ),
    ("projeto limpo nao tem problema", lambda: _problemas() == []),
    (
        "plans seguem a ordem # do indice",
        lambda: (
            [p["codigo"] for p in montar_projeto(_textos_ok())["plans"]]
            == ["02.01", "01.01"]
        ),
    ),
    (
        "resumo deterministico",
        lambda: (
            renderizar(montar_projeto(_textos_ok()))
            == renderizar(montar_projeto(_textos_ok()))
        ),
    ),
    (
        "secao vazia vira —",
        lambda: "## Próximas\n—\n" in renderizar(montar_projeto(_textos_ok())),
    ),
    (
        "agora traz status, plan, item e titulo",
        lambda: (
            "- 🟡 · plan-01.01 · R01.2 · Titulo 🟡"
            in renderizar(montar_projeto(_textos_ok()))
        ),
    ),
    (
        "atencao traz o motivo do bloqueio e o backlog",
        lambda: all(
            t in renderizar(montar_projeto(_textos_ok()))
            for t in ("⛔ plan-02.01 · Aguarda o DBA", "📋 2 achado(s)")
        ),
    ),
    (
        "familia de plan fora do catalogo",
        lambda: any(
            "família 07 fora do catálogo" in p
            for p in _problemas(plans={"plan-07.01-x.md": _plan_fixture("07", "🔴")})
        ),
    ),
    (
        "nome incoerente com o campo familia",
        lambda: any(
            "frontmatter diz familia '02'" in p
            for p in _problemas(fixas={"specs/01.01-x.md": '---\nfamilia: "02"\n---\n'})
        ),
    ),
    (
        "item inexistente no horizonte",
        lambda: any(
            "R01.9 não existe" in p
            for p in _problemas(
                plans={"plan-01.01-sso.md": _plan_fixture("01", "🟡", "R01.9")}
            )
        ),
    ),
    (
        "🔷 orfao e acusado",
        lambda: any(
            "R01.2: está 🔷 sem nenhuma plan" in p for p in _problemas(plans={})
        ),
    ),
    (
        "plan apontando para item ⬜ e acusada",
        lambda: any(
            "que está ⬜" in p
            for p in _problemas(
                plans={
                    "plan-02.01-idx.md": _plan_fixture("02", "🟡", "R02.2"),
                    "plan-01.01-sso.md": _plan_fixture("01", "🟡", "R01.2"),
                }
            )
        ),
    ),
    (
        "item sob o titulo de outra familia",
        lambda: any(
            "sob o título da família 01" in p
            for p in _problemas(
                planejamento=PLANEJAMENTO.replace("R02.1", "R02.1").replace(
                    "## 01 · Conexão\n", "## 01 · Conexão\n- ⬜ **R02.9** fora\n"
                )
            )
        ),
    ),
    (
        "projeto grande: cabe em 70 linhas e trunca",
        lambda: (
            len(_linhas(_projeto_grande(), 3)) <= TETO_DE_LINHAS
            and "- … +" in renderizar(_projeto_grande())
        ),
    ),
    (
        "projeto grande: tabela de familias truncada",
        lambda: "| … | +18 famílias | | | |" in renderizar(_projeto_grande()),
    ),
    (
        "familia sem item e sem plan aberta sai da tabela",
        lambda: "| 00 | Fundação |" not in renderizar(montar_projeto(_textos_ok())),
    ),
    (
        "familia com item continua na tabela",
        lambda: "| 01 | Conexão | 1/2 |" in renderizar(montar_projeto(_textos_ok())),
    ),
    (
        "tabela sem nenhuma familia com conteudo vira —",
        lambda: "## Por família\n—\n" in renderizar(montar_projeto({"planejamento": "| 00 | Fundação | x |\n"})),
    ),
]


def autoteste() -> int:
    """Prova o nucleo com fixtures em memoria. Exit 0 se todos passarem."""
    falhas = [nome for nome, caso in CASOS if not caso()]
    for nome in falhas:
        print(f"[FALHA] {nome}", file=sys.stderr)
    print(
        f"gerar_resumo --autoteste: {len(CASOS) - len(falhas)}/{len(CASOS)} caso(s) verde"
    )
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
