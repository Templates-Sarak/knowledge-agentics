"""Carregador UNICO de configuracao do modulo <modulo>. Lei dona: specs/arquitetura/01-modulo.md §4.

Regras que este arquivo materializa:
  - SO ele toca o ambiente. Qualquer outro arquivo lendo env e aviso do gate.
  - Cascata (ADR-004): processo > .env do modulo > .env apontado por ENV_RAIZ > default de tunable.
  - Falha rapida: env ou config ausente DERRUBA o boot. Nunca `os.getenv("X", "http://localhost")`.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ConfiguracaoModulo:
    raiz: Path
    manifesto: dict[str, Any]
    api: dict[str, Any]
    dominio: dict[str, Any]
    seguranca: dict[str, Any]
    portas: dict[str, str]
    textos: dict[str, str]


def find_root_module(partida: Path | None = None) -> Path:
    """Sobe ate achar o `module.json`. Funciona em dev, em teste e ja extraido."""
    atual = (partida or Path.cwd()).resolve()
    for _ in range(8):
        if (atual / "module.json").exists():
            return atual
        if atual.parent == atual:
            break
        atual = atual.parent
    raise RuntimeError(f"[config] module.json nao encontrado a partir de {partida or Path.cwd()}")


def _read_json(raiz: Path, relativo: str) -> Any:
    caminho = raiz / relativo
    try:
        return json.loads(caminho.read_text(encoding="utf-8-sig"))
    except OSError as causa:
        raise RuntimeError(f'[config] nao foi possivel ler "{relativo}": {causa}') from causa
    except json.JSONDecodeError as causa:
        raise RuntimeError(f'[config] "{relativo}" nao e JSON valido: {causa}') from causa


def _read_pairs_env(caminho: Path) -> list[tuple[str, str]]:
    pares: list[tuple[str, str]] = []
    for linha in caminho.read_text(encoding="utf-8-sig").splitlines():
        limpa = linha.strip()
        if limpa == "" or limpa.startswith("#") or "=" not in limpa:
            continue
        chave, _, valor = limpa.partition("=")
        pares.append((chave.strip(), valor.strip()))
    return pares


def _apply_without_overwrite(pares: list[tuple[str, str]]) -> None:
    """Mantem a precedencia: o que ja veio do processo vence o arquivo."""
    for chave, valor in pares:
        os.environ.setdefault(chave, valor)


def _resolve_environment(raiz: Path) -> None:
    """Resolve o `.env` em cascata (ADR-004, specs/adr/000-decisoes-do-template.md).

    O `.env` do modulo APONTA para o da raiz por `ENV_RAIZ`. Na extracao, apaga-se essa linha e
    os valores passam a viver localmente — sem uma linha de codigo mudar.
    """
    local = raiz / ".env"
    if not local.exists():
        return

    pares = _read_pairs_env(local)
    _apply_without_overwrite([(c, v) for c, v in pares if c != "ENV_RAIZ"])

    ponteiro = next((v for c, v in pares if c == "ENV_RAIZ"), None)
    if ponteiro is None:
        return

    alvo = Path(ponteiro) if Path(ponteiro).is_absolute() else (raiz / ponteiro).resolve()
    if not alvo.exists():
        raise RuntimeError(f'[config] ENV_RAIZ aponta para "{alvo}", que nao existe')
    _apply_without_overwrite(_read_pairs_env(alvo))


def env_required(chave: str) -> str:
    """Le uma variavel obrigatoria. Ausente = boot morre com mensagem acionavel."""
    valor = os.environ.get(chave)
    if valor is None or valor == "":
        raise RuntimeError(
            f"[config] variavel obrigatoria ausente: {chave} (declare em module.json:envRequerido)"
        )
    return valor


def _check_env_required(manifesto: dict[str, Any]) -> None:
    """Importada direto pelo teste (`api.src.config._check_env_required`): sem
    `.env` real, TODA a suite rodaria sob `PYTEST_CURRENT_TEST` sem uma unica variavel de
    `requiredEnv` preenchida — sem o bypass abaixo, `load_configuration()` derrubaria a suite
    inteira antes do primeiro teste. O preco declarado: "suite verde" nunca prova, por si so, que a
    fiacao de ambiente esta correta — quem prova isso e o boot real (`python verify.py`, boot de
    verdade) ou o teste direto, chamando esta funcao com `PYTEST_CURRENT_TEST` removido de proposito.
    """
    faltando = [c for c in manifesto["requiredEnv"] if os.environ.get(c) is None]
    if faltando and os.environ.get("PYTEST_CURRENT_TEST") is None:
        raise RuntimeError(
            f"[config] {manifesto['id']}: variaveis ausentes no ambiente: {', '.join(faltando)}"
        )


def load_configuration(raiz: Path | None = None) -> ConfiguracaoModulo:
    """Carrega e valida TUDO no boot; qualquer falta derruba o processo antes de servir."""
    raiz_modulo = raiz or find_root_module()
    manifesto = _read_json(raiz_modulo, "module.json")
    _resolve_environment(raiz_modulo)
    _check_env_required(manifesto)

    return ConfiguracaoModulo(
        raiz=raiz_modulo,
        manifesto=manifesto,
        api=_read_json(raiz_modulo, "config/api.json"),
        dominio=_read_json(raiz_modulo, "config/domain.json"),
        seguranca=_read_json(raiz_modulo, "config/seguranca.json"),
        portas=_read_json(raiz_modulo, "config/ports.json"),
        textos=_read_json(raiz_modulo, "config/textos.json"),
    )
