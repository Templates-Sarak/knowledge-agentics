"""gerar_config.py — deriva `config.json` (o gate de commit) do catalogo CANONICO de
skills/cyber-segredos/scripts/config.json. `config.json` NUNCA e editado a mao — e GERADO, no
precedente de `ferramentas/gerar-config-lint.mjs` do template de modulos: uma fonte so, e um
`--conferir` que reprova a divergencia em vez de deixa-la se acumular (a G.2 outra vez, se fosse a
mao).

    python gerar_config.py               escreve config.json a partir do catalogo canonico
    python gerar_config.py --conferir    nao escreve; sai 1 se o disco divergir do que seria gerado

Por que so TRES campos do canonico (`padroes`, `arquivos_sensiveis`, `arquivos_permitidos`): e tudo
que `verificar_commit.py` le. `extensoes_texto`/`ignorar_dirs`/`tamanho_max_arquivo_bytes` sao do
`scan_segredos.py` (varredura de ARQUIVOS em disco); `entropia_*`/`token_min_len` sao heuristica que a
lei 1 deste catalogo nao aceita para o gate do commit (04-regras.md §7.2 e o cabecalho de
`ferramentas/ci-seguranca.mjs` documentam a mesma recusa). Copiar campo que ninguem le seria peso
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


def main() -> int:
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
