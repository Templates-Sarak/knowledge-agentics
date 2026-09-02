"""verificar_paridade.py — a camada MECANICA da contraprova specs x realidade.

    python verificar_paridade.py --raiz <repo> [--specs <dir>] [--json]
    python verificar_paridade.py --autoteste

Cobre so o que e deterministico (mesma entrada -> mesma saida) na skill `spec-revisao`:

  1. `ponteiro-morto`    — caminho citado numa spec que nao existe no repositorio.
  2. `wikilink-orfao`    — `[[nome]]` que nao resolve para nenhuma spec da arvore.
  3. `plan-sem-indice`   — `plan/plan-NN-*.md` em disco sem linha no `00-indice`.
  4. `indice-sem-plan`   — linha no `00-indice` cuja plan nao existe mais em disco.
  5. `status-divergente` — status do frontmatter da plan != status citado no `00-indice`.
  6. `modulo-sem-spec`   — `modules/<m>/module.json` em disco que nenhuma spec cita.

O que este script NAO faz, de proposito: dizer se a REGRA descrita numa spec e a regra que o
codigo executa. Isso e julgamento, fica no agente (SKILL.md, passos 3-5) — script que opinasse
sobre semantica daria falso veredito com cara de verde.

Fora de fence: citacao dentro de bloco ``` e exemplo de comando, nao ponteiro a seguir. Contar
como ponteiro produziria ruido justamente nas specs que ensinam a rodar alguma coisa.

Nucleo x casca: `citacoes_de_texto`, `wikilinks_de_texto`, `plans_do_indice`,
`status_do_frontmatter` e `divergencias_de_plan` sao PURAS (recebem texto, nunca tocam `fs`) — sao
o que o `--autoteste` prova com fixtures em memoria. `auditar_*` sao a casca fina que le o disco.

Read-only por construcao: abre arquivo em modo leitura e nunca escreve. Exit 0 sem achado, 1 com
achado, 2 em erro de uso.
"""

import argparse
import json
import os
import re
import sys

EXTENSOES_DE_SPEC = (".md",)
# Molde exibe caminho ficticio por oficio (`caminho/do/arquivo.ext`) — mesma isencao que o
# `ponteiros.py` da `meta-verificacao-base` da a `examples.md`/`templates.md`.
PASTAS_DE_MOLDE = frozenset({"_templates"})
# Pasta gerada/cache nunca e conteudo do repositorio.
PASTAS_IGNORADAS = frozenset(
    {".git", "node_modules", "__pycache__", ".venv", "dist", ".ruff_cache"}
)
# Um candidato a ponteiro: link markdown `](caminho)` ou trecho em crase com barra/extensao.
LINK_MD = re.compile(r"\]\(([^)\s]+)\)")
EM_CRASE = re.compile(r"`([^`\n]+)`")
WIKILINK = re.compile(r"\[\[([^\]\n|]+)")
PLAN_NO_TEXTO = re.compile(r"plan-\d+-[a-z0-9]+(?:-[a-z0-9]+)*")
STATUS_NO_FRONTMATTER = re.compile(r"^status:\s*[\"']?([^\"'\n]+?)[\"']?\s*$", re.M)
FENCE = re.compile(r"^\s*```")
# `.py`/`.env` sozinhos sao a EXTENSAO citada em prosa, nunca um arquivo do repo. E `NN` e o
# placeholder de numeracao do proprio molde (`plan-NN-slug`, `arquitetura/NN-api.md`).
SO_EXTENSAO = re.compile(r"^\.\w{1,5}$")
# Placeholder, glob e URL nao sao caminho a resolver. Trecho iniciado por `/` tambem nao: numa spec
# de site, `/servicos` e ROTA HTTP, e cobrar um arquivo com esse nome acusaria a spec inteira.
NAO_E_CAMINHO = ("http://", "https://", "<", ">", "*", "$", "{", "…", "...")
EXTENSOES_CITAVEIS = (
    ".md",
    ".py",
    ".mjs",
    ".js",
    ".ts",
    ".json",
    ".yaml",
    ".yml",
    ".sql",
)


def _e_candidato(bruto):
    """Nucleo: o trecho parece um caminho de arquivo que da para resolver no disco?"""
    alvo = bruto.strip()
    if not alvo or any(marca in alvo for marca in NAO_E_CAMINHO):
        return False
    if " " in alvo or alvo.startswith(("#", "/")):
        return False
    if "NN" in alvo or SO_EXTENSAO.match(alvo):
        return False
    return "/" in alvo or alvo.endswith(EXTENSOES_CITAVEIS)


def _linhas_fora_de_fence(texto):
    """Nucleo: `(numero, linha)` de cada linha do texto que nao esta dentro de um bloco ```."""
    dentro = False
    saida = []
    for numero, linha in enumerate(texto.split("\n"), start=1):
        if FENCE.match(linha):
            dentro = not dentro
            continue
        if not dentro:
            saida.append((numero, linha))
    return saida


def citacoes_de_texto(texto: str) -> list[tuple[int, str]]:
    """Nucleo: `[(linha, caminho)]` de todo caminho citado fora de bloco de codigo."""
    achados = []
    for numero, linha in _linhas_fora_de_fence(texto):
        brutos = LINK_MD.findall(linha) + EM_CRASE.findall(linha)
        achados.extend(
            (numero, bruto.strip()) for bruto in brutos if _e_candidato(bruto)
        )
    return achados


def wikilinks_de_texto(texto: str) -> list[tuple[int, str]]:
    """Nucleo: `[(linha, nome)]` de cada `[[nome]]` fora de bloco de codigo."""
    achados = []
    for numero, linha in _linhas_fora_de_fence(texto):
        achados.extend((numero, nome.strip()) for nome in WIKILINK.findall(linha))
    return achados


def plans_do_indice(texto: str) -> dict[str, str]:
    """Nucleo: `{plan: status}` das linhas de tabela do `00-indice`.

    Status e a penultima celula da linha (a ultima e o Destino), como manda o molde do indice.
    Linha sem plan reconhecivel nao entra — cabecalho e legenda nao sao fila.
    """
    fila = {}
    for _, linha in _linhas_fora_de_fence(texto):
        if not linha.strip().startswith("|"):
            continue
        celulas = [c.strip() for c in linha.strip().strip("|").split("|")]
        nomes = PLAN_NO_TEXTO.findall(linha)
        if nomes and len(celulas) >= 2:
            fila[nomes[0]] = celulas[-2]
    return fila


def status_do_frontmatter(texto: str) -> str | None:
    """Nucleo: o valor do campo `status` do frontmatter YAML, ou `None` se nao houver."""
    achado = STATUS_NO_FRONTMATTER.search(texto)
    return achado.group(1).strip() if achado else None


def divergencias_de_plan(
    no_indice: dict[str, str], em_disco: dict[str, str]
) -> list[tuple[str, str, str]]:
    """Nucleo: as tres divergencias entre `{plan: status}` do indice e `{plan: status}` do disco."""
    achados = []
    for plan in sorted(set(em_disco) - set(no_indice)):
        achados.append(
            ("plan-sem-indice", plan, "existe em plan/ e nao esta no 00-indice")
        )
    for plan in sorted(set(no_indice) - set(em_disco)):
        achados.append(
            ("indice-sem-plan", plan, "citada no 00-indice e nao existe em plan/")
        )
    for plan in sorted(set(no_indice) & set(em_disco)):
        if no_indice[plan] != em_disco[plan]:
            detalhe = "indice diz '%s', a plan diz '%s'" % (
                no_indice[plan],
                em_disco[plan],
            )
            achados.append(("status-divergente", plan, detalhe))
    return achados


def _achado(classe, arquivo, linha, detalhe):
    return {"classe": classe, "arquivo": arquivo, "linha": linha, "detalhe": detalhe}


def _arquivos_de_spec(specs_dir):
    """Casca: o caminho absoluto de toda spec da arvore, fora das pastas de molde."""
    encontrados = []
    for pasta, subpastas, nomes in os.walk(specs_dir):
        subpastas[:] = [s for s in subpastas if s not in PASTAS_DE_MOLDE]
        for nome in sorted(nomes):
            if nome.endswith(EXTENSOES_DE_SPEC):
                encontrados.append(os.path.join(pasta, nome))
    return sorted(encontrados)


def _basenames_do_repo(raiz):
    """Casca: o nome de todo arquivo do repositorio, fora das pastas geradas/cache."""
    nomes = set()
    for pasta, subpastas, arquivos in os.walk(raiz):
        subpastas[:] = [s for s in subpastas if s not in PASTAS_IGNORADAS]
        nomes.update(arquivos)
    return nomes


def _resolve(candidato, bases, basenames):
    """Casca: a citacao aponta para algo que existe?

    Citacao COM barra e caminho: resolve estrito, a partir de cada base. Citacao SEM barra e
    NOME (`04-regras.md`): resolve por basename em qualquer lugar da arvore — cobrar caminho
    exato de quem nao escreveu caminho seria inventar exigencia que a spec nunca fez.
    """
    alvo = candidato.rstrip("/")
    if "/" not in alvo:
        return alvo in basenames
    return any(os.path.exists(os.path.join(base, alvo)) for base in bases)


def auditar_ponteiros(
    arquivos: list[str], bases: tuple, raiz: str, basenames: set[str]
) -> list[dict]:
    """Casca: caminho citado numa spec que nao existe a partir de nenhuma base."""
    achados = []
    for caminho in arquivos:
        texto = open(caminho, encoding="utf-8", errors="replace").read()
        rel = os.path.relpath(caminho, raiz)
        for linha, citado in citacoes_de_texto(texto):
            if not _resolve(citado, bases + (os.path.dirname(caminho),), basenames):
                achados.append(_achado("ponteiro-morto", rel, linha, citado))
    return achados


def auditar_wikilinks(arquivos: list[str], raiz: str) -> list[dict]:
    """Casca: `[[nome]]` que nao casa com o nome de nenhuma spec da arvore."""
    nomes = {os.path.splitext(os.path.basename(c))[0] for c in arquivos}
    achados = []
    for caminho in arquivos:
        texto = open(caminho, encoding="utf-8", errors="replace").read()
        rel = os.path.relpath(caminho, raiz)
        for linha, alvo in wikilinks_de_texto(texto):
            if alvo not in nomes:
                achados.append(_achado("wikilink-orfao", rel, linha, "[[%s]]" % alvo))
    return achados


def _plans_em_disco(specs_dir):
    """Casca: `{plan: status}` lido de cada `plan/plan-NN-*.md`."""
    pasta = os.path.join(specs_dir, "plan")
    if not os.path.isdir(pasta):
        return {}
    em_disco = {}
    for nome in sorted(os.listdir(pasta)):
        achado = PLAN_NO_TEXTO.match(nome)
        if not achado or not nome.endswith(".md"):
            continue
        texto = open(
            os.path.join(pasta, nome), encoding="utf-8", errors="replace"
        ).read()
        em_disco[achado.group(0)] = status_do_frontmatter(texto) or "(sem status)"
    return em_disco


def auditar_fila(specs_dir: str) -> list[dict]:
    """Casca: confronta o `00-indice` com os arquivos de `plan/`."""
    indice = os.path.join(specs_dir, "00-indice.md")
    if not os.path.isfile(indice):
        return []
    no_indice = plans_do_indice(open(indice, encoding="utf-8", errors="replace").read())
    triplas = divergencias_de_plan(no_indice, _plans_em_disco(specs_dir))
    return [
        _achado(classe, "specs/00-indice.md", 0, "%s: %s" % (plan, detalhe))
        for classe, plan, detalhe in triplas
    ]


def _modulos_em_disco(raiz):
    """Casca: o nome de cada `modules/<m>/` que tem manifesto."""
    pasta = os.path.join(raiz, "modules")
    if not os.path.isdir(pasta):
        return []
    return sorted(
        nome
        for nome in os.listdir(pasta)
        if os.path.isfile(os.path.join(pasta, nome, "module.json"))
    )


def auditar_modulos(arquivos: list[str], raiz: str) -> list[dict]:
    """Casca: modulo com manifesto que nenhuma spec da arvore cita pelo nome."""
    modulos = _modulos_em_disco(raiz)
    if not modulos:
        return []
    corpus = "\n".join(
        open(c, encoding="utf-8", errors="replace").read() for c in arquivos
    )
    return [
        _achado(
            "modulo-sem-spec",
            "modules/%s/" % m,
            0,
            "nenhuma spec cita o modulo '%s'" % m,
        )
        for m in modulos
        if m not in corpus
    ]


def auditar(raiz: str, specs_dir: str) -> list[dict]:
    """Casca: as seis checagens, na ordem em que o relatorio as apresenta."""
    arquivos = _arquivos_de_spec(specs_dir)
    bases = (raiz, specs_dir, os.path.dirname(specs_dir))
    return (
        auditar_ponteiros(arquivos, bases, raiz, _basenames_do_repo(raiz))
        + auditar_wikilinks(arquivos, raiz)
        + auditar_fila(specs_dir)
        + auditar_modulos(arquivos, raiz)
    )


def _imprimir_humano(specs_dir, achados):
    """Relatorio legivel — o `--json` continua sendo a saida para maquina."""
    print("\n--- Paridade mecanica: %s ---" % specs_dir)
    for a in achados:
        local = "%s:%s" % (a["arquivo"], a["linha"]) if a["linha"] else a["arquivo"]
        print("  [%s] %s  %s" % (a["classe"], local, a["detalhe"]))
    veredito = (
        "sem divergencia mecanica"
        if not achados
        else "%d divergencia(s)" % len(achados)
    )
    print("\n[%s] %s" % ("OK" if not achados else "ERRO", veredito))


# Fixtures do `--autoteste`: `(rotulo, predicado)` por invariante de nucleo. Constante de
# modulo, e nao corpo de funcao, para a prova crescer sem estourar o limiar de 40 linhas.
CASOS = [
    (
        "citacao fora de fence",
        lambda: citacoes_de_texto("ver `a/b.md` aqui") == [(1, "a/b.md")],
    ),
    (
        "citacao dentro de fence e ignorada",
        lambda: citacoes_de_texto("```\n`a/b.md`\n```") == [],
    ),
    (
        "placeholder nao e candidato",
        lambda: _e_candidato("<caminho>/x.md") is False,
    ),
    (
        "rota http nao e candidato",
        lambda: _e_candidato("/servicos") is False,
    ),
    (
        "nome sem barra resolve por basename",
        lambda: _resolve("04-regras.md", (), {"04-regras.md"}) is True,
    ),
    (
        "nome sem barra ausente reprova",
        lambda: _resolve("99-inexistente.md", (), {"04-regras.md"}) is False,
    ),
    (
        "wikilink extraido",
        lambda: wikilinks_de_texto("veja [[00-contexto]]") == [(1, "00-contexto")],
    ),
    (
        "indice le plan e status",
        lambda: (
            plans_do_indice(
                "| 1 | [plan-01-x](plan/plan-01-x.md) | ob | - | ROXO | specs/ |"
            )
            == {"plan-01-x": "ROXO"}
        ),
    ),
    (
        "status do frontmatter",
        lambda: status_do_frontmatter('---\nstatus: "VERDE"\n---\n') == "VERDE",
    ),
    (
        "plan sem indice",
        lambda: (
            divergencias_de_plan({}, {"plan-01-x": "A"})[0][0] == "plan-sem-indice"
        ),
    ),
    (
        "indice sem plan",
        lambda: (
            divergencias_de_plan({"plan-01-x": "A"}, {})[0][0] == "indice-sem-plan"
        ),
    ),
    (
        "status divergente",
        lambda: (
            divergencias_de_plan({"plan-01-x": "A"}, {"plan-01-x": "B"})[0][0]
            == "status-divergente"
        ),
    ),
    (
        "paridade de status nao acusa",
        lambda: divergencias_de_plan({"plan-01-x": "A"}, {"plan-01-x": "A"}) == [],
    ),
]


def autoteste() -> int:
    """Prova os nucleos puros com fixtures em memoria. Exit 0 se todos passarem."""
    falhas = [nome for nome, fn in CASOS if not fn()]
    for nome in falhas:
        print("[FALHA] %s" % nome, file=sys.stderr)
    print(
        "verificar_paridade --autoteste: %d/%d caso(s) verde"
        % (len(CASOS) - len(falhas), len(CASOS))
    )
    return 1 if falhas else 0


def _parser():
    parser = argparse.ArgumentParser(
        description="Paridade mecanica entre specs e repositorio."
    )
    parser.add_argument("--raiz", help="Raiz do repositorio-alvo.")
    parser.add_argument("--specs", help="Pasta das specs. Padrao: <raiz>/specs.")
    parser.add_argument(
        "--json", action="store_true", help="Imprime os achados como JSON."
    )
    parser.add_argument(
        "--autoteste", action="store_true", help="Prova o nucleo com fixtures."
    )
    return parser


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = _parser()
    args = parser.parse_args()
    if args.autoteste:
        return autoteste()
    if not args.raiz:
        parser.error("--raiz e obrigatorio (ou use --autoteste)")

    raiz = os.path.abspath(args.raiz)
    specs_dir = (
        os.path.abspath(args.specs) if args.specs else os.path.join(raiz, "specs")
    )
    if not os.path.isdir(specs_dir):
        print("[ERRO] %s nao e um diretorio de specs." % specs_dir, file=sys.stderr)
        return 2

    achados = auditar(raiz, specs_dir)
    if args.json:
        print(
            json.dumps(
                {"total": len(achados), "achados": achados},
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        _imprimir_humano(specs_dir, achados)
    return 1 if achados else 0


if __name__ == "__main__":
    sys.exit(main())
