"""inventariar_origem.py — inventario READ-ONLY do modulo de origem, antes de generalizar.

    python inventariar_origem.py --modulo <caminho-do-modulo> [--json] [--vocabulario <arquivo>]
    python inventariar_origem.py --autoteste

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
# codigo. Extensivel por `--vocabulario <arquivo>` (uma palavra por linha) — o catalogo aqui e o
# minimo comum a qualquer modulo Sarak, nao a verdade final sobre um dominio especifico.
VOCABULARIO_GENERICO = frozenset(
    """
    api app async await base body cache class config const core create data database delete
    dto emit env error export extends fetch file from function gateway get handler header http
    id import index insert interface json let list log main map mapper method middleware migration
    module new next null number object of on operation options params patch path port post props
    provider public put query record repository request require res response result return role
    route router routes schema select service set src status string sync table test then this throw
    to token type update url use user util value var web where with yield
    adapter auditoria contrato dado dados dominio erro esquema listar modulo nome pagina porta
    registro resposta rota servico tabela tipo usuario valor
    """.split()
)

# Extensoes cujo conteudo entra no lexico. Binario e lockfile ficam de fora: poluem a frequencia com
# hash e nao dizem nada sobre o dominio.
EXTENSOES_CODIGO = (
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

PASTAS_IGNORADAS = frozenset(
    {"node_modules", "dist", "build", ".git", "__pycache__", ".venv", "coverage"}
)

# ==================================================================================================
# NUCLEO — puro. Nenhuma funcao daqui ate a marca "CASCA" toca disco, rede ou processo.
# ==================================================================================================


def separar_identificador(bruto: str) -> list[str]:
    """Quebra `camelCase`, `PascalCase`, `snake_case` e `kebab-case` em palavras minusculas."""
    partes = re.split(r"[_\-\s]+", bruto)
    palavras: list[str] = []
    for parte in partes:
        palavras.extend(re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+", parte))
    return [p.lower() for p in palavras if p]


def extrair_identificadores(texto: str) -> list[str]:
    """Todas as palavras de identificador de um texto de codigo, ja normalizadas em minusculas."""
    brutos = re.findall(r"[A-Za-z_][A-Za-z0-9_\-]{2,}", texto)
    palavras: list[str] = []
    for bruto in brutos:
        palavras.extend(separar_identificador(bruto))
    return palavras


def classificar_lexico(palavras: list[str], vocabulario: frozenset) -> list[dict]:
    """Frequencia das palavras que NAO estao no vocabulario generico, da mais comum para a menos.

    Cada item e um candidato a vocabulario de negocio — candidato, nunca veredito: quem decide e o
    portao de HITL do mapa de capacidade.
    """
    contagem = Counter(
        p for p in palavras if len(p) > 2 and p not in vocabulario and not p.isdigit()
    )
    return [{"termo": termo, "ocorrencias": n} for termo, n in contagem.most_common()]


def extrair_tabelas_sql(sql: str) -> dict[str, list[str]]:
    """Mapeia `CREATE TABLE <nome> (...)` para a lista de colunas declaradas em cada uma."""
    tabelas: dict[str, list[str]] = {}
    for bloco in re.finditer(
        r"create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.\"]+)\s*\((.*?)\n\s*\)",
        sql,
        re.I | re.S,
    ):
        nome = bloco.group(1).strip('"')
        colunas = []
        for linha in bloco.group(2).splitlines():
            candidato = re.match(r"\s*([a-z_][\w]*)\s+\S", linha, re.I)
            if candidato and candidato.group(1).lower() not in (
                "primary",
                "foreign",
                "unique",
                "constraint",
                "check",
            ):
                colunas.append(candidato.group(1))
        tabelas[nome] = colunas
    return tabelas


def extrair_endpoints_openapi(texto: str) -> list[str]:
    """Superficie do contrato como `METODO /caminho`, por leitura rasa da secao `paths:`."""
    endpoints: list[str] = []
    caminho_atual = ""
    for linha in texto.splitlines():
        caminho = re.match(r"^\s{2}(/\S*):\s*$", linha)
        if caminho:
            caminho_atual = caminho.group(1)
            continue
        metodo = re.match(
            r"^\s{4}(get|post|put|patch|delete|head|options):\s*$", linha, re.I
        )
        if metodo and caminho_atual:
            endpoints.append(f"{metodo.group(1).upper()} {caminho_atual}")
    return endpoints


def extrair_chaves_env(texto: str) -> list[str]:
    """Chaves declaradas num `.env.example` (nome antes do `=`), ignorando comentario e linha vazia."""
    chaves = []
    for linha in texto.splitlines():
        casamento = re.match(r"^\s*([A-Z][A-Z0-9_]*)\s*=", linha)
        if casamento:
            chaves.append(casamento.group(1))
    return chaves


def montar_inventario(manifesto: dict, partes: dict) -> dict:
    """Junta as partes lidas num relatorio unico. Nao interpreta: so organiza.

    `partes` traz `contrato`, `tabelas`, `chaves` e `lexico` — um dicionario em vez de cinco
    parametros soltos, que estouravam o limiar de assinatura do padrao.
    """
    return {
        "identidade": {
            campo: manifesto.get(campo)
            for campo in ("id", "name", "role", "binding", "basePath", "webPath")
        },
        "contrato": partes["contrato"],
        "dados": {
            "declarado": manifesto.get("data", {}),
            "tabelas_no_sql": partes["tabelas"],
        },
        "ambiente": {
            "declarado": manifesto.get("requiredEnv", []),
            "no_env_example": partes["chaves"],
        },
        "dependencias": {
            "ports": manifesto.get("ports", []),
            "consumes": manifesto.get("consumes", []),
        },
        "seguranca": {
            "permissions": manifesto.get("permissions", []),
            "publicRoutes": manifesto.get("publicRoutes", []),
            "sensitiveFields": manifesto.get("sensitiveFields", []),
        },
        "lexico_candidato_a_negocio": partes["lexico"],
    }


# ==================================================================================================
# CASCA — daqui para baixo le disco. Nenhuma decisao: so coleta e imprime.
# ==================================================================================================


def _arquivos_de_codigo(raiz: Path):
    """Todo arquivo de codigo sob a raiz, pulando pasta de build e de dependencia."""
    for caminho in raiz.rglob("*"):
        if not caminho.is_file() or caminho.suffix not in EXTENSOES_CODIGO:
            continue
        if PASTAS_IGNORADAS & set(caminho.parts):
            continue
        yield caminho


def _ler(caminho: Path) -> str:
    """Conteudo do arquivo, ou string vazia se ele nao existir ou nao for legivel como texto."""
    try:
        return caminho.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def coletar(raiz: Path, vocabulario: frozenset) -> dict:
    """Le o modulo inteiro e devolve o inventario. Read-only por construcao."""
    manifesto = json.loads(_ler(raiz / "module.json") or "{}")
    endpoints = extrair_endpoints_openapi(_ler(raiz / "contract" / "openapi.yaml"))
    sql = (
        "\n".join(_ler(p) for p in (raiz / "database").rglob("*.sql"))
        if (raiz / "database").is_dir()
        else ""
    )
    chaves = extrair_chaves_env(_ler(raiz / ".env.example"))
    palavras: list[str] = []
    for arquivo in _arquivos_de_codigo(raiz):
        palavras.extend(extrair_identificadores(_ler(arquivo)))
    partes = {
        "contrato": endpoints,
        "tabelas": extrair_tabelas_sql(sql),
        "chaves": chaves,
        "lexico": classificar_lexico(palavras, vocabulario),
    }
    return montar_inventario(manifesto, partes)


def imprimir_humano(inventario: dict) -> None:
    """Relatorio legivel — o `--json` continua sendo a saida para maquina."""
    ident = inventario["identidade"]
    print(
        f"\n--- Inventario de origem: {ident.get('id')} ({ident.get('role')}, {ident.get('binding')}) ---"
    )
    print(
        f"Contrato ....... {len(inventario['contrato'])} endpoints: {', '.join(inventario['contrato']) or '(nenhum)'}"
    )
    print(
        f"Tabelas ........ {', '.join(inventario['dados']['tabelas_no_sql']) or '(nenhuma no SQL)'}"
    )
    print(
        f"Ambiente ....... {', '.join(inventario['ambiente']['declarado']) or '(nenhuma)'}"
    )
    print(
        f"Portas ......... {', '.join(inventario['dependencias']['ports']) or '(nenhuma)'}"
    )
    print(
        f"Consumes ....... {', '.join(inventario['dependencias']['consumes']) or '(nenhum)'}"
    )
    print(
        f"Permissoes ..... {', '.join(inventario['seguranca']['permissions']) or '(nenhuma)'}"
    )
    print("\nLexico candidato a NEGOCIO (top 30) — candidato, nao veredito:")
    for item in inventario["lexico_candidato_a_negocio"][:30]:
        print(f"  {item['ocorrencias']:>5}x  {item['termo']}")
    print(
        "\nCada item acima precisa cair em UMA coluna do mapa de capacidade (nucleo/especializacao/infra)."
    )


def _casos_lexico() -> list[str]:
    """Casos do lexico — separacao de identificador e classificacao contra o vocabulario generico."""
    falhas = []

    if separar_identificador("pedidoDeCompra_v2") != [
        "pedido",
        "de",
        "compra",
        "v",
        "2",
    ]:
        falhas.append(
            f"separar_identificador: {separar_identificador('pedidoDeCompra_v2')}"
        )

    lexico = classificar_lexico(
        ["checkout", "checkout", "user", "carrinho", "api"], VOCABULARIO_GENERICO
    )
    if [i["termo"] for i in lexico] != ["checkout", "carrinho"]:
        falhas.append(f"classificar_lexico deixou passar termo generico: {lexico}")
    return falhas


def _casos_extracao() -> list[str]:
    """Casos de extracao — tabelas do SQL, endpoints do OpenAPI e chaves do .env.example."""
    falhas = []

    sql = "CREATE TABLE IF NOT EXISTS loja_pedidos (\n  id uuid PRIMARY KEY,\n  cliente_id uuid NOT NULL,\n  PRIMARY KEY (id)\n);"
    if extrair_tabelas_sql(sql) != {"loja_pedidos": ["id", "cliente_id"]}:
        falhas.append(f"extrair_tabelas_sql: {extrair_tabelas_sql(sql)}")

    openapi = "paths:\n  /health:\n    get:\n      summary: x\n  /pedidos:\n    post:\n      summary: y\n"
    if extrair_endpoints_openapi(openapi) != ["GET /health", "POST /pedidos"]:
        falhas.append(
            f"extrair_endpoints_openapi: {extrair_endpoints_openapi(openapi)}"
        )

    if extrair_chaves_env("# comentario\nLOJA_DB_URL=x\n\nminuscula=y\n") != [
        "LOJA_DB_URL"
    ]:
        falhas.append("extrair_chaves_env aceitou linha invalida")
    return falhas


def autoteste() -> int:
    """Prova o NUCLEO com fixtures em memoria, sem tocar disco."""
    falhas = _casos_lexico() + _casos_extracao()
    for falha in falhas:
        print(f"[FALHA] {falha}")
    print(
        f"[{'OK' if not falhas else 'ERRO'}] autoteste de inventariar_origem: {5 - len(falhas)}/5"
    )
    return 1 if falhas else 0


def _parser() -> argparse.ArgumentParser:
    """CLI do script. Separada do `main` para manter as duas dentro do limiar de tamanho."""
    parser = argparse.ArgumentParser(
        description="Inventario read-only do modulo de origem."
    )
    parser.add_argument("--modulo", help="Caminho da pasta do modulo de origem.")
    parser.add_argument(
        "--json", action="store_true", help="Imprime o inventario como JSON."
    )
    parser.add_argument(
        "--vocabulario", help="Arquivo com termos genericos extras, um por linha."
    )
    parser.add_argument(
        "--autoteste",
        action="store_true",
        help="Prova o nucleo com fixtures em memoria.",
    )
    return parser


def main() -> int:
    parser = _parser()
    args = parser.parse_args()

    if args.autoteste:
        return autoteste()
    if not args.modulo:
        parser.error("--modulo e obrigatorio (ou use --autoteste)")

    raiz = Path(args.modulo).resolve()
    if not (raiz / "module.json").is_file():
        print(
            f"[ERRO] {raiz} nao parece um modulo Sarak — nao ha module.json ali.",
            file=sys.stderr,
        )
        return 2

    vocabulario = VOCABULARIO_GENERICO
    if args.vocabulario:
        extras = _ler(Path(args.vocabulario)).split()
        vocabulario = frozenset(VOCABULARIO_GENERICO | {e.lower() for e in extras})

    inventario = coletar(raiz, vocabulario)
    print(
        json.dumps(inventario, indent=2, ensure_ascii=False)
    ) if args.json else imprimir_humano(inventario)
    return 0


if __name__ == "__main__":
    sys.exit(main())
