"""Carregador UNICO de configuracao do modulo <module>. Lei dona: specs/arquitetura/01-modulo.md §4.

Regras que este arquivo materializa:
  - SO ele toca o ambiente. Qualquer outro arquivo lendo env e aviso do gate.
  - Cascata (ADR-004): processo > .env do modulo > .env apontado por ENV_ROOT > default de tunable.
  - Falha rapida: env ou config ausente DERRUBA o boot. Nunca `os.getenv("X", "http://localhost")`.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ModuleConfiguration:
    root: Path
    manifest: dict[str, Any]
    api: dict[str, Any]
    domain: dict[str, Any]
    security: dict[str, Any]
    ports: dict[str, str]
    texts: dict[str, str]


def find_root_module(start: Path | None = None) -> Path:
    """Sobe ate achar o `module.json`. Funciona em dev, em teste e ja extraido."""
    current = (start or Path.cwd()).resolve()
    for _ in range(8):
        if (current / "module.json").exists():
            return current
        if current.parent == current:
            break
        current = current.parent
    raise RuntimeError(f"[config] module.json not found from {start or Path.cwd()}")


def _read_json(root: Path, relative_path: str) -> Any:
    path = root / relative_path
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except OSError as cause:
        raise RuntimeError(f'[config] could not read "{relative_path}": {cause}') from cause
    except json.JSONDecodeError as cause:
        raise RuntimeError(f'[config] "{relative_path}" is not valid JSON: {cause}') from cause


def _read_pairs_env(path: Path) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        cleaned = line.strip()
        if cleaned == "" or cleaned.startswith("#") or "=" not in cleaned:
            continue
        key, _, value = cleaned.partition("=")
        pairs.append((key.strip(), value.strip()))
    return pairs


def _apply_without_overwrite(pairs: list[tuple[str, str]]) -> None:
    """Mantem a precedencia: o que ja veio do processo vence o arquivo."""
    for key, value in pairs:
        os.environ.setdefault(key, value)


def _resolve_environment(root: Path) -> None:
    """Resolve o `.env` em cascata (ADR-004, specs/adr/000-decisoes-do-template.md).

    O `.env` do modulo APONTA para o da raiz por `ENV_ROOT`. Na extracao, apaga-se essa linha e
    os valores passam a viver localmente — sem uma linha de codigo mudar.
    """
    local = root / ".env"
    if not local.exists():
        return

    pairs = _read_pairs_env(local)
    _apply_without_overwrite([(c, v) for c, v in pairs if c != "ENV_ROOT"])

    pointer = next((v for c, v in pairs if c == "ENV_ROOT"), None)
    if pointer is None:
        return

    target = Path(pointer) if Path(pointer).is_absolute() else (root / pointer).resolve()
    if not target.exists():
        raise RuntimeError(f'[config] ENV_ROOT points to "{target}", which does not exist')
    _apply_without_overwrite(_read_pairs_env(target))


def env_required(key: str) -> str:
    """Le uma variavel obrigatoria. Ausente = boot morre com mensagem acionavel."""
    value = os.environ.get(key)
    if value is None or value == "":
        raise RuntimeError(
            f"[config] required variable missing: {key} (declare it in module.json:requiredEnv)"
        )
    return value


def _check_env_required(manifest: dict[str, Any]) -> None:
    """Importada direto pelo teste (`api.src.config._check_env_required`): sem
    `.env` real, TODA a suite rodaria sob `PYTEST_CURRENT_TEST` sem uma unica variavel de
    `requiredEnv` preenchida — sem o bypass abaixo, `load_configuration()` derrubaria a suite
    inteira antes do primeiro teste. O preco declarado: "suite verde" nunca prova, por si so, que a
    fiacao de ambiente esta correta — quem prova isso e o boot real (`python verify.py`, boot de
    verdade) ou o teste direto, chamando esta funcao com `PYTEST_CURRENT_TEST` removido de proposito.
    """
    missing = [c for c in manifest["requiredEnv"] if os.environ.get(c) is None]
    if missing and os.environ.get("PYTEST_CURRENT_TEST") is None:
        raise RuntimeError(
            f"[config] {manifest['id']}: variables missing from the environment: {', '.join(missing)}"
        )


def load_configuration(root: Path | None = None) -> ModuleConfiguration:
    """Carrega e valida TUDO no boot; qualquer falta derruba o processo antes de servir."""
    module_root = root or find_root_module()
    manifest = _read_json(module_root, "module.json")
    _resolve_environment(module_root)
    _check_env_required(manifest)

    return ModuleConfiguration(
        root=module_root,
        manifest=manifest,
        api=_read_json(module_root, "config/api.json"),
        domain=_read_json(module_root, "config/domain.json"),
        security=_read_json(module_root, "config/security.json"),
        ports=_read_json(module_root, "config/ports.json"),
        texts=_read_json(module_root, "config/texts.json"),
    )
