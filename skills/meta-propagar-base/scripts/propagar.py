"""propagar.py — o PLANO de propagacao da base aos sistemas do `mapa.json` (somente leitura).

    python propagar.py --plano [--id <id>] [--json] [--mapa <arquivo>] [--permitir-base-suja]
    python propagar.py --autoteste      prova o nucleo (classificar/decidir/planejar/lacunas) em memoria

Para cada sistema: o que mudaria, por que e com que risco. NADA e escrito em sistema nenhum — esta
versao nao tem modo de escrita (o aplicar vem depois, desenhado a partir dos planos reais).

A ideia central: o sistema e comparado com uma INSTALACAO DE REFERENCIA — o que a base instalaria,
gerada numa pasta temporaria PELOS PROPRIOS INSTALADORES da base (`init_repo.py`, `create-project.mjs`
via ele, `instalar_base_de_linguagem`, a copia de `_estrutura_base_site/`), com os parametros do
sistema. Nunca se copia arquivo cru: os instaladores reescrevem (nome do projeto, escopo, comandos do
binding), e reimplementar isso aqui seria uma segunda fonte. Os instaladores rodam dentro de um
`git worktree` do commit (HEAD, ou o do carimbo), entao a referencia e exatamente aquele commit.

Nucleo x casca: `classificar`, `decidir`, `planejar`, `lacunas`, `escopo_do_pacote` e `normalizar`
sao PUROS — sao o que o `--autoteste` prova. O resto (git, temporarios, leitura de disco) e casca.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ------------------------------------------------------------------ categorias (FONTE UNICA)

UNIVERSAL, MOLDE, GERADO, PROJETO = "universal", "molde", "gerado", "projeto"
BASE_DE_LINGUAGEM = (
    "base-de-linguagem"  # universal SO se o binding esta na lista do sistema
)

# Primeira regra que casa vence. Cada uma cita de onde vem a posse — a classificacao nao e suposicao:
#  [A] specs/_estrutura_modulos/tools/create-project.mjs — `instalarDoutrina` instala as cinco leis e o
#      README da doutrina em specs/arquitetura/ e as decisoes em specs/adr/000-decisoes-do-template.md;
#      o comentario de PASTAS_COM_MARCADOR_ESCOPO: "`tools/` e vendorizado — ninguem edita".
#  [B] doutrina/adr/decisoes.md, ADR-009 linha 4: `tools/` e "ferramental vendorizado — o dono e outro
#      repositorio".
#  [C] specs/_estrutura_base/README.md §1.1: 00-knowledge e os dois prompts sao "Universal";
#      00-contexto, 00-indice e 00-backlog sao "Por projeto"; panorama/00-resumo.md e "Gerado".
#  [D] _templates/template-adr.md: `000-decisoes-do-template.md` "Nao [editavel]. Vem do template";
#      os demais ADRs, "voce escreve".
#  [E] panorama/00-planejamento.md §1: os nomes reservados da familia 00 (lei do template, bases);
#      specs/arquitetura/FF.NN-*, specs/specs/ e plans sao do projeto.
#  [F] skills/meta-iniciar-repositorio/scripts/init_repo.py, `instalar_estrutura_agents`: substitui
#      .agents/skills/meta-create-skill e grava .agents/gerar_indice.py a cada execucao.
# Sem declaracao de posse do template -> PROJETO (fora da propagacao, nunca listado): o esqueleto de
# bindings/<b>/root (package.json, config/, src/, packages/, adapters/, scripts/, .githooks/),
# modules/_template e adapters/_template, AGENTS.md/CLAUDE.md (o init_repo so ANEXA) e .sarak/.
REGRAS = [
    (r"^tools/", UNIVERSAL),  # A, B
    (r"^\.agents/(gerar_indice\.py$|skills/meta-create-skill/)", UNIVERSAL),  # F
    (r"^specs/panorama/00-resumo\.md$", GERADO),  # C
    (r"^specs/panorama/00-planejamento\.md$", MOLDE),  # C, E
    (r"^specs/00-(contexto|indice|backlog)\.md$", MOLDE),  # C
    (
        r"^specs/(00-knowledge|00-prompt-revisor|00-prompt-executor|README|INDEX)\.md$",
        UNIVERSAL,
    ),  # C
    (r"^specs/_templates/", UNIVERSAL),  # C
    (r"^specs/adr/000-decisoes-do-template\.md$", UNIVERSAL),  # A, D
    (r"^specs/adr/", MOLDE),  # D
    (
        r"^specs/arquitetura/(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras|README)\.md$",
        UNIVERSAL,
    ),  # A, E
    (
        r"^specs/arquitetura/00-base-(typescript|javascript|python)\.md$",
        BASE_DE_LINGUAGEM,
    ),  # E
    (r"^specs/(arquitetura|specs|plan)/", MOLDE),  # E
]
REGRAS_COMPILADAS = [(re.compile(padrao), categoria) for padrao, categoria in REGRAS]

ORDEM_DAS_ACOES = (
    "adicionar",
    "substituir",
    "conflito",
    "divergente",
    "obsoleto?",
    "reportar-molde",
    "regenerar",
    "nada",
)
NOMES_RESERVADOS = re.compile(
    r"^(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras|00-base-[a-z]+|00-fundacao-tecnologica)\.md$"
)
SPEC_FORA_DE_FAMILIA = re.compile(r"^\d{2}-[a-z0-9].*\.md$")
PLAN_FORA_DE_FAMILIA = re.compile(r"^plan-\d+-[a-z0-9].*\.md$")
AREAS_DO_SISTEMA = ("specs", "tools", ".agents")
PASTAS_IGNORADAS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".ruff_cache",
    ".venv",
    "dist",
    "generated",
}
LIMITE_DE_LISTA = 8


# ------------------------------------------------------------------ nucleo


def normalizar(texto: str) -> str:
    """Fim de linha nao e diferenca de conteudo: CRLF -> LF antes de comparar."""
    return texto.replace("\r\n", "\n")


def classificar(caminho: str, contexto: dict) -> str:
    """Nucleo: a categoria de um caminho relativo (com `/`). `contexto` = {bindings: [...]}."""
    for regra, categoria in REGRAS_COMPILADAS:
        achado = regra.match(caminho)
        if not achado:
            continue
        if categoria != BASE_DE_LINGUAGEM:
            return categoria
        return UNIVERSAL if achado.group(1) in contexto.get("bindings", []) else PROJETO
    return PROJETO


def _decidir_universal(
    existe: bool, igual_ref: bool | None, igual_ref_antiga: bool | None
) -> str:
    if igual_ref is None:
        return "obsoleto?"
    if not existe:
        return "adicionar"
    if igual_ref:
        return "nada"
    if igual_ref_antiga is None:
        return "divergente"
    return "substituir" if igual_ref_antiga else "conflito"


def _decidir_molde(
    existe: bool, igual_ref: bool | None, igual_ref_antiga: bool | None
) -> str:
    if igual_ref is None:
        return "nada"
    if not existe:
        return "adicionar"
    if not igual_ref and igual_ref_antiga:
        return "reportar-molde"
    return "nada"


def decidir(
    categoria: str,
    existe_no_sistema: bool,
    igual_ref: bool | None,
    igual_ref_antiga: bool | None,
) -> str | None:
    """Nucleo: a acao para um arquivo. `igual_ref` = o sistema e igual a referencia atual (`None` = o
    arquivo nao existe na referencia); `igual_ref_antiga` = igual a referencia do carimbo (`None` = sem
    carimbo). Universal diferente sem carimbo e `divergente` (versao antiga OU edicao local); molde
    presente nunca e tocado — so e reportado se o sistema ainda e o molde ANTIGO intocado e o molde mudou.
    `projeto` devolve `None`: fora da propagacao."""
    if categoria == UNIVERSAL:
        return _decidir_universal(existe_no_sistema, igual_ref, igual_ref_antiga)
    if categoria == MOLDE:
        return _decidir_molde(existe_no_sistema, igual_ref, igual_ref_antiga)
    if categoria == GERADO:
        return "regenerar"
    return None


def _comparar(rel: str, sistema: dict, referencia: dict | None) -> bool | None:
    if referencia is None:
        return None
    if rel not in referencia:
        return False
    return normalizar(sistema[rel]) == normalizar(referencia[rel])


def _acao_de_referencia(rel: str, referencias: tuple, sistema: dict, contexto: dict) -> str | None:
    """A acao de um arquivo da referencia atual. `referencias` = (atual, do carimbo ou `None`)."""
    ref, antiga = referencias
    existe = rel in sistema
    igual_ref = normalizar(sistema[rel]) == normalizar(ref[rel]) if existe else False
    igual_antiga = _comparar(rel, sistema, antiga) if existe else None
    return decidir(classificar(rel, contexto), existe, igual_ref, igual_antiga)


def planejar(ref: dict, antiga: dict | None, sistema: dict, contexto: dict) -> dict:
    """Nucleo: `{acao: [caminhos]}` + `molde-mudou-na-base`, dados os arquivos `{rel: texto}` da
    referencia atual, da referencia do carimbo (`None` = sem carimbo) e do sistema."""
    acoes = {acao: [] for acao in ORDEM_DAS_ACOES}
    for rel in sorted(ref):
        acao = _acao_de_referencia(rel, (ref, antiga), sistema, contexto)
        if acao:
            acoes[acao].append(rel)
    for rel in sorted(set(sistema) - set(ref)):
        acao = decidir(classificar(rel, contexto), True, None, None)
        if acao == "obsoleto?":
            acoes[acao].append(rel)
    mudou = [
        rel
        for rel in sorted(ref)
        if antiga is not None
        and classificar(rel, contexto) == MOLDE
        and rel in antiga
        and normalizar(antiga[rel]) != normalizar(ref[rel])
    ]
    return {"acoes": acoes, "molde-mudou-na-base": mudou}


def lacunas(caminhos_do_sistema: list, contexto: dict) -> dict:
    """Nucleo: o que falta ou esta fora do padrao no sistema e nao e trabalho da propagacao."""
    nomes = set(caminhos_do_sistema)
    specs_antigas = sorted(
        c
        for c in caminhos_do_sistema
        if re.match(r"^specs/(specs|arquitetura)/[^/]+$", c)
        and SPEC_FORA_DE_FAMILIA.match(c.rsplit("/", 1)[-1])
        and not NOMES_RESERVADOS.match(c.rsplit("/", 1)[-1])
    )
    plans_antigas = sorted(
        c
        for c in caminhos_do_sistema
        if c.startswith("specs/plan/")
        and PLAN_FORA_DE_FAMILIA.match(c.rsplit("/", 1)[-1])
    )
    return {
        "binding-sem-base": [
            b
            for b in contexto.get("bindings", [])
            if f"specs/arquitetura/00-base-{b}.md" not in nomes
        ],
        "migracao-de-familias-pendente": specs_antigas + plans_antigas,
        "sem-planejamento": "specs/panorama/00-planejamento.md" not in nomes,
    }


def escopo_do_pacote(texto_package_json: str | None, caminho: str) -> str:
    """Nucleo: o escopo que o instalador usou — o `name` do package.json da raiz (onde o
    create-project grava `<escopo>`); sem ele, o padrao do proprio create-project (nome da pasta)."""
    try:
        nome = json.loads(texto_package_json or "{}").get("name")
    except ValueError:
        nome = None
    return (
        nome
        if isinstance(nome, str) and nome
        else os.path.basename(caminho.rstrip("/")).lower()
    )


# ------------------------------------------------------------------ casca: git e temporarios


def raiz_da_base() -> Path:
    return Path(__file__).resolve().parents[3]


def _rodar(comando: list, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        comando,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def _git(raiz: Path, *args) -> str | None:
    r = _rodar(["git", "-C", str(raiz), *args])
    return r.stdout.strip() if r.returncode == 0 else None


def base_suja(raiz: Path) -> bool:
    return bool(_git(raiz, "status", "--porcelain"))


def abrir_worktree(raiz: Path, commit: str, destino: Path) -> bool:
    return (
        _rodar(
            [
                "git",
                "-C",
                str(raiz),
                "worktree",
                "add",
                "--detach",
                str(destino),
                commit,
            ]
        ).returncode
        == 0
    )


def fechar_worktree(raiz: Path, destino: Path) -> None:
    _rodar(["git", "-C", str(raiz), "worktree", "remove", "--force", str(destino)])
    _rodar(["git", "-C", str(raiz), "worktree", "prune"])


# ------------------------------------------------------------------ casca: referencia


def _instalar_bases(arvore: Path, alvo: Path, sistema: dict) -> None:
    """Os `00-base-<binding>.md` de TODOS os bindings, pela funcao do proprio init_repo daquela arvore
    (subprocesso: cada arvore importa o SEU init_repo, sem cache entre versoes)."""
    scripts = arvore / "skills" / "meta-iniciar-repositorio" / "scripts"
    for binding in sistema["bindings"]:
        codigo = (
            "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); import init_repo; "
            "init_repo.instalar_base_de_linguagem(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4], sys.argv[5])"
        )
        _rodar(
            [
                sys.executable,
                "-c",
                codigo,
                str(scripts),
                str(alvo),
                str(arvore),
                binding,
                sistema["nome"],
            ]
        )


def _instalar_app(arvore: Path, alvo: Path, sistema: dict, escopo: str) -> None:
    script = arvore / "skills" / "meta-iniciar-repositorio" / "scripts" / "init_repo.py"
    comando = [
        sys.executable,
        str(script),
        "--target",
        str(alvo),
        "--name",
        sistema["nome"],
    ]
    if sistema["modular"] and sistema["bindings"]:
        comando += ["--binding", sistema["bindings"][0], "--escopo", escopo]
    _rodar(comando)


def gerar_referencia(arvore: Path, alvo: Path, sistema: dict, escopo: str) -> dict:
    """Casca: instala, com os instaladores de `arvore`, o que a base instalaria neste sistema."""
    alvo.mkdir(parents=True, exist_ok=True)
    if sistema["tipo"] == "site":
        shutil.copytree(
            arvore / "specs" / "_estrutura_base_site",
            alvo / "specs",
            dirs_exist_ok=True,
        )
    else:
        _instalar_app(arvore, alvo, sistema, escopo)
    _instalar_bases(arvore, alvo, sistema)
    return ler_arvore(alvo)


def ler_arvore(raiz: Path) -> dict:
    """Casca: `{caminho relativo com /: texto}` das areas que a propagacao conhece."""
    arquivos = {}
    for area in AREAS_DO_SISTEMA:
        for pasta, subpastas, nomes in os.walk(raiz / area):
            subpastas[:] = [s for s in subpastas if s not in PASTAS_IGNORADAS]
            for nome in nomes:
                caminho = Path(pasta) / nome
                arquivos[caminho.relative_to(raiz).as_posix()] = caminho.read_text(
                    encoding="utf-8", errors="replace"
                )
    return arquivos


# ------------------------------------------------------------------ casca: um sistema


def _ler_texto(caminho: Path) -> str | None:
    return caminho.read_text(encoding="utf-8") if caminho.is_file() else None


def _commit_do_carimbo(pasta: Path) -> str | None:
    texto = _ler_texto(pasta / ".sarak" / "base.json")
    try:
        return json.loads(texto).get("base_commit") if texto else None
    except ValueError:
        return None


def _referencia_no_commit(
    raiz: Path, commit: str, tmp: Path, sistema: dict
) -> dict | None:
    """Referencia gerada num worktree da base em `commit`; `None` se o commit nao abre."""
    arvore = tmp / f"base-{commit[:12]}"
    if not abrir_worktree(raiz, commit, arvore):
        return None
    try:
        escopo = escopo_do_pacote(
            _ler_texto(raiz / sistema["caminho"] / "package.json"), sistema["caminho"]
        )
        return gerar_referencia(arvore, tmp / f"ref-{commit[:12]}", sistema, escopo)
    finally:
        fechar_worktree(raiz, arvore)


def planejar_sistema(raiz: Path, sistema: dict, head: str) -> dict:
    """Casca: o plano de um sistema — referencias em temporario (apagado no fim), sistema so lido."""
    pasta = (raiz / sistema["caminho"]).resolve()
    saida = {
        "id": sistema["id"],
        "caminho": sistema["caminho"],
        "tipo": sistema["tipo"],
        "modular": sistema["modular"],
        "bindings": sistema["bindings"],
    }
    if not pasta.is_dir():
        return {**saida, "erro": f"caminho nao encontrado: {pasta}"}
    carimbo = _commit_do_carimbo(pasta)
    tmp = Path(tempfile.mkdtemp(prefix="sarak-propagar-"))
    try:
        ref = _referencia_no_commit(raiz, head, tmp, sistema)
        antiga = (
            (
                ref
                if carimbo == head
                else _referencia_no_commit(raiz, carimbo, tmp, sistema)
            )
            if carimbo
            else None
        )
        sistema_lido = ler_arvore(pasta)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if ref is None:
        return {**saida, "erro": "nao foi possivel abrir o HEAD da base num worktree"}
    contexto = {"bindings": sistema["bindings"]}
    return {
        **saida,
        "carimbo": carimbo,
        "carimbo_legivel": carimbo is None or antiga is not None,
        **planejar(ref, antiga, sistema_lido, contexto),
        "lacunas": lacunas(sorted(sistema_lido), contexto),
    }


# ------------------------------------------------------------------ casca: relatorio


def _lista(itens: list, limite: int = LIMITE_DE_LISTA) -> str:
    if len(itens) <= limite:
        return ", ".join(itens)
    return ", ".join(itens[:limite]) + f", … +{len(itens) - limite}"


def _linhas_do_plano(plano: dict) -> list:
    cabeca = f"=== {plano['id']} ({plano['tipo']}{', modular' if plano['modular'] else ''}, bindings {plano['bindings']}) — {plano['caminho']}"
    if "erro" in plano:
        return [cabeca, f"  [ERRO] {plano['erro']}"]
    linhas = [
        cabeca,
        f"  carimbo: {plano['carimbo'] or 'nenhum (modo adotar: universal diferente = divergente)'}",
    ]
    if plano.get("compartilha_repo_com"):
        linhas.append(
            f"  monorepo: compartilha o repositorio com {', '.join(plano['compartilha_repo_com'])}"
        )
    contagem = " · ".join(
        f"{acao} {len(plano['acoes'][acao])}" for acao in ORDEM_DAS_ACOES
    )
    linhas.append(f"  acoes: {contagem}")
    linhas += [
        f"    {acao}: {_lista(plano['acoes'][acao])}"
        for acao in ORDEM_DAS_ACOES[:-1]
        if plano["acoes"][acao]
    ]
    if plano["molde-mudou-na-base"]:
        linhas.append(
            f"    molde mudou na base (informativo): {_lista(plano['molde-mudou-na-base'])}"
        )
    return linhas + _linhas_de_lacunas(plano["lacunas"])


def _linhas_de_lacunas(falta: dict) -> list:
    linhas = []
    if falta["binding-sem-base"]:
        linhas.append(
            f"  lacuna: binding sem 00-base no sistema: {', '.join(falta['binding-sem-base'])}"
        )
    if falta["migracao-de-familias-pendente"]:
        itens = [c.rsplit("/", 1)[-1] for c in falta["migracao-de-familias-pendente"]]
        linhas.append(
            f"  lacuna: migracao de familias pendente ({len(itens)}): {_lista(itens, 5)}"
        )
    if falta["sem-planejamento"]:
        linhas.append("  lacuna: sem panorama/00-planejamento.md")
    return linhas


def consolidado(planos: list) -> list:
    validos = [p for p in planos if "erro" not in p]
    total = {
        acao: sum(len(p["acoes"][acao]) for p in validos) for acao in ORDEM_DAS_ACOES
    }
    linhas = [
        "",
        "=== CONSOLIDADO",
        f"  sistemas: {len(planos)} ({len(planos) - len(validos)} com erro)",
    ]
    linhas.append(
        "  " + " · ".join(f"{acao} {total[acao]}" for acao in ORDEM_DAS_ACOES)
    )
    for chave, rotulo in (
        ("binding-sem-base", "binding sem 00-base"),
        ("migracao-de-familias-pendente", "migracao de familias pendente"),
    ):
        com = [p["id"] for p in validos if p["lacunas"][chave]]
        linhas.append(f"  {rotulo}: {', '.join(com) or '—'}")
    linhas.append(
        f"  sem panorama/00-planejamento.md: {', '.join(p['id'] for p in validos if p['lacunas']['sem-planejamento']) or '—'}"
    )
    linhas.append(
        "  [NOTA] Isto e so o plano: aplicar ainda nao existe. Nenhum sistema foi escrito."
    )
    return linhas


# ------------------------------------------------------------------ casca: CLI


def _parser():
    parser = argparse.ArgumentParser(
        description="Plano de propagacao da base aos sistemas do mapa.json (somente leitura)."
    )
    parser.add_argument(
        "--plano", action="store_true", help="Gera o plano (unico modo desta versao)."
    )
    parser.add_argument("--id", help="So este sistema do mapa.")
    parser.add_argument("--json", action="store_true", help="Saida em JSON.")
    parser.add_argument(
        "--mapa", help="Outro mapa.json (teste). Padrao: o da raiz da base."
    )
    parser.add_argument(
        "--permitir-base-suja",
        action="store_true",
        help="So teste: a referencia vem do HEAD (worktree) e ignora alteracoes locais.",
    )
    return parser


def _sistemas(mapa: dict, ident: str | None) -> list:
    ativos = [
        s for s in mapa.get("sistemas", []) if s.get("situacao") != "adocao-posterior"
    ]
    return [s for s in ativos if s["id"] == ident] if ident else ativos


def _marcar_monorepos(planos: list, sistemas: list) -> None:
    for plano, sistema in zip(planos, sistemas, strict=True):
        irmaos = [
            s["id"]
            for s in sistemas
            if s["id"] != sistema["id"]
            and s.get("raiz_git")
            and s.get("raiz_git") == sistema.get("raiz_git")
        ]
        if irmaos:
            plano["compartilha_repo_com"] = irmaos


def _imprimir(planos: list, como_json: bool) -> None:
    if como_json:
        print(json.dumps(planos, indent=2, ensure_ascii=False))
        return
    for plano in planos:
        print("\n".join(_linhas_do_plano(plano)))
    print("\n".join(consolidado(planos)))


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if "--autoteste" in sys.argv[1:]:
        return autoteste()
    args, raiz = _parser().parse_args(), raiz_da_base()
    if not args.plano:
        print("[ERRO] use --plano (aplicar ainda nao existe)", file=sys.stderr)
        return 2
    if base_suja(raiz) and not args.permitir_base_suja:
        print(
            "[ERRO] a base tem alteracoes locais — o plano compara com o HEAD; commite ou descarte antes.",
            file=sys.stderr,
        )
        return 2
    mapa = json.loads(Path(args.mapa or raiz / "mapa.json").read_text(encoding="utf-8"))
    sistemas, head = _sistemas(mapa, args.id), _git(raiz, "rev-parse", "HEAD")
    planos = [planejar_sistema(raiz, sistema, head) for sistema in sistemas]
    _marcar_monorepos(planos, sistemas)
    _imprimir(planos, args.json)
    return 0


# ------------------------------------------------------------------ autoteste

CTX = {"bindings": ["typescript"]}


def _plano(ref: dict, antiga: dict | None, sistema: dict) -> dict:
    return planejar(ref, antiga, sistema, CTX)["acoes"]


def _caso_substituir_conflito_obsoleto() -> bool:
    acoes = _plano(
        {"tools/a.mjs": "novo", "tools/b.mjs": "novo"},
        {"tools/a.mjs": "velho", "tools/b.mjs": "velho"},
        {"tools/a.mjs": "velho", "tools/b.mjs": "editado", "tools/velho.mjs": "x"},
    )
    return acoes["substituir"] == ["tools/a.mjs"] and acoes["conflito"] == ["tools/b.mjs"] and acoes["obsoleto?"] == ["tools/velho.mjs"]


def _caso_molde_e_codigo() -> bool:
    acoes = _plano({"specs/00-contexto.md": "molde", "src/x.ts": "a"}, None, {"specs/00-contexto.md": "preenchido", "src/x.ts": "b"})
    listados = [rel for lista in acoes.values() for rel in lista]
    return acoes["nada"] == ["specs/00-contexto.md"] and "src/x.ts" not in listados


CASOS = [
    (
        "tools/ e universal",
        lambda: classificar("tools/gate/validate.mjs", CTX) == UNIVERSAL,
    ),
    (
        "prompt e universal",
        lambda: classificar("specs/00-prompt-revisor.md", CTX) == UNIVERSAL,
    ),
    (
        "lei do template e universal",
        lambda: classificar("specs/arquitetura/04-regras.md", CTX) == UNIVERSAL,
    ),
    (
        "adr 000 e universal; outro adr e molde",
        lambda: (
            classificar("specs/adr/000-decisoes-do-template.md", CTX) == UNIVERSAL
            and classificar("specs/adr/001-x.md", CTX) == MOLDE
        ),
    ),
    (
        "base do binding da lista e universal",
        lambda: (
            classificar("specs/arquitetura/00-base-typescript.md", CTX) == UNIVERSAL
        ),
    ),
    (
        "base de binding fora da lista e projeto",
        lambda: classificar("specs/arquitetura/00-base-python.md", CTX) == PROJETO,
    ),
    (
        "00-contexto, 00-indice e planejamento sao molde",
        lambda: (
            {
                classificar(c, CTX)
                for c in (
                    "specs/00-contexto.md",
                    "specs/00-indice.md",
                    "specs/panorama/00-planejamento.md",
                )
            }
            == {MOLDE}
        ),
    ),
    (
        "spec FF.NN e molde",
        lambda: (
            classificar("specs/arquitetura/02.01-dados.md", CTX) == MOLDE
            and classificar("specs/specs/01.01-x.md", CTX) == MOLDE
        ),
    ),
    (
        "00-resumo e gerado",
        lambda: classificar("specs/panorama/00-resumo.md", CTX) == GERADO,
    ),
    (
        "codigo e raiz do binding sao projeto",
        lambda: (
            {
                classificar(c, CTX)
                for c in (
                    "modules/a/x.ts",
                    "package.json",
                    "config/verification.json",
                    "AGENTS.md",
                    ".sarak/base.json",
                )
            }
            == {PROJETO}
        ),
    ),
    (
        "universal: ausente -> adicionar",
        lambda: decidir(UNIVERSAL, False, False, None) == "adicionar",
    ),
    (
        "universal: igual -> nada",
        lambda: decidir(UNIVERSAL, True, True, None) == "nada",
    ),
    (
        "universal: diferente, igual a antiga -> substituir",
        lambda: decidir(UNIVERSAL, True, False, True) == "substituir",
    ),
    (
        "universal: diferente da antiga -> conflito",
        lambda: decidir(UNIVERSAL, True, False, False) == "conflito",
    ),
    (
        "universal: diferente sem carimbo -> divergente",
        lambda: decidir(UNIVERSAL, True, False, None) == "divergente",
    ),
    (
        "universal: so no sistema -> obsoleto?",
        lambda: decidir(UNIVERSAL, True, None, None) == "obsoleto?",
    ),
    (
        "molde: ausente -> adicionar",
        lambda: decidir(MOLDE, False, False, None) == "adicionar",
    ),
    (
        "molde: preenchido -> nada (nunca tocar)",
        lambda: (
            decidir(MOLDE, True, False, False) == "nada"
            and decidir(MOLDE, True, False, None) == "nada"
        ),
    ),
    (
        "molde: molde antigo intocado e molde mudou -> reportar-molde",
        lambda: decidir(MOLDE, True, False, True) == "reportar-molde",
    ),
    (
        "molde: so no sistema -> nada (e do projeto)",
        lambda: decidir(MOLDE, True, None, None) == "nada",
    ),
    (
        "gerado -> regenerar; projeto -> fora",
        lambda: (
            decidir(GERADO, True, False, None) == "regenerar"
            and decidir(PROJETO, True, False, None) is None
        ),
    ),
    (
        "CRLF nao e diferenca",
        lambda: (
            _plano({"tools/a.mjs": "x\n"}, None, {"tools/a.mjs": "x\r\n"})["nada"]
            == ["tools/a.mjs"]
        ),
    ),
    ("plano: substituir, conflito e obsoleto?", _caso_substituir_conflito_obsoleto),
    ("plano: molde preenchido fica sem acao; codigo nunca listado", _caso_molde_e_codigo),
    (
        "molde que mudou na base e informado",
        lambda: (
            planejar(
                {"specs/00-indice.md": "novo"},
                {"specs/00-indice.md": "velho"},
                {"specs/00-indice.md": "meu"},
                CTX,
            )["molde-mudou-na-base"]
            == ["specs/00-indice.md"]
        ),
    ),
    (
        "lacunas: binding sem base, familias pendentes e sem planejamento",
        lambda: (
            lacunas(
                [
                    "specs/arquitetura/01-x.md",
                    "specs/arquitetura/04-regras.md",
                    "specs/plan/plan-07-y.md",
                    "specs/specs/02.01-ok.md",
                ],
                CTX,
            )
            == {
                "binding-sem-base": ["typescript"],
                "migracao-de-familias-pendente": [
                    "specs/arquitetura/01-x.md",
                    "specs/plan/plan-07-y.md",
                ],
                "sem-planejamento": True,
            }
        ),
    ),
    (
        "escopo: name do package.json, senao o nome da pasta",
        lambda: (
            escopo_do_pacote('{"name": "erp"}', "../Earendel/ERP") == "erp"
            and escopo_do_pacote(None, "../Earendel/ERP") == "erp"
            and escopo_do_pacote(None, "../ZP/Novo/") == "novo"
        ),
    ),
]


def autoteste() -> int:
    """Prova o nucleo com fixtures em memoria — sem git, sem disco."""
    falhas = [nome for nome, caso in CASOS if not caso()]
    for nome in falhas:
        print(f"[FALHA] {nome}", file=sys.stderr)
    print(
        f"propagar --autoteste: {len(CASOS) - len(falhas)}/{len(CASOS)} caso(s) verde"
    )
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
