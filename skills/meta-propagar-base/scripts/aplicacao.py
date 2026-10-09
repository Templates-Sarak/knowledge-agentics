"""aplicacao.py — o APLICAR e o DESFAZER da propagacao (chamados pela CLI do `propagar.py`).

Aplicar: no branch CORRENTE do sistema (nunca cria branch), escreve SO o que o plano manda e SEM commit
— `adicionar`, `substituir`, `substituir-politica` e, com flag explicita por execucao, `divergente` e
`adicionar?`; e, por arquivo, o `divergente`/`conflito` dado em `--adotar`. `--manter ... --motivo` nao escreve
o arquivo: registra a decisao em `mantidos` no carimbo (que o aplicar preserva, descartando as vencidas).
Nunca: `conflito` sem `--adotar`, `obsoleto?` (nunca apaga), `bloqueado`,
molde de processo/conteudo presentes, codigo do projeto. Depois: carimbo `.sarak/base.json` (pelas
funcoes do `carimbo.py`), `00-resumo` (so sem migracao de familias pendente), gate (so modular),
manifesto `.sarak/propagacao-<curto>.json` e o `status` no `mapa.json`.

Desfazer: pelo manifesto — restaura do HEAD o que existia, apaga o que foi criado e restaura o status.
So desfaz se o HEAD do sistema e o mesmo do aplicar (o manifesto o registra) e se o worktree contem
EXATAMENTE as mudancas do manifesto; commit ou mudanca alheia = erro (reverter e decisao do usuario).

Nucleo x casca: `acoes_aplicaveis`, `compor`, `lacunas_restantes`, `pendencias`, `precondicoes`,
`precondicoes_desfazer`, `montar_manifesto`, `plano_de_desfazer` e `erros_de_desfazer` sao PUROS —
provados pelo `--autoteste` do `propagar.py` (este modulo nao tem CLI propria).
"""

import datetime
import json
import sys
from pathlib import Path

import propagar as pp

SEMPRE_APLICADAS = ("adicionar", "substituir", "substituir-politica")
SEMPRE_PENDENTES = ("conflito", "bloqueado", "obsoleto?")
DECIDIVEIS = ("divergente", "conflito")
RESUMO = "specs/panorama/00-resumo.md"
PLANEJAMENTO = "specs/panorama/00-planejamento.md"
SARAK_IGNORADO = (
    "o `.sarak/` está no `.gitignore` — o carimbo não seria versionado e a próxima propagação veria o "
    "sistema sem carimbo; remover a regra é decisão do usuário"
)


# ------------------------------------------------------------------ nucleo


def acoes_aplicaveis(acoes: dict, flags: dict) -> list:
    """Nucleo: `[(rel, acao)]` a escrever. `flags` = {divergentes, adicionar}; `bloqueado` nunca entra."""
    escolhidas = [
        *SEMPRE_APLICADAS,
        *(["divergente"] if flags.get("divergentes") else []),
        *(["adicionar?"] if flags.get("adicionar") else []),
    ]
    gerais = [(rel, acao) for acao in escolhidas for rel in acoes.get(acao, [])]
    ja = {rel for rel, _ in gerais}
    adotados = [
        (rel, "adotar")
        for acao in DECIDIVEIS
        for rel in acoes.get(acao, [])
        if rel in flags.get("adotar", ()) and rel not in ja
    ]
    return gerais + adotados


def decidiveis(acoes: dict) -> set:
    """Nucleo: o que aceita decisao por arquivo — os `divergente` e `conflito` do plano."""
    return {rel for acao in DECIDIVEIS for rel in acoes.get(acao, [])}


def erros_de_decisao(adotar: list, manter: list, motivos: list, acoes_por_id: dict) -> list:
    """Nucleo: os erros de `--adotar`/`--manter`/`--motivo` (vazio = pode aplicar). Cada caminho precisa estar
    em `divergente`/`conflito` de algum dos sistemas escolhidos; cada `--manter` leva o seu `--motivo`."""
    erros = (
        [f"cada --manter precisa do seu --motivo e vice-versa ({len(manter)} --manter, {len(motivos)} --motivo)"]
        if len(manter) != len(motivos)
        else [f"--motivo vazio para {c}" for c, m in zip(manter, motivos) if not m.strip()]
    )
    erros += [f"{c}: em --adotar e em --manter" for c in sorted(set(adotar) & set(manter))]
    possiveis = set().union(*(decidiveis(a) for a in acoes_por_id.values())) if acoes_por_id else set()
    erros += [
        f"{c}: nao esta em divergente/conflito — so esses aceitam --adotar/--manter"
        for c in dict.fromkeys([*adotar, *manter])
        if c not in possiveis
    ]
    return erros


def decisoes_do_sistema(acoes: dict, adotar: list, manter: list, motivos: list) -> tuple:
    """Nucleo: `(adotar, [(rel, motivo)])` que cabem a um sistema (o caminho esta no `divergente`/`conflito` dele)."""
    aqui = decidiveis(acoes)
    return (
        [r for r in adotar if r in aqui],
        [(r, m) for r, m in zip(manter, motivos, strict=False) if r in aqui],
    )


def entrada_mantida(rel: str, motivo: str, texto_sistema: str, texto_ref: str) -> dict:
    """Nucleo: a entrada de `mantidos` no carimbo — o sha1 do conteudo normalizado dos dois lados."""
    return {
        "caminho": rel,
        "motivo": motivo,
        "sha1_sistema": pp.sha1_comparavel(rel, texto_sistema),
        "sha1_referencia": pp.sha1_comparavel(rel, texto_ref),
    }


def mesclar_mantidos(validos: list, novos: list, adotados: list) -> list:
    """Nucleo: os `mantidos` do carimbo novo — as decisoes validas que seguem de pe (menos as adotadas agora)
    mais as novas (que substituem a antiga do mesmo caminho). As vencidas ja ficaram de fora."""
    por_caminho = {e["caminho"]: e for e in validos if e["caminho"] not in adotados}
    por_caminho.update({e["caminho"]: e for e in novos})
    return [por_caminho[c] for c in sorted(por_caminho)]


def _tipo_de_titulo(linha: str) -> str:
    return "titulo" if linha.startswith("titulo:") else "h1"


def compor(rel: str, texto_ref: str, texto_sistema: str | None) -> str:
    """Nucleo: o arquivo a escrever — o corpo da referencia com as linhas de titulo DO SISTEMA (pareadas
    por tipo: `titulo:` com `titulo:`, H1 com H1) e o fim de linha do sistema."""
    if texto_sistema is None:
        return texto_ref
    ref, sis = (
        pp.normalizar(texto_ref).split("\n"),
        pp.normalizar(texto_sistema).split("\n"),
    )
    do_sistema = {
        _tipo_de_titulo(sis[i]): sis[i] for i in pp.linhas_de_titulo(rel, sis)
    }
    for i in pp.linhas_de_titulo(rel, ref):
        ref[i] = do_sistema.get(_tipo_de_titulo(ref[i]), ref[i])
    saida = "\n".join(ref)
    return saida.replace("\n", "\r\n") if "\r\n" in texto_sistema else saida


def lacunas_restantes(falta: dict, escritos: set) -> dict:
    """Nucleo: as lacunas que sobram depois de escrever `escritos` (o planejamento e as bases adicionados
    resolvem as suas)."""
    return {
        **falta,
        "sem-planejamento": falta["sem-planejamento"] and PLANEJAMENTO not in escritos,
        "binding-sem-base": [
            b
            for b in falta["binding-sem-base"]
            if f"specs/arquitetura/00-base-{b}.md" not in escritos
        ],
    }


def pendencias(acoes: dict, escritos: set, falta: dict, gate: dict | None) -> list:
    """Nucleo: o que sobrou para decisao humana. Vazio -> `atualizado`; senao `pendente`. `escritos` = o que
    foi escrito ou decidido (`--adotar`/`--manter`) agora; `mantido` nunca e pendencia."""
    motivos = []
    for acao in SEMPRE_PENDENTES:
        restam = [r for r in acoes.get(acao, []) if r not in escritos]
        motivos += [f"{acao}: {len(restam)}"] if restam else []
    for acao in ("divergente", "adicionar?"):
        faltam = [r for r in acoes.get(acao, []) if r not in escritos]
        motivos += [f"{acao} nao aplicado: {len(faltam)}"] if faltam else []
    sobra = lacunas_restantes(falta, escritos)
    motivos += [f"lacuna {chave}" for chave, valor in sobra.items() if valor]
    if gate is not None and gate["codigo"] != 0:
        motivos.append(f"gate reprovado (exit {gate['codigo']})")
    return motivos


def _erros_do_sistema(sistema: dict | None, ident: str) -> list:
    if sistema is None:
        return [f"{ident}: nao esta no mapa"]
    erros = (
        []
        if sistema.get("situacao") == "ativo"
        else [
            f"{ident}: situacao '{sistema.get('situacao')}' (so 'ativo' recebe propagacao)"
        ]
    )
    return erros + (
        [] if sistema.get("raiz_git") else [f"{ident}: sem raiz_git no mapa"]
    )


def _erros_de_grupo(ids: list, sistemas: list) -> list:
    erros = []
    for raiz in sorted(
        {s["raiz_git"] for s in sistemas if s.get("id") in ids and s.get("raiz_git")}
    ):
        grupo = sorted(s["id"] for s in sistemas if s.get("raiz_git") == raiz)
        faltam = [i for i in grupo if i not in ids]
        erros += (
            [
                f"monorepo {raiz}: aplique/desfaca o grupo inteiro na mesma chamada — {', '.join(grupo)} (faltou {', '.join(faltam)})"
            ]
            if faltam
            else []
        )
    return erros


def precondicoes_desfazer(ids: list, sistemas: list) -> list:
    """Nucleo: ids conhecidos, com raiz_git, e o grupo de monorepo inteiro."""
    por_id = {s["id"]: s for s in sistemas}
    erros = [
        e
        for i in ids
        for e in _erros_do_sistema(por_id.get(i), i)
        if "situacao" not in e
    ]
    return erros + _erros_de_grupo(ids, sistemas)


def precondicoes(ids: list, sistemas: list, fatos: dict) -> list:
    """Nucleo: os erros que impedem aplicar. `fatos` = {base_suja: [linhas], ignorados: [ids com o
    `.sarak/base.json` num .gitignore], repos: {raiz_git: {limpo, head}}}. Qualquer erro -> nada e escrito."""
    por_id = {s["id"]: s for s in sistemas}
    erros = [] if ids else ["informe ao menos um --id"]
    erros += [e for i in ids for e in _erros_do_sistema(por_id.get(i), i)]
    erros += [f"{i}: {SARAK_IGNORADO}" for i in fatos["ignorados"]]
    erros += (
        [
            f"base com alteracoes locais alem do mapa.json: {', '.join(fatos['base_suja'])}"
        ]
        if fatos["base_suja"]
        else []
    )
    erros += _erros_de_grupo(ids, sistemas)
    for raiz, repo in sorted(fatos["repos"].items()):
        erros += (
            []
            if repo["limpo"]
            else [f"{raiz}: worktree sujo — aplicar sobre trabalho alheio e proibido"]
        )
        erros += [] if repo["head"] else [f"{raiz}: repositorio sem commit (HEAD)"]
    return erros


def montar_manifesto(meta: dict, arquivos: list) -> dict:
    """Nucleo: o manifesto da aplicacao. `meta` = {id, base_commit, head_no_aplicar,
    status_anterior, status_base_anterior}; `arquivos` = [{caminho, acao, existia, no_head, anterior}]."""
    return {**meta, "arquivos": sorted(arquivos, key=lambda a: a["caminho"])}


def _caminho_da_porcelana(linha: str) -> str:
    caminho = linha[3:].split(" -> ")[-1]
    return (
        caminho[1:-1] if caminho.startswith('"') and caminho.endswith('"') else caminho
    )


def plano_de_desfazer(manifestos: list, sujas: list) -> dict:
    """Nucleo: o que restaurar do HEAD, reescrever (existia fora do HEAD), apagar (criado) — e o que no
    worktree e ALHEIO ao manifesto (erro: so se desfaz exatamente o que se aplicou)."""
    arquivos = {a["caminho"]: a for m in manifestos for a in m["arquivos"]}
    return {
        "restaurar": sorted(c for c, a in arquivos.items() if a["no_head"]),
        "reescrever": sorted(
            c for c, a in arquivos.items() if a["existia"] and not a["no_head"]
        ),
        "apagar": sorted(c for c, a in arquivos.items() if not a["existia"]),
        "alheios": sorted(
            c for c in map(_caminho_da_porcelana, sujas) if c not in arquivos
        ),
    }


def erros_de_desfazer(manifestos: list, head_atual: str | None, sujas: list) -> list:
    """Nucleo: o que impede desfazer um repositorio — o HEAD mudou desde o aplicar (o usuario ja commitou:
    reverter e decisao dele) ou ha mudanca no worktree alheia ao manifesto."""
    esperado = manifestos[0]["head_no_aplicar"]
    erros = (
        [
            f"o HEAD do sistema mudou desde o aplicar ({str(esperado)[:7]} -> {str(head_atual)[:7]}) — o resultado ja foi commitado; reverter (git revert) e decisao sua"
        ]
        if head_atual != esperado
        else []
    )
    alheios = plano_de_desfazer(manifestos, sujas)["alheios"]
    return erros + (
        [f"mudancas ALHEIAS ao manifesto: {', '.join(alheios)}"] if alheios else []
    )


# ------------------------------------------------------------------ casca: apoio


def _carimbo():
    """O modulo `carimbo.py` da `meta-iniciar-repositorio` — reaproveitado, nunca copiado."""
    pasta = str(
        Path(__file__).resolve().parents[2] / "meta-iniciar-repositorio" / "scripts"
    )
    if pasta not in sys.path:
        sys.path.insert(0, pasta)
    import carimbo

    return carimbo


def _ler_mapa(raiz: Path, args) -> tuple:
    caminho = Path(args.mapa or raiz / "mapa.json")
    return caminho, json.loads(caminho.read_text(encoding="utf-8"))


def _gravar_mapa(caminho: Path, mapa: dict) -> None:
    caminho.write_text(_carimbo().serializar(mapa), encoding="utf-8", newline="\n")


def _base_suja_alem_do_mapa(raiz: Path) -> list:
    return [
        linha
        for linha in pp.linhas_sujas(raiz)
        if _caminho_da_porcelana(linha) != "mapa.json"
    ]


def _repo(raiz: Path, sistema: dict) -> Path:
    return (raiz / sistema["raiz_git"]).resolve()


def _fatos_do_repo(repo: Path) -> dict:
    return {
        "limpo": not pp.linhas_sujas(repo),
        "head": pp.git(repo, "rev-parse", "HEAD"),
    }


def _rel_no_repo(repo: Path, arquivo: Path) -> str:
    return arquivo.resolve().relative_to(repo).as_posix()


def _registro(repo: Path, arquivo: Path, acao: str) -> dict:
    """Como o arquivo estava ANTES de ser escrito — o que o desfazer precisa."""
    rel = _rel_no_repo(repo, arquivo)
    existia = arquivo.is_file()
    no_head = existia and pp.git(repo, "cat-file", "-e", f"HEAD:{rel}") is not None
    anterior = (
        arquivo.read_text(encoding="utf-8", errors="replace")
        if existia and not no_head
        else None
    )
    return {
        "caminho": rel,
        "acao": acao,
        "existia": existia,
        "no_head": no_head,
        "anterior": anterior,
    }


def _escrever(repo: Path, arquivo: Path, conteudo: str, acao: str) -> dict:
    registro = _registro(repo, arquivo, acao)
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_bytes(conteudo.encode("utf-8"))
    return registro


# ------------------------------------------------------------------ casca: aplicar um sistema


def _bruto(arquivo: Path) -> str | None:
    """O texto como esta no disco (o `ler_arvore` normaliza o fim de linha; o `compor` precisa do original)."""
    return (
        arquivo.read_bytes().decode("utf-8", errors="replace")
        if arquivo.is_file()
        else None
    )


def _escrever_plano(contexto: dict, plano: dict, ref: dict) -> list:
    pasta, repo = contexto["pasta"], contexto["repo"]
    return [
        _escrever(repo, pasta / rel, compor(rel, ref[rel], _bruto(pasta / rel)), acao)
        for rel, acao in acoes_aplicaveis(plano["acoes"], contexto["flags"])
    ]


def _escrever_carimbo(contexto: dict, sistema: dict, mantidos: list) -> dict:
    carimbo = _carimbo()
    estado = {
        **carimbo.estado_da_base(contexto["raiz"]),
        "sujo": bool(_base_suja_alem_do_mapa(contexto["raiz"])),
    }
    info = {
        "tipo": sistema["tipo"],
        "modular": sistema["modular"],
        "bindings": sistema["bindings"],
    }
    dados = carimbo.montar_carimbo(
        estado, info, datetime.datetime.now(datetime.UTC).date().isoformat()
    )
    dados.update({"mantidos": mantidos} if mantidos else {})
    return _escrever(
        contexto["repo"],
        contexto["pasta"] / ".sarak" / "base.json",
        carimbo.serializar(dados),
        "carimbo",
    )


def _regenerar_resumo(contexto: dict, falta: dict) -> tuple:
    """`(registro ou None, nota)` — so regenera sem migracao de familias pendente (senao o resumo mentiria)."""
    pasta = contexto["pasta"]
    if falta["migracao-de-familias-pendente"]:
        return None, "resumo não regenerado: migração de famílias pendente"
    if not (pasta / PLANEJAMENTO).is_file():
        return None, "resumo não regenerado: sem panorama/00-planejamento.md"
    registro = _registro(contexto["repo"], pasta / RESUMO, "regenerar")
    script = (
        contexto["raiz"] / "skills" / "spec-panorama" / "scripts" / "gerar_resumo.py"
    )
    pp.rodar([sys.executable, str(script), "--specs", str(pasta / "specs")])
    return registro, "resumo regenerado"


def _rodar_gate(pasta: Path, sistema: dict) -> dict | None:
    if not sistema["modular"]:
        return None
    r = pp.rodar(["node", "tools/gate/validate.mjs", "--all"], cwd=pasta)
    saida = (r.stdout + r.stderr).decode("utf-8", errors="replace").strip().splitlines()
    return {"codigo": r.returncode, "resumo": saida[-6:]}


def _gravar_manifesto(contexto: dict, sistema: dict, arquivos: list) -> Path:
    destino = contexto["pasta"] / ".sarak" / f"propagacao-{contexto['curto']}.json"
    arquivos = [*arquivos, _registro(contexto["repo"], destino, "manifesto")]
    meta = {
        "id": sistema["id"],
        "base_commit": contexto["head"],
        "head_no_aplicar": contexto["head_repo"],
        "status_anterior": sistema.get("status"),
        "status_base_anterior": sistema.get("status_base"),
    }
    destino.write_text(
        _carimbo().serializar(montar_manifesto(meta, arquivos)),
        encoding="utf-8",
        newline="\n",
    )
    return destino


def aplicar_sistema(contexto: dict, sistema: dict) -> dict:
    """Casca: aplica num sistema (no branch corrente do repositorio). Devolve o resultado para o relatorio e o mapa."""
    plano, ref, lido = contexto["analises"][sistema["id"]]
    if "erro" in plano:
        return {"id": sistema["id"], "erro": plano["erro"]}
    adotar, manter = decisoes_do_sistema(plano["acoes"], *contexto["decisoes"])
    contexto = {
        **contexto,
        "pasta": (contexto["raiz"] / sistema["caminho"]).resolve(),
        "flags": {**contexto["flags"], "adotar": adotar},
    }
    novos = [entrada_mantida(r, m, lido[r], ref[r]) for r, m in manter]
    mantidos = mesclar_mantidos(plano["mantidos-validos"], novos, adotar)
    arquivos = _escrever_plano(contexto, plano, ref) + [
        _escrever_carimbo(contexto, sistema, mantidos)
    ]
    resumo, nota = _regenerar_resumo(contexto, plano["lacunas"])
    arquivos += [resumo] if resumo else []
    gate = _rodar_gate(contexto["pasta"], sistema)
    escritos = {
        (contexto["repo"] / a["caminho"]).relative_to(contexto["pasta"]).as_posix()
        for a in arquivos
    }
    decididos = escritos | {r for r, _ in manter}
    motivos = pendencias(plano["acoes"], decididos, plano["lacunas"], gate)
    manifesto = _gravar_manifesto(contexto, sistema, arquivos)
    return {
        "id": sistema["id"],
        "plano": plano,
        "arquivos": arquivos,
        "mantidos": [r for r, _ in manter],
        "vencidos": plano["mantidos-vencidos"],
        "nota": nota,
        "gate": gate,
        "pendencias": motivos,
        "status": "pendente" if motivos else "atualizado",
        "manifesto": manifesto,
    }


# ------------------------------------------------------------------ casca: aplicar (CLI)


def _imprimir_resultado(resultado: dict) -> None:
    if "erro" in resultado:
        print(f"=== {resultado['id']}\n  [ERRO] {resultado['erro']}")
        return
    contagem = {}
    for arquivo in resultado["arquivos"]:
        contagem[arquivo["acao"]] = contagem.get(arquivo["acao"], 0) + 1
    print(f"=== {resultado['id']} — status: {resultado['status']}")
    print("  aplicado: " + " · ".join(f"{a} {n}" for a, n in sorted(contagem.items())))
    print(f"  {resultado['nota']}")
    print(f"  mantidos agora: {', '.join(resultado['mantidos']) or '—'}")
    if resultado["vencidos"]:
        print(f"  decisoes `mantido` vencidas (descartadas): {', '.join(resultado['vencidos'])}")
    gate = resultado["gate"]
    print(
        "  gate: nao se aplica (nao modular)"
        if gate is None
        else f"  gate: exit {gate['codigo']} — {' | '.join(gate['resumo'][-2:])}"
    )
    print(f"  pendente: {'; '.join(resultado['pendencias']) or '—'}")
    print(f"  manifesto: {resultado['manifesto']}")


def _instrucoes(repos: dict) -> None:
    for raiz, repo in repos.items():
        print(f"\n--- {raiz}: git diff --stat (rastreados) + novos")
        print(
            pp.git(repo["caminho"], "diff", "--stat")
            or "(sem mudanca em arquivo rastreado)"
        )
        novos = [
            linha
            for linha in pp.linhas_sujas(repo["caminho"])
            if linha.startswith("??")
        ]
        print(f"  novos (nao rastreados): {len(novos)}")
    print(
        "\nProximos passos (HITL): o executor confere o diff; o revisor aprova; o usuario commita no repositorio e o mapa.json na base."
    )
    print(
        "Para voltar atras antes de commitar: propagar.py --desfazer --id <os mesmos ids> (recusa se o HEAD mudou)."
    )


def _fatos_para_aplicar(raiz: Path, args, sistemas: list) -> dict:
    """`--permitir-base-suja` existe SO para teste/desenvolvimento: a referencia vem do HEAD (worktree)."""
    escolhidos = [s for s in sistemas if s["id"] in args.id and s.get("raiz_git")]
    repos = {s["raiz_git"]: _fatos_do_repo(_repo(raiz, s)) for s in escolhidos}
    suja = [] if args.permitir_base_suja else _base_suja_alem_do_mapa(raiz)
    ignorados = [
        s["id"]
        for s in escolhidos
        if pp.sarak_ignorado((raiz / s["caminho"]).resolve())
    ]
    return {"base_suja": suja, "ignorados": ignorados, "repos": repos}


def _contexto_base(args, raiz: Path, head: str) -> dict:
    flags = {
        "divergentes": args.incluir_divergentes,
        "adicionar": args.incluir_adicionar,
    }
    return {
        "raiz": raiz,
        "head": head,
        "curto": head[:7],
        "flags": flags,
        "decisoes": (
            [c.replace("\\", "/") for c in args.adotar],
            [c.replace("\\", "/") for c in args.manter],
            list(args.motivo),
        ),
        "cache": {},
    }


def _falhar(erros: list) -> int:
    print("\n".join(f"[ERRO] {e}" for e in erros), file=sys.stderr)
    return 2


def _erros_das_decisoes(base: dict, analises: dict) -> list:
    """Valida `--adotar`/`--manter`/`--motivo` contra o plano de TODOS os sistemas, antes de escrever."""
    acoes = {i: a[0]["acoes"] for i, a in analises.items() if "erro" not in a[0]}
    adotar, manter, motivos = base["decisoes"]
    return erros_de_decisao(adotar, manter, motivos, acoes)


def aplicar(args, raiz: Path) -> int:
    """Casca da CLI `--aplicar`: pre-condicoes, analise e decisoes validadas ANTES de escrever, aplicacao por
    sistema no branch corrente, status no mapa, relatorio."""
    caminho_do_mapa, mapa = _ler_mapa(raiz, args)
    head = pp.git(raiz, "rev-parse", "HEAD")
    fatos = _fatos_para_aplicar(raiz, args, mapa["sistemas"])
    erros = precondicoes(args.id, mapa["sistemas"], fatos)
    if erros:
        return _falhar(erros)
    escolhidos = [s for s in mapa["sistemas"] if s["id"] in args.id]
    base = _contexto_base(args, raiz, head)
    base["analises"] = {
        s["id"]: pp.analisar_sistema(raiz, s, head, base["cache"]) for s in escolhidos
    }
    erros = _erros_das_decisoes(base, base["analises"])
    if erros:
        return _falhar(erros)
    repos = {
        r: {"caminho": (raiz / r).resolve(), "head": f["head"]}
        for r, f in fatos["repos"].items()
    }
    for sistema in escolhidos:
        repo = repos[sistema["raiz_git"]]
        resultado = aplicar_sistema(
            {**base, "repo": repo["caminho"], "head_repo": repo["head"]},
            sistema,
        )
        _imprimir_resultado(resultado)
        if "erro" not in resultado:
            sistema.update({"status": resultado["status"], "status_base": head[:7]})
            _gravar_mapa(caminho_do_mapa, mapa)
    _instrucoes(repos)
    return 0


# ------------------------------------------------------------------ casca: desfazer


def _manifestos_do_grupo(raiz: Path, sistemas: list) -> tuple:
    """O manifesto de cada sistema e o do `status_base` (o curto do ultimo aplicar, gravado no mapa)."""
    manifestos, erros = [], []
    for sistema in sistemas:
        curto = sistema.get("status_base")
        caminho = (
            (raiz / sistema["caminho"]).resolve() / ".sarak" / f"propagacao-{curto}.json"
        )
        if curto and caminho.is_file():
            manifestos.append(json.loads(caminho.read_text(encoding="utf-8")))
        else:
            erros.append(
                f"{sistema['id']}: manifesto de propagacao nao encontrado (status_base {curto or 'vazio'})"
            )
    return manifestos, erros


def _apagar_com_pastas_vazias(repo: Path, rel: str) -> None:
    arquivo = repo / rel
    if arquivo.is_file():
        arquivo.unlink()
    pasta = arquivo.parent
    while pasta != repo and pasta.is_dir() and not any(pasta.iterdir()):
        pasta.rmdir()
        pasta = pasta.parent


def _executar_desfazer(repo: Path, plano: dict, manifestos: list) -> None:
    if plano["restaurar"]:
        pp.rodar(
            [
                "git",
                "-C",
                str(repo),
                "restore",
                "--source=HEAD",
                "--staged",
                "--worktree",
                "--",
                *plano["restaurar"],
            ]
        )
    fora_do_head = plano["reescrever"] + plano["apagar"]
    if (
        fora_do_head
    ):  # se o usuario deu `git add`, o arquivo sai do indice antes (senao fica "AD")
        pp.rodar(
            [
                "git",
                "-C",
                str(repo),
                "rm",
                "-q",
                "--cached",
                "--ignore-unmatch",
                "--",
                *fora_do_head,
            ]
        )
    anteriores = {
        a["caminho"]: a["anterior"] for m in manifestos for a in m["arquivos"]
    }
    for rel in plano["reescrever"]:
        (repo / rel).write_bytes(anteriores[rel].encode("utf-8"))
    for rel in plano["apagar"]:
        _apagar_com_pastas_vazias(repo, rel)


def _desfazer_repo(raiz: Path, grupo: list) -> tuple:
    """`(manifestos, erros)` de um repositorio; sem erro, ja desfeito no disco (o branch nao e tocado)."""
    repo = _repo(raiz, grupo[0])
    manifestos, erros = _manifestos_do_grupo(raiz, grupo)
    if not erros:
        sujas = pp.linhas_sujas(repo)
        erros = [
            f"{repo}: {e}"
            for e in erros_de_desfazer(
                manifestos, pp.git(repo, "rev-parse", "HEAD"), sujas
            )
        ]
    if erros:
        return [], erros
    _executar_desfazer(
        repo, plano_de_desfazer(manifestos, pp.linhas_sujas(repo)), manifestos
    )
    return manifestos, []


def desfazer(args, raiz: Path) -> int:
    """Casca da CLI `--desfazer`: por repositorio, restaura pelo manifesto e devolve o status anterior."""
    caminho_do_mapa, mapa = _ler_mapa(raiz, args)
    erros = precondicoes_desfazer(args.id, mapa["sistemas"]) or (
        [] if args.id else ["informe ao menos um --id"]
    )
    if erros:
        print("\n".join(f"[ERRO] {e}" for e in erros), file=sys.stderr)
        return 2
    escolhidos = [s for s in mapa["sistemas"] if s["id"] in args.id]
    for raiz_git in sorted({s["raiz_git"] for s in escolhidos}):
        manifestos, erros = _desfazer_repo(
            raiz, [s for s in escolhidos if s["raiz_git"] == raiz_git]
        )
        if erros:
            print("\n".join(f"[ERRO] {e}" for e in erros), file=sys.stderr)
            return 2
        for manifesto in manifestos:
            sistema = next(s for s in mapa["sistemas"] if s["id"] == manifesto["id"])
            sistema.update(
                {
                    "status": manifesto["status_anterior"],
                    "status_base": manifesto["status_base_anterior"],
                }
            )
        _gravar_mapa(caminho_do_mapa, mapa)
        print(
            f"[OK] {raiz_git}: desfeito — branch inalterado, status restaurado ({', '.join(m['id'] for m in manifestos)})."
        )
    return 0


# ------------------------------------------------------------------ autoteste (rodado pelo propagar.py)

_ACOES = {
    **{a: [] for a in pp.ORDEM_DAS_ACOES},
    "adicionar": ["a"],
    "substituir": ["s"],
    "substituir-politica": ["t"],
    "divergente": ["d"],
    "adicionar?": ["q"],
    "bloqueado": ["b"],
    "conflito": ["c"],
}
_VAZIAS = {a: [] for a in pp.ORDEM_DAS_ACOES}
_FALTA_LIMPA = {
    "lei-ou-fundacao-fora-do-reservado": [],
    "migracao-de-familias-pendente": [],
    "molde-em-formato-antigo": [],
    "binding-sem-base": [],
    "sem-planejamento": False,
    "sarak-ignorado": False,
}
_SIS = [
    {"id": "x", "situacao": "ativo", "raiz_git": "../X"},
    {"id": "r1", "situacao": "ativo", "raiz_git": "../R"},
    {"id": "r2", "situacao": "ativo", "raiz_git": "../R"},
    {"id": "chat", "situacao": "adocao-posterior", "raiz_git": "../C"},
]
_REPO_OK = {"limpo": True, "head": "a" * 40}


def _erros(
    ids: list, base_suja: list | None = None, ignorados: tuple = (), **repo
) -> list:
    raizes = {s["raiz_git"] for s in _SIS if s["id"] in ids}
    return precondicoes(
        ids,
        _SIS,
        {
            "base_suja": base_suja or [],
            "ignorados": list(ignorados),
            "repos": {r: {**_REPO_OK, **repo} for r in raizes},
        },
    )


def _caso_compor() -> bool:
    ref_base = '---\ntitulo: "Arquitetura Base: TypeScript"\n---\n\n# Arquitetura Base\nnovo corpo\n'
    sis_base = '---\r\ntitulo: "Arquitetura: ERP (TypeScript)"\r\n---\r\n\r\n# Arquitetura do ERP\r\ncorpo velho\r\n'
    composto = compor("specs/arquitetura/00-base-typescript.md", ref_base, sis_base)
    readme = compor(
        "specs/README.md", "# Ref\ncorpo novo\n", "# Meu Sistema\ncorpo velho\n"
    )
    return (
        composto
        == '---\r\ntitulo: "Arquitetura: ERP (TypeScript)"\r\n---\r\n\r\n# Arquitetura do ERP\r\nnovo corpo\r\n'
        and readme == "# Meu Sistema\ncorpo novo\n"
        and compor("specs/00-knowledge.md", "# R\nx\n", "# S\ny\n") == "# R\nx\n"
    )


def _arq(caminho: str, existia: bool, no_head: bool, anterior=None) -> dict:
    return {
        "caminho": caminho,
        "acao": "x",
        "existia": existia,
        "no_head": no_head,
        "anterior": anterior,
    }


def _caso_desfazer() -> bool:
    manifesto = montar_manifesto(
        {"id": "x"},
        [
            _arq("specs/00-knowledge.md", True, True),
            _arq(".sarak/base.json", True, False, "{}"),
            _arq("specs/panorama/00-planejamento.md", False, False),
        ],
    )
    plano = plano_de_desfazer(
        [manifesto],
        [
            " M specs/00-knowledge.md",
            "?? specs/panorama/00-planejamento.md",
            " M src/app.ts",
        ],
    )
    return (
        plano["restaurar"] == ["specs/00-knowledge.md"]
        and plano["reescrever"] == [".sarak/base.json"]
        and plano["apagar"] == ["specs/panorama/00-planejamento.md"]
        and plano["alheios"] == ["src/app.ts"]
    )


def _caso_erros_de_desfazer() -> bool:
    manifesto = montar_manifesto(
        {"id": "x", "head_no_aplicar": "a" * 40}, [_arq("specs/a.md", False, False)]
    )
    propria = ["?? specs/a.md"]
    return (
        erros_de_desfazer([manifesto], "a" * 40, propria) == []
        and "HEAD do sistema mudou" in erros_de_desfazer([manifesto], "b" * 40, [])[0]
        and "ALHEIAS" in erros_de_desfazer([manifesto], "a" * 40, [" M src/x.ts"])[0]
    )


def _caso_decisao() -> bool:
    acoes = {**_VAZIAS, "divergente": ["a", "b"], "conflito": ["c"], "substituir": ["s"]}
    todas = acoes_aplicaveis(acoes, {"adotar": ["a", "c", "s"]})
    so_adotar = [(r, x) for r, x in todas if x == "adotar"]
    ja_incluido = acoes_aplicaveis(acoes, {"divergentes": True, "adotar": ["a"]})
    por_id = {"x": acoes}
    return (
        so_adotar == [("a", "adotar"), ("c", "adotar")]
        and ("s", "substituir") in todas
        and [r for r, _ in ja_incluido].count("a") == 1
        and erros_de_decisao(["a"], ["b"], ["motivo"], por_id) == []
        and len(erros_de_decisao(["s"], [], [], por_id)) == 1
        and len(erros_de_decisao([], ["a"], [], por_id)) == 1
        and len(erros_de_decisao(["a"], ["a"], ["m"], por_id)) == 1
        and len(erros_de_decisao([], ["b"], [" "], por_id)) == 1
        and decisoes_do_sistema(acoes, ["a", "z"], ["c"], ["m"]) == (["a"], [("c", "m")])
    )


def _caso_mantido() -> bool:
    rel = "specs/00-knowledge.md"
    entrada = entrada_mantida(rel, "x", "meu\r\ncorpo\r\n", "ref\n")
    plano = {"acoes": {**_VAZIAS, "divergente": [rel], "conflito": ["specs/b.md"]}}
    ref = {rel: "ref\n", "specs/b.md": "r"}
    vale = pp.aplicar_mantidos(plano, {rel: "meu\ncorpo\n", "specs/b.md": "s"}, ref, [entrada])
    editou = pp.aplicar_mantidos(plano, {rel: "meu\ncorpo2\n", "specs/b.md": "s"}, ref, [entrada])
    base_mudou = pp.aplicar_mantidos(plano, {rel: "meu\ncorpo\n"}, {rel: "ref2\n"}, [entrada])
    novo = {**entrada, "motivo": "y"}
    return (
        len(entrada["sha1_sistema"]) == 40
        and vale["acoes"]["mantido"] == [rel]
        and vale["acoes"]["divergente"] == []
        and vale["acoes"]["conflito"] == ["specs/b.md"]
        and vale["mantidos"] == {rel: "x"}
        and editou["acoes"]["divergente"] == [rel]
        and editou["mantidos-vencidos"] == [rel]
        and base_mudou["acoes"]["mantido"] == []
        and mesclar_mantidos([entrada], [novo], []) == [novo]
        and mesclar_mantidos([entrada], [], [rel]) == []
    )


def _caso_status_mantido() -> bool:
    acoes = {**_VAZIAS, "mantido": ["m"], "conflito": ["c"], "divergente": ["d"]}
    sem = pendencias(acoes, {"c", "d"}, _FALTA_LIMPA, {"codigo": 0})
    com = pendencias(acoes, set(), _FALTA_LIMPA, {"codigo": 0})
    return sem == [] and len(com) == 2


CASOS = [
    (
        "aplicar: so adicionar/substituir/politica por padrao",
        lambda: (
            [a for _, a in acoes_aplicaveis(_ACOES, {})]
            == ["adicionar", "substituir", "substituir-politica"]
        ),
    ),
    (
        "aplicar: flags incluem divergente e adicionar?, nunca bloqueado/conflito",
        lambda: (
            [
                r
                for r, _ in acoes_aplicaveis(
                    _ACOES, {"divergentes": True, "adicionar": True}
                )
            ]
            == ["a", "s", "t", "d", "q"]
        ),
    ),
    (
        "compor: corpo da referencia com o titulo do sistema e o fim de linha dele",
        _caso_compor,
    ),
    (
        "status: limpo e gate verde -> sem pendencia",
        lambda: (
            pendencias(
                {
                    **_ACOES,
                    "divergente": [],
                    "adicionar?": [],
                    "bloqueado": [],
                    "conflito": [],
                },
                set(),
                _FALTA_LIMPA,
                {"codigo": 0},
            )
            == []
        ),
    ),
    (
        "status: conflito, divergente nao aplicado, bloqueado e gate vermelho pendem",
        lambda: len(pendencias(_ACOES, {"d"}, _FALTA_LIMPA, {"codigo": 1})) == 4,
    ),
    (
        "status: planejamento e base adicionados resolvem as lacunas",
        lambda: (
            lacunas_restantes(
                {
                    **_FALTA_LIMPA,
                    "sem-planejamento": True,
                    "binding-sem-base": ["python"],
                },
                {PLANEJAMENTO, "specs/arquitetura/00-base-python.md"},
            )
            == _FALTA_LIMPA
        ),
    ),
    ("pre-condicoes: tudo certo -> nenhum erro", lambda: _erros(["x"]) == []),
    (
        "pre-condicoes: worktree sujo e base suja (sem checagem de branch)",
        lambda: len(_erros(["x"], ["src/a.py"], limpo=False)) == 2,
    ),
    (
        "pre-condicoes: qualquer branch corrente serve, mas e preciso ter commit",
        lambda: _erros(["x"], head=None) == ["../X: repositorio sem commit (HEAD)"],
    ),
    (
        "pre-condicoes: monorepo pela metade e adocao-posterior",
        lambda: (
            any("monorepo ../R" in e for e in _erros(["r1"]))
            and any("adocao-posterior" in e for e in _erros(["chat"]))
        ),
    ),
    (
        "pre-condicoes: .sarak/ no .gitignore e erro (nada escrito)",
        lambda: _erros(["x"], ignorados=("x",)) == [f"x: {SARAK_IGNORADO}"],
    ),
    ("desfazer: restaura, reescreve, apaga e acusa o alheio", _caso_desfazer),
    ("decisao: --adotar filtra divergente/conflito; erros de caminho e de motivo", _caso_decisao),
    ("mantido: entrada com sha1 normalizado; so vale com os dois sha1 iguais", _caso_mantido),
    ("status: mantido nao e pendencia; conflito/divergente decididos agora tambem nao", _caso_status_mantido),
    ("desfazer: recusa HEAD mudado e mudanca alheia", _caso_erros_de_desfazer),
    (
        "desfazer: monorepo pela metade e erro",
        lambda: any("monorepo" in e for e in precondicoes_desfazer(["r2"], _SIS)),
    ),
]
