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
corrigido — não é mais recorte por extensão, é recorte por PASTA (`PASTAS_IGNORADAS`, abaixo), e
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

Núcleo × casca, o padrão das irmãs (`contagens.py` é o molde de forma): `divergencias` é pura —
recebe dois dicts `{caminho: conteúdo}` (texto `str` ou binário `bytes`) e o dict de exceções,
nunca toca `fs` — e é o que o `--autoteste` de `audit_base.py` prova com fixtures em memória.
`conteudos_da_arvore`/`auditar_paridade` são a casca fina que lê `fs`.
"""

import os

ARVORE_A = "specs/_estrutura_base"
ARVORE_B = "specs/_estrutura_base_site"

# Pasta gerada/cache/vendorizada — nunca conteúdo do repositório. Mesmo vocabulário de exclusão
# que `run-all-selftests.mjs:IGNORAR` e `gate/context.mjs:NAO_PERCORRER` usam pelo mesmo motivo,
# ampliado só com o que já apareceu NESTAS duas árvores especificamente (`.ruff_cache`).
PASTAS_IGNORADAS = {
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
EXCECOES = {
    "00-contexto.md": "o briefing de entrada narra o tipo de repositório — projeto com template de "
    "modulos versus site — e o texto e legitimamente diferente",
    "INDEX.md": "o mapa de leitura aponta para as specs de arquitetura proprias de cada tipo de "
    "projeto (arquitetura/, specs/ do site nao existem no lado projeto)",
    "README.md": "o manual descreve o fluxo no vocabulario do tipo de projeto — 'sistema'/'modulo' "
    "de um lado, 'site'/'pagina' do outro",
    "panorama/00-planejamento.md": "o catalogo de familias da base de projeto nasce so com a familia 00 "
    "(fundacao); o do site ja traz as familias dos moldes de site (01 Identidade e conteudo, 02 "
    "Engenharia, 03 Paginas)",
}


def normalizar(texto):
    """CRLF -> LF antes de comparar: fim de linha não é divergência de CONTEÚDO. Só se aplica a
    TEXTO — binário (`bytes`) não passa por aqui, ver `divergencias`."""
    return texto.replace("\r\n", "\n")


def divergencias(conteudos_a, conteudos_b, excecoes=EXCECOES):
    """Núcleo: nomes presentes NOS DOIS dicts, fora das exceções, cujo conteúdo difere. Valor
    `str` é normalizado (CRLF -> LF) antes de comparar; valor `bytes` (binário) é comparado cru.
    A mensagem nomeia o arquivo — qual lado editar é decisão humana, o verificador não escolhe."""
    comuns = sorted(set(conteudos_a) & set(conteudos_b))
    achados = []
    for nome in comuns:
        if nome in excecoes:
            continue
        a = conteudos_a[nome]
        b = conteudos_b[nome]
        a_cmp = normalizar(a) if isinstance(a, str) else a
        b_cmp = normalizar(b) if isinstance(b, str) else b
        if a_cmp != b_cmp:
            achados.append(f"{nome}: diverge entre {ARVORE_A} e {ARVORE_B}")
    return achados


def _ler_para_comparar(caminho):
    """Texto (decodificado UTF-8) quando o arquivo decodifica — o formato de tudo que vive aqui
    hoje —, ou bytes crus quando não decodifica (binário): `divergencias` sabe tratar os dois."""
    bruto = open(caminho, "rb").read()
    try:
        return bruto.decode("utf-8")
    except UnicodeDecodeError:
        return bruto


def conteudos_da_arvore(base_dir, arvore_rel):
    """Casca: `{caminho relativo à ÁRVORE: conteúdo}` de TODO arquivo sob `arvore_rel`, fora das
    pastas geradas/cache (`PASTAS_IGNORADAS`)."""
    raiz = os.path.join(base_dir, arvore_rel)
    conteudos = {}
    if not os.path.isdir(raiz):
        return conteudos
    for atual, pastas, arquivos in os.walk(raiz):
        pastas[:] = [p for p in pastas if p not in PASTAS_IGNORADAS]
        for nome in arquivos:
            caminho = os.path.join(atual, nome)
            rel = os.path.relpath(caminho, raiz).replace("\\", "/")
            try:
                conteudos[rel] = _ler_para_comparar(caminho)
            except OSError:
                continue
    return conteudos


def auditar_paridade(base_dir):
    """Casca: compara as duas árvores e devolve os achados de `divergencias`."""
    conteudos_a = conteudos_da_arvore(base_dir, ARVORE_A)
    conteudos_b = conteudos_da_arvore(base_dir, ARVORE_B)
    return divergencias(conteudos_a, conteudos_b)
