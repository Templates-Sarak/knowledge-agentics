"""verificar_neutralidade.py — degrau 6: o modulo generico nao carrega rastro da origem.

    python verificar_neutralidade.py --raiz <repo-ou-modulo> --denylist <arquivo> [--json]
    python verificar_neutralidade.py --raiz <caminho> --termo loja --termo "Minha Loja" [--json]
    python verificar_neutralidade.py --autoteste

Varre TODO texto do entregavel — codigo, teste, fixture, seed, migration, contrato, README, ADR,
`.env.example`, JSON de config — atras dos termos da denylist, e devolve exit 1 na primeira ocorrencia.
E a unica prova mecanica de que "generico" nao e opiniao: sem ela, "sem rastro da origem" e uma
afirmacao que ninguem conferiu, e o rastro que sobrevive e sempre o mesmo — comentario, exemplo de
`openapi.yaml`, nome em fixture e dado de seed, onde ninguem olha depois do primeiro dia.

**Por que casa variante, e nao a string crua.** O termo "Minha Loja" aparece no codigo como
`minhaLoja`, `minha_loja`, `minha-loja`, `MINHA_LOJA` e `minhaloja`. Uma denylist que so casasse a
forma escrita passaria por todas elas — e daria verde justamente onde o vazamento e mais provavel.
Por isso cada termo vira um padrao com separador opcional entre as palavras, ancorado em fronteira
alfanumerica (para `loja` nao acusar `relojoaria`).

**Fail-closed:** denylist vazia REPROVA. Uma varredura sem termo nenhum acha zero ocorrencia e
pareceria verde — o resultado mais perigoso que este script poderia produzir.
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Extensoes de texto que entram na varredura. O resto (binario, imagem, lockfile) fica de fora: nao
# guarda prosa e infla o ruido. `sem sufixo` (Dockerfile, LICENSE) entra pela lista de nomes abaixo.
EXTENSOES_TEXTO = frozenset(
    {
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".py",
        ".sql",
        ".yaml",
        ".yml",
        ".json",
        ".md",
        ".txt",
        ".env",
        ".example",
        ".html",
        ".css",
        ".sh",
        ".toml",
        ".ini",
        ".cfg",
        ".xml",
        ".csv",
    }
)
NOMES_SEM_SUFIXO = frozenset(
    {"Dockerfile", "Makefile", ".env.example", ".gitignore", ".dockerignore"}
)
PASTAS_IGNORADAS = frozenset(
    {
        "node_modules",
        "dist",
        "build",
        ".git",
        "__pycache__",
        ".venv",
        "coverage",
        ".ruff_cache",
    }
)

# ==================================================================================================
# NUCLEO — puro. Nada daqui ate a marca "CASCA" toca disco, rede ou processo.
# ==================================================================================================


def variantes(termo: str) -> str:
    """Padrao que casa o termo em qualquer convencao de escrita de codigo.

    "Minha Loja" -> casa minhaLoja, minha_loja, minha-loja, MINHA LOJA e minhaloja; NAO casa
    "relojoaria" (a ancora exige fronteira alfanumerica dos dois lados).
    """
    palavras = [re.escape(p) for p in re.split(r"[\s_\-]+", termo.strip()) if p]
    if not palavras:
        return ""
    return r"(?<![A-Za-z0-9])" + r"[\s_\-]?".join(palavras) + r"(?![A-Za-z0-9])"


def compilar_denylist(termos: list[str]) -> list[tuple[str, re.Pattern]]:
    """Cada termo vira (termo original, padrao compilado case-insensitive). Termo vazio e descartado."""
    compilados = []
    for termo in termos:
        padrao = variantes(termo)
        if padrao:
            compilados.append((termo.strip(), re.compile(padrao, re.IGNORECASE)))
    return compilados


def varrer_texto(texto: str, denylist: list[tuple[str, re.Pattern]]) -> list[dict]:
    """Ocorrencias de qualquer termo da denylist, com numero de linha e o trecho onde caiu."""
    achados = []
    for numero, linha in enumerate(texto.splitlines(), start=1):
        for termo, padrao in denylist:
            if padrao.search(linha):
                achados.append(
                    {"linha": numero, "termo": termo, "trecho": linha.strip()[:120]}
                )
    return achados


def e_arquivo_de_texto(nome: str, sufixo: str) -> bool:
    """Decide se o arquivo entra na varredura, pelo nome exato ou pela extensao."""
    return nome in NOMES_SEM_SUFIXO or sufixo.lower() in EXTENSOES_TEXTO


def decidir_veredito(achados: list[dict], denylist_vazia: bool) -> tuple[int, str]:
    """Exit code + frase do veredito. Denylist vazia REPROVA — zero achado ali nao e verde, e cegueira."""
    if denylist_vazia:
        return (
            2,
            "REPROVADO — denylist vazia: varredura sem termo nenhum nao prova nada",
        )
    if achados:
        return 1, f"REPROVADO — {len(achados)} ocorrencia(s) da origem no entregavel"
    return 0, "OK — nenhum termo da origem encontrado no entregavel"


# ==================================================================================================
# CASCA — daqui para baixo le disco. Nenhuma decisao: so coleta e imprime.
# ==================================================================================================


def _arquivos_de_texto(raiz: Path):
    """Todo arquivo de texto sob a raiz, pulando pasta de build e de dependencia."""
    for caminho in raiz.rglob("*"):
        if not caminho.is_file() or PASTAS_IGNORADAS & set(caminho.parts):
            continue
        if e_arquivo_de_texto(caminho.name, caminho.suffix):
            yield caminho


def varrer_arvore(raiz: Path, denylist: list[tuple[str, re.Pattern]]) -> list[dict]:
    """Aplica a denylist a arvore inteira, devolvendo os achados com o caminho relativo de cada um."""
    achados = []
    for caminho in _arquivos_de_texto(raiz):
        try:
            texto = caminho.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for achado in varrer_texto(texto, denylist):
            achados.append(
                {"arquivo": str(caminho.relative_to(raiz)).replace("\\", "/"), **achado}
            )
    return achados


def carregar_termos(caminho_denylist: str | None, termos_cli: list[str]) -> list[str]:
    """Termos do arquivo (um por linha, `#` e comentario) somados aos passados em `--termo`."""
    termos = list(termos_cli)
    if caminho_denylist:
        bruto = Path(caminho_denylist).read_text(encoding="utf-8", errors="replace")
        termos += [
            ln.strip()
            for ln in bruto.splitlines()
            if ln.strip() and not ln.strip().startswith("#")
        ]
    return termos


def _casos_casamento(deny: list[tuple[str, re.Pattern]]) -> list[str]:
    """Casos de casamento — as variantes de escrita que precisam cair, e as que nao podem cair."""
    falhas = []

    positivos = [
        "const minhaLoja = 1",
        "MINHA_LOJA=x",
        "-- minha-loja",
        "url: minhaloja.com",
        "// checkout aqui",
    ]
    for caso in positivos:
        if not varrer_texto(caso, deny):
            falhas.append(f"variante nao detectada: {caso!r}")

    for caso in ["const relojoaria = 1", "precheckoutx", "loja generica"]:
        if varrer_texto(caso, deny):
            falhas.append(f"falso positivo: {caso!r}")

    achado = varrer_texto("linha um\nconst checkout = 2\n", deny)
    if achado != [{"linha": 2, "termo": "checkout", "trecho": "const checkout = 2"}]:
        falhas.append(f"varrer_texto perdeu o numero da linha: {achado}")
    return falhas


def _casos_veredito() -> list[str]:
    """Casos do veredito — o fail-closed da denylist vazia e os exit codes."""
    falhas = []

    if compilar_denylist(["", "   "]):
        falhas.append("compilar_denylist aceitou termo vazio")

    if decidir_veredito([], True)[0] != 2:
        falhas.append(
            "denylist vazia nao reprovou — o fail-open que este script existe para impedir"
        )
    if (
        decidir_veredito([], False)[0] != 0
        or decidir_veredito([{"x": 1}], False)[0] != 1
    ):
        falhas.append("decidir_veredito errou o exit code")
    return falhas


def autoteste() -> int:
    """Prova o NUCLEO com fixtures em memoria, sem tocar disco."""
    deny = compilar_denylist(["Minha Loja", "checkout"])
    falhas = _casos_casamento(deny) + _casos_veredito()
    for falha in falhas:
        print(f"[FALHA] {falha}")
    print(
        f"[{'OK' if not falhas else 'ERRO'}] autoteste de verificar_neutralidade: {len(falhas)} falha(s)"
    )
    return 1 if falhas else 0


def _parser() -> argparse.ArgumentParser:
    """CLI do script. Separada do `main` para manter as duas dentro do limiar de tamanho."""
    parser = argparse.ArgumentParser(
        description="Degrau 6 — prova que o entregavel nao cita a origem."
    )
    parser.add_argument("--raiz", help="Repositorio (ou pasta do modulo) a varrer.")
    parser.add_argument(
        "--denylist", help="Arquivo com os termos da origem, um por linha."
    )
    parser.add_argument(
        "--termo", action="append", default=[], help="Termo avulso (repetivel)."
    )
    parser.add_argument(
        "--json", action="store_true", help="Imprime os achados como JSON."
    )
    parser.add_argument(
        "--autoteste",
        action="store_true",
        help="Prova o nucleo com fixtures em memoria.",
    )
    return parser


def _imprimir_humano(
    raiz: Path, denylist: list, achados: list[dict], veredito: tuple[int, str]
) -> None:
    """Relatorio legivel dos achados — o `--json` continua sendo a saida para maquina."""
    codigo, frase = veredito
    print(f"\n--- Neutralidade: {raiz.name} ({len(denylist)} termo(s) na denylist) ---")
    for achado in achados:
        print(
            f"  {achado['arquivo']}:{achado['linha']}  [{achado['termo']}]  {achado['trecho']}"
        )
    print(f"\n[{'OK' if codigo == 0 else 'ERRO'}] {frase}")


def main() -> int:
    parser = _parser()
    args = parser.parse_args()

    if args.autoteste:
        return autoteste()
    if not args.raiz:
        parser.error("--raiz e obrigatorio (ou use --autoteste)")

    raiz = Path(args.raiz).resolve()
    if not raiz.is_dir():
        print(f"[ERRO] {raiz} nao e um diretorio.", file=sys.stderr)
        return 2

    denylist = compilar_denylist(carregar_termos(args.denylist, args.termo))
    achados = varrer_arvore(raiz, denylist) if denylist else []
    codigo, veredito = decidir_veredito(achados, not denylist)

    if args.json:
        print(
            json.dumps(
                {"veredito": veredito, "codigo": codigo, "achados": achados},
                indent=2,
                ensure_ascii=False,
            )
        )
        return codigo

    _imprimir_humano(raiz, denylist, achados, (codigo, veredito))
    return codigo


if __name__ == "__main__":
    sys.exit(main())
