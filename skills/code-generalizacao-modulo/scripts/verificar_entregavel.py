"""verificar_entregavel.py — roda os SEIS degraus de verificacao do modulo generico e da o veredito.

    python verificar_entregavel.py --repo <repo> --modulo <id> --denylist <arquivo-fora-do-repo> [--json]
    python verificar_entregavel.py --autoteste

Os seis degraus, cada um afirmando uma coisa DIFERENTE (a tabela vive no SKILL.md):

    1 conforme            node tools/gate/validate.mjs modules/<id>
    2 extraivel           node tools/gate/validate.mjs --extraction modules/<id>
    3 funciona sem infra  o comando `verificar` do binding (tipos + testes com adapters/memory)
    4 o schema funciona   migration up + rollback em banco efemero (Docker)
    5 cumpre o contrato   boot no compose efemero + /health, /meta e /resumo contra o openapi.yaml
    6 e generico          verificar_neutralidade.py com a denylist da origem

**A regra que este script existe para impedir:** degrau NAO EXECUTADO nunca vira verde. Gate verde
prova conformidade ESTATICA — o gate le arquivo e nunca roda o modulo, por contrato. Confundir as duas
coisas ja fez, num sistema real, um comando de extracao "passar" sem nunca ter rodado um teste sequer.
Aqui, ausencia de comando declarado, Docker fora do ar ou compose faltando REPROVAM, com a razao dita.

**Por que a denylist mora FORA do repositorio verificado.** Ela lista os termos da origem — e um
arquivo com os termos da origem, versionado dentro do entregavel, E o vazamento que o degrau 6 existe
para pegar. O script recusa uma denylist que esteja sob `--repo`, antes de varrer qualquer coisa.

**Os comandos dos degraus 4 e 5 sao declarados, nao adivinhados** — em `config/verificacao.json` do
repositorio verificado (molde em `references/templates.md`). Zero hardcoded de infraestrutura: o
script nao inventa nome de compose nem de script npm; sem a declaracao, o degrau reprova por falta.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

OK, FALHOU, NAO_EXECUTADO = "ok", "falhou", "nao_executado"
CONFIG_VERIFICACAO = "config/verificacao.json"

# ==================================================================================================
# NUCLEO — puro. Nada daqui ate a marca "CASCA" toca disco, rede ou processo.
# ==================================================================================================


def decidir_veredito(degraus: list[dict]) -> tuple[int, str]:
    """Exit code + frase. `nao_executado` REPROVA junto com `falhou` — nunca e reportado como verde."""
    vermelhos = [d for d in degraus if d["estado"] == FALHOU]
    ausentes = [d for d in degraus if d["estado"] == NAO_EXECUTADO]
    if vermelhos or ausentes:
        partes = []
        if vermelhos:
            partes.append(
                f"{len(vermelhos)} degrau(s) vermelho(s): {', '.join(str(d['n']) for d in vermelhos)}"
            )
        if ausentes:
            partes.append(
                f"{len(ausentes)} nao executado(s): {', '.join(str(d['n']) for d in ausentes)}"
            )
        return 1, "REPROVADO — " + "; ".join(partes)
    return 0, f"APROVADO — os {len(degraus)} degraus verdes"


def montar_relatorio(degraus: list[dict]) -> str:
    """Tabela legivel dos degraus, na ordem, com o motivo de cada um que nao ficou verde."""
    simbolo = {OK: "verde", FALHOU: "VERMELHO", NAO_EXECUTADO: "NAO EXECUTADO"}
    linhas = [
        f"  {d['n']}. {d['nome']:<28} {simbolo[d['estado']]}"
        + (f"  <- {d['motivo']}" if d.get("motivo") else "")
        for d in degraus
    ]
    return "\n".join(linhas)


def comando_do_binding(tem_package_json: bool, tem_verify_py: bool) -> list[str] | None:
    """Comando `verificar` do binding do repositorio, ou None se nenhum dos dois manifestos existir."""
    if tem_package_json:
        return ["npm", "run", "verify"]
    if tem_verify_py:
        return [sys.executable, "verify.py"]
    return None


def denylist_dentro_do_repo(caminho_denylist: Path, repo: Path) -> bool:
    """True quando a denylist esta sob o repositorio verificado — a origem vazando para o entregavel."""
    try:
        caminho_denylist.resolve().relative_to(repo.resolve())
        return True
    except ValueError:
        return False


# ==================================================================================================
# CASCA — daqui para baixo roda processo e le disco.
# ==================================================================================================


def _rodar(comando: list[str], cwd: Path) -> tuple[bool, str]:
    """Executa e devolve (sucesso, ultima linha util da saida). Binario ausente nao explode: reprova."""
    executavel = shutil.which(comando[0]) or comando[0]
    try:
        proc = subprocess.run(
            [executavel, *comando[1:]],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=1800,
        )
    except (OSError, subprocess.SubprocessError) as erro:
        return False, f"nao foi possivel executar {comando[0]}: {erro}"
    saida = (proc.stdout + proc.stderr).strip().splitlines()
    return proc.returncode == 0, (saida[-1][:160] if saida else "")


def _degrau(n: int, nome: str, estado: str, motivo: str = "") -> dict:
    return {"n": n, "nome": nome, "estado": estado, "motivo": motivo}


def _degrau_de_comando(n: int, nome: str, comando: list[str], repo: Path) -> dict:
    sucesso, saida = _rodar(comando, repo)
    return _degrau(n, nome, OK if sucesso else FALHOU, "" if sucesso else saida)


def degraus_do_gate(repo: Path, modulo: str) -> list[dict]:
    """Degraus 1 e 2 — conformidade e extraibilidade, os dois estaticos."""
    validate = "tools/gate/validate.mjs"
    alvo = f"modules/{modulo}"
    return [
        _degrau_de_comando(1, "conforme", ["node", validate, alvo], repo),
        _degrau_de_comando(
            2, "extraivel", ["node", validate, "--extraction", alvo], repo
        ),
    ]


def degrau_sem_infra(repo: Path) -> dict:
    """Degrau 3 — tipos e testes com adapters de memoria, sem rede e sem banco."""
    comando = comando_do_binding(
        (repo / "package.json").is_file(), (repo / "verify.py").is_file()
    )
    if comando is None:
        return _degrau(
            3,
            "funciona sem infra",
            NAO_EXECUTADO,
            "sem package.json nem verify.py na raiz",
        )
    return _degrau_de_comando(3, "funciona sem infra", comando, repo)


def degraus_efemeros(repo: Path, config: dict | None) -> list[dict]:
    """Degraus 4 e 5 — schema e contrato, compartilhando UM ambiente efemero (sobe, roda, derruba)."""
    if config is None:
        motivo = f"{CONFIG_VERIFICACAO} ausente — declare compose, schema e contrato"
        return [
            _degrau(4, "o schema funciona", NAO_EXECUTADO, motivo),
            _degrau(5, "cumpre o contrato", NAO_EXECUTADO, motivo),
        ]
    if not shutil.which("docker"):
        return [
            _degrau(4, "o schema funciona", NAO_EXECUTADO, "docker ausente"),
            _degrau(5, "cumpre o contrato", NAO_EXECUTADO, "docker ausente"),
        ]

    compose = ["docker", "compose", "-f", config["compose"]]
    subiu, saida = _rodar([*compose, "up", "-d", "--wait"], repo)
    if not subiu:
        motivo = f"ambiente efemero nao subiu: {saida}"
        return [
            _degrau(4, "o schema funciona", FALHOU, motivo),
            _degrau(5, "cumpre o contrato", FALHOU, motivo),
        ]
    try:
        return [
            _degrau_de_comando(4, "o schema funciona", config["schema"], repo),
            _degrau_de_comando(5, "cumpre o contrato", config["contrato"], repo),
        ]
    finally:
        _rodar([*compose, "down", "-v"], repo)


def degrau_neutralidade(repo: Path, denylist: Path) -> dict:
    """Degrau 6 — delega ao verificar_neutralidade.py, que e quem sabe casar variante de escrita."""
    script = Path(__file__).with_name("verificar_neutralidade.py")
    comando = [
        sys.executable,
        str(script),
        "--raiz",
        str(repo),
        "--denylist",
        str(denylist),
    ]
    sucesso, saida = _rodar(comando, repo)
    return _degrau(6, "e generico", OK if sucesso else FALHOU, "" if sucesso else saida)


def carregar_config(repo: Path) -> dict | None:
    """`config/verificacao.json` do repo verificado. None se ausente ou incompleto — o degrau reprova."""
    caminho = repo / CONFIG_VERIFICACAO
    if not caminho.is_file():
        return None
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    if not all(chave in dados for chave in ("compose", "schema", "contrato")):
        return None
    return dados


def _casos_veredito() -> list[str]:
    """Casos do veredito — e aqui que mora a regra central: NAO EXECUTADO nunca e verde."""
    falhas = []
    verdes = [_degrau(n, f"d{n}", OK) for n in range(1, 7)]

    if decidir_veredito(verdes)[0] != 0:
        falhas.append("seis verdes deveriam aprovar")
    if decidir_veredito(verdes[:5] + [_degrau(6, "d6", FALHOU)])[0] != 1:
        falhas.append("degrau vermelho nao reprovou")

    codigo, frase = decidir_veredito(
        verdes[:5] + [_degrau(6, "d6", NAO_EXECUTADO, "docker ausente")]
    )
    if codigo != 1 or "nao executado" not in frase:
        falhas.append(
            f"NAO EXECUTADO virou verde — o fail-open que este script impede: {frase}"
        )

    if "NAO EXECUTADO" not in montar_relatorio(
        [_degrau(4, "x", NAO_EXECUTADO, "sem docker")]
    ):
        falhas.append("montar_relatorio escondeu um degrau nao executado")
    return falhas


def _casos_ambiente() -> list[str]:
    """Casos de ambiente — deteccao do binding e a denylist que nao pode morar dentro do repo."""
    falhas = []

    if (
        comando_do_binding(True, False) != ["npm", "run", "verify"]
        or comando_do_binding(False, False) is not None
    ):
        falhas.append("comando_do_binding errou a deteccao")

    repo = Path("/tmp/repo") if sys.platform != "win32" else Path("C:/repo")
    if not denylist_dentro_do_repo(repo / "config" / "deny.txt", repo):
        falhas.append(
            "denylist dentro do repo nao foi detectada — a origem vazaria no entregavel"
        )
    if denylist_dentro_do_repo(repo.parent / "deny.txt", repo):
        falhas.append("falso positivo: denylist fora do repo acusada como dentro")
    return falhas


def autoteste() -> int:
    """Prova o NUCLEO com fixtures em memoria, sem tocar disco nem subir container."""
    falhas = _casos_veredito() + _casos_ambiente()
    for falha in falhas:
        print(f"[FALHA] {falha}")
    print(
        f"[{'OK' if not falhas else 'ERRO'}] autoteste de verificar_entregavel: {len(falhas)} falha(s)"
    )
    return 1 if falhas else 0


def _parser() -> argparse.ArgumentParser:
    """CLI do script. Separada do `main` para manter as duas dentro do limiar de tamanho."""
    parser = argparse.ArgumentParser(
        description="Roda os seis degraus de verificacao do modulo generico."
    )
    parser.add_argument("--repo", help="Raiz do repositorio do modulo generico.")
    parser.add_argument("--modulo", help="Id do modulo (a pasta em modules/).")
    parser.add_argument(
        "--denylist",
        help="Arquivo com os termos da origem — FORA do repositorio verificado.",
    )
    parser.add_argument(
        "--json", action="store_true", help="Imprime o resultado como JSON."
    )
    parser.add_argument(
        "--autoteste",
        action="store_true",
        help="Prova o nucleo com fixtures em memoria.",
    )
    return parser


def _recusar_alvo(repo: Path, modulo: str, denylist: Path) -> str:
    """Motivo para recusar o alvo antes de rodar qualquer degrau, ou string vazia se ele serve."""
    if not (repo / "modules" / modulo).is_dir():
        return f"modules/{modulo} nao existe em {repo}."
    if denylist_dentro_do_repo(denylist, repo):
        return (
            "a denylist esta DENTRO do repositorio verificado — ela lista os termos da origem, "
            "e versiona-la ali e exatamente o vazamento que o degrau 6 procura."
        )
    return ""


def main() -> int:
    parser = _parser()
    args = parser.parse_args()

    if args.autoteste:
        return autoteste()
    if not (args.repo and args.modulo and args.denylist):
        parser.error(
            "--repo, --modulo e --denylist sao obrigatorios (ou use --autoteste)"
        )

    repo, denylist = Path(args.repo).resolve(), Path(args.denylist)
    recusa = _recusar_alvo(repo, args.modulo, denylist)
    if recusa:
        print(f"[ERRO] {recusa}", file=sys.stderr)
        return 2

    degraus = [
        *degraus_do_gate(repo, args.modulo),
        degrau_sem_infra(repo),
        *degraus_efemeros(repo, carregar_config(repo)),
        degrau_neutralidade(repo, denylist),
    ]
    codigo, veredito = decidir_veredito(degraus)

    if args.json:
        print(
            json.dumps(
                {"veredito": veredito, "codigo": codigo, "degraus": degraus},
                indent=2,
                ensure_ascii=False,
            )
        )
        return codigo

    print(f"\n--- Verificacao do entregavel: {args.modulo} ---")
    print(montar_relatorio(degraus))
    print(f"\n[{'OK' if codigo == 0 else 'ERRO'}] {veredito}")
    return codigo


if __name__ == "__main__":
    sys.exit(main())
