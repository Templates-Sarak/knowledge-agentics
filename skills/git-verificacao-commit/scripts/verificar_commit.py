"""
verificar_commit.py — Gate rápido: varre o que está STAGED por segredos e arquivos sensíveis.

Uso (manual ou via pre-commit hook):
    python verificar_commit.py [--raiz .] [--config config.json]
    python verificar_commit.py --autoteste

Saída:
    JSON {bloqueado, achados_segredo, arquivos_sensiveis}. Segredos mascarados.
    **Exit code 1** se houver qualquer achado (faz o pre-commit hook BLOQUEAR o commit); 0 se limpo.

Regras (CLAUDE.md): zero hardcoded (padrões/listas no config.json), segredos mascarados,
responsabilidade única (só o commit atual/staged — histórico é da git-especialista-repositorio).

`--autoteste` prova as duas camadas, na convenção núcleo puro + casca desta base: `varrer_segredos`,
`varrer_arquivos` e `avaliar_bloqueio` são PURAS (fixtures em memória, sem git); o caminho fim a fim —
"staged com segredo bloqueia de verdade", que a camada 3 (`template-self-test.mjs`, passo
`primeiro-commit`) não cobria — só é alcançável rodando o próprio script contra um repositório git
**temporário**, montado e destruído a cada caso. Nenhum segredo real é usado: a chave AWS plantada é
`CHAVE_AWS_DE_EXEMPLO` (definida mais abaixo) — o valor de EXEMPLO da própria documentação da AWS,
nunca uma credencial viva, e partido em dois literais no código-fonte para não disparar o próprio
scanner estático de `audit_base.py` sobre este arquivo.
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from fnmatch import fnmatch
from pathlib import Path


def carregar_config(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def git(raiz: Path, *args) -> str:
    try:
        r = subprocess.run(
            ["git", "-C", str(raiz), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except FileNotFoundError:
        sys.exit("Erro: git nao encontrado no ambiente.")
    if r.returncode != 0:
        sys.exit(
            f"Erro git ({' '.join(args)}): {r.stderr.strip()} (a raiz e um repo Git?)"
        )
    return r.stdout


def mascarar(trecho: str) -> str:
    trecho = trecho.strip()
    return "****" if len(trecho) <= 8 else f"{trecho[:4]}...{trecho[-2:]}"


def varrer_segredos(diff: str, padroes) -> list:
    achados, arquivo = [], None
    for linha in diff.splitlines():
        if linha.startswith("+++ b/"):
            arquivo = linha[6:]
        elif linha.startswith("+") and not linha.startswith("+++"):
            for tipo, regex in padroes:
                m = regex.search(linha[1:])
                if m:
                    achados.append(
                        {
                            "arquivo": arquivo,
                            "tipo": tipo,
                            "trecho_mascarado": mascarar(m.group(0)),
                        }
                    )
                    break
    return achados


def varrer_arquivos(arquivos, sensiveis, permitidos) -> list:
    achados = []
    for caminho in arquivos:
        nome = Path(caminho).name
        if any(fnmatch(nome, p) for p in permitidos):
            continue
        if any(fnmatch(nome, p) for p in sensiveis):
            achados.append(caminho)
    return achados


def avaliar_bloqueio(achados_segredo: list, arquivos_sensiveis: list) -> bool:
    """PURA: a decisao final do gate — bloqueia se ha qualquer achado, de qualquer tipo."""
    return bool(achados_segredo or arquivos_sensiveis)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(
            encoding="utf-8"
        )  # saída UTF-8 mesmo em console cp1252 (Windows/acentos)
    parser = argparse.ArgumentParser(description="Gate de segredos do commit staged.")
    parser.add_argument("--raiz", default=".")
    parser.add_argument("--config", default=str(Path(__file__).parent / "config.json"))
    parser.add_argument("--autoteste", action="store_true")
    args = parser.parse_args()

    if args.autoteste:
        sys.exit(rodar_autoteste())

    try:
        config = carregar_config(Path(args.config))
    except FileNotFoundError:
        sys.exit(f"Erro: config nao encontrado em '{args.config}'.")
    except json.JSONDecodeError as erro:
        sys.exit(f"Erro: config invalido ({erro}).")

    raiz = Path(args.raiz)
    padroes = [(tipo, re.compile(rx)) for tipo, rx in config["padroes"].items()]

    diff = git(raiz, "diff", "--cached", "--unified=0", "--no-color")
    arquivos = [
        a
        for a in git(
            raiz, "diff", "--cached", "--name-only", "--diff-filter=ACM"
        ).splitlines()
        if a
    ]

    achados_segredo = varrer_segredos(diff, padroes)
    arquivos_sensiveis = varrer_arquivos(
        arquivos,
        config.get("arquivos_sensiveis", []),
        config.get("arquivos_permitidos", []),
    )

    bloqueado = avaliar_bloqueio(achados_segredo, arquivos_sensiveis)
    print(
        json.dumps(
            {
                "bloqueado": bloqueado,
                "achados_segredo": achados_segredo,
                "arquivos_sensiveis": arquivos_sensiveis,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    sys.exit(1 if bloqueado else 0)


# ================================================================================================
# AUTOTESTE — nucleo puro com fixtures, casca fim a fim contra repo git temporario.
# ================================================================================================

# Chave de EXEMPLO da propria documentacao da AWS (docs.aws.amazon.com) — nunca uma credencial real.
# Usada so para provar que o padrao "AWS Access Key" do config.json real dispara o bloqueio. Partida em
# duas por concatenacao de proposito: inteira, ela e um literal "AKIA[0-9A-Z]{16}" contiguo no PROPRIO
# codigo-fonte deste arquivo, e o scanner estatico de audit_base.py (skills/meta-verificacao-base) nao
# tem isencao para fixture de teste — reportaria esta linha como vazamento real. Em runtime a string
# concatenada e identica; o teste continua provando exatamente o mesmo padrao.
CHAVE_AWS_DE_EXEMPLO = "AKIA" + "IOSFODNN7EXAMPLE"


def _padroes_de_teste() -> list:
    return [
        (tipo, re.compile(rx))
        for tipo, rx in {"AWS Access Key": r"AKIA[0-9A-Z]{16}"}.items()
    ]


def _casos_nucleo() -> list:
    diff_limpo = "+++ b/src/config.ts\n+export const TIMEOUT = 5000;\n"
    diff_com_segredo = (
        f'+++ b/src/config.ts\n+const chave = "{CHAVE_AWS_DE_EXEMPLO}";\n'
    )
    padroes = _padroes_de_teste()
    return [
        {
            "nome": "varrer_segredos: diff limpo -> nenhum achado",
            "fn": lambda: varrer_segredos(diff_limpo, padroes) == [],
        },
        {
            "nome": "varrer_segredos: chave AWS de exemplo plantada -> achado mascarado",
            "fn": lambda: (
                len(achados := varrer_segredos(diff_com_segredo, padroes)) == 1
                and achados[0]["tipo"] == "AWS Access Key"
                and CHAVE_AWS_DE_EXEMPLO not in achados[0]["trecho_mascarado"]
            ),
        },
        {
            "nome": "varrer_arquivos: .env sem isenção -> achado",
            "fn": lambda: (
                varrer_arquivos([".env"], [".env", ".env.*"], [".env.example"])
                == [".env"]
            ),
        },
        {
            "nome": "varrer_arquivos: .env.example isento -> nenhum achado",
            "fn": lambda: (
                varrer_arquivos([".env.example"], [".env", ".env.*"], [".env.example"])
                == []
            ),
        },
        {
            "nome": "avaliar_bloqueio: nenhum achado -> nao bloqueia",
            "fn": lambda: avaliar_bloqueio([], []) is False,
        },
        {
            "nome": "avaliar_bloqueio: achado de segredo -> bloqueia",
            "fn": lambda: avaliar_bloqueio([{"tipo": "x"}], []) is True,
        },
        {
            "nome": "avaliar_bloqueio: arquivo sensivel -> bloqueia",
            "fn": lambda: avaliar_bloqueio([], [".env"]) is True,
        },
    ]


def _rodar_verificador(raiz: Path, config: Path = None) -> tuple:
    """CASCA: invoca o PROPRIO verificar_commit.py como subprocesso contra `raiz` — a unica forma de
    provar bloqueado/exit-code fim a fim, ja que ler o staged (`git diff --cached`) nao e puro. `raiz`
    e um repo git real, montado e destruido pelo chamador; nunca o repositorio desta base."""
    args = [sys.executable, str(Path(__file__)), "--raiz", str(raiz)]
    if config is not None:
        args += ["--config", str(config)]
    r = subprocess.run(
        args, capture_output=True, text=True, encoding="utf-8", errors="ignore"
    )
    return r.returncode, r.stdout, r.stderr


def _casos_casca() -> list:
    """Cada caso monta o estado staged que precisa, roda o script real, e o `with` apaga o repo
    temporario ao sair — nunca planta nada no repositorio de verdade desta base."""
    casos = []
    with tempfile.TemporaryDirectory() as tmp:
        raiz = Path(tmp)
        subprocess.run(["git", "init", "-q"], cwd=raiz, check=True)

        (raiz / "app.ts").write_text("export const TIMEOUT = 5000;\n", encoding="utf-8")
        subprocess.run(["git", "add", "app.ts"], cwd=raiz, check=True)
        codigo, _, _ = _rodar_verificador(raiz)
        casos.append(
            {"nome": "fim a fim: staged sem segredo -> exit 0", "ok": codigo == 0}
        )

        (raiz / "app.ts").write_text(
            f'const chave = "{CHAVE_AWS_DE_EXEMPLO}";\n', encoding="utf-8"
        )
        subprocess.run(["git", "add", "app.ts"], cwd=raiz, check=True)
        codigo, saida, _ = _rodar_verificador(raiz)
        casos.append(
            {
                "nome": "fim a fim: staged COM segredo plantado -> exit 1, mascarado na saida",
                "ok": codigo == 1 and CHAVE_AWS_DE_EXEMPLO not in saida,
            }
        )

        codigo, _, _ = _rodar_verificador(raiz, config=raiz / "config-inexistente.json")
        casos.append(
            {
                "nome": "fim a fim: config ausente -> erro, nunca exit 0",
                "ok": codigo != 0,
            }
        )

        config_invalido = raiz / "config-invalido.json"
        config_invalido.write_text("{ isto nao e json valido", encoding="utf-8")
        codigo, _, _ = _rodar_verificador(raiz, config=config_invalido)
        casos.append(
            {
                "nome": "fim a fim: config invalido -> erro, nunca exit 0",
                "ok": codigo != 0,
            }
        )
    return casos


def rodar_autoteste() -> int:
    falhas = 0
    for caso in _casos_nucleo():
        ok = bool(caso["fn"]())
        print(f"  {'ok   ' if ok else 'FALHA'} {caso['nome']}")
        if not ok:
            falhas += 1
    for caso in _casos_casca():
        print(f"  {'ok   ' if caso['ok'] else 'FALHA'} {caso['nome']}")
        if not caso["ok"]:
            falhas += 1

    total = len(_casos_nucleo()) + len(_casos_casca())
    print(f"\nautoteste (verificar_commit): {total - falhas}/{total} ok")
    return 0 if falhas == 0 else 1


if __name__ == "__main__":
    main()
