#!/usr/bin/env python3
"""shutdown-proof.py — prova, com PROCESSO REAL, o desligamento gracioso do processo composto.

    python shutdown-proof.py --cwd DIR --port N --url URL --path PATH --scenario drain|overflow --timeout-ms N --boot-ms N -- <command> [args...]

Existe em Python (e nao em Node) por UMA razao: no Windows o unico sinal gracioso que alcanca um
processo e o CTRL_BREAK do console, e so da para envia-lo a um processo criado com
`CREATE_NEW_PROCESS_GROUP` — o `subprocess.Popen` expoe a flag; o `spawn` do Node so a da junto com
`DETACHED_PROCESS`, que tira o console e torna o CTRL_BREAK inalcancavel. Nos demais sistemas o sinal
e o SIGTERM, o mesmo do `docker stop`.

`--path` e uma rota LENTA (o `zz-slow` que o autoteste do template instala so para esta prova): a
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
STEP_S = 0.1
READ_S = 5.0


def _graceful_signal() -> int:
    """O sinal que o sistema entrega de verdade a um processo: CTRL_BREAK no Windows, SIGTERM nos demais."""
    return signal.CTRL_BREAK_EVENT if sys.platform == "win32" else signal.SIGTERM  # type: ignore[attr-defined,no-any-return]


def _start(command: list[str], cwd: str) -> subprocess.Popen[bytes]:
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0  # type: ignore[attr-defined]
    return subprocess.Popen(  # noqa: S603
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        creationflags=flags,
    )


def _health_200(url: str) -> bool:
    """Uma sonda: `True` so se o health respondeu 200 (qualquer falha de rede = ainda nao subiu)."""
    try:
        with urllib.request.urlopen(url, timeout=1) as response:  # noqa: S310
            return bool(response.status == 200)
    except OSError:
        return False


def _wait_health(url: str, child: subprocess.Popen[bytes], boot_s: float) -> str | None:
    """`None` se o health respondeu 200; senao o motivo."""
    limit = time.monotonic() + boot_s
    while time.monotonic() < limit:
        if child.poll() is not None:
            return f"process exited (code {child.returncode}) before the health check responded"
        if _health_200(url):
            return None
        time.sleep(STEP_S)
    return f"health check did not return 200 within {boot_s:.0f} s"


def _open_inflight_request(port: int, path: str) -> socket.socket:
    """GET na rota lenta, enviado por inteiro; a resposta so sai depois do atraso da rota."""
    sock = socket.create_connection(("127.0.0.1", port), timeout=READ_S)
    lines = [f"GET {path} HTTP/1.1", "Host: 127.0.0.1", "Connection: close", "", ""]
    request = "\r\n".join(lines).encode()
    sock.sendall(request)
    return sock


def _process_output(child: subprocess.Popen[bytes]) -> str:
    try:
        rest, _ = child.communicate(timeout=2)
    except subprocess.TimeoutExpired:
        return ""
    return rest.decode("utf-8", "replace") if rest else ""


def _wait_exit(child: subprocess.Popen[bytes], until_s: float) -> int | None:
    try:
        return child.wait(timeout=until_s)
    except subprocess.TimeoutExpired:
        return None


def _scenario_drain(
    child: subprocess.Popen[bytes], port: int, path: str, cap_s: float
) -> tuple[bool, str, int | None]:
    sock = _open_inflight_request(port, path)
    try:
        time.sleep(0.3)  # a requisicao precisa ESTAR em voo quando o sinal chega
        child.send_signal(_graceful_signal())
        time.sleep(0.3)
        if child.poll() is not None:
            return (
                False,
                "process exited while a request was in flight (not drained)",
                child.returncode,
            )
        response = sock.recv(64)
        if not response.startswith(b"HTTP/1.1 200"):
            return (
                False,
                f"in-flight request did not finish with 200: {response[:40]!r}",
                None,
            )
    finally:
        sock.close()
    code = _wait_exit(child, cap_s)
    if code is None:
        return False, "process did not exit within the timeout after draining", None
    return (
        code == 0,
        "drained and exited with code 0" if code == 0 else f"exited with code {code} after draining",
        code,
    )


def _scenario_overflow(
    child: subprocess.Popen[bytes], port: int, path: str, cap_s: float
) -> tuple[bool, str, int | None]:
    sock = _open_inflight_request(port, path)
    try:
        time.sleep(0.3)
        child.send_signal(_graceful_signal())
        code = _wait_exit(child, cap_s)
    finally:
        sock.close()
    if code is None:
        return False, "process did not exit: the drain timeout was not applied", None
    if code == 0:
        return (
            False,
            "exited with code 0 while the request was still in flight (expected a timeout)",
            code,
        )
    return True, f"timed out and exited with code {code}", code


SCENARIOS = {"drain": _scenario_drain, "overflow": _scenario_overflow}


def _read_arguments(argv: list[str]) -> tuple[argparse.Namespace, list[str]]:
    cut = argv.index("--") if "--" in argv else len(argv)
    parser = argparse.ArgumentParser(description='Prove graceful shutdown behavior with a live process.')
    parser.add_argument("--cwd", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--path", required=True, help="slow route (with ?ms=N)")
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), required=True)
    parser.add_argument(
        "--timeout-ms",
        dest="timeout_ms",
        type=int,
        required=True,
        help="drainTimeoutMs from config/runtime.json",
    )
    parser.add_argument(
        "--boot-ms",
        dest="boot_ms",
        type=int,
        required=True,
        help="time to wait for health before the scenario",
    )
    return parser.parse_args(argv[:cut]), argv[cut + 1 :]


def _run(args: argparse.Namespace, command: list[str]) -> tuple[bool, str, int | None, int, str]:
    """Sobe, espera o health, roda o cenario. Devolve (ok, motivo, codigo, decorrido_ms, saida)."""
    child = _start(command, args.cwd)
    start = time.monotonic()
    ok, reason, code = False, "", None
    try:
        boot_failure = _wait_health(args.url, child, args.boot_ms / 1000)
        if boot_failure is not None:
            reason = boot_failure
        else:
            start = time.monotonic()
            # margem: o teto + uma folga para o processo logar e sair depois de estourar.
            cap_s = args.timeout_ms / 1000 + 5
            ok, reason, code = SCENARIOS[args.scenario](child, args.port, args.path, cap_s)
    finally:
        if child.poll() is None:
            child.kill()
        output = _process_output(child)
    return ok, reason, code, int((time.monotonic() - start) * 1000), output


# O log estruturado que cada cenario TEM de ter emitido (o JSON do Node nao tem espaco, o do Python tem).
EXPECTED_LOG = {"drain": "drained", "overflow": "timeout"}


def main(argv: list[str]) -> int:
    args, command = _read_arguments(argv)
    if not command:
        sys.stderr.write("Missing command after '--'\n")
        return 2
    ok, reason, code, elapsed_ms, output = _run(args, command)
    expected = EXPECTED_LOG[args.scenario]
    if ok and not re.search(r'"resultado":\s*"' + expected + '"', output):
        ok, reason = False, f"exited as expected, but the structured log is missing resultado={expected}"
    report: dict[str, Any] = {
        "scenario": args.scenario,
        "ok": ok,
        "reason": reason,
        "exitCode": code,
        "elapsedMs": elapsed_ms,
    }
    sys.stdout.write(json.dumps(report) + "\n")
    if not ok:
        last_lines = [line for line in output.splitlines() if line.strip()][-15:]
        sys.stdout.write("Last process lines:\n" + "\n".join(f"  | {line}" for line in last_lines) + "\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
