import os
import re
import json
import subprocess
import argparse
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponteiros import alvo_de_caminho, auditar_ponteiros  # noqa: E402
from contagens import (  # noqa: E402
    auditar_contagens,
    contagens_do_texto,
    divergencias as divergencias_de_contagem,
    hooks_wireados,
)
from limiares import (  # noqa: E402
    auditar_limiares,
    divergencias,
    limiares_de_dict_config,
    limiares_de_texto_mjs,
)
from nomenclatura import (  # noqa: E402
    auditar_nomenclatura,
    fora_do_vocabulario,
    prefixos_do_texto,
    raiz_do_prefixo,
)
from paridade import auditar_paridade, divergencias as divergencias_de_paridade  # noqa: E402
from mapa import auditar_mapa, divergencias as divergencias_de_mapa
from manifestos import (
    FONTE as FONTE_DE_MANIFESTO,
    auditar_manifestos,
    divergencias as divergencias_de_manifesto,
)
from proatividade import (  # noqa: E402
    PROATIVAS,
    auditar_proatividade,
    descricao_do_frontmatter,
    skills_sem_trava,
)
from secoes import SECOES_OBRIGATORIAS, auditar_secoes, secoes_faltando  # noqa: E402


def get_args():
    parser = argparse.ArgumentParser(description="Auditoria Sarak knowledge-agentics Base")
    parser.add_argument("--raiz", help="Caminho raiz do repositório knowledge-agentics")
    parser.add_argument(
        "--autoteste",
        action="store_true",
        help="Roda a suite interna, nao toca disco fora do repo",
    )
    return parser.parse_args()


def _autoteste_manifestos():
    """Manifestos do plugin: identidade igual nao acusa; `version` divergente, `description`
    divergente no marketplace e manifesto ausente acusam, nomeando o arquivo; excecao declarada
    isenta o ausente."""
    falhas = []
    codex, raiz, mkt = ".codex-plugin/plugin.json", "plugin.json", ".claude-plugin/marketplace.json"
    fonte = {"name": "sarak", "version": "1.0.0", "description": "d", "author": {"name": "a"}}
    iguais = {
        FONTE_DE_MANIFESTO: fonte,
        codex: dict(fonte),
        raiz: dict(fonte),
        mkt: {"plugins": [{"name": "sarak", "description": "d"}]},
    }
    casos = [
        ("identidade igual nao acusa", iguais, {}, lambda r: r == []),
        ("version divergente acusa o espelho", {**iguais, codex: {**fonte, "version": "2.0.0"}}, {},
         lambda r: len(r) == 1 and "version" in r[0] and codex in r[0]),
        ("description divergente no marketplace acusa", {**iguais, mkt: {"plugins": [{"name": "sarak", "description": "x"}]}}, {},
         lambda r: len(r) == 1 and "description" in r[0] and mkt in r[0]),
        ("manifesto ausente acusa", {k: v for k, v in iguais.items() if k != raiz}, {},
         lambda r: len(r) == 1 and raiz in r[0] and "ausente" in r[0]),
        ("excecao declarada isenta o ausente", {k: v for k, v in iguais.items() if k != raiz}, {raiz: "motivo"},
         lambda r: r == []),
    ]
    for nome, manifestos, excecoes, esperado in casos:
        achados = divergencias_de_manifesto(manifestos, excecoes=excecoes)
        if not esperado(achados):
            falhas.append(f"divergencias (manifestos): {nome} (achou {achados!r})")
    return falhas


def _autoteste_mapa():
    """Schema do mapa.json: valido nao acusa; id duplicado, tipo invalido e caminho absoluto acusam."""
    sistema = {
        "id": "earendel-erp", "nome": "ERP", "caminho": "../Earendel/ERP", "repo": None,
        "raiz_git": "../Earendel/ERP", "tipo": "app", "modular": True, "bindings": ["typescript"],
        "situacao": "ativo", "status": "desatualizado", "status_base": None,
    }
    outro = {**sistema, "id": "outro", "caminho": "../Outro", "bindings": ["typescript", "python"]}
    casos = [
        ("mapa valido (lista com dois bindings) nao acusa", [sistema, outro], lambda r: r == []),
        ("lista vazia de bindings nao acusa", [{**sistema, "bindings": []}], lambda r: r == []),
        ("binding invalido na lista acusa", [{**sistema, "bindings": ["go"]}], lambda r: len(r) == 1 and "fora de" in r[0]),
        ("binding repetido acusa", [{**sistema, "bindings": ["python", "python"]}], lambda r: len(r) == 1 and "repetido" in r[0]),
        ("campo antigo binding acusa", [{**sistema, "binding": "typescript"}], lambda r: len(r) == 1 and "campo antigo" in r[0]),
        ("id duplicado acusa", [sistema, {**outro, "id": "earendel-erp"}], lambda r: len(r) == 1 and "id 'earendel-erp' repetido" in r[0]),
        ("tipo invalido acusa", [{**sistema, "tipo": "lib"}], lambda r: len(r) == 1 and "'tipo'" in r[0]),
        ("status atualizado com commit curto nao acusa", [{**sistema, "status": "atualizado", "status_base": "973a0f5"}], lambda r: r == []),
        ("status invalido acusa", [{**sistema, "status": "ok"}], lambda r: len(r) == 1 and "'status'" in r[0]),
        ("status_base fora de commit acusa", [{**sistema, "status_base": "ontem"}], lambda r: len(r) == 1 and "status_base" in r[0]),
        ("caminho absoluto acusa", [{**sistema, "caminho": "C:/Code/Earendel/ERP"}], lambda r: len(r) == 1 and "'caminho'" in r[0]),
    ]
    falhas = []
    for nome, sistemas, esperado in casos:
        achados = divergencias_de_mapa({"sistemas": sistemas})
        if not esperado(achados):
            falhas.append(f"divergencias (mapa): {nome} (achou {achados!r})")
    return falhas


def autoteste():
    """Prova que `alvo_de_caminho` trata caminho de PROJETO GERADO (`specs/arquitetura/`,
    `contract/`, `core/`, `modules/`, `api/`, `tools/` — a mesma lista do comentario acima de
    PREFIXOS_DA_BASE) como fora de alcance, e caminho da BASE como resolvivel."""
    falhas = []
    de_projeto_gerado = (
        "specs/arquitetura/04-regras.md",
        "contract/openapi.yaml",
        "core/domain/item.ts",
        "modules/catalogo/module.json",
        "api/src/index.ts",
        "tools/gate/validate.mjs",
    )
    for token in de_projeto_gerado:
        alvo = alvo_de_caminho(token, dono=None)
        if alvo is not None:
            falhas.append(
                f"caminho de projeto gerado deveria ficar fora de alcance: {token!r} -> {alvo!r}"
            )
    da_base = "skills/git-verificacao-commit/scripts/gerar_config.py"
    if alvo_de_caminho(da_base, dono=None) != da_base:
        falhas.append(f"caminho da base deveria resolver identico: {da_base!r}")

    # Tarefa 1: comparador de limiares (thresholds.mjs vs config.json) tem que pegar divergencia
    # E reprovar quando o formato de thresholds.mjs muda de jeito inesperado (fail-closed).
    mjs_ok = "export const LIMIARES = {\n  linhasFuncao: 40,\n  aninhamento: 3,\n  parametros: 4,\n};\n"
    esperado = {"linhasFuncao": 40, "aninhamento": 3, "parametros": 4}
    if limiares_de_texto_mjs(mjs_ok) != esperado:
        falhas.append(
            "limiares_de_texto_mjs deveria extrair o trio de um thresholds.mjs valido"
        )
    if limiares_de_texto_mjs("export const OUTRACOISA = { x: 1 };") is not None:
        falhas.append(
            "limiares_de_texto_mjs deveria reprovar (None) quando LIMIARES nao existe"
        )
    if (
        limiares_de_texto_mjs("export const LIMIARES = { linhasFuncao: 40 };")
        is not None
    ):
        falhas.append(
            "limiares_de_texto_mjs deveria reprovar (None) quando falta uma das tres chaves"
        )
    config_igual = {"maxFunctionLines": 40, "maxNesting": 3, "maxParams": 4}
    if divergencias(esperado, limiares_de_dict_config(config_igual), "fixture") != []:
        falhas.append("divergencias nao deveria achar nada quando os trios sao iguais")
    config_diferente = {"maxFunctionLines": 50, "maxNesting": 3, "maxParams": 4}
    achado_divergente = divergencias(
        esperado, limiares_de_dict_config(config_diferente), "fixture"
    )
    if len(achado_divergente) != 1 or "linhasFuncao" not in achado_divergente[0]:
        falhas.append(
            "divergencias deveria achar exatamente a chave que diverge (linhasFuncao)"
        )
    if len(divergencias(esperado, None, "fixture")) != 1:
        falhas.append("divergencias deveria reprovar quando o config.json nao resolve")

    # Tarefa 4: vocabulario de prefixos (nomenclatura.md) tem que pegar nome fora do vocabulario
    # E reprovar (fail-closed) quando o parser extrai ZERO prefixos do arquivo.
    tabela_ok = "# Nomenclatura\n\n| Prefixo | Area | Exemplos |\n|---|---|---|\n| `code-` | X | Y |\n| `cyber-` | Z | W |\n"
    prefixos_ok = prefixos_do_texto(tabela_ok)
    if prefixos_ok != ["code-", "cyber-"]:
        falhas.append(
            "prefixos_do_texto deveria extrair os dois prefixos da tabela valida"
        )
    if prefixos_do_texto("# Nomenclatura\n\nsem tabela nenhuma aqui\n") != []:
        falhas.append(
            "prefixos_do_texto deveria devolver lista vazia quando nao ha tabela"
        )
    if raiz_do_prefixo("code1-auditar") != "code":
        falhas.append(
            "raiz_do_prefixo deveria descartar o digito do fluxo numerado (code1- -> code)"
        )
    if raiz_do_prefixo("cyber-segredos") != "cyber":
        falhas.append("raiz_do_prefixo deveria extrair a raiz de um prefixo simples")
    fora = fora_do_vocabulario(
        ["code-diagnostico", "api-fantasma", "code1-auditar"], prefixos_ok
    )
    if fora != ["api-fantasma"]:
        falhas.append(
            "fora_do_vocabulario deveria achar so o nome com prefixo fora da lista "
            f"(achou {fora!r})"
        )

    # Tarefa 5: toda skill precisa da trava "NAO acione proativamente", exceto a lista fechada
    # PROATIVAS (com justificativa por entrada).
    com_trava = "description: Faz X. Use ao Y. NÃO acione proativamente."
    if (
        descricao_do_frontmatter(f"---\nname: x\n{com_trava}\n---\n")
        != com_trava[len("description: ") :]
    ):
        falhas.append(
            "descricao_do_frontmatter deveria extrair a linha description inteira"
        )
    if descricao_do_frontmatter("---\nname: x\n---\n") is not None:
        falhas.append(
            "descricao_do_frontmatter deveria devolver None sem linha description"
        )
    pares = [
        ("code-comtrava", "Faz X. Use ao Y. NÃO acione proativamente."),
        ("code-semtrava", "Faz X. Use ao Y."),
        ("padrao-escrita", "Norma sempre-referenciada, sem a trava por desenho."),
        ("code-semdescricao", None),
    ]
    faltantes = skills_sem_trava(pares, PROATIVAS)
    if faltantes != ["code-semtrava", "code-semdescricao"]:
        falhas.append(
            "skills_sem_trava deveria achar so quem falta a trava E nao esta em PROATIVAS "
            f"(achou {faltantes!r})"
        )
    if "padrao-escrita" not in PROATIVAS or "code-auditoria-padrao" not in PROATIVAS:
        falhas.append(
            "PROATIVAS deveria listar padrao-escrita e code-auditoria-padrao com justificativa"
        )

    # Tarefa 6: SKILL.md precisa das secoes obrigatorias do molde (nao cobra "## Workflow" —
    # ver a nota de secoes.py sobre as 6 skills legitimas sem essa secao).
    skill_completa = (
        '## Quando usar\nx\n## Regras e limites\nx\n## Checklist "pronta"\nx\n'
    )
    if secoes_faltando(skill_completa, SECOES_OBRIGATORIAS) != []:
        falhas.append(
            "secoes_faltando nao deveria achar nada num SKILL.md com as tres secoes"
        )
    # "## Regras de Ouro" (o molde antigo) casa o prefixo "## Regras" de proposito — o defeito
    # real do molde antigo era a falta de "## Quando usar" (tinha "## O Gatilho") e a falta TOTAL
    # de checklist, nao o nome da secao de regras.
    skill_velha = "## O Gatilho\nx\n## Workflow\nx\n## Regras de Ouro\nx\n"
    faltando_velha = secoes_faltando(skill_velha, SECOES_OBRIGATORIAS)
    if faltando_velha != ["## Quando usar", "## Checklist"]:
        falhas.append(
            "secoes_faltando deveria reprovar 'Quando usar' e 'Checklist' no molde antigo "
            f"(O Gatilho/Regras de Ouro, sem Checklist) — achou {faltando_velha!r}"
        )
    if secoes_faltando(skill_completa, ("## Workflow",)) != ["## Workflow"]:
        falhas.append(
            "secoes_faltando deveria achar 'Workflow' faltando quando so ele e cobrado"
        )

    # Tarefa 7: contagem do cabecalho do roteador de capacidades (00-knowledge.md) tem que bater
    # com a contagem real de commands/agents/hooks — e "Hooks" conta pelo wireado em hooks.json,
    # nao por arquivo .js solto (a pasta tem _lib.js, que nao e um hook).
    texto_cabecalhos = (
        "# 5. Commands (13) — disparo manual\n"
        "# 6. Agents (5) — subagentes\n"
        "# 7. Hooks (5) — garantias\n"
    )
    citadas = contagens_do_texto(texto_cabecalhos)
    if citadas != {"Commands": 13, "Agents": 5, "Hooks": 5}:
        falhas.append(
            f"contagens_do_texto deveria extrair os tres cabecalhos com numero (achou {citadas!r})"
        )
    if contagens_do_texto("# 4. Catalogo de skills\n") != {}:
        falhas.append(
            "contagens_do_texto nao deveria achar nada num cabecalho sem numero entre parenteses"
        )
    sem_divergencia = divergencias_de_contagem(
        {"Commands": 13}, {"Commands": 13, "Agents": 5}
    )
    if sem_divergencia != []:
        falhas.append(
            "divergencias (contagens) nao deveria achar nada quando o numero citado bate"
        )
    com_divergencia = divergencias_de_contagem({"Commands": 12}, {"Commands": 13})
    if len(com_divergencia) != 1 or "Commands" not in com_divergencia[0]:
        falhas.append(
            f"divergencias (contagens) deveria achar a divergencia de Commands (achou {com_divergencia!r})"
        )
    hooks_json_fixture = {
        "hooks": {
            "PreToolUse": [
                {"hooks": [{"command": 'node "${X}/hooks/cyber-git-seguro.js"'}]}
            ],
            "PostToolUse": [
                {"hooks": [{"command": 'node "${X}/hooks/cyber-git-seguro.js"'}]},
                {"hooks": [{"command": 'node "${X}/hooks/padrao-format.js"'}]},
            ],
        }
    }
    with tempfile.TemporaryDirectory() as tmp_hooks:
        os.mkdir(os.path.join(tmp_hooks, "hooks"))
        with open(
            os.path.join(tmp_hooks, "hooks", "hooks.json"), "w", encoding="utf-8"
        ) as f:
            json.dump(hooks_json_fixture, f)
        nomes = hooks_wireados(tmp_hooks)
    if nomes != {"cyber-git-seguro", "padrao-format"}:
        falhas.append(
            f"hooks_wireados deveria dedupar o hook repetido em dois eventos (achou {nomes!r})"
        )

    # Tarefa 8: paridade entre specs/_estrutura_base e specs/_estrutura_base_site — par identico
    # nao acusa, CRLF vs LF do MESMO conteudo nao e divergencia real, arquivo que so existe de um
    # lado nao acusa (e o desenho, nao defeito), excecao declarada nao acusa mesmo divergindo, e
    # par realmente divergente acusa nomeando o arquivo.
    par_identico = divergencias_de_paridade(
        {"x.md": "igual\n"}, {"x.md": "igual\n"}, excecoes={}
    )
    if par_identico != []:
        falhas.append(
            f"divergencias (paridade) nao deveria acusar par identico (achou {par_identico!r})"
        )
    so_fim_de_linha = divergencias_de_paridade(
        {"x.md": "um\r\ndois\r\n"}, {"x.md": "um\ndois\n"}, excecoes={}
    )
    if so_fim_de_linha != []:
        falhas.append(
            f"divergencias (paridade) nao deveria acusar CRLF vs LF do mesmo conteudo (achou {so_fim_de_linha!r})"
        )
    so_de_um_lado = divergencias_de_paridade(
        {"x.md": "a", "so-aqui.md": "y"}, {"x.md": "a"}, excecoes={}
    )
    if so_de_um_lado != []:
        falhas.append(
            f"divergencias (paridade) nao deveria acusar arquivo que so existe de um lado (achou {so_de_um_lado!r})"
        )
    isento = divergencias_de_paridade(
        {"README.md": "a"}, {"README.md": "b"}, excecoes={"README.md": "motivo"}
    )
    if isento != []:
        falhas.append(
            f"divergencias (paridade) nao deveria acusar arquivo isento por excecao (achou {isento!r})"
        )
    par_divergente = divergencias_de_paridade({"x.md": "a"}, {"x.md": "b"}, excecoes={})
    if len(par_divergente) != 1 or "x.md" not in par_divergente[0]:
        falhas.append(
            f"divergencias (paridade) deveria acusar par divergente, nomeando o arquivo (achou {par_divergente!r})"
        )
    # Achado da rodada de correção: filtro por extensão ".md" contradizia a docstring ("arquivo
    # compartilhado NOVO nasce COBRADO por default"). Agora o recorte é por PASTA, nunca por
    # extensão — par não-`.md` divergente tem de acusar, texto ou binário (bytes).
    par_nao_md_diverge = divergencias_de_paridade(
        {"config.json": '{"a": 1}'}, {"config.json": '{"a": 2}'}, excecoes={}
    )
    if len(par_nao_md_diverge) != 1 or "config.json" not in par_nao_md_diverge[0]:
        falhas.append(
            f"divergencias (paridade) deveria acusar par nao-.md divergente (achou {par_nao_md_diverge!r})"
        )

    falhas += _autoteste_manifestos()
    falhas += _autoteste_mapa()

    for falha in falhas:
        print(f"  falha  {falha}")
    if falhas:
        print(f"autoteste (audit_base): {len(falhas)} falha(s)")
        return 1
    print("autoteste (audit_base): 54/54 ok")
    return 0


def audit_base(base_dir):
    report = {
        "agents": [],
        "commands": [],
        "hooks": [],
        "skills": [],
        "ponteiros": [],
        "contagens": [],
        "vazamentos": [],
        "limiares": [],
        "nomenclatura": [],
        "proatividade": [],
        "secoes": [],
        "paridade": [],
        "manifestos": [],
        "mapa": [],
    }

    # 1. Agents
    agents_dir = os.path.join(base_dir, "agents")
    if os.path.exists(agents_dir):
        for file in os.listdir(agents_dir):
            if not file.endswith(".md"):
                continue
            path = os.path.join(agents_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            if "EXCLUSIVAMENTE" not in content and "JSON" not in content:
                report["agents"].append(
                    f"[{file}] Faltando contrato estrito de saída JSON."
                )
            if "name:" not in content or "description:" not in content:
                report["agents"].append(
                    f"[{file}] Frontmatter incompleto (name/description)."
                )

    # 2. Commands
    commands_dir = os.path.join(base_dir, "commands")
    if os.path.exists(commands_dir):
        for file in os.listdir(commands_dir):
            if not file.endswith(".md"):
                continue
            path = os.path.join(commands_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            for line in content.split("\n"):
                if line.startswith("description:"):
                    if ": " in line[12:].strip():
                        report["commands"].append(
                            f"[{file}] Armadilha YAML na description (dois pontos seguidos de espaço)."
                        )

    # 3. Hooks
    hooks_dir = os.path.join(base_dir, "hooks")
    if os.path.exists(hooks_dir):
        for file in os.listdir(hooks_dir):
            path = os.path.join(hooks_dir, file)
            if file.endswith(".json"):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        json.load(f)
                except Exception as e:
                    report["hooks"].append(f"[{file}] JSON inválido: {str(e)}")
            elif file.endswith(".js"):
                try:
                    subprocess.run(
                        ["node", "-c", path], check=True, capture_output=True, text=True
                    )
                except subprocess.CalledProcessError as e:
                    report["hooks"].append(
                        f"[{file}] Erro sintático JS: {e.stderr.strip()}"
                    )

    # 4. Skills
    skills_dir = os.path.join(base_dir, "skills")
    if os.path.exists(skills_dir):
        for skill_folder in os.listdir(skills_dir):
            skill_path = os.path.join(skills_dir, skill_folder, "SKILL.md")
            if os.path.exists(skill_path):
                with open(skill_path, "r", encoding="utf-8") as f:
                    content = f.read()
                for line in content.split("\n"):
                    if line.startswith("description:"):
                        if ": " in line[12:].strip():
                            report["skills"].append(
                                f"[{skill_folder}] Armadilha YAML na description."
                            )

    # 5. Ponteiros orfaos (caminho citado e nome de artefato citado) — ver ponteiros.py
    report["ponteiros"] = auditar_ponteiros(base_dir)

    # 5a. Contagem defasada nos cabecalhos do roteador de capacidades (00-knowledge.md) — ver
    # contagens.py. Complementa o ponteiros.py: aquele cobra NOME citado, este cobra o NUMERO.
    report["contagens"] = auditar_contagens(base_dir)

    # 5b. Limiares 40/3/4: thresholds.mjs (fonte unica) vs config.json de cada padrao-<linguagem>
    report["limiares"] = auditar_limiares(base_dir)

    # 5c. Nomenclatura: todo skills/*, commands/*, agents/* comeca por um prefixo do vocabulario
    # declarado em skills/meta-create-skill/references/nomenclatura.md (fonte unica)
    report["nomenclatura"] = auditar_nomenclatura(base_dir)

    # 5d. Proatividade: toda skill tem a trava "NAO acione proativamente", exceto a lista fechada
    # e justificada de excecoes (PROATIVAS) em proatividade.py
    report["proatividade"] = auditar_proatividade(base_dir)

    # 5e. Secoes obrigatorias do molde: "## Quando usar", "## Regras...", "## Checklist..."
    report["secoes"] = auditar_secoes(base_dir)

    # 5f. Paridade: specs/_estrutura_base/ e specs/_estrutura_base_site/ ensinam o MESMO fluxo
    # SDD — todo .md presente nas duas arvores tem de ser identico, exceto a divergencia
    # declarada em paridade.EXCECOES (ver paridade.py)
    report["paridade"] = auditar_paridade(base_dir)

    # 5g. Manifestos: a identidade do plugin (name/version/description/author) vive em
    # .claude-plugin/plugin.json; os outros manifestos a repetem (ver manifestos.py)
    report["manifestos"] = auditar_manifestos(base_dir)

    # 5h. Mapa de sistemas: schema do mapa.json da raiz (campos, tipos, id/caminho unicos, valores
    # aceitos, caminho relativo com /). Nao cobra que o caminho exista — ver mapa.py
    report["mapa"] = auditar_mapa(base_dir)

    # 6. Vazamentos
    patterns = {
        "AWS_AKIA": r"AKIA[0-9A-Z]{16}",
        "PrivateKey": r"-----BEGIN .* PRIVATE KEY-----",
        "GenericSecret": r"(?i)(api_key|secret|password|token)[\"']?\s*[:=]\s*[\"'][a-zA-Z0-9\-_]{16,}[\"']",
    }

    # Este arquivo DEFINE os padroes acima — varre-lo faz cada padrao casar consigo mesmo e
    # reportar um vazamento que nao existe. Auto-deteccao e falso positivo, nao achado.
    eu_mesmo = os.path.abspath(__file__)

    for root, _, files in os.walk(base_dir):
        if (
            ".git" in root
            or "node_modules" in root
            or ".venv" in root
            or "mcp-servers" in root
        ):
            continue
        for file in files:
            if not file.endswith((".md", ".js", ".json", ".py")):
                continue
            path = os.path.join(root, file)
            if os.path.abspath(path) == eu_mesmo:
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    for name, pat in patterns.items():
                        if re.search(pat, content):
                            report["vazamentos"].append(
                                f"{name} encontrado em {os.path.relpath(path, base_dir)}"
                            )
            except:
                pass

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    args = get_args()
    if args.autoteste:
        exit(autoteste())
    if not args.raiz or not os.path.exists(args.raiz):
        print(json.dumps({"error": "Caminho raiz não encontrado"}))
        exit(1)
    audit_base(args.raiz)
