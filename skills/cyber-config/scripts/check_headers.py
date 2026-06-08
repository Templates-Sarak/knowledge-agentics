"""
check_headers.py — DAST leve: checa headers de segurança e paths sensíveis expostos de uma URL.

⚠️ SOMENTE no PRÓPRIO app (staging/local) ou alvo AUTORIZADO — nunca contra terceiros.

Uso:
    python check_headers.py --url https://meu-app.local [--config config.json]

Retorno:
    JSON {url, status, headers_presentes, headers_faltando, paths_expostos}.

Regras (CLAUDE.md): zero hardcoded (headers/paths no config.json),
responsabilidade única (apenas observa — a correção é decisão com HITL na skill).
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import urljoin


def carregar_config(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def requisitar(url, timeout):
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "sarak-cyber-config"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}
    except (urllib.error.URLError, OSError, ValueError):
        return None, {}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="DAST leve de headers/paths (alvo proprio/autorizado).")
    parser.add_argument("--url", required=True, help="URL do PROPRIO app/alvo autorizado")
    parser.add_argument("--config", default=str(__import__("pathlib").Path(__file__).parent / "config.json"))
    args = parser.parse_args()

    try:
        config = carregar_config(args.config)
    except FileNotFoundError:
        sys.exit(f"Erro: config nao encontrado em '{args.config}'.")
    except json.JSONDecodeError as erro:
        sys.exit(f"Erro: config invalido ({erro}).")

    timeout = config.get("timeout_s", 10)
    status, headers = requisitar(args.url, timeout)
    if status is None:
        print(json.dumps({"url": args.url, "status": None, "erro": "url inacessivel"}, ensure_ascii=False, indent=2))
        return

    esperados = [h.lower() for h in config.get("headers_seguranca", [])]
    presentes = {h: headers[h] for h in esperados if h in headers}
    faltando = [h for h in esperados if h not in headers]

    expostos = []
    for path in config.get("paths_sensiveis", []):
        code, _ = requisitar(urljoin(args.url, path), timeout)
        if code == 200:
            expostos.append(path)

    print(json.dumps({
        "url": args.url,
        "status": status,
        "headers_presentes": presentes,
        "headers_faltando": faltando,
        "paths_expostos": expostos,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
