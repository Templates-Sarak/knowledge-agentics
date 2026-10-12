"""Checagem de que `specs/_estrutura_base/` e `specs/_estrutura_base_site/` ensinam o MESMO
fluxo SDD — hoje isso é invariante só de prosa: editar `00-prompt-revisor.md` num lado e esquecer
o outro faz as duas bases ensinarem fluxos diferentes, e nada acusa.

Por que o DEFAULT é "deve ser igual", invertido do resto desta base: lista de "deve ser igual"
apodrece — arquivo compartilhado NOVO nasce fora dela até alguém lembrar de acrescentá-lo, e até
lá o verificador nunca o vê. Lista de EXCEÇÃO não apodrece do mesmo jeito: arquivo novo nasce
COBRADO por default, e só sai da comparação se alguém decidir e escrever o motivo ao lado — a
mesma lógica de `config/compliance.json` do template (exceção nominal, nunca silenciosa).

**"Por default" é TODO arquivo, de QUALQUER extensão — não só `.md`.** Uma versão anterior deste
módulo filtrava por `.md` sem declarar o recorte em lugar nenhum, e isso contradizia esta própria
docstring: um `config-compartilhada.json` divergente nas duas árvores passava calado. Medido, e
corrigido — não é mais recorte por extensão, é recorte por PASTA (`IGNORED_DIRS`, abaixo), e
esse sim está declarado: pastas geradas/cache nunca são conteúdo do repositório, e comparar duas
execuções independentes de ferramenta (ex.: `.ruff_cache/`, criado a cada `ruff` rodado) produziria
divergência falsa a cada rodada — falso positivo, não sinal. Hoje as duas árvores só têm
`.ruff_cache/` como pasta gerada; o vocabulário cobre as outras que aparecem em pastas irmãs deste
mesmo repositório (`__pycache__`, `.venv`, `node_modules`, `.git`, `dist`, `generated`) para não
precisar editar este arquivo no dia em que uma delas aparecer aqui também.

Arquivo que só existe numa das duas árvores NÃO é divergência — é o desenho: o site tem
`arquitetura/`/`specs/` próprios que a base de projeto não tem. Só o CONJUNTO COMUM de nomes
relativos é comparado; o resto fica fora por construção, sem precisar de exceção.

Fim de linha: `normalizar` reduz CRLF -> LF antes de comparar — só faz sentido para TEXTO. Decisão
registrada porque não é hipotética — o `git status` desta própria árvore já avisou conversão
LF->CRLF (`core.autocrlf` do Windows) num arquivo dela; comparar bytes crus de um arquivo de texto
acusaria fim-de-linha como se fosse divergência de conteúdo. Arquivo que não decodifica como UTF-8
(binário) é comparado por BYTES CRUS, sem essa normalização — binário não tem "fim de linha", e
bytes-crus-contra-bytes-crus ainda pega a divergência real.

Núcleo × casca, o padrão das irmãs (`counts.py` é o molde de forma): `divergences` é pura —
recebe dois dicts `{caminho: conteúdo}` (texto `str` ou binário `bytes`) e o dict de exceções,
nunca toca `fs` — e é o que o `--selftest` de `audit_base.py` prova com fixtures em memória.
`tree_contents`/`audit_parity` são a casca fina que lê `fs`.
"""

import os

TREE_A = "specs/_estrutura_base"
TREE_B = "specs/_estrutura_base_site"

# Pasta gerada/cache/vendorizada — nunca conteúdo do repositório. Mesmo vocabulário de exclusão
# que `run-all-selftests.mjs:IGNORAR` e `gate/context.mjs:SKIP_WALK` usam pelo mesmo motivo,
# ampliado só com o que já apareceu NESTAS duas árvores especificamente (`.ruff_cache`).
IGNORED_DIRS = {
    "__pycache__",
    ".venv",
    "node_modules",
    ".git",
    ".ruff_cache",
    "dist",
    "generated",
}

# Caminho relativo à raiz de CADA árvore (as duas compartilham a mesma estrutura de nomes) -> o
# MOTIVO da divergência declarada, ao lado do nome — nunca uma lista muda sem explicação.
EXCEPTIONS = {
    "00-contexto.md": "the entry briefing narrates the repository kind — project with the module template "
    "versus site — and the text is legitimately different",
    "INDEX.md": "the reading map points to the architecture specs of each project kind "
    "(the architecture and specs folders of the site do not exist on the project side)",
    "README.md": "the manual describes the flow in the vocabulary of the project kind — 'system'/'module' "
    "on one side, 'site'/'page' on the other",
    "panorama/00-planejamento.md": "the family catalog of the project base is born with family 00 only "
    "(foundation); the site one already brings the families of the site templates (01 Identity and "
    "content, 02 Engineering, 03 Pages)",
}


def normalize(text):
    """CRLF -> LF antes de comparar: fim de linha não é divergência de CONTEÚDO. Só se aplica a
    TEXTO — binário (`bytes`) não passa por aqui, ver `divergences`."""
    return text.replace("\r\n", "\n")


def divergences(contents_a, contents_b, exceptions=EXCEPTIONS):
    """Núcleo: nomes presentes NOS DOIS dicts, fora das exceções, cujo conteúdo difere. Valor
    `str` é normalizado (CRLF -> LF) antes de comparar; valor `bytes` (binário) é comparado cru.
    A mensagem nomeia o arquivo — qual lado editar é decisão humana, o verificador não escolhe."""
    common = sorted(set(contents_a) & set(contents_b))
    findings = []
    for name in common:
        if name in exceptions:
            continue
        a = contents_a[name]
        b = contents_b[name]
        a_cmp = normalize(a) if isinstance(a, str) else a
        b_cmp = normalize(b) if isinstance(b, str) else b
        if a_cmp != b_cmp:
            findings.append(f"{name}: diverges between {TREE_A} and {TREE_B}")
    return findings


def _read_for_comparison(path):
    """Texto (decodificado UTF-8) quando o arquivo decodifica — o formato de tudo que vive aqui
    hoje —, ou bytes crus quando não decodifica (binário): `divergences` sabe tratar os dois."""
    raw = open(path, "rb").read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw


def tree_contents(base_dir, tree_rel):
    """Casca: `{caminho relativo à ÁRVORE: conteúdo}` de TODO arquivo sob `tree_rel`, fora das
    pastas geradas/cache (`IGNORED_DIRS`)."""
    root = os.path.join(base_dir, tree_rel)
    contents = {}
    if not os.path.isdir(root):
        return contents
    for current, dirs, files in os.walk(root):
        dirs[:] = [p for p in dirs if p not in IGNORED_DIRS]
        for name in files:
            path = os.path.join(current, name)
            rel = os.path.relpath(path, root).replace("\\", "/")
            try:
                contents[rel] = _read_for_comparison(path)
            except OSError:
                continue
    return contents


def audit_parity(base_dir):
    """Casca: compara as duas árvores e devolve os achados de `divergences`."""
    contents_a = tree_contents(base_dir, TREE_A)
    contents_b = tree_contents(base_dir, TREE_B)
    return divergences(contents_a, contents_b)
