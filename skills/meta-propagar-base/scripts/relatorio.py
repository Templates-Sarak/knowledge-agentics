"""relatorio.py — o RELATORIO objetivo da propagacao (o `--relatorio` do `propagar.py`), a entrada do HITL
de selecao: por sistema, o que a atualizacao direta escreveria e as PLANS que o revisor escreveria no
repositorio para o que precisa de adequacao. Somente leitura — nada e escrito, nem o status do mapa.

A regra lacuna -> plan proposta vive num lugar so: a tabela `PLANS` abaixo (titulo, familia `00`, destino
da sintese). Os numeros `NN` saem do `proximo_numero_plan` da familia `00` do `00-indice` do repositorio
(formato novo) ou comecam em `01` (formato antigo, ou sem indice). A proposta e SUGESTAO: quem cria a
plan e o revisor, depois do HITL.

Nucleo x casca: `propostas`, `proximo_da_familia`, `atualizacao_direta`, `motivos_de_bloqueio` e
`montar_relatorio` sao PUROS — provados pelo `--autoteste` do `propagar.py` (este modulo nao tem CLI
propria). Git, disco e referencias temporarias sao casca.
"""

import json
import re
import sys
from pathlib import Path

import propagar as pp

FAMILIA = "00"
NOMES_NA_LISTA = 5
SEM_DESTINO = "—"
CONTADOR_DA_FAMILIA = re.compile(rf"""["']?{FAMILIA}["']?\s*:\s*["']?(\d+)""")

# FONTE UNICA da regra lacuna/acao -> plan proposta: (chave, titulo, destino da sintese, depende_de), na ordem
# em que recebem numero — a ordem tambem e dado: a conversao do `00-indice` e a primeira de qualquer repositorio
# em formato antigo, e as outras dependem dela; a decisao (divergente/conflito) e as familias vem depois da lei.
# `depende_de` = chaves de outras linhas; so valem as que foram propostas. A chave e `lacuna:<nome da lacuna>` ou `acao:<nome da acao>`. Sem `panorama/00-planejamento`
# nao ha plan: e adicionado pela atualizacao direta (molde de processo ausente).
INDICE = "lacuna:molde-em-formato-antigo"
LEI = "lacuna:lei-ou-fundacao-fora-do-reservado"
PLANS = (
    (
        INDICE,
        "Converter o `00-indice` para o contador por família",
        SEM_DESTINO,
        (),
    ),
    (
        LEI,
        "Reconciliar a lei do template renomeada (destrava os `bloqueado`)",
        SEM_DESTINO,
        (INDICE,),
    ),
    (
        "lacuna:migracao-de-familias-pendente",
        "Migrar specs e plans para famílias `FF.NN` e montar o catálogo",
        SEM_DESTINO,
        (INDICE, LEI),
    ),
    (
        "acao:divergente",
        "Decidir arquivo a arquivo: adotar a versão da base ou manter",
        SEM_DESTINO,
        (INDICE, LEI),
    ),
    (
        "acao:conflito",
        "Decidir arquivo a arquivo (com carimbo): adotar a versão da base ou manter",
        SEM_DESTINO,
        (INDICE, LEI),
    ),
    (
        "lacuna:binding-sem-base",
        "Criar a base de linguagem que falta",
        "arquitetura/00-base-<binding>.md",
        (INDICE,),
    ),
    (
        "lacuna:sarak-ignorado",
        "Tirar `.sarak/` do `.gitignore` (pré-requisito do aplicar)",
        SEM_DESTINO,
        (INDICE,),
    ),
)


# ------------------------------------------------------------------ nucleo


def proximo_da_familia(texto_indice: str | None) -> int:
    """Nucleo: o `NN` da proxima plan da familia `00` — o valor dela no mapa `proximo_numero_plan` do
    `00-indice`; `1` no formato antigo (contador escalar), sem entrada da familia ou sem indice."""
    texto = texto_indice or ""
    if pp.PROXIMO_ESCALAR.search(texto):
        return 1
    achado = CONTADOR_DA_FAMILIA.search(
        next((l for l in texto.splitlines() if l.startswith("proximo_numero_plan")), "")
    )
    return int(achado.group(1)) if achado else 1


def _motivos_de_plan(lacunas: dict, acoes: dict) -> dict:
    """Nucleo: `{chave: motivo/contagem}` so das propostas que se aplicam."""
    lei = lacunas["lei-ou-fundacao-fora-do-reservado"]
    candidatos = {
        "lacuna:lei-ou-fundacao-fora-do-reservado": (
            lei,
            f"{len(lei)} arquivo(s) fora do reservado"
            + (f" · {len(acoes['bloqueado'])} bloqueado(s)" if acoes["bloqueado"] else ""),
        ),
        "lacuna:migracao-de-familias-pendente": (
            lacunas["migracao-de-familias-pendente"],
            f"{len(lacunas['migracao-de-familias-pendente'])} spec(s)/plan(s) fora do formato `FF.NN`",
        ),
        "lacuna:molde-em-formato-antigo": (
            lacunas["molde-em-formato-antigo"],
            "`proximo_numero_plan` escalar",
        ),
        "acao:divergente": (
            acoes["divergente"],
            f"{len(acoes['divergente'])} arquivo(s) da base editado(s) no projeto",
        ),
        "acao:conflito": (
            acoes["conflito"],
            f"{len(acoes['conflito'])} arquivo(s) editado(s) no projeto e mudados na base",
        ),
        "lacuna:binding-sem-base": (
            lacunas["binding-sem-base"],
            f"binding(s) {', '.join(lacunas['binding-sem-base'])}",
        ),
        "lacuna:sarak-ignorado": (
            lacunas["sarak-ignorado"],
            "o carimbo não seria versionado",
        ),
    }
    return {chave: motivo for chave, (ativo, motivo) in candidatos.items() if ativo}


def propostas(lacunas: dict, acoes: dict, primeiro: int = 1) -> list:
    """Nucleo: as plans propostas, na ordem de `PLANS`, numeradas a partir de `primeiro` (familia `00`).
    `[{id, titulo, motivo, destino, depende_de}]`."""
    motivos, saida, numeros = _motivos_de_plan(lacunas, acoes), [], {}
    for chave, titulo, destino, depende in PLANS:
        if chave not in motivos:
            continue
        numeros[chave] = f"plan-{FAMILIA}.{primeiro + len(saida):02d}"
        saida.append(
            {
                "id": numeros[chave],
                "titulo": titulo,
                "motivo": motivos[chave],
                "destino": destino,
                "depende_de": [numeros[d] for d in depende if d in numeros],
            }
        )
    return saida


def atualizacao_direta(acoes: dict) -> dict:
    """Nucleo: o que a atualizacao direta escreve SEM flag — `substituir` (arquivos da base),
    `substituir-politica` (`tools/`) e `adicionar` (novos) —, com ate `NOMES_NA_LISTA` nomes (so o arquivo)."""
    grupos = (
        ("da-base", acoes["substituir"]),
        ("tools", acoes["substituir-politica"]),
        ("novos", acoes["adicionar"]),
    )
    nomes = [rel for _, lista in grupos for rel in lista]
    return {
        **{chave: len(lista) for chave, lista in grupos},
        "nomes": [rel.rsplit("/", 1)[-1] for rel in nomes[:NOMES_NA_LISTA]],
        "resto": max(0, len(nomes) - NOMES_NA_LISTA),
    }


def motivos_de_bloqueio(
    sistema: dict, worktree_sujo: bool, sarak_ignorado: bool
) -> list:
    """Nucleo: por que o sistema NAO pode ser aplicado agora — as mesmas pre-condicoes do `--aplicar`,
    avaliadas sem escrever."""
    if sistema.get("situacao") != "ativo":
        return [str(sistema.get("situacao"))]
    return [
        *([] if sistema.get("raiz_git") else ["sem raiz_git no mapa"]),
        *(["worktree sujo"] if worktree_sujo else []),
        *([".sarak/ ignorado"] if sarak_ignorado else []),
    ]


def _linhas_da_direta(direta: dict | None) -> list:
    if direta is None:
        return []
    partes = [
        texto
        for total, texto in (
            (direta["da-base"], f"{direta['da-base']} da base"),
            (direta["tools"], f"{direta['tools']} `tools/` por política"),
            (direta["novos"], f"{direta['novos']} novos"),
        )
        if total
    ]
    if not partes:
        return ["**Atualização direta:** só o carimbo"]
    mais = f" … +{direta['resto']}" if direta["resto"] else ""
    nomes = ", ".join(f"`{n}`" for n in direta["nomes"])
    return [f"**Atualização direta:** {' · '.join(partes)}", f"{nomes}{mais}"]


def _linhas_de_plans(item: dict) -> list:
    if item.get("direta") is None:
        return []
    if not item["propostas"]:
        return ["**Plans propostas:** nenhuma"]
    return ["**Plans propostas:**"] + [
        f"- {p['id']} {p['titulo']} — {p['motivo']}" for p in item["propostas"]
    ]


def _bloco(item: dict) -> str:
    aviso = f" · ⚠ {'; '.join(item['motivos'])}" if item["motivos"] else ""
    linhas = [
        f"### {item['id']} · {item['status']}{aviso}",
        *_linhas_da_direta(item.get("direta")),
        *_linhas_de_plans(item),
    ]
    return "\n".join(linhas)


def montar_relatorio(itens: list, base: str) -> str:
    """Nucleo: o Markdown do relatorio. `itens` = [{id, status, motivos, direta, propostas}] (`direta` e
    `None` quando nao ha analise: adocao-posterior ou erro); `base` = o commit curto da base."""
    cabecalho = f"## Propagação — base {base} · {len(itens)} sistema(s)"
    rodape = "Escolha os repositórios (e as plans que aceita); nada foi escrito."
    return "\n\n".join([cabecalho, *(_bloco(i) for i in itens), rodape]) + "\n"


# ------------------------------------------------------------------ casca


def _repo_do_sistema(raiz: Path, sistema: dict) -> Path | None:
    return (raiz / sistema["raiz_git"]).resolve() if sistema.get("raiz_git") else None


def _item_sem_analise(sistema: dict, motivos: list) -> dict:
    return {
        "id": sistema["id"],
        "status": sistema.get("status"),
        "motivos": motivos,
        "direta": None,
        "propostas": [],
    }


def _item(raiz: Path, sistema: dict, head: str, cache: dict) -> dict:
    """Casca: analisa o sistema (referencia em temporario, sistema so lido) e monta o item do relatorio."""
    if sistema.get("situacao") != "ativo":
        return _item_sem_analise(sistema, motivos_de_bloqueio(sistema, False, False))
    plano, _ref, lido = pp.analisar_sistema(raiz, sistema, head, cache)
    if "erro" in plano:
        return _item_sem_analise(sistema, [f"erro: {plano['erro']}"])
    repo = _repo_do_sistema(raiz, sistema)
    suja = bool(repo and pp.linhas_sujas(repo))
    falta = plano["lacunas"]
    return {
        "id": sistema["id"],
        "status": sistema.get("status"),
        "motivos": motivos_de_bloqueio(sistema, suja, falta["sarak-ignorado"]),
        "direta": atualizacao_direta(plano["acoes"]),
        "propostas": propostas(
            falta,
            plano["acoes"],
            proximo_da_familia(lido.get("specs/00-indice.md")),
        ),
    }


def executar(args, raiz: Path) -> int:
    """Casca da CLI `--relatorio`: todos os sistemas do mapa (ou os `--id`), somente leitura."""
    if pp.linhas_sujas(raiz) and not args.permitir_base_suja:
        print(
            "[ERRO] a base tem alteracoes locais — o relatorio compara com o HEAD; commite ou descarte antes.",
            file=sys.stderr,
        )
        return 2
    mapa = json.loads(Path(args.mapa or raiz / "mapa.json").read_text(encoding="utf-8"))
    sistemas = [
        s for s in mapa.get("sistemas", []) if not args.id or s["id"] in args.id
    ]
    head, cache = pp.git(raiz, "rev-parse", "HEAD"), {}
    itens = [_item(raiz, s, head, cache) for s in sistemas]
    print(montar_relatorio(itens, head[:7]), end="")
    return 0


# ------------------------------------------------------------------ autoteste (rodado pelo propagar.py)

_LACUNAS = {
    "lei-ou-fundacao-fora-do-reservado": [],
    "migracao-de-familias-pendente": [],
    "molde-em-formato-antigo": [],
    "binding-sem-base": [],
    "sem-planejamento": False,
    "sarak-ignorado": False,
}
_ACOES = {a: [] for a in pp.ORDEM_DAS_ACOES}


def _caso_propostas() -> bool:
    lacunas = {
        **_LACUNAS,
        "lei-ou-fundacao-fora-do-reservado": [
            "specs/arquitetura/00-arquitetura-erp.md"
        ],
        "binding-sem-base": ["python"],
        "sarak-ignorado": True,
    }
    acoes = {
        **_ACOES,
        "bloqueado": ["a", "b"],
        "divergente": ["x"],
        "conflito": ["y", "z"],
    }
    r = propostas(lacunas, acoes, 3)
    return (
        [p["id"] for p in r]
        == ["plan-00.03", "plan-00.04", "plan-00.05", "plan-00.06", "plan-00.07"]
        and r[0]["titulo"].startswith("Reconciliar a lei")
        and "2 bloqueado(s)" in r[0]["motivo"]
        and r[1]["titulo"].startswith("Decidir arquivo a arquivo:")
        and "2 arquivo(s)" in r[2]["motivo"]
        and r[3]["destino"] == "arquitetura/00-base-<binding>.md"
        and r[4]["titulo"].startswith("Tirar `.sarak/`")
        and propostas(_LACUNAS, _ACOES) == []
        and _ordem_com_indice()
    )


def _ordem_com_indice() -> bool:
    lacunas = {
        **_LACUNAS,
        "molde-em-formato-antigo": ["specs/00-indice.md"],
        "migracao-de-familias-pendente": ["specs/specs/03-x.md"],
        "lei-ou-fundacao-fora-do-reservado": ["specs/arquitetura/00-arquitetura-erp.md"],
    }
    r = propostas(lacunas, {**_ACOES, "divergente": ["x"]}, 1)
    por_titulo = {p["titulo"].split()[0]: p for p in r}
    return (
        [p["id"] for p in r] == ["plan-00.01", "plan-00.02", "plan-00.03", "plan-00.04"]
        and r[0]["titulo"].startswith("Converter o `00-indice`")
        and r[0]["depende_de"] == []
        and r[1]["depende_de"] == ["plan-00.01"]
        and por_titulo["Migrar"]["depende_de"] == ["plan-00.01", "plan-00.02"]
        and por_titulo["Decidir"]["depende_de"] == ["plan-00.01", "plan-00.02"]
        and propostas({**_LACUNAS, "binding-sem-base": ["python"]}, _ACOES)[0]["depende_de"] == []
    )


def _caso_proximo() -> bool:
    novo = 'tipo: "processo"\nproximo_numero_plan: { "01": "04", "00": "03" } # mapa\n'
    return (
        proximo_da_familia(novo) == 3
        and proximo_da_familia('proximo_numero_plan: { "01": "04" }\n') == 1
        and proximo_da_familia('proximo_numero_plan: "05"\n') == 1
        and proximo_da_familia("proximo_numero_plan: {}\n") == 1
        and proximo_da_familia(None) == 1
    )


def _caso_direta() -> bool:
    nomes = [f"specs/n{i}.md" for i in range(5)]
    d = atualizacao_direta(
        {
            **_ACOES,
            "substituir": ["specs/a.md", "specs/b.md"],
            "substituir-politica": ["tools/x.mjs"],
            "adicionar": nomes,
        }
    )
    vazio = atualizacao_direta(_ACOES)
    return (
        (d["da-base"], d["tools"], d["novos"]) == (2, 1, 5)
        and len(d["nomes"]) == 5
        and d["resto"] == 3
        and vazio["resto"] == 0
        and not vazio["nomes"]
    )


def _caso_bloqueio() -> bool:
    ativo = {"situacao": "ativo", "raiz_git": "../X"}
    return (
        motivos_de_bloqueio(ativo, False, False) == []
        and motivos_de_bloqueio(ativo, True, True)
        == ["worktree sujo", ".sarak/ ignorado"]
        and motivos_de_bloqueio({"situacao": "adocao-posterior"}, True, True)
        == ["adocao-posterior"]
    )


def _caso_montagem() -> bool:
    direta = atualizacao_direta(
        {**_ACOES, "substituir": ["specs/a.md"], "adicionar": ["specs/b.md"]}
    )
    prop = propostas({**_LACUNAS, "binding-sem-base": ["python"]}, _ACOES)
    texto = montar_relatorio(
        [
            {
                "id": "x",
                "status": "desatualizado",
                "motivos": ["worktree sujo"],
                "direta": direta,
                "propostas": prop,
            },
            {
                "id": "y",
                "status": "atualizado",
                "motivos": [],
                "direta": atualizacao_direta(_ACOES),
                "propostas": [],
            },
            {
                "id": "z",
                "status": "desatualizado",
                "motivos": ["adocao-posterior"],
                "direta": None,
                "propostas": [],
            },
        ],
        "abc1234",
    )
    linhas = texto.splitlines()
    return (
        linhas[0] == "## Propagação — base abc1234 · 3 sistema(s)"
        and "### x · desatualizado · ⚠ worktree sujo" in linhas
        and "**Atualização direta:** 1 da base · 1 novos"
        in linhas
        and "- plan-00.01 Criar a base de linguagem que falta — binding(s) python"
        in linhas
        and "**Plans propostas:** nenhuma" in linhas
        and "**Atualização direta:** só o carimbo" in linhas
        and "### z · desatualizado · ⚠ adocao-posterior" in linhas
        and texto.count("**Plans propostas") == 2
    )


CASOS = [
    ("relatorio: plans propostas numeradas pela tabela, na ordem", _caso_propostas),
    (
        "relatorio: contador da familia 00 (formato novo, antigo, sem entrada)",
        _caso_proximo,
    ),
    ("relatorio: atualizacao direta agrupa e limita a 5 nomes", _caso_direta),
    ("relatorio: motivos de nao aplicavel agora", _caso_bloqueio),
    ("relatorio: Markdown na ordem — cabecalho, direta, plans", _caso_montagem),
]
