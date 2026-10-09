"""propagar.py — o PLANO e a CLI da propagacao da base aos sistemas do `mapa.json`.

    python propagar.py --plano [--id <id>] [--json] [--mapa <arquivo>] [--permitir-base-suja]
    python propagar.py --relatorio [--id <id>] [--mapa <arquivo>] [--permitir-base-suja]
    python propagar.py --aplicar --id <id> [--id <id> ...] [--incluir-divergentes] [--incluir-adicionar?] [--mapa <arquivo>]
                       [--adotar <caminho> ...] [--manter <caminho> --motivo "<texto>" ...]
    python propagar.py --desfazer --id <id> [--id <id> ...] [--mapa <arquivo>]
    python propagar.py --autoteste      prova o nucleo do plano, do aplicar/desfazer (`aplicacao.py`) e do relatorio

O `--plano` e o `--relatorio` sao somente leitura (nem o `status` do mapa eles escrevem). O `--relatorio`
(`relatorio.py`) e o resumo objetivo para o HITL de selecao: a atualizacao direta e as plans propostas. O
`--aplicar` e o `--desfazer` vivem em `aplicacao.py`: escrevem no sistema, no branch CORRENTE (nao criam
branch), SEM commit, com manifesto.

ARQUIVOS PERSONALIZADOS NUNCA SAO ALTERADOS — nem pelo plano, nem pelo aplicar: os moldes de processo
presentes no sistema (`00-contexto`, `00-indice`, `00-backlog`, `panorama/00-planejamento`) e todo
conteudo do projeto (`specs/specs/`, `specs/arquitetura/` fora dos nomes reservados, `specs/adr/`
exceto o 000, `specs/plan/`). Molde de processo AUSENTE e adicionado; conteudo ausente, nunca.

A ideia central: o sistema e comparado com uma INSTALACAO DE REFERENCIA — o que a base instalaria,
gerada numa pasta temporaria PELOS PROPRIOS INSTALADORES da base (`init_repo.py`, que chama o
`create-project.mjs`; `instalar_base_de_linguagem`; a copia de `_estrutura_base_site/`), com os
parametros do sistema, dentro de um `git worktree` do commit (HEAD, ou o do carimbo).

Decisao por arquivo: `--adotar` aplica so aquele `divergente`/`conflito`; `--manter ... --motivo` nao o escreve e
o registra em `mantidos` no carimbo `.sarak/base.json` com o sha1 do conteudo NORMALIZADO (CRLF -> LF, sem as
linhas de titulo) do sistema e da referencia. No plano, um `mantidos` cujos dois sha1 seguem iguais aos atuais
e a acao `mantido` (sem pendencia); se o projeto editou de novo ou a base mudou a fonte, a decisao VENCEU e
o arquivo volta a `divergente`/`conflito`.

Titulo do projeto: `specs/README.md`/`specs/INDEX.md` (o H1) e `specs/arquitetura/00-base-*.md` (a linha
`titulo:` do frontmatter e o H1) levam o nome do projeto — sao comparados SEM essas linhas, e o aplicar
escreve o corpo da referencia preservando as linhas de titulo do sistema.

Adocao por historico (sistema sem carimbo): um universal diferente da referencia e comparado com TODAS
as versoes da sua fonte na base (`git log -- <fonte>`). Igual a alguma -> `substituir`. Na doutrina, onde
o `create-project.mjs` aplica o escopo, o escopo do sistema e trocado pelo MARCADOR do proprio
`create-project.mjs` antes de comparar (normalizacao, nao reimplementacao). Sem versao igual: em
`tools/` de sistema modular -> `substituir-politica` (ADR-009: vendorizado); fora dele -> `divergente`.

Nucleo x casca: `classificar`, `decidir`, `planejar`, `fonte_direta`, `versao_igual`, `adotar`,
`politica`, `travar`, `lacunas`, `marcador_de_escopo`, `escopo_do_pacote`, `sha1_comparavel`,
`separar_mantidos` e `aplicar_mantidos` sao PUROS — o `--autoteste`
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

# Fonte de cada arquivo instalado — (instalado, fonte na base, tipos, instalador). A primeira que casa
# vence; `{0}` e o grupo capturado. E o que a adocao por historico percorre.
FONTES = [
    (r"^tools/(.+)$", "specs/_estrutura_modulos/tools/{0}", ("app",), "create-project.mjs copiarTemplate (cpSync de tools/)"),
    (r"^\.agents/skills/meta-create-skill/(.+)$", "skills/meta-create-skill/{0}", ("app",), "init_repo.py instalar_estrutura_agents (copytree)"),
    (r"^specs/arquitetura/(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras)\.md$", "specs/_estrutura_modulos/doutrina/{0}.md", ("app",), "create-project.mjs instalarDoutrina (cpSync + aplicarEscopo)"),
    (r"^specs/adr/000-decisoes-do-template\.md$", "specs/_estrutura_modulos/doutrina/adr/decisoes.md", ("app",), "create-project.mjs instalarDoutrina (renomeia + aplicarEscopo)"),
    (r"^specs/arquitetura/(00-base-[a-z]+\.md)$", "specs/_bases_arquiteturais/{0}", ("app", "site"), "init_repo.py instalar_base_de_linguagem (reescreve o titulo)"),
    (r"^specs/(.+)$", "specs/_estrutura_base/{0}", ("app",), "init_repo.py instalar_specs (copytree)"),
    (r"^specs/(.+)$", "specs/_estrutura_base_site/{0}", ("site",), "spec-site-fundacao (copia da arvore inteira)"),
]
# Fonte onde o `create-project.mjs` aplica o escopo: `aplicarEscopo` percorre PASTAS_COM_MARCADOR_ESCOPO,
# que inclui `specs/` — e, quando ele roda, so a doutrina esta em specs/ (o init_repo instala as specs depois).
FONTE_COM_ESCOPO = "specs/_estrutura_modulos/doutrina/"
CREATE_PROJECT = "specs/_estrutura_modulos/tools/create-project.mjs"
# Arquivo TRANSFORMADO pelo instalador de um jeito que a comparacao nao normaliza: fica divergente.
SEM_FONTE_DIRETA = [
    (r"^specs/arquitetura/README\.md$", "comandos do binding (create-project.mjs aplicarComandosDoMapa)"),
    (r"^\.agents/gerar_indice\.py$", "embutido no init_repo.py (GERADOR_INDICE)"),
]
SO_H1 = ("specs/README.md", "specs/INDEX.md")
BASE_COM_TITULO = re.compile(r"^specs/arquitetura/00-base-[a-z]+\.md$")

ACOES_LISTADAS = (
    "adicionar", "adicionar?", "bloqueado", "substituir", "substituir-politica", "conflito", "divergente",
    "obsoleto?", "mantido", "reportar-molde", "regenerar",
)
ORDEM_DAS_ACOES = (*ACOES_LISTADAS, "nada", "extra")
LEIS_RESERVADAS = ("arquitetura", "modulo", "contrato-e-dados", "operacao", "regras")
NOMES_RESERVADOS = re.compile(r"^(00-arquitetura|01-modulo|02-contrato-e-dados|03-operacao|04-regras|00-base-[a-z]+|00-fundacao-tecnologica|README)\.md$")
SPEC_NN = re.compile(r"^(\d{2})-([a-z0-9][a-z0-9-]*)\.md$")
PLAN_NN = re.compile(r"^plan-\d+-[a-z0-9].*\.md$")
TITULO_DE_DOUTRINA = re.compile(r"^(#|titulo:).*(doutrina|funda[cç][aã]o)", re.IGNORECASE | re.MULTILINE)
PROXIMO_ESCALAR = re.compile(r'^proximo_numero_plan:\s*"?\d', re.MULTILINE)
MARCADOR_NO_CREATE_PROJECT = re.compile(r"\.replaceAll\('([^']+)',\s*escopo\)")
AREAS_DO_SISTEMA = ("specs", "tools", ".agents")
PASTAS_IGNORADAS = {"node_modules", ".git", "__pycache__", ".ruff_cache", ".venv", "dist", "generated"}
LIMITE_DE_LISTA = 8


# ------------------------------------------------------------------ nucleo: titulo e comparacao


def normalizar(texto: str) -> str:
    """Fim de linha nao e diferenca de conteudo: CRLF -> LF antes de comparar."""
    return texto.replace("\r\n", "\n")


def linhas_de_titulo(rel: str, linhas: list) -> list:
    """Nucleo: os indices das linhas que levam o nome do projeto — o H1 de README/INDEX; a linha
    `titulo:` do frontmatter e o primeiro H1 de `00-base-*`. Fora desses arquivos, nenhuma."""
    if rel in SO_H1:
        return [0] if linhas and linhas[0].startswith("# ") else []
    if not BASE_COM_TITULO.match(rel) or not linhas or linhas[0].strip() != "---":
        return []
    fim = next((i for i in range(1, len(linhas)) if linhas[i].strip() == "---"), len(linhas))
    titulo = [i for i in range(1, fim) if linhas[i].startswith("titulo:")][:1]
    h1 = [i for i in range(fim + 1, len(linhas)) if linhas[i].startswith("# ")][:1]
    return titulo + h1


def comparavel(rel: str, texto: str) -> str:
    """O texto como se compara: LF e sem as linhas de titulo do projeto (ver `linhas_de_titulo`)."""
    linhas = normalizar(texto).split("\n")
    fora = set(linhas_de_titulo(rel, linhas))
    return "\n".join(linha for i, linha in enumerate(linhas) if i not in fora)


# ------------------------------------------------------------------ nucleo: classificar e decidir


def classificar(caminho: str, contexto: dict) -> str:
    """Nucleo: a categoria de um caminho relativo (com `/`). `contexto` = {tipo, bindings, modular}."""
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


# ------------------------------------------------------------------ nucleo: adocao, politica e trava


def fonte_direta(rel: str, tipo: str) -> tuple:
    """Nucleo: `(fonte, None)` se o arquivo tem fonte comparavel na base, ou `(None, motivo)`."""
    for padrao, motivo in SEM_FONTE_DIRETA:
        if re.match(padrao, rel):
            return None, motivo
    for padrao, molde, tipos, _instalador in FONTES:
        achado = re.match(padrao, rel)
        if achado and tipo in tipos:
            return molde.format(*achado.groups()), None
    return None, "nenhum instalador copia este caminho"


def marcador_de_escopo(texto_create_project: str) -> str | None:
    """Nucleo: o marcador que o `create-project.mjs` troca pelo escopo (`aplicarEscopo`), lido do proprio
    arquivo — nunca escrito a mao aqui."""
    achado = MARCADOR_NO_CREATE_PROJECT.search(texto_create_project or "")
    return achado.group(1) if achado else None


def versao_igual(rel: str, texto: str, versoes: list, troca: tuple | None = None) -> str | None:
    """Nucleo: o commit da primeira versao da fonte igual ao arquivo do sistema, ou `None`. `troca` =
    (escopo, marcador): tambem tenta o texto do sistema com o escopo trocado pelo marcador."""
    alvos = {comparavel(rel, texto)}
    if troca and troca[0] and troca[1]:
        alvos.add(comparavel(rel, texto.replace(troca[0], troca[1])))
    return next((commit for commit, versao in versoes if comparavel(rel, versao) in alvos), None)


def adotar(plano: dict, sistema: dict, versoes: dict, trocas: dict) -> dict:
    """Nucleo: reclassifica os `divergente` pela historia. `versoes` = {rel: [(commit, texto)] ou o motivo
    (str) de nao haver fonte}; `trocas` = {rel: (escopo, marcador)} onde o escopo foi aplicado."""
    adocao, sem_fonte, sem_versao, ainda = {}, {}, [], []
    for rel in plano["acoes"]["divergente"]:
        disponiveis = versoes.get(rel)
        if isinstance(disponiveis, str):
            sem_fonte[rel] = disponiveis
            ainda.append(rel)
            continue
        commit = versao_igual(rel, sistema[rel], disponiveis or [], trocas.get(rel))
        if commit:
            adocao[rel] = commit
        else:
            sem_versao.append(rel)
            ainda.append(rel)
    acoes = {**plano["acoes"], "divergente": ainda, "substituir": sorted(plano["acoes"]["substituir"] + list(adocao))}
    return {**plano, "acoes": acoes, "adocao": adocao, "sem-fonte-direta": sem_fonte, "sem-versao-igual": sem_versao}


def politica(plano: dict, contexto: dict) -> dict:
    """Nucleo: em sistema modular, `tools/` divergente vira `substituir-politica` (ADR-009: vendorizado)."""
    if not contexto.get("modular"):
        return plano
    divergentes = plano["acoes"]["divergente"]
    ferramentas = [r for r in divergentes if r.startswith("tools/")]
    acoes = {**plano["acoes"], "divergente": [r for r in divergentes if r not in ferramentas], "substituir-politica": ferramentas}
    return {**plano, "acoes": acoes}


def travar(plano: dict, falta: dict) -> dict:
    """Nucleo: com lei/fundacao fora do reservado no sistema, o `adicionar?` vira `bloqueado` — a plan do
    revisor no projeto decide antes; nenhuma flag o libera."""
    if not falta["lei-ou-fundacao-fora-do-reservado"]:
        return plano
    acoes = {**plano["acoes"], "bloqueado": plano["acoes"]["adicionar?"], "adicionar?": []}
    return {**plano, "acoes": acoes}


# ------------------------------------------------------------------ nucleo: decisoes mantidas


def sha1_comparavel(rel: str, texto: str) -> str:
    """Nucleo: o sha1 do conteudo como se compara (CRLF -> LF, sem as linhas de titulo do projeto)."""
    return hashlib.sha1(comparavel(rel, texto).encode("utf-8")).hexdigest()


def _mantido_vale(entrada: dict, sistema: dict, ref: dict) -> bool:
    rel = entrada["caminho"]
    return (
        rel in sistema
        and rel in ref
        and entrada.get("sha1_sistema") == sha1_comparavel(rel, sistema[rel])
        and entrada.get("sha1_referencia") == sha1_comparavel(rel, ref[rel])
    )


def separar_mantidos(mantidos: list, sistema: dict, ref: dict) -> tuple:
    """Nucleo: `(validos, vencidos)` — valido = o arquivo do sistema e a fonte da referencia seguem com os
    mesmos sha1 do momento da decisao. Vencido: o projeto editou de novo ou a base mudou aquela fonte."""
    validos = [e for e in mantidos if _mantido_vale(e, sistema, ref)]
    return validos, [e for e in mantidos if e not in validos]


def aplicar_mantidos(plano: dict, sistema: dict, ref: dict, mantidos: list) -> dict:
    """Nucleo: move para `mantido` os `divergente`/`conflito` com decisao valida (sem pendencia). Guarda
    `mantidos` ({rel: motivo}), `mantidos-validos` (as entradas, para o carimbo) e `mantidos-vencidos`."""
    validos, vencidos = separar_mantidos(mantidos, sistema, ref)
    por_caminho = {e["caminho"]: e for e in validos}
    acoes = dict(plano["acoes"])
    decididos = sorted(r for a in ("divergente", "conflito") for r in acoes[a] if r in por_caminho)
    for acao in ("divergente", "conflito"):
        acoes[acao] = [r for r in acoes[acao] if r not in por_caminho]
    acoes["mantido"] = decididos
    return {
        **plano,
        "acoes": acoes,
        "mantidos": {r: por_caminho[r]["motivo"] for r in decididos},
        "mantidos-validos": validos,
        "mantidos-vencidos": [e["caminho"] for e in vencidos],
        "sem-fonte-direta": {r: m for r, m in plano.get("sem-fonte-direta", {}).items() if r not in por_caminho},
        "sem-versao-igual": [r for r in plano.get("sem-versao-igual", []) if r not in por_caminho],
    }


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
    """Nucleo: o que falta ou esta fora do padrao — trabalho de uma plan do revisor, nunca da propagacao.
    `contexto["sarak_ignorado"]` e o fato lido pela casca (`git check-ignore` do `.sarak/base.json`)."""
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
        "sarak-ignorado": bool(contexto.get("sarak_ignorado")),
    }


def escopo_do_pacote(texto_package_json: str | None, caminho: str) -> str:
    """Nucleo: o escopo que o instalador usou — o `name` do package.json da raiz (onde o
    create-project grava o escopo); sem ele, o padrao do proprio create-project (nome da pasta)."""
    try:
        nome = json.loads(texto_package_json or "{}").get("name")
    except ValueError:
        nome = None
    return nome if isinstance(nome, str) and nome else os.path.basename(caminho.rstrip("/")).lower()


# ------------------------------------------------------------------ casca: git e temporarios


def raiz_da_base() -> Path:
    return Path(__file__).resolve().parents[3]


def rodar(comando: list, entrada: bytes | None = None, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(comando, input=entrada, cwd=cwd, capture_output=True, check=False)


def git(raiz: Path, *args) -> str | None:
    r = rodar(["git", "-C", str(raiz), *args])
    return r.stdout.decode("utf-8", errors="replace").strip() if r.returncode == 0 else None


def linhas_sujas(raiz: Path) -> list:
    """`git status --porcelain -uall`, uma entrada por arquivo — SEM `strip` da saida: a coluna 1 do
    porcelain pode ser espaco, e o caminho comeca na coluna 4."""
    r = rodar(["git", "-C", str(raiz), "status", "--porcelain", "-uall"])
    return [linha for linha in r.stdout.decode("utf-8", errors="replace").splitlines() if linha.strip()]


def abrir_worktree(raiz: Path, commit: str, destino: Path) -> bool:
    return rodar(["git", "-C", str(raiz), "worktree", "add", "--detach", str(destino), commit]).returncode == 0


def fechar_worktree(raiz: Path, destino: Path) -> None:
    rodar(["git", "-C", str(raiz), "worktree", "remove", "--force", str(destino)])
    rodar(["git", "-C", str(raiz), "worktree", "prune"])


def _blobs_da_fonte(raiz: Path, fonte: str) -> list:
    """`[(commit, blob)]` de cada versao da fonte no historico da base (mais nova primeiro)."""
    saida, commit, pares = git(raiz, "log", "--format=%H", "--raw", "--no-abbrev", "--", fonte) or "", None, []
    for linha in saida.splitlines():
        if re.fullmatch(r"[0-9a-f]{40}", linha):
            commit = linha
        elif linha.startswith(":") and commit:
            blob = linha.split("\t")[0].split()[3]
            pares += [] if set(blob) == {"0"} else [(commit, blob)]
    return pares


def _conteudos(raiz: Path, blobs: list) -> dict:
    """`{blob: texto}` lidos de uma vez por `git cat-file --batch`."""
    r = rodar(["git", "-C", str(raiz), "cat-file", "--batch"], "".join(f"{b}\n" for b in blobs).encode())
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
        rodar([sys.executable, "-c", codigo, str(scripts), str(alvo), str(arvore), binding, sistema["nome"]])


def _instalar_app(arvore: Path, alvo: Path, sistema: dict, escopo: str) -> None:
    script = arvore / "skills" / "meta-iniciar-repositorio" / "scripts" / "init_repo.py"
    comando = [sys.executable, str(script), "--target", str(alvo), "--name", sistema["nome"]]
    if sistema["modular"] and sistema["bindings"]:
        comando += ["--binding", sistema["bindings"][0], "--escopo", escopo]
    rodar(comando)


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


def ler_texto(caminho: Path) -> str | None:
    return caminho.read_text(encoding="utf-8") if caminho.is_file() else None


def commit_do_carimbo(pasta: Path) -> str | None:
    texto = ler_texto(pasta / ".sarak" / "base.json")
    try:
        return json.loads(texto).get("base_commit") if texto else None
    except ValueError:
        return None


def mantidos_do_carimbo(pasta: Path) -> list:
    """Casca: as decisoes `mantidos` gravadas no carimbo (so as bem formadas)."""
    texto = ler_texto(pasta / ".sarak" / "base.json")
    try:
        lista = json.loads(texto).get("mantidos", []) if texto else []
    except ValueError:
        return []
    chaves = {"caminho", "motivo", "sha1_sistema", "sha1_referencia"}
    return [e for e in lista if isinstance(e, dict) and chaves <= set(e)]


def sarak_ignorado(pasta: Path) -> bool:
    """Casca: o `.sarak/base.json` do sistema cai num `.gitignore`? (o carimbo nao seria versionado)."""
    return rodar(["git", "-C", str(pasta), "check-ignore", "-q", ".sarak/base.json"]).returncode == 0


def escopo_do_sistema(raiz: Path, sistema: dict) -> str:
    return escopo_do_pacote(ler_texto(raiz / sistema["caminho"] / "package.json"), sistema["caminho"])


def _referencia_no_commit(raiz: Path, commit: str, tmp: Path, sistema: dict) -> dict | None:
    """Referencia gerada num worktree da base em `commit`; `None` se o commit nao abre."""
    arvore = tmp / f"base-{commit[:12]}"
    if not abrir_worktree(raiz, commit, arvore):
        return None
    try:
        return gerar_referencia(arvore, tmp / f"ref-{commit[:12]}", sistema, escopo_do_sistema(raiz, sistema))
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


def _historia_dos_divergentes(raiz: Path, plano: dict, sistema: dict, cache: dict) -> tuple:
    """Casca: `(versoes, trocas)` para a adocao — as versoes de cada fonte e, na doutrina, o par
    (escopo do sistema, marcador do create-project.mjs no HEAD)."""
    marcador = marcador_de_escopo(git(raiz, "show", f"HEAD:{CREATE_PROJECT}") or "")
    escopo, versoes, trocas = escopo_do_sistema(raiz, sistema), {}, {}
    for rel in plano["acoes"]["divergente"]:
        fonte, motivo = fonte_direta(rel, sistema["tipo"])
        versoes[rel] = motivo if fonte is None else versoes_da_fonte(raiz, fonte, cache)
        if fonte and fonte.startswith(FONTE_COM_ESCOPO):
            trocas[rel] = (escopo, marcador)
    return versoes, trocas


def _cabecalho(sistema: dict, carimbo: str | None, head: str) -> dict:
    return {
        "id": sistema["id"], "caminho": sistema["caminho"], "tipo": sistema["tipo"], "modular": sistema["modular"],
        "bindings": sistema["bindings"], "status": sistema.get("status"), "status_base": sistema.get("status_base"),
        "carimbo": carimbo, "atras_do_head": None if carimbo is None else carimbo != head,
    }


def analisar_sistema(raiz: Path, sistema: dict, head: str, cache: dict) -> tuple:
    """Casca: `(plano, referencia, sistema_lido)` — referencias em temporario (apagado), sistema so lido."""
    pasta = (raiz / sistema["caminho"]).resolve()
    if not pasta.is_dir():
        return {**_cabecalho(sistema, None, head), "erro": f"caminho nao encontrado: {pasta}"}, None, None
    carimbo = commit_do_carimbo(pasta)
    ref, antiga = _referencias(raiz, sistema, head, carimbo)
    if ref is None:
        return {**_cabecalho(sistema, carimbo, head), "erro": "nao foi possivel abrir o HEAD da base num worktree"}, None, None
    lido = ler_arvore(pasta)
    contexto = {"tipo": sistema["tipo"], "bindings": sistema["bindings"], "modular": sistema["modular"]}
    plano = planejar(ref, antiga, lido, contexto)
    if antiga is None:
        plano = politica(adotar(plano, lido, *_historia_dos_divergentes(raiz, plano, sistema, cache)), contexto)
    plano = aplicar_mantidos(plano, lido, ref, mantidos_do_carimbo(pasta))
    falta = lacunas(lido, {**contexto, "sarak_ignorado": sarak_ignorado(pasta)})
    return {**_cabecalho(sistema, carimbo, head), **travar(plano, falta), "lacunas": falta}, ref, lido


def planejar_sistema(raiz: Path, sistema: dict, head: str, cache: dict) -> dict:
    """Casca: so o plano de um sistema (o `--plano`)."""
    return analisar_sistema(raiz, sistema, head, cache)[0]


# ------------------------------------------------------------------ casca: relatorio


def lista_curta(itens: list, limite: int = LIMITE_DE_LISTA) -> str:
    if len(itens) <= limite:
        return ", ".join(itens)
    return ", ".join(itens[:limite]) + f", … +{len(itens) - limite}"


def _com_nota(rel: str, plano: dict) -> str:
    commit = plano.get("adocao", {}).get(rel)
    motivo = plano.get("mantidos", {}).get(rel)
    if motivo:
        return f"{rel} (mantido: {motivo})"
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
    linhas += [f"    {a}: {lista_curta([_com_nota(r, plano) for r in acoes[a]])}" for a in ACOES_LISTADAS if acoes[a]]
    if plano.get("sem-fonte-direta"):
        linhas.append(f"    divergente sem fonte direta: {lista_curta(list(plano['sem-fonte-direta']))}")
    if plano.get("sem-versao-igual"):
        linhas.append(f"    sem versão igual no histórico: {lista_curta(plano['sem-versao-igual'])}")
    if plano.get("mantidos-vencidos"):
        linhas.append(f"    decisão `mantido` vencida (revisar de novo): {lista_curta(plano['mantidos-vencidos'])}")
    if plano["molde-mudou-na-base"]:
        linhas.append(f"    molde mudou na base (informativo): {lista_curta(plano['molde-mudou-na-base'])}")
    return linhas + linhas_de_lacunas(plano["lacunas"])


ROTULOS_DE_LACUNA = {
    "lei-ou-fundacao-fora-do-reservado": "lei/fundação com nome fora do reservado",
    "migracao-de-familias-pendente": "migração de famílias pendente",
    "molde-em-formato-antigo": "molde em formato antigo",
    "binding-sem-base": "binding sem 00-base",
}


def linhas_de_lacunas(falta: dict) -> list:
    linhas = []
    for chave, rotulo in ROTULOS_DE_LACUNA.items():
        itens = [c.rsplit("/", 1)[-1] for c in falta[chave]]
        if itens:
            linhas.append(f"  lacuna: {rotulo} ({len(itens)}): {lista_curta(itens, 5)}")
    if falta["sem-planejamento"]:
        linhas.append("  lacuna: sem panorama/00-planejamento.md")
    if falta["sarak-ignorado"]:
        linhas.append("  lacuna: .sarak/ ignorado pelo git (o --aplicar recusa: o carimbo nao seria versionado)")
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
    linhas.append(f"  .sarak/ ignorado pelo git: {', '.join(p['id'] for p in validos if p['lacunas']['sarak-ignorado']) or '—'}")
    linhas.append("  [NOTA] Isto e so o plano (somente leitura). Resumo para decidir: --relatorio. Para aplicar: --aplicar --id <id>, depois do HITL.")
    return linhas


# ------------------------------------------------------------------ casca: CLI


def _parser():
    parser = argparse.ArgumentParser(description="Plano, aplicar e desfazer da propagacao da base aos sistemas do mapa.json.")
    modo = parser.add_mutually_exclusive_group(required=True)
    modo.add_argument("--plano", action="store_true", help="Gera o plano (somente leitura).")
    modo.add_argument("--relatorio", action="store_true", help="Relatorio objetivo para o HITL de selecao (somente leitura).")
    modo.add_argument("--aplicar", action="store_true", help="Aplica nos --id, no branch corrente, sem commit.")
    modo.add_argument("--desfazer", action="store_true", help="Desfaz a aplicacao nos --id, pelo manifesto.")
    parser.add_argument("--id", action="append", default=[], help="Sistema do mapa (repetivel).")
    parser.add_argument("--json", action="store_true", help="Saida do plano em JSON.")
    parser.add_argument("--mapa", help="Outro mapa.json (teste). Padrao: o da raiz da base.")
    parser.add_argument("--incluir-divergentes", action="store_true", help="Aplica tambem os divergente (explicito, por execucao).")
    parser.add_argument("--incluir-adicionar?", dest="incluir_adicionar", action="store_true", help="Aplica tambem os adicionar? (nunca os bloqueado).")
    parser.add_argument("--adotar", action="append", default=[], metavar="CAMINHO", help="Aplica so este divergente/conflito (repetivel).")
    parser.add_argument("--manter", action="append", default=[], metavar="CAMINHO", help="Nao escreve este divergente/conflito; registra em `mantidos` no carimbo (exige --motivo).")
    parser.add_argument("--motivo", action="append", default=[], help="Motivo do --manter correspondente (mesma ordem).")
    parser.add_argument("--permitir-base-suja", action="store_true", help="So teste/desenvolvimento (--plano, --relatorio e --aplicar): a referencia vem do HEAD (worktree).")
    return parser


def sistemas_ativos(mapa: dict, ids: list) -> list:
    ativos = [s for s in mapa.get("sistemas", []) if s.get("situacao") != "adocao-posterior"]
    return [s for s in ativos if s["id"] in ids] if ids else ativos


def _marcar_monorepos(planos: list, sistemas: list) -> None:
    for plano, sistema in zip(planos, sistemas, strict=True):
        irmaos = [s["id"] for s in sistemas if s["id"] != sistema["id"] and s.get("raiz_git") and s.get("raiz_git") == sistema.get("raiz_git")]
        if irmaos:
            plano["compartilha_repo_com"] = irmaos


def _plano(args, raiz: Path) -> int:
    if linhas_sujas(raiz) and not args.permitir_base_suja:
        print("[ERRO] a base tem alteracoes locais — o plano compara com o HEAD; commite ou descarte antes.", file=sys.stderr)
        return 2
    mapa = json.loads(Path(args.mapa or raiz / "mapa.json").read_text(encoding="utf-8"))
    sistemas, head, cache = sistemas_ativos(mapa, args.id), git(raiz, "rev-parse", "HEAD"), {}
    planos = [planejar_sistema(raiz, sistema, head, cache) for sistema in sistemas]
    _marcar_monorepos(planos, sistemas)
    if args.json:
        print(json.dumps(planos, indent=2, ensure_ascii=False))
        return 0
    for plano in planos:
        print("\n".join(_linhas_do_plano(plano)))
    print("\n".join(consolidado(planos)))
    return 0


def main() -> int:
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8", errors="replace")
    if "--autoteste" in sys.argv[1:]:
        return autoteste()
    args, raiz = _parser().parse_args(), raiz_da_base()
    if args.plano:
        return _plano(args, raiz)
    if args.relatorio:
        import relatorio  # so carregado quando pedido

        return relatorio.executar(args, raiz)
    import aplicacao  # aplicar/desfazer: so carregado quando pedido

    return aplicacao.aplicar(args, raiz) if args.aplicar else aplicacao.desfazer(args, raiz)


# ------------------------------------------------------------------ autoteste

APP = {"tipo": "app", "bindings": ["typescript"], "modular": True}
SITE = {"tipo": "site", "bindings": [], "modular": False}
SEM = None


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


def _vazio(**acoes) -> dict:
    return {"acoes": {**{a: [] for a in ORDEM_DAS_ACOES}, **acoes}}


def _caso_adocao() -> bool:
    plano = _vazio(divergente=["tools/a.mjs", "tools/b.mjs", "specs/arquitetura/README.md"])
    sistema = {"tools/a.mjs": "v1\r\n", "tools/b.mjs": "editado", "specs/arquitetura/README.md": "x"}
    versoes = {"tools/a.mjs": [("c2" * 20, "v2\n"), ("c1" * 20, "v1\n")], "tools/b.mjs": [("c1" * 20, "v1\n")], "specs/arquitetura/README.md": "comandos do binding"}
    r = adotar(plano, sistema, versoes, {})
    return r["acoes"]["substituir"] == ["tools/a.mjs"] and r["adocao"] == {"tools/a.mjs": "c1" * 20} and r["acoes"]["divergente"] == ["tools/b.mjs", "specs/arquitetura/README.md"] and r["sem-versao-igual"] == ["tools/b.mjs"]


def _caso_adocao_transformados() -> bool:
    base = '---\ntipo: "arquitetura"\ntitulo: "Arquitetura Base: TypeScript"\n---\n\n# Arquitetura Base\ncorpo\n'
    sistema_base = '---\ntipo: "arquitetura"\ntitulo: "Arquitetura: ERP (TypeScript)"\n---\n\n# Arquitetura do ERP\ncorpo\n'
    doutrina, sistema_doutrina = "use @<escopo>/x e <escopo>\n", "use @erp/x e erp\n"
    plano = _vazio(divergente=["specs/arquitetura/00-base-typescript.md", "specs/arquitetura/01-modulo.md"])
    sistema = {"specs/arquitetura/00-base-typescript.md": sistema_base, "specs/arquitetura/01-modulo.md": sistema_doutrina}
    versoes = {"specs/arquitetura/00-base-typescript.md": [("b" * 40, base)], "specs/arquitetura/01-modulo.md": [("d" * 40, doutrina)]}
    r = adotar(plano, sistema, versoes, {"specs/arquitetura/01-modulo.md": ("erp", "<escopo>")})
    return r["acoes"]["divergente"] == [] and sorted(r["adocao"]) == ["specs/arquitetura/00-base-typescript.md", "specs/arquitetura/01-modulo.md"]


def _caso_politica_e_trava() -> bool:
    p = politica(_vazio(divergente=["tools/a.mjs", "specs/00-knowledge.md"]), APP)
    nao_modular = politica(_vazio(divergente=["tools/a.mjs"]), SITE)["acoes"]["divergente"] == ["tools/a.mjs"]
    falta = {"lei-ou-fundacao-fora-do-reservado": ["specs/arquitetura/00-arquitetura-erp.md"]}
    t = travar(_vazio(**{"adicionar?": ["specs/arquitetura/04-regras.md"]}), falta)
    return (p["acoes"]["substituir-politica"] == ["tools/a.mjs"] and p["acoes"]["divergente"] == ["specs/00-knowledge.md"] and nao_modular
            and t["acoes"]["bloqueado"] == ["specs/arquitetura/04-regras.md"] and t["acoes"]["adicionar?"] == [])


def _caso_lacunas() -> bool:
    sistema = {"specs/arquitetura/00-arquitetura-erp.md": "x", "specs/arquitetura/05-regras-e-gate.md": "x", "specs/arquitetura/02-interface.md": "x",
               "specs/arquitetura/01-modulo.md": "lei", "specs/arquitetura/00-fundacao-tecnologica.md": "f", "specs/specs/03-login.md": "x",
               "specs/plan/plan-07-y.md": "x", "specs/00-indice.md": 'proximo_numero_plan: "05"\n'}
    f = lacunas(sistema, APP)
    return (f["lei-ou-fundacao-fora-do-reservado"] == ["specs/arquitetura/00-arquitetura-erp.md", "specs/arquitetura/05-regras-e-gate.md"]
            and f["migracao-de-familias-pendente"] == ["specs/arquitetura/02-interface.md", "specs/specs/03-login.md", "specs/plan/plan-07-y.md"]
            and f["molde-em-formato-antigo"] and f["binding-sem-base"] == ["typescript"] and f["sem-planejamento"]
            and not f["sarak-ignorado"] and lacunas(sistema, {**APP, "sarak_ignorado": True})["sarak-ignorado"])


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
    ("adocao dos transformados: 00-base sem titulo e doutrina com escopo -> marcador", _caso_adocao_transformados),
    ("politica em tools/ de modular e trava do adicionar?", _caso_politica_e_trava),
    ("lacunas: lei fora do reservado, familias, formato antigo, base, planejamento, .sarak/ ignorado", _caso_lacunas),
    ("molde antigo intocado e molde mudou -> reportar-molde", lambda: _acoes({"specs/00-indice.md": "novo"}, {"specs/00-indice.md": "velho"}, {"specs/00-indice.md": "velho"})["reportar-molde"] == ["specs/00-indice.md"]),
    ("fonte: copia, doutrina, 00-base, README sem fonte", lambda: fonte_direta("tools/gate/a.mjs", "app") == ("specs/_estrutura_modulos/tools/gate/a.mjs", None)
     and fonte_direta("specs/arquitetura/01-modulo.md", "app")[0] == "specs/_estrutura_modulos/doutrina/01-modulo.md"
     and fonte_direta("specs/arquitetura/00-base-python.md", "site")[0] == "specs/_bases_arquiteturais/00-base-python.md"
     and fonte_direta("specs/arquitetura/README.md", "app")[0] is None),
    ("marcador lido do create-project.mjs, nunca escrito a mao", lambda: marcador_de_escopo("x.replaceAll('<escopo>', escopo)") == "<escopo>" and marcador_de_escopo("nada") is None),
    ("linhas de titulo: 00-base tem titulo: e H1; outro arquivo nenhuma", lambda: linhas_de_titulo("specs/arquitetura/00-base-python.md", ["---", "tipo: x", "titulo: \"T\"", "---", "", "# H"]) == [2, 5]
     and linhas_de_titulo("specs/00-knowledge.md", ["# A"]) == []),
    ("escopo: name do package.json, senao a pasta", lambda: escopo_do_pacote('{"name": "erp"}', "../Earendel/ERP") == "erp" and escopo_do_pacote(None, "../ZP/Novo/") == "novo"),
]


def autoteste() -> int:
    """Prova o nucleo do plano, o do aplicar/desfazer (`aplicacao.CASOS`) e o do relatorio (`relatorio.CASOS`)
    em memoria — sem git, sem disco."""
    import aplicacao
    import relatorio

    casos = CASOS + aplicacao.CASOS + relatorio.CASOS
    falhas = [nome for nome, caso in casos if not caso()]
    for nome in falhas:
        print(f"[FALHA] {nome}", file=sys.stderr)
    print(f"propagar --autoteste: {len(casos) - len(falhas)}/{len(casos)} caso(s) verde")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
