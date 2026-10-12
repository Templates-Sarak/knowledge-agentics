"""Checagem de ponteiro órfão da base Sarak — caminho citado e nome de artefato citado.

Separado de `audit_base.py` por SRP: aquele confere metadados e sintaxe; este resolve referências.

POLÍTICA: prefere falso NEGATIVO a falso positivo, como a família heurística do gate
(`04-regras.md` §7.2). Um checador que acusa caminho correto é rodado uma vez e abandonado; um que
deixa escapar um órfão ainda pega os outros. Por isso só resolve o que consegue resolver sem
ambiguidade — tudo mais é ignorado de propósito, e isso está documentado em `path_target`.
"""
import os
import re

# Só estes prefixos são resolvidos a partir da RAIZ da base. Caminho de projeto GERADO
# (`specs/arquitetura/`, `contract/`, `core/`, `modules/`, `api/`, `tools/`) nunca entra:
# ele existe no molde ou no projeto instalado, jamais aqui, e é a maioria das citações.
BASE_PREFIXES = ("skills/", "agents/", "commands/", "hooks/", "plugin/", "specs/_estrutura")

# Pastas da Camada 3 de uma skill — resolvem contra a pasta da própria skill.
LAYER3_PREFIXES = ("references/", "scripts/", "assets/")

# Gerado por `plugin/sync_ide.py`, e citá-lo é correto. É UM arquivo, não três: `antigravity_rules.txt`
# e `claude_instructions.txt` constavam aqui e o `sync_ide.py` não gera nenhum dos dois há tempos — os
# arquivos não existem nem são rastreados. Declaração morta em lista de exceção é pior que inofensiva:
# ela promete que alguém confere algo que ninguém confere mais. Se `sync_ide.py` voltar a gerar outro
# artefato, a entrada nova entra aqui junto com ele, nunca antes.
GENERATED = frozenset({
    "plugin/sarak_routing_table.md",
})

# Um índice que se declara COMPLETO aceita ser cobrado na direção inversa: tudo que existe no disco
# tem de estar nele. A declaração mora no índice, nunca aqui — índice curado que precise omitir algo
# declara a omissão no próprio texto. Verificador com lista de exceção editorial vira dono de decisão
# que não é dele e envelhece escondido.
INVENTORY_MARK = "**Inventário completo.**"

# O que um índice completo tem de citar. `hooks/` fica de fora: hook não é roteado por nome, dispara
# sozinho no evento do harness — indexá-lo seria cobrar presença de quem ninguém invoca.
INDEXED_DIRS = ("skills", "agents", "commands")
PUBLISHED_DIRS = ("skills", "agents", "commands", "hooks")

AREA_PREFIXES = (
    "padrao", "code", "test", "cyber", "git", "meta", "deploy", "site", "obs", "db",
    "otimizacao", "spec",
)
# `\d*` cobre a área numerada dos commands de fluxo sequencial (`code1-`, `cyber2-`, `git1-`).
# Sem ele, os sete commands mais citados da base — justamente os que o `AGENTS.md` usa para rotear —
# nunca seriam verificados, e renumerar um apodreceria toda citação em silêncio.
ARTIFACT_NAME = re.compile(r"^(?:%s)\d*-[a-z0-9]+(?:-[a-z0-9]+)*$" % "|".join(AREA_PREFIXES))
IN_BACKTICKS = re.compile(r"`([^`\n]+)`")

# Arquivo cujo ofício é exibir exemplo cita nome fictício de propósito.
EXAMPLE_FILES = ("examples.md", "templates.md")
# `meta-create-skill` ENSINA a nomear skill: os nomes que ela mostra são hipotéticos por construção
# (`code-padronizacao`, nunca `CodePadronizacao`). A isenção vale só para a checagem de NOME — os
# caminhos dela continuam sendo resolvidos normalmente.
NAME_TEACHING_SKILLS = ("skills/meta-create-skill/",)
# Marcas de que a citação é ilustrativa ou histórica, não um ponteiro a seguir.
EXAMPLE_MARKS = ("ex:", "ex.:", "por exemplo", "exemplo", "aposentad")

READ_EXTENSIONS = (".md", ".py", ".js", ".mjs", ".json")
IGNORED_DIRS = {"__pycache__", "node_modules", ".git", ".venv"}
TARGETS = ("agents", "commands", "hooks", "skills", "specs/_estrutura_base",
         "specs/_estrutura_base_site")


def _names_of(base_dir, dirs):
    """Nome de cada entrada das pastas, sem extensão."""
    names = set()
    for directory in dirs:
        path = os.path.join(base_dir, directory)
        if not os.path.isdir(path):
            continue
        for entry in os.listdir(path):
            names.add(os.path.splitext(entry)[0])
    return names


def base_artifacts(base_dir):
    """Todo nome que a base publica: skill, agent, command e hook."""
    return _names_of(base_dir, PUBLISHED_DIRS)


def indexable_artifacts(base_dir):
    """O que um índice completo tem de citar — sem os hooks."""
    return _names_of(base_dir, INDEXED_DIRS)


def _target_paths(base_dir):
    """Gera o caminho de cada arquivo sob os alvos, ignorando pasta gerada."""
    for target in TARGETS:
        for root, dirs, files in os.walk(os.path.join(base_dir, target)):
            dirs[:] = [p for p in dirs if p not in IGNORED_DIRS]
            for name in files:
                yield os.path.join(root, name)


def _read(path, base_dir):
    """`(rel, texto)` do arquivo, ou `None` quando não é auditável ou não abre."""
    if not path.endswith(READ_EXTENSIONS):
        return None
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return None
    return os.path.relpath(path, base_dir).replace("\\", "/"), text


def auditable_files(base_dir):
    """Gera `(rel, texto)` de cada arquivo dos alvos, com a barra normalizada."""
    for path in _target_paths(base_dir):
        loaded = _read(path, base_dir)
        if loaded is not None:
            yield loaded


def _is_placeholder(token):
    """`<module>`, `[modulo]`, `caminho/para/x` — molde, não caminho real."""
    return any(c in token for c in "<>[]*|") or " " in token or "para/" in token


def _window(lines, index):
    """Linha e a anterior: bloco de citação markdown quebra a frase no meio, e o aviso
    "Aposentados nesta versão" abre numa linha e lista os caminhos na seguinte."""
    return " ".join(lines[max(0, index - 1):index + 1]).lower()


def exempt_as_example(lines, index):
    """A citação é ilustrativa ou histórica? Vale para caminho E para nome."""
    return any(mark in _window(lines, index) for mark in EXAMPLE_MARKS)


def relative_to_other_artifact(lines, index, universe):
    """A linha nomeia outro artefato, então `references/x.md` é relativo a ELE, não a quem escreve.

    Suprime **só** a resolução de caminho da Camada 3. O nome continua sendo checado — senão uma
    linha que lista `padrao-python`, `padrao-typescript` e `padrao-go` esconderia o órfão atrás
    dos dois nomes válidos, que é exatamente como `padrao-go` sobreviveu em nove lugares.
    """
    return any(name in _window(lines, index) for name in universe)


def path_target(token, owner):
    """Caminho relativo à base que o token promete, ou `None` quando está fora do alcance.

    `None` é a resposta honesta para a maioria: caminho de projeto gerado, nome de ferramenta
    externa (`golangci-lint`), pasta nua (`assets/` como vocabulário estrutural) e qualquer forma
    que este resolvedor não saiba ancorar.
    """
    if token.endswith("/") or _is_placeholder(token):
        return None
    if token.startswith(BASE_PREFIXES):
        return token
    if token.startswith(LAYER3_PREFIXES) and owner is not None:
        return "%s/%s" % (owner, token)
    return None


def cited_name(token):
    """O nome de artefato que o token cita, ou `None` se não for um nome.

    A barra do command (`/code1-auditar`) é sintaxe de invocação, não parte do nome — e é a forma
    em que os commands aparecem em quase toda citação da base. Sem descartá-la, o `^` do regex não
    casa e a checagem de nome passa ao largo justamente do artefato mais citado.
    """
    name = token[1:] if token.startswith("/") else token
    return name if ARTIFACT_NAME.match(name) else None


def token_error(base_dir, token, owner, universe):
    """Mensagem de órfão para o token, ou `None`. `universo=None` desliga a checagem de nome."""
    target = path_target(token, owner)
    if target is not None:
        if target in GENERATED or os.path.exists(os.path.join(base_dir, target)):
            return None
        return "path does not exist: %s" % token
    name = cited_name(token)
    if universe is not None and name is not None and name not in universe:
        return "artifact does not exist: %s" % token
    return None


def file_orphans(base_dir, rel, text, universe):
    """Ponteiros do arquivo que não resolvem — de caminho e de nome."""
    findings = []
    lines = text.split("\n")
    owner = "/".join(rel.split("/")[:2]) if rel.startswith("skills/") else None
    # `None` desliga a checagem de nome onde nome fictício é o conteúdo legítimo do arquivo.
    names = None if rel.startswith(NAME_TEACHING_SKILLS) else universe
    for index, line in enumerate(lines):
        if rel.endswith(EXAMPLE_FILES) or exempt_as_example(lines, index):
            continue
        # `dono=None` desliga só a Camada 3 relativa; caminho da raiz e nome seguem checados.
        anchor = None if relative_to_other_artifact(lines, index, universe) else owner
        for token in IN_BACKTICKS.findall(line):
            error = token_error(base_dir, token.strip(), anchor, names)
            if error is not None:
                findings.append("[%s:%d] %s" % (rel, index + 1, error))
    return findings


def _is_this_file(base_dir, rel):
    """Este script DOCUMENTA o que detecta: cita nome e caminho fictícios (`padrao-go`,
    `references/x.md`) e carrega a própria `INVENTORY_MARK` como constante. Varrê-lo faz cada
    checagem casar consigo mesma. Auto-detecção é falso positivo, não achado — o mesmo motivo pelo
    qual `audit_base.py` não se varre em busca de segredo. Vale para as DUAS direções.
    """
    return os.path.abspath(os.path.join(base_dir, rel)) == os.path.abspath(__file__)


def declares_inventory(text):
    """O arquivo DECLARA ser inventário completo?

    A marca tem de **abrir a linha** (aceitando o `>` da citação markdown), não apenas aparecer no
    texto: declaração é uma frase que o índice assume, enquanto menção é qualquer arquivo que fale
    da checagem — a própria `SKILL.md` desta skill cita a marca ao documentá-la. Substring solta
    transformaria toda documentação da regra num índice a cobrar.
    """
    for line in text.split("\n"):
        if line.lstrip("> \t").startswith(INVENTORY_MARK):
            return True
    return False


def missing_from_index(rel, text, indexable):
    """Artefatos do disco que um índice completo não cita."""
    return ["[%s] artifact exists and is NOT indexed: %s" % (rel, name)
            for name in sorted(indexable) if name not in text]


def audit_coverage(base_dir):
    """A direção inversa: o que existe no disco aparece nos índices que se declaram completos.

    Só olha arquivo que carrega `INVENTORY_MARK`. Índice sem a marca não é cobrado — e é o
    próprio índice que decide, escrevendo (ou não) a declaração. Índice curado que não se declara
    curado é indistinguível de índice furado, e essa distinção não cabe ao verificador fazer.
    """
    indexable = indexable_artifacts(base_dir)
    findings = []
    for rel, text in auditable_files(base_dir):
        if declares_inventory(text) and not _is_this_file(base_dir, rel):
            findings.extend(missing_from_index(rel, text, indexable))
    return findings


def audit_pointers(base_dir):
    """As duas direções: o que é citado existe, e o que existe é citado."""
    universe = base_artifacts(base_dir)
    findings = []
    for rel, text in auditable_files(base_dir):
        if _is_this_file(base_dir, rel):
            continue
        findings.extend(file_orphans(base_dir, rel, text, universe))
    return findings + audit_coverage(base_dir)
