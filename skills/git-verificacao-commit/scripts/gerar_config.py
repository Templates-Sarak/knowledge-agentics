"""gerar_config.py — deriva `config.json` (o gate de commit) do catalogo CANONICO de
skills/cyber-segredos/scripts/config.json. `config.json` NUNCA e editado a mao — e GERADO, no
precedente de `tools/generate-lint-config.mjs` do template de modulos: uma fonte so, e um
`--conferir` que reprova a divergencia em vez de deixa-la se acumular a mao.

    python gerar_config.py               escreve config.json a partir do catalogo canonico
    python gerar_config.py --conferir    nao escreve; sai 1 se o disco divergir do que seria gerado
    python gerar_config.py --autoteste   nao toca disco; prova CANONICO e a extracao dos tres campos

Por que so TRES campos do canonico (`padroes`, `arquivos_sensiveis`, `arquivos_permitidos`): e tudo
que `verificar_commit.py` le. `extensoes_texto`/`ignorar_dirs`/`tamanho_max_arquivo_bytes` sao do
`scan_segredos.py` (varredura de ARQUIVOS em disco); `entropia_*`/`token_min_len` sao heuristica que a
lei 1 deste catalogo nao aceita para o gate do commit (04-regras.md §7.2 e o cabecalho de
`tools/ci-security.mjs` documentam a mesma recusa). Copiar campo que ninguem le seria peso
morto, nao sincronia.
"""

import json
import sys
from pathlib import Path

AQUI = Path(__file__).parent
CANONICO = AQUI.parent.parent / "cyber-segredos" / "scripts" / "config.json"
DESTINO = AQUI / "config.json"

CAMPOS_DERIVADOS = ("padroes", "arquivos_sensiveis", "arquivos_permitidos")

FONTE = (
    "GERADO por gerar_config.py a partir do catalogo canonico de cyber-segredos "
    "(skills/cyber-segredos/scripts/config.json) — nao edite este arquivo a mao; rode "
    "'python gerar_config.py' depois de mudar o canonico."
)


def gerar(canonico: dict) -> dict:
    """PURA: monta o config.json derivado a partir do canonico ja carregado — nao toca disco."""
    derivado = {"_fonte": FONTE}
    for campo in CAMPOS_DERIVADOS:
        derivado[campo] = canonico[campo]
    return derivado


def texto_gerado(canonico: dict) -> str:
    return json.dumps(gerar(canonico), ensure_ascii=False, indent=2) + "\n"


def autoteste() -> int:
    """Nao toca disco. Prova que `CANONICO` resolve para um arquivo que existe de verdade — um
    caminho citado em prosa e nunca conferido contra o disco escaparia daqui —, e que `gerar`
    extrai só os TRES campos declarados, nunca o catalogo inteiro."""
    falhas = []
    if not CANONICO.exists():
        falhas.append(f"CANONICO nao existe em disco: {CANONICO}")
    else:
        canonico = json.loads(CANONICO.read_text(encoding="utf-8"))
        for campo in CAMPOS_DERIVADOS:
            if campo not in canonico:
                falhas.append(f"catalogo canonico nao tem o campo declarado: {campo}")
        fixture = {**{c: [] for c in CAMPOS_DERIVADOS}, "entropia_min_bits": 99}
        derivado = gerar(fixture)
        if "entropia_min_bits" in derivado:
            falhas.append("gerar() vazou campo fora de CAMPOS_DERIVADOS")
        if set(derivado) != {"_fonte", *CAMPOS_DERIVADOS}:
            falhas.append(f"gerar() devolveu chaves inesperadas: {sorted(derivado)}")
        json.loads(texto_gerado(fixture))  # ValueError se nao for JSON valido

    for falha in falhas:
        print(f"  falha  {falha}")
    if falhas:
        print(f"autoteste (gerar_config): {len(falhas)} falha(s)")
        return 1
    print("autoteste (gerar_config): 3/3 ok")
    return 0


def main() -> int:
    if "--autoteste" in sys.argv[1:]:
        return autoteste()
    conferir = "--conferir" in sys.argv[1:]
    try:
        canonico = json.loads(CANONICO.read_text(encoding="utf-8"))
    except FileNotFoundError:
        sys.stderr.write(f"Erro: catalogo canonico nao encontrado em '{CANONICO}'.\n")
        return 1

    texto = texto_gerado(canonico)

    if conferir:
        atual = DESTINO.read_text(encoding="utf-8") if DESTINO.exists() else None
        if atual != texto:
            sys.stderr.write(
                f"config.json diverge do catalogo canonico — rode 'python {Path(__file__).name}'\n"
            )
            return 1
        print(f"{DESTINO.name}: em dia com o catalogo canonico.")
        return 0

    DESTINO.write_text(texto, encoding="utf-8")
    print(f"[OK] {DESTINO} gerado a partir do catalogo canonico.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
