#!/usr/bin/env python3
"""prova-desligamento.py — prova, com PROCESSO REAL, o desligamento gracioso do processo composto.

    python prova-desligamento.py --cwd DIR --porta N --url URL --caminho PATH --cenario drena|estoura         --teto-ms N --boot-ms N -- <comando> [args...]

Existe em Python (e nao em Node) por UMA razao: no Windows o unico sinal gracioso que alcanca um
processo e o CTRL_BREAK do console, e so da para envia-lo a um processo criado com
`CREATE_NEW_PROCESS_GROUP` — o `subprocess.Popen` expoe a flag; o `spawn` do Node so a da junto com
`DETACHED_PROCESS`, que tira o console e torna o CTRL_BREAK inalcancavel. Nos demais sistemas o sinal
e o SIGTERM, o mesmo do `docker stop`.

`--caminho` e uma rota LENTA (o `zz-lento` que o autoteste do template instala so para esta prova): a
requisicao em voo e uma requisicao de verdade que ainda nao terminou quando o sinal chega.

CENARIOS:
  drena    a requisicao lenta termina ANTES do teto: envia o sinal com ela em voo, CONFERE que o
           processo continua vivo (esta drenando), le a resposta 200 e exige saida 0 + o log
           estruturado resultado=drained.
  estoura  a requisicao lenta dura MAIS que o teto: exige saida != 0 + o log resultado=timeout,
           dentro do teto + margem.

Saida: uma linha JSON `{cenario, ok, motivo, codigo, decorrido_ms}`; exit 0 se ok, 1 se nao.
"""

from __future__ import annotations

import argparse
import json
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from typing import Any

# Sondagem do health e leitura da resposta: passos curtos, sem peso na decisao.
PASSO_S = 0.1
LEITURA_S = 5.0


def _sinal_gracioso() -> int:
    """O sinal que o sistema entrega de verdade a um processo: CTRL_BREAK no Windows, SIGTERM nos demais."""
    return signal.CTRL_BREAK_EVENT if sys.platform == "win32" else signal.SIGTERM  # type: ignore[attr-defined,no-any-return]


def _subir(comando: list[str], cwd: str) -> subprocess.Popen[bytes]:
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0  # type: ignore[attr-defined]
    return subprocess.Popen(  # noqa: S603
        comando,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        creationflags=flags,
    )


def _health_200(url: str) -> bool:
    """Uma sonda: `True` so se o health respondeu 200 (qualquer falha de rede = ainda nao subiu)."""
    try:
        with urllib.request.urlopen(url, timeout=1) as resposta:  # noqa: S310
            return bool(resposta.status == 200)
    except OSError:
        return False


def _esperar_health(url: str, filho: subprocess.Popen[bytes], boot_s: float) -> str | None:
    """`None` se o health respondeu 200; senao o motivo."""
    limite = time.monotonic() + boot_s
    while time.monotonic() < limite:
        if filho.poll() is not None:
            return f"o processo saiu (codigo {filho.returncode}) antes do health responder"
        if _health_200(url):
            return None
        time.sleep(PASSO_S)
    return f"health nao respondeu 200 em {boot_s:.0f} s"


def _abrir_requisicao_em_voo(porta: int, caminho: str) -> socket.socket:
    """GET na rota lenta, enviado por inteiro; a resposta so sai depois do atraso da rota."""
    sock = socket.create_connection(("127.0.0.1", porta), timeout=LEITURA_S)
    linhas = [f"GET {caminho} HTTP/1.1", "Host: 127.0.0.1", "Connection: close", "", ""]
    pedido = "\r\n".join(linhas).encode()
    sock.sendall(pedido)
    return sock


def _saida_do_processo(filho: subprocess.Popen[bytes]) -> str:
    try:
        resto, _ = filho.communicate(timeout=2)
    except subprocess.TimeoutExpired:
        return ""
    return resto.decode("utf-8", "replace") if resto else ""


def _esperar_saida(filho: subprocess.Popen[bytes], ate_s: float) -> int | None:
    try:
        return filho.wait(timeout=ate_s)
    except subprocess.TimeoutExpired:
        return None


def _cenario_drena(
    filho: subprocess.Popen[bytes], porta: int, caminho: str, teto_s: float
) -> tuple[bool, str, int | None]:
    sock = _abrir_requisicao_em_voo(porta, caminho)
    try:
        time.sleep(0.3)  # a requisicao precisa ESTAR em voo quando o sinal chega
        filho.send_signal(_sinal_gracioso())
        time.sleep(0.3)
        if filho.poll() is not None:
            return (
                False,
                "o processo saiu COM uma requisicao em voo (nao drenou)",
                filho.returncode,
            )
        resposta = sock.recv(64)
        if not resposta.startswith(b"HTTP/1.1 200"):
            return (
                False,
                f"a requisicao em voo nao terminou com 200: {resposta[:40]!r}",
                None,
            )
    finally:
        sock.close()
    codigo = _esperar_saida(filho, teto_s)
    if codigo is None:
        return False, "nao saiu dentro do teto depois de drenar", None
    return (
        codigo == 0,
        "drenou e saiu 0" if codigo == 0 else f"saiu {codigo} depois de drenar",
        codigo,
    )


def _cenario_estoura(
    filho: subprocess.Popen[bytes], porta: int, caminho: str, teto_s: float
) -> tuple[bool, str, int | None]:
    sock = _abrir_requisicao_em_voo(porta, caminho)
    try:
        time.sleep(0.3)
        filho.send_signal(_sinal_gracioso())
        codigo = _esperar_saida(filho, teto_s)
    finally:
        sock.close()
    if codigo is None:
        return False, "nao saiu: o teto de drenagem nao foi aplicado", None
    if codigo == 0:
        return (
            False,
            "saiu 0 com a requisicao em voo ainda aberta (deveria estourar o teto)",
            codigo,
        )
    return True, f"estourou o teto e saiu {codigo}", codigo


CENARIOS = {"drena": _cenario_drena, "estoura": _cenario_estoura}


def _ler_argumentos(argv: list[str]) -> tuple[argparse.Namespace, list[str]]:
    corte = argv.index("--") if "--" in argv else len(argv)
    pai = argparse.ArgumentParser(description=__doc__)
    pai.add_argument("--cwd", required=True)
    pai.add_argument("--porta", type=int, required=True)
    pai.add_argument("--url", required=True)
    pai.add_argument("--caminho", required=True, help="rota lenta (com ?ms=N)")
    pai.add_argument("--cenario", choices=sorted(CENARIOS), required=True)
    pai.add_argument(
        "--teto-ms",
        type=int,
        required=True,
        help="o drainTimeoutMs do config/runtime.json",
    )
    pai.add_argument(
        "--boot-ms",
        type=int,
        required=True,
        help="quanto esperar o health antes do cenario",
    )
    return pai.parse_args(argv[:corte]), argv[corte + 1 :]


def _executar(args: argparse.Namespace, comando: list[str]) -> tuple[bool, str, int | None, int, str]:
    """Sobe, espera o health, roda o cenario. Devolve (ok, motivo, codigo, decorrido_ms, saida)."""
    filho = _subir(comando, args.cwd)
    inicio = time.monotonic()
    ok, motivo, codigo = False, "", None
    try:
        falha_de_boot = _esperar_health(args.url, filho, args.boot_ms / 1000)
        if falha_de_boot is not None:
            motivo = falha_de_boot
        else:
            inicio = time.monotonic()
            # margem: o teto + uma folga para o processo logar e sair depois de estourar.
            teto_s = args.teto_ms / 1000 + 5
            ok, motivo, codigo = CENARIOS[args.cenario](filho, args.porta, args.caminho, teto_s)
    finally:
        if filho.poll() is None:
            filho.kill()
        saida = _saida_do_processo(filho)
    return ok, motivo, codigo, int((time.monotonic() - inicio) * 1000), saida


# O log estruturado que cada cenario TEM de ter emitido (o JSON do Node nao tem espaco, o do Python tem).
LOG_ESPERADO = {"drena": "drained", "estoura": "timeout"}


def main(argv: list[str]) -> int:
    args, comando = _ler_argumentos(argv)
    if not comando:
        sys.stderr.write("faltou o comando depois de '--'\n")
        return 2
    ok, motivo, codigo, decorrido_ms, saida = _executar(args, comando)
    esperado = LOG_ESPERADO[args.cenario]
    if ok and not re.search(r'"resultado":\s*"' + esperado + '"', saida):
        ok, motivo = False, f"saiu como esperado, mas sem o log estruturado resultado={esperado}"
    relatorio: dict[str, Any] = {
        "cenario": args.cenario,
        "ok": ok,
        "motivo": motivo,
        "codigo": codigo,
        "decorrido_ms": decorrido_ms,
    }
    sys.stdout.write(json.dumps(relatorio) + "\n")
    if not ok:
        ultimas = [linha for linha in saida.splitlines() if linha.strip()][-15:]
        sys.stdout.write("ultimas linhas do processo:\n" + "\n".join(f"  | {linha}" for linha in ultimas) + "\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
