#!/usr/bin/env python
"""Runner de migrations — aplica e reverte database/migrations/*.sql de um modulo contra Postgres.

Lei dona: specs/arquitetura/02-contrato-e-dados.md §6.3.

    python scripts/migrations.py up <modulo>       aplica as PENDENTES, em ordem — pula o que ja foi
    python scripts/migrations.py down <modulo>     reverte so o ULTIMO aplicado (bloco "-- rollback")
    python scripts/migrations.py ciclo <modulo>    up -> down -> up — prova que o rollback fecha, de
                                                    qualquer estado inicial (vazio ou ja migrado)
    python scripts/migrations.py --autoteste       prova interna (parser, ordem, pendentes/ultimo)

NAO MORA em tools/ (zero dependencia externa, lei 3 da base) — precisa de driver de Postgres,
e tools/ so usa node:*/stdlib. `psycopg` e optional-dependency do PROJETO (mesmo grupo `dev`
de `pip-audit`, `mypy`): o runner VIAJA COM O PROJETO, nao com a base, e por isso mora aqui
(scripts/) — nao em `adapters/` (adapter e para o processo composto trocar de provedor em RUNTIME;
isto e ferramenta de operacao, nunca importada por `src/composicao.py`).

DECISAO (a) [psql via subprocess] x (b) [driver `psycopg`] — medido antes de escolher: nesta base de
desenvolvimento `psql` nao esta disponivel (fora do PATH, e o winget so oferece SERVIDOR completo,
nao um cliente isolado). Instalar um Postgres inteiro no sistema so para ter o CLI e acao pesada e
dificil de reverter — desproporcional para um cliente. `psycopg` como optional-dependency e comum,
escopada ao projeto, instalada pelo MESMO `pip install -e ".[dev]"` que ja instala tudo mais.

ESTADO POR MODULO (plan-2.2.md Bloco Y) — o limite que este arquivo declarava ("sem controle de
versao de migration") mordeu em uso real: um projeto com tres migrations e dois ambientes nao
conseguia rodar `up` a segunda vez. A tabela `<schema>.<prefixo>migrations` (`arquivo text primary
key`, `aplicada_em timestamptz`) e criada pela PRIMEIRA migration do molde — nao por este runner: o
runner so LE e ESCREVE nela, nunca decide a forma dela por fora do SQL versionado. `up` aplica so o
que falta; `down` reverte so o ULTIMO aplicado (nunca "tudo de uma vez" — e o comportamento padrao
de runner de migration, e o que faz `ciclo` funcionar de QUALQUER estado inicial).

ORDEM DENTRO DE CADA MIGRATION, POR TRANSACAO: `up` roda o SQL da migration e SO DEPOIS insere a
linha de controle (a tabela pode ter acabado de nascer NAQUELE up); `down` faz o INVERSO — apaga a
linha de controle ANTES de rodar o SQL de reversao, porque reverter a migration 0001 apaga a propria
tabela de controle, e nao da para `DELETE` de uma tabela que acabou de sumir.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parent.parent
MINIMO_DE_ARGUMENTOS = 2

# ====================================================================================================
# NUCLEO PURO — nunca toca disco nem rede. E a metade que --autoteste prova.
# ====================================================================================================

# `<modulo>` valido — kebab-case minusculo, a MESMA forma que `create-module.mjs` exige ao nascer.
# Serve DUAS funcoes: e o formato certo, E recusa de saida qualquer metacaractere de shell (`;`,
# `$()`, `&`, espaco) — nenhuma entrada adversarial passa daqui para caminho de arquivo nem para
# chave de ambiente.
ID_DE_MODULO_VALIDO = re.compile(r"^[a-z][a-z0-9-]*$")

VERBOS_DE_REVERSAO = re.compile(
    r"^(drop|alter|delete|truncate|revoke|grant|create|insert|update)\b", re.IGNORECASE
)

MARCADOR_ROLLBACK = re.compile(r"^\s*--\s*rollback\s*$", re.IGNORECASE)

LINHA_COMENTADA = re.compile(r"^(\s*)--\s?(.*)$")


def separar_up_down(conteudo: str) -> tuple[str, str]:
    """Separa o UP do DOWN de uma migration. O marcador e uma LINHA so com "-- rollback" — nao uma
    ocorrencia em qualquer lugar do texto (diferente do regex de deteccao do gate, `data.mjs`, que
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


def pendentes(nomes_ordenados_up: list[str], aplicados: set[str]) -> list[str]:
    """Os nomes (ja ordenados por 'up') que NAO estao em `aplicados` — em ordem, o que falta aplicar."""
    return [nome for nome in nomes_ordenados_up if nome not in aplicados]


def ultimo_aplicado(nomes_ordenados_up: list[str], aplicados: set[str]) -> str | None:
    """O ULTIMO nome (na ordem 'up') que esta em `aplicados` — `None` se nenhum esta. E o alvo do
    `down`: reverter um passo, nunca a lista inteira, e por isso `ciclo` funciona de qualquer estado."""
    feitos = [nome for nome in nomes_ordenados_up if nome in aplicados]
    return feitos[-1] if feitos else None


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
    caminho = RAIZ / ".env"
    if not caminho.exists():
        return
    for chave, valor in _ler_pares_env(caminho):
        os.environ.setdefault(chave, valor)


def _pasta_do_modulo(id_do_modulo: str) -> Path:
    """`<modulo>` valido E dentro de `modules/` — nunca escapa por `..` nem separador. Falha
    nomeando a entrada recusada, nunca silenciosa."""
    if not ID_DE_MODULO_VALIDO.match(id_do_modulo):
        raise RuntimeError(f'[migrations] "{id_do_modulo}" nao e kebab-case minusculo valido')
    base = (RAIZ / "modules").resolve()
    pasta = (base / id_do_modulo).resolve()
    if base not in pasta.parents:
        raise RuntimeError(f'[migrations] "{id_do_modulo}" resolve para fora de modules/ — recusado')
    if not (pasta / "modulo.json").exists():
        raise RuntimeError(f'[migrations] modulo "{id_do_modulo}" nao encontrado em modules/')
    return pasta


def _listar_migrations(pasta_modulo: Path) -> list[str]:
    base = pasta_modulo / "database" / "migrations"
    if not base.exists():
        return []
    return [p.name for p in base.iterdir() if p.suffix == ".sql"]


def _tabela_de_controle(pasta_modulo: Path) -> tuple[str, str, str]:
    """`dados.schema`/`dados.prefixo` do manifesto — a MESMA fonte que declara as tabelas do
    modulo, nunca um terceiro lugar para o nome da tabela de controle. Devolve `(schema, tabela,
    qualificada)` — `qualificada` (`"schema"."tabela"`) permite as funcoes abaixo passarem UM
    parametro em vez de dois (limiar de 4 parametros)."""
    manifesto = json.loads(_ler_texto(pasta_modulo / "modulo.json"))
    dados = manifesto["dados"]
    schema = dados["schema"]
    tabela = f"{dados['prefixo']}migrations"
    return schema, tabela, f'"{schema}"."{tabela}"'


def _url_obrigatoria(id_do_modulo: str) -> str:
    """Le uma variavel obrigatoria. Ausente = falha nomeando a chave (lei 7 do catalogo, mesmo
    padrao de `api/src/config.py:env_obrigatoria`)."""
    chave = chave_de_ambiente(id_do_modulo)
    valor = os.environ.get(chave)
    if not valor:
        raise RuntimeError(
            f"[migrations] variavel obrigatoria ausente: {chave}"
            " (declare em modulo.json:envRequerido e no .env da raiz)"
        )
    return valor


def _conectar(url: str) -> Any:
    # Lazy DE PROPOSITO (nao top-level): `psycopg` e optional-dependency `dev` (docstring do
    # modulo, DECISAO). `--autoteste` prova so o nucleo puro e precisa rodar mesmo sem `[dev]`
    # instalado — import no topo quebraria isso so por causa de uma funcao que autoteste nunca chama.
    import psycopg  # noqa: PLC0415

    return psycopg.connect(url)


def _migracoes_aplicadas(conexao: Any, schema: str, tabela: str) -> set[str]:
    """`set` dos `arquivo` ja registrados — vazio (nunca erro) quando a tabela de controle ainda
    nao existe, o estado normal do PRIMEIRO `up` de um banco novo."""
    with conexao.cursor() as cursor:
        cursor.execute(
            "select 1 from information_schema.tables where table_schema = %s and table_name = %s",
            (schema, tabela),
        )
        if cursor.fetchone() is None:
            return set()
        cursor.execute(f'select arquivo from "{schema}"."{tabela}"')
        return {linha[0] for linha in cursor.fetchall()}


def _aplicar_uma(conexao: Any, pasta_modulo: Path, nome: str, tabela_controle: str) -> None:
    """UMA migration, dentro de UMA transacao: roda o SQL, depois grava a linha de controle —
    nessa ordem, porque a migration 0001 CRIA a tabela de controle no proprio SQL que acabou de
    rodar. `tabela_controle` ja vem qualificada (`_tabela_de_controle`) — um parametro, nao dois."""
    conteudo = _ler_texto(pasta_modulo / "database" / "migrations" / nome)
    up, _ = separar_up_down(conteudo)
    sys.stdout.write(f"  up {nome}...\n")
    try:
        with conexao.cursor() as cursor:
            if up:
                cursor.execute(up)
            cursor.execute(f"insert into {tabela_controle} (arquivo) values (%s)", (nome,))
        conexao.commit()
    except Exception:
        conexao.rollback()
        raise


def _reverter_uma(conexao: Any, pasta_modulo: Path, nome: str, tabela_controle: str) -> None:
    """UMA migration revertida, dentro de UMA transacao: apaga a linha de controle ANTES do SQL de
    reversao — a ordem inversa de `_aplicar_uma`, pelo motivo simetrico: reverter 0001 apaga a
    propria tabela de controle."""
    conteudo = _ler_texto(pasta_modulo / "database" / "migrations" / nome)
    _, down = separar_up_down(conteudo)
    sys.stdout.write(f"  down {nome}...\n")
    try:
        with conexao.cursor() as cursor:
            cursor.execute(f"delete from {tabela_controle} where arquivo = %s", (nome,))
            if down:
                cursor.execute(down)
        conexao.commit()
    except Exception:
        conexao.rollback()
        raise


def _aplicar_pendentes(conexao: Any, pasta_modulo: Path) -> None:
    schema, tabela, tabela_controle = _tabela_de_controle(pasta_modulo)
    nomes_up = ordenar_migrations(_listar_migrations(pasta_modulo), "up")
    aplicados = _migracoes_aplicadas(conexao, schema, tabela)
    faltam = pendentes(nomes_up, aplicados)
    if not faltam:
        sys.stdout.write("  nada pendente — todas as migrations ja estao aplicadas\n")
        return
    for nome in faltam:
        _aplicar_uma(conexao, pasta_modulo, nome, tabela_controle)


def _reverter_ultimo(conexao: Any, pasta_modulo: Path) -> None:
    schema, tabela, tabela_controle = _tabela_de_controle(pasta_modulo)
    nomes_up = ordenar_migrations(_listar_migrations(pasta_modulo), "up")
    aplicados = _migracoes_aplicadas(conexao, schema, tabela)
    alvo = ultimo_aplicado(nomes_up, aplicados)
    if alvo is None:
        sys.stdout.write("  nada aplicado — nada a reverter\n")
        return
    _reverter_uma(conexao, pasta_modulo, alvo, tabela_controle)


def rodar_up(id_do_modulo: str) -> None:
    pasta_modulo = _pasta_do_modulo(id_do_modulo)
    url = _url_obrigatoria(id_do_modulo)
    with _conectar(url) as conexao:
        _aplicar_pendentes(conexao, pasta_modulo)


def rodar_down(id_do_modulo: str) -> None:
    pasta_modulo = _pasta_do_modulo(id_do_modulo)
    url = _url_obrigatoria(id_do_modulo)
    with _conectar(url) as conexao:
        _reverter_ultimo(conexao, pasta_modulo)


def rodar_ciclo(id_do_modulo: str) -> None:
    sys.stdout.write(f"[migrations] {id_do_modulo}: up (aplica pendentes)\n")
    rodar_up(id_do_modulo)
    sys.stdout.write(f"[migrations] {id_do_modulo}: down (reverte o ultimo aplicado)\n")
    rodar_down(id_do_modulo)
    sys.stdout.write(f"[migrations] {id_do_modulo}: up (reaplica o que o down reverteu)\n")
    rodar_up(id_do_modulo)
    sys.stdout.write(f"[migrations] {id_do_modulo}: ciclo up -> down -> up OK\n")


# ====================================================================================================
# AUTOTESTE — so o nucleo puro. up/down/ciclo sao I/O de verdade, provados pelo ciclo real contra
# Postgres (relatorio do bloco), nao por fixture em memoria.
# ====================================================================================================


def _casos_de_separar_up_down() -> list[dict[str, Any]]:
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
            "nome": "ADVERSARIAL: linha em branco, comentario que NAO e rollback, indentacao no bloco",
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


def _casos_de_ordenacao() -> list[dict[str, Any]]:
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


def _casos_de_chave_de_ambiente() -> list[dict[str, Any]]:
    return [
        {"nome": "simples", "id": "catalogo", "esperado": "CATALOGO_DB_URL"},
        {"nome": "com hifen", "id": "linha-de-producao", "esperado": "LINHA_DE_PRODUCAO_DB_URL"},
    ]


def _casos_de_estado() -> list[dict[str, Any]]:
    """`pendentes`/`ultimo_aplicado` contra os TRES estados que `ciclo` atravessa: banco vazio,
    parcialmente migrado, e totalmente migrado (o caso que travava `up` antes deste bloco — medido
    no teste real, plan-2.2.md Bloco Y)."""
    nomes = ["0001-cria-metadados.sql", "0002-acrescenta-status.sql", "0003-cria-indice.sql"]
    return [
        {
            "nome": "pendentes: banco vazio -> as tres, em ordem",
            "fn": lambda: pendentes(nomes, set()) == nomes,
        },
        {
            "nome": "pendentes: banco ja migrado por completo -> nenhuma (isto e o que travava antes)",
            "fn": lambda: pendentes(nomes, set(nomes)) == [],
        },
        {
            "nome": "pendentes: so a primeira aplicada -> falta a segunda e a terceira, em ordem",
            "fn": lambda: pendentes(nomes, {nomes[0]}) == [nomes[1], nomes[2]],
        },
        {
            "nome": "ultimo_aplicado: nenhuma aplicada -> None (down nao tem o que reverter)",
            "fn": lambda: ultimo_aplicado(nomes, set()) is None,
        },
        {
            "nome": "ultimo_aplicado: todas aplicadas -> a TERCEIRA (maior prefixo), nunca a primeira",
            "fn": lambda: ultimo_aplicado(nomes, set(nomes)) == nomes[2],
        },
        {
            "nome": "ultimo_aplicado: aplicadas fora de ordem no set -> ainda assim a de MAIOR prefixo",
            "fn": lambda: ultimo_aplicado(nomes, {nomes[2], nomes[0]}) == nomes[2],
        },
    ]


def _rodar_autoteste() -> int:
    falhas = 0
    total = 0

    for caso in _casos_de_separar_up_down():
        total += 1
        up_down_obtido = separar_up_down(caso["entrada"])
        ok = up_down_obtido == caso["esperado"]
        sys.stdout.write(f"  {'ok   ' if ok else 'FALHA'} separar_up_down: {caso['nome']}\n")
        if not ok:
            falhas += 1
            sys.stdout.write(f"       esperado: {caso['esperado']!r}\n")
            sys.stdout.write(f"       obtido:   {up_down_obtido!r}\n")

    for caso in _casos_de_ordenacao():
        total += 1
        ordem_obtida = ordenar_migrations(caso["nomes"], caso["direcao"])
        ok = ordem_obtida == caso["esperado"]
        sys.stdout.write(f"  {'ok   ' if ok else 'FALHA'} ordenar_migrations: {caso['nome']}\n")
        if not ok:
            falhas += 1

    for caso in _casos_de_chave_de_ambiente():
        total += 1
        chave_obtida = chave_de_ambiente(caso["id"])
        ok = chave_obtida == caso["esperado"]
        sys.stdout.write(f"  {'ok   ' if ok else 'FALHA'} chave_de_ambiente: {caso['nome']}\n")
        if not ok:
            falhas += 1

    for caso in _casos_de_estado():
        total += 1
        try:
            ok = caso["fn"]() is True
        except Exception:
            ok = False
        sys.stdout.write(f"  {'ok   ' if ok else 'FALHA'} {caso['nome']}\n")
        if not ok:
            falhas += 1

    sys.stdout.write(f"\nautoteste: {total - falhas}/{total} ok\n")
    return 0 if falhas == 0 else 1


# ====================================================================================================
# CLI
# ====================================================================================================


def main() -> int:
    argv = sys.argv[1:]
    if "--autoteste" in argv:
        return _rodar_autoteste()

    if len(argv) < MINIMO_DE_ARGUMENTOS or argv[0] not in ("up", "down", "ciclo"):
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
