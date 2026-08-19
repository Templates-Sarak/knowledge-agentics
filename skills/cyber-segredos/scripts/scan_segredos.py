"""
scan_segredos.py — Varre arquivos do projeto (working tree) em busca de segredos hardcoded.

Lê o CATÁLOGO CANÔNICO de padrões (config.json desta skill) — a mesma fonte que os scanners do git
(git-verificacao-commit, git-especialista-repositorio) referenciam.

Uso:
    python scan_segredos.py --raiz . [--config config.json]
    # para o bundle do front, aponte para a pasta de build: --raiz dist  (ou build/.next)

Retorno:
    JSON {total, achados:[{arquivo, linha, tipo, trecho_mascarado}]}. Segredos sempre mascarados.

Regras (CLAUDE.md): zero hardcoded (padrões no config.json), nenhum segredo exposto no output,
responsabilidade única (apenas detecta — a correção/rotação é decisão com HITL na skill).
"""

import argparse
import json
import re
import sys
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def listar_arquivos(raiz: Path, extensoes, ignorar_dirs, tam_max):
    for caminho in raiz.rglob("*"):
        if not caminho.is_file():
            continue
        if any(parte in ignorar_dirs for parte in caminho.parts):
            continue
        if (
            extensoes
            and caminho.suffix not in extensoes
            and caminho.name not in extensoes
        ):
            continue
        try:
            if tam_max and caminho.stat().st_size > tam_max:
                continue
        except OSError:
            continue
        yield caminho


def mascarar(trecho: str) -> str:
    trecho = trecho.strip()
    return "****" if len(trecho) <= 8 else f"{trecho[:4]}...{trecho[-2:]}"


def achados_do_texto(nome_arquivo: str, texto: str, padroes) -> list:
    """Núcleo: acha os `padroes` (lista de `(tipo, regex_compilado)`) no TEXTO já lido, linha
    a linha. Puro — não toca `fs`. É o que o `--autoteste` prova com fixtures em memória."""
    achados = []
    for num, linha in enumerate(texto.splitlines(), start=1):
        for tipo, regex in padroes:
            m = regex.search(linha)
            if m:
                achados.append(
                    {
                        "arquivo": nome_arquivo,
                        "linha": num,
                        "tipo": tipo,
                        "trecho_mascarado": mascarar(m.group(0)),
                    }
                )
                break
    return achados


def escanear(caminho: Path, padroes) -> list:
    """Casca: lê o arquivo do disco e delega ao núcleo."""
    try:
        texto = caminho.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []
    return achados_do_texto(str(caminho), texto, padroes)


def autoteste() -> int:
    """Núcleo puro contra fixtures em memória — nenhuma linha toca `fs`."""
    falhas = []
    padroes = [
        ("AWS Access Key", re.compile(r"AKIA[0-9A-Z]{16}")),
        (
            "Segredo atribuido",
            re.compile(r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
        ),
    ]

    # Fixture montada por concatenacao, nao literal: o texto de ORIGEM deste arquivo nao pode
    # conter um segredo-formato contiguo, senao o proprio scan de vazamentos do audit_base.py
    # (que le este arquivo como QUALQUER OUTRO) acha um "vazamento" que e so dado de teste.
    chave_aws = "AKIA" + "ABCDEFGHIJ12KLMN"
    achados = achados_do_texto("app.py", f"aws_key = '{chave_aws}'\n", padroes)
    if len(achados) != 1 or achados[0]["tipo"] != "AWS Access Key":
        falhas.append("achados_do_texto deveria achar a AWS Access Key na linha 1")

    achados_limpo = achados_do_texto(
        "app.py", "def soma(a, b):\n    return a + b\n", padroes
    )
    if achados_limpo != []:
        falhas.append("achados_do_texto nao deveria achar nada em texto sem segredo")

    valor_secreto = "valor-bem" + "-secreto-123"
    multilinha = f"linha sem segredo\napi_key = '{valor_secreto}'\n"
    achados_linha = achados_do_texto("cfg.py", multilinha, padroes)
    if len(achados_linha) != 1 or achados_linha[0]["linha"] != 2:
        falhas.append("achados_do_texto deveria reportar o numero de linha correto (2)")

    if mascarar("abc") != "****":
        falhas.append("mascarar deveria colapsar trecho curto em '****'")
    if mascarar(chave_aws) != "AKIA...MN":
        falhas.append("mascarar deveria manter só prefixo/sufixo de trecho longo")

    for falha in falhas:
        print(f"  falha  {falha}")
    if falhas:
        print(f"autoteste (scan_segredos): {len(falhas)} falha(s)")
        return 1
    print("autoteste (scan_segredos): 5/5 ok")
    return 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(
        description="Scanner de segredos hardcoded (working tree)."
    )
    parser.add_argument(
        "--raiz", default=".", help="Raiz a varrer (ex.: . ou dist/ para o bundle)"
    )
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    parser.add_argument(
        "--autoteste", action="store_true", help="Roda a suite interna, nao toca disco"
    )
    args = parser.parse_args()

    if args.autoteste:
        sys.exit(autoteste())

    try:
        config = carregar_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Erro: config nao encontrado em '{args.config}'.")
    except json.JSONDecodeError as erro:
        sys.exit(f"Erro: config invalido ({erro}).")

    raiz = Path(args.raiz)
    if not raiz.exists():
        sys.exit(f"Erro: raiz '{raiz}' nao existe.")

    padroes = [(tipo, re.compile(rx)) for tipo, rx in config["padroes"].items()]
    achados = []
    for caminho in listar_arquivos(
        raiz,
        config.get("extensoes_texto", []),
        set(config.get("ignorar_dirs", [])),
        config.get("tamanho_max_arquivo_bytes"),
    ):
        achados.extend(escanear(caminho, padroes))

    print(
        json.dumps(
            {"total": len(achados), "achados": achados}, ensure_ascii=False, indent=2
        )
    )


if __name__ == "__main__":
    main()
