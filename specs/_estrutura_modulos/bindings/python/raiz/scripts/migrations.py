#!/usr/bin/env python
"""Runner de migrations — aplica e reverte database/migrations/*.sql de um modulo contra Postgres.

Lei dona: specs/arquitetura/02-contrato-e-dados.md §6.3.

    python scripts/migrations.py up <modulo>       aplica em ordem, sobre banco vazio ou existente
    python scripts/migrations.py down <modulo>     reverte em ordem INVERSA (bloco "-- rollback")
    python scripts/migrations.py ciclo <modulo>    up -> down -> up — prova que o rollback fecha
    python scripts/migrations.py --autoteste       prova interna (parser, ordem, chave de ambiente)

NAO MORA em ferramentas/ (zero dependencia externa, lei 3 da base) — precisa de driver de Postgres,
e ferramentas/ so usa node:*/stdlib. `psycopg` e optional-dependency do PROJETO (mesmo grupo `dev`
de `pip-audit`, `mypy`): o runner VIAJA COM O PROJETO, nao com a base, e por isso mora aqui
(scripts/) — nao em `adapters/` (adapter e para o processo composto trocar de provedor em RUNTIME;
isto e ferramenta de operacao, nunca importada por `src/composicao.py`).

DECISAO (a) [psql via subprocess] x (b) [driver `psycopg`] — medido antes de escolher: nesta base de
desenvolvimento `psql` nao esta disponivel (fora do PATH, e o winget so oferece SERVIDOR completo,
nao um cliente isolado). Instalar um Postgres inteiro no sistema so para ter o CLI e acao pesada e
dificil de reverter — desproporcional para um cliente. `psycopg` como optional-dependency e comum,
escopada ao projeto, instalada pelo MESMO `pip install -e ".[dev]"` que ja instala tudo mais.

LIMITE DECLARADO (specs/arquitetura/04-regras.md §7.2): sem controle de versao de migration (tabela
`schema_migrations` e afins) — o bloco e "o rollback funciona", nao "um framework de migracao".
`up`/`down` aplicam TODOS os arquivos em ordem, sempre; rodar `up` duas vezes sobre um banco ja
migrado falha (tabela ja existe) POR DESENHO — e o proprio sinal de "banco nao esta vazio", nao um
bug a esconder.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

# ====================================================================================================
# NUCLEO PURO — nunca toca disco nem rede. E a metade que --autoteste prova.
# ====================================================================================================

# `<modulo>` valido — kebab-case minusculo, a MESMA forma que `criar-modulo.mjs` exige ao nascer.
# Serve DUAS funcoes: e o formato certo, E recusa de saida qualquer metacaractere de shell (`;`,
# `$()`, `&`, espaco) — nenhuma entrada adversarial passa daqui para caminho de arquivo nem para
# chave de ambiente.
ID_DE_MODULO_VALIDO = re.compile(r"^[a-z][a-z0-9-]*$")

VERBOS_DE_REVERSAO = re.compile(r"^(drop|alter|delete|truncate|revoke|grant|create|insert|update)\b", re.IGNORECASE)

MARCADOR_ROLLBACK = re.compile(r"^\s*--\s*rollback\s*$", re.IGNORECASE)

LINHA_COMENTADA = re.compile(r"^(\s*)--\s?(.*)$")


def separar_up_down(conteudo: str) -> tuple[str, str]:
    """Separa o UP do DOWN de uma migration. O marcador e uma LINHA so com "-- rollback" — nao uma
    ocorrencia em qualquer lugar do texto (diferente do regex de deteccao do gate, `dados.mjs`, que
    so precisa saber SE existe bloco, nunca onde ele comeca)."""
    linhas = conteudo.splitlines()
    indice_marcador = next((i for i, linha in enumerate(linhas) if MARCADOR_ROLLBACK.match(linha)), None)
    if indice_marcador is None:
        return conteudo.strip(), ""

    up = "\n".join(linhas[:indice_marcador]).strip()
    down = _descomentar_rollback(linhas[indice_marcador + 1 :])
    return up, down


def _descomentar_rollback(linhas: list[str]) -> str:
    """Descomenta o bloco de rollback, linha a linha — NUNCA lanca. Linha em branco: descartada.
    Linha comentada cujo conteudo comeca por um verbo de DDL/DML conhecido: descomentada (o "-- "
    sai, preservando a indentacao). Qualquer outra coisa — comentario de verdade, linha ja sem "--"
    — passa INALTERADA: e SQL valido de um jeito ou de outro. E o que faz o parser nunca quebrar,
    provado por --autoteste com linha em branco, comentario que NAO e rollback, e indentacao."""
    resultado = []
    for linha in linhas:
        if linha.strip() == "":
            continue
        casado = LINHA_COMENTADA.match(linha)
        if casado is None:
            resultado.append(linha)
            continue
        indentacao, resto = casado.group(1), casado.group(2)
        resultado.append(f"{indentacao}{resto}" if VERBOS_DE_REVERSAO.match(resto) else linha)
    return "\n".join(resultado).strip()


def _prefixo_de(nome_de_arquivo: str) -> str | None:
    """Nome do arquivo -> prefixo NNNN. `None` quando foge do padrao — a regra `migrations` do gate
    ja reprova isso; aqui so nao quebra a ordenacao."""
    casado = re.match(r"^(\d{4})-", nome_de_arquivo)
    return casado.group(1) if casado else None


def ordenar_migrations(nomes: list[str], direcao: str) -> list[str]:
    """UP em ordem crescente (prefixo NNNN); DOWN e o INVERSO — reverte o que aplicou por ultimo
    primeiro."""
    ordenados = sorted(nomes, key=lambda nome: _prefixo_de(nome) or nome)
    return list(reversed(ordenados)) if direcao == "down" else ordenados


def chave_de_ambiente(id_do_modulo: str) -> str:
    """`<modulo>` -> `<MODULO>_DB_URL` — a MESMA convencao de `modulo.json:envRequerido`."""
    return f"{id_do_modulo.upper().replace('-', '_')}_DB_URL"


# ====================================================================================================
# CASCA — todo I/O nomeado e isolado aqui.
# ====================================================================================================


def _ler_texto(caminho: Path) -> str:
    return caminho.read_text(encoding="utf-8-sig")


def _ler_pares_env(caminho: Path) -> list[tuple[str, str]]:
    pares: list[tuple[str, str]] = []
    for linha in _ler_texto(caminho).splitlines():
        limpa = linha.strip()
        if limpa == "" or limpa.startswith("#") or "=" not in limpa:
            continue
        chave, _, valor = limpa.partition("=")
        pares.append((chave.strip(), valor.strip()))
    return pares


def _carregar_env_da_raiz() -> None:
    """Carrega o `.env` UNICO da raiz no processo, sem sobrescrever o que ja veio de fora — mesma
    precedencia de `src/composicao.py:_carregar_env_da_raiz` (ADR-004)."""
    import os

    caminho = RAIZ / ".env"
    if not caminho.exists():
        return
    for chave, valor in _ler_pares_env(caminho):
        os.environ.setdefault(chave, valor)


def _pasta_do_modulo(id_do_modulo: str) -> Path:
    """`<modulo>` valido E dentro de `modulos/` — nunca escapa por `..` nem separador. Falha
    nomeando a entrada recusada, nunca silenciosa."""
    if not ID_DE_MODULO_VALIDO.match(id_do_modulo):
        raise RuntimeError(f'[migrations] "{id_do_modulo}" nao e um id de modulo valido (kebab-case minusculo)')
    base = (RAIZ / "modulos").resolve()
    pasta = (base / id_do_modulo).resolve()
    if base not in pasta.parents:
        raise RuntimeError(f'[migrations] "{id_do_modulo}" resolve para fora de modulos/ — recusado')
    if not (pasta / "modulo.json").exists():
        raise RuntimeError(f'[migrations] modulo "{id_do_modulo}" nao encontrado em modulos/')
    return pasta


def _listar_migrations(pasta_modulo: Path) -> list[str]:
    base = pasta_modulo / "database" / "migrations"
    if not base.exists():
        return []
    return [p.name for p in base.iterdir() if p.suffix == ".sql"]


def _url_obrigatoria(id_do_modulo: str) -> str:
    """Le uma variavel obrigatoria. Ausente = falha nomeando a chave (lei 7 do catalogo, mesmo
    padrao de `api/src/config.py:env_obrigatoria`)."""
    import os

    chave = chave_de_ambiente(id_do_modulo)
    valor = os.environ.get(chave)
    if not valor:
        raise RuntimeError(
            f"[migrations] variavel obrigatoria ausente: {chave} (declare em modulo.json:envRequerido e no .env da raiz)"
        )
    return valor


def _aplicar(conexao, pasta_modulo: Path, direcao: str) -> None:
    nomes = ordenar_migrations(_listar_migrations(pasta_modulo), direcao)
    with conexao.cursor() as cursor:
        for nome in nomes:
            conteudo = _ler_texto(pasta_modulo / "database" / "migrations" / nome)
            up, down = separar_up_down(conteudo)
            sql = down if direcao == "down" else up
            if sql == "":
                verbo = "reverter" if direcao == "down" else "aplicar"
                print(f"  {nome}: nada a {verbo}")
                continue
            print(f"  {direcao} {nome}...")
            cursor.execute(sql)
    conexao.commit()


def _conectar(url: str):
    import psycopg

    return psycopg.connect(url)


def rodar_up(id_do_modulo: str) -> None:
    pasta_modulo = _pasta_do_modulo(id_do_modulo)
    url = _url_obrigatoria(id_do_modulo)
    with _conectar(url) as conexao:
        _aplicar(conexao, pasta_modulo, "up")


def rodar_down(id_do_modulo: str) -> None:
    pasta_modulo = _pasta_do_modulo(id_do_modulo)
    url = _url_obrigatoria(id_do_modulo)
    with _conectar(url) as conexao:
        _aplicar(conexao, pasta_modulo, "down")


def rodar_ciclo(id_do_modulo: str) -> None:
    print(f"[migrations] {id_do_modulo}: up")
    rodar_up(id_do_modulo)
    print(f"[migrations] {id_do_modulo}: down")
    rodar_down(id_do_modulo)
    print(f"[migrations] {id_do_modulo}: up (de novo — prova que o rollback fechou o ciclo)")
    rodar_up(id_do_modulo)
    print(f"[migrations] {id_do_modulo}: ciclo up -> down -> up OK")


# ====================================================================================================
# AUTOTESTE — so o nucleo puro. up/down/ciclo sao I/O de verdade, provados pelo ciclo real contra
# Postgres (relatorio do bloco), nao por fixture em memoria.
# ====================================================================================================


def _casos_de_separar_up_down():
    return [
        {
            "nome": "bloco simples (o molde de verdade)",
            "entrada": "\n".join(
                [
                    'create table "acme"."x_metadados" (id uuid);',
                    "",
                    "-- rollback",
                    '-- drop table if exists "acme"."x_auditoria";',
                    '-- drop table if exists "acme"."x_metadados";',
                ]
            ),
            "esperado": (
                'create table "acme"."x_metadados" (id uuid);',
                'drop table if exists "acme"."x_auditoria";\ndrop table if exists "acme"."x_metadados";',
            ),
        },
        {
            "nome": "ADVERSARIAL: linha em branco, comentario que NAO e rollback, e indentacao dentro do bloco",
            "entrada": "\n".join(
                [
                    'create table "acme"."x" (id uuid);',
                    "-- rollback",
                    '  -- drop table if exists "acme"."x";',
                    "",
                    "-- atencao: isto e destrutivo, confirme antes de rodar em producao",
                    "",
                    '     -- alter table "acme"."x" disable trigger all;',
                ]
            ),
            "esperado": (
                'create table "acme"."x" (id uuid);',
                "\n".join(
                    [
                        'drop table if exists "acme"."x";',
                        "-- atencao: isto e destrutivo, confirme antes de rodar em producao",
                        '     alter table "acme"."x" disable trigger all;',
                    ]
                ),
            ),
        },
        {
            "nome": "sem bloco de rollback: down vazio, up e o arquivo inteiro",
            "entrada": 'create table "acme"."x" (id uuid);',
            "esperado": ('create table "acme"."x" (id uuid);', ""),
        },
        {
            "nome": "bloco de rollback vazio (so a marca, nada depois)",
            "entrada": 'create table "acme"."x" (id uuid);\n-- rollback\n',
            "esperado": ('create table "acme"."x" (id uuid);', ""),
        },
    ]


def _casos_de_ordenacao():
    return [
        {
            "nome": "up: ordem crescente",
            "nomes": ["0002-acrescenta-status.sql", "0001-cria-metadados.sql"],
            "direcao": "up",
            "esperado": ["0001-cria-metadados.sql", "0002-acrescenta-status.sql"],
        },
        {
            "nome": "down: ordem INVERSA",
            "nomes": ["0001-cria-metadados.sql", "0002-acrescenta-status.sql"],
            "direcao": "down",
            "esperado": ["0002-acrescenta-status.sql", "0001-cria-metadados.sql"],
        },
    ]


def _casos_de_chave_de_ambiente():
    return [
        {"nome": "simples", "id": "catalogo", "esperado": "CATALOGO_DB_URL"},
        {"nome": "com hifen", "id": "linha-de-producao", "esperado": "LINHA_DE_PRODUCAO_DB_URL"},
    ]


def _rodar_autoteste() -> int:
    falhas = 0
    total = 0

    for caso in _casos_de_separar_up_down():
        total += 1
        obtido = separar_up_down(caso["entrada"])
        ok = obtido == caso["esperado"]
        print(f"  {'ok   ' if ok else 'FALHA'} separar_up_down: {caso['nome']}")
        if not ok:
            falhas += 1
            print(f"       esperado: {caso['esperado']!r}")
            print(f"       obtido:   {obtido!r}")

    for caso in _casos_de_ordenacao():
        total += 1
        obtido = ordenar_migrations(caso["nomes"], caso["direcao"])
        ok = obtido == caso["esperado"]
        print(f"  {'ok   ' if ok else 'FALHA'} ordenar_migrations: {caso['nome']}")
        if not ok:
            falhas += 1

    for caso in _casos_de_chave_de_ambiente():
        total += 1
        obtido = chave_de_ambiente(caso["id"])
        ok = obtido == caso["esperado"]
        print(f"  {'ok   ' if ok else 'FALHA'} chave_de_ambiente: {caso['nome']}")
        if not ok:
            falhas += 1

    print(f"\nautoteste: {total - falhas}/{total} ok")
    return 0 if falhas == 0 else 1


# ====================================================================================================
# CLI
# ====================================================================================================


def main() -> int:
    argv = sys.argv[1:]
    if "--autoteste" in argv:
        return _rodar_autoteste()

    if len(argv) < 2 or argv[0] not in ("up", "down", "ciclo"):
        sys.stderr.write(
            "uso: python scripts/migrations.py up|down|ciclo <modulo>\n"
            "     python scripts/migrations.py --autoteste\n"
        )
        return 1

    comando, alvo = argv[0], argv[1]
    _carregar_env_da_raiz()
    try:
        if comando == "up":
            rodar_up(alvo)
        elif comando == "down":
            rodar_down(alvo)
        else:
            rodar_ciclo(alvo)
        return 0
    except Exception as causa:  # noqa: BLE001 — traduzido para saida, nunca engolido
        sys.stderr.write(f"{causa}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
