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


def encontrar_raiz_modulo(partida: Path | None = None) -> Path:
    """Sobe ate achar o `modulo.json`. Funciona em dev, em teste e ja extraido."""
    atual = (partida or Path.cwd()).resolve()
    for _ in range(8):
        if (atual / "modulo.json").exists():
            return atual
        if atual.parent == atual:
            break
        atual = atual.parent
    raise RuntimeError(f"[config] modulo.json nao encontrado a partir de {partida or Path.cwd()}")


def _ler_json(raiz: Path, relativo: str) -> Any:
    caminho = raiz / relativo
    try:
        return json.loads(caminho.read_text(encoding="utf-8-sig"))
    except OSError as causa:
        raise RuntimeError(f'[config] nao foi possivel ler "{relativo}": {causa}') from causa
    except json.JSONDecodeError as causa:
        raise RuntimeError(f'[config] "{relativo}" nao e JSON valido: {causa}') from causa


def _ler_pares_env(caminho: Path) -> list[tuple[str, str]]:
    pares: list[tuple[str, str]] = []
    for linha in caminho.read_text(encoding="utf-8-sig").splitlines():
        limpa = linha.strip()
        if limpa == "" or limpa.startswith("#") or "=" not in limpa:
            continue
        chave, _, valor = limpa.partition("=")
        pares.append((chave.strip(), valor.strip()))
    return pares


def _aplicar_sem_sobrescrever(pares: list[tuple[str, str]]) -> None:
    """Mantem a precedencia: o que ja veio do processo vence o arquivo."""
    for chave, valor in pares:
        os.environ.setdefault(chave, valor)


def _resolver_ambiente(raiz: Path) -> None:
    """Resolve o `.env` em cascata (ADR-004, specs/adr/000-decisoes-do-template.md).

    O `.env` do modulo APONTA para o da raiz por `ENV_RAIZ`. Na extracao, apaga-se essa linha e
    os valores passam a viver localmente — sem uma linha de codigo mudar.
    """
    local = raiz / ".env"
    if not local.exists():
        return

    pares = _ler_pares_env(local)
    _aplicar_sem_sobrescrever([(c, v) for c, v in pares if c != "ENV_RAIZ"])

    ponteiro = next((v for c, v in pares if c == "ENV_RAIZ"), None)
    if ponteiro is None:
        return

    alvo = Path(ponteiro) if Path(ponteiro).is_absolute() else (raiz / ponteiro).resolve()
    if not alvo.exists():
        raise RuntimeError(f'[config] ENV_RAIZ aponta para "{alvo}", que nao existe')
    _aplicar_sem_sobrescrever(_ler_pares_env(alvo))


def env_obrigatoria(chave: str) -> str:
    """Le uma variavel obrigatoria. Ausente = boot morre com mensagem acionavel."""
    valor = os.environ.get(chave)
    if valor is None or valor == "":
        raise RuntimeError(
            f"[config] variavel obrigatoria ausente: {chave} (declare em modulo.json:envRequerido)"
        )
    return valor


def _conferir_env_requerido(manifesto: dict[str, Any]) -> None:
    faltando = [c for c in manifesto["envRequerido"] if os.environ.get(c) is None]
    if faltando and os.environ.get("PYTEST_CURRENT_TEST") is None:
        raise RuntimeError(
            f"[config] {manifesto['id']}: variaveis ausentes no ambiente: {', '.join(faltando)}"
        )


def carregar_configuracao(raiz: Path | None = None) -> ConfiguracaoModulo:
    """Carrega e valida TUDO no boot; qualquer falta derruba o processo antes de servir."""
    raiz_modulo = raiz or encontrar_raiz_modulo()
    manifesto = _ler_json(raiz_modulo, "modulo.json")
    _resolver_ambiente(raiz_modulo)
    _conferir_env_requerido(manifesto)

    return ConfiguracaoModulo(
        raiz=raiz_modulo,
        manifesto=manifesto,
        api=_ler_json(raiz_modulo, "config/api.json"),
        dominio=_ler_json(raiz_modulo, "config/dominio.json"),
        seguranca=_ler_json(raiz_modulo, "config/seguranca.json"),
        portas=_ler_json(raiz_modulo, "config/portas.json"),
        textos=_ler_json(raiz_modulo, "config/textos.json"),
    )
