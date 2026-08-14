"""Checagem de ponteiro órfão da base Sarak — caminho citado e nome de artefato citado.

Separado de `audit_base.py` por SRP: aquele confere metadados e sintaxe; este resolve referências.

POLÍTICA: prefere falso NEGATIVO a falso positivo, como a família heurística do gate
(`04-regras.md` §7.2). Um checador que acusa caminho correto é rodado uma vez e abandonado; um que
deixa escapar um órfão ainda pega os outros. Por isso só resolve o que consegue resolver sem
ambiguidade — tudo mais é ignorado de propósito, e isso está documentado em `_alvo_de_caminho`.
"""
import os
import re

# Só estes prefixos são resolvidos a partir da RAIZ da base. Caminho de projeto GERADO
# (`specs/arquitetura/`, `contract/`, `core/`, `modules/`, `api/`, `tools/`) nunca entra:
# ele existe no molde ou no projeto instalado, jamais aqui, e é a maioria das citações.
PREFIXOS_DA_BASE = ("skills/", "agents/", "commands/", "hooks/", "plugin/", "specs/_estrutura")

# Pastas da Camada 3 de uma skill — resolvem contra a pasta da própria skill.
PREFIXOS_CAMADA3 = ("references/", "scripts/", "assets/")

# Gerados por `plugin/sync_ide.py`: não existem num clone limpo, e citá-los é correto.
GERADOS = frozenset({
    "plugin/sarak_routing_table.md",
    "plugin/antigravity_rules.txt",
    "plugin/claude_instructions.txt",
})

# Um índice que se declara COMPLETO aceita ser cobrado na direção inversa: tudo que existe no disco
# tem de estar nele. A declaração mora no índice, nunca aqui — índice curado que precise omitir algo
# declara a omissão no próprio texto. Verificador com lista de exceção editorial vira dono de decisão
# que não é dele e envelhece escondido.
MARCA_DE_INVENTARIO = "**Inventário completo.**"

# O que um índice completo tem de citar. `hooks/` fica de fora: hook não é roteado por nome, dispara
# sozinho no evento do harness — indexá-lo seria cobrar presença de quem ninguém invoca.
PASTAS_INDEXADAS = ("skills", "agents", "commands")
PASTAS_PUBLICADAS = ("skills", "agents", "commands", "hooks")

PREFIXOS_DE_AREA = (
    "padrao", "code", "test", "cyber", "git", "meta", "deploy", "site", "obs", "db",
    "otimizacao", "spec",
)
# `\d*` cobre a área numerada dos commands de fluxo sequencial (`code1-`, `cyber2-`, `git1-`).
# Sem ele, os sete commands mais citados da base — justamente os que o `CLAUDE.md` usa para rotear —
# nunca seriam verificados, e renumerar um apodreceria toda citação em silêncio.
NOME_DE_ARTEFATO = re.compile(r"^(?:%s)\d*-[a-z0-9]+(?:-[a-z0-9]+)*$" % "|".join(PREFIXOS_DE_AREA))
EM_CRASE = re.compile(r"`([^`\n]+)`")

# Arquivo cujo ofício é exibir exemplo cita nome fictício de propósito.
ARQUIVOS_DE_EXEMPLO = ("examples.md", "templates.md")
# `meta-create-skill` ENSINA a nomear skill: os nomes que ela mostra são hipotéticos por construção
# (`code-padronizacao`, nunca `CodePadronizacao`). A isenção vale só para a checagem de NOME — os
# caminhos dela continuam sendo resolvidos normalmente.
SKILLS_QUE_ENSINAM_NOMES = ("skills/meta-create-skill/",)
# Marcas de que a citação é ilustrativa ou histórica, não um ponteiro a seguir.
MARCAS_DE_EXEMPLO = ("ex:", "ex.:", "por exemplo", "exemplo", "aposentad")

EXTENSOES_LIDAS = (".md", ".py", ".js", ".mjs", ".json")
PASTAS_IGNORADAS = {"__pycache__", "node_modules", ".git", ".venv"}
ALVOS = ("agents", "commands", "hooks", "skills", "specs/_estrutura_base",
         "specs/_estrutura_base_site")


def _nomes_de(base_dir, pastas):
    """Nome de cada entrada das pastas, sem extensão."""
    nomes = set()
    for pasta in pastas:
        caminho = os.path.join(base_dir, pasta)
        if not os.path.isdir(caminho):
            continue
        for entrada in os.listdir(caminho):
            nomes.add(os.path.splitext(entrada)[0])
    return nomes


def artefatos_da_base(base_dir):
    """Todo nome que a base publica: skill, agent, command e hook."""
    return _nomes_de(base_dir, PASTAS_PUBLICADAS)


def artefatos_indexaveis(base_dir):
    """O que um índice completo tem de citar — sem os hooks."""
    return _nomes_de(base_dir, PASTAS_INDEXADAS)


def _caminhos_dos_alvos(base_dir):
    """Gera o caminho de cada arquivo sob os alvos, ignorando pasta gerada."""
    for alvo in ALVOS:
        for raiz, pastas, arquivos in os.walk(os.path.join(base_dir, alvo)):
            pastas[:] = [p for p in pastas if p not in PASTAS_IGNORADAS]
            for nome in arquivos:
                yield os.path.join(raiz, nome)


def _ler(caminho, base_dir):
    """`(rel, texto)` do arquivo, ou `None` quando não é auditável ou não abre."""
    if not caminho.endswith(EXTENSOES_LIDAS):
        return None
    try:
        texto = open(caminho, encoding="utf-8").read()
    except OSError:
        return None
    return os.path.relpath(caminho, base_dir).replace("\\", "/"), texto


def arquivos_auditaveis(base_dir):
    """Gera `(rel, texto)` de cada arquivo dos alvos, com a barra normalizada."""
    for caminho in _caminhos_dos_alvos(base_dir):
        lido = _ler(caminho, base_dir)
        if lido is not None:
            yield lido


def _e_placeholder(token):
    """`<modulo>`, `[modulo]`, `caminho/para/x` — molde, não caminho real."""
    return any(c in token for c in "<>[]*|") or " " in token or "para/" in token


def _janela(linhas, indice):
    """Linha e a anterior: bloco de citação markdown quebra a frase no meio, e o aviso
    "Aposentados nesta versão" abre numa linha e lista os caminhos na seguinte."""
    return " ".join(linhas[max(0, indice - 1):indice + 1]).lower()


def isento_como_exemplo(linhas, indice):
    """A citação é ilustrativa ou histórica? Vale para caminho E para nome."""
    return any(marca in _janela(linhas, indice) for marca in MARCAS_DE_EXEMPLO)


def relativo_a_outro_artefato(linhas, indice, universo):
    """A linha nomeia outro artefato, então `references/x.md` é relativo a ELE, não a quem escreve.

    Suprime **só** a resolução de caminho da Camada 3. O nome continua sendo checado — senão uma
    linha que lista `padrao-python`, `padrao-typescript` e `padrao-go` esconderia o órfão atrás
    dos dois nomes válidos, que é exatamente como `padrao-go` sobreviveu em nove lugares.
    """
    return any(nome in _janela(linhas, indice) for nome in universo)


def alvo_de_caminho(token, dono):
    """Caminho relativo à base que o token promete, ou `None` quando está fora do alcance.

    `None` é a resposta honesta para a maioria: caminho de projeto gerado, nome de ferramenta
    externa (`golangci-lint`), pasta nua (`assets/` como vocabulário estrutural) e qualquer forma
    que este resolvedor não saiba ancorar.
    """
    if token.endswith("/") or _e_placeholder(token):
        return None
    if token.startswith(PREFIXOS_DA_BASE):
        return token
    if token.startswith(PREFIXOS_CAMADA3) and dono is not None:
        return "%s/%s" % (dono, token)
    return None


def nome_citado(token):
    """O nome de artefato que o token cita, ou `None` se não for um nome.

    A barra do command (`/code1-auditar`) é sintaxe de invocação, não parte do nome — e é a forma
    em que os commands aparecem em quase toda citação da base. Sem descartá-la, o `^` do regex não
    casa e a checagem de nome passa ao largo justamente do artefato mais citado.
    """
    nome = token[1:] if token.startswith("/") else token
    return nome if NOME_DE_ARTEFATO.match(nome) else None


def erro_do_token(base_dir, token, dono, universo):
    """Mensagem de órfão para o token, ou `None`. `universo=None` desliga a checagem de nome."""
    alvo = alvo_de_caminho(token, dono)
    if alvo is not None:
        if alvo in GERADOS or os.path.exists(os.path.join(base_dir, alvo)):
            return None
        return "caminho inexistente: %s" % token
    nome = nome_citado(token)
    if universo is not None and nome is not None and nome not in universo:
        return "artefato inexistente: %s" % token
    return None


def orfaos_do_arquivo(base_dir, rel, texto, universo):
    """Ponteiros do arquivo que não resolvem — de caminho e de nome."""
    achados = []
    linhas = texto.split("\n")
    dono = "/".join(rel.split("/")[:2]) if rel.startswith("skills/") else None
    # `None` desliga a checagem de nome onde nome fictício é o conteúdo legítimo do arquivo.
    nomes = None if rel.startswith(SKILLS_QUE_ENSINAM_NOMES) else universo
    for indice, linha in enumerate(linhas):
        if rel.endswith(ARQUIVOS_DE_EXEMPLO) or isento_como_exemplo(linhas, indice):
            continue
        # `dono=None` desliga só a Camada 3 relativa; caminho da raiz e nome seguem checados.
        ancora = None if relativo_a_outro_artefato(linhas, indice, universo) else dono
        for token in EM_CRASE.findall(linha):
            erro = erro_do_token(base_dir, token.strip(), ancora, nomes)
            if erro is not None:
                achados.append("[%s:%d] %s" % (rel, indice + 1, erro))
    return achados


def _e_este_arquivo(base_dir, rel):
    """Este script DOCUMENTA o que detecta: cita nome e caminho fictícios (`padrao-go`,
    `references/x.md`) e carrega a própria `MARCA_DE_INVENTARIO` como constante. Varrê-lo faz cada
    checagem casar consigo mesma. Auto-detecção é falso positivo, não achado — o mesmo motivo pelo
    qual `audit_base.py` não se varre em busca de segredo. Vale para as DUAS direções.
    """
    return os.path.abspath(os.path.join(base_dir, rel)) == os.path.abspath(__file__)


def declara_inventario(texto):
    """O arquivo DECLARA ser inventário completo?

    A marca tem de **abrir a linha** (aceitando o `>` da citação markdown), não apenas aparecer no
    texto: declaração é uma frase que o índice assume, enquanto menção é qualquer arquivo que fale
    da checagem — a própria `SKILL.md` desta skill cita a marca ao documentá-la. Substring solta
    transformaria toda documentação da regra num índice a cobrar.
    """
    for linha in texto.split("\n"):
        if linha.lstrip("> \t").startswith(MARCA_DE_INVENTARIO):
            return True
    return False


def ausentes_do_indice(rel, texto, indexaveis):
    """Artefatos do disco que um índice completo não cita."""
    return ["[%s] artefato existe e NAO esta indexado: %s" % (rel, nome)
            for nome in sorted(indexaveis) if nome not in texto]


def auditar_cobertura(base_dir):
    """A direção inversa: o que existe no disco aparece nos índices que se declaram completos.

    Só olha arquivo que carrega `MARCA_DE_INVENTARIO`. Índice sem a marca não é cobrado — e é o
    próprio índice que decide, escrevendo (ou não) a declaração. Índice curado que não se declara
    curado é indistinguível de índice furado, e essa distinção não cabe ao verificador fazer.
    """
    indexaveis = artefatos_indexaveis(base_dir)
    achados = []
    for rel, texto in arquivos_auditaveis(base_dir):
        if declara_inventario(texto) and not _e_este_arquivo(base_dir, rel):
            achados.extend(ausentes_do_indice(rel, texto, indexaveis))
    return achados


def auditar_ponteiros(base_dir):
    """As duas direções: o que é citado existe, e o que existe é citado."""
    universo = artefatos_da_base(base_dir)
    achados = []
    for rel, texto in arquivos_auditaveis(base_dir):
        if _e_este_arquivo(base_dir, rel):
            continue
        achados.extend(orfaos_do_arquivo(base_dir, rel, texto, universo))
    return achados + auditar_cobertura(base_dir)
