"""
check_headers.py — DAST leve: checa headers de segurança e paths sensíveis exposed de uma URL.

⚠️ SOMENTE no PRÓPRIO app (staging/local) ou alvo AUTORIZADO — nunca contra terceiros.

Uso:
    python check_headers.py --url https://meu-app.local [--config config.json]

Retorno:
    JSON {url, status, headers_present, headers_missing, paths_exposed}.

Regras (padrao-escrita): zero hardcoded (headers/paths no config.json),
responsabilidade única (apenas observa — a correção é decisão com HITL na skill).
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import urljoin


def load_config(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def fetch(url, timeout):
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
    parser = argparse.ArgumentParser(description="Lightweight DAST of headers/paths (own/authorized target).")
    parser.add_argument("--url", required=True, help="URL of your OWN app/authorized target")
    parser.add_argument("--config", default=str(__import__("pathlib").Path(__file__).parent / "config.json"))
    args = parser.parse_args()

    try:
        config = load_config(args.config)
    except FileNotFoundError:
        sys.exit(f"Error: config not found at '{args.config}'.")
    except json.JSONDecodeError as error:
        sys.exit(f"Error: invalid config ({error}).")

    timeout = config.get("timeout_s", 10)
    status, headers = fetch(args.url, timeout)
    if status is None:
        print(json.dumps({"url": args.url, "status": None, "error": "url unreachable"}, ensure_ascii=False, indent=2))
        return

    expected = [h.lower() for h in config.get("security_headers", [])]
    present = {h: headers[h] for h in expected if h in headers}
    missing = [h for h in expected if h not in headers]

    exposed = []
    for path in config.get("sensitive_paths", []):
        code, _ = fetch(urljoin(args.url, path), timeout)
        if code == 200:
            exposed.append(path)

    print(json.dumps({
        "url": args.url,
        "status": status,
        "headers_present": present,
        "headers_missing": missing,
        "paths_exposed": exposed,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
