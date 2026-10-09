"""propagar.py — o PLANO de propagacao da base aos sistemas do `mapa.json` (somente leitura).

    python propagar.py --plano [--id <id>] [--json] [--mapa <arquivo>] [--permitir-base-suja]
    python propagar.py --autoteste      prova o nucleo (classificar/decidir/planejar/adocao/lacunas)

Para cada sistema: o que mudaria, por que e com que risco. NADA e escrito em sistema nenhum — esta
versao nao tem modo de escrita, e o `--plano` nao escreve nem o `status` do `mapa.json` (quem o escreve
e o aplicar, que vem depois).

ARQUIVOS PERSONALIZADOS NUNCA SAO ALTERADOS — nem por este plano, nem pelo aplicar futuro: os moldes de
processo presentes no sistema (`00-contexto`, `00-indice`, `00-backlog`, `panorama/00-planejamento`) e
todo conteudo do projeto (`specs/specs/`, `specs/arquitetura/` fora dos nomes reservados, `specs/adr/`
exceto o 000, `specs/plan/`). Molde de processo AUSENTE e adicionado; conteudo ausente, nunca.

A ideia central: o sistema e comparado com uma INSTALACAO DE REFERENCIA — o que a base instalaria,
gerada numa pasta temporaria PELOS PROPRIOS INSTALADORES da base (`init_repo.py`, que chama o
`create-project.mjs`; `instalar_base_de_linguagem`; a copia de `_estrutura_base_site/`), com os
parametros do sistema, dentro de um `git worktree` do commit (HEAD, ou o do carimbo). Nunca se copia
arquivo cru: os instaladores reescrevem (nome, escopo, comandos do binding).

`specs/README.md` e `specs/INDEX.md` levam o nome do projeto no titulo: sao comparados SEM a primeira
linha `# ...`, e o aplicar futuro preserva o titulo do sistema.

Adocao por historico (sistema sem carimbo): um universal diferente da referencia e comparado com TODAS
as versoes da sua fonte na base (`git log -- <fonte>`). Igual a alguma -> `substituir` (versao antiga,
sem edicao local). Nenhuma igual -> `divergente`. Arquivo transformado pelo instalador nao tem fonte
direta e fica `divergente` ("sem fonte direta").

Nucleo x casca: `classificar`, `decidir`, `planejar`, `fonte_direta`, `versao_igual`, `adotar`,
`lacunas` e `escopo_do_pacote` sao PUROS — o `--autoteste` os prova. Git, temporarios e disco sao casca.
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

UNIVERSAL, LEI, PROCESSO, CONTEUDO, GERADO, GITKEEP, PROJETO = (
    "universal", "lei", "processo", "conteudo", "gerado", "gitkeep", "projeto",
)
BASE_DE_LINGUAGEM = "base-de-linguagem"  # universal SO se o binding esta na lista do sistema
SO_APP = "so-app"  # universal em app; em site, projeto (o site nao recebe .agents/)

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
#      .agents/skills/meta-create-skill e grava .agents/gerar_indice.py a cada execucao (so em app).
# Sem declaracao de posse do template -> PROJETO (fora da propagacao, nunca listado): o esqueleto de
# bindings/<b>/root (package.json, config/, src/, packages/, adapters/, scripts/, .githooks/),
# modules/_template e adapters/_template, AGENTS.md/CLAUDE.md (o init_repo so ANEXA) e .sarak/.
REGRAS = [
    (r"^tools/", UNIVERSAL),  # A, B
    (r"^\.agents/(gerar_indice\.py$|skills/meta-create-skill/)", SO_APP),  # F
    (r"^specs/.*/\.gitkeep$", GITKEEP),  # o instalador cria a pasta vazia; pasta com conteudo ja cumpre
    (r"^specs/panorama/00-resumo\.md$", GERADO),  # C
    (r"^specs/panorama/00-planejamento\.md$", PROCESSO),  # C, E
    (r"^specs/00-(contexto|indice|backlog)\.md$", PROCESSO),  # C
    (r"^specs/(00-knowledge|00-prompt-revisor|00-prompt-executor|README|INDEX)\.md$", UNIVERSAL),  # C
    (r"^specs/_templates/", UNIVERSAL),  # C
    (r"^specs/adr/000-decisoes-do-template\.md$", LEI),  # A, D
    (r"^specs/adr/", CONTEUDO),  # D
    (r"^specs/arquitetura/(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras|README)\.md$", LEI),  # A, E
    (r"^specs/arquitetura/00-base-(typescript|javascript|python)\.md$", BASE_DE_LINGUAGEM),  # E
    (r"^specs/(arquitetura|specs|plan)/", CONTEUDO),  # E
]
REGRAS_COMPILADAS = [(re.compile(padrao), categoria) for padrao, categoria in REGRAS]

# Fonte DIRETA de cada arquivo instalado por COPIA — (instalado, fonte na base, tipos, instalador). A
# primeira que casa vence; `{0}` e o grupo capturado. E o que a adocao por historico percorre.
FONTES = [
    (r"^tools/(.+)$", "specs/_estrutura_modulos/tools/{0}", ("app",), "create-project.mjs copiarTemplate (cpSync de tools/)"),
    (r"^\.agents/skills/meta-create-skill/(.+)$", "skills/meta-create-skill/{0}", ("app",), "init_repo.py instalar_estrutura_agents (copytree)"),
    (r"^specs/arquitetura/(00-arquitetura|02-contrato-e-dados|03-operacao)\.md$", "specs/_estrutura_modulos/doutrina/{0}.md", ("app",), "create-project.mjs instalarDoutrina (cpSync; sem marcador de escopo)"),
    (r"^specs/(.+)$", "specs/_estrutura_base/{0}", ("app",), "init_repo.py instalar_specs (copytree)"),
    (r"^specs/(.+)$", "specs/_estrutura_base_site/{0}", ("site",), "spec-site-fundacao (copia da arvore inteira)"),
]
# Arquivo TRANSFORMADO pelo instalador: sem fonte direta, a adocao nao o reconhece (fica divergente).
SEM_FONTE_DIRETA = [
    (r"^specs/arquitetura/README\.md$", "comandos do binding (create-project.mjs aplicarComandosDoMapa)"),
    (r"^specs/arquitetura/(01-modulo|04-regras)\.md$", "escopo aplicado (create-project.mjs aplicarEscopo)"),
    (r"^specs/adr/000-decisoes-do-template\.md$", "renomeado de doutrina/adr/decisoes.md, com escopo aplicado"),
    (r"^specs/arquitetura/00-base-[a-z]+\.md$", "titulo reescrito com o nome (init_repo.py instalar_base_de_linguagem)"),
    (r"^\.agents/gerar_indice\.py$", "embutido no init_repo.py (GERADOR_INDICE)"),
]
COM_TITULO_DO_PROJETO = ("specs/README.md", "specs/INDEX.md")

ACOES_LISTADAS = ("adicionar", "adicionar?", "substituir", "conflito", "divergente", "obsoleto?", "reportar-molde", "regenerar")
ORDEM_DAS_ACOES = (*ACOES_LISTADAS, "nada", "extra")
LEIS_RESERVADAS = ("arquitetura", "modulo", "contrato-e-dados", "operacao", "regras")
NOMES_RESERVADOS = re.compile(r"^(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras|00-base-[a-z]+|00-fundacao-tecnologica|README)\.md$")
SPEC_NN = re.compile(r"^(\d{2})-([a-z0-9][a-z0-9-]*)\.md$")
PLAN_NN = re.compile(r"^plan-\d+-[a-z0-9].*\.md$")
TITULO_DE_DOUTRINA = re.compile(r"^(#|titulo:).*(doutrina|funda[cç][aã]o)", re.IGNORECASE | re.MULTILINE)
PROXIMO_ESCALAR = re.compile(r'^proximo_numero_plan:\s*"?\d', re.MULTILINE)
AREAS_DO_SISTEMA = ("specs", "tools", ".agents")
PASTAS_IGNORADAS = {"node_modules", ".git", "__pycache__", ".ruff_cache", ".venv", "dist", "generated"}
LIMITE_DE_LISTA = 8


# ------------------------------------------------------------------ nucleo: classificar e decidir


def normalizar(texto: str) -> str:
    """Fim de linha nao e diferenca de conteudo: CRLF -> LF antes de comparar."""
    return texto.replace("\r\n", "\n")


def comparavel(rel: str, texto: str) -> str:
    """O texto como se compara: LF, e sem o titulo `# ...` em README/INDEX (levam o nome do projeto)."""
    texto = normalizar(texto)
    if rel in COM_TITULO_DO_PROJETO and texto.startswith("# "):
        return texto.split("\n", 1)[1] if "\n" in texto else ""
    return texto


def classificar(caminho: str, contexto: dict) -> str:
    """Nucleo: a categoria de um caminho relativo (com `/`). `contexto` = {tipo, bindings}."""
    for regra, categoria in REGRAS_COMPILADAS:
        achado = regra.match(caminho)
        if not achado:
            continue
        if categoria == BASE_DE_LINGUAGEM:
            return UNIVERSAL if achado.group(1) in contexto.get("bindings", []) else PROJETO
        if categoria == SO_APP:
            return UNIVERSAL if contexto.get("tipo") == "app" else PROJETO
        return categoria
    return PROJETO


def _decidir_universal(categoria: str, fatos: dict) -> str:
    if not fatos["na_ref"]:
        return "obsoleto?" if fatos["com_carimbo"] and fatos["na_antiga"] else "extra"
    if not fatos["existe"]:
        return "adicionar?" if categoria == LEI and not fatos["com_carimbo"] else "adicionar"
    if fatos["igual_ref"]:
        return "nada"
    if not fatos["com_carimbo"]:
        return "divergente"
    return "substituir" if fatos["igual_antiga"] else "conflito"


def _decidir_processo(fatos: dict) -> str:
    if not fatos["na_ref"]:
        return "nada"
    if not fatos["existe"]:
        return "adicionar"
    if not fatos["igual_ref"] and fatos["igual_antiga"]:
        return "reportar-molde"
    return "nada"


def decidir(categoria: str, fatos: dict) -> str | None:
    """Nucleo: a acao para um arquivo. `fatos` = {existe, na_ref, igual_ref, com_carimbo, na_antiga,
    igual_antiga}. Universal diferente sem carimbo e `divergente`; lei ausente sem carimbo e `adicionar?`
    (o projeto pode te-la com outro nome); conteudo e projeto nunca mudam."""
    if categoria in (UNIVERSAL, LEI):
        return _decidir_universal(categoria, fatos)
    if categoria == PROCESSO:
        return _decidir_processo(fatos)
    if categoria == GITKEEP:
        return "nada" if fatos["existe"] or not fatos["na_ref"] else "adicionar"
    if categoria == GERADO:
        return "regenerar"
    return "nada" if categoria == CONTEUDO else None


# ------------------------------------------------------------------ nucleo: planejar


def _pasta_com_conteudo(rel: str, sistema: dict) -> bool:
    pasta = rel.rsplit("/", 1)[0] + "/"
    return any(c.startswith(pasta) for c in sistema)


def _fatos(rel: str, refs: tuple, sistema: dict, categoria: str) -> dict:
    ref, antiga = refs
    existe = rel in sistema or (categoria == GITKEEP and _pasta_com_conteudo(rel, sistema))
    texto = comparavel(rel, sistema[rel]) if rel in sistema else None
    return {
        "existe": existe,
        "na_ref": rel in ref,
        "igual_ref": rel in ref and texto == comparavel(rel, ref[rel]),
        "com_carimbo": antiga is not None,
        "na_antiga": antiga is not None and rel in antiga,
        "igual_antiga": antiga is not None and rel in antiga and texto == comparavel(rel, antiga[rel]),
    }


def planejar(ref: dict, antiga: dict | None, sistema: dict, contexto: dict) -> dict:
    """Nucleo: `{acao: [caminhos]}` + `molde-mudou-na-base`, dados os `{rel: texto}` da referencia
    atual, da do carimbo (`None` = sem carimbo) e do sistema."""
    acoes = {acao: [] for acao in ORDEM_DAS_ACOES}
    for rel in sorted(set(ref) | set(sistema)):
        categoria = classificar(rel, contexto)
        acao = decidir(categoria, _fatos(rel, (ref, antiga), sistema, categoria))
        if acao and (rel in ref or acao in ("obsoleto?", "extra")):
            acoes[acao].append(rel)
    mudou = [
        rel for rel in sorted(ref)
        if antiga is not None and classificar(rel, contexto) == PROCESSO and rel in antiga
        and normalizar(antiga[rel]) != normalizar(ref[rel])
    ]
    return {"acoes": acoes, "molde-mudou-na-base": mudou}


# ------------------------------------------------------------------ nucleo: adocao por historico


def fonte_direta(rel: str, tipo: str) -> tuple:
    """Nucleo: `(fonte, None)` se o arquivo e copia direta de um arquivo da base, ou `(None, motivo)`."""
    for padrao, motivo in SEM_FONTE_DIRETA:
        if re.match(padrao, rel):
            return None, motivo
    for padrao, molde, tipos, _instalador in FONTES:
        achado = re.match(padrao, rel)
        if achado and tipo in tipos:
            return molde.format(*achado.groups()), None
    return None, "nenhum instalador copia este caminho"


def versao_igual(rel: str, texto: str, versoes: list) -> str | None:
    """Nucleo: o commit da primeira versao da fonte igual ao arquivo do sistema, ou `None`."""
    alvo = comparavel(rel, texto)
    return next((commit for commit, versao in versoes if comparavel(rel, versao) == alvo), None)


def adotar(plano: dict, sistema: dict, versoes: dict) -> dict:
    """Nucleo: reclassifica os `divergente` pela historia. `versoes` = {rel: [(commit, texto)] ou o
    motivo (str) de nao haver fonte direta}. Devolve o plano com `adocao`, `sem-fonte-direta` e
    `sem-versao-igual`."""
    adocao, sem_fonte, sem_versao, ainda = {}, {}, [], []
    for rel in plano["acoes"]["divergente"]:
        disponiveis = versoes.get(rel)
        if isinstance(disponiveis, str):
            sem_fonte[rel] = disponiveis
            ainda.append(rel)
            continue
        commit = versao_igual(rel, sistema[rel], disponiveis or [])
        if commit:
            adocao[rel] = commit
        else:
            sem_versao.append(rel)
            ainda.append(rel)
    acoes = {**plano["acoes"], "divergente": ainda, "substituir": sorted(plano["acoes"]["substituir"] + list(adocao))}
    return {**plano, "acoes": acoes, "adocao": adocao, "sem-fonte-direta": sem_fonte, "sem-versao-igual": sem_versao}


# ------------------------------------------------------------------ nucleo: lacunas


def _lei_ou_fundacao(nome: str, texto: str) -> bool:
    """Heuristica DECLARADA: fora dos reservados e (comeca por `00-`, ou o slug sem numero comeca pelo de
    uma lei reservada, ou o titulo fala em doutrina/fundacao)."""
    if NOMES_RESERVADOS.match(nome):
        return False
    achado = SPEC_NN.match(nome)
    slug = achado.group(2) if achado else ""
    return nome.startswith("00-") or slug.startswith(LEIS_RESERVADAS) or bool(TITULO_DE_DOUTRINA.search(texto[:600]))


def lacunas(sistema: dict, contexto: dict) -> dict:
    """Nucleo: o que falta ou esta fora do padrao — trabalho de uma plan do revisor, nunca da propagacao."""
    arquitetura = {c: t for c, t in sistema.items() if re.match(r"^specs/arquitetura/[^/]+$", c)}
    lei = sorted(c for c, t in arquitetura.items() if _lei_ou_fundacao(c.rsplit("/", 1)[-1], t))
    conteudo = [c for c in sistema if re.match(r"^specs/(specs|arquitetura)/[^/]+$", c) and c not in lei]
    antigas = sorted(c for c in conteudo if SPEC_NN.match(c.rsplit("/", 1)[-1]) and not NOMES_RESERVADOS.match(c.rsplit("/", 1)[-1]))
    plans = sorted(c for c in sistema if c.startswith("specs/plan/") and PLAN_NN.match(c.rsplit("/", 1)[-1]))
    indice = sistema.get("specs/00-indice.md", "")
    return {
        "lei-ou-fundacao-fora-do-reservado": lei,
        "migracao-de-familias-pendente": antigas + plans,
        "molde-em-formato-antigo": ["specs/00-indice.md (proximo_numero_plan escalar)"] if PROXIMO_ESCALAR.search(indice) else [],
        "binding-sem-base": [b for b in contexto.get("bindings", []) if f"specs/arquitetura/00-base-{b}.md" not in sistema],
        "sem-planejamento": "specs/panorama/00-planejamento.md" not in sistema,
    }


def escopo_do_pacote(texto_package_json: str | None, caminho: str) -> str:
    """Nucleo: o escopo que o instalador usou — o `name` do package.json da raiz (onde o
    create-project grava `<escopo>`); sem ele, o padrao do proprio create-project (nome da pasta)."""
    try:
        nome = json.loads(texto_package_json or "{}").get("name")
    except ValueError:
        nome = None
    return nome if isinstance(nome, str) and nome else os.path.basename(caminho.rstrip("/")).lower()


# ------------------------------------------------------------------ casca: git e temporarios


def raiz_da_base() -> Path:
    return Path(__file__).resolve().parents[3]


def _rodar(comando: list, entrada: bytes | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(comando, input=entrada, capture_output=True, check=False)


def _git(raiz: Path, *args) -> str | None:
    r = _rodar(["git", "-C", str(raiz), *args])
    return r.stdout.decode("utf-8", errors="replace").strip() if r.returncode == 0 else None


def base_suja(raiz: Path) -> bool:
    return bool(_git(raiz, "status", "--porcelain"))


def abrir_worktree(raiz: Path, commit: str, destino: Path) -> bool:
    return _rodar(["git", "-C", str(raiz), "worktree", "add", "--detach", str(destino), commit]).returncode == 0


def fechar_worktree(raiz: Path, destino: Path) -> None:
    _rodar(["git", "-C", str(raiz), "worktree", "remove", "--force", str(destino)])
    _rodar(["git", "-C", str(raiz), "worktree", "prune"])


def _blobs_da_fonte(raiz: Path, fonte: str) -> list:
    """`[(commit, blob)]` de cada versao da fonte no historico da base (mais nova primeiro)."""
    saida, commit, pares = _git(raiz, "log", "--format=%H", "--raw", "--no-abbrev", "--", fonte) or "", None, []
    for linha in saida.splitlines():
        if re.fullmatch(r"[0-9a-f]{40}", linha):
            commit = linha
        elif linha.startswith(":") and commit:
            blob = linha.split("\t")[0].split()[3]
            pares += [] if set(blob) == {"0"} else [(commit, blob)]
    return pares


def _conteudos(raiz: Path, blobs: list) -> dict:
    """`{blob: texto}` lidos de uma vez por `git cat-file --batch`."""
    r = _rodar(["git", "-C", str(raiz), "cat-file", "--batch"], "".join(f"{b}\n" for b in blobs).encode())
    saida, pos, textos = r.stdout, 0, {}
    while pos < len(saida):
        fim = saida.index(b"\n", pos)
        sha, _tipo, tamanho = saida[pos:fim].decode().split()
        textos[sha] = saida[fim + 1 : fim + 1 + int(tamanho)].decode("utf-8", errors="replace")
        pos = fim + 1 + int(tamanho) + 1
    return textos


def versoes_da_fonte(raiz: Path, fonte: str, cache: dict) -> list:
    """Casca: `[(commit, texto)]` da fonte, com cache por execucao."""
    if fonte not in cache:
        pares = _blobs_da_fonte(raiz, fonte)
        textos = _conteudos(raiz, sorted({b for _, b in pares})) if pares else {}
        cache[fonte] = [(commit, textos[blob]) for commit, blob in pares if blob in textos]
    return cache[fonte]


# ------------------------------------------------------------------ casca: referencia


def _instalar_bases(arvore: Path, alvo: Path, sistema: dict) -> None:
    """Os `00-base-<binding>.md` de TODOS os bindings, pela funcao do proprio init_repo daquela arvore
    (subprocesso: cada arvore importa o SEU init_repo, sem cache entre versoes)."""
    scripts = arvore / "skills" / "meta-iniciar-repositorio" / "scripts"
    codigo = (
        "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); import init_repo; "
        "init_repo.instalar_base_de_linguagem(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4], sys.argv[5])"
    )
    for binding in sistema["bindings"]:
        _rodar([sys.executable, "-c", codigo, str(scripts), str(alvo), str(arvore), binding, sistema["nome"]])


def _instalar_app(arvore: Path, alvo: Path, sistema: dict, escopo: str) -> None:
    script = arvore / "skills" / "meta-iniciar-repositorio" / "scripts" / "init_repo.py"
    comando = [sys.executable, str(script), "--target", str(alvo), "--name", sistema["nome"]]
    if sistema["modular"] and sistema["bindings"]:
        comando += ["--binding", sistema["bindings"][0], "--escopo", escopo]
    _rodar(comando)


def gerar_referencia(arvore: Path, alvo: Path, sistema: dict, escopo: str) -> dict:
    """Casca: instala, com os instaladores de `arvore`, o que a base instalaria neste sistema."""
    alvo.mkdir(parents=True, exist_ok=True)
    if sistema["tipo"] == "site":
        shutil.copytree(arvore / "specs" / "_estrutura_base_site", alvo / "specs", dirs_exist_ok=True)
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
                arquivos[caminho.relative_to(raiz).as_posix()] = caminho.read_text(encoding="utf-8", errors="replace")
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


def _referencia_no_commit(raiz: Path, commit: str, tmp: Path, sistema: dict) -> dict | None:
    """Referencia gerada num worktree da base em `commit`; `None` se o commit nao abre."""
    arvore = tmp / f"base-{commit[:12]}"
    if not abrir_worktree(raiz, commit, arvore):
        return None
    try:
        escopo = escopo_do_pacote(_ler_texto(raiz / sistema["caminho"] / "package.json"), sistema["caminho"])
        return gerar_referencia(arvore, tmp / f"ref-{commit[:12]}", sistema, escopo)
    finally:
        fechar_worktree(raiz, arvore)


def _referencias(raiz: Path, sistema: dict, head: str, carimbo: str | None) -> tuple:
    tmp = Path(tempfile.mkdtemp(prefix="sarak-propagar-"))
    try:
        ref = _referencia_no_commit(raiz, head, tmp, sistema)
        antiga = (ref if carimbo == head else _referencia_no_commit(raiz, carimbo, tmp, sistema)) if carimbo else None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return ref, antiga


def _versoes_dos_divergentes(raiz: Path, plano: dict, tipo: str, cache: dict) -> dict:
    versoes = {}
    for rel in plano["acoes"]["divergente"]:
        fonte, motivo = fonte_direta(rel, tipo)
        versoes[rel] = motivo if fonte is None else versoes_da_fonte(raiz, fonte, cache)
    return versoes


def _cabecalho(sistema: dict, carimbo: str | None, head: str) -> dict:
    return {
        "id": sistema["id"], "caminho": sistema["caminho"], "tipo": sistema["tipo"], "modular": sistema["modular"],
        "bindings": sistema["bindings"], "status": sistema.get("status"), "status_base": sistema.get("status_base"),
        "carimbo": carimbo, "atras_do_head": None if carimbo is None else carimbo != head,
    }


def planejar_sistema(raiz: Path, sistema: dict, head: str, cache: dict) -> dict:
    """Casca: o plano de um sistema — referencias em temporario (apagado no fim), sistema so lido."""
    pasta = (raiz / sistema["caminho"]).resolve()
    if not pasta.is_dir():
        return {**_cabecalho(sistema, None, head), "erro": f"caminho nao encontrado: {pasta}"}
    carimbo = _commit_do_carimbo(pasta)
    ref, antiga = _referencias(raiz, sistema, head, carimbo)
    if ref is None:
        return {**_cabecalho(sistema, carimbo, head), "erro": "nao foi possivel abrir o HEAD da base num worktree"}
    lido, contexto = ler_arvore(pasta), {"tipo": sistema["tipo"], "bindings": sistema["bindings"]}
    plano = planejar(ref, antiga, lido, contexto)
    plano = adotar(plano, lido, _versoes_dos_divergentes(raiz, plano, sistema["tipo"], cache)) if antiga is None else plano
    return {**_cabecalho(sistema, carimbo, head), **plano, "lacunas": lacunas(lido, contexto)}


# ------------------------------------------------------------------ casca: relatorio


def _lista(itens: list, limite: int = LIMITE_DE_LISTA) -> str:
    if len(itens) <= limite:
        return ", ".join(itens)
    return ", ".join(itens[:limite]) + f", … +{len(itens) - limite}"


def _com_nota(rel: str, plano: dict) -> str:
    commit = plano.get("adocao", {}).get(rel)
    return f"{rel} (adoção: idêntico à base em {commit[:7]})" if commit else rel


def _linhas_de_cabecalho(plano: dict) -> list:
    tipo = f"{plano['tipo']}{', modular' if plano['modular'] else ''}"
    atras = {None: "—", True: "sim", False: "não"}[plano.get("atras_do_head")]
    linhas = [f"=== {plano['id']} ({tipo}, bindings {plano['bindings']}) — {plano['caminho']}",
              f"  status: {plano.get('status')} ({plano.get('status_base') or '—'})",
              f"  carimbo: {plano.get('carimbo') or 'nenhum'} · atrás do HEAD: {atras}"]
    if plano.get("compartilha_repo_com"):
        linhas.append(f"  monorepo: compartilha o repositorio com {', '.join(plano['compartilha_repo_com'])}")
    return linhas


def _linhas_do_plano(plano: dict) -> list:
    linhas = _linhas_de_cabecalho(plano)
    if "erro" in plano:
        return [*linhas, f"  [ERRO] {plano['erro']}"]
    acoes = plano["acoes"]
    linhas.append("  acoes: " + " · ".join(f"{a} {len(acoes[a])}" for a in ACOES_LISTADAS + ("nada",)) + f" · extras do projeto {len(acoes['extra'])}")
    linhas += [f"    {a}: {_lista([_com_nota(r, plano) for r in acoes[a]])}" for a in ACOES_LISTADAS if acoes[a]]
    if plano.get("sem-fonte-direta"):
        linhas.append(f"    divergente sem fonte direta: {_lista(list(plano['sem-fonte-direta']))}")
    if plano.get("sem-versao-igual"):
        linhas.append(f"    divergente sem versão igual no histórico: {_lista(plano['sem-versao-igual'])}")
    if plano["molde-mudou-na-base"]:
        linhas.append(f"    molde mudou na base (informativo): {_lista(plano['molde-mudou-na-base'])}")
    return linhas + _linhas_de_lacunas(plano["lacunas"])


ROTULOS_DE_LACUNA = {
    "lei-ou-fundacao-fora-do-reservado": "lei/fundação com nome fora do reservado",
    "migracao-de-familias-pendente": "migração de famílias pendente",
    "molde-em-formato-antigo": "molde em formato antigo",
    "binding-sem-base": "binding sem 00-base",
}


def _linhas_de_lacunas(falta: dict) -> list:
    linhas = []
    for chave, rotulo in ROTULOS_DE_LACUNA.items():
        itens = [c.rsplit("/", 1)[-1] for c in falta[chave]]
        if itens:
            linhas.append(f"  lacuna: {rotulo} ({len(itens)}): {_lista(itens, 5)}")
    if falta["sem-planejamento"]:
        linhas.append("  lacuna: sem panorama/00-planejamento.md")
    return linhas


def consolidado(planos: list) -> list:
    validos = [p for p in planos if "erro" not in p]
    total = {acao: sum(len(p["acoes"][acao]) for p in validos) for acao in ORDEM_DAS_ACOES}
    linhas = ["", "=== CONSOLIDADO", f"  sistemas: {len(planos)} ({len(planos) - len(validos)} com erro)"]
    linhas.append("  " + " · ".join(f"{a} {total[a]}" for a in ACOES_LISTADAS + ("nada",)) + f" · extras do projeto {total['extra']}")
    linhas.append(f"  adoção por histórico: {sum(len(p.get('adocao', {})) for p in validos)} substituir reconhecidos")
    for chave, rotulo in ROTULOS_DE_LACUNA.items():
        linhas.append(f"  {rotulo}: {', '.join(p['id'] for p in validos if p['lacunas'][chave]) or '—'}")
    linhas.append(f"  sem panorama/00-planejamento.md: {', '.join(p['id'] for p in validos if p['lacunas']['sem-planejamento']) or '—'}")
    linhas.append("  [NOTA] Isto e so o plano: aplicar ainda nao existe. Nenhum sistema (nem o mapa) foi escrito.")
    return linhas


# ------------------------------------------------------------------ casca: CLI


def _parser():
    parser = argparse.ArgumentParser(description="Plano de propagacao da base aos sistemas do mapa.json (somente leitura).")
    parser.add_argument("--plano", action="store_true", help="Gera o plano (unico modo desta versao).")
    parser.add_argument("--id", help="So este sistema do mapa.")
    parser.add_argument("--json", action="store_true", help="Saida em JSON.")
    parser.add_argument("--mapa", help="Outro mapa.json (teste). Padrao: o da raiz da base.")
    parser.add_argument("--permitir-base-suja", action="store_true", help="So teste: a referencia vem do HEAD (worktree) e ignora alteracoes locais.")
    return parser


def _sistemas(mapa: dict, ident: str | None) -> list:
    ativos = [s for s in mapa.get("sistemas", []) if s.get("situacao") != "adocao-posterior"]
    return [s for s in ativos if s["id"] == ident] if ident else ativos


def _marcar_monorepos(planos: list, sistemas: list) -> None:
    for plano, sistema in zip(planos, sistemas, strict=True):
        irmaos = [s["id"] for s in sistemas if s["id"] != sistema["id"] and s.get("raiz_git") and s.get("raiz_git") == sistema.get("raiz_git")]
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
        print("[ERRO] a base tem alteracoes locais — o plano compara com o HEAD; commite ou descarte antes.", file=sys.stderr)
        return 2
    mapa = json.loads(Path(args.mapa or raiz / "mapa.json").read_text(encoding="utf-8"))
    sistemas, head, cache = _sistemas(mapa, args.id), _git(raiz, "rev-parse", "HEAD"), {}
    planos = [planejar_sistema(raiz, sistema, head, cache) for sistema in sistemas]
    _marcar_monorepos(planos, sistemas)
    _imprimir(planos, args.json)
    return 0


# ------------------------------------------------------------------ autoteste

APP = {"tipo": "app", "bindings": ["typescript"]}
SITE = {"tipo": "site", "bindings": []}
SEM, COM = None, {}  # referencia antiga: sem carimbo / com carimbo (vazia)


def _acoes(ref: dict, antiga: dict | None, sistema: dict, contexto: dict = APP) -> dict:
    return planejar(ref, antiga, sistema, contexto)["acoes"]


def _caso_carimbo() -> bool:
    a = _acoes({"tools/a.mjs": "novo", "tools/b.mjs": "novo"}, {"tools/a.mjs": "velho", "tools/b.mjs": "velho", "tools/x.mjs": "v"},
               {"tools/a.mjs": "velho", "tools/b.mjs": "editado", "tools/x.mjs": "v", "tools/meu.mjs": "p"})
    return a["substituir"] == ["tools/a.mjs"] and a["conflito"] == ["tools/b.mjs"] and a["obsoleto?"] == ["tools/x.mjs"] and a["extra"] == ["tools/meu.mjs"]


def _caso_sem_carimbo() -> bool:
    a = _acoes({"tools/a.mjs": "novo", "specs/arquitetura/04-regras.md": "lei", "specs/00-knowledge.md": "k"}, SEM, {"tools/a.mjs": "velho", "tools/meu.mjs": "p"})
    return a["divergente"] == ["tools/a.mjs"] and a["adicionar?"] == ["specs/arquitetura/04-regras.md"] and a["adicionar"] == ["specs/00-knowledge.md"] and a["obsoleto?"] == [] and a["extra"] == ["tools/meu.mjs"]


def _caso_moldes() -> bool:
    ref = {"specs/00-contexto.md": "m", "specs/00-indice.md": "m", "specs/specs/03.01-x.md": "m", "specs/arquitetura/01.01-y.md": "m"}
    a = _acoes(ref, SEM, {"specs/00-contexto.md": "preenchido"}, SITE)
    return a["adicionar"] == ["specs/00-indice.md"] and sorted(a["nada"]) == ["specs/00-contexto.md", "specs/arquitetura/01.01-y.md", "specs/specs/03.01-x.md"]


def _caso_titulo_e_gitkeep() -> bool:
    ref = {"specs/INDEX.md": "# Mapa: Ref\ncorpo\n", "specs/adr/.gitkeep": "", "specs/plan/.gitkeep": ""}
    a = _acoes(ref, SEM, {"specs/INDEX.md": "# Mapa: Meu Sistema\r\ncorpo\r\n", "specs/adr/001-x.md": "d"})
    return a["nada"] == ["specs/INDEX.md", "specs/adr/.gitkeep"] and a["adicionar"] == ["specs/plan/.gitkeep"]


def _caso_adocao() -> bool:
    plano = {"acoes": {**{a: [] for a in ORDEM_DAS_ACOES}, "divergente": ["tools/a.mjs", "tools/b.mjs", "specs/arquitetura/README.md"]}}
    sistema = {"tools/a.mjs": "v1\r\n", "tools/b.mjs": "editado", "specs/arquitetura/README.md": "x"}
    versoes = {"tools/a.mjs": [("c2" * 20, "v2\n"), ("c1" * 20, "v1\n")], "tools/b.mjs": [("c1" * 20, "v1\n")], "specs/arquitetura/README.md": "comandos do binding"}
    r = adotar(plano, sistema, versoes)
    return r["acoes"]["substituir"] == ["tools/a.mjs"] and r["adocao"] == {"tools/a.mjs": "c1" * 20} and r["acoes"]["divergente"] == ["tools/b.mjs", "specs/arquitetura/README.md"] and r["sem-versao-igual"] == ["tools/b.mjs"] and list(r["sem-fonte-direta"]) == ["specs/arquitetura/README.md"]


def _caso_lacunas() -> bool:
    sistema = {"specs/arquitetura/00-arquitetura-erp.md": "x", "specs/arquitetura/05-regras-e-gate.md": "x", "specs/arquitetura/02-interface.md": "x",
               "specs/arquitetura/01-modulo.md": "lei", "specs/arquitetura/00-fundacao-tecnologica.md": "f", "specs/specs/03-login.md": "x", "specs/plan/plan-07-y.md": "x", "specs/00-indice.md": 'proximo_numero_plan: "05"\n'}
    f = lacunas(sistema, APP)
    return (f["lei-ou-fundacao-fora-do-reservado"] == ["specs/arquitetura/00-arquitetura-erp.md", "specs/arquitetura/05-regras-e-gate.md"]
            and f["migracao-de-familias-pendente"] == ["specs/arquitetura/02-interface.md", "specs/specs/03-login.md", "specs/plan/plan-07-y.md"]
            and f["molde-em-formato-antigo"] and f["binding-sem-base"] == ["typescript"] and f["sem-planejamento"])


CASOS = [
    ("tools/ e universal; lei e lei; ADR 000 e lei", lambda: classificar("tools/x.mjs", APP) == UNIVERSAL and classificar("specs/arquitetura/04-regras.md", APP) == LEI and classificar("specs/adr/000-decisoes-do-template.md", APP) == LEI),
    ("moldes de processo e conteudo", lambda: classificar("specs/00-indice.md", APP) == PROCESSO and classificar("specs/specs/03.01-x.md", SITE) == CONTEUDO and classificar("specs/adr/001-x.md", APP) == CONTEUDO),
    (".agents e universal em app e projeto em site", lambda: classificar(".agents/gerar_indice.py", APP) == UNIVERSAL and classificar(".agents/gerar_indice.py", SITE) == PROJETO),
    ("base do binding da lista e universal; outra e projeto", lambda: classificar("specs/arquitetura/00-base-typescript.md", APP) == UNIVERSAL and classificar("specs/arquitetura/00-base-python.md", APP) == PROJETO),
    ("gitkeep, gerado e codigo", lambda: classificar("specs/plan/.gitkeep", APP) == GITKEEP and classificar("specs/panorama/00-resumo.md", APP) == GERADO and classificar("src/x.ts", APP) == PROJETO),
    ("com carimbo: substituir, conflito, obsoleto? e extra", _caso_carimbo),
    ("sem carimbo: divergente, adicionar? (lei), adicionar, sem obsoleto?", _caso_sem_carimbo),
    ("molde de processo ausente e adicionado; conteudo nunca", _caso_moldes),
    ("README/INDEX sem o titulo; gitkeep so em pasta vazia", _caso_titulo_e_gitkeep),
    ("adocao: versao antiga reconhecida, edicao local e sem fonte direta", _caso_adocao),
    ("lacunas: lei fora do reservado, familias, formato antigo, base, planejamento", _caso_lacunas),
    ("molde antigo intocado e molde mudou -> reportar-molde", lambda: _acoes({"specs/00-indice.md": "novo"}, {"specs/00-indice.md": "velho"}, {"specs/00-indice.md": "velho"})["reportar-molde"] == ["specs/00-indice.md"]),
    ("fonte direta: copia, transformado e site", lambda: fonte_direta("tools/gate/a.mjs", "app") == ("specs/_estrutura_modulos/tools/gate/a.mjs", None)
     and fonte_direta("specs/arquitetura/01-modulo.md", "app")[0] is None and fonte_direta("specs/00-knowledge.md", "site") == ("specs/_estrutura_base_site/00-knowledge.md", None)),
    ("escopo: name do package.json, senao a pasta", lambda: escopo_do_pacote('{"name": "erp"}', "../Earendel/ERP") == "erp" and escopo_do_pacote(None, "../ZP/Novo/") == "novo"),
    ("titulo ignorado so em README/INDEX", lambda: comparavel("specs/INDEX.md", "# A\nx") == "x" and comparavel("specs/00-knowledge.md", "# A\nx") == "# A\nx"),
]


def autoteste() -> int:
    """Prova o nucleo com fixtures em memoria — sem git, sem disco."""
    falhas = [nome for nome, caso in CASOS if not caso()]
    for nome in falhas:
        print(f"[FALHA] {nome}", file=sys.stderr)
    print(f"propagar --autoteste: {len(CASOS) - len(falhas)}/{len(CASOS)} caso(s) verde")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
