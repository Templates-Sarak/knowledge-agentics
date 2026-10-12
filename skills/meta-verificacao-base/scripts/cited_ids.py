"""Todo id de regra citado em skill, command, agent, hook ou `README.md` existe no catalogo do gate.

O `ponteiros.py` resolve CAMINHO e nome de artefato; nenhum verificador olhava id de regra. Foi assim
que a renomeacao do `ADR-024` deixaria citacoes apontando para o vazio sem ninguem notar. O catalogo
e lido do CODIGO do gate (`tools/gate/rules/*.mjs` + o pseudo-id do `engine.mjs`), nunca de lista
escrita aqui; os ids antigos vem da tabela que viaja com o gate (`tools/gate/renamed-rules.json`).

Forma INEQUIVOCA — o que conta como citacao, porque "kebab-case entre crases" sozinho casa nome de
skill, de flag e de arquivo:

1. token entre crases que e id ANTIGO com hifen (`estrutura-estrita`): so pode ser a regra;
2. token entre crases logo depois de "regra(s)", "id(s)" ou "rule" — e os que o seguem numa enumeracao
   (`a`, `b` e `c`);
3. primeira coluna de linha de tabela de catalogo (`| \\`id\\` | erro |`).

Fica de fora de proposito: id de UMA palavra fora dessas formas (`contract`, `tests`, `log` aparecem em
prosa comum), e token que e nome de skill/command/agent/hook ou id de sistema do `mapa.json` (o "id"
de `--id <id>` e outro id). Prefere falso negativo a falso positivo, como a familia heuristica do
gate (`04-regras.md` §7.2).

Nucleo x casca: `ids_invalidos` e pura; `auditar_ids_citados` le o disco.
"""

import json
import os
import re

REGRAS_DO_GATE = "specs/_estrutura_modulos/tools/gate/rules"
ENGINE_DO_GATE = "specs/_estrutura_modulos/tools/gate/engine.mjs"
TABELA_DE_RENOMEACAO = "specs/_estrutura_modulos/tools/gate/renamed-rules.json"

PASTAS_AUDITADAS = ("skills", "commands", "agents", "hooks")
ARQUIVOS_AUDITADOS = ("README.md",)
EXTENSOES = {".md", ".py", ".js", ".mjs", ".json"}
PASTAS_IGNORADAS = {"node_modules", ".git", "__pycache__", ".venv", ".ruff_cache"}

# Arquivos que citam id antigo DE PROPOSITO (documentam a renomeacao): caminho -> motivo.
EXCECOES = {
    "skills/meta-propagar-base/references/campanha-idioma.md": "documenta a campanha de idioma e cita ids antigos e inexistentes como historia",
    "skills/meta-verificacao-base/scripts/audit_base.py": "as fixtures do --selftest citam id antigo e id inexistente de proposito",
    "skills/meta-verificacao-base/scripts/ids_citados.py": "a docstring cita um id antigo como exemplo da forma inequivoca",
}

ID_DE_REGRA = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
RE_ID_NO_GATE = re.compile(r"^\s*id:\s*'([a-z][a-z0-9-]*)'", re.MULTILINE)
RE_PSEUDO_ID = re.compile(r"EXTRACTION_ID\s*=\s*'([a-z][a-z0-9-]*)'")
RE_CRASES = re.compile(r"`([^`\s]+)`")
RE_LINHA_DE_CATALOGO = re.compile(
    r"^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(?:erro|aviso)\s*\|"
)
RE_ANTES_DE_REGRA = re.compile(
    r"\b(?:regras?|ids?|rule)\s+(?:de\s+gate\s+)?$", re.IGNORECASE
)
RE_ENTRE_CITACOES = re.compile(r"^(?:\s*,\s*|\s+e\s+|\s+ou\s+|\s*/\s*)$")


def ids_do_catalogo(textos_das_regras: list, texto_do_engine: str) -> set:
    """Os ids que o gate declara: `id: '...'` de cada arquivo de regras mais o pseudo-id da extracao."""
    ids = set()
    for texto in textos_das_regras:
        ids.update(RE_ID_NO_GATE.findall(texto))
    ids.update(RE_PSEUDO_ID.findall(texto_do_engine))
    return ids


def _citacoes_da_linha(linha: str, antigos_com_hifen: set) -> list:
    """Os tokens da linha que sao citacao inequivoca de id (ver as tres formas no topo do modulo)."""
    em_tabela = RE_LINHA_DE_CATALOGO.match(linha)
    citados = []
    ultimo_fim = None
    ultima_foi_citacao = False
    for casado in RE_CRASES.finditer(linha):
        token = casado.group(1)
        if not ID_DE_REGRA.match(token):
            ultima_foi_citacao = False
            continue
        antes = linha[: casado.start()]
        entre = linha[ultimo_fim : casado.start()] if ultimo_fim is not None else None
        e_citacao = (
            token in antigos_com_hifen
            or RE_ANTES_DE_REGRA.search(antes) is not None
            or (
                ultima_foi_citacao
                and entre is not None
                and RE_ENTRE_CITACOES.match(entre) is not None
            )
            or (em_tabela is not None and em_tabela.group(1) == token)
        )
        if e_citacao:
            citados.append(token)
        ultima_foi_citacao = e_citacao
        ultimo_fim = casado.end()
    return citados


def ids_invalidos(
    textos_por_arquivo: dict, catalogo: set, renomeados: dict, nao_regras: set
) -> list:
    """Uma mensagem por (arquivo, linha, id) citado que o catalogo nao tem. `renomeados` e
    `{antigo: novo}` (da tabela viajante); `nao_regras` e o que NAO e id de regra mesmo entre crases
    (nomes de skill/command/agent/hook, ids de sistema)."""
    antigos_com_hifen = {antigo for antigo in renomeados if "-" in antigo}
    achados = []
    for arquivo, texto in textos_por_arquivo.items():
        if arquivo in EXCECOES:
            continue
        for numero, linha in enumerate(texto.split("\n"), start=1):
            for token in _citacoes_da_linha(linha, antigos_com_hifen):
                if token in catalogo or token in nao_regras:
                    continue
                dica = (
                    f" - foi renomeado para `{renomeados[token]}` (ADR-024)"
                    if token in renomeados
                    else ""
                )
                achados.append(
                    f"{arquivo}:{numero}: id de regra `{token}` nao existe no catalogo do gate{dica}"
                )
    return achados


def _ler(caminho: str):
    try:
        with open(caminho, "r", encoding="utf-8") as arquivo:
            return arquivo.read()
    except (OSError, UnicodeDecodeError):
        return None


def _textos_auditados(base_dir: str) -> dict:
    textos = {}
    candidatos = [os.path.join(base_dir, nome) for nome in ARQUIVOS_AUDITADOS]
    for pasta in PASTAS_AUDITADAS:
        for atual, subpastas, arquivos in os.walk(os.path.join(base_dir, pasta)):
            subpastas[:] = [p for p in subpastas if p not in PASTAS_IGNORADAS]
            candidatos += [
                os.path.join(atual, n)
                for n in arquivos
                if os.path.splitext(n)[1] in EXTENSOES
            ]
    for caminho in candidatos:
        texto = _ler(caminho)
        if texto is not None:
            textos[os.path.relpath(caminho, base_dir).replace(os.sep, "/")] = texto
    return textos


def _nomes_que_nao_sao_regra(base_dir: str) -> set:
    """Nome de skill/command/agent/hook e id de sistema: tokens kebab-case que NAO sao id de regra."""
    nomes = set()
    skills = os.path.join(base_dir, "skills")
    if os.path.isdir(skills):
        nomes.update(
            n for n in os.listdir(skills) if os.path.isdir(os.path.join(skills, n))
        )
    for pasta in ("commands", "agents", "hooks"):
        alvo = os.path.join(base_dir, pasta)
        if os.path.isdir(alvo):
            nomes.update(os.path.splitext(n)[0] for n in os.listdir(alvo))
    texto_do_mapa = _ler(os.path.join(base_dir, "mapa.json"))
    try:
        sistemas = json.loads(texto_do_mapa or "{}").get("sistemas", [])
    except ValueError:
        sistemas = []
    nomes.update(
        s.get("id")
        for s in sistemas
        if isinstance(s, dict) and isinstance(s.get("id"), str)
    )
    return nomes


def auditar_ids_citados(base_dir: str) -> list:
    """Casca. Fail-closed: catalogo que nao se consegue ler (ou vazio) e achado — sem ele a checagem
    aprovaria toda citacao por nao ter contra o que comparar."""
    pasta = os.path.join(base_dir, *REGRAS_DO_GATE.split("/"))
    if not os.path.isdir(pasta):
        return [
            f"{REGRAS_DO_GATE}: pasta nao encontrada - os ids citados nao foram conferidos"
        ]
    textos_das_regras = [
        _ler(os.path.join(pasta, n)) or ""
        for n in sorted(os.listdir(pasta))
        if n.endswith(".mjs")
    ]
    catalogo = ids_do_catalogo(
        textos_das_regras,
        _ler(os.path.join(base_dir, *ENGINE_DO_GATE.split("/"))) or "",
    )
    if not catalogo:
        return [
            f"{REGRAS_DO_GATE}: nenhum id de regra lido - os ids citados nao foram conferidos"
        ]
    try:
        renomeados = json.loads(
            _ler(os.path.join(base_dir, *TABELA_DE_RENOMEACAO.split("/"))) or "{}"
        ).get("renamed", {})
    except ValueError:
        renomeados = {}
    return ids_invalidos(
        _textos_auditados(base_dir),
        catalogo,
        renomeados,
        _nomes_que_nao_sao_regra(base_dir),
    )
