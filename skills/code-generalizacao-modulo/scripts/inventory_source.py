"""inventory_source.py — inventario READ-ONLY do modulo de origem, antes de generalizar.

    python inventory_source.py --module <caminho-do-modulo> [--json] [--vocabulary <arquivo>]
    python inventory_source.py --selftest

Responde, sem julgamento nenhum, o que a skill "code-generalizacao-modulo" precisa ANTES de abrir a
boca no portao do mapa de capacidade: qual e a superficie declarada do modulo (manifesto + contrato),
que tabelas e colunas ele possui, que chaves de ambiente exige, que portas e `consumes` declara — e,
o insumo que so um script produz sem cansar, o LEXICO: os identificadores do codigo por frequencia,
separando o vocabulario de CAPACIDADE (generico, tecnico) do candidato a vocabulario de NEGOCIO.

**Por que o lexico existe.** O portao central da skill e classificar cada item em nucleo x
especializacao x infraestrutura. Feito de cabeca, o que escapa e sempre a mesma coisa: o termo de
negocio que virou nome de funcao, de campo ou de coluna e passa despercebido porque parece tecnico
no contexto de origem. A frequencia nao decide nada — ela so garante que ninguem ESQUECA de decidir.

**O que este script NAO faz:** nao julga o que e negocio (isso e HITL), nao modifica nada (a origem e
read-only por regra da skill), nao valida conformidade (isso e `tools/gate/validate.mjs`) e nao le
o `.env` real — so o `.env.example`, que e versionado e nao tem segredo.

O parse de OpenAPI e RASO de proposito: le a secao `paths:` procurando caminho + metodo, sem resolver
`$ref` nem componentes. Serve para listar a superficie, nunca para validar contrato — quem valida
contrato em runtime e a skill `test-api-contrato`, no degrau 5.
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

# Vocabulario que NUNCA e candidato a negocio: termos da arquitetura, da stack e da lingua franca do
# codigo. Extensivel por `--vocabulary <arquivo>` (uma palavra por linha) — o catalogo aqui e o
# minimo comum a qualquer modulo Sarak, nao a verdade final sobre um dominio especifico.
GENERIC_VOCABULARY = frozenset(
    """
    adapter api app async await base body cache class config const core create data database delete
    dto emit env error export extends fetch file from function gateway get handler header http
    id import index insert interface json let list log main map mapper method middleware migration
    module new next null number object of on operation options params patch path port post props
    provider public put query record repository request require res response result return role
    route router routes schema select service set src status string sync table test then this throw
    to token type update url use user util value var web where with yield
    """.split()
)

# Palavras genericas em portugues: dado de varredura (modulos de origem escritos em portugues).
PORTUGUESE_GENERIC_VOCABULARY = frozenset(
    """
    auditoria contrato dado dados dominio erro esquema listar modulo nome pagina porta
    registro resposta rota servico tabela tipo usuario valor
    """.split()
)

DEFAULT_VOCABULARY = GENERIC_VOCABULARY | PORTUGUESE_GENERIC_VOCABULARY

# Extensoes cujo conteudo entra no lexico. Binario e lockfile ficam de fora: poluem a frequencia com
# hash e nao dizem nada sobre o dominio.
CODE_EXTENSIONS = (
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".py",
    ".sql",
    ".yaml",
    ".yml",
    ".json",
)

IGNORED_DIRS = frozenset(
    {"node_modules", "dist", "build", ".git", "__pycache__", ".venv", "coverage"}
)

# ==================================================================================================
# NUCLEO — puro. Nenhuma funcao daqui ate a marca "CASCA" toca disco, rede ou processo.
# ==================================================================================================


def split_identifier(raw: str) -> list[str]:
    """Quebra `camelCase`, `PascalCase`, `snake_case` e `kebab-case` em palavras minusculas."""
    parts = re.split(r"[_\-\s]+", raw)
    words: list[str] = []
    for part in parts:
        words.extend(re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+", part))
    return [p.lower() for p in words if p]


def extract_identifiers(text: str) -> list[str]:
    """Todas as palavras de identificador de um texto de codigo, ja normalizadas em minusculas."""
    raws = re.findall(r"[A-Za-z_][A-Za-z0-9_\-]{2,}", text)
    words: list[str] = []
    for raw in raws:
        words.extend(split_identifier(raw))
    return words


def classify_lexicon(words: list[str], vocabulary: frozenset) -> list[dict]:
    """Frequencia das palavras que NAO estao no vocabulario generico, da mais comum para a menos.

    Cada item e um candidato a vocabulario de negocio — candidato, nunca veredito: quem decide e o
    portao de HITL do mapa de capacidade.
    """
    counts = Counter(
        p for p in words if len(p) > 2 and p not in vocabulary and not p.isdigit()
    )
    return [{"term": term, "occurrences": n} for term, n in counts.most_common()]


def extract_sql_tables(sql: str) -> dict[str, list[str]]:
    """Mapeia `CREATE TABLE <nome> (...)` para a lista de colunas declaradas em cada uma."""
    tables: dict[str, list[str]] = {}
    for block in re.finditer(
        r"create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.\"]+)\s*\((.*?)\n\s*\)",
        sql,
        re.I | re.S,
    ):
        name = block.group(1).strip('"')
        columns = []
        for line in block.group(2).splitlines():
            candidate = re.match(r"\s*([a-z_][\w]*)\s+\S", line, re.I)
            if candidate and candidate.group(1).lower() not in (
                "primary",
                "foreign",
                "unique",
                "constraint",
                "check",
            ):
                columns.append(candidate.group(1))
        tables[name] = columns
    return tables


def extract_openapi_endpoints(text: str) -> list[str]:
    """Superficie do contrato como `METODO /caminho`, por leitura rasa da secao `paths:`."""
    endpoints: list[str] = []
    current_path = ""
    for line in text.splitlines():
        path = re.match(r"^\s{2}(/\S*):\s*$", line)
        if path:
            current_path = path.group(1)
            continue
        method_match = re.match(
            r"^\s{4}(get|post|put|patch|delete|head|options):\s*$", line, re.I
        )
        if method_match and current_path:
            endpoints.append(f"{method_match.group(1).upper()} {current_path}")
    return endpoints


def extract_env_keys(text: str) -> list[str]:
    """Chaves declaradas num `.env.example` (nome antes do `=`), ignorando comentario e linha vazia."""
    keys = []
    for line in text.splitlines():
        match = re.match(r"^\s*([A-Z][A-Z0-9_]*)\s*=", line)
        if match:
            keys.append(match.group(1))
    return keys


def build_inventory(manifest: dict, parts: dict) -> dict:
    """Junta as partes lidas num relatorio unico. Nao interpreta: so organiza.

    `partes` traz `contrato`, `tabelas`, `chaves` e `lexico` — um dicionario em vez de cinco
    parametros soltos, que estouravam o limiar de assinatura do padrao.
    """
    return {
        "identity": {
            field: manifest.get(field)
            for field in ("id", "name", "role", "binding", "basePath", "webPath")
        },
        "contract": parts["contract"],
        "data": {
            "declared": manifest.get("data", {}),
            "tables_in_sql": parts["tables"],
        },
        "environment": {
            "declared": manifest.get("requiredEnv", []),
            "in_env_example": parts["keys"],
        },
        "dependencies": {
            "ports": manifest.get("ports", []),
            "consumes": manifest.get("consumes", []),
        },
        "security": {
            "permissions": manifest.get("permissions", []),
            "publicRoutes": manifest.get("publicRoutes", []),
            "sensitiveFields": manifest.get("sensitiveFields", []),
        },
        "business_candidate_lexicon": parts["lexicon"],
    }


# ==================================================================================================
# CASCA — daqui para baixo le disco. Nenhuma decisao: so coleta e imprime.
# ==================================================================================================


def _code_files(root: Path):
    """Todo arquivo de codigo sob a raiz, pulando pasta de build e de dependencia."""
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in CODE_EXTENSIONS:
            continue
        if IGNORED_DIRS & set(path.parts):
            continue
        yield path


def _read(path: Path) -> str:
    """Conteudo do arquivo, ou string vazia se ele nao existir ou nao for legivel como texto."""
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def collect(root: Path, vocabulary: frozenset) -> dict:
    """Le o modulo inteiro e devolve o inventario. Read-only por construcao."""
    manifest = json.loads(_read(root / "module.json") or "{}")
    endpoints = extract_openapi_endpoints(_read(root / "contract" / "openapi.yaml"))
    sql = (
        "\n".join(_read(p) for p in (root / "database").rglob("*.sql"))
        if (root / "database").is_dir()
        else ""
    )
    keys = extract_env_keys(_read(root / ".env.example"))
    words: list[str] = []
    for file in _code_files(root):
        words.extend(extract_identifiers(_read(file)))
    parts = {
        "contract": endpoints,
        "tables": extract_sql_tables(sql),
        "keys": keys,
        "lexicon": classify_lexicon(words, vocabulary),
    }
    return build_inventory(manifest, parts)


def print_human(inventory: dict) -> None:
    """Relatorio legivel — o `--json` continua sendo a saida para maquina."""
    ident = inventory["identity"]
    print(
        f"\n--- Source inventory: {ident.get('id')} ({ident.get('role')}, {ident.get('binding')}) ---"
    )
    print(
        f"Contract ....... {len(inventory['contract'])} endpoints: {', '.join(inventory['contract']) or '(none)'}"
    )
    print(
        f"Tables ......... {', '.join(inventory['data']['tables_in_sql']) or '(none in the SQL)'}"
    )
    print(
        f"Environment .... {', '.join(inventory['environment']['declared']) or '(none)'}"
    )
    print(
        f"Ports .......... {', '.join(inventory['dependencies']['ports']) or '(none)'}"
    )
    print(
        f"Consumes ....... {', '.join(inventory['dependencies']['consumes']) or '(none)'}"
    )
    print(
        f"Permissions ... {', '.join(inventory['security']['permissions']) or '(none)'}"
    )
    print("\nBusiness-candidate lexicon (top 30) — a candidate, not a verdict:")
    for item in inventory["business_candidate_lexicon"][:30]:
        print(f"  {item['occurrences']:>5}x  {item['term']}")
    print(
        "\nEach item above must fall into ONE column of the capability map (core/specialization/infra)."
    )


def _lexicon_cases() -> list[str]:
    """Casos do lexico — separacao de identificador e classificacao contra o vocabulario generico."""
    failures = []

    if split_identifier("purchaseOrderItem_v2") != [
        "purchase",
        "order",
        "item",
        "v",
        "2",
    ]:
        failures.append(
            f"split_identifier: {split_identifier('purchaseOrderItem_v2')}"
        )

    lexicon = classify_lexicon(
        ["checkout", "checkout", "user", "cart", "api"], DEFAULT_VOCABULARY
    )
    if [i["term"] for i in lexicon] != ["checkout", "cart"]:
        failures.append(f"classify_lexicon let a generic term through: {lexicon}")
    return failures


def _extraction_cases() -> list[str]:
    """Casos de extracao — tabelas do SQL, endpoints do OpenAPI e chaves do .env.example."""
    failures = []

    sql = "CREATE TABLE IF NOT EXISTS shop_orders (\n  id uuid PRIMARY KEY,\n  customer_id uuid NOT NULL,\n  PRIMARY KEY (id)\n);"
    if extract_sql_tables(sql) != {"shop_orders": ["id", "customer_id"]}:
        failures.append(f"extract_sql_tables: {extract_sql_tables(sql)}")

    openapi = "paths:\n  /health:\n    get:\n      summary: x\n  /orders:\n    post:\n      summary: y\n"
    if extract_openapi_endpoints(openapi) != ["GET /health", "POST /orders"]:
        failures.append(
            f"extract_openapi_endpoints: {extract_openapi_endpoints(openapi)}"
        )

    if extract_env_keys("# comment\nSHOP_DB_URL=x\n\nlowercase=y\n") != [
        "SHOP_DB_URL"
    ]:
        failures.append("extract_env_keys accepted an invalid line")
    return failures


def run_selftest() -> int:
    """Prova o NUCLEO com fixtures em memoria, sem tocar disco."""
    failures = _lexicon_cases() + _extraction_cases()
    for failure in failures:
        print(f"[FAIL] {failure}")
    print(
        f"[{'OK' if not failures else 'ERROR'}] selftest of inventory_source: {5 - len(failures)}/5"
    )
    return 1 if failures else 0


def _parser() -> argparse.ArgumentParser:
    """CLI do script. Separada do `main` para manter as duas dentro do limiar de tamanho."""
    parser = argparse.ArgumentParser(
        description="Read-only inventory of the source module."
    )
    parser.add_argument("--module", help="Path of the source module directory.")
    parser.add_argument(
        "--json", action="store_true", help="Print the inventory as JSON."
    )
    parser.add_argument(
        "--vocabulary", help="File with extra generic terms, one per line."
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="Prove the core with in-memory fixtures.",
    )
    return parser


def main() -> int:
    parser = _parser()
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()
    if not args.module:
        parser.error("--module is required (or use --selftest)")

    root = Path(args.module).resolve()
    if not (root / "module.json").is_file():
        print(
            f"[ERROR] {root} does not look like a Sarak module — no module.json there.",
            file=sys.stderr,
        )
        return 2

    vocabulary = DEFAULT_VOCABULARY
    if args.vocabulary:
        extras = _read(Path(args.vocabulary)).split()
        vocabulary = frozenset(DEFAULT_VOCABULARY | {e.lower() for e in extras})

    inventory = collect(root, vocabulary)
    print(
        json.dumps(inventory, indent=2, ensure_ascii=False)
    ) if args.json else print_human(inventory)
    return 0


if __name__ == "__main__":
    sys.exit(main())
